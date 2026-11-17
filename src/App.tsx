/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar, MainAppTab } from './components/Navbar.tsx';
import { ChatOS } from './components/ChatOS.tsx';
import { BoardroomView } from './components/BoardroomView.tsx';
import { RevenueView } from './components/RevenueView.tsx';
import { FactoryView } from './components/FactoryView.tsx';
import { MediaVaultView } from './components/MediaVaultView.tsx';
import { CommentSwarmView } from './components/CommentSwarmView.tsx';
import { AnalyticsView } from './components/AnalyticsView.tsx';
import { AccountsTeamView } from './components/AccountsTeamView.tsx';
import { PublishModal } from './components/PublishModal.tsx';
import { TraceDrawer } from './components/TraceDrawer.tsx';
import { EvalsModal } from './components/EvalsModal.tsx';
import { DocsModal } from './components/DocsModal.tsx';
import {
  NotebookLMStudioModal,
  NotebookLMStudioConfig,
  buildNotebookLMPrompt,
} from './components/NotebookLMStudioModal.tsx';
import {
  Agent,
  Opportunity,
  Activity,
  FactoryAsset,
  RunTrace,
  WorkspaceAccount,
  TeamMember,
  VideoTemplateCategory,
} from './types/nexus.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<MainAppTab>('chat');
  const [isSystemPaused, setIsSystemPaused] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [assets, setAssets] = useState<FactoryAsset[]>([]);
  const [accounts, setAccounts] = useState<WorkspaceAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('acc-main');
  const [currentActor, setCurrentActor] = useState<TeamMember | undefined>(undefined);
  const [currentTrace, setCurrentTrace] = useState<RunTrace | null>(null);
  const [isTraceOpen, setIsTraceOpen] = useState(false);
  const [isEvalsOpen, setIsEvalsOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isNotebookLMOpen, setIsNotebookLMOpen] = useState(false);
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);

  // Social Publishing & CMS Modal State
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [publishVideoTitle, setPublishVideoTitle] = useState('YouTube Viral Short: AI automatizace');
  const [publishAssetId, setPublishAssetId] = useState<string>('asset-001');
  const [publishFormat, setPublishFormat] = useState<'9:16' | '16:9'>('9:16');
  const [publishCategory, setPublishCategory] = useState<VideoTemplateCategory>('viral_hook');
  const [publishDescription, setPublishDescription] = useState<string | undefined>(undefined);
  const [publishTags, setPublishTags] = useState<string | undefined>(undefined);

  // Viral Trend / Analytics Recommendation to Video Factory Bridge & Media Vault Focus
  const [factoryInitialTopic, setFactoryInitialTopic] = useState<string | undefined>(undefined);
  const [factoryInitialTemplateId, setFactoryInitialTemplateId] = useState<string | undefined>(undefined);
  const [focusedVaultAssetId, setFocusedVaultAssetId] = useState<string | null>(null);

  // Load initial enterprise state
  useEffect(() => {
    fetchInitialData();
  }, []);

  const refreshAuthContext = async () => {
    try {
      const res = await fetch('/v1/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
        if (data.activeAccountId) setActiveAccountId(data.activeAccountId);
        if (data.currentActor) setCurrentActor(data.currentActor);
      }
    } catch (err) {
      console.error('Failed to refresh accounts/actor context', err);
    }
  };

  const fetchInitialData = async () => {
    try {
      const [agentsRes, oppsRes, actsRes, assetsRes, healthRes, accountsRes] = await Promise.all([
        fetch('/v1/agents'),
        fetch('/v1/opportunities'),
        fetch('/v1/activity'),
        fetch('/v1/factory/assets'),
        fetch('/healthz'),
        fetch('/v1/accounts'),
      ]);

      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (oppsRes.ok) setOpportunities(await oppsRes.json());
      if (actsRes.ok) setActivities(await actsRes.json());
      if (assetsRes.ok) setAssets(await assetsRes.json());
      if (healthRes.ok) {
        const health = await healthRes.json();
        setIsSystemPaused(health.status === 'paused');
      }
      if (accountsRes.ok) {
        const accData = await accountsRes.json();
        setAccounts(accData.accounts || []);
        if (accData.activeAccountId) setActiveAccountId(accData.activeAccountId);
        if (accData.currentActor) setCurrentActor(accData.currentActor);
      }
    } catch (err) {
      console.error('Failed to load initial enterprise data', err);
    }
  };

  const refreshAssets = async () => {
    try {
      const res = await fetch('/v1/factory/assets');
      if (res.ok) {
        setAssets(await res.json());
      }
    } catch (err) {
      console.error('Failed to refresh assets', err);
    }
  };

  const refreshOpportunities = async () => {
    try {
      const res = await fetch('/v1/opportunities');
      if (res.ok) setOpportunities(await res.json());
    } catch (err) {
      console.error('Failed to refresh opportunities', err);
    }
  };

  const refreshActivities = async () => {
    try {
      const res = await fetch('/v1/activity');
      if (res.ok) setActivities(await res.json());
    } catch (err) {
      console.error('Failed to refresh activities', err);
    }
  };

  const handleOpenVaultAsset = (assetId: string) => {
    setFocusedVaultAssetId(assetId);
    setActiveTab('vault');
  };

  const handleToggleSystemPause = async () => {
    setSystemNotice(null);
    try {
      const res = await fetch('/v1/system/pause', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSystemNotice(data.error || 'Přepnutí nouzového Kill Switch selhalo.');
        return;
      }
      setIsSystemPaused(data.isSystemPaused);
      const actsRes = await fetch('/v1/activity');
      if (actsRes.ok) setActivities(await actsRes.json());
    } catch (err: any) {
      setSystemNotice(err?.message || 'Síťová chyba při přepínání Kill Switch.');
    }
  };

  const handleToggleAgentStatus = async (agentId: string, currentStatus: 'active' | 'paused') => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    setSystemNotice(null);
    try {
      const res = await fetch(`/v1/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSystemNotice(data.error || 'Změna stavu agenta byla zamítnuta.');
        return;
      }
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, status: newStatus } : a))
      );
    } catch (err: any) {
      setSystemNotice(err?.message || 'Síťová chyba při změně stavu agenta.');
    }
  };

  const handleUpdateOpportunityStatus = async (
    id: string,
    status: 'new' | 'active' | 'won' | 'paused' | 'closed'
  ) => {
    setSystemNotice(null);
    try {
      const res = await fetch(`/v1/opportunities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSystemNotice(data.error || 'Aktualizace příležitosti byla zamítnuta.');
        return;
      }
      setOpportunities((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status, updatedAt: new Date().toISOString() } : o))
      );
    } catch (err: any) {
      setSystemNotice(err?.message || 'Síťová chyba při aktualizaci příležitosti.');
    }
  };

  const handleOpenTrace = (trace: RunTrace) => {
    setCurrentTrace(trace);
    setIsTraceOpen(true);
  };

  const handleOpenPublish = (
    videoTitle?: string,
    format: '9:16' | '16:9' = '9:16',
    category: VideoTemplateCategory = 'viral_hook',
    extra?: { assetId?: string; description?: string; tags?: string[] }
  ) => {
    if (videoTitle) setPublishVideoTitle(videoTitle);
    setPublishFormat(format);
    setPublishCategory(category);
    setPublishAssetId(extra?.assetId || 'asset-001');
    setPublishDescription(extra?.description);
    setPublishTags(extra?.tags?.join(', '));
    setIsPublishOpen(true);
  };

  const handleSelectTrendForVideo = (trendTopic: string, templateId?: string) => {
    setFactoryInitialTopic(trendTopic);
    setFactoryInitialTemplateId(templateId);
    setActiveTab('factory');
  };

  const handleGenerateFromNotebookLM = (config: NotebookLMStudioConfig) => {
    const prompt = buildNotebookLMPrompt(config);
    setIsNotebookLMOpen(false);
    setActiveTab('chat');
    setPendingChatPrompt(prompt);
  };

  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* Top Navbar with Real-time Performance Monitor */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSystemPaused={isSystemPaused}
        onToggleSystemPause={handleToggleSystemPause}
        onOpenDocs={() => setIsDocsOpen(true)}
        onOpenEvals={() => setIsEvalsOpen(true)}
        onOpenPublish={() => handleOpenPublish()}
        onOpenNotebookLM={() => setIsNotebookLMOpen(true)}
        activeAgentsCount={agents.filter((a) => a.status === 'active').length}
        activeAccount={activeAccount}
        currentActor={currentActor}
      />

      {/* Main View Routes */}
      <main className="flex-1 w-full overflow-x-hidden">
        {systemNotice && (
          <div
            data-testid="global-system-notice"
            className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-2 text-xs font-mono text-rose-200"
          >
            <span>{systemNotice}</span>
            <button
              type="button"
              onClick={() => setSystemNotice(null)}
              className="text-rose-100 hover:text-white underline shrink-0"
            >
              Zavřít
            </button>
          </div>
        )}
        {activeTab === 'chat' && (
          <ChatOS
            onOpenTrace={handleOpenTrace}
            agents={agents}
            activities={activities}
            onAssetsUpdated={refreshAssets}
            onOpenVaultAsset={handleOpenVaultAsset}
            onOpenNotebookLM={() => setIsNotebookLMOpen(true)}
            pendingPrompt={pendingChatPrompt}
            onClearPendingPrompt={() => setPendingChatPrompt(null)}
          />
        )}
        {activeTab === 'agents' && (
          <BoardroomView
            agents={agents}
            onToggleAgentStatus={handleToggleAgentStatus}
          />
        )}
        {activeTab === 'revenue' && (
          <RevenueView
            opportunities={opportunities}
            activities={activities}
            onUpdateOpportunityStatus={handleUpdateOpportunityStatus}
          />
        )}
        {activeTab === 'factory' && (
          <FactoryView
            assets={assets}
            initialTopic={factoryInitialTopic}
            initialTemplateId={factoryInitialTemplateId}
            currentActor={currentActor}
            onOpenPublish={handleOpenPublish}
            onRefreshAssets={refreshAssets}
          />
        )}
        {activeTab === 'vault' && (
          <MediaVaultView
            assets={assets}
            focusedAssetId={focusedVaultAssetId}
            onClearFocusedAsset={() => setFocusedVaultAssetId(null)}
            onRefreshAssets={refreshAssets}
            onOpenPublish={handleOpenPublish}
            currentActor={currentActor}
          />
        )}
        {activeTab === 'comments' && (
          <CommentSwarmView
            assets={assets}
            currentActor={currentActor}
            onOpportunitiesUpdated={refreshOpportunities}
            onActivitiesUpdated={refreshActivities}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsView
            onSelectTrendForVideo={handleSelectTrendForVideo}
          />
        )}
        {activeTab === 'accounts' && (
          <AccountsTeamView
            accounts={accounts}
            activeAccountId={activeAccountId}
            currentActor={currentActor}
            onRefreshAuthContext={refreshAuthContext}
          />
        )}
      </main>

      {/* Social & CMS Publishing Modal */}
      <PublishModal
        isOpen={isPublishOpen}
        onClose={() => setIsPublishOpen(false)}
        initialVideoTitle={publishVideoTitle}
        initialAssetId={publishAssetId}
        initialFormat={publishFormat}
        initialCategory={publishCategory}
        initialDescription={publishDescription}
        initialTags={publishTags}
        currentActor={currentActor}
      />

      {/* Modals & Drawers */}
      <TraceDrawer
        trace={currentTrace}
        isOpen={isTraceOpen}
        onClose={() => setIsTraceOpen(false)}
      />

      <EvalsModal
        isOpen={isEvalsOpen}
        onClose={() => setIsEvalsOpen(false)}
      />

      <DocsModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
      />

      <NotebookLMStudioModal
        isOpen={isNotebookLMOpen}
        onClose={() => setIsNotebookLMOpen(false)}
        onGenerate={handleGenerateFromNotebookLM}
      />
    </div>
  );
}
