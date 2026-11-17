/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Check,
  FolderGit2,
  ChevronDown,
  RefreshCw,
  Wand2,
} from 'lucide-react';

export interface NotebookLMStudioConfig {
  format: '9:16' | '16:9';
  batchCount: 1 | 3 | 5;
  language: string;
  sourceCount: number;
  visualStyle: string;
  customPrompt: string;
  narrativeFocus: string;
}

interface NotebookLMStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: NotebookLMStudioConfig) => void;
  isGenerating?: boolean;
}

interface VisualStyleOption {
  id: string;
  label: string;
  iconType: 'auto' | 'custom' | 'classic' | 'board' | 'ancient' | 'cutout' | 'watercolor' | 'anime' | 'retro' | 'kawaii' | 'cyberpunk' | 'fintech';
  description: string;
  gradientBg: string;
  accentBorder: string;
}

const VISUAL_STYLES: VisualStyleOption[] = [
  {
    id: 'auto',
    label: 'Automatický',
    iconType: 'auto',
    description: 'AI vybere nejvhodnější styl podle tématu a cílového publika',
    gradientBg: 'from-blue-600/30 to-indigo-600/30',
    accentBorder: 'border-blue-500',
  },
  {
    id: 'custom',
    label: 'Vlastní',
    iconType: 'custom',
    description: 'Plně řízený promptem a vizuálními parametry tvůrce',
    gradientBg: 'from-zinc-800 to-zinc-900',
    accentBorder: 'border-zinc-500',
  },
  {
    id: 'classic',
    label: 'Klasický',
    iconType: 'classic',
    description: 'Čistý minimalistický architektonický styl s jemnou mřížkou',
    gradientBg: 'from-sky-950/60 to-slate-900',
    accentBorder: 'border-sky-500',
  },
  {
    id: 'board',
    label: 'Tabule',
    iconType: 'board',
    description: 'Kreslený edukační styl bílé tabule s diagramy a šipkami',
    gradientBg: 'from-blue-950/50 to-cyan-950/40',
    accentBorder: 'border-cyan-400',
  },
  {
    id: 'anime',
    label: 'Anime',
    iconType: 'anime',
    description: 'Živé barvy, dramatické nasvícení a kinetická anime estetika',
    gradientBg: 'from-amber-950/40 to-rose-950/40',
    accentBorder: 'border-amber-400',
  },
  {
    id: 'retro',
    label: 'Retro tisk',
    iconType: 'retro',
    description: 'Vintage novinový rastr, polotóny a komiksová estetika 80. let',
    gradientBg: 'from-orange-950/40 to-stone-900',
    accentBorder: 'border-orange-400',
  },
  {
    id: 'kawaii',
    label: 'Kawaii',
    iconType: 'kawaii',
    description: 'Přátelské roztomilé postavičky, pastelové barvy a vysoká retence',
    gradientBg: 'from-pink-950/40 to-rose-900/40',
    accentBorder: 'border-pink-400',
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    iconType: 'cyberpunk',
    description: 'Neonové noční město, cyan & magenta holografické prvky',
    gradientBg: 'from-cyan-950/50 to-fuchsia-950/50',
    accentBorder: 'border-cyan-400',
  },
  {
    id: 'fintech',
    label: 'FinTech',
    iconType: 'fintech',
    description: 'Smaragdový datový tok, grafy ziskovosti a seriózní dojem',
    gradientBg: 'from-emerald-950/50 to-teal-950/40',
    accentBorder: 'border-emerald-400',
  },
  {
    id: 'ancient',
    label: 'Starodávný',
    iconType: 'ancient',
    description: 'Patinovaný historický pergamen a textury horských kaňonů',
    gradientBg: 'from-amber-950/60 to-yellow-950/30',
    accentBorder: 'border-amber-600',
  },
  {
    id: 'cutout',
    label: 'Vystřihovanka',
    iconType: 'cutout',
    description: 'Vrstvy řezaného papíru s hloubkovým 3D stínováním',
    gradientBg: 'from-amber-900/30 to-orange-950/40',
    accentBorder: 'border-amber-500',
  },
  {
    id: 'watercolor',
    label: 'Akvarel',
    iconType: 'watercolor',
    description: 'Jemné vodovkové rozpíjení, organické přechody a umělecký tón',
    gradientBg: 'from-teal-950/40 to-sky-950/40',
    accentBorder: 'border-teal-400',
  },
];

