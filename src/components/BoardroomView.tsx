/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Users,
  Play,
  AlertTriangle,
  RefreshCw,
  Search,
  Power,
  TrendingUp,
  Coins,
  Award,
  BarChart3,
} from 'lucide-react';
import {
  Agent,
  AgentRevenueLeaderboardSummary,
  BoardroomSession,
} from '../types/nexus.ts';

interface BoardroomViewProps {
  agents: Agent[];
  revenueSummary?: AgentRevenueLeaderboardSummary | null;
  onRefreshRevenue?: () => Promise<void> | void;
  onToggleAgentStatus: (agentId: string, currentStatus: 'active' | 'paused') => void;
}

export const BoardroomView: React.FC<BoardroomViewProps> = ({
  agents,
  revenueSummary,
  onRefreshRevenue,
  onToggleAgentStatus,
}) => {
  const [topic, setTopic] = useState('Zvýšení alokace pro YouTube video produkci a MoviePy rendering');
  const [isDebating, setIsDebating] = useState(false);
  const [currentSession, setCurrentSession] = useState<BoardroomSession | null>(null);
  const [selectedRound, setSelectedRound] = useState<'round1' | 'round2' | 'round3'>('round3');
  const [agentFilter, setAgentFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [sortBy, setSortBy] = useState<'revenue' | 'confidence' | 'tasks'>('revenue');
  const [searchQuery, setSearchQuery] = useState('');
  const [boardroomError, setBoardroomError] = useState<string | null>(null);

  const handleStartBoardroom = async () => {
    if (!topic.trim() || isDebating) return;
    setIsDebating(true);
    setBoardroomError(null);
    try {
      const res = await fetch('/v1/boardroom/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBoardroomError(data.error || 'Spuštění debaty Boardroomu selhalo.');
        return;
      }
      setCurrentSession(data);
    } catch (err: any) {
      setBoardroomError(err?.message || 'Síťová chyba při spuštění debaty Boardroomu.');
    } finally {
      setIsDebating(false);
    }
  };

  const computedTotalRevenue = agents.reduce((acc, a) => acc + (a.revenueContributionCzk || 0), 0);
  const computedTopAgent = [...agents].sort(
    (a, b) => (b.revenueContributionCzk || 0) - (a.revenueContributionCzk || 0)
  )[0];
  const effectiveSummary: AgentRevenueLeaderboardSummary = revenueSummary || {
    totalAttributedRevenueCzk: computedTotalRevenue,
    topAgentId: computedTopAgent?.id || '',
    topAgentName: computedTopAgent?.name || 'CEO Agent',
    topAgentRevenueCzk: computedTopAgent?.revenueContributionCzk || 0,
    activeAgentsRevenueCzk: agents
      .filter((a) => a.status === 'active')
      .reduce((acc, a) => acc + (a.revenueContributionCzk || 0), 0),
    totalAssetsTracked: agents.reduce((acc, a) => acc + (a.attributedAssetsCount || 0), 0),
    totalOpportunitiesTracked: agents.reduce((acc, a) => acc + (a.attributedOpportunitiesCount || 0), 0),
  };

  const topContributors = [...agents]
    .sort((a, b) => (b.revenueContributionCzk || 0) - (a.revenueContributionCzk || 0))
    .slice(0, 4);

  const filteredAgents = agents
    .filter((a) => {
      if (agentFilter === 'active' && a.status !== 'active') return false;
      if (agentFilter === 'paused' && a.status !== 'paused') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q) || a.focus.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'revenue') {
        return (b.revenueContributionCzk || 0) - (a.revenueContributionCzk || 0);
      }
      if (sortBy === 'confidence') {
        return b.confidence - a.confidence;
      }
      return b.tasks - a.tasks;
    });

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full bg-zinc-950 p-4 sm:p-6 space-y-6">
      {/* Top Banner & Topic Launcher */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-emerald-400 border border-emerald-500/20">
                MULTI-AGENT CONSENSUS ENGINE
              </span>
              <span className="font-mono text-xs text-zinc-500">3-KOLOVÁ DEBATA · VÁŽENÝ ROZHODNÝ MODEL</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1">AI Exekutivní Boardroom</h1>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
              Spusťte poradu 16 autonomních agentů. Agenti obhajují své pozice, kritizují protinávrhy a hledají kompromis podle vážených priorit (marže 0.3, rychlost 0.25, riziko 0.25, kapacita 0.2).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              data-testid="boardroom-run"
              onClick={handleStartBoardroom}
              disabled={isDebating || !topic.trim()}
              className="flex items-center gap-2 rounded bg-emerald-500 px-4 py-2.5 font-mono text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-40 transition shadow-lg"
            >
              {isDebating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>DEBATA PROBÍHÁ...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>SPUSTIT PORADU BOARDROOMU</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Topic Input & Presets */}
        <div className="mt-4 pt-4 border-t border-zinc-800/80">
          <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
            Téma k projednání a hlasování:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Zadejte strategickou otázku nebo rozhodnutí..."
              className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 font-mono"
            />
          </div>

          {/* Quick presets */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-400">
            <span className="text-zinc-500">Rychlé šablony:</span>
            {[
              'Zvýšení alokace pro YouTube video produkci a MoviePy',
              'Expanze affiliate trychtýřů a partnerství',
              'Snížení denního budgetu a konzervace cashflow',
              'Aktivace automatické noční render smyčky',
            ].map((p, idx) => (
              <button
                key={idx}
                onClick={() => setTopic(p)}
                className="rounded border border-zinc-800 bg-zinc-950/80 px-2 py-1 text-zinc-400 hover:text-white hover:border-zinc-700 transition"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {boardroomError && (
        <div
          data-testid="boardroom-error"
          className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-2.5 text-xs font-mono text-rose-300"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{boardroomError}</span>
          </span>
          <button
            type="button"
            onClick={() => setBoardroomError(null)}
            className="text-rose-200 hover:text-white underline"
          >
            Zavřít
          </button>
        </div>
      )}

      {/* Boardroom Session Result */}
      {currentSession && (
        <div data-testid="boardroom-result" className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
            <div>
              <span className="font-mono text-xs uppercase text-emerald-400 font-bold">KONSENZUÁLNÍ VERDIKT:</span>
              <h2 className="text-lg font-bold text-white mt-0.5">{currentSession.verdict}</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded border border-emerald-500/30 bg-emerald-950/30 px-3 py-1.5 text-center">
                <span className="text-[10px] font-mono uppercase text-emerald-400 block">KONSENZUS SKÓRE</span>
                <span className="text-xl font-bold font-mono text-emerald-400">{currentSession.consensusScore}%</span>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3.5 text-xs text-zinc-300 leading-relaxed font-mono">
            {currentSession.summary}
          </div>

          {/* Round Selector Tabs */}
          <div>
            <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
              <button
                onClick={() => setSelectedRound('round1')}
                className={`rounded px-3 py-1 text-xs font-mono transition ${
                  selectedRound === 'round1'
                    ? 'bg-zinc-800 text-white font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Kolo 1: Nezávislé pozice ({currentSession.rounds.round1_positions.length})
              </button>
              <button
                onClick={() => setSelectedRound('round2')}
                className={`rounded px-3 py-1 text-xs font-mono transition ${
                  selectedRound === 'round2'
                    ? 'bg-zinc-800 text-white font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Kolo 2: Kritika protinávrhů ({currentSession.rounds.round2_critique.length})
              </button>
              <button
                onClick={() => setSelectedRound('round3')}
                className={`rounded px-3 py-1 text-xs font-mono transition ${
                  selectedRound === 'round3'
                    ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Kolo 3: Hledání kompromisu ({currentSession.rounds.round3_compromise.length})
              </button>
            </div>

            {/* Votes Grid */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(selectedRound === 'round1'
                ? currentSession.rounds.round1_positions
                : selectedRound === 'round2'
                  ? currentSession.rounds.round2_critique
                  : currentSession.rounds.round3_compromise
              ).map((vote, vIdx) => (
                <div key={vIdx} className="rounded border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-white">@{vote.agent}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        vote.vote === 'pro'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : vote.vote === 'proti'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {vote.vote}
                    </span>
                  </div>
                  <p className="text-zinc-300 text-[11px] leading-relaxed">{vote.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Revenue Contribution Attribution Leaderboard */}
      <section
        data-testid="boardroom-revenue-contribution"
        className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wide">
                Revenue Contribution · Profitabilita Agentů
              </h2>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Přímá atribuce tržeb z vyprodukovaných Factory assetů a obchodních příležitostí ke konkrétním agentům.
            </p>
          </div>
          {onRefreshRevenue && (
            <button
              type="button"
              data-testid="boardroom-refresh-revenue"
              onClick={() => onRefreshRevenue()}
              className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-[11px] text-zinc-200 hover:border-emerald-500/40 hover:text-white whitespace-nowrap shrink-0 transition"
            >
              <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
              <span>Přepočítat atribuci</span>
            </button>
          )}
        </div>

        {/* 4 Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/15 p-3.5">
            <div className="text-[10px] uppercase text-emerald-400">Celkový připsaný výnos</div>
            <div className="text-xl font-bold text-white mt-1 tabular-nums">
              {effectiveSummary.totalAttributedRevenueCzk.toLocaleString('cs-CZ')} Kč
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">
              Napříč všemi {agents.length} agenty
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/25 bg-amber-950/15 p-3.5">
            <div className="text-[10px] uppercase text-amber-400 flex items-center gap-1">
              <Award className="h-3 w-3" />
              <span>Nejprofitabilnější agent</span>
            </div>
            <div className="text-base font-bold text-white mt-1 truncate">
              {effectiveSummary.topAgentName || '—'}
            </div>
            <div className="text-[11px] text-amber-300 font-bold tabular-nums mt-0.5">
              {effectiveSummary.topAgentRevenueCzk.toLocaleString('cs-CZ')} Kč
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5">
            <div className="text-[10px] uppercase text-cyan-400">Trackované Factory Assety</div>
            <div className="text-xl font-bold text-white mt-1 tabular-nums">
              {effectiveSummary.totalAssetsTracked}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">
              Videa, MultiGen &amp; kampaně
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5">
            <div className="text-[10px] uppercase text-indigo-400">Vlastněné příležitosti</div>
            <div className="text-xl font-bold text-white mt-1 tabular-nums">
              {effectiveSummary.totalOpportunitiesTracked}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">
              Funnely &amp; monetization pipeline
            </div>
          </div>
        </div>

        {/* Top 4 Revenue Contributors Leaderboard Bars */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
          {topContributors.map((agent, rankIdx) => {
            const rev = agent.revenueContributionCzk || 0;
            const share = agent.attributionSharePercent ?? 0;
            return (
              <div
                key={agent.id}
                data-testid={`revenue-leader-${rankIdx}`}
                className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-white truncate">
                    #{rankIdx + 1} {agent.name}
                  </span>
                  <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 tabular-nums shrink-0">
                    {share.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-amber-300 tabular-nums">
                    {rev.toLocaleString('cs-CZ')} Kč
                  </span>
                  <span className="text-[10px] text-zinc-400 tabular-nums">
                    ROI {agent.roiEfficiencyScore ?? 0}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-900 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-emerald-400"
                    style={{ width: `${Math.min(100, Math.max(6, share * 2.2))}%` }}
                  />
                </div>
                <div className="text-[10px] text-zinc-500 tabular-nums">
                  {agent.attributedAssetsCount || 0} assetů · {agent.attributedOpportunitiesCount || 0} příležitostí
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 16 Agents Grid Section */}
      <div className="space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-400" />
              <span>16 SPECIALIZOVANÝCH AGENTŮ ({agents.length})</span>
            </h2>
            <p className="text-xs text-zinc-400 font-mono">
              Správa zaměstnanců autonomní digitální firmy včetně výnosové atribuce (Revenue Contribution), ROI a confidence skóre.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Sort */}
            <div className="flex items-center rounded border border-zinc-800 bg-zinc-900 p-0.5 text-xs font-mono">
              <span className="px-2 text-[10px] text-zinc-500 flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                <span>Řazení:</span>
              </span>
              <button
                type="button"
                data-testid="boardroom-sort-revenue"
                onClick={() => setSortBy('revenue')}
                className={`rounded px-2 py-1 text-[11px] whitespace-nowrap ${
                  sortBy === 'revenue' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Výnos (Kč)
              </button>
              <button
                type="button"
                onClick={() => setSortBy('confidence')}
                className={`rounded px-2 py-1 text-[11px] whitespace-nowrap ${
                  sortBy === 'confidence' ? 'bg-zinc-800 text-emerald-400 font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Confidence
              </button>
              <button
                type="button"
                onClick={() => setSortBy('tasks')}
                className={`rounded px-2 py-1 text-[11px] whitespace-nowrap ${
                  sortBy === 'tasks' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Úkoly
              </button>
            </div>

            {/* Filter */}
            <div className="flex items-center rounded border border-zinc-800 bg-zinc-900 p-0.5 text-xs font-mono">
              <button
                onClick={() => setAgentFilter('all')}
                className={`rounded px-2.5 py-1 whitespace-nowrap ${agentFilter === 'all' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400'}`}
              >
                Vše ({agents.length})
              </button>
              <button
                onClick={() => setAgentFilter('active')}
                className={`rounded px-2.5 py-1 whitespace-nowrap ${agentFilter === 'active' ? 'bg-zinc-800 text-emerald-400 font-semibold' : 'text-zinc-400'}`}
              >
                Aktivní ({agents.filter((a) => a.status === 'active').length})
              </button>
              <button
                onClick={() => setAgentFilter('paused')}
                className={`rounded px-2.5 py-1 whitespace-nowrap ${agentFilter === 'paused' ? 'bg-zinc-800 text-zinc-400 font-semibold' : 'text-zinc-400'}`}
              >
                Pozastaveno ({agents.filter((a) => a.status === 'paused').length})
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Hledat agenta..."
                className="rounded border border-zinc-800 bg-zinc-900 pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 font-mono w-40 sm:w-48"
              />
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredAgents.map((agent) => {
            const revCzk = agent.revenueContributionCzk || 0;
            const sharePct = agent.attributionSharePercent ?? 0;
            return (
              <div
                key={agent.id}
                data-testid={`agent-card-${agent.id}`}
                className={`flex flex-col justify-between rounded-lg border p-4 transition ${
                  agent.status === 'active'
                    ? 'border-zinc-800 bg-zinc-900/60 hover:border-emerald-500/40'
                    : 'border-zinc-900 bg-zinc-950/50 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          agent.status === 'active' ? 'bg-emerald-400' : 'bg-zinc-600'
                        }`}
                      ></span>
                      <span className="font-mono text-xs font-bold text-white truncate">{agent.name}</span>
                    </div>
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 uppercase shrink-0">
                      {agent.role}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-zinc-300 leading-snug line-clamp-2">{agent.focus}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800/80 space-y-1.5">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-zinc-500">Revenue Contribution:</span>
                    <span
                      data-testid={`agent-revenue-${agent.id}`}
                      className="font-bold text-amber-300 tabular-nums"
                    >
                      {revCzk.toLocaleString('cs-CZ')} Kč
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400 tabular-nums">
                    <span>
                      Podíl {sharePct.toFixed(1)}% · ROI {agent.roiEfficiencyScore ?? 0}
                    </span>
                    <span>
                      {agent.attributedAssetsCount || 0} ast / {agent.attributedOpportunitiesCount || 0} opp
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[11px] pt-1">
                    <span className="text-zinc-500">Confidence:</span>
                    <span className="font-bold text-emerald-400 tabular-nums">{agent.confidence}%</span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-[11px] pb-1.5">
                    <span className="text-zinc-500">Úkoly:</span>
                    <span className="text-zinc-300 tabular-nums">{agent.tasks} dokončeno</span>
                  </div>

                  <button
                    onClick={() => onToggleAgentStatus(agent.id, agent.status)}
                    className={`flex w-full items-center justify-center gap-1.5 rounded py-1.5 font-mono text-xs font-medium transition ${
                      agent.status === 'active'
                        ? 'bg-zinc-800 text-zinc-300 hover:bg-rose-950/30 hover:text-rose-400 hover:border hover:border-rose-900/50'
                        : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
                    }`}
                  >
                    <Power className="h-3 w-3" />
                    <span>{agent.status === 'active' ? 'Pozastavit' : 'Aktivovat'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
