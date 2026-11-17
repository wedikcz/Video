/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Film,
  Flame,
  Layers,
  Play,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Wand2,
} from 'lucide-react';
import {
  BoardroomSession,
  FactoryAsset,
  RunTrace,
  TeamMember,
  TitanCoreManifest,
  VideoTemplateCategory,
} from '../types/nexus.ts';
import { copyTextSafely } from '../utils/clipboard.ts';
import { downloadVideoAsset } from '../utils/mediaDownload.ts';

interface VideoFactoryPanelProps {
  assets: FactoryAsset[];
  onRefreshAssets: () => void;
  currentActor?: TeamMember;
  onOpenPublish?: (
    videoTitle?: string,
    format?: '9:16' | '16:9',
    category?: VideoTemplateCategory,
    extra?: { assetId?: string; description?: string; tags?: string[] }
  ) => void;
}

interface GenerationResponsePayload {
  status: string;
  runId: string;
  traceUrl: string;
  manifestPath: string;
  manifest: TitanCoreManifest;
  ypp_score: number;
  healing_iterations: number;
  next_commands: string[];
  asset: FactoryAsset;
}

const ROLE_META: Record<
  'hook' | 'setup' | 'escalation' | 'punchline_loop',
  { label: string; badgeClass: string; borderClass: string }
> = {
  hook: {
    label: '1. HOOK (0.0–2.2s)',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    borderClass: 'border-rose-500/30',
  },
  setup: {
    label: '2. SETUP',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
    borderClass: 'border-cyan-500/30',
  },
  escalation: {
    label: '3. ESCALATION',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    borderClass: 'border-amber-500/30',
  },
  punchline_loop: {
    label: '4. PUNCHLINE / LOOP',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    borderClass: 'border-emerald-500/30',
  },
};

