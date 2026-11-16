/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AnalyticsData,
  AnalyticsMetricSummary,
  ContentRecommendation,
  PublishedVideoMetric,
  VideoSharingPlatform,
  VideoTemplateCategory,
} from '../../types/nexus.ts';

const CATEGORY_TO_TEMPLATE_ID: Record<VideoTemplateCategory, string> = {
  tutorial: 'tpl-tutorial-step',
  vlog: 'tpl-vlog-creator',
  news_short: 'tpl-news-short',
  animated_explainer: 'tpl-animated-explainer',
  product_demo: 'tpl-product-demo',
  viral_hook: 'tpl-viral-shorts',
};

export function filterAnalyticsByPlatform(
  data: AnalyticsData,
  platform: 'all' | VideoSharingPlatform
): {
  summary: AnalyticsMetricSummary;
  videos: PublishedVideoMetric[];
  platformLabel: string;
} {
  if (platform === 'all') {
    return {
      summary: data.summary,
      videos: data.publishedVideoPerformance,
      platformLabel: 'Všechny video platformy (YouTube, TikTok, Instagram Reels)',
    };
  }

  const platformStat = data.platformBreakdown.find((p) => p.platform === platform);
  const filteredVideos = data.publishedVideoPerformance.filter((v) => v.platform === platform);

  if (!platformStat) {
    return {
      summary: data.summary,
      videos: filteredVideos,
      platformLabel: platform,
    };
  }

  const estimatedRevenueCzk = Math.round(
    (platformStat.views / Math.max(1, data.summary.totalViews)) * data.summary.estimatedRevenueCzk
  );

  return {
    summary: {
      totalViews: platformStat.views,
      totalLikes: platformStat.likes,
      totalComments: platformStat.comments,
      totalWatchTimeHours: platformStat.watchTimeHours,
      engagementRate: platformStat.engagementRate,
      avgRetentionRate: platformStat.avgRetentionRate,
      avgCtr: platform === 'YouTube' ? 8.6 : platform === 'TikTok' ? 9.4 : 7.8,
      estimatedRevenueCzk,
      rpmCzk: platform === 'YouTube' ? 42 : platform === 'TikTok' ? 19 : 24,
    },
    videos: filteredVideos,
    platformLabel: platform,
  };
}

export function deriveContentRecommendations(
  videos: PublishedVideoMetric[]
): ContentRecommendation[] {
  if (videos.length === 0) return [];

  const ranked = [...videos].sort((a, b) => {
    const scoreA = a.watchTimeHours * 2 + a.likes * 0.5 + a.comments * 4 + a.retentionRate * 10;
    const scoreB = b.watchTimeHours * 2 + b.likes * 0.5 + b.comments * 4 + b.retentionRate * 10;
    return scoreB - scoreA;
  });

  return ranked.slice(0, 3).map((video, idx) => {
    const engagementPct = (((video.likes + video.comments * 3) / Math.max(1, video.views)) * 100).toFixed(1);
    const templateId = CATEGORY_TO_TEMPLATE_ID[video.templateCategory] || 'tpl-viral-shorts';

    const topicSuggestions = [
      `Pokračování dílu: ${video.title.split('(')[0].trim()} — hlubší workflow a reálné výsledky`,
      `Rychlé Q&A z komentářů k videu "${video.title.slice(0, 36)}..."`,
      `Rozbor 3 chyb, na které diváci naráží u tématu: ${video.title.slice(0, 40)}`,
    ];

    return {
      id: `rec-${video.id}-${idx + 1}`,
      basedOnVideoTitle: video.title,
      platform: video.platform,
      recommendedTopic: topicSuggestions[idx % topicSuggestions.length],
      recommendedTemplateId: templateId,
      recommendedFormat: video.format,
      rationale: `Video na ${video.platform} dosáhlo ${video.views.toLocaleString()} zhlédnutí, ${video.watchTimeHours} h sledování, ${video.likes.toLocaleString()} lajků a ${engagementPct}% míru zapojení.`,
      expectedLift: `+${18 + idx * 7} % očekávaný dosah`,
    };
  });
}
