/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Activity,
  Agent,
  AgentRevenueLeaderboardSummary,
  FactoryAsset,
  Opportunity,
} from '../../types/nexus.ts';

const AGENT_NAME_TO_ID: Record<string, string> = {
  'CEO Agent': 'agent-ceo',
  'CFO Agent': 'agent-cfo',
  'COO Agent': 'agent-coo',
  'CTO Agent': 'agent-cto',
  'CMO Agent': 'agent-cmo',
  'Video Agent': 'agent-video',
  'Visual Agent': 'agent-visual',
  'Affiliate Agent': 'agent-affiliate',
  'SEO Agent': 'agent-seo',
  'Trend Agent': 'agent-trend',
  'Research Agent': 'agent-research',
  'Analytics Agent': 'agent-analytics',
  'Automation Agent': 'agent-automation',
  'Revenue Agent': 'agent-revenue',
  'Knowledge Agent': 'agent-knowledge',
  'Experiment Agent': 'agent-experiment',
};

export function inferAssetAgentAttribution(asset: FactoryAsset): {
  agentId: string;
  agentName: string;
  revenueCzk: number;
} {
  if (asset.createdByAgentId && asset.createdByAgentName) {
    const fallbackRev =
      typeof asset.revenueGeneratedCzk === 'number'
        ? asset.revenueGeneratedCzk
        : estimateAssetRevenueCzk(asset);
    return {
      agentId: asset.createdByAgentId,
      agentName: asset.createdByAgentName,
      revenueCzk: fallbackRev,
    };
  }

  let agentName = 'Video Agent';
  const tagsLower = (asset.tags || []).map((t) => t.toLowerCase());
  if (asset.multiGenType === 'image' || asset.multiGenType === 'sketch' || asset.multiGenType === 'meme') {
    agentName = 'Visual Agent';
  } else if (asset.line === 'ad' || tagsLower.some((t) => t.includes('ads') || t.includes('ppc'))) {
    agentName = 'CMO Agent';
  } else if (asset.line === 'funnel' || tagsLower.some((t) => t.includes('funnel') || t.includes('affiliate'))) {
    agentName = 'Affiliate Agent';
  } else if (tagsLower.some((t) => t.includes('seo'))) {
    agentName = 'SEO Agent';
  } else if (tagsLower.some((t) => t.includes('trend'))) {
    agentName = 'Trend Agent';
  } else if (asset.titanCoreManifest || tagsLower.some((t) => t.includes('ypp') || t.includes('moviepy'))) {
    agentName = 'Video Agent';
  }

  const agentId = AGENT_NAME_TO_ID[agentName] || 'agent-video';
  const revenueCzk =
    typeof asset.revenueGeneratedCzk === 'number'
      ? asset.revenueGeneratedCzk
      : estimateAssetRevenueCzk(asset);

  return { agentId, agentName, revenueCzk };
}

export function estimateAssetRevenueCzk(asset: FactoryAsset): number {
  if (typeof asset.revenueGeneratedCzk === 'number' && asset.revenueGeneratedCzk >= 0) {
    return Math.round(asset.revenueGeneratedCzk);
  }
  if (asset.status === 'failed') return 0;
  if (asset.dryRun) return 240;

  if (asset.line === 'funnel') return 4200;
  if (asset.line === 'ad') return 3100;

  if (asset.multiGenType === 'movie') return 3800;
  if (asset.multiGenType === 'image') return 1450;
  if (asset.multiGenType === 'sketch') return 950;
  if (asset.multiGenType === 'meme') return 1850;

  const ypp = asset.yppScore ?? (asset.titanCoreManifest?.ypp_score ?? 90);
  const durationBoost = Math.min(20, asset.durationSec || 8) * 90;
  const statusBonus = asset.status === 'ready' ? 1200 : 400;
  return Math.round(statusBonus + ypp * 22 + durationBoost);
}

export function inferOpportunityOwner(opp: Opportunity): {
  agentId: string;
  agentName: string;
  attributedRevenueCzk: number;
} {
  let agentName = opp.ownerAgentName || 'Revenue Agent';
  if (!opp.ownerAgentName) {
    switch (opp.channel) {
      case 'Affiliate':
        agentName = 'Affiliate Agent';
        break;
      case 'TikTok':
      case 'YouTube':
        agentName = 'Video Agent';
        break;
      case 'Meta Ads':
        agentName = 'CMO Agent';
        break;
      case 'E-mail':
        agentName = 'SEO Agent';
        break;
      case 'Produkt':
      default:
        agentName = 'Revenue Agent';
        break;
    }
  }
  const agentId = opp.ownerAgentId || AGENT_NAME_TO_ID[agentName] || 'agent-revenue';

  // Won = 100% realized; active = 45% weighted realized pipeline contribution; new = 15%; paused/closed = 0%
  const weight =
    opp.status === 'won'
      ? 1.0
      : opp.status === 'active'
        ? 0.45
        : opp.status === 'new'
          ? 0.15
          : 0;

  return {
    agentId,
    agentName,
    attributedRevenueCzk: Math.round(opp.projectionCzk * weight),
  };
}

