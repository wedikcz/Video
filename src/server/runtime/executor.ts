/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { toolsRegistry } from './tools.ts';
import { db } from '../db.ts';

export interface ToolExecutionOptions {
  idempotencyKey?: string;
  dryRun?: boolean;
  timeoutMs?: number;
  skipConfirmation?: boolean;
}

export interface ToolExecutionResult {
  tool: string;
  success: boolean;
  result?: any;
  error?: string;
  durationMs: number;
  retries: number;
  idempotentReplay?: boolean;
  circuitBreakerTripped?: boolean;
}

export class ToolExecutor {
  public static readonly TOOL_TIMEOUT_MS = 10000;
  public static readonly MAX_RETRIES = 3;

  /**
   * Check if circuit breaker is active for this tool
   */
  private static isCircuitOpen(toolName: string): boolean {
    const cb = db.circuitBreakers.get(toolName);
    if (!cb) return false;

    const now = Date.now();
    if (cb.openUntil > now) {
      return true; // Still open
    }

    if (cb.openUntil <= now && cb.openUntil > 0) {
      // Cooldown expired, half-open
      cb.openUntil = 0;
      cb.failures = 0;
    }
    return false;
  }

  private static recordFailure(toolName: string) {
    const now = Date.now();
    let cb = db.circuitBreakers.get(toolName);
    if (!cb) {
      cb = { failures: 1, lastFailure: now, openUntil: 0 };
      db.circuitBreakers.set(toolName, cb);
    } else {
      if (now - cb.lastFailure < 60000) {
        cb.failures++;
      } else {
        cb.failures = 1;
      }
      cb.lastFailure = now;
      if (cb.failures >= 5) {
        cb.openUntil = now + 30000; // Open for 30s
      }
    }
  }

  private static recordSuccess(toolName: string) {
    const cb = db.circuitBreakers.get(toolName);
    if (cb) {
      cb.failures = Math.max(0, cb.failures - 1);
    }
  }

  public static async executeTool(
    toolName: string,
    args: any,
    options: ToolExecutionOptions = {}
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    // 1. Check system pause
    if (db.isSystemPaused) {
      return {
        tool: toolName,
        success: false,
        error: 'Systém je pozastaven (Emergency Pause). Tool execution zastaven.',
        durationMs: Date.now() - startTime,
        retries: 0,
      };
    }

    // 2. Check tool existence
    const tool = toolsRegistry.get(toolName);
    if (!tool) {
      return {
        tool: toolName,
        success: false,
        error: `Nástroj "${toolName}" není registrován v NEXUS X OS.`,
        durationMs: Date.now() - startTime,
        retries: 0,
      };
    }

    // 3. Check circuit breaker
    if (this.isCircuitOpen(toolName)) {
      return {
        tool: toolName,
        success: false,
        error: `Circuit breaker pro nástroj "${toolName}" je otevřen z důvodu opakovaných chyb (5 chyb za 60s). Počkejte prosím 30 sekund.`,
        durationMs: Date.now() - startTime,
        retries: 0,
        circuitBreakerTripped: true,
      };
    }

    // 4. Check idempotency for stateful/side-effect tools
    if (options.idempotencyKey && db.idempotencyCache.has(options.idempotencyKey)) {
      const cached = db.idempotencyCache.get(options.idempotencyKey)!;
      return {
        tool: toolName,
        success: true,
        result: cached.result,
        durationMs: Date.now() - startTime,
        retries: 0,
        idempotentReplay: true,
      };
    }

    // 5. Validate input parameters with Zod
    const parseResult = tool.parameters.safeParse(args || {});
    if (!parseResult.success) {
      return {
        tool: toolName,
        success: false,
        error: `Chyba validace parametrů: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        durationMs: Date.now() - startTime,
        retries: 0,
      };
    }

    const validatedArgs = parseResult.data;

    // 6. Execute with retry & timeout
    let attempt = 0;
    let lastError: any = null;

    while (attempt <= this.MAX_RETRIES) {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`Timeout vypršel (${this.TOOL_TIMEOUT_MS} ms)`)),
            this.TOOL_TIMEOUT_MS
          );
        });

        const executionPromise = tool.execute(validatedArgs, { dryRun: options.dryRun });
        const result = await Promise.race([executionPromise, timeoutPromise]);

        this.recordSuccess(toolName);

        // Cache for idempotency if key was provided
        if (options.idempotencyKey) {
          db.idempotencyCache.set(options.idempotencyKey, {
            result,
            timestamp: Date.now(),
          });
        }

        return {
          tool: toolName,
          success: true,
          result,
          durationMs: Date.now() - startTime,
          retries: attempt,
        };
      } catch (err: any) {
        lastError = err;
        attempt++;

        // Only retry for sideEffect === false or if idempotencyKey is provided
        const canRetry = !tool.sideEffect || Boolean(options.idempotencyKey);
        if (!canRetry || attempt > this.MAX_RETRIES) {
          this.recordFailure(toolName);
          break;
        }

        // Exponential backoff with jitter: 200ms * 2^attempt + jitter
        const backoffMs = Math.min(200 * Math.pow(2, attempt) + Math.random() * 100, 2000);
        await new Promise((res) => setTimeout(res, backoffMs));
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    }

    this.recordFailure(toolName);

    return {
      tool: toolName,
      success: false,
      error: lastError?.message || 'Neznámá chyba při provádění nástroje',
      durationMs: Date.now() - startTime,
      retries: attempt,
    };
  }
}
