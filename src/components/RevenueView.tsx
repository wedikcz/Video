/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Coins,
  TrendingUp,
  CheckCircle2,
  Clock,
  Play,
  Check,
  Pause,
  RotateCcw,
  Zap,
  Filter,
  DollarSign,
  Activity,
} from 'lucide-react';
import { Opportunity, Activity as ActivityType } from '../types/nexus.ts';

interface RevenueViewProps {
  opportunities: Opportunity[];
  activities: ActivityType[];
  onUpdateOpportunityStatus: (
    id: string,
    status: 'new' | 'active' | 'won' | 'paused' | 'closed'
  ) => void;
}

export const RevenueView: React.FC<RevenueViewProps> = ({
  opportunities,
  activities,
  onUpdateOpportunityStatus,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'active' | 'won' | 'paused'>('all');
  const [isAutonomousLoopActive, setIsAutonomousLoopActive] = useState(true);

  const totalPipeline = opportunities.reduce(
    (acc, o) => acc + (o.status !== 'closed' ? o.projectionCzk : 0),
    0
  );
  const totalWon = opportunities
    .filter((o) => o.status === 'won')
    .reduce((acc, o) => acc + o.projectionCzk, 0);
  const avgConfidence = Math.round(
    opportunities.reduce((acc, o) => acc + o.confidence, 0) / Math.max(opportunities.length, 1)
  );
  const activeCount = opportunities.filter((o) => o.status === 'active').length;

  const filteredOpportunities = opportunities.filter((o) => {
    if (statusFilter === 'all') return true;
    return o.status === statusFilter;
  });

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full bg-zinc-950 p-4 sm:p-6 space-y-6">
      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
            <span>PROJEKCE PIPELINE</span>
            <Coins className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {totalPipeline.toLocaleString()} Kč
          </div>
          <div className="mt-1 text-[11px] font-mono text-emerald-400">
            {opportunities.length} aktivních příležitostí
          </div>
        </div>

        {/* KPI 2 */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
            <span>UZAVŘENO (WON)</span>
            <CheckCircle2 className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {totalWon.toLocaleString()} Kč
          </div>
          <div className="mt-1 text-[11px] font-mono text-cyan-400">
            100% potvrzená monetizace
          </div>
        </div>

        {/* KPI 3 */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
            <span>PRŮMĚRNÁ CONFIDENCE</span>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {avgConfidence}%
          </div>
          <div className="mt-1 text-[11px] font-mono text-amber-400">
            Statistický scoring agentů
          </div>
        </div>

        {/* KPI 4 */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
            <span>AUTONOMNÍ SMYČKA</span>
            <Zap className={`h-4 w-4 ${isAutonomousLoopActive ? 'text-emerald-400 animate-pulse' : 'text-zinc-600'}`} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-lg font-bold text-white">
              {isAutonomousLoopActive ? 'BĚŽÍ 24/7' : 'POZASTAVENO'}
            </span>
            <button
              onClick={() => setIsAutonomousLoopActive(!isAutonomousLoopActive)}
              className={`rounded px-2.5 py-1 text-[10px] font-mono font-bold transition ${
                isAutonomousLoopActive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {isAutonomousLoopActive ? 'AKTIVNÍ' : 'VYPNUTO'}
            </button>
          </div>
          <div className="mt-1 text-[11px] font-mono text-zinc-500">
            Automatické ověřování CPC & konverzí
          </div>
        </div>
      </div>

      {/* Main Content Layout: Opportunities Board + Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Opportunities List (2 columns on lg) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
            <div>
              <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <Coins className="h-4 w-4 text-emerald-400" />
                <span>MONETIZAČNÍ PŘÍLEŽITOSTI ({filteredOpportunities.length})</span>
              </h2>
              <p className="text-xs text-zinc-400 font-mono">
                Částky jsou statistickými projekcemi (nikoliv garantovaným výdělkem).
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center rounded border border-zinc-800 bg-zinc-900 p-0.5 text-xs font-mono">
              <button
                onClick={() => setStatusFilter('all')}
                className={`rounded px-2.5 py-1 ${statusFilter === 'all' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400'}`}
              >
                Vše
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`rounded px-2.5 py-1 ${statusFilter === 'active' ? 'bg-zinc-800 text-emerald-400 font-bold' : 'text-zinc-400'}`}
              >
                Aktivní
              </button>
              <button
                onClick={() => setStatusFilter('new')}
                className={`rounded px-2.5 py-1 ${statusFilter === 'new' ? 'bg-zinc-800 text-cyan-400 font-bold' : 'text-zinc-400'}`}
              >
                Nové
              </button>
              <button
                onClick={() => setStatusFilter('won')}
                className={`rounded px-2.5 py-1 ${statusFilter === 'won' ? 'bg-zinc-800 text-amber-400 font-bold' : 'text-zinc-400'}`}
              >
                Won
              </button>
              <button
                onClick={() => setStatusFilter('paused')}
                className={`rounded px-2.5 py-1 ${statusFilter === 'paused' ? 'bg-zinc-800 text-zinc-400 font-bold' : 'text-zinc-400'}`}
              >
                Pozastaveno
              </button>
            </div>
          </div>

          {/* Cards List */}
          <div data-testid="opportunity-list" className="space-y-3">
            {filteredOpportunities.map((opp) => (
              <div
                key={opp.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition"
              >
                <div className="space-y-1.5 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{opp.title}</span>
                    <span className="rounded bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] font-mono text-zinc-300 uppercase">
                      {opp.channel}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${
                        opp.status === 'active'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : opp.status === 'won'
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : opp.status === 'new'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {opp.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
                    <div>
                      Projekce:{' '}
                      <span className="font-bold text-emerald-400">{opp.projectionCzk.toLocaleString()} Kč</span>
                    </div>
                    <div>
                      Confidence:{' '}
                      <span className="font-bold text-white">{opp.confidence}%</span>
                    </div>
                  </div>
                </div>

                {/* Actions: Spustit, Uzavřít, Zastavit, Obnovit */}
                <div className="mt-3 sm:mt-0 flex items-center gap-1.5 shrink-0">
                  {opp.status !== 'active' && opp.status !== 'won' && (
                    <button
                      onClick={() => onUpdateOpportunityStatus(opp.id, 'active')}
                      title="Spustit příležitost"
                      className="flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs font-mono text-emerald-400 hover:bg-emerald-500/20 transition"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>Spustit</span>
                    </button>
                  )}
                  {opp.status !== 'won' && (
                    <button
                      onClick={() => onUpdateOpportunityStatus(opp.id, 'won')}
                      title="Uzavřít jako vyhrané"
                      className="flex items-center gap-1 rounded bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 text-xs font-mono text-cyan-400 hover:bg-cyan-500/20 transition"
                    >
                      <Check className="h-3 w-3" />
                      <span>Uzavřít (Won)</span>
                    </button>
                  )}
                  {opp.status === 'active' && (
                    <button
                      onClick={() => onUpdateOpportunityStatus(opp.id, 'paused')}
                      title="Pozastavit"
                      className="flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs font-mono text-amber-400 hover:bg-amber-500/20 transition"
                    >
                      <Pause className="h-3 w-3" />
                      <span>Zastavit</span>
                    </button>
                  )}
                  {(opp.status === 'paused' || opp.status === 'closed' || opp.status === 'won') && (
                    <button
                      onClick={() => onUpdateOpportunityStatus(opp.id, 'new')}
                      title="Obnovit do nového stavu"
                      className="flex items-center gap-1 rounded bg-zinc-800 px-2.5 py-1 text-xs font-mono text-zinc-300 hover:bg-zinc-700 transition"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Obnovit</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column: Signals & Activities */}
        <div className="space-y-4">
          <div className="border-b border-zinc-800/80 pb-3">
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <span>SIGNÁLY A RETENCE</span>
            </h2>
            <p className="text-xs text-zinc-400 font-mono">
              Real-time auditní záznamy autonomních agentů.
            </p>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            {activities.map((act) => (
              <div key={act.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                  <span className="text-emerald-400">@{act.agent}</span>
                  <span>{new Date(act.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="font-semibold text-zinc-200">{act.title}</div>
                <p className="mt-1 text-[11px] text-zinc-400 leading-snug">{act.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
