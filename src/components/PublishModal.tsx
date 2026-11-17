/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  UploadCloud,
  Check,
  AlertCircle,
  HardDrive,
  Layers,
  Box,
  Youtube,
  Instagram,
  Music,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { SocialIntegration, PublishTask, TeamMember, VideoTemplateCategory } from '../types/nexus.ts';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialVideoTitle?: string;
  initialAssetId?: string;
  initialFormat?: '9:16' | '16:9';
  initialCategory?: VideoTemplateCategory;
  initialDescription?: string;
  initialTags?: string;
  currentActor?: TeamMember;
}

export const PublishModal: React.FC<PublishModalProps> = ({
  isOpen,
  onClose,
  initialVideoTitle = 'YouTube Viral Short: AI automatizace',
  initialAssetId = 'asset-001',
  initialFormat = '9:16',
  initialCategory = 'viral_hook',
  initialDescription,
  initialTags,
  currentActor,
}) => {
  const [integrations, setIntegrations] = useState<SocialIntegration[]>([]);
  const [publishTasks, setPublishTasks] = useState<PublishTask[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'YouTube Studio API',
    'TikTok Creator API',
  ]);
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [videoTitle, setVideoTitle] = useState(initialVideoTitle);
  const [description, setDescription] = useState(
    initialDescription ||
      'Automaticky vygenerováno v NEXUS X OS Video Studio. Kompletní postup a šablona v popisku!'
  );
  const [tags, setTags] = useState(
    initialTags || 'Shorts, TikTok, Reels, AI, Automatizace, MoviePy'
  );
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'publish' | 'channels' | 'history'>('publish');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canPublish = !currentActor || currentActor.permissions.includes('publish_videos');
  const canManageIntegrations = !currentActor || currentActor.permissions.includes('manage_integrations');

  useEffect(() => {
    if (isOpen) {
      loadData();
      setErrorMessage(null);
      if (initialVideoTitle) setVideoTitle(initialVideoTitle);
      if (initialDescription) setDescription(initialDescription);
      if (initialTags) setTags(initialTags);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0);
      setScheduledDateTime(tomorrow.toISOString().slice(0, 16));
    }
  }, [isOpen, initialVideoTitle, initialDescription, initialTags]);

  const loadData = async () => {
    try {
      const [intRes, tasksRes] = await Promise.all([
        fetch('/v1/integrations'),
        fetch('/v1/publish/tasks'),
      ]);
      if (intRes.ok) setIntegrations(await intRes.json());
      if (tasksRes.ok) setPublishTasks(await tasksRes.json());
    } catch (err) {
      console.error('Failed to load publishing data', err);
    }
  };

  const handleTogglePlatform = (name: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const handleToggleIntegration = async (id: string) => {
    setErrorMessage(null);
    try {
      const res = await fetch(`/v1/integrations/${id}/toggle`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Chyba při změně integrace.');
        return;
      }
      setIntegrations((prev) =>
        prev.map((item) => (item.id === id ? data : item))
      );
    } catch {
      setErrorMessage('Nepodařilo se spojit se serverem.');
    }
  };

  const handlePublishSubmit = async () => {
    if (selectedPlatforms.length === 0 || !videoTitle.trim()) return;

    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/v1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: initialAssetId,
          videoTitle,
          platforms: selectedPlatforms,
          scheduledFor: publishMode === 'schedule' ? scheduledDateTime : undefined,
          format: initialFormat,
          templateCategory: initialCategory,
          metadata: {
            title: videoTitle,
            description,
            tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
            privacy,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Publikace selhala.');
        return;
      }

      setPublishTasks((prev) => [data, ...prev]);
      setSuccessMessage(
        publishMode === 'schedule'
          ? `Video bylo naplánováno na ${new Date(scheduledDateTime).toLocaleString()} na platformy: ${selectedPlatforms.join(', ')}.`
          : `Video bylo úspěšně publikováno na platformy: ${selectedPlatforms.join(', ')} a zapsáno do analytiky.`
      );
      setActiveTab('history');
    } catch {
      setErrorMessage('Nepodařilo se odeslat požadavek k publikaci.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPlatformIcon = (name: string) => {
    if (name.includes('YouTube')) return <Youtube className="h-4 w-4 text-rose-500" />;
    if (name.includes('TikTok')) return <Music className="h-4 w-4 text-cyan-400" />;
    if (name.includes('Instagram')) return <Instagram className="h-4 w-4 text-pink-400" />;
    if (name.includes('Google Drive')) return <HardDrive className="h-4 w-4 text-emerald-400" />;
    if (name.includes('Buffer')) return <Layers className="h-4 w-4 text-amber-400" />;
    if (name.includes('Dropbox')) return <Box className="h-4 w-4 text-blue-400" />;
    return <UploadCloud className="h-4 w-4 text-zinc-400" />;
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Publikace videí a integrace platforem"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Share2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono">PUBLIKACE VIDEÍ & VIDEO PLATFORMY</h2>
              <p className="text-xs text-zinc-400 font-mono">
                Přímé odesílání a plánování na YouTube, TikTok, Instagram Reels, Google Drive a Buffer.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Zavřít publikační okno"
            data-testid="close-publish-modal"
            onClick={onClose}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* RBAC / Error Alert */}
        {(!canPublish || errorMessage) && (
          <div className="mt-3 rounded border border-rose-500/40 bg-rose-950/30 p-3 font-mono text-xs text-rose-300 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
            <span>
              {errorMessage ||
                `Aktuální role (${currentActor?.role}) má přístup pouze ke čtení a nemůže publikovat videa. Přepněte profil v sekci Účty & Tým.`}
            </span>
          </div>
        )}

        {/* Tab switch */}
        <div className="flex items-center gap-2 border-b border-zinc-800/80 pt-3 pb-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('publish')}
            className={`rounded px-3 py-1.5 font-mono text-xs whitespace-nowrap transition ${
              activeTab === 'publish'
                ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Publikovat / Naplánovat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('channels')}
            className={`rounded px-3 py-1.5 font-mono text-xs whitespace-nowrap transition ${
              activeTab === 'channels'
                ? 'bg-zinc-800 text-white font-bold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Připojené Kanály & OAuth ({integrations.filter((i) => i.connected).length}/{integrations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`rounded px-3 py-1.5 font-mono text-xs whitespace-nowrap transition ${
              activeTab === 'history'
                ? 'bg-zinc-800 text-white font-bold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Fronta a Historie Vydání ({publishTasks.length})
          </button>
        </div>

        {/* Tab 1: Publish form */}
        {activeTab === 'publish' && (
          <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
            {successMessage && (
              <div className="rounded border border-emerald-500/30 bg-emerald-950/20 p-3 font-mono text-xs text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Target Platforms Checklist */}
            <div>
              <span className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                1. Vyberte cílové video platformy a cloudová úložiště:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {integrations.map((intg) => {
                  const isSelected = selectedPlatforms.includes(intg.name);
                  return (
                    <button
                      key={intg.id}
                      type="button"
                      disabled={!intg.connected}
                      onClick={() => handleTogglePlatform(intg.name)}
                      className={`flex items-center justify-between rounded border p-3 font-mono text-xs text-left transition ${
                        !intg.connected
                          ? 'border-zinc-900 bg-zinc-950/40 opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'border-emerald-500/50 bg-emerald-950/20 text-white'
                            : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {getPlatformIcon(intg.name)}
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{intg.name}</div>
                          <div className="text-[10px] text-zinc-500 truncate">
                            {intg.connected
                              ? `${intg.handle ? intg.handle + ' · ' : ''}${intg.authMethod}`
                              : 'Odpojeno'}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-emerald-500 bg-emerald-500 text-black' : 'border-zinc-700 bg-zinc-900'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Timing: Publish Now vs Schedule */}
            <div className="pt-2 border-t border-zinc-800/80">
              <span className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                2. Časování publikace:
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPublishMode('now')}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-xs font-bold transition ${
                    publishMode === 'now'
                      ? 'bg-emerald-500 text-black'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Publikovat okamžitě</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPublishMode('schedule')}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-xs font-bold transition ${
                    publishMode === 'schedule'
                      ? 'bg-cyan-500 text-black'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Naplánovat na pozdější čas</span>
                </button>

                {publishMode === 'schedule' && (
                  <label className="flex items-center gap-2 font-mono text-xs text-zinc-400">
                    <span>Datum a čas:</span>
                    <input
                      type="datetime-local"
                      value={scheduledDateTime}
                      onChange={(e) => setScheduledDateTime(e.target.value)}
                      className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Video Metadata */}
            <div className="pt-2 border-t border-zinc-800/80 space-y-3 font-mono text-xs">
              <span className="block text-xs uppercase text-zinc-400">
                3. Metadata videa pro YouTube, TikTok & Instagram Reels:
              </span>

              <label className="block">
                <span className="text-[11px] text-zinc-500">Název videa / Hook titulek:</span>
                <input
                  type="text"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </label>

              <label className="block">
                <span className="text-[11px] text-zinc-500">Popisek s CTA a hashtagy:</span>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 resize-y"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] text-zinc-500">Klíčová slova / Hashtagy:</span>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] text-zinc-500">Viditelnost:</span>
                  <select
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value as 'public' | 'unlisted' | 'private')}
                    className="mt-1 w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="public">Veřejné (Public) · Okamžitý organický dosah</option>
                    <option value="unlisted">Neveřejné (Unlisted) · Pouze s odkazem</option>
                    <option value="private">Soukromé (Private) · Pouze tým</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Submit CTA */}
            <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-400">
                Vybráno: <span className="text-emerald-400 font-bold tabular-nums">{selectedPlatforms.length} platforem</span>
              </span>

              <button
                type="button"
                onClick={handlePublishSubmit}
                disabled={!canPublish || isSubmitting || selectedPlatforms.length === 0 || !videoTitle.trim()}
                className="flex items-center gap-2 rounded bg-emerald-500 px-5 py-2.5 font-mono text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-lg"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>ODESÍLÁM NA PLATFORMY...</span>
                  </>
                ) : publishMode === 'schedule' ? (
                  <>
                    <Calendar className="h-4 w-4" />
                    <span>NAPLÁNOVAT VYDÁNÍ</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>PUBLIKOVAT NYNÍ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Channels & Integrations */}
        {activeTab === 'channels' && (
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
            <p className="font-mono text-xs text-zinc-400">
              Správa bezpečného připojení přes OAuth 2.0 pro YouTube, TikTok, Instagram Reels a cloudová úložiště.
            </p>

            <div className="space-y-2">
              {integrations.map((intg) => (
                <div
                  key={intg.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 font-mono text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-950 border border-zinc-800">
                      {getPlatformIcon(intg.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{intg.name}</span>
                        <span className="text-[11px] text-zinc-400">
                          · {intg.connected ? 'Připojeno' : 'Odpojeno'}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        {intg.connected
                          ? `${intg.handle ? intg.handle + ' · ' : ''}Účet: ${intg.accountEmail || 'bpcme66@gmail.com'} · Expirace: ${new Date(intg.tokenExpiry || Date.now()).toLocaleDateString()}`
                          : 'Pro publikaci a čtení analytiky je vyžadováno OAuth oprávnění.'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 sm:mt-0 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!canManageIntegrations}
                      onClick={() => handleToggleIntegration(intg.id)}
                      className={`rounded px-3 py-1.5 font-mono text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                        intg.connected
                          ? 'border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-rose-950/30 hover:text-rose-400 hover:border-rose-900'
                          : 'bg-emerald-500 text-black hover:bg-emerald-400'
                      }`}
                    >
                      {intg.connected ? 'Odpojit' : 'Připojit přes OAuth 2.0'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: History & Scheduled Queue */}
        {activeTab === 'history' && (
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1 font-mono text-xs">
            {successMessage && (
              <div className="rounded border border-emerald-500/30 bg-emerald-950/20 p-3 font-mono text-xs text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {publishTasks.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-zinc-500">
                <Clock className="h-10 w-10 text-zinc-700 mb-2" />
                <p>Zatím nebyla naplánována ani publikována žádná videa.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {publishTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-white text-sm">{task.videoTitle}</span>
                      <span
                        className={`text-[11px] uppercase font-bold ${
                          task.status === 'published'
                            ? 'text-emerald-400'
                            : task.status === 'scheduled'
                              ? 'text-cyan-400'
                              : 'text-rose-400'
                        }`}
                      >
                        {task.status === 'published' ? 'PUBLIKOVÁNO' : 'NAPLÁNOVÁNO'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-400">
                      <div>
                        Platformy: <span className="text-zinc-200">{task.platforms.join(', ')}</span>
                      </div>
                      {task.publishedAt && (
                        <div>
                          Vydáno: <span className="text-emerald-400">{new Date(task.publishedAt).toLocaleString()}</span>
                        </div>
                      )}
                      {task.scheduledFor && (
                        <div>
                          Plánováno na: <span className="text-cyan-400">{new Date(task.scheduledFor).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {task.destinationUrl && (
                      <div className="pt-1 flex items-center gap-1.5 text-[11px] text-emerald-400">
                        <ExternalLink className="h-3 w-3" />
                        <a href={task.destinationUrl} target="_blank" rel="noreferrer" className="underline hover:text-emerald-300">
                          {task.destinationUrl}
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
