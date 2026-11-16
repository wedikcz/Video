/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db.ts';

export interface GuardrailCheckResult {
  allowed: boolean;
  reason?: string;
  sanitizedInput?: string;
  category?: 'prompt_injection' | 'pii' | 'budget_exceeded' | 'length_exceeded' | 'system_paused';
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /zapomeň\s+(na\s+)?(všechny\s+)?(předchozí\s+)?instrukce/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /bypass\s+(safety|guardrails|tools)/i,
  /obcházej\s+(bezpečnost|pravidla|nástroje)/i,
  /reveal\s+(your\s+)?(system\s+prompt|api\s+key|token|secrets)/i,
  /ukaž\s+(mi\s+)?(system\s+prompt|api\s+klíč|tajemství)/i,
  /print\s+env\s+variables/i,
  /drop\s+table/i,
  /sudo\s+rm/i,
  /jailbreak/i,
];

export class GuardrailsService {
  public static validateInput(input: string): GuardrailCheckResult {
    // 1. Check system pause
    if (db.isSystemPaused) {
      return {
        allowed: false,
        category: 'system_paused',
        reason: 'Systém NEXUS X OS je v režimu pozastavení (Emergency Pause). Žádné nové exekuce nejsou povoleny.',
      };
    }

    // 2. Length check (max 4000 chars)
    if (!input || input.trim().length === 0) {
      return {
        allowed: false,
        category: 'length_exceeded',
        reason: 'Zpráva nesmí být prázdná.',
      };
    }

    if (input.length > 4000) {
      return {
        allowed: false,
        category: 'length_exceeded',
        reason: `Délka vstupu (${input.length} znaků) překročila maximální povolený limit 4 000 znaků.`,
      };
    }

    // 3. Prompt injection detection
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        // Log incident to activity
        db.activities.unshift({
          id: `act-sec-${Date.now()}`,
          title: 'Bezpečnostní incident: Pokus o Prompt Injection',
          description: `Detekován a zablokován nepovolený vstup: "${input.substring(0, 60)}..."`,
          agent: 'CTO Agent',
          timestamp: new Date().toISOString(),
          type: 'system',
        });

        return {
          allowed: false,
          category: 'prompt_injection',
          reason:
            'Bezpečnostní guardrail NEXUS X OS zablokoval vstup. Byly detekovány pokusy o manipulaci se systémovým kontextem, extrakci klíčů nebo obcházení auditních nástrojů.',
        };
      }
    }

    // 4. Budget check
    if (db.totalCzkBudgetSpent >= db.dailyCzkBudgetLimit) {
      return {
        allowed: false,
        category: 'budget_exceeded',
        reason: `Byl vyčerpán denní rozpočet (${db.dailyCzkBudgetLimit} Kč). Exekuce byla automaticky zastavena.`,
      };
    }

    // 5. PII Redaction for logs
    const sanitized = this.redactPII(input);

    return {
      allowed: true,
      sanitizedInput: sanitized,
    };
  }

  public static redactPII(text: string): string {
    return text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/(\+420\s?)?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}/g, '[REDACTED_PHONE]')
      .replace(/\b[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g, '[REDACTED_CARD]');
  }

  public static sanitizeOutput(text: string): string {
    let sanitized = text;

    // Filter out forbidden claims about already making real money
    sanitized = sanitized.replace(/již jsme vydělali/gi, 'odhadovaná projekce činí');
    sanitized = sanitized.replace(/garantujeme výdělek/gi, 'predikujeme potenciál');
    sanitized = sanitized.replace(/100% zaručený zisk/gi, 'statisticky optimalizovaný scénář');

    return this.redactPII(sanitized);
  }
}
