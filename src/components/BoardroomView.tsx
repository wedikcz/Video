/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Users,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Power,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Scale,
} from 'lucide-react';
import { Agent, BoardroomSession } from '../types/nexus.ts';

interface BoardroomViewProps {
  agents: Agent[];
  onToggleAgentStatus: (agentId: string, currentStatus: 'active' | 'paused') => void;
}

export const BoardroomView: React.FC<BoardroomViewProps> = ({ agents, onToggleAgentStatus }) => {
  const [topic, setTopic] = useState('Zvýšení alokace pro YouTube video produkci a MoviePy rendering');
  const [isDebating, setIsDebating] = useState(false);
  const [currentSession, setCurrentSession] = useState<BoardroomSession | null>(null);
  const [selectedRound, setSelectedRound] = useState<'round1' | 'round2' | 'round3'>('round3');
  const [agentFilter, setAgentFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleStartBoardroom = async () => {
    if (!topic.trim() || isDebating) return;
    setIsDebating(true);
    try {
      const res = await fetch('/v1/boardroom/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentSession(data);
      }
    } catch (err) {
      console.error('Failed to run boardroom session', err);
    } finally {
      setIsDebating(false);
    }
  };

  const filteredAgents = agents.filter((a) => {
    if (agentFilter === 'active' && a.status !== 'active') return false;
    if (agentFilter === 'paused' && a.status !== 'paused') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q) || a.focus.toLowerCase().includes(q);
    }
    return true;
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

      {/* 16 Agents Grid Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-400" />
              <span>16 SPECIALIZOVANÝCH AGENTŮ ({agents.length})</span>
            </h2>
            <p className="text-xs text-zinc-400 font-mono">
              Správa zaměstnanců autonomní digitální firmy. Každý agent má vlastní roli, specializaci a confidence skóre.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter */}
            <div className="flex items-center rounded border border-zinc-800 bg-zinc-900 p-0.5 text-xs font-mono">
              <button
                onClick={() => setAgentFilter('all')}
                className={`rounded px-2.5 py-1 ${agentFilter === 'all' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400'}`}
              >
                Vše ({agents.length})
              </button>
              <button
                onClick={() => setAgentFilter('active')}
                className={`rounded px-2.5 py-1 ${agentFilter === 'active' ? 'bg-zinc-800 text-emerald-400 font-semibold' : 'text-zinc-400'}`}
              >
                Aktivní ({agents.filter((a) => a.status === 'active').length})
              </button>
              <button
                onClick={() => setAgentFilter('paused')}
                className={`rounded px-2.5 py-1 ${agentFilter === 'paused' ? 'bg-zinc-800 text-zinc-400 font-semibold' : 'text-zinc-400'}`}
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
          {filteredAgents.map((agent) => (
            <div
              key={agent.id}
              className={`flex flex-col justify-between rounded-lg border p-4 transition ${
                agent.status === 'active'
                  ? 'border-zinc-800 bg-zinc-900/60 hover:border-emerald-500/40'
                  : 'border-zinc-900 bg-zinc-950/50 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        agent.status === 'active' ? 'bg-emerald-400' : 'bg-zinc-600'
                      }`}
                    ></span>
                    <span className="font-mono text-xs font-bold text-white">{agent.name}</span>
                  </div>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 uppercase">
                    {agent.role}
                  </span>
                </div>

                <p className="mt-2 text-xs text-zinc-300 leading-snug line-clamp-2">{agent.focus}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-zinc-800/80">
                <div className="flex items-center justify-between font-mono text-[11px] mb-2.5">
                  <span className="text-zinc-500">Confidence:</span>
                  <span className="font-bold text-emerald-400">{agent.confidence}%</span>
                </div>
                <div className="flex items-center justify-between font-mono text-[11px] mb-3">
                  <span className="text-zinc-500">Úkoly:</span>
                  <span className="text-zinc-300">{agent.tasks} dokončeno</span>
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
          ))}
        </div>
      </div>
    </div>
  );
};
