/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoldenEvalCase, EvalResult } from '../types/nexus.ts';
import { AgentOrchestrator } from './runtime/orchestrator.ts';
import { db } from './db.ts';

export const GOLDEN_EVALS: GoldenEvalCase[] = [
  { id: 1, goal: 'Chci vydělat 50 000 Kč měsíčně', expectedTools: ['compute_scenario', 'list_opportunities'], expectedFormat: 'strict_plan_6_suggestions', category: 'revenue' },
  { id: 2, goal: 'Vytvoř 5 videí na TikTok', expectedTools: ['create_factory_asset', 'list_factory_assets'], expectedFormat: 'viral_storyboard', category: 'video' },
  { id: 3, goal: 'Najdi affiliate příležitosti', expectedTools: ['list_opportunities', 'get_business_context'], expectedFormat: 'opportunity_breakdown', category: 'affiliate' },
  { id: 4, goal: 'Navrhni landing page pro funnel', expectedTools: ['get_business_context'], expectedFormat: 'funnel_blueprint', category: 'funnel' },
  { id: 5, goal: 'Spusť AI boardroom', expectedTools: ['list_agents', 'get_business_context'], expectedFormat: 'boardroom_consensus', category: 'boardroom' },
  { id: 6, goal: 'Predikuj ROI na 3 měsíce', expectedTools: ['compute_scenario'], expectedFormat: 'financial_projections', category: 'finance' },
  { id: 7, goal: 'Jak automatizovat MoviePy střih pro YouTube Shorts?', expectedTools: ['create_factory_asset'], expectedFormat: 'moviepy_script', category: 'automation' },
  { id: 8, goal: 'Analyzuj výkonnost našich 16 agentů', expectedTools: ['list_agents'], expectedFormat: 'agent_status_report', category: 'agents' },
  { id: 9, goal: 'Zvyš rozpočet na reklamu pro Meta Ads', expectedTools: ['compute_scenario'], expectedFormat: 'risk_evaluation', category: 'marketing' },
  { id: 10, goal: 'Optimalizuj retenci diváků na YouTube v prvních 3 sekundách', expectedTools: ['create_factory_asset'], expectedFormat: 'hook_optimization', category: 'video' },
  { id: 11, goal: 'Vygeneruj humorný scénář pro IT vývojáře', expectedTools: ['create_factory_asset'], expectedFormat: 'humor_script', category: 'content' },
  { id: 12, goal: 'Ukaž mi celkový stav pipeline a uzavřené obchody', expectedTools: ['get_business_context', 'list_opportunities'], expectedFormat: 'kpi_overview', category: 'revenue' },
  { id: 13, goal: 'Připrav e-mailový newsletter pro monetizaci báze', expectedTools: ['get_business_context'], expectedFormat: 'newsletter_funnel', category: 'email' },
  { id: 14, goal: 'Vyhledej v paměti poznatky o konverzi na českém trhu', expectedTools: ['get_business_context'], expectedFormat: 'memory_citation', category: 'knowledge' },
  { id: 15, goal: 'Jaké jsou největší rizika škálování video produkce?', expectedTools: ['get_business_context'], expectedFormat: 'risk_analysis', category: 'strategy' },
  { id: 16, goal: 'Sestav 3 reklamní kreativy pro SaaS produkt', expectedTools: ['create_factory_asset'], expectedFormat: 'ad_creatives', category: 'marketing' },
  { id: 17, goal: 'Simuluj scénář při investici 20 000 Kč do placeného dosahu', expectedTools: ['compute_scenario'], expectedFormat: 'scenario_model', category: 'finance' },
  { id: 18, goal: 'Vytvoř virální háček s překvapivým zvratem pro TikTok', expectedTools: ['create_factory_asset'], expectedFormat: 'pattern_interrupt', category: 'video' },
  { id: 19, goal: 'Zkontroluj čerpání denního rozpočtu a limity', expectedTools: ['get_business_context'], expectedFormat: 'audit_report', category: 'system' },
  { id: 20, goal: 'Jak propojit LangGraph orchestrátor s MoviePy renderem?', expectedTools: ['create_factory_asset'], expectedFormat: 'architecture_doc', category: 'technical' },
];

export class EvalsRunner {
  public static async runAllEvals(): Promise<{
    summary: {
      total: number;
      passed: number;
      failed: number;
      passRate: number;
      baselinePassRate: number;
      regressionCheckPassed: boolean;
      avgLatencyMs: number;
      avgTokens: number;
    };
    results: EvalResult[];
  }> {
    const results: EvalResult[] = [];
    const baselinePassRate = 95.0; // Baseline requirement

    for (const testCase of GOLDEN_EVALS) {
      const startTime = Date.now();
      const evalThreadId = `th-eval-${testCase.id}`;

      try {
        const { message, trace } = await AgentOrchestrator.executeGoal({
          threadId: evalThreadId,
          userMessage: testCase.goal,
          dryRun: true,
        });

        const reply = message.content || '';
        const suggestions = message.suggestions || [];
        const latencyMs = Date.now() - startTime;
        const tokens = trace.totalTokens || 350;

        const goalFulfilled = reply.length > 25;
        const concreteLanguage = !/synergický zázrak/i.test(reply) && reply.split(' ').length >= 10;
        const noFictitiousMoney = !/garantujeme zisk/i.test(reply) && !/peníze vám již leží/i.test(reply);
        const czechLanguage = /[ěščřžýáíéůúťďň]/i.test(reply);
        const has6Suggestions = suggestions.length === 6;
        const toolsInvoked = (trace.toolCalls && trace.toolCalls.length > 0) || false;

        const passed = goalFulfilled && concreteLanguage && noFictitiousMoney && czechLanguage && has6Suggestions;

        const evalResult: EvalResult = {
          evalId: testCase.id,
          goal: testCase.goal,
          passed,
          score: passed ? 100 : 70,
          criteria: {
            goalFulfilled,
            concreteLanguage,
            noFictitiousMoney,
            czechLanguage,
            has6Suggestions,
            toolsInvoked,
          },
          latencyMs,
          tokens,
          timestamp: new Date().toISOString(),
        };

        results.push(evalResult);
      } catch (err: any) {
        results.push({
          evalId: testCase.id,
          goal: testCase.goal,
          passed: false,
          score: 0,
          criteria: {
            goalFulfilled: false,
            concreteLanguage: false,
            noFictitiousMoney: true,
            czechLanguage: false,
            has6Suggestions: false,
            toolsInvoked: false,
          },
          latencyMs: Date.now() - startTime,
          tokens: 0,
          timestamp: new Date().toISOString(),
        });
      }
    }

    db.evalResults = results;

    const passedCount = results.filter((r) => r.passed).length;
    const passRate = Math.round((passedCount / results.length) * 100);
    const regressionCheckPassed = passRate >= (baselinePassRate - 5.0); // Within 5% of baseline
    const avgLatency = Math.round(results.reduce((acc, r) => acc + r.latencyMs, 0) / results.length);
    const avgTokens = Math.round(results.reduce((acc, r) => acc + r.tokens, 0) / results.length);

    return {
      summary: {
        total: results.length,
        passed: passedCount,
        failed: results.length - passedCount,
        passRate,
        baselinePassRate,
        regressionCheckPassed,
        avgLatencyMs: avgLatency,
        avgTokens: avgTokens,
      },
      results,
    };
  }
}
