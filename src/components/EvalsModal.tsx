/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Play, CheckCircle2, XCircle, RefreshCw, ShieldCheck, Gauge } from 'lucide-react';
import { EvalResult } from '../types/nexus.ts';

interface EvalsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EvalsModal: React.FC<EvalsModalProps> = ({ isOpen, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    baselinePassRate: number;
    regressionCheckPassed: boolean;
    avgLatencyMs: number;
    avgTokens: number;
  } | null>(null);

  if (!isOpen) return null;

  const handleRunEvals = async () => {
    setIsRunning(true);
    try {
      const res = await fetch('/v1/evals/run', { method: 'POST' });
      const data = await res.json();
      setResults(data.results || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Failed to run evals', err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono">20 GOLDEN EVALS: LLM-AS-JUDGE TEST SUITE</h2>
              <p className="text-xs text-zinc-400 font-mono">
                Regresní brána: max -5 % proti baseline (95 %). Rubric: cíl, konkrétnost, bez vymyšlených čísel, čeština, 6 návrhů.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            data-testid="close-evals-modal"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action bar & Summary */}
        <div className="my-4 flex flex-wrap items-center justify-between gap-4">
          <button
            onClick={handleRunEvals}
            disabled={isRunning}
            className="flex items-center gap-2 rounded bg-cyan-500 px-4 py-2 text-xs font-mono font-bold text-black hover:bg-cyan-400 disabled:opacity-50 transition"
          >
            {isRunning ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>BĚŽÍ 20 TESTŮ...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>SPUSTIT 20 GOLDEN EVALS</span>
              </>
            )}
          </button>

          {summary && (
            <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
              <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300">
                Úspěšnost: <span className="font-bold text-emerald-400">{summary.passRate}%</span> ({summary.passed}/{summary.total})
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300">
                Baseline: <span className="text-zinc-400">{summary.baselinePassRate}%</span>
              </div>
              <div className={`rounded px-3 py-1 font-bold ${summary.regressionCheckPassed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'}`}>
                {summary.regressionCheckPassed ? 'REGRESNÍ BRÁNA: PASS' : 'REGRESNÍ BRÁNA: FAIL'}
              </div>
              <div className="text-zinc-500 text-[11px]">
                Průměr: {summary.avgLatencyMs} ms · {summary.avgTokens} tok
              </div>
            </div>
          )}
        </div>

        {/* Test Cases Table */}
        <div className="flex-1 overflow-y-auto pr-1">
          {results.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center text-zinc-500 font-mono text-xs">
              <Gauge className="h-10 w-10 text-zinc-700 mb-2" />
              <p>Dosud nebyly spuštěny žádné evaly v této relaci.</p>
              <p className="mt-1 text-zinc-600">Klikněte na &quot;SPUSTIT 20 GOLDEN EVALS&quot; pro spuštění testovací sady.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((res) => (
                <div
                  key={res.evalId}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between rounded border p-3 font-mono text-xs transition ${
                    res.passed
                      ? 'border-emerald-500/20 bg-emerald-950/10'
                      : 'border-rose-500/20 bg-rose-950/10'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {res.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold text-zinc-200">
                        #{res.evalId}: {res.goal}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-400">
                        <span className={res.criteria.goalFulfilled ? 'text-emerald-400' : 'text-zinc-600'}>✓ Cíl</span>
                        <span className={res.criteria.concreteLanguage ? 'text-emerald-400' : 'text-zinc-600'}>✓ Konkrétnost</span>
                        <span className={res.criteria.noFictitiousMoney ? 'text-emerald-400' : 'text-zinc-600'}>✓ Bez falešných peněz</span>
                        <span className={res.criteria.has6Suggestions ? 'text-emerald-400' : 'text-zinc-600'}>✓ 6 návrhů</span>
                        <span className={res.criteria.czechLanguage ? 'text-emerald-400' : 'text-zinc-600'}>✓ Čeština</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 sm:mt-0 flex items-center gap-3 text-zinc-500 text-[11px] shrink-0">
                    <span>{res.latencyMs} ms</span>
                    <span>{res.tokens} tok</span>
                    <span className="font-bold text-white">{res.score}/100</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
