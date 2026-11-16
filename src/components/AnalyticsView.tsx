/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Eye,
  Clock,
  Heart,
  MessageSquare,
  Flame,
  ArrowRight,
  Copy,
  Check,
  Users,
  RefreshCw,
  Youtube,
  Music,
  Instagram,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import {
  AnalyticsData,
  AnalyticsMetricSummary,
  PublishedVideoMetric,
  VideoSharingPlatform,
} from '../types/nexus.ts';

interface AnalyticsViewProps {
  onSelectTrendForVideo: (trendTopic: string, templateId?: string) => void;
}

interface AnalyticsApiResponse extends AnalyticsData {
  filteredSummary?: AnalyticsMetricSummary;
  filteredVideos?: PublishedVideoMetric[];
  activePlatformFilter?: 'all' | VideoSharingPlatform;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ onSelectTrendForVideo }) => {
  const [analytics, setAnalytics] = useState<AnalyticsApiResponse | null>(null);
  const [platformFilter, setPlatformFilter] = useState<'all' | VideoSharingPlatform>('all');
  const [selectedTimelineMetric, setSelectedTimelineMetric] = useState<
    'views' | 'watchTimeHours' | 'likes' | 'comments'
  >('views');
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  useEffect(() => {
    fetchAnalytics(platformFilter);
  }, [platformFilter]);

  const fetchAnalytics = async (platform: 'all' | VideoSharingPlatform) => {
    try {
      const res = await fetch(`/v1/analytics?platform=${encodeURIComponent(platform)}`);
      if (res.ok) {
        setAnalytics(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch analytics', err);
    }
  };

  const handleSyncMetrics = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/v1/analytics/sync', { method: 'POST' });
      if (res.ok) {
        await fetchAnalytics(platformFilter);
      }
    } catch (err) {
      console.error('Failed to sync analytics', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyReport = () => {
    if (!analytics) return;
    const activeSummary = analytics.filteredSummary || analytics.summary;
    const report = `# NEXUS X OS · Souhrnný Analytický Report (${platformFilter === 'all' ? 'YouTube + TikTok + Instagram Reels' : platformFilter})
Datum synchronizace: ${new Date(analytics.lastSyncedAt).toLocaleString()}
Celková zhlédnutí: ${activeSummary.totalViews.toLocaleString()}
Celkem lajků: ${activeSummary.totalLikes.toLocaleString()}
Celkem komentářů: ${activeSummary.totalComments.toLocaleString()}
Celková doba sledování: ${activeSummary.totalWatchTimeHours.toLocaleString()} h
Míra zapojení (Engagement): ${activeSummary.engagementRate}%
Průměrná retence: ${activeSummary.avgRetentionRate}%
Odhadované výnosy (projekce): ${activeSummary.estimatedRevenueCzk.toLocaleString()} Kč

## Doporučení pro další tvorbu z dat:
${analytics.contentRecommendations
  .map((r) => `- [${r.platform}] ${r.recommendedTopic} (${r.expectedLift})`)
  .join('\n')}
`;
    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const getPlatformIcon = (platform: VideoSharingPlatform) => {
    if (platform === 'YouTube') return <Youtube className="h-4 w-4 text-rose-500" />;
    if (platform === 'TikTok') return <Music className="h-4 w-4 text-cyan-400" />;
    return <Instagram className="h-4 w-4 text-pink-400" />;
  };

  if (!analytics) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center font-mono text-xs text-zinc-500">
        Načítám data z YouTube, TikTok a Instagram Reels API...
      </div>
    );
  }

  const activeSummary = analytics.filteredSummary || analytics.summary;
  const displayedVideos = analytics.filteredVideos || analytics.publishedVideoPerformance;
  const {
    viewsTimeline,
    retentionCurve,
    demographics,
    viralTrends,
    platformBreakdown,
    contentRecommendations,
  } = analytics;

  const maxMetricVal = Math.max(1, ...viewsTimeline.map((d) => d[selectedTimelineMetric]));

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full bg-zinc-950 p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <p className="font-mono text-xs text-zinc-500">
            YouTube · TikTok · Instagram Reels · Poslední synchronizace {new Date(analytics.lastSyncedAt).toLocaleTimeString()}
          </p>
          <h1 className="text-xl font-bold text-white mt-1">Výkonnostní Analytika & Obsahová smyčka</h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl font-mono">
            Sledování zhlédnutí, lajků, komentářů a doby sledování napříč platformami pro přímé řízení další videotvorby.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Platform Segmented Filter */}
          <div className="flex items-center rounded border border-zinc-800 bg-zinc-900 p-1 font-mono text-xs">
            {(['all', 'YouTube', 'TikTok', 'Instagram Reels'] as const).map((plat) => (
              <button
                key={plat}
                type="button"
                onClick={() => setPlatformFilter(plat)}
                className={`rounded px-2.5 py-1 whitespace-nowrap transition ${
                  platformFilter === plat
                    ? 'bg-emerald-500 text-black font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {plat === 'all' ? 'Všechny platformy' : plat}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSyncMetrics}
            disabled={isSyncing}
            className="flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 font-mono text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Synchronizuji...' : 'Synchronizovat metriky'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-300 hover:text-white whitespace-nowrap transition"
          >
            {copiedReport ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedReport ? 'Report zkopírován' : 'Kopírovat report'}</span>
          </button>
        </div>
      </div>

      {/* 5 Core Performance KPI Cards (Views, Likes, Comments, Watch Time, Retention/Engagement) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 tabular-nums">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
            <span>ZHLÉDNUTÍ</span>
            <Eye className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {activeSummary.totalViews.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] font-mono text-emerald-400">
            Projekce výnosu: {activeSummary.estimatedRevenueCzk.toLocaleString()} Kč
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
            <span>LAJKY</span>
            <Heart className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {activeSummary.totalLikes.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] font-mono text-zinc-400">
            Míra zapojení: {activeSummary.engagementRate}%
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
            <span>KOMENTÁŘE</span>
            <MessageSquare className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {activeSummary.totalComments.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] font-mono text-cyan-400">
            Aktivní diskuse a dotazy
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
            <span>DOBA SLEDOVÁNÍ</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {activeSummary.totalWatchTimeHours.toLocaleString()} h
          </div>
          <div className="mt-1 text-[11px] font-mono text-amber-400">
            Celkový watch time publika
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
            <span>RETENCE & CTR</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {activeSummary.avgRetentionRate}%
          </div>
          <div className="mt-1 text-[11px] font-mono text-zinc-400">
            CTR miniatur: {activeSummary.avgCtr}%
          </div>
        </div>
      </div>

      {/* Platform Comparison Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums">
        {platformBreakdown.map((plat) => (
          <div
            key={plat.platform}
            className={`rounded-lg border p-4 font-mono text-xs space-y-2.5 transition ${
              platformFilter === plat.platform
                ? 'border-emerald-500/60 bg-emerald-950/15'
                : 'border-zinc-800 bg-zinc-900/40'
            }`}
          >
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-2">
                {getPlatformIcon(plat.platform)}
                <span className="font-bold text-white text-sm">{plat.platform}</span>
              </div>
              <span className="text-[11px] text-emerald-400 font-bold">{plat.growth24h}</span>
            </div>

            <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
              <div className="text-zinc-400">Zhlédnutí:</div>
              <div className="text-right font-bold text-white">{plat.views.toLocaleString()}</div>

              <div className="text-zinc-400">Lajky / Komentáře:</div>
              <div className="text-right text-zinc-200">
                {plat.likes.toLocaleString()} / {plat.comments.toLocaleString()}
              </div>

              <div className="text-zinc-400">Watch Time:</div>
              <div className="text-right text-amber-400 font-bold">{plat.watchTimeHours.toLocaleString()} h</div>

              <div className="text-zinc-400">Top formát:</div>
              <div className="text-right text-cyan-400 truncate">{plat.topFormat}</div>
            </div>
          </div>
        ))}
      </div>

      {/* AI Content Creation Loop (Recommendations based on Fetched Performance) */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
          <div>
            <h2 className="font-mono text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <span>DOPORUČENÍ PRO PŘÍŠTÍ TVORBU (NA ZÁKLADĚ METRIK)</span>
            </h2>
            <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
              Analytický engine vyhodnotil watch time, lajky a komentáře vašich videí a navrhl témata s nejvyšším potenciálem.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 font-mono text-xs">
          {contentRecommendations.map((rec) => (
            <div
              key={rec.id}
              className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-zinc-300 font-bold">
                    {getPlatformIcon(rec.platform)}
                    <span>{rec.platform} · {rec.recommendedFormat}</span>
                  </span>
                  <span className="text-emerald-400 font-bold">{rec.expectedLift}</span>
                </div>
                <div className="font-bold text-white text-sm leading-snug">{rec.recommendedTopic}</div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{rec.rationale}</p>
              </div>

              <button
                type="button"
                onClick={() => onSelectTrendForVideo(rec.recommendedTopic, rec.recommendedTemplateId)}
                className="w-full flex items-center justify-center gap-1.5 rounded bg-emerald-500 px-3 py-2 text-xs font-bold text-black hover:bg-emerald-400 transition"
              >
                <span>Vytvořit navazující video</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Published Videos Performance Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
          <h3 className="font-mono text-sm font-bold text-white">
            VÝKONNOST PUBLIKOVANÝCH VIDEÍ ({displayedVideos.length})
          </h3>
          <span className="font-mono text-[11px] text-zinc-400">
            Metriky načteny z YouTube, TikTok & Instagram Reels
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs tabular-nums">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] uppercase text-zinc-400">
                <th className="py-2.5 pr-4">Video</th>
                <th className="py-2.5 px-3">Platforma</th>
                <th className="py-2.5 px-3 text-right">Zhlédnutí</th>
                <th className="py-2.5 px-3 text-right">Lajky</th>
                <th className="py-2.5 px-3 text-right">Komentáře</th>
                <th className="py-2.5 px-3 text-right">Watch Time</th>
                <th className="py-2.5 pl-3 text-right">Retence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {displayedVideos.map((vid) => (
                <tr key={vid.id} className="hover:bg-zinc-900/60 transition">
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-white max-w-md truncate">{vid.title}</div>
                    <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-0.5">
                      <span>{vid.format}</span>
                      <span>·</span>
                      <span>{vid.templateCategory}</span>
                      <span>·</span>
                      <a
                        href={vid.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                      >
                        <span>Odkaz</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-zinc-200">
                      {getPlatformIcon(vid.platform)}
                      <span>{vid.platform}</span>
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-white">
                    {vid.views.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right text-rose-300">
                    {vid.likes.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right text-cyan-300">
                    {vid.comments.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right text-amber-300">
                    {vid.watchTimeHours.toLocaleString()} h
                  </td>
                  <td className="py-3 pl-3 text-right font-bold text-emerald-400">
                    {vid.retentionRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Visualizations Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Views Timeline + Second-by-Second Retention Curve */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
              <div>
                <h3 className="font-mono text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-400" />
                  <span>VÝVOJ METRIK V ČASE (14 DNÍ)</span>
                </h3>
                <p className="text-[11px] text-zinc-500 font-mono">
                  Denní dynamika sledovanosti, lajků, komentářů a watch time.
                </p>
              </div>

              <div className="flex items-center rounded border border-zinc-800 bg-zinc-950 p-0.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setSelectedTimelineMetric('views')}
                  className={`rounded px-2 py-1 ${
                    selectedTimelineMetric === 'views' ? 'bg-zinc-800 text-emerald-400 font-bold' : 'text-zinc-400'
                  }`}
                >
                  Zhlédnutí
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTimelineMetric('likes')}
                  className={`rounded px-2 py-1 ${
                    selectedTimelineMetric === 'likes' ? 'bg-zinc-800 text-rose-400 font-bold' : 'text-zinc-400'
                  }`}
                >
                  Lajky
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTimelineMetric('comments')}
                  className={`rounded px-2 py-1 ${
                    selectedTimelineMetric === 'comments' ? 'bg-zinc-800 text-cyan-400 font-bold' : 'text-zinc-400'
                  }`}
                >
                  Komentáře
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTimelineMetric('watchTimeHours')}
                  className={`rounded px-2 py-1 ${
                    selectedTimelineMetric === 'watchTimeHours' ? 'bg-zinc-800 text-amber-400 font-bold' : 'text-zinc-400'
                  }`}
                >
                  Watch (h)
                </button>
              </div>
            </div>

            <div className="h-48 w-full pt-4 tabular-nums">
              <div className="flex h-36 items-end justify-between gap-1.5 px-2">
                {viewsTimeline.map((item, idx) => {
                  const val = item[selectedTimelineMetric];
                  const heightPercent = Math.max(12, Math.round((val / maxMetricVal) * 100));
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="text-[9px] font-mono text-zinc-400 opacity-0 group-hover:opacity-100 transition">
                        {val.toLocaleString()}
                      </div>
                      <div
                        style={{ height: `${heightPercent}%` }}
                        className={`w-full rounded-t transition-all group-hover:brightness-125 ${
                          selectedTimelineMetric === 'views'
                            ? 'bg-gradient-to-t from-emerald-950 to-emerald-500'
                            : selectedTimelineMetric === 'likes'
                              ? 'bg-gradient-to-t from-rose-950 to-rose-500'
                              : selectedTimelineMetric === 'comments'
                                ? 'bg-gradient-to-t from-cyan-950 to-cyan-500'
                                : 'bg-gradient-to-t from-amber-950 to-amber-500'
                        }`}
                      />
                      <span className="text-[9px] font-mono text-zinc-500 mt-1 whitespace-nowrap">
                        {item.date.split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Second-by-Second Viewer Retention Curve */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
            <div className="border-b border-zinc-800/80 pb-3">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-sm font-bold text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-cyan-400" />
                  <span>DOBA UDRŽENÍ DIVÁKŮ (RETENTION CURVE 0–42 s)</span>
                </h3>
                <span className="font-mono text-[11px] text-cyan-400 font-bold">
                  ŠPIČKA: 118 % (HOOK)
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                Vteřinová analýza zájmu. Hodnoty nad 100 % značí opětovné zhlédnutí a opakování smyčky.
              </p>
            </div>

            <div className="space-y-2 font-mono text-xs">
              <div className="relative h-28 w-full border-b border-zinc-800 flex items-end">
                {retentionCurve.map((point, idx) => {
                  const xPercent = (point.second / 42) * 100;
                  const yPercent = (point.retentionPercent / 125) * 100;
                  return (
                    <div
                      key={idx}
                      style={{ left: `${Math.min(94, Math.max(1, xPercent))}%`, bottom: `${yPercent}%` }}
                      className="absolute flex flex-col items-center group cursor-pointer"
                    >
                      <div
                        className={`h-2.5 w-2.5 rounded-full border-2 ${
                          point.event
                            ? 'bg-amber-400 border-amber-300 ring-2 ring-amber-400/30'
                            : 'bg-emerald-400 border-emerald-300'
                        }`}
                      />
                      <div className="absolute bottom-4 hidden group-hover:flex flex-col items-center bg-zinc-950 border border-zinc-800 p-1.5 rounded shadow-xl whitespace-nowrap z-20 text-[10px]">
                        <span className="font-bold text-white">{point.second}s: {point.retentionPercent}%</span>
                        {point.event && <span className="text-amber-400">{point.event}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 tabular-nums">
                <div className="rounded border border-zinc-800/80 bg-zinc-950/60 p-2.5">
                  <span className="text-[10px] uppercase text-emerald-400 font-bold block">0–3s Hook Retention</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">118 %</span>
                  <span className="text-[10px] text-zinc-500">Dramatický text + glitch efekt eliminuje odchod</span>
                </div>
                <div className="rounded border border-zinc-800/80 bg-zinc-950/60 p-2.5">
                  <span className="text-[10px] uppercase text-cyan-400 font-bold block">15s Pattern Interrupt</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">+14 % oživení</span>
                  <span className="text-[10px] text-zinc-500">Meme zvrat a konfety obnovují křivku zájmu</span>
                </div>
                <div className="rounded border border-zinc-800/80 bg-zinc-950/60 p-2.5">
                  <span className="text-[10px] uppercase text-amber-400 font-bold block">40–42s Seamless Loop</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">88 % smyčka</span>
                  <span className="text-[10px] text-zinc-500">Poslední věta navazuje na první bez ticha</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Viral Trends Radar & Demographics */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
            <div className="border-b border-zinc-800/80 pb-2.5">
              <h3 className="font-mono text-sm font-bold text-white flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-rose-500" />
                <span>VIRÁLNÍ RADAR (TRENDING TOPICS)</span>
              </h3>
              <p className="text-[11px] text-zinc-500 font-mono">
                Breakout témata napříč YouTube Shorts, TikTok a Instagram Reels.
              </p>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              {viralTrends.map((trend) => (
                <div
                  key={trend.id}
                  className="rounded-lg border border-zinc-800/90 bg-zinc-950/70 p-3.5 space-y-2 hover:border-emerald-500/40 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">{trend.keyword}</span>
                    <span className="text-[11px] font-bold text-rose-400 tabular-nums">
                      {trend.growth24h}
                    </span>
                  </div>

                  <div className="text-[11px] text-zinc-400 leading-snug">
                    <span className="text-emerald-400">Doporučený hook:</span> &quot;{trend.suggestedHook}&quot;
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px] text-zinc-500">
                    <span>Objem: {trend.searchVolume} · {trend.platform}</span>

                    <button
                      type="button"
                      onClick={() => onSelectTrendForVideo(trend.keyword)}
                      className="flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-emerald-400 font-bold hover:bg-emerald-500/20 transition"
                    >
                      <span>Vytvořit video</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-4 font-mono text-xs tabular-nums">
            <div className="border-b border-zinc-800/80 pb-2.5">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-400" />
                <span>DEMOGRAFIE PUBLIKA</span>
              </h3>
              <p className="text-[11px] text-zinc-500">
                Pohlaví: 68% Muži · 32% Ženy | Věk: dominantní 18–34 let (80%).
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] uppercase text-zinc-400">Věkové kategorie:</span>
              {demographics.ageGroups.map((g, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-[11px] text-zinc-300">
                    <span>{g.label}</span>
                    <span className="font-bold text-white">{g.percent}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800 rounded overflow-hidden">
                    <div
                      style={{ width: `${g.percent}%` }}
                      className="h-full bg-emerald-500 rounded"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
              <span className="text-[11px] uppercase text-zinc-400">Top země:</span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {demographics.topCountries.map((c, idx) => (
                  <div key={idx} className="rounded border border-zinc-800 bg-zinc-950 p-2 flex items-center justify-between">
                    <span className="text-zinc-300">{c.country} ({c.code})</span>
                    <span className="font-bold text-emerald-400">{c.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
