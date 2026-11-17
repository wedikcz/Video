/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Sparkles,
  Layers,
  Wrench,
  Activity,
  Bot,
  User,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Cpu,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronRight,
  Download,
  Film,
  ExternalLink,
  Brain,
  Wand2,
  ChevronLeft,
  PackageCheck,
  Image as ImageIcon,
  PenTool,
  Smile,
  Clapperboard,
  ShieldCheck,
  X,
  Eye,
  Check,
  Copy,
} from 'lucide-react';
import {
  Message,
  Agent,
  Activity as ActivityType,
  RunTrace,
  FactoryAsset,
  MultiGenMode,
  OpenGenModelSpec,
} from '../types/nexus.ts';
import { downloadVideoAsset, formatBytes, formatDuration } from '../utils/mediaDownload.ts';
import { getModelAvatar, DEFAULT_AVATAR_PROMPTS } from '../utils/modelAvatars.ts';

interface ChatOSProps {
  onOpenTrace: (trace: RunTrace) => void;
  agents: Agent[];
  activities: ActivityType[];
  onAssetsUpdated?: () => Promise<void> | void;
  onOpenVaultAsset?: (assetId: string) => void;
  onOpenNotebookLM?: () => void;
  pendingPrompt?: string | null;
  onClearPendingPrompt?: () => void;
}

interface ChatModelCardItem {
  id: string;
  name: string;
  badge?: string;
  provider?: string;
  creditCost?: number;
}

const FALLBACK_CHAT_MODELS: ChatModelCardItem[] = [
  { id: 'wan-2-2', name: 'Wan 2.2 Turbo (Open)', badge: 'WAN 2.2', provider: 'Alibaba OpenGen', creditCost: 4 },
  { id: 'ltx-2-5', name: 'LTX-Video 2.5', badge: 'LTX 2.5', provider: 'Lightricks', creditCost: 4 },
  { id: 'nexus-local-director', name: 'Lokální Chytrý Režisér', badge: 'LOCAL 0 Kč', provider: 'NEXUS Engine', creditCost: 0 },
  { id: 'flux-2-pro', name: 'FLUX 2 Pro', badge: 'FLUX 2', provider: 'Black Forest', creditCost: 5 },
];

const MULTIGEN_MODE_OPTIONS: Array<{ id: MultiGenMode; label: string; hint: string }> = [
  { id: 'chat', label: 'Agent Chat', hint: 'Autonomní orchestrátor' },
  { id: 'image', label: 'Image', hint: 'Grafika & vizuál' },
  { id: 'video', label: 'Video', hint: 'Krátký H.264 clip' },
  { id: 'movie', label: 'Movies', hint: 'Filmová 16:9 scéna' },
  { id: 'sketch', label: 'Sketches', hint: 'Blueprint koncept' },
  { id: 'meme', label: 'Memes', hint: 'Virální meme karta' },
];

