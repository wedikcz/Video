/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Camera,
  GripVertical,
  Layers,
  Palette,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import {
  PromptBuilderTag,
  PromptTagCategory,
  StructuredVideoPrompt,
} from '../types/nexus.ts';
import {
  VISUAL_DRAG_TAGS,
  applyVisualTagToPrompt,
  removeVisualTagFromPrompt,
} from '../utils/monetizationCheatsheets.ts';

import { resolveSelectedStyleTag } from '../utils/aiSmartEnhance.ts';
import { parseStructuredPromptFromText } from '../utils/structuredVideoPrompt.ts';

export const PROMPT_TAG_DRAG_MIME = 'application/x-nexus-prompt-tag';

interface VisualPromptBuilderProps {
  value: StructuredVideoPrompt;
  rawPrompt: string;
  onRawPromptChange: (text: string) => void;
  onChange: (next: StructuredVideoPrompt) => void;
  onSmartParse: () => void;
  onSmartEnhance: () => void;
  onAiSmartEnhance?: () => void;
  isProcessing?: boolean;
  isAiEnhancing?: boolean;
  aiEnhanceNotes?: string[] | null;
}

type PaletteTab = 'camera' | 'style' | 'realism' | 'monetization';

const PALETTE_TABS: Array<{ id: PaletteTab; label: string }> = [
  { id: 'camera', label: 'Pohyby kamery (9)' },
  { id: 'style', label: 'Styl, Optika & Světlo' },
  { id: 'realism', label: 'Hardcore Realismus' },
  { id: 'monetization', label: 'Monetizace & Hooky' },
];

export function serializeTagPayload(tag: PromptBuilderTag): string {
  return JSON.stringify(tag);
}

export function parseTagPayload(dataTransfer: DataTransfer): PromptBuilderTag | null {
  try {
    const raw =
      dataTransfer.getData(PROMPT_TAG_DRAG_MIME) ||
      dataTransfer.getData('text/plain');
    if (!raw) return null;
    if (raw.startsWith('{')) {
      return JSON.parse(raw) as PromptBuilderTag;
    }
    return VISUAL_DRAG_TAGS.find((t) => t.id === raw) || null;
  } catch {
    return null;
  }
}

