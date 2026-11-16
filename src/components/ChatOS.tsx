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
} from 'lucide-react';
import { Message, Agent, Activity as ActivityType, RunTrace, FactoryAsset } from '../types/nexus.ts';
import { downloadVideoAsset, formatBytes, formatDuration } from '../utils/mediaDownload.ts';

interface ChatOSProps {
  onOpenTrace: (trace: RunTrace) => void;
  agents: Agent[];
  activities: ActivityType[];
  onAssetsUpdated?: () => Promise<void> | void;
  onOpenVaultAsset?: (assetId: string) => void;
}

export const ChatOS: React.FC<ChatOSProps> = ({
  onOpenTrace,
  agents,
  activities,
  onAssetsUpdated,
  onOpenVaultAsset,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState('th-main-001');
  const [expandedToolEvents, setExpandedToolEvents] = useState<Record<string, boolean>>({});
  const [downloadingAssetId, setDownloadingAssetId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages on mount
  useEffect(() => {
    fetchMessages(activeThreadId);
  }, [activeThreadId]);

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
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    setInputText('');
    setIsLoading(true);

    // Optimistic user message
    const tempUserMsg: Message = {
      id: `msg-opt-${Date.now()}`,
      threadId: activeThreadId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/v1/threads/${activeThreadId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          content: text,
          dryRun,
        }),
      });

      if (res.ok) {
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
    } finally {
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      {/* Main Chat Center Panel */}
      <div className="flex flex-1 flex-col border-r border-zinc-800 bg-zinc-950/70" data-testid="chat-panel">
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
                        <span className="text-zinc-400">Styl: {msg.videoBrief.visualStyle}</span>
                        <span className="text-zinc-400">Tón: {msg.videoBrief.tone}</span>
                        <span className="text-zinc-400">{msg.videoBrief.bpm} BPM</span>
                      </div>
                      <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[10px] text-emerald-400">
                        {msg.videoBrief.engineUsed}
                      </span>
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

                  {/* Inline Video Asset Cards */}
                  {(() => {
                    const videoAssets = extractVideoAssets(msg);
                    if (videoAssets.length === 0) return null;
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

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 font-mono text-xs text-zinc-400 bg-zinc-900/40 border border-zinc-800/60 rounded p-3 max-w-md">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              <span>NEO plánuje kroky a provádí nástroje v runtime...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer */}
        <div className="border-t border-zinc-800/80 bg-zinc-900/50 p-4">
          <div className="relative rounded-lg border border-zinc-800 bg-zinc-950 focus-within:border-emerald-500/50 transition shadow-inner">
            <textarea
              data-testid="chat-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Zadejte byznys cíl (např. 'Chci vydělat 50 000 Kč měsíčně', 'Vytvoř 5 videí na TikTok', 'Spusť AI boardroom')..."
              rows={2}
              className="w-full resize-none bg-transparent p-3 pr-24 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none"
            />
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
              <span className="hidden font-mono text-[10px] text-zinc-500 sm:inline">
                Enter = Odeslat
              </span>
              <button
                data-testid="chat-send"
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

      {/* Right Rail: Swarm, Signals, and Next Steps */}
      <div className="hidden lg:flex w-80 flex-col border-l border-zinc-800/80 bg-zinc-950 p-4 space-y-5 overflow-y-auto font-mono text-xs">
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
    </div>
  );
};