export const ChatOS: React.FC<ChatOSProps> = ({
  onOpenTrace,
  agents,
  activities,
  onAssetsUpdated,
  onOpenVaultAsset,
  onOpenNotebookLM,
  pendingPrompt,
  onClearPendingPrompt,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingStatus, setStreamingStatus] = useState<string>('NEO plánuje kroky a provádí nástroje v runtime...');
  const [dryRun, setDryRun] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState('th-main-001');
  const [expandedToolEvents, setExpandedToolEvents] = useState<Record<string, boolean>>({});
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const [activeCarouselIndex, setActiveCarouselIndex] = useState<Record<string, number>>({});
  const [isBatchDownloading, setIsBatchDownloading] = useState<Record<string, boolean>>({});
  const [downloadingAssetId, setDownloadingAssetId] = useState<string | null>(null);
  const [chatModels, setChatModels] = useState<ChatModelCardItem[]>(
    FALLBACK_CHAT_MODELS
  );
  const [selectedModelId, setSelectedModelId] = useState<string>('wan-2-2');
  const [multiGenMode, setMultiGenMode] = useState<MultiGenMode>('chat');
  const [failedAvatars, setFailedAvatars] = useState<Record<string, boolean>>({});
  const [customAvatars, setCustomAvatars] = useState<Record<string, string>>({});
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState<Record<string, boolean>>({});
  const [avatarNotification, setAvatarNotification] = useState<string | null>(null);
  const [avatarModal, setAvatarModal] = useState<{
    modelId: string;
    modelName: string;
    avatarUrl: string;
    prompt: string;
    artifactId?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef<boolean>(false);

  const handleGenerateAvatar = async (modelId: string, customPrompt?: string) => {
    setIsGeneratingAvatar((prev) => ({ ...prev, [modelId]: true }));
    setAvatarNotification(null);
    try {
      const promptToUse =
        customPrompt ||
        DEFAULT_AVATAR_PROMPTS[modelId] ||
        `Futuristický kybernetický avatar pro model ${modelId}: holografický AI portrét, neonové optické prvky a vysoké detaily`;

      const res = await fetch('/v1/multigen/avatars/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId,
          prompt: promptToUse,
          threadId: activeThreadId,
        }),
      });

      const data = await res.json();
      if (res.ok && data?.avatarUrl) {
        setCustomAvatars((prev) => ({ ...prev, [modelId]: data.avatarUrl }));
        setFailedAvatars((prev) => ({ ...prev, [modelId]: false }));
        setAvatarNotification(
          `Nový futuristický avatar pro ${modelId.toUpperCase()} úspěšně vygenerován přes MultiGen Toolkit (+1 450 Kč připsáno Visual Agentovi)!`
        );
        setTimeout(() => setAvatarNotification(null), 5000);
        onAssetsUpdated?.();
      } else {
        setAvatarNotification(data?.error || 'Generování futuristického avatara selhalo.');
        setTimeout(() => setAvatarNotification(null), 4000);
      }
    } catch (err: any) {
      console.error('Error generating avatar', err);
      setAvatarNotification('Síťová chyba při generování avatara.');
      setTimeout(() => setAvatarNotification(null), 4000);
    } finally {
      setIsGeneratingAvatar((prev) => ({ ...prev, [modelId]: false }));
    }
  };

  // Load messages & model catalog on mount
  useEffect(() => {
    fetchMessages(activeThreadId);
  }, [activeThreadId]);

  useEffect(() => {
    fetch('/api/v1/opengen/models')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list = Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
        if (list.length > 0) {
          // Put wan-2-2 and ltx-2-5 first so their avatars are immediately visible
          const prioritizedIds = ['wan-2-2', 'ltx-2-5', 'nexus-local-director', 'veo-3-1'];
          const sorted = [...list].sort((a: any, b: any) => {
            const ia = prioritizedIds.indexOf(a.id);
            const ib = prioritizedIds.indexOf(b.id);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return 0;
          });
          setChatModels(sorted.slice(0, 6));
        }
      })
      .catch(() => {});
  }, []);

  const fetchMessages = async (threadId: string) => {
    try {
      const res = await fetch(`/v1/threads/${threadId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to load messages', err);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, streamingStatus]);

  useEffect(() => {
    if (pendingPrompt && pendingPrompt.trim() && !isSendingRef.current) {
      const promptToRun = pendingPrompt.trim();
      onClearPendingPrompt?.();
      handleSendMessage(promptToRun);
    }
  }, [pendingPrompt]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSendingRef.current) return;

    isSendingRef.current = true;
    setInputText('');
    setIsLoading(true);
    setStreamingStatus('NEO analyzuje záměr a aktivuje Video Director...');

    // Optimistic user message
    const tempUserMsg: Message = {
      id: `msg-opt-${Date.now()}`,
      threadId: activeThreadId,
      role: 'user',
      content: text,
      modelId: selectedModelId,
      multiGenMode,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/v1/threads/${activeThreadId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
        },
        body: JSON.stringify({
          content: text,
          dryRun,
          modelId: selectedModelId,
          multiGenMode,
        }),
      });

      const contentType = res.headers.get('content-type') || '';

      if (res.ok && contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let receivedDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const rawEvent of events) {
            const dataLines = rawEvent
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim());
            if (dataLines.length === 0) continue;

            try {
              const evt = JSON.parse(dataLines.join('\n'));
              if (evt.type === 'span' && evt.data?.message) {
                setStreamingStatus(evt.data.message);
              } else if (evt.type === 'tool_event' && evt.data) {
                const { status, tool, episode, total } = evt.data;
                if (tool === 'render_video_mp4') {
                  if (status === 'running') {
                    setStreamingStatus(
                      episode && total
                        ? `Renderuji MP4 epizodu ${episode}/${total} (FFmpeg gradient + synthwave audio)...`
                        : 'Renderuji vysoce kvalitní H.264 MP4 video s dynamickým HUD...'
                    );
                  } else if (status === 'completed' && episode && total) {
                    setStreamingStatus(`Epizoda ${episode}/${total} vyrenderována a uložena do trezoru.`);
                  }
                } else if (tool && status === 'running') {
                  setStreamingStatus(`Spouštím nástroj: ${tool}...`);
                }
              } else if (evt.type === 'done' && evt.data) {
                receivedDone = true;
                setMessages((prev) => [...prev, evt.data]);
                await onAssetsUpdated?.();
              } else if (evt.type === 'error') {
                throw new Error(evt.error || 'Chyba SSE streamu');
              }
            } catch (parseErr) {
              if (parseErr instanceof SyntaxError) continue;
              throw parseErr;
            }
          }
        }

        if (!receivedDone) {
          await fetchMessages(activeThreadId);
        }
      } else if (res.ok) {
        const assistantMsg = await res.json();
        setMessages((prev) => [...prev, assistantMsg]);
        await onAssetsUpdated?.();
      } else {
        const errData = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-err-${Date.now()}`,
            threadId: activeThreadId,
            role: 'assistant',
            content: `Chyba při exekuci: ${errData.error || 'Neznámá systémová chyba'}`,
            createdAt: new Date().toISOString(),
            confidence: 0,
            suggestions: [
              'Zkusit formulovat cíl znovu',
              'Zkontrolovat stav 16 agentů',
              'Zobrazit metriky pipeline',
              'Spustit AI boardroom',
              'Ověřit systémové limity',
              'Vygenerovat video scénář',
            ],
          },
        ]);
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          threadId: activeThreadId,
          role: 'assistant',
          content: `Došlo k chybě spojení: ${err?.message || 'Neznámá chyba'}`,
          createdAt: new Date().toISOString(),
          confidence: 0,
        },
      ]);
    } finally {
      isSendingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInspectTrace = async (runId?: string) => {
    if (!runId) return;
    try {
      const res = await fetch(`/v1/runs/${runId}`);
      if (res.ok) {
        const trace = await res.json();
        onOpenTrace(trace);
      }
    } catch (err) {
      console.error('Failed to load trace', err);
    }
  };

  const toggleToolEvents = (msgId: string) => {
    setExpandedToolEvents((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const toggleReasoning = (msgId: string) => {
    setExpandedReasoning((prev) => ({ ...prev, [msgId]: !(prev[msgId] ?? true) }));
  };

  const extractVideoAssets = (msg: Message): FactoryAsset[] => {
    if (msg.clarificationRequest) return [];
    const map = new Map<string, FactoryAsset>();
    if (Array.isArray(msg.generatedAssets)) {
      for (const a of msg.generatedAssets) {
        if (a && a.line === 'video') map.set(a.id, a);
      }
    }
    if (Array.isArray(msg.toolEvents)) {
      for (const te of msg.toolEvents) {
        if (te.tool === 'list_factory_assets') continue;
        if (te.output?.asset?.line === 'video') {
          map.set(te.output.asset.id, te.output.asset);
        }
      }
    }
    return Array.from(map.values());
  };

  const handleDownloadAsset = async (asset: FactoryAsset) => {
    setDownloadingAssetId(asset.id);
    try {
      await downloadVideoAsset(asset);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloadingAssetId(null);
    }
  };

  const handleDownloadAllAssets = async (msgId: string, assetsList: FactoryAsset[]) => {
    setIsBatchDownloading((prev) => ({ ...prev, [msgId]: true }));
    try {
      for (const asset of assetsList) {
        await downloadVideoAsset(asset);
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      console.error('Batch download failed:', err);
    } finally {
      setIsBatchDownloading((prev) => ({ ...prev, [msgId]: false }));
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      {/* Main Chat Center Panel */}
      <div className="flex flex-1 min-w-0 flex-col border-r border-zinc-800 bg-zinc-950/70" data-testid="chat-panel">
        {/* Thread Subheader */}
        <div className="flex h-11 items-center justify-between border-b border-zinc-800/80 bg-zinc-900/40 px-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            <span className="font-mono text-xs font-semibold text-zinc-200">
              NEO OPERAČNÍ MOZEK · HLAVNÍ VLÁKNO
            </span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              {activeThreadId}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {onOpenNotebookLM && (
              <button
                type="button"
                data-testid="open-notebooklm-chat"
                onClick={onOpenNotebookLM}
                className="flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/15 px-3 py-1 font-mono text-[11px] font-semibold text-blue-300 hover:bg-blue-500/25 hover:text-white transition"
              >
                <Wand2 className="h-3 w-3 text-blue-400" />
                <span>Přizpůsobit video (NotebookLM)</span>
              </button>
            )}

            <label className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
              />
              <span>DRY-RUN (SIMULACE)</span>
            </label>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            const isLastAssistant =
              !isUser &&
              index ===
                messages
                  .map((m, idx) => (m.role === 'assistant' ? idx : -1))
                  .filter((i) => i !== -1)
                  .pop();

            return (
              <div
                key={msg.id}
                data-testid="chat-message"
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-3xl ${isUser ? 'ml-auto' : 'mr-auto'}`}
              >
                {/* Message Header */}
                <div className="flex items-center gap-2 mb-1.5 text-[11px] font-mono text-zinc-400">
                  {isUser ? (
                    <>
                      <span className="text-zinc-500">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                      <span className="font-semibold text-zinc-300">OPERÁTOR</span>
                      <User className="h-3.5 w-3.5 text-zinc-400" />
                    </>
                  ) : (
                    <>
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <Bot className="h-3 w-3" />
                      </div>
                      <span className="font-semibold text-emerald-400">NEO OPERATING BRAIN</span>
                      {msg.confidence && (
                        <span className="rounded bg-zinc-900 border border-zinc-800 px-1 text-[10px] text-zinc-400">
                          {msg.confidence}% CONF
                        </span>
                      )}
                      <span className="text-zinc-600">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                    </>
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`rounded-lg p-4 text-xs sm:text-sm leading-relaxed ${
                    isUser
                      ? 'bg-zinc-800/90 text-white border border-zinc-700/60'
                      : 'bg-zinc-900/80 text-zinc-200 border border-zinc-800 shadow-lg'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* AI Video Director Creative Brief Summary */}
                  {msg.videoBrief && (
                    <div
                      data-testid="chat-video-brief"
                      className="mt-3 rounded border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 font-mono text-[11px] flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-cyan-400 font-bold flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          <span>AI REŽIE</span>
                        </span>
                        <span className="text-zinc-300">{msg.videoBrief.platform} ({msg.videoBrief.aspectRatio})</span>
                        <span className="text-zinc-400">Styl: {msg.videoBrief.notebookStyle || msg.videoBrief.visualStyle}</span>
                        <span className="text-zinc-400">Tón: {msg.videoBrief.tone}</span>
                        <span className="text-zinc-400">{msg.videoBrief.bpm} BPM</span>
                      </div>
                      <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[10px] text-emerald-400">
                        {msg.videoBrief.engineUsed}
                      </span>
                    </div>
                  )}

                  {/* NEO Deep Thinking & Reasoning Trace Accordion */}
                  {msg.reasoningTrace && (
                    <div
                      data-testid="chat-reasoning-trace"
                      className="mt-3 rounded-lg border border-indigo-500/35 bg-indigo-950/20 overflow-hidden font-mono text-xs"
                    >
                      <button
                        type="button"
                        data-testid="reasoning-trace-toggle"
                        aria-expanded={expandedReasoning[msg.id] ?? true}
                        onClick={() => toggleReasoning(msg.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left bg-indigo-950/30 hover:bg-indigo-950/50 transition"
                      >
                        <div className="flex items-center gap-2 text-indigo-300 font-bold text-[11px]">
                          <Brain className="h-3.5 w-3.5 text-indigo-400" />
                          <span>NEO DEEP THINKING · {msg.reasoningTrace.thinkingTitle}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-indigo-300/80">
                          <span className="rounded bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 tabular-nums">
                            {msg.reasoningTrace.durationMs} ms
                          </span>
                          {(expandedReasoning[msg.id] ?? true) ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </div>
                      </button>

                      {(expandedReasoning[msg.id] ?? true) && (
                        <div className="p-3 space-y-3 text-[11px] border-t border-indigo-500/20">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="rounded border border-zinc-800/90 bg-zinc-950/70 p-2">
                              <div className="text-[10px] text-indigo-400 uppercase mb-0.5">Algoritmus</div>
                              <div className="text-zinc-300 leading-snug">{msg.reasoningTrace.algorithmicStrategy}</div>
                            </div>
                            <div className="rounded border border-zinc-800/90 bg-zinc-950/70 p-2">
                              <div className="text-[10px] text-cyan-400 uppercase mb-0.5">Retenční model</div>
                              <div className="text-zinc-300 leading-snug">{msg.reasoningTrace.retentionModel}</div>
                            </div>
                            <div className="rounded border border-zinc-800/90 bg-zinc-950/70 p-2">
                              <div className="text-[10px] text-emerald-400 uppercase mb-0.5">Audio & BPM</div>
                              <div className="text-zinc-300 leading-snug">{msg.reasoningTrace.audioPacing}</div>
                            </div>
                          </div>

                          {msg.reasoningTrace.agentConsensus?.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[10px] uppercase text-zinc-500">Konsenzus agentů:</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {msg.reasoningTrace.agentConsensus.map((c, cIdx) => (
                                  <div
                                    key={cIdx}
                                    className="rounded border border-zinc-800/80 bg-zinc-900/50 px-2.5 py-1.5 text-[11px]"
                                  >
                                    <span className="text-emerald-400 font-bold">@{c.agent}:</span>{' '}
                                    <span className="text-zinc-300">{c.perspective}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {msg.reasoningTrace.structuredPillars?.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[10px] uppercase text-zinc-500">
                                Rozložené režijní pilíře ({msg.reasoningTrace.structuredPillars.length} dílů):
                              </div>
                              <div className="grid grid-cols-1 gap-1.5">
                                {msg.reasoningTrace.structuredPillars.map((pillar, pIdx) => (
                                  <div
                                    key={pIdx}
                                    className="rounded border border-zinc-800/80 bg-zinc-950/80 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <div>
                                      <span className="text-indigo-300 font-bold">#{pIdx + 1} {pillar.title}</span>
                                      <span className="text-zinc-500"> · {pillar.subject}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                      <span className="rounded bg-zinc-900 px-1.5 py-0.5">{pillar.style}</span>
                                      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-amber-300">{pillar.hookPacing}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Interactive Clarification Request Card */}
                  {msg.clarificationRequest && (
                    <div
                      data-testid="video-clarification-card"
                      className="mt-4 rounded-lg border border-amber-500/40 bg-zinc-950/90 p-3.5 space-y-3 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px] uppercase">
                          <Sliders className="h-3.5 w-3.5" />
                          <span>AI VIDEO DIRECTOR · UPŘESNĚNÍ ZADÁNÍ</span>
                        </div>
                        <span className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-300 tabular-nums">
                          Kompletnost: {msg.clarificationRequest.completenessScore}%
                        </span>
                      </div>

                      {msg.clarificationRequest.partialBrief.topic && (
                        <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] text-zinc-300">
                          <span className="text-zinc-500">Rozpoznané téma:</span>{' '}
                          <span className="text-emerald-400 font-semibold">
                            {msg.clarificationRequest.partialBrief.topic}
                          </span>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {msg.clarificationRequest.questions.map((q, qIdx) => (
                          <div
                            key={qIdx}
                            className="flex items-start gap-2 rounded border border-zinc-800/80 bg-zinc-900/40 p-2 text-[11px] text-zinc-200"
                          >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-amber-500/20 text-[10px] font-bold text-amber-300">
                              {qIdx + 1}
                            </span>
                            <span>{q}</span>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <div className="text-[10px] uppercase text-zinc-500">
                          Rychlé doplnění jedním klikem:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.clarificationRequest.quickPresets.map((preset, pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              disabled={isLoading}
                              data-testid={`clarification-preset-${pIdx}`}
                              onClick={() => handleSendMessage(preset.promptText)}
                              className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 hover:text-white disabled:opacity-50 transition text-left"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-zinc-500">
                          Nebo napiš odpověď vlastními slovy do chatu níže.
                        </span>
                        <button
                          type="button"
                          disabled={isLoading}
                          data-testid="clarification-proceed-defaults"
                          onClick={() => handleSendMessage(msg.clarificationRequest!.proceedPrompt)}
                          className="shrink-0 flex items-center gap-1 rounded bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-black hover:bg-amber-300 disabled:opacity-50 transition"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>Vyrenderovat hned s AI návrhem</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Interactive Video Production Suite Carousel (Batch) OR Single Video Card */}
                  {(() => {
                    const videoAssets = extractVideoAssets(msg);
                    if (videoAssets.length === 0) return null;

                    if (videoAssets.length > 1) {
                      const activeIdx = Math.min(activeCarouselIndex[msg.id] ?? 0, videoAssets.length - 1);
                      const activeAsset = videoAssets[activeIdx];
                      const activeSrc = activeAsset.streamUrl || `/api/v1/assets/${activeAsset.id}/stream`;
                      const suite = msg.videoBatchSuite;

                      return (
                        <div className="mt-4 space-y-3" data-testid="chat-video-assets">
                          {/* Suite Header Banner */}
                          <div
                            data-testid="video-batch-suite-banner"
                            className="rounded-lg border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-zinc-950 to-cyan-950/30 p-3 font-mono text-xs space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <PackageCheck className="h-4 w-4 text-emerald-400" />
                                <span className="font-bold text-white text-xs">
                                  {suite?.suiteTitle || `Produkční série (${videoAssets.length}× MP4)`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-300">
                                  {videoAssets.length} videí · {suite?.totalDurationSec || videoAssets.reduce((s, a) => s + (a.durationSec || 8), 0)}s celkem
                                </span>
                                <button
                                  type="button"
                                  data-testid="chat-batch-download-all"
                                  disabled={Boolean(isBatchDownloading[msg.id])}
                                  onClick={() => handleDownloadAllAssets(msg.id, videoAssets)}
                                  className="flex items-center gap-1 rounded bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition"
                                >
                                  <Download className="h-3 w-3" />
                                  <span>
                                    {isBatchDownloading[msg.id]
                                      ? 'Stahuji sérii...'
                                      : `Stáhnout vše (${videoAssets.length}× MP4)`}
                                  </span>
                                </button>
                              </div>
                            </div>
                            {suite?.strategySummary && (
                              <p className="text-[11px] text-zinc-400 leading-snug">{suite.strategySummary}</p>
                            )}
                          </div>

                          {/* Episode Switcher Tabs */}
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                            <button
                              type="button"
                              aria-label="Předchozí epizoda"
                              onClick={() =>
                                setActiveCarouselIndex((prev) => ({
                                  ...prev,
                                  [msg.id]: (activeIdx - 1 + videoAssets.length) % videoAssets.length,
                                }))
                              }
                              className="rounded border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-white shrink-0"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>

                            {videoAssets.map((ep, idx) => (
                              <button
                                key={ep.id}
                                type="button"
                                data-testid={`chat-episode-tab-${idx + 1}`}
                                onClick={() =>
                                  setActiveCarouselIndex((prev) => ({ ...prev, [msg.id]: idx }))
                                }
                                className={`rounded-lg px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap shrink-0 border transition ${
                                  idx === activeIdx
                                    ? 'border-emerald-400 bg-emerald-500/20 text-white font-bold'
                                    : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:text-white'
                                }`}
                              >
                                Díl {idx + 1} · {ep.videoBrief?.visualStyle?.split('_')[0] || 'HD'}
                              </button>
                            ))}

                            <button
                              type="button"
                              aria-label="Další epizoda"
                              onClick={() =>
                                setActiveCarouselIndex((prev) => ({
                                  ...prev,
                                  [msg.id]: (activeIdx + 1) % videoAssets.length,
                                }))
                              }
                              className="rounded border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-white shrink-0"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Active Episode Stage Player */}
                          <div className="rounded-xl border border-emerald-500/35 bg-zinc-950/95 overflow-hidden">
                            <div className="flex flex-col sm:flex-row">
                              <div className="sm:w-56 bg-black flex items-center justify-center border-b sm:border-b-0 sm:border-r border-zinc-800 shrink-0">
                                <video
                                  key={activeAsset.id}
                                  controls
                                  playsInline
                                  preload="metadata"
                                  poster={activeAsset.posterUrl}
                                  src={activeSrc}
                                  aria-label={`Přehrávač dílu ${activeIdx + 1}: ${activeAsset.title}`}
                                  className="w-full max-h-72 object-contain bg-black"
                                />
                              </div>
                              <div className="flex-1 p-3.5 flex flex-col justify-between gap-2.5 font-mono text-xs">
                                <div>
                                  <div className="flex items-center justify-between gap-2 text-[10px] text-emerald-400 uppercase font-bold">
                                    <span className="flex items-center gap-1">
                                      <Film className="h-3 w-3" />
                                      <span>DÍL {activeIdx + 1} Z {videoAssets.length} · RENDERED MP4</span>
                                    </span>
                                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 border border-emerald-500/30">
                                      {activeAsset.videoBrief?.visualStyle || activeAsset.status || 'ready'}
                                    </span>
                                  </div>
                                  <h4 className="font-sans text-sm font-bold text-white mt-1.5">
                                    {activeAsset.title}
                                  </h4>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400 tabular-nums">
                                    <span>{formatDuration(activeAsset.durationSec || 8)}</span>
                                    <span>{activeAsset.resolution || '720x1280'}</span>
                                    <span>{formatBytes(activeAsset.sizeBytes)}</span>
                                    <span className="text-zinc-500">{activeAsset.id}</span>
                                  </div>
                                  {activeAsset.videoStoryboard?.scenes && (
                                    <div className="mt-2.5 space-y-1">
                                      <div className="text-[10px] uppercase text-zinc-500">Scénář dílu:</div>
                                      <div className="flex flex-wrap gap-1">
                                        {activeAsset.videoStoryboard.scenes.map((sc) => (
                                          <span
                                            key={sc.id}
                                            className="rounded border border-zinc-800 bg-zinc-900/70 px-1.5 py-0.5 text-[10px] text-zinc-300"
                                          >
                                            {sc.timeRange} {sc.kineticText}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/80">
                                  <button
                                    type="button"
                                    data-testid={`chat-download-${activeAsset.id}`}
                                    disabled={downloadingAssetId === activeAsset.id}
                                    onClick={() => handleDownloadAsset(activeAsset)}
                                    className="flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    <span>
                                      {downloadingAssetId === activeAsset.id ? 'Stahuji...' : 'Stáhnout MP4'}
                                    </span>
                                  </button>

                                  {onOpenVaultAsset && (
                                    <button
                                      type="button"
                                      data-testid={`chat-open-vault-${activeAsset.id}`}
                                      onClick={() => onOpenVaultAsset(activeAsset.id)}
                                      className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-200 hover:text-white hover:border-emerald-500/50 transition"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5 text-cyan-400" />
                                      <span>Otevřít v trezoru</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Thumbnail Episode Cards Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {videoAssets.map((ep, idx) => (
                              <button
                                key={ep.id}
                                type="button"
                                data-testid="chat-video-card"
                                data-asset-id={ep.id}
                                onClick={() =>
                                  setActiveCarouselIndex((prev) => ({ ...prev, [msg.id]: idx }))
                                }
                                className={`text-left rounded-lg border p-2 transition flex flex-col gap-1.5 ${
                                  idx === activeIdx
                                    ? 'border-emerald-400 bg-emerald-950/30'
                                    : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                                }`}
                              >
                                {ep.posterUrl ? (
                                  <img
                                    src={ep.posterUrl}
                                    alt={ep.title}
                                    className="w-full h-20 object-cover rounded border border-zinc-800 bg-black"
                                  />
                                ) : (
                                  <div className="w-full h-20 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                                    <Film className="h-5 w-5 text-emerald-400" />
                                  </div>
                                )}
                                <div className="font-mono text-[10px] font-bold text-emerald-400">
                                  DÍL #{idx + 1} · {formatDuration(ep.durationSec || 8)}
                                </div>
                                <div className="text-[11px] font-medium text-zinc-200 line-clamp-2 leading-tight">
                                  {ep.title}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="mt-4 space-y-3" data-testid="chat-video-assets">
                        {videoAssets.map((asset) => {
                          const streamSrc = asset.streamUrl || `/api/v1/assets/${asset.id}/stream`;
                          return (
                            <div
                              key={asset.id}
                              data-testid="chat-video-card"
                              data-asset-id={asset.id}
                              className="rounded-lg border border-emerald-500/30 bg-zinc-950/90 overflow-hidden"
                            >
                              <div className="flex flex-col sm:flex-row">
                                <div className="sm:w-52 bg-black flex items-center justify-center border-b sm:border-b-0 sm:border-r border-zinc-800 shrink-0">
                                  <video
                                    controls
                                    playsInline
                                    preload="metadata"
                                    poster={asset.posterUrl}
                                    src={streamSrc}
                                    aria-label={`Náhled videa ${asset.title}`}
                                    className="w-full max-h-56 object-contain bg-black"
                                  />
                                </div>
                                <div className="flex-1 p-3 flex flex-col justify-between gap-2.5 font-mono text-xs">
                                  <div>
                                    <div className="flex items-center justify-between gap-2 text-[10px] text-emerald-400 uppercase font-bold">
                                      <span className="flex items-center gap-1">
                                        <Film className="h-3 w-3" />
                                        <span>{asset.dryRun ? 'DRY-RUN MP4 ASSET' : 'VYRENDEROVANÉ MP4 VIDEO'}</span>
                                      </span>
                                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 border border-emerald-500/30">
                                        {asset.status || 'ready'}
                                      </span>
                                    </div>
                                    <h4 className="font-sans text-sm font-bold text-white mt-1 line-clamp-2">
                                      {asset.title}
                                    </h4>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400 tabular-nums">
                                      <span>{formatDuration(asset.durationSec || 6)}</span>
                                      <span>{asset.resolution || '720x1280'}</span>
                                      <span>{formatBytes(asset.sizeBytes)}</span>
                                      <span className="text-zinc-500">{asset.id}</span>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/80">
                                    <button
                                      type="button"
                                      data-testid={`chat-download-${asset.id}`}
                                      disabled={downloadingAssetId === asset.id}
                                      onClick={() => handleDownloadAsset(asset)}
                                      className="flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                      <span>
                                        {downloadingAssetId === asset.id ? 'Stahuji...' : 'Stáhnout MP4'}
                                      </span>
                                    </button>

                                    {onOpenVaultAsset && (
                                      <button
                                        type="button"
                                        data-testid={`chat-open-vault-${asset.id}`}
                                        onClick={() => onOpenVaultAsset(asset.id)}
                                        className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-200 hover:text-white hover:border-emerald-500/50 transition"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5 text-cyan-400" />
                                        <span>Otevřít v trezoru</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* All-in-One Multi-Generation Artifacts (Image, Sketches, Memes, Video, Movies) */}
                  {msg.multiGenArtifacts && msg.multiGenArtifacts.length > 0 && (
                    <div className="mt-4 space-y-3" data-testid="chat-multigen-artifacts">
                      {msg.multiGenArtifacts.map((artifact) => {
                        const artifactAvatar = getModelAvatar(artifact.modelId);
                        return (
                          <div
                            key={artifact.id}
                            data-testid={`multigen-card-${artifact.type}`}
                            className="rounded-lg border border-cyan-500/35 bg-zinc-950/90 overflow-hidden font-mono text-xs"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/60 px-3 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {artifactAvatar.imageUrl && !failedAvatars[artifact.modelId] ? (
                                  <img
                                    src={artifactAvatar.imageUrl}
                                    alt={artifact.modelName}
                                    referrerPolicy="no-referrer"
                                    className="h-5 w-5 rounded object-cover border border-cyan-400/50 shrink-0"
                                  />
                                ) : (
                                  <Sparkles className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                                )}
                                <span className="font-bold text-white truncate">{artifact.title}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="rounded bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300 uppercase">
                                  {artifact.type}
                                </span>
                                <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-300 tabular-nums">
                                  @{artifact.createdByAgentName} · +{artifact.revenueGeneratedCzk} Kč
                                </span>
                              </div>
                            </div>

                            <div className="p-3 space-y-2.5">
                              {artifact.previewSvgDataUri && (
                                <div className="rounded border border-zinc-800 bg-black overflow-hidden flex items-center justify-center">
                                  <img
                                    src={artifact.previewSvgDataUri}
                                    alt={artifact.title}
                                    referrerPolicy="no-referrer"
                                    className="max-h-72 w-auto object-contain"
                                  />
                                </div>
                              )}
                              {artifact.streamUrl && (
                                <video
                                  controls
                                  playsInline
                                  preload="metadata"
                                  src={artifact.streamUrl}
                                  aria-label={`MultiGen přehrávač ${artifact.title}`}
                                  className="w-full max-h-64 rounded border border-zinc-800 bg-black object-contain"
                                />
                              )}
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
                                <span>
                                  Model: <strong className="text-zinc-200">{artifact.modelName}</strong> · Poměr {artifact.aspectRatio}
                                </span>
                                {onOpenVaultAsset && artifact.assetId && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenVaultAsset(artifact.assetId!)}
                                    className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-cyan-300 hover:border-cyan-400/60 hover:text-white transition"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    <span>Otevřít v Media Vaultu</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Self-Healing Level-1 Event Log Badges */}
                  {msg.selfHealingEvents && msg.selfHealingEvents.length > 0 && (
                    <div
                      data-testid="chat-self-healing-events"
                      className="mt-3 rounded border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 font-mono text-[11px] space-y-1"
                    >
                      <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px] uppercase">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>TitanCore Self-Healing ({msg.selfHealingEvents.length})</span>
                      </div>
                      {msg.selfHealingEvents.map((ev) => (
                        <div key={ev.id} className="text-zinc-300 text-[10px]">
                          <span className="text-amber-300">[{ev.source}]</span> {ev.issue} →{' '}
                          <span className="text-emerald-300">{ev.repairAction}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 3-Step Action Plan */}
                  {msg.plan && msg.plan.length > 0 && (
                    <div className="mt-4 rounded border border-zinc-800/90 bg-zinc-950/70 p-3">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-emerald-400 mb-2">
                        <Layers className="h-3.5 w-3.5" />
                        <span>PLÁN EXEKUCE ({msg.plan.length} KROKY)</span>
                      </div>
                      <div className="space-y-2">
                        {msg.plan.map((step) => (
                          <div
                            key={step.id}
                            className="flex items-start gap-2.5 rounded border border-zinc-900 bg-zinc-900/50 p-2 text-xs"
                          >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-emerald-500/20 text-[10px] font-mono font-bold text-emerald-400">
                              {step.id}
                            </span>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-white">{step.title}</span>
                                {step.assignedAgent && (
                                  <span className="font-mono text-[10px] text-zinc-500">
                                    @{step.assignedAgent}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-400 mt-0.5">{step.description}</p>
                            </div>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-mono uppercase ${
                                step.status === 'completed'
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : step.status === 'in_progress'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : 'bg-zinc-800 text-zinc-500'
                              }`}
                            >
                              {step.status === 'completed' ? 'HOTOVO' : step.status === 'in_progress' ? 'BĚŽÍ' : 'ČEKÁ'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* System Tool Events lines ("nástroj: list_opportunities → 6 záznamů") */}
                  {msg.toolEvents && msg.toolEvents.length > 0 && (
                    <div className="mt-3 border-t border-zinc-800/80 pt-2">
                      <button
                        onClick={() => toggleToolEvents(msg.id)}
                        className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-emerald-400 transition"
                      >
                        {expandedToolEvents[msg.id] ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <Wrench className="h-3 w-3 text-cyan-400" />
                        <span>Nástrojové volání ({msg.toolEvents.length})</span>
                      </button>

                      {expandedToolEvents[msg.id] ? (
                        <div className="mt-2 space-y-1.5 pl-3 border-l border-zinc-800">
                          {msg.toolEvents.map((te, idx) => (
                            <div key={idx} className="font-mono text-[11px] text-zinc-400">
                              <span className="text-cyan-400">nástroj: {te.tool}</span> →{' '}
                              <span className="text-zinc-300">
                                {te.output?.count !== undefined
                                  ? `${te.output.count} záznamů`
                                  : te.output?.success
                                    ? 'úspěšně provedeno'
                                    : 'výsledek vrácen'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1 font-mono text-[10px] text-zinc-500 pl-4">
                          {msg.toolEvents.map((te) => `nástroj: ${te.tool}`).join(' · ')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Agent Notes */}
                  {msg.agentNotes && msg.agentNotes.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {msg.agentNotes.map((note, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded bg-zinc-950/80 px-2 py-0.5 text-[10px] font-mono text-zinc-400 border border-zinc-800"
                        >
                          <span className="text-emerald-400">@{note.agent}:</span> {note.note}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Trace details button */}
                  {msg.runId && (
                    <div className="mt-3 flex items-center justify-end">
                      <button
                        onClick={() => handleInspectTrace(msg.runId)}
                        className="flex items-center gap-1 rounded bg-zinc-950 px-2 py-1 text-[10px] font-mono text-zinc-400 hover:text-emerald-400 border border-zinc-800 hover:border-emerald-500/40 transition"
                      >
                        <Activity className="h-3 w-3 text-emerald-400" />
                        <span>Inspekce Trace</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 6 Suggestions Chips (Rendered after the latest assistant message) */}
                {isLastAssistant && msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="mt-4 w-full">
                    <span className="font-mono text-[10px] uppercase text-zinc-500 tracking-wider">
                      DALŠÍCH 6 DOPORUČENÝCH POKRAČOVÁNÍ:
                    </span>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {msg.suggestions.map((suggestion, sIdx) => (
                        <button
                          key={sIdx}
                          data-testid="chat-suggestion"
                          onClick={() => handleSendMessage(suggestion)}
                          className="flex items-center justify-between rounded border border-zinc-800/80 bg-zinc-900/60 px-3 py-2 text-left text-xs font-mono text-zinc-300 hover:border-emerald-500/50 hover:bg-emerald-950/20 hover:text-white transition group"
                        >
                          <span>{suggestion}</span>
                          <ArrowRight className="h-3 w-3 text-zinc-500 group-hover:text-emerald-400 transition transform group-hover:translate-x-0.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Live SSE Loading / Thinking indicator */}
          {isLoading && (
            <div
              data-testid="chat-streaming-status"
              className="flex items-center gap-2.5 font-mono text-xs text-emerald-300 bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-3 max-w-xl"
            >
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400 shrink-0" />
              <span>{streamingStatus}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Model Selection (WAN-2.2 & LTX-2.5 Futuristic Avatars) + MultiGen Toolkit & Input Composer */}
        <div className="border-t border-zinc-800/80 bg-zinc-900/50 p-3 sm:p-4 space-y-2.5">
          {/* Avatar Generated Notification Toast */}
          {avatarNotification && (
            <div
              data-testid="chat-avatar-toast"
              className="flex items-center justify-between rounded-lg border border-cyan-500/40 bg-cyan-950/85 px-3 py-1.5 font-mono text-[11px] text-cyan-200 shadow-sm"
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
                <span>{avatarNotification}</span>
              </div>
              <button
                type="button"
                onClick={() => setAvatarNotification(null)}
                className="text-cyan-400 hover:text-white p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Model Selection & MultiGen Bar */}
          <div className="flex flex-col gap-2">
            <div
              data-testid="chat-model-selector"
              className="flex items-center gap-1.5 overflow-x-auto pb-1"
            >
              <span className="font-mono text-[10px] uppercase text-zinc-500 shrink-0 mr-1">
                Model:
              </span>
              {chatModels.map((model) => {
                const avatar = getModelAvatar(model.id, customAvatars[model.id]);
                const isSelected = selectedModelId === model.id;
                const imgBroken = Boolean(failedAvatars[model.id]);
                const isGenerating = Boolean(isGeneratingAvatar[model.id]);
                return (
                  <div
                    key={model.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`chat-model-card-${model.id}`}
                    onClick={() => setSelectedModelId(model.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedModelId(model.id);
                      }
                    }}
                    className={`group relative flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left font-mono transition shrink-0 cursor-pointer ${
                      isSelected
                        ? `bg-gradient-to-r ${avatar.accentClass} text-white shadow-sm`
                        : 'border-zinc-800 bg-zinc-950/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <div
                      className="relative shrink-0 cursor-pointer"
                      title={
                        avatar.imageUrl
                          ? `Kliknutím otevřete detail avatara ${model.name}`
                          : undefined
                      }
                      onClick={(e) => {
                        if (avatar.imageUrl) {
                          e.stopPropagation();
                          setAvatarModal({
                            modelId: model.id,
                            modelName: model.name,
                            avatarUrl: avatar.imageUrl,
                            prompt:
                              DEFAULT_AVATAR_PROMPTS[model.id] ||
                              `Futuristický kybernetický avatar pro model ${model.name}`,
                          });
                        }
                      }}
                    >
                      {avatar.imageUrl && !imgBroken ? (
                        <img
                          src={avatar.imageUrl}
                          alt={`${model.name} futuristický avatar`}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedAvatars((prev) => ({ ...prev, [model.id]: true }))
                          }
                          className="h-7 w-7 rounded object-cover border border-white/20 shrink-0 bg-zinc-900 group-hover:border-cyan-400 transition"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-[9px] font-bold text-emerald-400 shrink-0">
                          {avatar.shortTag.slice(0, 3)}
                        </div>
                      )}

                      {/* Generating Spinner Overlay */}
                      {isGenerating && (
                        <div className="absolute inset-0 flex items-center justify-center rounded bg-black/80">
                          <RefreshCw className="h-3 w-3 animate-spin text-cyan-300" />
                        </div>
                      )}
                    </div>

                    <div className="leading-tight">
                      <div className="text-[11px] font-bold whitespace-nowrap flex items-center gap-1">
                        <span>{model.name}</span>
                        {customAvatars[model.id] && (
                          <span className="rounded bg-cyan-500/20 text-cyan-300 text-[8px] px-1 py-0 border border-cyan-500/40">
                            AI GEN
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-zinc-400 whitespace-nowrap">
                        {model.badge || avatar.shortTag} · {model.provider || 'AI Engine'}
                      </div>
                    </div>

                    {/* Quick Trigger Button for WAN-2.2 and LTX-2.5 */}
                    {(model.id === 'wan-2-2' || model.id === 'ltx-2-5') && (
                      <button
                        type="button"
                        data-testid={`generate-avatar-btn-${model.id}`}
                        title={`Vygenerovat nový avatar přes Media Toolkit (${model.name})`}
                        disabled={isGenerating}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateAvatar(model.id);
                        }}
                        className="ml-1 rounded p-1 text-zinc-400 hover:bg-cyan-500/20 hover:text-cyan-300 transition"
                      >
                        {isGenerating ? (
                          <RefreshCw className="h-3 w-3 animate-spin text-cyan-400" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-cyan-400" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Dedicated Avatar Generator Action for selected model */}
              {(selectedModelId === 'wan-2-2' || selectedModelId === 'ltx-2-5') && (
                <button
                  type="button"
                  data-testid="interactive-generate-avatar-btn"
                  disabled={isGeneratingAvatar[selectedModelId]}
                  onClick={() => handleGenerateAvatar(selectedModelId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-gradient-to-r from-cyan-500/15 to-violet-500/15 hover:from-cyan-500/25 hover:to-violet-500/25 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-cyan-200 hover:text-white shrink-0 transition"
                  title="Spustí Media Generation Toolkit API pro vygenerování nového futuristického avatara"
                >
                  {isGeneratingAvatar[selectedModelId] ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin text-cyan-300" />
                      <span>Generuji avatar...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 text-cyan-300" />
                      <span>Generovat avatar ({selectedModelId.toUpperCase()})</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Multi-Generation Toolkit Mode Switcher */}
            <div
              data-testid="chat-multigen-toolbar"
              className="flex flex-wrap items-center gap-1.5 font-mono"
            >
              <span className="text-[10px] uppercase text-zinc-500 mr-1">MultiGen Toolkit:</span>
              {MULTIGEN_MODE_OPTIONS.map((opt) => {
                const active = multiGenMode === opt.id;
                const ModeIcon =
                  opt.id === 'image'
                    ? ImageIcon
                    : opt.id === 'video'
                      ? Film
                      : opt.id === 'movie'
                        ? Clapperboard
                        : opt.id === 'sketch'
                          ? PenTool
                          : opt.id === 'meme'
                            ? Smile
                            : Bot;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`multigen-mode-${opt.id}`}
                    onClick={() => setMultiGenMode(opt.id)}
                    title={opt.hint}
                    className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] whitespace-nowrap shrink-0 transition ${
                      active
                        ? 'border-cyan-400 bg-cyan-500/20 text-white font-bold'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    <ModeIcon className={`h-3 w-3 ${active ? 'text-cyan-300' : 'text-zinc-500'}`} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative rounded-lg border border-zinc-800 bg-zinc-950 focus-within:border-emerald-500/50 transition shadow-inner">
            <textarea
              data-testid="chat-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                multiGenMode === 'chat'
                  ? "Zadejte byznys cíl (např. 'Chci vydělat 50 000 Kč měsíčně', 'Vytvoř mi 5 tik tok videí', 'Spusť AI boardroom')..."
                  : `MultiGen [${multiGenMode.toUpperCase()} · ${selectedModelId}]: Popište co vygenerovat...`
              }
              rows={2}
              className="w-full resize-none bg-transparent p-3 pr-24 pb-9 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none"
            />
            <div className="absolute bottom-2.5 left-3 right-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {onOpenNotebookLM && (
                  <button
                    type="button"
                    data-testid="open-notebooklm-composer"
                    onClick={onOpenNotebookLM}
                    className="flex items-center gap-1 rounded border border-blue-500/35 bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] text-blue-300 hover:bg-blue-500/20 hover:text-white transition"
                  >
                    <Sparkles className="h-3 w-3 text-blue-400" />
                    <span>NotebookLM Studio</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden font-mono text-[10px] text-zinc-500 sm:inline">
                  Enter = Odeslat
                </span>
                <button
                  type="button"
                  data-testid="chat-send"
                  aria-label="Odeslat zprávu"
                  onClick={() => handleSendMessage()}
                  disabled={isLoading || !inputText.trim()}
                  className="flex h-7 w-7 items-center justify-center rounded bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-40 transition"
                >
                  <Send className="h-3.5 w-3.5 fill-current" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Rail: Swarm, Signals, and Next Steps */}
      <div className="hidden lg:flex w-80 shrink-0 flex-col border-l border-zinc-800/80 bg-zinc-950 p-4 space-y-5 overflow-y-auto font-mono text-xs">
        {/* Swarm Status */}
        <div>
          <div className="flex items-center justify-between text-zinc-400 text-[11px] uppercase tracking-wider mb-2">
            <span>SWARM STATUS</span>
            <span className="text-emerald-400">{agents.filter((a) => a.status === 'active').length} AKTIVNÍCH</span>
          </div>
          <div className="space-y-1.5">
            {agents.slice(0, 5).map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between rounded border border-zinc-900 bg-zinc-900/40 px-2.5 py-1.5"
              >
                <div>
                  <div className="font-semibold text-zinc-200">{agent.name}</div>
                  <div className="text-[10px] text-zinc-500">{agent.role}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-emerald-400">{agent.confidence}% conf</div>
                  <div className="text-[9px] text-zinc-600">{agent.tasks} úkolů</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Signals Feed */}
        <div>
          <div className="flex items-center justify-between text-zinc-400 text-[11px] uppercase tracking-wider mb-2">
            <span>SIGNÁLY A AKTIVITY</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          </div>
          <div className="space-y-2">
            {activities.slice(0, 4).map((act) => (
              <div key={act.id} className="rounded border border-zinc-900 bg-zinc-900/30 p-2 text-[11px]">
                <div className="font-medium text-zinc-200">{act.title}</div>
                <div className="mt-1 text-[10px] text-zinc-400 leading-tight">{act.description}</div>
                <div className="mt-1 flex items-center justify-between text-[9px] text-zinc-600">
                  <span>@{act.agent}</span>
                  <span>{new Date(act.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Next Best Steps */}
        <div className="rounded border border-emerald-500/20 bg-emerald-950/10 p-3">
          <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold uppercase mb-2">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>DALŠÍ NEJLEPŠÍ KROK</span>
          </div>
          <p className="text-[11px] text-zinc-300 leading-relaxed">
            Spusťte YouTube Shorts linku s MoviePy automatizací pro získání prvních 10 000 organických zhlédnutí za 0 Kč.
          </p>
          <button
            onClick={() => handleSendMessage('Vytvoř 5 videí na TikTok a YouTube Shorts')}
            className="mt-2.5 w-full rounded bg-emerald-500 px-3 py-1.5 font-bold text-black hover:bg-emerald-400 transition"
          >
            Spustit video linku
          </button>
        </div>
      </div>

      {/* Interactive Futuristic Avatar Inspector & Customizer Modal */}
      {avatarModal && (
        <div
          data-testid="futuristic-avatar-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono"
        >
          <div className="relative w-full max-w-lg rounded-xl border border-cyan-500/50 bg-zinc-950 p-5 shadow-2xl shadow-cyan-950/50 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                <span className="font-bold text-sm text-white">
                  Futuristický Avatar · {avatarModal.modelName}
                </span>
                <span className="rounded bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 text-[10px] border border-cyan-500/40">
                  {avatarModal.modelId.toUpperCase()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAvatarModal(null)}
                className="rounded p-1 text-zinc-400 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative h-44 w-44 shrink-0 rounded-xl border border-cyan-500/40 bg-zinc-900 overflow-hidden shadow-inner flex items-center justify-center">
                <img
                  src={customAvatars[avatarModal.modelId] || avatarModal.avatarUrl}
                  alt={`${avatarModal.modelName} avatar preview`}
                  className="h-full w-full object-contain"
                />
                {isGeneratingAvatar[avatarModal.modelId] && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" />
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2 text-xs">
                <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2.5 text-zinc-300 space-y-1">
                  <div className="text-[10px] uppercase text-zinc-500 font-bold">Generováno přes:</div>
                  <div className="text-cyan-300 font-semibold">Local Media Toolkit · 1:1 SVG/AI</div>
                  <div className="text-[10px] text-zinc-400">
                    Atributovaný vlastník: <span className="text-zinc-200">Visual Agent</span> · Výnos:{' '}
                    <span className="text-emerald-400">+1 450 Kč</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-zinc-400 font-bold block">
                    Generační Prompt (Media Toolkit):
                  </label>
                  <textarea
                    rows={3}
                    value={avatarModal.prompt}
                    onChange={(e) =>
                      setAvatarModal((prev) => (prev ? { ...prev, prompt: e.target.value } : null))
                    }
                    className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-[11px] text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3">
              <a
                href={customAvatars[avatarModal.modelId] || avatarModal.avatarUrl}
                download={`avatar-${avatarModal.modelId}.svg`}
                className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:text-white transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Stáhnout SVG</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="modal-regenerate-avatar-btn"
                  disabled={isGeneratingAvatar[avatarModal.modelId]}
                  onClick={async () => {
                    await handleGenerateAvatar(avatarModal.modelId, avatarModal.prompt);
                  }}
                  className="flex items-center gap-1.5 rounded bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40 transition"
                >
                  {isGeneratingAvatar[avatarModal.modelId] ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Generuji...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Vygenerovat znovu přes Toolkit</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