export const VisualPromptBuilder: React.FC<VisualPromptBuilderProps> = ({
  value,
  rawPrompt,
  onRawPromptChange,
  onChange,
  onSmartParse,
  onSmartEnhance,
  onAiSmartEnhance,
  isProcessing = false,
  isAiEnhancing = false,
  aiEnhanceNotes = null,
}) => {
  const [activePaletteTab, setActivePaletteTab] = useState<PaletteTab>('camera');
  const [isDragOver, setIsDragOver] = useState(false);
  const [showNegativeInput, setShowNegativeInput] = useState(false);
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const activeStyleContext = resolveSelectedStyleTag(value);

  const visibleTags = VISUAL_DRAG_TAGS.filter((tag) => {
    if (activePaletteTab === 'camera') return tag.category === 'camera';
    if (activePaletteTab === 'style') {
      return (
        tag.category === 'style' ||
        tag.category === 'optics' ||
        tag.category === 'lighting' ||
        tag.category === 'atmosphere'
      );
    }
    return tag.category === activePaletteTab;
  });

  const activeTagIds = value.activeTagIds || [];
  const activeTagObjects = activeTagIds
    .map((id) => VISUAL_DRAG_TAGS.find((t) => t.id === id))
    .filter((t): t is PromptBuilderTag => Boolean(t));

  const applyTag = (tag: PromptBuilderTag) => {
    const base: StructuredVideoPrompt = {
      ...value,
      rawPrompt,
    };
    const result = applyVisualTagToPrompt(base, tag);
    onRawPromptChange(result.structuredPrompt.rawPrompt);
    onChange(result.structuredPrompt);
    setDropNotice(result.notice);
    setTimeout(() => setDropNotice(null), 2800);
  };

  const handleRemoveTag = (tagId: string) => {
    const next = removeVisualTagFromPrompt({ ...value, rawPrompt }, tagId);
    onRawPromptChange(next.rawPrompt);
    onChange(next);
  };

  const handleClearTags = () => {
    let next = { ...value, rawPrompt };
    for (const id of activeTagIds) {
      next = removeVisualTagFromPrompt(next, id);
    }
    next.activeTagIds = [];
    onRawPromptChange(next.rawPrompt);
    onChange(next);
  };

  const handleDragStart = (e: React.DragEvent, tag: PromptBuilderTag) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(PROMPT_TAG_DRAG_MIME, serializeTagPayload(tag));
    e.dataTransfer.setData('text/plain', tag.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const tag = parseTagPayload(e.dataTransfer);
    if (tag) {
      applyTag(tag);
    }
  };

  const getCategoryAccent = (category: PromptTagCategory): string => {
    switch (category) {
      case 'camera':
        return 'border-amber-500/40 bg-amber-950/20 text-amber-200 hover:border-amber-400';
      case 'style':
        return 'border-cyan-500/40 bg-cyan-950/20 text-cyan-200 hover:border-cyan-400';
      case 'optics':
      case 'lighting':
      case 'atmosphere':
        return 'border-sky-500/35 bg-sky-950/20 text-sky-200 hover:border-sky-400';
      case 'realism':
        return 'border-purple-500/40 bg-purple-950/20 text-purple-200 hover:border-purple-400';
      case 'monetization':
      default:
        return 'border-emerald-500/40 bg-emerald-950/20 text-emerald-200 hover:border-emerald-400';
    }
  };

  return (
    <div
      data-testid="visual-prompt-builder"
      className="space-y-3 font-mono text-xs"
    >
      {/* Draggable Palette Header & Category Tabs */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <GripVertical className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span className="font-bold text-white text-[11px]">
              Vizuální paleta tagů — přetáhněte do pole níže nebo na fázi v časové ose
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Kategorie vizuálních tagů"
            className="flex flex-wrap items-center gap-1"
          >
            {PALETTE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activePaletteTab === tab.id}
                data-testid={`palette-tab-${tab.id}`}
                onClick={() => setActivePaletteTab(tab.id)}
                className={`rounded px-2.5 py-1 text-[10px] font-bold whitespace-nowrap transition ${
                  activePaletteTab === tab.id
                    ? 'bg-cyan-400 text-black'
                    : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Draggable Chips Grid */}
        <div
          data-testid="visual-tag-palette"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
        >
          {visibleTags.map((tag) => {
            const isActive = activeTagIds.includes(tag.id);
            return (
              <div
                key={tag.id}
                draggable
                onDragStart={(e) => handleDragStart(e, tag)}
                data-testid={`drag-tag-${tag.id}`}
                className={`group flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 cursor-grab active:cursor-grabbing transition select-none ${
                  isActive
                    ? 'border-emerald-400/80 bg-emerald-950/35 text-emerald-200 ring-1 ring-emerald-400/30'
                    : getCategoryAccent(tag.category)
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <GripVertical className="h-3.5 w-3.5 mt-0.5 text-zinc-500 group-hover:text-white shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-[11px] truncate flex items-center gap-1.5">
                      {tag.category === 'camera' && <Camera className="h-3 w-3 shrink-0" />}
                      {tag.category === 'style' && <Palette className="h-3 w-3 shrink-0" />}
                      {tag.category === 'realism' && <Sliders className="h-3 w-3 shrink-0" />}
                      {tag.category === 'monetization' && <ShieldCheck className="h-3 w-3 shrink-0" />}
                      <span>{tag.shortLabel}</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                      {tag.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => applyTag(tag)}
                  aria-label={`Přidat tag ${tag.label} do promptu`}
                  data-testid={`add-tag-${tag.id}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-zinc-700/80 bg-zinc-950/80 text-zinc-300 hover:border-emerald-400 hover:text-emerald-300 transition"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Dropzone + Generation Prompt Field */}
      <div
        data-testid="prompt-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border-2 p-3 space-y-2.5 transition ${
          isDragOver
            ? 'border-cyan-400 bg-cyan-950/25 shadow-lg shadow-cyan-950/40'
            : 'border-zinc-800 bg-zinc-950/90'
        }`}
      >
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2">
          <label htmlFor="structured-raw-prompt" className="text-[11px] font-bold text-zinc-200 flex flex-wrap items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>
              Generační pole promptu (přetáhněte sem kameru nebo styl, nebo pište přirozeně):
            </span>
            <span
              data-testid="active-style-context-badge"
              className="rounded border border-cyan-500/35 bg-cyan-950/35 px-2 py-0.5 text-[10px] font-bold text-cyan-200"
            >
              Styl: {activeStyleContext.tagLabel}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="structured-smart-parse-btn"
              disabled={isProcessing || isAiEnhancing || !rawPrompt.trim()}
              onClick={onSmartParse}
              className="flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 px-2.5 py-1 text-[11px] font-bold text-cyan-300 disabled:opacity-40 whitespace-nowrap transition"
            >
              <Layers className="h-3 w-3" />
              <span>Chytře rozložit do struktury</span>
            </button>
            <button
              type="button"
              data-testid="structured-smart-enhance-btn"
              disabled={isProcessing || isAiEnhancing || !rawPrompt.trim()}
              onClick={onSmartEnhance}
              className="flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300 disabled:opacity-40 whitespace-nowrap transition"
            >
              <Wand2 className={`h-3 w-3 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>Chytře vylepšit (Lokálně)</span>
            </button>
            {onAiSmartEnhance && (
              <button
                type="button"
                data-testid="ai-smart-enhance-btn"
                disabled={isProcessing || isAiEnhancing || !rawPrompt.trim()}
                onClick={onAiSmartEnhance}
                title={`AI rozšíření promptu pomocí Gemini podle zvoleného stylu: ${activeStyleContext.tagLabel}`}
                className="flex items-center gap-1.5 rounded border border-amber-400/50 bg-gradient-to-r from-amber-500/20 to-cyan-500/20 hover:from-amber-500/30 hover:to-cyan-500/30 px-2.5 py-1 text-[11px] font-bold text-amber-200 disabled:opacity-40 whitespace-nowrap transition shadow-sm"
              >
                <Sparkles className={`h-3 w-3 text-amber-300 ${isAiEnhancing ? 'animate-spin' : ''}`} />
                <span>{isAiEnhancing ? 'AI rozšiřuje…' : 'AI Smart Enhance'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNegativeInput(!showNegativeInput)}
              className="text-[11px] text-zinc-400 hover:text-white whitespace-nowrap px-1.5"
            >
              {showNegativeInput ? 'Skrýt negativní prompt' : '+ Negativní prompt'}
            </button>
          </div>
        </div>

        {/* Active Dropped Tags Tray */}
        {(activeTagObjects.length > 0 || dropNotice || isDragOver) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {isDragOver && (
              <span className="text-[11px] font-bold text-cyan-300">
                Pusťte zde pro vložení do struktury scény…
              </span>
            )}
            {activeTagObjects.map((tag) => (
              <span
                key={tag.id}
                data-testid={`active-drop-tag-${tag.id}`}
                className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-950/35 px-2 py-0.5 text-[10px] text-emerald-200"
              >
                <span>{tag.shortLabel}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag.id)}
                  aria-label={`Odebrat tag ${tag.shortLabel}`}
                  className="text-zinc-400 hover:text-rose-400 transition"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {activeTagObjects.length > 0 && (
              <button
                type="button"
                onClick={handleClearTags}
                className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200 ml-1"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Vyčistit tagy</span>
              </button>
            )}
            {dropNotice && (
              <span className="text-[10px] text-cyan-300 ml-auto">{dropNotice}</span>
            )}
          </div>
        )}

        <textarea
          id="structured-raw-prompt"
          data-testid="structured-raw-prompt-input"
          rows={3}
          value={rawPrompt}
          onChange={(e) => {
            const nextText = e.target.value;
            onRawPromptChange(nextText);
            if (!nextText.trim()) {
              onChange({ ...value, rawPrompt: nextText });
              return;
            }
            const reparsed = parseStructuredPromptFromText(nextText, {
              aspectRatio: value.aspectRatio,
              durationSec: value.totalDurationSec,
              fps: value.fps,
              visualStyle: value.style.visualStyle,
              cameraMotion: value.camera.primaryMotion,
              motionIntensity: value.camera.motionIntensity,
              negativePrompt: value.style.negativePrompt,
            });
            onChange({
              ...reparsed,
              rawPrompt: nextText,
              style: { ...value.style },
              camera: {
                ...value.camera,
                primaryMotion: value.camera.primaryMotion,
              },
              realismProfile: value.realismProfile,
              monetizationKit: value.monetizationKit,
              activeTagIds: value.activeTagIds,
            });
          }}
          placeholder="Přetáhněte sem předvolby kamery, stylu a realismu, nebo zadejte scénu přirozeně (např. 'Nejdříve nízký FPV dronový průlet nad mokrou Prahou...')..."
          className="w-full rounded border border-zinc-800 bg-zinc-900/75 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 resize-y"
        />

        {aiEnhanceNotes && aiEnhanceNotes.length > 0 && (
          <div
            data-testid="ai-enhance-notes"
            className="rounded border border-amber-500/35 bg-amber-950/20 px-3 py-2 space-y-1 text-[10px] text-amber-200"
          >
            <div className="font-bold uppercase tracking-wide text-amber-300">
              AI Smart Enhance režijní poznámky ({activeStyleContext.tagLabel}):
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-zinc-300">
              {aiEnhanceNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {showNegativeInput && (
          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">
              Negativní prompt (co ze scény vyloučit pro 100% kvalitu a Ad-Safety):
            </span>
            <input
              type="text"
              value={value.style.negativePrompt}
              onChange={(e) =>
                onChange({
                  ...value,
                  style: { ...value.style, negativePrompt: e.target.value },
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-700"
            />
          </label>
        )}
      </div>
    </div>
  );
};