const STYLE_PROMPT_KEYWORDS: Record<string, string> = {
  auto: '',
  custom: '',
  classic: 'klasický styl',
  board: 'tabule styl',
  anime: 'anime styl',
  retro: 'retro tisk styl',
  kawaii: 'kawaii styl',
  cyberpunk: 'cyberpunk neon styl',
  fintech: 'fintech smaragd styl',
  ancient: 'starodávný styl',
  cutout: 'vystřihovanka styl',
  watercolor: 'akvarel styl',
};

export function buildNotebookLMPrompt(config: NotebookLMStudioConfig): string {
  const countPrefix =
    config.batchCount > 1
      ? `Vytvoř ${config.batchCount} videí`
      : `Vytvoř 7s video`;
  const platformText = config.format === '9:16' ? 'na TikTok (9:16)' : 'na YouTube (16:9)';
  const styleText = STYLE_PROMPT_KEYWORDS[config.visualStyle]
    ? `, vizuální styl ${STYLE_PROMPT_KEYWORDS[config.visualStyle]}`
    : '';
  const cleanCustom = config.customPrompt
    .replace(/(?:^|\s)(vytvoř|udělej|vygeneruj)(?:\s+\d+)?(?:\s+virálních)?(?:\s+(?:videí|videa|video))?/giu, ' ')
    .replace(/(?:^|\s)na\s+(?:tik\s*tok|tiktok|youtube(?:\s+shorts)?|instagram(?:\s+reels)?|reels|shorts)/giu, ' ')
    .replace(/(?:^|\s)s\s+dynamickým\s+střihem/giu, ' ')
    .replace(/(?:^|\s)(?:videí|videa|video)(?=$|\s)/giu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .trim();
  const topicSegment = cleanCustom.length >= 3 ? ` na téma ${cleanCustom}` : '';
  return `${countPrefix} ${platformText}${styleText}, jazyk ${config.language} (${config.sourceCount} zdrojů)${topicSegment}.`;
}

const ALL_NOTEBOOKLM_SOURCES: string[] = [
  'YouTube virální transcripty (2026 dataset)',
  'TikTok retention modely a pattern interrupts',
  'Instagram Reels vizuální hook blueprinty',
  'Databáze 16 AI agentů NEXUS X OS',
  'Statistické finanční projekce (50 000 Kč měsíčně)',
  'MoviePy 2.x optimalizované storyboard skripty',
  'Ad-Safety & 100% Monetization Guardrails',
  '5jádrový Comment Swarm CRM konverzní log',
  'Hardcore Kino Rig: ARRI/RED barevný pipeline',
  'České TTS & dynamické karaoke titulky (-14 LUFS)',
  'Affiliate & SaaS B2B trychtýřové CTA šablony',
  'Boardroom konsenzuální strategie a KPI',
];

export const NotebookLMStudioModal: React.FC<NotebookLMStudioModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  isGenerating = false,
}) => {
  const [format, setFormat] = useState<'9:16' | '16:9'>('9:16');
  const [batchCount, setBatchCount] = useState<1 | 3 | 5>(5);
  const [language, setLanguage] = useState('Čeština (výchozí)');
  const [selectedStyle, setSelectedStyle] = useState<string>('auto');
  const [customPrompt, setCustomPrompt] = useState('Vytvoř 5 virálních videí na TikTok s dynamickým střihem');
  const [isSourcesMenuOpen, setIsSourcesMenuOpen] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>(ALL_NOTEBOOKLM_SOURCES);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleApplyPresetPrompt = (txt: string) => {
    setCustomPrompt(txt);
  };

  const toggleSource = (src: string) => {
    setSelectedSources((prev) =>
      prev.includes(src) ? (prev.length > 1 ? prev.filter((s) => s !== src) : prev) : [...prev, src]
    );
  };

  const handleExecute = (overrideBatchCount?: 1 | 3 | 5) => {
    const finalCount = overrideBatchCount ?? batchCount;
    onGenerate({
      format,
      batchCount: finalCount,
      language,
      sourceCount: selectedSources.length,
      visualStyle: selectedStyle,
      customPrompt,
      narrativeFocus: customPrompt,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Přizpůsobení videopřehledu Google NotebookLM Studio"
      data-testid="notebooklm-studio-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-5 overflow-y-auto"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-zinc-800 bg-[#16181d] text-zinc-100 shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Top Header */}
        <div className="relative pt-6 pb-2 px-6 flex flex-col items-center text-center">
          <button
            type="button"
            data-testid="close-notebooklm-modal"
            aria-label="Zavřít"
            onClick={onClose}
            className="absolute top-5 right-5 rounded-full p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Magic Wand Icon Circle */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#202738] text-blue-400 border border-blue-500/20 shadow-lg shadow-blue-500/10 mb-3">
            <Sparkles className="h-6 w-6" />
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-white">
            Přizpůsobení videopřehledu
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Google NotebookLM Studio · Autonomní tvorba a syntéza ze zdrojů
          </p>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 text-sm">
          {/* 1. Vyberte formát */}
          <div className="space-y-2.5">
            <label className="block text-sm font-medium text-zinc-200">
              Vyberte formát
            </label>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                data-testid="notebooklm-format-short"
                onClick={() => setFormat('9:16')}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition border ${
                  format === '9:16'
                    ? 'border-blue-500 bg-blue-600/20 text-white shadow-sm'
                    : 'border-zinc-700 bg-transparent text-zinc-300 hover:border-zinc-600'
                }`}
              >
                {format === '9:16' && <Check className="h-3.5 w-3.5 text-blue-400" />}
                <span>Krátký ▯</span>
                <span className="rounded-full bg-blue-500 text-[10px] font-bold text-black px-2 py-0.5">
                  Novinka!
                </span>
              </button>

              <button
                type="button"
                data-testid="notebooklm-format-explainer"
                onClick={() => setFormat('16:9')}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition border ${
                  format === '16:9'
                    ? 'border-blue-500 bg-blue-600/20 text-white shadow-sm'
                    : 'border-zinc-700 bg-transparent text-zinc-300 hover:border-zinc-600'
                }`}
              >
                {format === '16:9' && <Check className="h-3.5 w-3.5 text-blue-400" />}
                <span>Vysvětlení ▭</span>
              </button>
            </div>
            <p className="text-xs text-zinc-400 pl-1">
              {format === '9:16'
                ? 'Na výšku · virální TikTok, YouTube Shorts a Instagram Reels s okamžitým háčkem'
                : 'Na šířku · komplexní přehled všech témat s detailní analýzou pro YouTube'}
            </p>
          </div>

          {/* 1b. Počet videí v sérii */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-200">
                Počet videí v sérii
              </label>
              <span className="text-xs text-blue-400 font-medium">
                {batchCount === 5 ? '5× Unikátní epizody' : `${batchCount} video`}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([1, 3, 5] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  data-testid={`notebooklm-batch-${cnt}`}
                  onClick={() => setBatchCount(cnt)}
                  className={`rounded-xl py-2 px-3 text-xs font-medium border text-center transition ${
                    batchCount === cnt
                      ? 'border-blue-500 bg-blue-500/15 text-white font-bold'
                      : 'border-zinc-800 bg-[#1c1f26] text-zinc-400 hover:text-white'
                  }`}
                >
                  <div>{cnt} {cnt === 1 ? 'video' : cnt < 5 ? 'videa' : 'videí'}</div>
                  {cnt === 5 && (
                    <div className="text-[10px] text-blue-400 font-normal mt-0.5">Doporučeno</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Zvolte jazyk */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-200">
              Zvolte jazyk
            </label>
            <div className="relative">
              <select
                aria-label="Zvolte jazyk videa"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full appearance-none rounded-xl border border-zinc-800 bg-[#1c1f26] px-4 py-2.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none pr-10"
              >
                <option value="Čeština (výchozí)">Čeština (výchozí)</option>
                <option value="Angličtina (English)">Angličtina (English)</option>
                <option value="Slovenština (Slovenčina)">Slovenština (Slovenčina)</option>
                <option value="Němčina (Deutsch)">Němčina (Deutsch)</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-zinc-400" />
            </div>
          </div>

          {/* 3. Vyberte zdroje */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-200">
              Vyberte zdroje
            </label>
            <div className="relative">
              <button
                type="button"
                data-testid="notebooklm-sources-toggle"
                onClick={() => setIsSourcesMenuOpen(!isSourcesMenuOpen)}
                className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#1c1f26] px-4 py-2.5 text-xs text-zinc-200 hover:border-zinc-700 transition"
              >
                <FolderGit2 className="h-4 w-4 text-blue-400" />
                <span className="font-medium">
                  {selectedSources.length} / {ALL_NOTEBOOKLM_SOURCES.length} zdrojů
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400 ml-1" />
              </button>

              {isSourcesMenuOpen && (
                <div className="mt-2 rounded-xl border border-zinc-800 bg-[#1e222b] p-3 text-xs space-y-2 text-zinc-300 shadow-xl">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase text-blue-400">
                      Aktivní zdroje v NotebookLM ({selectedSources.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedSources(ALL_NOTEBOOKLM_SOURCES)}
                      className="text-[10px] font-mono text-zinc-400 hover:text-white underline"
                    >
                      Vybrat vše
                    </button>
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1.5 text-[11px] text-zinc-300 pr-1">
                    {ALL_NOTEBOOKLM_SOURCES.map((src) => (
                      <label key={src} className="flex items-center gap-2 cursor-pointer hover:text-white">
                        <input
                          type="checkbox"
                          checked={selectedSources.includes(src)}
                          onChange={() => toggleSource(src)}
                          className="rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-0"
                        />
                        <span>{src}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4. Vyberte vizuální styl */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-zinc-200">
                Vyberte vizuální styl
              </label>
              <span className="text-[11px] text-zinc-400">
                Posuňte vodorovně
              </span>
            </div>

            {/* Horizontal Scroll Gallery */}
            <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth">
              {VISUAL_STYLES.map((style) => {
                const isSelected = selectedStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    data-testid={`notebooklm-style-${style.id}`}
                    onClick={() => setSelectedStyle(style.id)}
                    className={`group relative flex w-24 shrink-0 flex-col items-center rounded-2xl border p-2.5 text-center transition ${
                      isSelected
                        ? `${style.accentBorder} bg-blue-500/10 shadow-md`
                        : 'border-zinc-800 bg-[#1c1f26] hover:border-zinc-700'
                    }`}
                  >
                    {/* Thumbnail Stage */}
                    <div
                      className={`relative flex h-14 w-full items-center justify-center rounded-xl bg-gradient-to-br ${style.gradientBg} overflow-hidden border border-white/5 mb-2`}
                    >
                      {isSelected && (
                        <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-black">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </div>
                      )}

                      {/* Icon / Illustration Representation */}
                      {style.iconType === 'auto' && (
                        <RefreshCw className="h-5 w-5 text-blue-400 animate-spin-slow" />
                      )}
                      {style.iconType === 'custom' && (
                        <Wand2 className="h-5 w-5 text-zinc-300" />
                      )}
                      {style.iconType === 'classic' && (
                        <div className="h-6 w-8 rounded-t-full border-t-2 border-x-2 border-sky-400 flex items-center justify-center text-[8px] text-sky-400">
                          🏛️
                        </div>
                      )}
                      {style.iconType === 'board' && (
                        <div className="font-mono text-[9px] text-cyan-300 font-bold border border-cyan-400/40 rounded p-1">
                          A ➔ B
                        </div>
                      )}
                      {style.iconType === 'anime' && (
                        <div className="text-base select-none">⛩️ ⚡</div>
                      )}
                      {style.iconType === 'retro' && (
                        <div className="font-serif text-xs font-black text-orange-400 tracking-wider">
                          RETRO
                        </div>
                      )}
                      {style.iconType === 'kawaii' && (
                        <div className="text-base select-none">ฅ^•ﻌ•^ฅ</div>
                      )}
                      {style.iconType === 'cyberpunk' && (
                        <div className="font-mono text-[9px] text-cyan-300 font-bold">
                          CYBER
                        </div>
                      )}
                      {style.iconType === 'fintech' && (
                        <div className="text-emerald-400 font-mono text-[10px] font-bold">
                          📈 84%
                        </div>
                      )}
                      {style.iconType === 'ancient' && (
                        <div className="text-base select-none">🏔️ 📜</div>
                      )}
                      {style.iconType === 'cutout' && (
                        <div className="text-base select-none">✂️ 📐</div>
                      )}
                      {style.iconType === 'watercolor' && (
                        <div className="text-base select-none">🎨 💧</div>
                      )}
                    </div>

                    <span className="text-[11px] font-medium text-zinc-200 truncate w-full">
                      {style.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Jak chcete video přizpůsobit? */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-200">
              Jak chcete video přizpůsobit?
            </label>
            <div className="rounded-2xl border border-blue-500/70 bg-[#16181d] p-3 focus-within:border-blue-400 transition shadow-inner">
              <textarea
                rows={3}
                aria-label="Instrukce pro přizpůsobení videa"
                data-testid="notebooklm-prompt-input"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Napište, na jaký aspekt tématu se má video zaměřit..."
                className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
              />

              <div className="mt-2.5 pt-2.5 border-t border-zinc-800/80 text-[11px] text-zinc-400 space-y-1">
                <div className="font-medium text-zinc-300">Doporučené přístupy k vyzkoušení:</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => handleApplyPresetPrompt('Vytvoř 5 virálních videí na TikTok o AI nástrojích')}
                    className="rounded-full bg-zinc-800/80 hover:bg-zinc-700 px-2.5 py-1 text-[10px] text-zinc-300 transition"
                  >
                    • 5 TikTok videí o AI nástrojích
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetPrompt('Zaměř se na automatizaci 30 videí za 0 Kč bez natáčení')}
                    className="rounded-full bg-zinc-800/80 hover:bg-zinc-700 px-2.5 py-1 text-[10px] text-zinc-300 transition"
                  >
                    • Automatizace za 0 Kč
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetPrompt('Vytvoř video s překvapivým zvratem a CTA na demo')}
                    className="rounded-full bg-zinc-800/80 hover:bg-zinc-700 px-2.5 py-1 text-[10px] text-zinc-300 transition"
                  >
                    • Narativní zvrat a silné CTA
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with AI Quota Bar & Action Buttons */}
        <div className="border-t border-zinc-800 bg-[#14161b] px-6 py-4 space-y-3.5">
          {/* Využití AI Quota */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span className="font-semibold text-zinc-300">Využití AI</span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                  <span>Již použito (28 %)</span>
                </span>
                <span className="flex items-center gap-1.5 text-indigo-300">
                  <span className="h-2 w-2 rounded-full bg-indigo-400"></span>
                  <span>Očekávané použití ({batchCount * 6}s)</span>
                </span>
              </div>
            </div>

            {/* Segmented Bar */}
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden flex">
              <div className="h-full bg-blue-500 w-[28%]"></div>
              <div className="h-full bg-indigo-400 w-[22%] animate-pulse"></div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              data-testid="notebooklm-batch-button"
              disabled={isGenerating}
              onClick={() => {
                setBatchCount(5);
                handleExecute(5);
              }}
              className="rounded-full border border-zinc-700 bg-transparent px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-zinc-500 hover:text-white transition disabled:opacity-50"
            >
              Vygenerovat sérii 5 videí...
            </button>

            <button
              type="button"
              data-testid="notebooklm-generate-button"
              disabled={isGenerating || !customPrompt.trim()}
              onClick={() => handleExecute()}
              className="flex items-center gap-2 rounded-full bg-[#3b82f6] hover:bg-blue-600 px-6 py-2 text-xs font-bold text-white shadow-lg shadow-blue-500/20 disabled:opacity-50 transition"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Generuji v NotebookLM...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 fill-current" />
                  <span>Vygenerovat</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