export const VideoFactoryPanel: React.FC<VideoFactoryPanelProps> = ({
  assets,
  onRefreshAssets,
  currentActor,
  onOpenPublish,
}) => {
  const [visualDescription, setVisualDescription] = useState(
    'Kočka v open-space kanceláři zírá na prázdnou misku při pondělní poradě managementu'
  );
  const [durationSec, setDurationSec] = useState<number>(15);
  const [seriesName, setSeriesName] = useState('Kancelář CZ');
  const [episodeNumber, setEpisodeNumber] = useState<number>(1);
  const [humorStyle, setHumorStyle] = useState('');
  const [rawVideoPath, setRawVideoPath] = useState('');
  const [dubAudioPath, setDubAudioPath] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [activeManifest, setActiveManifest] = useState<TitanCoreManifest | null>(null);
  const [activeAsset, setActiveAsset] = useState<FactoryAsset | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runTrace, setRunTrace] = useState<RunTrace | null>(null);
  const [abHookManifest, setAbHookManifest] = useState<TitanCoreManifest | null>(null);

  const [renderStatus, setRenderStatus] = useState<'idle' | 'queued' | 'rendering' | 'ready' | 'failed'>('idle');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [boardroomSession, setBoardroomSession] = useState<BoardroomSession | null>(null);
  const [isDebating, setIsDebating] = useState(false);

  const canCreateVideos = !currentActor || currentActor.permissions.includes('create_edit_videos');
  const canPublish = !currentActor || currentActor.permissions.includes('publish_videos');

  useEffect(() => {
    if (!activeManifest) {
      const existing = assets.find((a) => Boolean(a.titanCoreManifest));
      if (existing?.titanCoreManifest) {
        setActiveManifest(existing.titanCoreManifest);
        setActiveAsset(existing);
        setRenderStatus(existing.renderStatus || existing.status || 'ready');
        setActiveRunId(existing.runId || null);
      }
    }
  }, [assets, activeManifest]);

  useEffect(() => {
    if (!activeAsset?.id) return;
    if (renderStatus !== 'rendering' && renderStatus !== 'queued') return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/assets/${activeAsset.id}/status`);
        const data = await res.json().catch(() => null);
        if (cancelled || !data) return;

        if (data.status === 'ready') {
          setRenderStatus('ready');
          setActiveAsset(data.asset);
          setStatusNotice('MoviePy 2.x YPP-safe MP4 render dokončen a ověřen (+faststart).');
          onRefreshAssets();
          clearInterval(interval);
        } else if (data.status === 'failed') {
          setRenderStatus('failed');
          setErrorMsg(data.workerMessage || 'MoviePy 2.x render selhal.');
          clearInterval(interval);
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 800);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeAsset?.id, renderStatus, onRefreshAssets]);

  const fetchRunTrace = async (runId: string) => {
    try {
      const res = await fetch(`/v1/runs/${runId}`);
      if (res.ok) {
        setRunTrace(await res.json());
      }
    } catch {
      // Non-fatal
    }
  };

  const triggerGeneration = async (overrides?: {
    durationSec?: number;
    seriesName?: string;
    episodeNumber?: number;
    humorStyle?: string;
    visualDescription?: string;
    asAbVariant?: boolean;
  }) => {
    if (!canCreateVideos) {
      setErrorMsg('Chybí oprávnění pro tvorbu videí (create_edit_videos).');
      return;
    }

    const nextDuration = Math.max(10, Math.min(25, overrides?.durationSec ?? durationSec));
    const nextSeries = (overrides?.seriesName ?? seriesName).trim() || 'MadLipz CZ Série';
    const nextEp = Math.max(1, overrides?.episodeNumber ?? episodeNumber);
    const nextHumor = overrides?.humorStyle !== undefined ? overrides.humorStyle : humorStyle;
    const nextVisual = (overrides?.visualDescription ?? visualDescription).trim();

    if (!nextVisual) {
      setErrorMsg('Zadejte popis vizuální scény.');
      return;
    }

    if (overrides?.durationSec !== undefined) setDurationSec(nextDuration);
    if (overrides?.episodeNumber !== undefined) setEpisodeNumber(nextEp);
    if (overrides?.humorStyle !== undefined) setHumorStyle(overrides.humorStyle);

    setIsGenerating(true);
    setErrorMsg(null);
    setStatusNotice(null);

    try {
      const res = await fetch('/v1/factory/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visualDescription: nextVisual,
          durationSec: nextDuration,
          seriesName: nextSeries,
          episodeNumber: nextEp,
          humorStyle: nextHumor.trim() || undefined,
          rawVideoPath: rawVideoPath.trim() || undefined,
          dubAudioPath: dubAudioPath.trim() || undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as Partial<GenerationResponsePayload> & {
        error?: string;
      };

      if (!res.ok || !data.manifest || !data.asset) {
        setErrorMsg(data.error || 'Generování TitanCore manifestu selhalo.');
        return;
      }

      if (overrides?.asAbVariant) {
        setAbHookManifest(data.manifest);
        setStatusNotice(
          `A/B Hook varianta vygenerována (YPP ${data.manifest.ypp_score}/100, engine ${data.manifest.engine_used}).`
        );
      } else {
        setAbHookManifest(null);
        setActiveManifest(data.manifest);
        setActiveAsset(data.asset);
        setActiveRunId(data.runId || null);
        setRenderStatus(data.asset.renderStatus || data.asset.status || 'rendering');
        setStatusNotice(
          `TitanCore manifest připraven (YPP ${data.manifest.ypp_score}/100 · Healing ${data.manifest.healing_iterations}×).`
        );
      }

      if (data.runId) {
        fetchRunTrace(data.runId);
      }
      onRefreshAssets();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Síťová chyba při komunikaci s TitanCore API.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerGeneration();
  };

  const handleCopyOpenSourceGenPrompt = async () => {
    const prompt = activeManifest?.asset_bridge?.opensourcegen_prompt;
    if (!prompt) return;
    const ok = await copyTextSafely(prompt);
    if (ok) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleDownloadAgnesJson = () => {
    const agnes = activeManifest?.asset_bridge?.agnes_manifest;
    if (!agnes) return;
    const blob = new Blob([JSON.stringify(agnes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agnes_manifest_${seriesName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_ep${episodeNumber}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBoardroomDebate = async () => {
    if (!activeManifest) return;
    setIsDebating(true);
    setErrorMsg(null);
    try {
      const topic = `YPP & Virální audit MadLipz CZ série "${activeManifest.series_name}" #${activeManifest.episode_number}: Hook "${activeManifest.blocks[0]?.voiceover_cz || ''}"`;
      const res = await fetch('/v1/boardroom/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Boardroom debata selhala.');
        return;
      }
      setBoardroomSession(data as BoardroomSession);
      setStatusNotice('3-kolová debata 16 agentů nad scénářem byla dokončena.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Chyba při spuštění 16-agentní debaty.');
    } finally {
      setIsDebating(false);
    }
  };

  const handleExecuteCommand = async (cmd: string) => {
    const lower = cmd.toLowerCase();
    if (lower.includes('zkrátit')) {
      const nextDur = durationSec > 15 ? 15 : 12;
      await triggerGeneration({ durationSec: nextDur });
    } else if (lower.includes('sarkasm')) {
      await triggerGeneration({ humorStyle: 'suchý sarkasmus' });
    } else if (lower.includes('díl')) {
      await triggerGeneration({ episodeNumber: episodeNumber + 1 });
    } else if (lower.includes('moviepy') || lower.includes('render')) {
      if (activeAsset?.id) {
        const res = await fetch(`/api/v1/assets/${activeAsset.id}/status`);
        const data = await res.json().catch(() => null);
        if (data?.asset) {
          setActiveAsset(data.asset);
          setRenderStatus(data.status || 'ready');
          setStatusNotice(`Stav MoviePy 2.x renderu: ${String(data.status || 'ready').toUpperCase()}`);
        }
      }
    } else if (lower.includes('a/b') || lower.includes('hook')) {
      await triggerGeneration({
        humorStyle: 'rychlý šokující A/B hook s ironickou pointou',
        asAbVariant: true,
      });
    } else if (lower.includes('debatu') || lower.includes('16 agentů')) {
      await handleBoardroomDebate();
    } else {
      await triggerGeneration();
    }
  };

  const yppScore = activeManifest?.ypp_score ?? 0;
  const yppTraffic =
    yppScore >= 92
      ? {
          label: 'YPP SAFE · MONETIZOVATELNÉ',
          cls: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300',
          dot: 'bg-emerald-400',
        }
      : yppScore >= 80
      ? {
          label: 'HRANIČNÍ YPP · NUTNÁ ÚPRAVA',
          cls: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
          dot: 'bg-amber-400',
        }
      : {
          label: 'RIZIKO DEMONETIZACE',
          cls: 'border-rose-500/50 bg-rose-500/15 text-rose-300',
          dot: 'bg-rose-400',
        };

  const titanCoreAssets = assets.filter((a) => Boolean(a.titanCoreManifest || a.openSourceGenPrompt));

  return (
    <div
      className="space-y-5 font-mono text-xs"
      data-testid="titancore-video-factory-panel"
    >
      {/* Header & Architecture Banner */}
      <div className="rounded-lg border border-emerald-500/35 bg-zinc-900/70 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 uppercase">
              GODMODE-TITANCORE · MADLIPZ CZ YPP FACTORY
            </span>
            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
              Multi-Engine Fallback · Self-Healing Critic (Max 3×) · MoviePy 2.x
            </span>
          </div>
          <h2 className="text-base font-bold text-white">
            Autonomní produkční linka českých dabovaných Shorts (1080×1920 · YPP ≥ 92/100)
          </h2>
          <p className="text-[11px] text-zinc-400">
            Hlídá Hook ≤ 2.2 s, tempo řeči ≤ 3.5 slova/s, anti-repetitious paměť (BM25 + Cosine) a generuje asset bridge pro OpenSourceGen &amp; Agnes.
          </p>
        </div>

        {activeManifest && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              data-testid="titancore-ypp-badge"
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 font-bold ${yppTraffic.cls}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${yppTraffic.dot}`} />
              <span>YPP {yppScore}/100</span>
              <span className="text-[10px] opacity-85 hidden sm:inline">· {yppTraffic.label}</span>
            </div>
            <div
              data-testid="titancore-healing-badge"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-200 font-bold"
            >
              Self-Healing: {activeManifest.healing_iterations}×
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-rose-300">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {statusNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-4"
        data-testid="titancore-form"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block md:col-span-2">
            <span className="block text-[11px] font-bold text-zinc-300 mb-1">
              Název série (seriesName)
            </span>
            <input
              type="text"
              required
              data-testid="titancore-series-input"
              value={seriesName}
              onChange={(e) => setSeriesName(e.target.value)}
              placeholder="např. Kancelář CZ"
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
            />
          </label>

          <label className="block">
            <span className="block text-[11px] font-bold text-zinc-300 mb-1">
              Díl # (episodeNumber)
            </span>
            <input
              type="number"
              min={1}
              max={999}
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-white tabular-nums focus:outline-none focus:border-emerald-500"
            />
          </label>

          <label className="block">
            <span className="flex items-center justify-between text-[11px] font-bold text-zinc-300 mb-1">
              <span>Stopáž (10–25 s)</span>
              <span className="text-emerald-400 tabular-nums">{durationSec} s</span>
            </span>
            <input
              type="range"
              min={10}
              max={25}
              step={1}
              data-testid="titancore-duration-input"
              value={durationSec}
              onChange={(e) => setDurationSec(Number(e.target.value))}
              className="w-full accent-emerald-500 mt-2 cursor-pointer"
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-[11px] font-bold text-zinc-300 mb-1">
            Popis vizuální scény (visualDescription) *
          </span>
          <textarea
            rows={2}
            required
            data-testid="titancore-visual-input"
            value={visualDescription}
            onChange={(e) => setVisualDescription(e.target.value)}
            placeholder="Popište děj, mimiku nebo zdrojové video pro český MadLipz dabing..."
            className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
          />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-[11px] text-zinc-400 mb-1">
              Styl humoru (volitelné – jinak anti-repetitious paměť)
            </span>
            <input
              type="text"
              value={humorStyle}
              onChange={(e) => setHumorStyle(e.target.value)}
              placeholder="např. suchý sarkasmus, úřednický absurd..."
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-white focus:outline-none focus:border-cyan-500"
            />
          </label>

          <label className="block">
            <span className="block text-[11px] text-zinc-400 mb-1">
              Cesta ke zdrojovému videu (rawVideoPath, volitelné)
            </span>
            <input
              type="text"
              value={rawVideoPath}
              onChange={(e) => setRawVideoPath(e.target.value)}
              placeholder="/cesta/ke/zdroji.mp4 (jinak OpenSourceGen + mock)"
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-white focus:outline-none focus:border-cyan-500"
            />
          </label>

          <label className="block">
            <span className="block text-[11px] text-zinc-400 mb-1">
              Cesta k lidskému CZ dabingu (dubAudioPath, volitelné)
            </span>
            <input
              type="text"
              value={dubAudioPath}
              onChange={(e) => setDubAudioPath(e.target.value)}
              placeholder="/cesta/k/dabingu.wav"
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-white focus:outline-none focus:border-cyan-500"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
          <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Původní zvuk bude 100% odstraněn · Titulky v Safe Zone y=1320 · Pacing ≤ 3.5 sl/s</span>
          </div>

          <button
            type="submit"
            data-testid="titancore-submit-btn"
            disabled={!canCreateVideos || isGenerating || !visualDescription.trim()}
            className="flex items-center gap-2 rounded bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 py-2.5 font-bold text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-lg shadow-emerald-950/30"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>GENERUJI &amp; AUDITUJI YPP MANIFEST...</span>
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                <span>VYGENEROVAT TITAN-CORE YPP VIDEO</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Active Manifest Preview */}
      {activeManifest && (
        <div className="space-y-5" data-testid="titancore-manifest-output">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 7 Cols: Timeline Preview */}
            <div className="lg:col-span-7 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-emerald-400" />
                  <span className="font-bold text-white uppercase">
                    Časová osa bloků ({activeManifest.target_duration_sec} s · {activeManifest.blocks.length} bloky)
                  </span>
                </div>
                <span className="text-[11px] text-cyan-300">
                  Úhel humoru: {activeManifest.humor_angle}
                </span>
              </div>

              <div className="space-y-2.5" data-testid="titancore-timeline-blocks">
                {activeManifest.blocks.map((blk) => {
                  const meta = ROLE_META[blk.role] || ROLE_META.setup;
                  const dur = Math.max(0.1, blk.end_sec - blk.start_sec);
                  const wps = blk.words_per_sec ?? 0;
                  const pacingOk = wps <= 3.5;

                  return (
                    <div
                      key={blk.id}
                      className={`rounded-lg border ${meta.borderClass} bg-zinc-950/90 p-3 space-y-1.5`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${meta.badgeClass}`}>
                            {meta.label}
                          </span>
                          <span className="text-zinc-300 font-bold tabular-nums">
                            {blk.start_sec.toFixed(1)}s – {blk.end_sec.toFixed(1)}s ({dur.toFixed(1)}s)
                          </span>
                        </div>

                        <span
                          className={`rounded border px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                            pacingOk
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {wps.toFixed(2)} sl/s (limit 3.5)
                        </span>
                      </div>

                      <div className="text-white text-xs font-semibold">
                        CZ Dabing: &quot;{blk.voiceover_cz}&quot;
                      </div>
                      <div className="text-[11px] text-amber-300/90">
                        Titulek (y={activeManifest.delivery.safe_zone_y}): {blk.subtitle_text}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Režie: {blk.visual_direction}
                        {blk.audio_cue ? ` · Audio cue: ${blk.audio_cue}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>

              {abHookManifest && (
                <div className="rounded-lg border border-purple-500/40 bg-purple-950/20 p-3 space-y-2">
                  <div className="flex items-center justify-between text-purple-300 font-bold">
                    <span>A/B TEST HOOKŮ (VARIANTA A vs. VARIANTA B)</span>
                    <span>YPP B: {abHookManifest.ypp_score}/100</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
                      <div className="text-zinc-400 font-bold mb-0.5">Hook A (Aktivní)</div>
                      <div className="text-white">&quot;{activeManifest.blocks[0]?.voiceover_cz}&quot;</div>
                    </div>
                    <div className="rounded border border-purple-500/40 bg-zinc-950 p-2">
                      <div className="text-purple-300 font-bold mb-0.5">Hook B (Alternativa)</div>
                      <div className="text-white">&quot;{abHookManifest.blocks[0]?.voiceover_cz}&quot;</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right 5 Cols: Asset Bridge + MoviePy MP4 Player */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-2 text-white font-bold">
                    <Film className="h-4 w-4 text-emerald-400" />
                    <span>MoviePy 2.x YPP Render ({activeManifest.delivery.resolution})</span>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                      renderStatus === 'ready'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                        : renderStatus === 'failed'
                        ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {renderStatus === 'ready'
                      ? 'READY MP4'
                      : renderStatus === 'failed'
                      ? 'FAILED'
                      : 'RENDERING...'}
                  </span>
                </div>

                {renderStatus === 'ready' && activeAsset?.streamUrl ? (
                  <div className="space-y-2.5">
                    <div className="mx-auto w-[210px] h-[373px] rounded-lg border border-emerald-500/40 bg-black overflow-hidden">
                      <video
                        key={activeAsset.id}
                        controls
                        playsInline
                        preload="metadata"
                        poster={`/api/v1/assets/${activeAsset.id}/stream?format=poster`}
                        src={activeAsset.streamUrl}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => downloadVideoAsset(activeAsset)}
                        className="flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 font-bold text-emerald-300 hover:bg-emerald-500/25 transition"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Stáhnout YPP MP4</span>
                      </button>

                      {onOpenPublish && (
                        <button
                          type="button"
                          disabled={!canPublish}
                          onClick={() =>
                            onOpenPublish(activeManifest.youtube_metadata.title, '9:16', 'viral_hook', {
                              assetId: activeAsset.id,
                              description: activeManifest.youtube_metadata.description,
                              tags: activeManifest.youtube_metadata.tags,
                            })
                          }
                          className="flex items-center gap-1.5 rounded bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 font-bold text-black disabled:opacity-40 transition"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          <span>Publikovat</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-400 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-400 animate-pulse shrink-0" />
                    <span>
                      {renderStatus === 'failed'
                        ? 'Render skriptu selhal. Zkontrolujte stderr nebo spusťte znovu.'
                        : 'Asynchronní worker renderuje 1080×1920 MP4 (LumContrast + micro-zoom + safe-zone y=1320)...'}
                    </span>
                  </div>
                )}

                <div className="text-[10px] text-zinc-400 space-y-1 border-t border-zinc-800/80 pt-2">
                  <div>
                    Engine: <span className="text-zinc-200 font-bold">{activeManifest.engine_used}</span> · Audio:{' '}
                    <span className="text-emerald-300">{activeManifest.delivery.audio_mode}</span>
                  </div>
                  <div>
                    Anti-Fingerprint: LumContrast {activeManifest.delivery.anti_fingerprint.lum_contrast} · Micro-Zoom na{' '}
                    {activeManifest.delivery.anti_fingerprint.micro_zoom_block_role}
                  </div>
                  {(activeRunId || runTrace) && (
                    <div className="text-cyan-300">
                      Trace {activeRunId}: {runTrace ? `${runTrace.totalTokens} tok · ${runTrace.costCzk} Kč · ${runTrace.latencyMs} ms` : 'uloženo v /v1/runs'}
                    </div>
                  )}
                </div>
              </div>

              {/* OpenSourceGen & Agnes Asset Bridge */}
              <div className="rounded-lg border border-cyan-500/30 bg-zinc-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                    <Sparkles className="h-4 w-4" />
                    <span>OpenSourceGen (LTX-2.3 / Wan 2.2) Prompt</span>
                  </div>
                  <button
                    type="button"
                    data-testid="copy-opensourcegen-btn"
                    onClick={handleCopyOpenSourceGenPrompt}
                    className="flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/25 transition"
                  >
                    {copiedPrompt ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedPrompt ? 'Zkopírováno' : 'Kopírovat 1 klikem'}</span>
                  </button>
                </div>

                <p className="rounded border border-zinc-800 bg-zinc-950 p-2.5 text-[11px] text-zinc-200 leading-relaxed">
                  {activeManifest.asset_bridge.opensourcegen_prompt}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
                  <div>
                    <div className="font-bold text-white text-[11px]">
                      Agnes Video Generator Manifest (MIT)
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      Word-level CZ titulky · {activeManifest.asset_bridge.agnes_manifest.segments.length} segmentů · Safe zone y={activeManifest.asset_bridge.agnes_manifest.word_level_subtitles.safe_zone_y}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="download-agnes-btn"
                    onClick={handleDownloadAgnesJson}
                    className="flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-bold text-amber-200 hover:bg-amber-500/25 transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Stáhnout Agnes JSON</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 6 Clickable Imperative Next Commands */}
          <div
            className="rounded-lg border border-emerald-500/30 bg-zinc-900/60 p-4 space-y-2.5"
            data-testid="titancore-next-commands"
          >
            <div className="flex items-center gap-2 text-emerald-300 font-bold uppercase text-[11px]">
              <Terminal className="h-4 w-4" />
              <span>6 Dalších kroků (Klikací rozkazovací příkazy)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {activeManifest.next_commands.slice(0, 6).map((cmd, idx) => (
                <button
                  key={`${cmd}-${idx}`}
                  type="button"
                  disabled={isGenerating || isDebating}
                  data-testid={`titancore-cmd-btn-${idx}`}
                  onClick={() => handleExecuteCommand(cmd)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-950 hover:border-emerald-400 hover:bg-emerald-950/30 px-3 py-2 text-left text-zinc-200 hover:text-white disabled:opacity-40 transition"
                >
                  <span className="font-semibold">
                    {idx + 1}. {cmd}
                  </span>
                  <Play className="h-3 w-3 text-emerald-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Inline 16-Agent Boardroom Consensus Verdict */}
          {boardroomSession && (
            <div
              className="rounded-lg border border-cyan-500/40 bg-cyan-950/20 p-4 space-y-2"
              data-testid="titancore-boardroom-verdict"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-300 font-bold">
                  <Users className="h-4 w-4" />
                  <span>3-kolová debata 16 agentů · Konsenzus: {boardroomSession.consensusScore}/100</span>
                </div>
                <span className="text-[10px] text-zinc-400">{boardroomSession.id}</span>
              </div>
              <p className="text-zinc-200 font-semibold leading-relaxed">{boardroomSession.verdict}</p>
              {boardroomSession.summary && (
                <p className="text-zinc-400 text-[11px] leading-relaxed">{boardroomSession.summary}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recent TitanCore Assets Library */}
      {titanCoreAssets.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-zinc-200 font-bold uppercase text-[11px]">
            <Flame className="h-4 w-4 text-amber-400" />
            <span>Nedávné TitanCore YPP Asset Manifesty ({titanCoreAssets.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {titanCoreAssets.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex flex-col justify-between gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-white line-clamp-1">{item.title}</div>
                  <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 shrink-0">
                    YPP {item.yppScore ?? item.titanCoreManifest?.ypp_score ?? 92}/100
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 flex items-center justify-between gap-2">
                  <span>
                    Stav: <strong className="text-zinc-200">{item.renderStatus || item.status || 'ready'}</strong> · {item.durationSec || 15}s
                  </span>
                  {item.titanCoreManifest && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveManifest(item.titanCoreManifest!);
                        setActiveAsset(item);
                        setRenderStatus(item.renderStatus || item.status || 'ready');
                        setActiveRunId(item.runId || null);
                      }}
                      className="rounded border border-zinc-700 hover:border-cyan-400 px-2 py-0.5 text-cyan-300"
                    >
                      Otevřít manifest
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
