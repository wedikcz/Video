/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RunTrace, TraceSpan } from '../../types/nexus.ts';
import { db } from '../db.ts';

export class TracerService {
  private spans: TraceSpan[] = [];
  private runId: string;
  private threadId: string;
  private goal: string;
  private startTime: number;
  private promptTokens: number = 0;
  private completionTokens: number = 0;
  private toolCalls: RunTrace['toolCalls'] = [];

  constructor(runId: string, threadId: string, goal: string) {
    this.runId = runId;
    this.threadId = threadId;
    this.goal = goal;
    this.startTime = Date.now();
  }

  public startSpan(name: string): (status?: 'ok' | 'error' | 'repaired', details?: any) => void {
    const spanId = `span-${Math.random().toString(36).substring(2, 9)}`;
    const spanStart = Date.now();

    return (status: 'ok' | 'error' | 'repaired' = 'ok', details?: any) => {
      const spanEnd = Date.now();
      this.spans.push({
        id: spanId,
        name,
        startTime: spanStart,
        endTime: spanEnd,
        durationMs: spanEnd - spanStart,
        status,
        details,
      });
    };
  }

  public recordTokens(prompt: number, completion: number) {
    this.promptTokens += prompt;
    this.completionTokens += completion;
  }

  public recordToolCall(tool: string, args: any, result: any, durationMs: number, idempotencyKey?: string) {
    this.toolCalls.push({
      tool,
      arguments: args,
      result,
      durationMs,
      idempotencyKey,
    });
  }

  public finish(criticRubric?: RunTrace['criticRubric']): RunTrace {
    const totalTokens = this.promptTokens + this.completionTokens;
    // Calculate cost in CZK: ~0.15 CZK per 1k input tokens, ~0.60 CZK per 1k output tokens
    const costCzk = Math.round(((this.promptTokens * 0.00015) + (this.completionTokens * 0.0006)) * 100) / 100;
    const totalLatency = Date.now() - this.startTime;

    // Track global budget spent
    db.totalCzkBudgetSpent += costCzk;

    const trace: RunTrace = {
      id: this.runId,
      threadId: this.threadId,
      goal: this.goal,
      model: 'gpt-5 / gemini-3.8-flash',
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens,
      costCzk,
      latencyMs: totalLatency,
      createdAt: new Date().toISOString(),
      spans: this.spans,
      toolCalls: this.toolCalls,
      criticRubric,
    };

    db.runs.set(this.runId, trace);
    return trace;
  }
}
