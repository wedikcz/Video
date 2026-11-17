/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  Copy,
  Film,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  FactoryAsset,
  HardcoreRealismProfile,
  MonetizationCheatsheetBlueprint,
  StructuredVideoPrompt,
} from '../types/nexus.ts';
import {
  DEFAULT_HARDCORE_REALISM_PROFILE,
  MONETIZATION_CHEATSHEETS,
  applyBlueprintToPrompt,
  evaluateMonetizationReadiness,
  optimizePromptForMonetization,
} from '../utils/monetizationCheatsheets.ts';
import { copyTextSafely } from '../utils/clipboard.ts';

interface MonetizationCheatsheetsPanelProps {
  structuredPrompt: StructuredVideoPrompt;
  currentAsset?: FactoryAsset | null;
  onApplyPrompt: (nextPrompt: StructuredVideoPrompt, notice: string) => void;
  onSyncToPublish?: (title: string, format: '9:16' | '16:9') => void;
}

export const MonetizationCheatsheetsPanel: React.FC<MonetizationCheatsheetsPanelProps> = ({
  structuredPrompt,
  currentAsset,
  onApplyPrompt,
  onSyncToPublish,
}) => {
  const [activeTab, setActiveTab] = useState<'cheatsheets' | 'audit' | 'realism'>('cheatsheets');
  const [copiedKit, setCopiedKit] = useState(false);

  const audit = evaluateMonetizationReadiness(structuredPrompt, currentAsset);
  const realism = structuredPrompt.realismProfile || DEFAULT_HARDCORE_REALISM_PROFILE;

  const handleApplyBlueprint = (bp: MonetizationCheatsheetBlueprint) => {
    const next = applyBlueprintToPrompt(structuredPrompt, bp);
    onApplyPrompt(
      next,
      `Blueprint "${bp.title}" (${bp.format}) a jeho monetizační sada byly aplikovány do studia.`
    );
  };

  const handleOptimizeAll = () => {
    const res = optimizePromptForMonetization(structuredPrompt);
    onApplyPrompt(
      res.structuredPrompt,
      `Prompt byl optimalizován pro 100% monetizovatelnost (${res.audit.score}/100) a Ad-Safety.`
    );
  };

  const handleRealismPatch = (patch: Partial<HardcoreRealismProfile>) => {
    onApplyPrompt(
      {
        ...structuredPrompt,
        realismProfile: {
          ...realism,
          ...patch,
        },
      },
      'Hardcore kino profil kamery a barevného pipeline byl aktualizován.'
    );
  };

  const copyMonetizationKit = async () => {
    const kit = structuredPrompt.monetizationKit;
    if (!kit) return;
    const text = [
      `SEO Titulek: ${kit.seoTitle}`,
      `Úvodní Hook: ${kit.hookLine}`,
      `Konverzní CTA: ${kit.ctaLine}`,
      `Brand-Safe Tagy: ${kit.brandSafeTags.map((t) => `#${t}`).join(' ')}`,
    ].join('\n');
    const ok = await copyTextSafely(text);
    if (ok) {
      setCopiedKit(true);
      setTimeout(() => setCopiedKit(false), 2000);
    }
  };

  return (
    <section
      data-testid="monetization-cheatsheets-panel"
      className="rounded-lg border border-emerald-500/30 bg-zinc-900/50 p-4 space-y-4 font-mono text-xs"
    >
      {/* Header Row */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Award className="h-4 w-4 text-emerald-400 shrink-0" />
            <h2 className="font-bold text-white text-xs uppercase tracking-wide">
              Chytré Cheatsheety pro 100% Monetizovatelná Videa &amp; Hardcore Studio Rig
            </h2>
            <span
              data-testid="monetization-score-badge"
              className={`text-[11px] font-bold tabular-nums ${
                audit.is100PercentMonetizable
                  ? 'text-emerald-400'
                  : audit.adSafe
                  ? 'text-amber-300'
                  : 'text-rose-400'
              }`}
            >
              · Připravenost monetizace {audit.score}/100
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Ověřené recepty pro vysoké RPM, udržení pozornosti (&gt;100 % smyčky), Ad-Safety ochranu a realistickou filmovou optiku.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center rounded border border-zinc-800 bg-zinc-950 p-0.5">
            <button
              type="button"
              data-testid="cheatsheet-tab-blueprints"
              onClick={() => setActiveTab('cheatsheets')}
              className={`rounded px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition ${
                activeTab === 'cheatsheets'
                  ? 'bg-emerald-500 text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Monetizační Cheatsheety ({MONETIZATION_CHEATSHEETS.length})
            </button>
            <button
              type="button"
              data-testid="cheatsheet-tab-audit"
              onClick={() => setActiveTab('audit')}
              className={`rounded px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition ${
                activeTab === 'audit'
                  ? 'bg-cyan-400 text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Audit 100% Monetizace ({audit.checks.filter((c) => c.passed).length}/{audit.checks.length})
            </button>
            <button
              type="button"
              data-testid="cheatsheet-tab-realism"
              onClick={() => setActiveTab('realism')}
              className={`rounded px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition ${
                activeTab === 'realism'
                  ? 'bg-amber-400 text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Hardcore Kino Rig
            </button>
          </div>

          <button
            type="button"
            data-testid="optimize-monetization-btn"
            onClick={handleOptimizeAll}
            className="flex items-center gap-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-1.5 font-bold text-[11px] whitespace-nowrap transition"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Optimalizovat na 100 %</span>
          </button>
        </div>
      </div>

      {/* TAB 1: MONETIZATION CHEATSHEET BLUEPRINTS */}
      {activeTab === 'cheatsheets' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {MONETIZATION_CHEATSHEETS.map((bp) => (
            <div
              key={bp.id}
              data-testid={`cheatsheet-card-${bp.id}`}
              className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-3.5 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2 border-b border-zinc-800/80 pb-2">
                  <div>
                    <div className="text-[10px] text-cyan-400">
                      {bp.platform} · {bp.format} · {bp.rpmTier}
                    </div>
                    <h3 className="font-bold text-white text-xs mt-0.5">{bp.title}</h3>
                  </div>
                  <button
                    type="button"
                    data-testid={`apply-blueprint-${bp.id}`}
                    onClick={() => handleApplyBlueprint(bp)}
                    className="rounded border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1 text-[10px] font-bold text-emerald-300 whitespace-nowrap shrink-0 transition"
                  >
                    Aplikovat Blueprint
                  </button>
                </div>

                <div className="space-y-1 text-[11px] leading-relaxed">
                  <div className="text-zinc-300">
                    <span className="text-emerald-400 font-bold">Hook formule:</span> {bp.hookFormula}
                  </div>
                  <div className="text-zinc-300">
                    <span className="text-cyan-400 font-bold">Kamera &amp; tempo:</span> {bp.cameraRecipe}
                  </div>
                  <div className="text-zinc-400">
                    <span className="text-amber-300 font-bold">Ad-Safety:</span> {bp.adSafetyRule}
                  </div>
                </div>

                <ul className="space-y-1 pt-1 border-t border-zinc-800/60 text-[10px] text-zinc-400">
                  {bp.checklist.map((item) => (
                    <li key={item} className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-zinc-800/70 flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                <span className="truncate">CTA: {bp.monetizationKit.ctaLine}</span>
                {onSyncToPublish && (
                  <button
                    type="button"
                    onClick={() => {
                      handleApplyBlueprint(bp);
                      onSyncToPublish(bp.monetizationKit.seoTitle, bp.format);
                    }}
                    className="text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0 underline"
                  >
                    Publikovat sadu
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: LIVE 100% MONETIZATION AUDIT & EXPORT KIT */}
      {activeTab === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-2">
            {audit.checks.map((check) => (
              <div
                key={check.id}
                className={`rounded-lg border p-2.5 flex items-start justify-between gap-3 ${
                  check.passed
                    ? 'border-emerald-500/30 bg-emerald-950/15'
                    : 'border-amber-500/40 bg-amber-950/15'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  {check.passed ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-white text-[11px]">{check.label}</div>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{check.detail}</p>
                    {!check.passed && check.fixHint && (
                      <p className="text-[10px] text-amber-300 mt-1">Doporučení: {check.fixHint}</p>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold shrink-0 ${
                    check.passed ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {check.passed ? 'SPLNĚNO' : 'DOPLNIT'}
                </span>
              </div>
            ))}
          </div>

          <div className="lg:col-span-5 rounded-lg border border-zinc-800 bg-zinc-950 p-3.5 space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="flex items-center gap-1.5 font-bold text-cyan-300 text-[11px] uppercase">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>Monetizační Export Kit</span>
                </span>
                {structuredPrompt.monetizationKit && (
                  <button
                    type="button"
                    onClick={copyMonetizationKit}
                    className="flex items-center gap-1 text-[10px] text-zinc-300 hover:text-white"
                  >
                    {copiedKit ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedKit ? 'Zkopírováno' : 'Kopírovat sadu'}</span>
                  </button>
                )}
              </div>

              {structuredPrompt.monetizationKit ? (
                <div className="space-y-2 text-[11px]">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">SEO Titulek videa</span>
                    <span className="text-white font-semibold">{structuredPrompt.monetizationKit.seoTitle}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Úvodní mluvený / textový Hook</span>
                    <span className="text-emerald-300">{structuredPrompt.monetizationKit.hookLine}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Monetizační CTA</span>
                    <span className="text-amber-200">{structuredPrompt.monetizationKit.ctaLine}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Brand-Safe Hashtagy</span>
                    <span className="text-zinc-300">
                      {structuredPrompt.monetizationKit.brandSafeTags.map((t) => `#${t}`).join(' · ')}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-zinc-400 space-y-2 py-2">
                  <p>
                    Klikněte na &quot;Optimalizovat na 100 %&quot; nebo vyberte některý z Monetizačních Cheatsheetů pro automatické vygenerování SEO titulku, hooku a Brand-Safe tagů.
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleOptimizeAll}
              className="w-full rounded bg-cyan-400 hover:bg-cyan-300 text-black font-bold py-2 text-[11px] transition flex items-center justify-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Automaticky doladit vše pro monetizaci</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: HARDCORE REALISM CINEMA RIG & COLOR SCIENCE */}
      {activeTab === 'realism' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-1.5 block">
            <span className="flex items-center gap-1.5 text-[10px] text-amber-300 font-bold uppercase">
              <Film className="h-3.5 w-3.5" />
              <span>Digitální kino senzor</span>
            </span>
            <select
              value={realism.cameraBody}
              onChange={(e) => handleRealismPatch({ cameraBody: e.target.value })}
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white"
            >
              <option value="ARRI Alexa 65 · 6.5K Open Gate">ARRI Alexa 65 · 6.5K Open Gate</option>
              <option value="RED V-Raptor 8K VV">RED V-Raptor 8K VV</option>
              <option value="Sony FX6 · CineWhoop FPV Rig">Sony FX6 · CineWhoop FPV Rig</option>
              <option value="Leica SL3 · Macro Studio">Leica SL3 · Macro Studio</option>
            </select>
          </label>

          <label className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-1.5 block">
            <span className="flex items-center gap-1.5 text-[10px] text-cyan-300 font-bold uppercase">
              <Sliders className="h-3.5 w-3.5" />
              <span>Úhel závěrky (Motion Blur)</span>
            </span>
            <select
              value={realism.shutterAngle}
              onChange={(e) =>
                handleRealismPatch({
                  shutterAngle: e.target.value as HardcoreRealismProfile['shutterAngle'],
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white"
            >
              <option value="180deg_cinematic">180° Filmový standard (přirozený blur)</option>
              <option value="90deg_crisp_action">90° Ostrá akce / FPV průlet</option>
              <option value="360deg_dreamy">360° Snový pomalý pohyb</option>
            </select>
          </label>

          <label className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-1.5 block">
            <span className="text-[10px] text-emerald-300 font-bold uppercase block">
              Color Science Pipeline
            </span>
            <select
              value={realism.colorPipeline}
              onChange={(e) =>
                handleRealismPatch({
                  colorPipeline: e.target.value as HardcoreRealismProfile['colorPipeline'],
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white"
            >
              <option value="ACES_filmic">ACES Filmic HDR (Hollywood Standard)</option>
              <option value="ARRI_LogC4">ARRI LogC4 Reveal</option>
              <option value="RED_IPP2">RED IPP2 High Contrast</option>
              <option value="Rec709_broadcast">Rec.709 Broadcast Clean</option>
            </select>
          </label>

          <label className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-1.5 block">
            <span className="text-[10px] text-purple-300 font-bold uppercase block">
              Audio Master &amp; Zrno snímače
            </span>
            <select
              value={realism.audioLufsTarget}
              onChange={(e) =>
                handleRealismPatch({
                  audioLufsTarget: e.target.value as HardcoreRealismProfile['audioLufsTarget'],
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white"
            >
              <option value="-14_LUFS_social">-14 LUFS (Shorts / TikTok / Reels)</option>
              <option value="-16_LUFS_youtube">-16 LUFS (YouTube 16:9 Longform)</option>
              <option value="-23_LUFS_cinema">-23 LUFS (Cinema / Broadcast)</option>
            </select>
          </label>
        </div>
      )}
    </section>
  );
};
