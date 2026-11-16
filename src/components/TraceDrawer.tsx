/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Clock, Cpu, Coins, CheckCircle, AlertCircle, Wrench } from 'lucide-react';
import { RunTrace } from '../types/nexus.ts';

interface TraceDrawerProps {
  trace: RunTrace | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TraceDrawer: React.FC<TraceDrawerProps> = ({ trace, isOpen, onClose }) => {
  if (!isOpen || !trace) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl backdrop-blur-xl sm:w-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase text-emerald-400">TELEMETRIE EXEKUCE</span>
            <span className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 border border-zinc-800">
              {trace.id}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-white mt-1">Auditní Trace & Spany Běhu</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4 flex-1 space-y-6 overflow-y-auto pr-1">
        {/* Core Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono">
              <Clock className="h-3.5 w-3.5 text-cyan-400" />
              <span>LATENCE</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-white">{trace.latencyMs} ms</div>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono">
              <Cpu className="h-3.5 w-3.5 text-amber-400" />
              <span>TOKENY</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-white">{trace.totalTokens}</div>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-mono">
              <Coins className="h-3.5 w-3.5 text-emerald-400" />
              <span>NÁKLAD</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-white">{trace.costCzk} Kč</div>
          </div>
        </div>

        {/* Goal */}
        <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3">
          <span className="font-mono text-[10px] uppercase text-zinc-500">ZADANÝ CÍL / PROMPT</span>
          <p className="mt-1 text-xs text-zinc-200">{trace.goal}</p>
        </div>

        {/* Critic Rubric */}
        {trace.criticRubric && (
          <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
            <span className="font-mono text-xs uppercase text-zinc-400">CRITIC RUBRIC VERIFIKACE</span>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-300">Splnění zadání cíle:</span>
                <span className={trace.criticRubric.goalFulfilled ? 'text-emerald-400 font-mono flex items-center gap-1' : 'text-rose-400 font-mono'}>
                  {trace.criticRubric.goalFulfilled ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {trace.criticRubric.goalFulfilled ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-300">Konkrétnost bez prázdných frází:</span>
                <span className={trace.criticRubric.concreteness ? 'text-emerald-400 font-mono flex items-center gap-1' : 'text-rose-400 font-mono'}>
                  {trace.criticRubric.concreteness ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {trace.criticRubric.concreteness ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-300">Vnímání rizik a nejistot:</span>
                <span className={trace.criticRubric.riskAwareness ? 'text-emerald-400 font-mono flex items-center gap-1' : 'text-rose-400 font-mono'}>
                  {trace.criticRubric.riskAwareness ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {trace.criticRubric.riskAwareness ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-300">Zákaz vymyšlených peněz (pouze projekce):</span>
                <span className={trace.criticRubric.noFictitiousMoney ? 'text-emerald-400 font-mono flex items-center gap-1' : 'text-rose-400 font-mono'}>
                  {trace.criticRubric.noFictitiousMoney ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {trace.criticRubric.noFictitiousMoney ? 'PASS' : 'FAIL'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tool Calls */}
        <div>
          <span className="font-mono text-xs uppercase text-zinc-400">VOLANÉ NÁSTROJE ({trace.toolCalls.length})</span>
          <div className="mt-2 space-y-2">
            {trace.toolCalls.map((tc, idx) => (
              <div key={idx} className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-400">
                    <Wrench className="h-3.5 w-3.5" />
                    <span>{tc.tool}</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500">{tc.durationMs} ms</span>
                </div>
                {tc.idempotencyKey && (
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">
                    idempotencyKey: {tc.idempotencyKey}
                  </div>
                )}
                <div className="mt-2 text-[11px] font-mono text-zinc-400 bg-zinc-950 p-2 rounded overflow-x-auto">
                  <span className="text-zinc-500">vstup:</span> {JSON.stringify(tc.arguments)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Spans Waterfall */}
        <div>
          <span className="font-mono text-xs uppercase text-zinc-400">SPANY RUNTIME</span>
          <div className="mt-2 space-y-1.5">
            {trace.spans.map((span) => (
              <div
                key={span.id}
                className="flex items-center justify-between rounded border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>
                  <span className="font-mono text-zinc-200">{span.name}</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-zinc-500">{span.durationMs} ms</span>
                  <span
                    className={`rounded px-1.5 py-0.2 text-[10px] uppercase ${
                      span.status === 'ok'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : span.status === 'repaired'
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {span.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
