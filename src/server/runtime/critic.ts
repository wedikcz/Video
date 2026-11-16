/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CriticRubricResult {
  passed: boolean;
  score: number; // 0 - 100
  criteria: {
    goalFulfilled: boolean;
    concreteness: boolean;
    riskAwareness: boolean;
    noFictitiousMoney: boolean;
    has6Suggestions: boolean;
    czechLanguage: boolean;
  };
  feedback: string[];
  repairedResponse?: any;
}

export class CriticEngine {
  public static evaluate(goal: string, response: {
    reply: string;
    plan?: any[];
    suggestions?: string[];
  }): CriticRubricResult {
    const reply = response.reply || '';
    const suggestions = response.suggestions || [];

    // 1. Goal fulfillment check
    const goalFulfilled = reply.length > 20;

    // 2. Concreteness (no empty buzzwords like "revoluční synergies", "gamechanger")
    const forbiddenBuzzwords = [/revoluční řešení/i, /gamechanger/i, /synergický potenciál/i, /neuvěřitelný úspěch/i];
    const hasBuzzword = forbiddenBuzzwords.some((pattern) => pattern.test(reply));
    const concreteness = !hasBuzzword && reply.split(' ').length >= 10;

    // 3. No fictitious money
    const forbiddenMoneyClaims = [/už jste vydělali/i, /garantujeme zisk/i, /100% jisté peníze/i, /peníze vám již leží na účtu/i];
    const hasFictitiousMoney = forbiddenMoneyClaims.some((pattern) => pattern.test(reply));
    const noFictitiousMoney = !hasFictitiousMoney;

    // 4. Risk awareness (acknowledges uncertainty, test phase or projections)
    const riskWords = [/projekce/i, /odhad/i, /test/i, /riziko/i, /validace/i, /scénář/i, /metrika/i, /krok/i];
    const riskAwareness = riskWords.some((pattern) => pattern.test(reply));

    // 5. 6 Suggestions check
    const has6Suggestions = suggestions.length === 6 && suggestions.every((s) => s.trim().length > 3);

    // 6. Czech language
    const czechLanguage = /[ěščřžýáíéůú]/i.test(reply) || /[a-z]/i.test(reply);

    const criteria = {
      goalFulfilled,
      concreteness,
      riskAwareness,
      noFictitiousMoney,
      has6Suggestions,
      czechLanguage,
    };

    const passedCount = Object.values(criteria).filter(Boolean).length;
    const score = Math.round((passedCount / 6) * 100);
    const passed = passedCount >= 5 && noFictitiousMoney;

    const feedback: string[] = [];
    if (!concreteness) feedback.push('Odpověď obsahuje vágní marketingové fráze. Buďte konkrétní.');
    if (!noFictitiousMoney) feedback.push('Zákaz tvrzení o garantovaných nebo již vydělaných penězích. Použijte odhady a projekce.');
    if (!riskAwareness) feedback.push('Doplňte zmínku o testování, validaci nebo odhadovaných projekcích.');
    if (!has6Suggestions) feedback.push('Musí být vygenerováno přesně 6 konkrétních rozkazovacích vět jako další kroky.');

    return {
      passed,
      score,
      criteria,
      feedback,
    };
  }
}
