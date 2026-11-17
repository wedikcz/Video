/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquareCode,
  Users,
  Coins,
  Video,
  BarChart3,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  Square,
  Activity,
  Layers,
  Cpu,
  HardDrive,
  Share2,
  X,
  ShieldCheck,
  Film,
  Server,
  Sparkles,
  MessageSquareMore,
  Cloud,
} from 'lucide-react';
import { SystemPerformance, TeamMember, WorkspaceAccount } from '../types/nexus.ts';

export type MainAppTab =
  | 'chat'
  | 'agents'
  | 'revenue'
  | 'factory'
  | 'infra'
  | 'vault'
  | 'comments'
  | 'analytics'
  | 'accounts';

interface NavbarProps {
  activeTab: MainAppTab;
  setActiveTab: (tab: MainAppTab) => void;
  isSystemPaused: boolean;
  onToggleSystemPause: () => void;
  onOpenDocs: () => void;
  onOpenEvals: () => void;
  onOpenPublish: () => void;
  onOpenNotebookLM?: () => void;
  activeAgentsCount: number;
  activeAccount?: WorkspaceAccount;
  currentActor?: TeamMember;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isSystemPaused,
  onToggleSystemPause,
  onOpenDocs,
  onOpenEvals,
  onOpenPublish,
  onOpenNotebookLM,
  activeAccount,
  currentActor,
}) => {
  const [performance, setPerformance] = useState<SystemPerformance | null>(null);
  const [perfHistory, setPerfHistory] = useState<Array<{ cpu: number; mem: number }>>([]);
  const [sseStatus, setSseStatus] = useState<'live' | 'reconnecting'>('reconnecting');
  const [isPerfModalOpen, setIsPerfModalOpen] = useState(false);

  // Subscribe to real-time SSE telemetry stream with initial snapshot hydration
  useEffect(() => {
    let active = true;
    const recordPerf = (sample: SystemPerformance) => {
      if (!active) return;
      setPerformance(sample);
      setPerfHistory((prev) => [
        ...prev.slice(-23),
        {
          cpu: sample.cpuUsagePercent,
          mem: sample.memoryTotalMb > 0 ? Math.round((sample.memoryUsageMb / sample.memoryTotalMb) * 100) : 0,
        },
      ]);
    };

    fetch('/v1/system/performance')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) recordPerf(data);
      })
      .catch(() => {});

    let eventSource: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      eventSource = new EventSource('/v1/system/health/stream');
      eventSource.addEventListener('health', (ev) => {
        try {
          const parsed = JSON.parse((ev as MessageEvent).data) as SystemPerformance;
          setSseStatus('live');
          recordPerf(parsed);
        } catch {
          // Ignore malformed event chunk
        }
      });
      eventSource.onerror = () => {
        if (active) setSseStatus('reconnecting');
      };
    }

    return () => {
      active = false;
      eventSource?.close();
    };
  }, []);

  const getCpuColor = (percent: number) => {
    if (percent < 50) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (percent < 80) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  };

  const canKillSwitch = !currentActor || currentActor.permissions.includes('system_kill_switch');
  const canPublish = !currentActor || currentActor.permissions.includes('publish_videos');

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between gap-1.5 px-2.5 xl:px-4">
        {/* Left: Branding */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Layers className="h-4 w-4" />
          </div>
          <span className="font-mono text-xs font-bold tracking-wider text-white whitespace-nowrap">
            NEXUS X OS
          </span>
        </div>

        {/* Center: Primary Navigation Tabs */}
        <nav aria-label="Hlavní navigace" className="flex items-center gap-0.5 overflow-x-auto py-1">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'chat'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
          >
            <MessageSquareCode className="h-3.5 w-3.5" />
            <span className="font-medium">NEO Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'agents'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span className="font-medium">Boardroom</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('revenue')}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'revenue'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
          >
            <Coins className="h-3.5 w-3.5" />
            <span className="font-medium">Monetizace</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('factory')}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'factory'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
          >
            <Video className="h-3.5 w-3.5" />
            <span className="font-medium">Video Studio</span>
          </button>

          <button
            type="button"
            data-testid="nav-tab-infra"
            onClick={() => setActiveTab('infra')}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'infra'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
          >
            <Cloud className="h-3.5 w-3.5" />
            <span className="font-medium">Fal Cloud</span>
          </button>

          <button
            type="button"
            data-testid="nav-tab-vault"
            onClick={() => setActiveTab('vault')}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'vault'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            <span className="font-medium">Media Vault</span>
          </button>

          <button
            type="button"
            data-testid="nav-tab-comments"
            onClick={() => setActiveTab('comments')}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'comments'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
          >
            <MessageSquareMore className="h-3.5 w-3.5" />
            <span className="font-medium"><span className="hidden 2xl:inline">AI </span>Komentáře</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'analytics'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="font-medium">Analytika</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-mono whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'accounts'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="font-medium">Účty<span className="hidden 2xl:inline"> &amp; Tým</span></span>
          </button>
        </nav>

        {/* Right: Active Role/Workspace, Live System Performance & Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {activeAccount && currentActor && (
            <button
              type="button"
              onClick={() => setActiveTab('accounts')}
              title={`Aktivní účet: ${activeAccount.name} | Role: ${currentActor.role}`}
              className="hidden 2xl:flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] font-mono text-zinc-300 hover:border-zinc-700 hover:text-white whitespace-nowrap shrink-0 transition"
            >
              <span className="truncate max-w-[110px]">{activeAccount.name}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-emerald-400 uppercase text-[10px] font-bold">{currentActor.role}</span>
            </button>
          )}

          {/* REAL-TIME SYSTEM HEALTH MONITOR (SSE) */}
          {performance && (
            <button
              type="button"
              data-testid="system-health-trigger"
              onClick={() => setIsPerfModalOpen(!isPerfModalOpen)}
              className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/90 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900 whitespace-nowrap shrink-0 transition tabular-nums"
              title="Reálný SSE monitor výkonu systému: CPU, RAM a fronta úloh"
            >
              <span
                className={`rounded px-1 text-[9px] font-bold ${
                  sseStatus === 'live'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}
              >
                {sseStatus === 'live' ? 'SSE' : 'SYNC'}
              </span>

              <div className="flex items-center gap-1">
                <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                <span className={`rounded px-1 py-0.2 text-[10px] font-bold border ${getCpuColor(performance.cpuUsagePercent)}`}>
                  {performance.cpuUsagePercent}%
                </span>
              </div>

              <div className="hidden 2xl:flex items-center gap-1 text-[11px] text-zinc-400">
                <HardDrive className="h-3 w-3 text-amber-400" />
                <span>{performance.memoryUsageMb} MB</span>
              </div>

              <div className="hidden 2xl:flex items-center gap-1 text-[11px] text-zinc-400">
                <Activity className="h-3 w-3 text-emerald-400" />
                <span>{performance.activeJobsCount} ÚLOH</span>
              </div>
            </button>
          )}

          {/* Google NotebookLM Video Studio button */}
          {onOpenNotebookLM && (
            <button
              type="button"
              data-testid="open-notebooklm-navbar"
              onClick={onOpenNotebookLM}
              className="flex items-center gap-1 rounded border border-blue-500/40 bg-blue-500/15 px-2 py-1 text-[11px] font-mono font-semibold text-blue-300 hover:bg-blue-500/25 hover:text-white whitespace-nowrap shrink-0 transition"
              title="Google NotebookLM Studio · Přizpůsobení videopřehledu"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden md:inline">NotebookLM</span>
            </button>
          )}

          {/* Publishing & CMS button */}
          <button
            type="button"
            onClick={onOpenPublish}
            className="hidden lg:flex items-center gap-1 rounded bg-emerald-500 px-2 py-1 text-[11px] font-mono font-bold text-black hover:bg-emerald-400 whitespace-nowrap shrink-0 transition"
            title={canPublish ? 'Publikace na YouTube, TikTok a Instagram Reels' : 'Pouze ke čtení (vyžaduje oprávnění Publikace)'}
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Publikace</span>
          </button>

          {/* Evals 20 Golden Cases */}
          <button
            type="button"
            onClick={onOpenEvals}
            title="Spustit 20 Golden Evals testů"
            className="hidden 2xl:flex items-center gap-1 rounded bg-zinc-900 px-2 py-1 text-[11px] font-mono text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 whitespace-nowrap shrink-0 transition"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400" />
            <span>Evals</span>
          </button>

          {/* OpenAPI 3.1 Docs */}
          <button
            type="button"
            onClick={onOpenDocs}
            title="Zobrazit OpenAPI 3.1 Specifikaci"
            className="hidden 2xl:flex items-center gap-1 rounded bg-zinc-900 px-2 py-1 text-[11px] font-mono text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 whitespace-nowrap shrink-0 transition"
          >
            <FileCode2 className="h-3.5 w-3.5 text-amber-400" />
            <span>API 3.1</span>
          </button>

          {/* Emergency Pause (Kill Switch) */}
          <button
            type="button"
            onClick={onToggleSystemPause}
            disabled={!canKillSwitch}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-mono font-medium whitespace-nowrap shrink-0 transition disabled:opacity-40 disabled:cursor-not-allowed ${
              isSystemPaused
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                : 'bg-zinc-900 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-900/50'
            }`}
            title={canKillSwitch ? 'Emergency Kill Switch' : 'Kill Switch vyžaduje roli Administrátor'}
          >
            {isSystemPaused ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>POZASTAVENO</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="hidden sm:inline">KILL SWITCH</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Detailed SSE System Health Flyout Panel */}
      {isPerfModalOpen && performance && (
        <div
          data-testid="system-health-panel"
          className="absolute right-4 top-16 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-2xl backdrop-blur-xl font-mono text-xs space-y-3 tabular-nums"
        >
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <span className="font-bold text-white uppercase text-[11px] flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-emerald-400" />
              <span>SYSTEM HEALTH · LIVE SSE</span>
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  sseStatus === 'live'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}
              >
                {sseStatus === 'live' ? 'SSE LIVE' : 'RECONNECTING'}
              </span>
              <button
                type="button"
                aria-label="Zavřít System Health"
                onClick={() => setIsPerfModalOpen(false)}
                className="rounded p-0.5 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Live Sparkline Chart (CPU & Heap %) */}
          {perfHistory.length > 1 && (
            <div className="rounded border border-zinc-800/80 bg-zinc-900/40 p-2">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                <span className="text-cyan-400">CPU % TREND</span>
                <span className="text-amber-400">HEAP % TREND</span>
              </div>
              <svg viewBox="0 0 240 44" className="w-full h-11 overflow-visible" aria-hidden="true">
                <polyline
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="1.75"
                  points={perfHistory
                    .map((pt, idx) => {
                      const x = (idx / Math.max(1, perfHistory.length - 1)) * 240;
                      const y = 40 - Math.min(100, pt.cpu) * 0.36;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ')}
                />
                <polyline
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                  points={perfHistory
                    .map((pt, idx) => {
                      const x = (idx / Math.max(1, perfHistory.length - 1)) * 240;
                      const y = 40 - Math.min(100, pt.mem) * 0.36;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ')}
                />
              </svg>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">
                Využití CPU ({performance.cpuCores || 4} jádra · Load {performance.loadAvg1m ?? 0}):
              </span>
              <span className="font-bold text-white">{performance.cpuUsagePercent} %</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-900 rounded overflow-hidden">
              <div
                style={{ width: `${Math.min(100, performance.cpuUsagePercent)}%` }}
                className="h-full bg-cyan-500 rounded transition-all duration-300"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-zinc-400">Node Heap / RSS:</span>
              <span className="font-bold text-white">
                {performance.memoryUsageMb} / {performance.memoryTotalMb} MB ({performance.rssMb ?? performance.memoryTotalMb} MB RSS)
              </span>
            </div>
            <div className="h-1.5 w-full bg-zinc-900 rounded overflow-hidden">
              <div
                style={{
                  width: `${Math.min(100, Math.round((performance.memoryUsageMb / Math.max(1, performance.memoryTotalMb)) * 100))}%`,
                }}
                className="h-full bg-amber-500 rounded transition-all duration-300"
              />
            </div>

            {performance.systemMemoryTotalMb && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">Systémová RAM:</span>
                <span className="text-zinc-300">
                  {performance.systemMemoryUsedMb} / {performance.systemMemoryTotalMb} MB
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-zinc-800/80 text-[11px]">
              <div className="rounded border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-1.5">
                <div className="text-[10px] text-zinc-500">AKTIVNÍ / FRONTA</div>
                <div className="font-bold text-emerald-400 mt-0.5">
                  {performance.activeJobsCount} aktivní · {performance.queuedJobsCount} čeká
                </div>
              </div>
              <div className="rounded border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-1.5">
                <div className="text-[10px] text-zinc-500">RENDER & MEDIA VAULT</div>
                <div className="font-bold text-cyan-400 mt-0.5">
                  {performance.renderWorkers} workery · {performance.mediaVaultCount ?? 0} MP4
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-zinc-800 text-[10px] text-zinc-500">
              <span>Event Loop Lag: {performance.eventLoopLagMs ?? 1.0} ms</span>
              <span>Uptime: {Math.floor(performance.uptimeSeconds / 60)}m {performance.uptimeSeconds % 60}s</span>
              <span className={isSystemPaused ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                {isSystemPaused ? 'PAUSED' : 'OPTIMÁLNÍ'}
              </span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