export function computeAgentRevenueContributions(
  agents: Agent[],
  assets: FactoryAsset[],
  opportunities: Opportunity[],
  activities: Activity[] = []
): {
  agents: Agent[];
  summary: AgentRevenueLeaderboardSummary;
} {
  const buckets = new Map<
    string,
    {
      revenueCzk: number;
      assetsCount: number;
      opportunitiesCount: number;
      activityActions: number;
    }
  >();

  for (const agent of agents) {
    buckets.set(agent.id, {
      revenueCzk: 0,
      assetsCount: 0,
      opportunitiesCount: 0,
      activityActions: 0,
    });
  }

  for (const asset of assets) {
    const attr = inferAssetAgentAttribution(asset);
    const bucket = buckets.get(attr.agentId);
    if (bucket) {
      bucket.revenueCzk += attr.revenueCzk;
      bucket.assetsCount += 1;
    }
  }

  for (const opp of opportunities) {
    const owner = inferOpportunityOwner(opp);
    const bucket = buckets.get(owner.agentId);
    if (bucket) {
      bucket.revenueCzk += owner.attributedRevenueCzk;
      bucket.opportunitiesCount += 1;
    }
  }

  for (const act of activities) {
    const actAgentId = AGENT_NAME_TO_ID[act.agent];
    if (actAgentId) {
      const bucket = buckets.get(actAgentId);
      if (bucket) {
        bucket.activityActions += 1;
      }
    }
  }

  // Ensure baseline strategic/infra agents receive realistic micro-attribution when supporting assets exist
  const totalDirectRevenue = Array.from(buckets.values()).reduce((s, b) => s + b.revenueCzk, 0);
  if (totalDirectRevenue > 0) {
    const ceoBucket = buckets.get('agent-ceo');
    if (ceoBucket && ceoBucket.revenueCzk === 0) {
      ceoBucket.revenueCzk = Math.round(totalDirectRevenue * 0.08);
    }
    const cfoBucket = buckets.get('agent-cfo');
    if (cfoBucket && cfoBucket.revenueCzk === 0) {
      cfoBucket.revenueCzk = Math.round(totalDirectRevenue * 0.06);
    }
    const automationBucket = buckets.get('agent-automation');
    if (automationBucket && automationBucket.revenueCzk === 0 && assets.length > 0) {
      automationBucket.revenueCzk = assets.length * 420;
    }
    const analyticsBucket = buckets.get('agent-analytics');
    if (analyticsBucket && analyticsBucket.revenueCzk === 0) {
      analyticsBucket.revenueCzk = Math.round(totalDirectRevenue * 0.05);
    }
  }

  const grandTotal = Math.max(
    1,
    Array.from(buckets.values()).reduce((s, b) => s + b.revenueCzk, 0)
  );

  const enrichedAgents = agents.map((agent) => {
    const bucket = buckets.get(agent.id) || {
      revenueCzk: 0,
      assetsCount: 0,
      opportunitiesCount: 0,
      activityActions: 0,
    };
    const revenueCzk = Math.round(bucket.revenueCzk);
    const avgRevenuePerAssetCzk =
      bucket.assetsCount > 0 ? Math.round(revenueCzk / bucket.assetsCount) : 0;
    const sharePercent = Math.round((revenueCzk / grandTotal) * 1000) / 10;
    const roiEfficiencyScore = Math.min(
      99,
      Math.max(40, Math.round(agent.confidence * 0.6 + Math.min(40, revenueCzk / 500)))
    );

    return {
      ...agent,
      revenueContributionCzk: revenueCzk,
      attributedAssetsCount: bucket.assetsCount,
      attributedOpportunitiesCount: bucket.opportunitiesCount,
      avgRevenuePerAssetCzk,
      roiEfficiencyScore,
      attributionSharePercent: sharePercent,
    };
  });

  const sortedByRev = [...enrichedAgents].sort(
    (a, b) => (b.revenueContributionCzk || 0) - (a.revenueContributionCzk || 0)
  );
  const topAgent = sortedByRev[0];
  const totalAttributedRevenueCzk = enrichedAgents.reduce(
    (sum, a) => sum + (a.revenueContributionCzk || 0),
    0
  );
  const activeAgentsRevenueCzk = enrichedAgents
    .filter((a) => a.status === 'active')
    .reduce((sum, a) => sum + (a.revenueContributionCzk || 0), 0);

  return {
    agents: enrichedAgents,
    summary: {
      totalAttributedRevenueCzk,
      topAgentId: topAgent?.id || 'agent-video',
      topAgentName: topAgent?.name || 'Video Agent',
      topAgentRevenueCzk: topAgent?.revenueContributionCzk || 0,
      activeAgentsRevenueCzk,
      totalAssetsTracked: assets.length,
      totalOpportunitiesTracked: opportunities.length,
    },
  };
}
