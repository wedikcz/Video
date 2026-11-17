/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Film,
  Download,
  Copy,
  Check,
  Search,
  Sparkles,
  RefreshCw,
  Code2,
  Share2,
  LayoutGrid,
  List,
  ShieldCheck,
  X,
  CheckCircle2,
  AlertCircle,
  Play,
  FileText,
  HardDrive,
  Clock,
  Hash,
} from 'lucide-react';
import { FactoryAsset, TeamMember, VideoTemplateCategory } from '../types/nexus.ts';
import { downloadVideoAsset, formatBytes, formatDuration } from '../utils/mediaDownload.ts';

interface MediaVaultViewProps {
  assets: FactoryAsset[];
  focusedAssetId?: string | null;
  onClearFocusedAsset?: () => void;
  onRefreshAssets: () => Promise<void> | void;
  onOpenPublish?: (
    videoTitle?: string,
    format?: '9:16' | '16:9',
    category?: VideoTemplateCategory
  ) => void;
  currentActor?: TeamMember;
}

export const MediaVaultView: React.FC<MediaVaultViewProps> = ({
  assets,
  focusedAssetId,
  onClearFocusedAsset,
  onRefreshAssets,
  onOpenPublish,
  currentActor,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | '9:16' | '16:9'>('all');
  const [threadFilter, setThreadFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(focusedAssetId || null);
  const [detailedAsset, setDetailedAsset] = useState<FactoryAsset | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inspectedAsset, setInspectedAsset] = useState<FactoryAsset | null>(null);
  const [quickPrompt, setQuickPrompt] = useState('');
  const [quickFormat, setQuickFormat] = useState<'9:16' | '16:9'>('9:16');
  const [isRendering, setIsRendering] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [playerState, setPlayerState] = useState<'loading' | 'ready' | 'error'>('loading');
  const persistentVideoRef = useRef<HTMLVideoElement>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [previewFailedMap, setPreviewFailedMap] = useState<Record<string, boolean>>({});
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const handleCardMouseEnter = (assetId: string) => {
    setHoveredCardId(assetId);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    // Debounce preview activation (180ms) to avoid spamming network when skimming cards
    hoverTimerRef.current = setTimeout(() => {
      setActivePreviewId(assetId);
    }, 180);
  };

  const handleCardMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredCardId(null);
    setActivePreviewId(null);
  };

  const canCreateVideos = !currentActor || currentActor.permissions.includes('create_edit_videos');
  const canPublish = !currentActor || currentActor.permissions.includes('publish_videos');

  const videoAssets = useMemo(
    () =>
      assets
        .filter((a) => a.line === 'video')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [assets]
  );

  useEffect(() => {
    if (focusedAssetId) {
      setSelectedAssetId(focusedAssetId);
    }
  }, [focusedAssetId]);

  useEffect(() => {
    if (videoAssets.length === 0) {
      setSelectedAssetId(null);
      return;
    }
    if (!selectedAssetId || !videoAssets.some((a) => a.id === selectedAssetId)) {
      setSelectedAssetId(videoAssets[0].id);
    }
  }, [videoAssets, selectedAssetId]);

  const activeAsset = useMemo(() => {
    if (!selectedAssetId) return videoAssets[0] || null;
    const base = videoAssets.find((a) => a.id === selectedAssetId) || videoAssets[0] || null;
    if (base && detailedAsset && detailedAsset.id === base.id) {
      return { ...base, ...detailedAsset };
    }
    return base;
  }, [videoAssets, selectedAssetId, detailedAsset]);

  // Hydrate full metadata & SHA-256 checksum from GET /api/v1/assets/{asset_id}
  useEffect(() => {
    if (!selectedAssetId) return;
    let cancelled = false;
    setPlayerState('loading');

    fetch(`/api/v1/assets/${selectedAssetId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FactoryAsset | null) => {
        if (!cancelled && data) {
          setDetailedAsset(data);
        }
      })
      .catch(() => {
        // Keep base asset state if detail fetch fails transiently
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAssetId]);

  const threadOptions = useMemo(() => {
    const ids = new Set<string>();
    videoAssets.forEach((a) => {
      if (a.threadId) ids.add(a.threadId);
    });
    return Array.from(ids);
  }, [videoAssets]);

  const filteredVideos = useMemo(() => {
    return videoAssets.filter((asset) => {
      const ratio =
        asset.resolution === '1280x720'
          ? '16:9'
          : asset.resolution === '720x1280'
            ? '9:16'
            : asset.videoStoryboard?.aspectRatio || '9:16';
      if (formatFilter !== 'all' && ratio !== formatFilter) return false;
      if (threadFilter !== 'all' && asset.threadId !== threadFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${asset.title} ${asset.prompt || ''} ${asset.meta} ${asset.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [videoAssets, formatFilter, threadFilter, searchQuery]);

  const totalSizeBytes = useMemo(
    () => videoAssets.reduce((sum, a) => sum + (a.sizeBytes || 0), 0),
    [videoAssets]
  );

  useEffect(() => {
    if (!focusedAssetId) return;
    const el = document.querySelector(`[data-asset-id="${focusedAssetId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focusedAssetId, filteredVideos.length]);

  const handleSelectAndPlay = (asset: FactoryAsset) => {
    setSelectedAssetId(asset.id);
    setTimeout(() => {
      persistentVideoRef.current?.play().catch(() => {
        // Autoplay may require gesture if invoked programmatically
      });
    }, 80);
  };

  const handleDownload = async (asset: FactoryAsset) => {
    setDownloadingId(asset.id);
    setStatusFeedback(null);
    try {
      await downloadVideoAsset(asset);
      setStatusFeedback({ type: 'ok', text: `MP4 soubor pro "${asset.title}" byl stažen.` });
    } catch (err: any) {
      setStatusFeedback({ type: 'err', text: err.message || 'Stažení selhalo.' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopyStreamLink = async (asset: FactoryAsset) => {
    const streamPath = asset.streamUrl || `/api/v1/assets/${asset.id}/stream`;
    const fullUrl = `${window.location.origin}${streamPath}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setStatusFeedback({ type: 'err', text: 'Kopírování odkazu do schránky selhalo.' });
    }
  };

  const handleQuickRender = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPrompt.trim() || isRendering) return;
    setIsRendering(true);
    setStatusFeedback(null);

    try {
      const res = await fetch('/api/v1/assets/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: quickPrompt.trim(),
          format: quickFormat,
          threadId: 'th-main-001',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusFeedback({ type: 'err', text: data.error || 'Render selhal.' });
        return;
      }
      setQuickPrompt('');
      await onRefreshAssets();
      if (data.asset?.id) {
        setSelectedAssetId(data.asset.id);
      }
      setStatusFeedback({
        type: 'ok',
        text: `Nové MP4 video "${data.asset.title}" bylo vyrenderováno a uloženo do trezoru.`,
      });
    } catch {
      setStatusFeedback({ type: 'err', text: 'Chyba při komunikaci s render workerem.' });
    } finally {
      setIsRendering(false);
    }
  };

  const activeAspect =
    activeAsset?.resolution === '1280x720'
      ? '16:9'
      : activeAsset?.resolution === '720x1280'
        ? '9:16'
        : activeAsset?.videoStoryboard?.aspectRatio || '9:16';
  const activeStreamUrl = activeAsset
    ? activeAsset.streamUrl || `/api/v1/assets/${activeAsset.id}/stream`
    : '';
  const activeDownloadUrl = activeAsset
    ? activeAsset.downloadUrl || `/api/v1/assets/${activeAsset.id}/download`
    : '';

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full bg-zinc-950 p-4 sm:p-6 space-y-6" data-testid="media-vault-view">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <p className="font-mono text-xs text-emerald-400 uppercase tracking-wider">
            MEDIA VAULT · CENTRÁLNÍ ÚLOŽIŠTĚ MP4 VÝSTUPŮ
          </p>
          <h1 className="text-xl font-bold text-white mt-1">Vygenerovaná videa & Okamžité stažení</h1>
          <p className="text-xs text-zinc-400 mt-1 font-mono max-w-2xl">
            Perzistentní HTML5 přehrávač s HTTP Byte-Range streamem (206 Partial Content), dedikovaným panelem metadat, SHA-256 kontrolou a přímým MP4 stažením.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
          <div className="rounded border border-zinc-800 bg-zinc-900/70 px-3 py-1.5">
            <span className="text-zinc-500">MP4 V TREZORU:</span>{' '}
            <span className="font-bold text-white">{videoAssets.length}</span>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-900/70 px-3 py-1.5">
            <span className="text-zinc-500">VELIKOST:</span>{' '}
            <span className="font-bold text-emerald-400">{formatBytes(totalSizeBytes)}</span>
          </div>
          <button
            type="button"
            onClick={() => onRefreshAssets()}
            className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:text-white hover:border-zinc-700 transition"
          >
            <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
            <span>Obnovit trezor</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {statusFeedback && (
        <div
          className={`flex items-center justify-between gap-2 rounded-lg border p-3 font-mono text-xs ${
            statusFeedback.type === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/40 bg-rose-950/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusFeedback.type === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            )}
            <span>{statusFeedback.text}</span>
          </div>
          <button
            type="button"
            aria-label="Zavřít oznámení"
            onClick={() => setStatusFeedback(null)}
            className="text-zinc-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Persistent HTML5 Range Video Player + Dedicated Metadata Sidebar */}
      {activeAsset && (
        <section
          aria-label="Hlavní přehrávač a metadata vybraného videa"
          className="grid grid-cols-1 lg:grid-cols-12 gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
        >
          {/* Persistent HTML5 <video> Player */}
          <div className="lg:col-span-7 bg-black flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-zinc-800">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/90 font-mono text-[11px]">
              <div className="flex items-center gap-2">
                <Film className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-bold text-white uppercase">PERZISTENTNÍ HTML5 RANGE PŘEHRÁVAČ</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[10px] text-cyan-400">
                  HTTP 206 Range Stream
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    playerState === 'ready'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : playerState === 'error'
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {playerState === 'ready' ? 'STREAM READY' : playerState === 'error' ? 'CHYBA STREAMU' : 'NAČÍTÁNÍ'}
                </span>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-3 bg-black min-h-[280px] sm:min-h-[340px] relative">
              <video
                ref={persistentVideoRef}
                key={activeAsset.id}
                data-testid="vault-persistent-player"
                controls
                loop
                playsInline
                preload="metadata"
                poster={`${activeStreamUrl}?format=poster`}
                src={activeStreamUrl}
                aria-label={`Hlavní přehrávač: ${activeAsset.title}`}
                onLoadedMetadata={() => setPlayerState('ready')}
                onCanPlay={() => setPlayerState('ready')}
                onError={() => setPlayerState('error')}
                className="w-full max-h-[360px] object-contain rounded bg-black"
              >
                <source src={activeStreamUrl} type="video/mp4" />
              </video>

              {playerState === 'error' && (
                <div className="mt-2 flex items-center gap-2 rounded border border-rose-500/40 bg-rose-950/60 px-3 py-1.5 font-mono text-[11px] text-rose-200">
                  <span>Stream se nepodařilo načíst.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPlayerState('loading');
                      persistentVideoRef.current?.load();
                    }}
                    className="rounded bg-rose-500 px-2 py-0.5 font-bold text-black hover:bg-rose-400"
                  >
                    Zkusit znovu
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-zinc-800/80 bg-zinc-950/90 font-mono text-[11px] text-zinc-400">
              <span className="truncate max-w-md text-zinc-300">{activeStreamUrl}</span>
              <span className="tabular-nums">
                {activeAspect} · {activeAsset.resolution || (activeAspect === '16:9' ? '1280x720' : '720x1280')} · {formatDuration(activeAsset.durationSec || 6)}
              </span>
            </div>
          </div>

          {/* Dedicated Metadata Sidebar */}
          <aside
            data-testid="vault-metadata-sidebar"
            aria-label="Metadata vybraného videa"
            className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between gap-4 font-mono text-xs bg-zinc-950/60"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
                    DEDIKOVANÁ METADATA ASSETU
                  </span>
                  <h2 className="font-sans text-base font-bold text-white mt-0.5 leading-snug">
                    {activeAsset.title}
                  </h2>
                </div>
                <span className="shrink-0 rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                  {activeAsset.status || 'ready'}
                </span>
              </div>

              {activeAsset.prompt && (
                <div className="rounded border border-zinc-800/80 bg-zinc-900/40 p-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase mb-1">
                    <FileText className="h-3 w-3 text-cyan-400" />
                    <span>Zadání / Prompt</span>
                  </div>
                  <p className="text-zinc-200 leading-relaxed">{activeAsset.prompt}</p>
                </div>
              )}

              <dl className="grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                <div className="rounded border border-zinc-800/80 bg-zinc-900/30 p-2">
                  <dt className="text-[10px] text-zinc-500 flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    <span>ASSET ID / VLÁKNO</span>
                  </dt>
                  <dd className="text-zinc-200 font-semibold mt-0.5 truncate">
                    {activeAsset.id} · {activeAsset.threadId || 'th-main-001'}
                  </dd>
                </div>

                <div className="rounded border border-zinc-800/80 bg-zinc-900/30 p-2">
                  <dt className="text-[10px] text-zinc-500 flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    <span>VELIKOST & MIME</span>
                  </dt>
                  <dd className="text-zinc-200 font-semibold mt-0.5">
                    {formatBytes(activeAsset.sizeBytes)} · {activeAsset.mimeType || 'video/mp4'}
                  </dd>
                </div>

                <div className="rounded border border-zinc-800/80 bg-zinc-900/30 p-2">
                  <dt className="text-[10px] text-zinc-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>DÉLKA & ROZLIŠENÍ</span>
                  </dt>
                  <dd className="text-zinc-200 font-semibold mt-0.5">
                    {formatDuration(activeAsset.durationSec || 6)} · {activeAsset.resolution || '720x1280'}
                  </dd>
                </div>

                <div className="rounded border border-zinc-800/80 bg-zinc-900/30 p-2">
                  <dt className="text-[10px] text-zinc-500">VYTVOŘENO / REŽIM</dt>
                  <dd className="text-zinc-200 font-semibold mt-0.5">
                    {new Date(activeAsset.createdAt).toLocaleString()} · {activeAsset.dryRun ? 'DRY-RUN' : 'LIVE'}
                  </dd>
                </div>
              </dl>

              <div className="rounded border border-zinc-800/80 bg-zinc-900/30 p-2.5 space-y-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>SHA-256 CHECKSUM & ENDPOINTY</span>
                </div>
                <div className="text-zinc-400 break-all">
                  <span className="text-zinc-500">SHA-256:</span>{' '}
                  {activeAsset.sha256 || 'Ověřuje se z úložiště...'}
                </div>
                <div className="text-zinc-400 truncate">
                  <span className="text-zinc-500">Download API:</span> {activeDownloadUrl}
                </div>
                <div className="text-zinc-400 flex items-center justify-between gap-1">
                  <span className="truncate">
                    <span className="text-zinc-500">Preview API:</span>{' '}
                    <span className="text-cyan-400 font-mono">/api/v1/assets/{activeAsset.id}/preview</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePreviewId((prev) => (prev === activeAsset.id ? null : activeAsset.id));
                    }}
                    className="shrink-0 text-[10px] text-emerald-400 hover:text-emerald-300 font-bold underline"
                  >
                    {activePreviewId === activeAsset.id ? 'Vypnout náhled' : 'Vyzkoušet'}
                  </button>
                </div>
              </div>

              {activeAsset.videoBrief && (
                <div className="rounded border border-cyan-500/25 bg-cyan-950/15 p-2.5 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between text-cyan-400 font-bold text-[10px]">
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>AI VIDEO DIRECTOR BRIEF</span>
                    </span>
                    <span className="text-zinc-400 font-normal">{activeAsset.videoBrief.engineUsed}</span>
                  </div>
                  <div className="text-zinc-300">
                    Styl: <span className="text-white">{activeAsset.videoBrief.visualStyle}</span> · Tón:{' '}
                    <span className="text-white">{activeAsset.videoBrief.tone}</span> · {activeAsset.videoBrief.bpm} BPM
                  </div>
                  <div className="text-zinc-400 truncate">
                    Publikum: {activeAsset.videoBrief.audience}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                data-testid={`sidebar-download-${activeAsset.id}`}
                disabled={downloadingId === activeAsset.id}
                onClick={() => handleDownload(activeAsset)}
                className="flex items-center justify-center gap-1.5 rounded bg-emerald-500 px-3 py-2 font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{downloadingId === activeAsset.id ? 'Stahuji MP4...' : 'Stáhnout MP4'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleCopyStreamLink(activeAsset)}
                className="flex items-center justify-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200 hover:text-white transition"
              >
                {copiedId === activeAsset.id ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Odkaz zkopírován</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Kopírovat odkaz</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setInspectedAsset(activeAsset)}
                className="flex items-center justify-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-300 hover:text-cyan-300 transition"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>Scénář / MoviePy</span>
              </button>

              {onOpenPublish && (
                <button
                  type="button"
                  disabled={!canPublish}
                  onClick={() =>
                    onOpenPublish(
                      activeAsset.title,
                      activeAspect,
                      activeAsset.videoStoryboard?.templateCategory || 'viral_hook'
                    )
                  }
                  className="flex items-center justify-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-300 hover:text-emerald-300 disabled:opacity-40 transition"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Publikovat</span>
                </button>
              )}
            </div>
          </aside>
        </section>
      )}

      {/* Direct Quick Render Bar */}
      <form
        onSubmit={handleQuickRender}
        className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 flex flex-col md:flex-row items-stretch md:items-center gap-2.5 font-mono text-xs"
      >
        <div className="flex items-center gap-2 text-emerald-400 font-bold shrink-0">
          <Sparkles className="h-4 w-4" />
          <span>RYCHLÝ MP4 RENDER:</span>
        </div>
        <input
          type="text"
          aria-label="Zadání nového MP4 videa"
          value={quickPrompt}
          onChange={(e) => setQuickPrompt(e.target.value)}
          placeholder="Zadejte téma videa (např. 'AI automatizace faktur za 60 sekund')..."
          className="flex-1 rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
        />
        <select
          aria-label="Formát rychlého renderu"
          value={quickFormat}
          onChange={(e) => setQuickFormat(e.target.value as '9:16' | '16:9')}
          className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500/50"
        >
          <option value="9:16">9:16 Vertikální (Shorts/TikTok)</option>
          <option value="16:9">16:9 Širokoúhlé (YouTube)</option>
        </select>
        <button
          type="submit"
          disabled={!canCreateVideos || isRendering || !quickPrompt.trim()}
          className="flex items-center justify-center gap-1.5 rounded bg-emerald-500 px-4 py-2 font-bold text-black hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
        >
          {isRendering ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>RENDERUJI H.264 MP4...</span>
            </>
          ) : (
            <>
              <Film className="h-3.5 w-3.5" />
              <span>VYRENDEROVAT MP4</span>
            </>
          )}
        </button>
      </form>

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            <input
              type="search"
              aria-label="Hledat v Media Vaultu"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat podle názvu, ID nebo tématu..."
              className="rounded border border-zinc-800 bg-zinc-900 pl-8 pr-3 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 w-64"
            />
          </div>

          <select
            aria-label="Filtrovat podle formátu"
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value as 'all' | '9:16' | '16:9')}
            className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-zinc-300 focus:outline-none"
          >
            <option value="all">Všechny formáty</option>
            <option value="9:16">9:16 Shorts / TikTok / Reels</option>
            <option value="16:9">16:9 YouTube Landscape</option>
          </select>

          {threadOptions.length > 0 && (
            <select
              aria-label="Filtrovat podle vlákna"
              value={threadFilter}
              onChange={(e) => setThreadFilter(e.target.value)}
              className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-zinc-300 focus:outline-none"
            >
              <option value="all">Všechna vlákna</option>
              {threadOptions.map((tid) => (
                <option key={tid} value={tid}>
                  Vlákno: {tid}
                </option>
              ))}
            </select>
          )}

          {focusedAssetId && onClearFocusedAsset && (
            <button
              type="button"
              onClick={onClearFocusedAsset}
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-300 hover:bg-emerald-500/20"
            >
              Zrušit zvýraznění ({focusedAssetId})
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 p-0.5 self-start md:self-auto">
          <button
            type="button"
            aria-label="Mřížka videí"
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 ${
              viewMode === 'grid' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Mřížka</span>
          </button>
          <button
            type="button"
            aria-label="Seznam videí"
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1 rounded px-2.5 py-1 ${
              viewMode === 'list' ? 'bg-zinc-800 text-white font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>Seznam</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filteredVideos.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center font-mono text-xs space-y-2">
          <Film className="h-8 w-8 text-zinc-600 mx-auto" />
          <div className="text-sm font-bold text-zinc-200">Žádné video neodpovídá filtru</div>
          <p className="text-zinc-400">
            Zadejte téma do horní lišty nebo v NEO Chatu vyžádejte &quot;Spusť MoviePy render do MP4&quot;.
          </p>
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
              : 'flex flex-col gap-3'
          }
        >
          {filteredVideos.map((asset) => {
            const isSelected = activeAsset?.id === asset.id;
            const isFocused = focusedAssetId === asset.id;
            const aspect =
              asset.resolution === '1280x720'
                ? '16:9'
                : asset.resolution === '720x1280'
                  ? '9:16'
                  : asset.videoStoryboard?.aspectRatio || '9:16';

            return (
              <article
                key={asset.id}
                data-testid="vault-video-card"
                data-asset-id={asset.id}
                onMouseEnter={() => handleCardMouseEnter(asset.id)}
                onMouseLeave={handleCardMouseLeave}
                className={`rounded-xl border bg-zinc-900/60 overflow-hidden transition-all duration-200 flex ${
                  viewMode === 'list' ? 'flex-col md:flex-row' : 'flex-col'
                } ${
                  isSelected || isFocused
                    ? 'border-emerald-400 ring-2 ring-emerald-500/25 shadow-lg shadow-emerald-950/30'
                    : activePreviewId === asset.id
                      ? 'border-emerald-500/60 ring-1 ring-emerald-500/30 shadow-md shadow-emerald-950/20'
                      : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Lightweight Poster Frame + Hover Transient Video Snippet Preview */}
                <div
                  className={`relative bg-black overflow-hidden shrink-0 border-zinc-800 group/thumb ${
                    viewMode === 'list' ? 'md:w-48 h-36 md:h-auto border-b md:border-b-0 md:border-r' : 'w-full h-36 sm:h-40 border-b'
                  }`}
                >
                  <img
                    src={asset.posterUrl || `/api/v1/assets/${asset.id}/stream?format=poster`}
                    alt={`Náhled videa ${asset.title}`}
                    loading="lazy"
                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                      activePreviewId === asset.id && !previewFailedMap[asset.id] ? 'opacity-30' : 'opacity-90'
                    }`}
                  />

                  {/* Transient Video Snippet Overlay on Hover */}
                  {activePreviewId === asset.id && !previewFailedMap[asset.id] && (
                    <div className="absolute inset-0 z-10 bg-black flex items-center justify-center">
                      <video
                        data-testid={`vault-hover-preview-video-${asset.id}`}
                        src={asset.previewUrl || `/v1/preview/${asset.id}`}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        aria-label={`Živý náhled videa ${asset.title}`}
                        className="w-full h-full object-cover"
                        onError={() => {
                          setPreviewFailedMap((prev) => ({ ...prev, [asset.id]: true }));
                        }}
                      />
                    </div>
                  )}

                  {/* Live Preview Indicator or Hover Cue */}
                  {activePreviewId === asset.id && !previewFailedMap[asset.id] ? (
                    <span
                      data-testid={`preview-badge-${asset.id}`}
                      className="absolute top-2 left-2 z-20 flex items-center gap-1.5 rounded-full bg-black/85 border border-emerald-500/70 px-2 py-0.5 font-mono text-[9px] text-emerald-400 font-bold backdrop-blur-md shadow-lg shadow-emerald-950/50"
                    >
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      <span>HOVER PREVIEW</span>
                    </span>
                  ) : (
                    <span className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded bg-black/70 border border-zinc-800/80 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400 opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-200">
                      <Play className="h-2 w-2 text-zinc-400 fill-zinc-400" />
                      <span>Hover náhled</span>
                    </span>
                  )}

                  <span className="absolute bottom-2 right-2 z-20 rounded bg-black/80 border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-200 tabular-nums">
                    {aspect} · {formatDuration(asset.durationSec || 6)}
                  </span>
                </div>

                {/* Metadata & Actions */}
                <div className="flex-1 p-4 flex flex-col justify-between gap-3 font-mono text-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-sans text-sm font-bold text-white leading-snug line-clamp-2">
                        {asset.title}
                      </h3>
                      <span className="shrink-0 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-400 uppercase">
                        {asset.dryRun ? 'DRY-RUN' : asset.status || 'ready'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400 tabular-nums">
                      <span>{aspect}</span>
                      <span>{formatDuration(asset.durationSec || 6)}</span>
                      <span>{asset.resolution || (aspect === '16:9' ? '1280x720' : '720x1280')}</span>
                      <span>{formatBytes(asset.sizeBytes)}</span>
                      <span className="text-zinc-500">{asset.id}</span>
                    </div>

                    {asset.videoStoryboard?.hook && (
                      <p className="text-[11px] text-zinc-400 line-clamp-2">
                        Hook: {asset.videoStoryboard.hook}
                      </p>
                    )}
                  </div>

                  {/* Primary Action Row */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-800/80">
                    <button
                      type="button"
                      data-testid={`vault-play-${asset.id}`}
                      onClick={() => handleSelectAndPlay(asset)}
                      className={`flex items-center gap-1 rounded px-2.5 py-1.5 font-bold transition ${
                        isSelected
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-zinc-800 text-white hover:bg-zinc-700'
                      }`}
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>{isSelected ? 'Aktivní' : 'Přehrát'}</span>
                    </button>

                    <button
                      type="button"
                      data-testid={`vault-preview-toggle-${asset.id}`}
                      onClick={() => {
                        setActivePreviewId((prev) => (prev === asset.id ? null : asset.id));
                      }}
                      className={`flex items-center gap-1 rounded px-2 py-1.5 text-[11px] transition ${
                        activePreviewId === asset.id
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                      title="Zobrazit nebo skrýt transient video náhled"
                    >
                      <Film className="h-3 w-3 text-emerald-400" />
                      <span>{activePreviewId === asset.id ? 'Náhled aktivní' : 'Náhled'}</span>
                    </button>

                    <button
                      type="button"
                      data-testid={`vault-download-${asset.id}`}
                      disabled={downloadingId === asset.id}
                      onClick={() => handleDownload(asset)}
                      className="flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{downloadingId === asset.id ? 'Stahuji...' : 'Stáhnout MP4'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyStreamLink(asset)}
                      className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-zinc-300 hover:text-white hover:border-zinc-600 transition"
                    >
                      {copiedId === asset.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Zkopírováno</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Odkaz</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectedAsset(asset)}
                      className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-zinc-300 hover:text-cyan-300 hover:border-cyan-500/40 transition"
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      <span>MoviePy</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Storyboard & MoviePy Code Inspector Modal */}
      {inspectedAsset && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Inspekce scénáře a MoviePy kódu"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono text-xs"
        >
          <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <div className="text-[10px] uppercase text-emerald-400">MEDIA VAULT INSPECTOR</div>
                <h3 className="font-sans text-base font-bold text-white mt-0.5">{inspectedAsset.title}</h3>
              </div>
              <button
                type="button"
                aria-label="Zavřít inspekci"
                onClick={() => setInspectedAsset(null)}
                className="rounded p-1 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {inspectedAsset.videoStoryboard && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase text-cyan-400">
                  Storyboard ({inspectedAsset.videoStoryboard.scenes.length} scén)
                </div>
                <div className="space-y-1.5">
                  {inspectedAsset.videoStoryboard.scenes.map((sc) => (
                    <div key={sc.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-2.5">
                      <div className="flex items-center justify-between text-emerald-400 font-bold">
                        <span>Scéna #{sc.id} · {sc.timeRange}</span>
                        <span className="text-zinc-500">{sc.durationSec}s</span>
                      </div>
                      <p className="text-zinc-200 mt-1">{sc.visual}</p>
                      <p className="text-zinc-400 mt-0.5">Titulek: &quot;{sc.kineticText}&quot;</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inspectedAsset.moviePyScript && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase text-emerald-400">MoviePy 2.x Render Skript</div>
                <pre className="rounded border border-zinc-800 bg-black p-3 text-[11px] text-emerald-400/90 overflow-x-auto max-h-60 whitespace-pre-wrap">
                  {inspectedAsset.moviePyScript}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => handleDownload(inspectedAsset)}
                className="flex items-center gap-1.5 rounded bg-emerald-500 px-3.5 py-1.5 font-bold text-black hover:bg-emerald-400"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Stáhnout MP4</span>
              </button>
              <button
                type="button"
                onClick={() => setInspectedAsset(null)}
                className="rounded border border-zinc-800 bg-zinc-900 px-3.5 py-1.5 text-zinc-300 hover:text-white"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
