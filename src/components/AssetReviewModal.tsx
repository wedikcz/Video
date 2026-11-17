/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Film,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { FactoryAsset } from '../types/nexus.ts';
import { downloadVideoAsset, formatBytes, formatDuration } from '../utils/mediaDownload.ts';
import {
  CAMERA_MOTION_LABELS,
  LIGHTING_LABELS,
  OPTICS_LABELS,
  PHASE_LABELS,
  VISUAL_STYLE_PALETTES,
} from '../utils/structuredVideoPrompt.ts';
import { evaluateMonetizationReadiness } from '../utils/monetizationCheatsheets.ts';
import { copyTextSafely } from '../utils/clipboard.ts';

interface AssetReviewModalProps {
  asset: FactoryAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onPublishAsset: (asset: FactoryAsset) => void;
  onLoadIntoEditor?: (asset: FactoryAsset) => void;
  canPublish?: boolean;
}

export const AssetReviewModal: React.FC<AssetReviewModalProps> = ({
  asset,
  isOpen,
  onClose,
  onPublishAsset,
  onLoadIntoEditor,
  canPublish = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [copiedSha, setCopiedSha] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentTime(0);
    setIsPlaying(false);
    setDownloadError(null);
    setDuration(asset?.durationSec || asset?.structuredPrompt?.totalDurationSec || 6);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, asset?.id, onClose]);

  if (!isOpen || !asset) return null;

  const hasMp4Stream = Boolean(asset.streamUrl && asset.status === 'ready');
  const sp = asset.structuredPrompt || asset.videoBrief?.structuredPrompt || asset.videoStoryboard?.structuredPrompt;
  const audit = sp ? evaluateMonetizationReadiness(sp, asset) : null;
  const aspectRatio = asset.videoStoryboard?.aspectRatio || sp?.aspectRatio || (asset.resolution === '1280x720' ? '16:9' : '9:16');
  const effectiveDuration = Math.max(1, duration || asset.durationSec || sp?.totalDurationSec || 6);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      setIsPlaying(true);
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (nextSec: number) => {
    const clamped = Math.max(0, Math.min(effectiveDuration, nextSec));
    setCurrentTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (videoRef.current) {
      videoRef.current.muted = next;
    }
  };

  const changeRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleCopySha = async () => {
    if (!asset.sha256) return;
    const ok = await copyTextSafely(asset.sha256);
    if (ok) {
      setCopiedSha(true);
      setTimeout(() => setCopiedSha(false), 2000);
    }
  };

  const handleDownload = async () => {
    setDownloadError(null);
    try {
      await downloadVideoAsset(asset);
    } catch (err: any) {
      setDownloadError(err?.message || 'Stažení MP4 selhalo.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Kontrola video assetu ${asset.title}`}
      data-testid="asset-review-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono text-xs"
    >
      <div className="relative flex w-full max-w-5xl max-h-[92vh] flex-col rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-3.5 bg-zinc-900/60">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
              <span className="font-bold text-emerald-400 uppercase">{asset.line}</span>
              <span>·</span>
              <span className="tabular-nums">{asset.id}</span>
              <span>·</span>
              <span>{aspectRatio}</span>
              {asset.faststartVerified && (
                <>
                  <span>·</span>
                  <span className="text-emerald-300 font-bold">+faststart ověřeno</span>
                </>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white truncate mt-0.5">
              {asset.title}
            </h2>
          </div>

          <button
            type="button"
            aria-label="Zavřít kontrolu assetu"
            data-testid="close-asset-review-modal"
            onClick={onClose}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-white transition shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Main Body Split */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Playback Stage & Transport Controls */}
          <div className="lg:col-span-6 flex flex-col space-y-3">
            <div className="relative flex items-center justify-center rounded-xl border border-zinc-800 bg-black overflow-hidden min-h-[300px] max-h-[440px]">
              {hasMp4Stream ? (
                <video
                  ref={videoRef}
                  key={asset.id}
                  data-testid="asset-review-video"
                  playsInline
                  loop={isLooping}
                  muted={isMuted}
                  preload="metadata"
                  poster={asset.posterUrl || `/api/v1/assets/${asset.id}/stream?format=poster`}
                  src={asset.streamUrl}
                  onLoadedMetadata={(e) => {
                    const vid = e.currentTarget;
                    if (vid.duration && Number.isFinite(vid.duration)) {
                      setDuration(vid.duration);
                    }
                    vid.playbackRate = playbackRate;
                  }}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onClick={togglePlay}
                  className="max-h-[430px] w-full object-contain cursor-pointer bg-black"
                />
              ) : (
                <div className="p-6 text-center space-y-2 text-zinc-400">
                  <Film className="h-10 w-10 text-zinc-600 mx-auto" />
                  <p className="font-bold text-zinc-200">
                    {asset.line === 'video'
                      ? `MP4 stream je ve stavu: ${asset.status || 'čeká na render'}`
                      : 'Textový / Funnelový asset bez MP4 stopy'}
                  </p>
                  <p className="text-[11px] max-w-sm mx-auto leading-relaxed">
                    {asset.body}
                  </p>
                </div>
              )}
            </div>

            {/* Custom Transport Controls */}
            {hasMp4Stream && (
              <div
                data-testid="asset-review-controls"
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2.5"
              >
                {/* Seek Bar + Beat Markers */}
                <div className="space-y-1">
                  <input
                    type="range"
                    aria-label="Časová osa kontroly videa"
                    min={0}
                    max={effectiveDuration}
                    step={0.1}
                    value={Math.min(currentTime, effectiveDuration)}
                    onChange={(e) => seekTo(parseFloat(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
                  />
                  {sp && sp.temporal.beats.length > 0 && (
                    <div className="flex items-center justify-between gap-1 text-[9px] text-zinc-400 tabular-nums">
                      {sp.temporal.beats.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => seekTo(b.startSec)}
                          className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 hover:border-cyan-500/60 hover:text-cyan-300 truncate transition"
                        >
                          #{b.id} {PHASE_LABELS[b.phase].split(' ')[0]} ({b.startSec.toFixed(1)}s)
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Buttons Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={isPlaying ? 'Pozastavit přehrávání' : 'Přehrát video v kontrole'}
                      data-testid="review-play-toggle"
                      className="flex items-center gap-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-1.5 font-bold text-[11px] transition"
                    >
                      {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                      <span>{isPlaying ? 'Pauza' : 'Přehrát'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => seekTo(currentTime - 2)}
                      aria-label="Posunout zpět o 2 sekundy"
                      className="rounded border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-300 hover:text-white transition"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => seekTo(currentTime + 2)}
                      aria-label="Posunout vpřed o 2 sekundy"
                      className="rounded border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-300 hover:text-white transition"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>

                    <span className="text-[11px] text-zinc-300 px-1.5">
                      {currentTime.toFixed(1)}s / {effectiveDuration.toFixed(1)}s
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={toggleMute}
                      aria-label={isMuted ? 'Zapnout zvuk v kontrole' : 'Ztlumit zvuk v kontrole'}
                      className="rounded border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-300 hover:text-white transition"
                    >
                      {isMuted ? <VolumeX className="h-3.5 w-3.5 text-rose-400" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsLooping(!isLooping)}
                      aria-label="Přepnout smyčku videa"
                      className={`rounded border px-2 py-1 text-[10px] font-bold flex items-center gap-1 transition ${
                        isLooping
                          ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                      }`}
                    >
                      <Repeat className="h-3 w-3" />
                      <span>Loop</span>
                    </button>

                    <div className="flex items-center rounded border border-zinc-800 bg-zinc-950 p-0.5">
                      {[0.5, 1, 1.25, 1.5].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => changeRate(r)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                            playbackRate === r
                              ? 'bg-emerald-500 text-black'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          {r}×
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Technical Metadata, 4-Pillar Prompt Breakdown & Pre-Publish Audit */}
          <div className="lg:col-span-6 space-y-4">
            {/* Technical Specs Grid */}
            <div
              data-testid="asset-review-metadata"
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                <span className="font-bold text-white uppercase text-[11px]">
                  Technická metadata &amp; Stream integrita
                </span>
                <span className="text-[10px] text-zinc-400 tabular-nums">
                  {new Date(asset.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px] tabular-nums">
                <div>
                  <span className="text-[10px] text-zinc-500 block">Rozlišení &amp; Poměr</span>
                  <span className="text-white font-bold">{asset.resolution || aspectRatio}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Velikost souboru</span>
                  <span className="text-white font-bold">{formatBytes(asset.sizeBytes)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Délka &amp; FPS</span>
                  <span className="text-white font-bold">
                    {formatDuration(asset.durationSec || sp?.totalDurationSec)} · {sp?.fps || 30} FPS
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Kodek / Kontejner</span>
                  <span className="text-emerald-300 font-bold">H.264 / AAC MP4</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">Web Streaming</span>
                  <span className={asset.faststartVerified ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold'}>
                    {asset.faststartVerified ? '+faststart ✓' : asset.status || 'queued'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">SHA-256 Checksum</span>
                  {asset.sha256 ? (
                    <button
                      type="button"
                      onClick={handleCopySha}
                      className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                    >
                      <span>{asset.sha256.slice(0, 10)}…</span>
                      {copiedSha ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                  ) : (
                    <span className="text-zinc-500">—</span>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-zinc-300 pt-2 border-t border-zinc-800/70">
                <span className="text-zinc-500">Metadata: </span>
                <span>{asset.meta}</span>
              </div>
            </div>

            {/* 4-Pillar Prompt Breakdown */}
            {sp && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <span className="font-bold text-cyan-300 uppercase text-[11px]">
                    4-pilířová režijní struktura promptu
                  </span>
                  <span className="text-[10px] text-zinc-400">Seed {sp.seed}</span>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div>
                    <span className="text-emerald-400 font-bold">1. Subjekt: </span>
                    <span className="text-zinc-200">{sp.subject.primarySubject} ({sp.subject.environment})</span>
                  </div>
                  <div>
                    <span className="text-cyan-400 font-bold">2. Styl &amp; Optika: </span>
                    <span className="text-zinc-200">
                      {VISUAL_STYLE_PALETTES[sp.style.visualStyle].label} · {OPTICS_LABELS[sp.style.optics].split('(')[0].trim()} · {LIGHTING_LABELS[sp.style.lighting]}
                    </span>
                  </div>
                  <div>
                    <span className="text-amber-400 font-bold">3. Kamera: </span>
                    <span className="text-zinc-200">
                      {CAMERA_MOTION_LABELS[sp.camera.primaryMotion]} (intenzita {sp.camera.motionIntensity}/10)
                    </span>
                  </div>
                  <div>
                    <span className="text-purple-400 font-bold">4. Fáze ({sp.temporal.beats.length}): </span>
                    <span className="text-zinc-300">
                      {sp.temporal.beats.map((b) => `${b.startSec.toFixed(1)}–${b.endSec.toFixed(1)}s ${b.cameraKeyframe}`).join(' → ')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Pre-Publish Monetization & QA Checklist */}
            {audit && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white uppercase text-[11px]">
                    Kontrola před publikací &amp; Monetizace
                  </span>
                  <span
                    className={`font-bold tabular-nums text-[11px] ${
                      audit.is100PercentMonetizable ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {audit.score}/100
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {audit.checks.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start gap-1.5 text-[10px] text-zinc-300 leading-snug"
                    >
                      {c.passed ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <span>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {downloadError && (
              <div className="rounded border border-rose-500/40 bg-rose-950/30 p-2.5 text-[11px] text-rose-300">
                {downloadError}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-5 py-3.5 bg-zinc-900/60">
          <div className="flex flex-wrap items-center gap-2">
            {asset.line === 'video' && (
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 text-[11px] font-bold text-emerald-300 whitespace-nowrap transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Stáhnout MP4</span>
              </button>
            )}

            {onLoadIntoEditor && sp && (
              <button
                type="button"
                onClick={() => {
                  onLoadIntoEditor(asset);
                  onClose();
                }}
                className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-cyan-500/50 hover:text-cyan-300 px-3 py-2 text-[11px] font-bold text-zinc-200 whitespace-nowrap transition"
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Načíst do editoru promptu</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-[11px] font-bold text-zinc-300 hover:text-white whitespace-nowrap transition"
            >
              Zavřít
            </button>
            <button
              type="button"
              data-testid="review-modal-publish-btn"
              disabled={!canPublish}
              onClick={() => {
                onClose();
                onPublishAsset(asset);
              }}
              className="flex items-center gap-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 text-[11px] font-bold whitespace-nowrap disabled:opacity-40 transition"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Publikovat video</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
