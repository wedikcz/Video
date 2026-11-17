/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Camera,
  Clock,
  Film,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronUp,
  Cpu,
} from 'lucide-react';
import {
  VisualPromptBuilder,
  parseTagPayload,
} from './VisualPromptBuilder.tsx';
import { applyVisualTagToPrompt } from '../utils/monetizationCheatsheets.ts';
import {
  AtmospherePreset,
  BeatPhase,
  BeatTransition,
  CameraComposition,
  CameraEasing,
  CameraStabilization,
  LightingPreset,
  OpenGenCameraMotion,
  OpticsPreset,
  StructuredVideoPrompt,
  TemporalPacing,
  TemporalSceneBeat,
  VideoVisualStyle,
} from '../types/nexus.ts';
import {
  ATMOSPHERE_LABELS,
  CAMERA_MOTION_LABELS,
  COMPOSITION_LABELS,
  LIGHTING_LABELS,
  OPTICS_LABELS,
  PHASE_LABELS,
  STRUCTURED_VIDEO_PRESETS,
  StructuredVideoPreset,
  TRANSITION_LABELS,
  VISUAL_STYLE_PALETTES,
  buildCameraTrajectoryForBeat,
  compileStructuredPromptText,
  rebalanceTemporalBeats,
  scoreStructuredPromptCompleteness,
} from '../utils/structuredVideoPrompt.ts';

interface StructuredPromptBuilderProps {
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

const PACING_LABELS: Record<TemporalPacing, string> = {
  explosive_hook: 'Výbušný úvodní hook (Rychlý nástup)',
  steady_narrative: 'Plynulý vyprávěcí rytmus',
  crescendo_build: 'Gradující crescendo do vyvrcholení',
  hypnotic_loop: 'Hypnotická plynulá smyčka',
};

const EASING_LABELS: Record<CameraEasing, string> = {
  linear: 'Lineární (konstantní rychlost)',
  ease_in_out: 'Plynulý nájezd a dojezd (Ease In/Out)',
  whip_accelerate: 'Dynamické zrychlení (Whip Accelerate)',
  handheld_micro: 'Mikro-pohyb z ruky (Organic Handheld)',
};

const STABILIZATION_LABELS: Record<CameraStabilization, string> = {
  gimbal_smooth: '3osý Gimbal (Smooth)',
  tripod_locked: 'Uzamčený stativ (Tripod Locked)',
  dynamic_fpv: 'Agilní FPV stabilizace',
  cinematic_dolly: 'Filmová kolejnice (Cinematic Dolly)',
};

export const StructuredPromptBuilder: React.FC<StructuredPromptBuilderProps> = ({
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
  const [showCompiledPreview, setShowCompiledPreview] = useState(false);
  const [dragOverBeatId, setDragOverBeatId] = useState<number | null>(null);

  const score = scoreStructuredPromptCompleteness(value);
  const compiledText = compileStructuredPromptText(value);

  const handleLoadPreset = (preset: StructuredVideoPreset) => {
    const p = preset.prompt;
    const visualStyle = p.style?.visualStyle || value.style.visualStyle;
    const palette = VISUAL_STYLE_PALETTES[visualStyle];
    const beats = p.temporal?.beats
      ? rebalanceTemporalBeats(
          p.temporal.beats.map((b) => ({ ...b })),
          p.totalDurationSec || value.totalDurationSec
        )
      : value.temporal.beats;

    const nextPrompt: StructuredVideoPrompt = {
      ...value,
      rawPrompt: preset.rawPrompt,
      aspectRatio: p.aspectRatio || value.aspectRatio,
      totalDurationSec: p.totalDurationSec || value.totalDurationSec,
      fps: (p.fps as 24 | 30 | 60) || value.fps,
      subject: p.subject ? { ...p.subject } : value.subject,
      style: p.style
        ? {
            ...p.style,
            accentColor: palette.accentColor,
            secondaryColor: palette.secondaryColor,
            bgHex: palette.bgHex,
          }
        : value.style,
      camera: p.camera ? { ...p.camera } : value.camera,
      temporal: {
        pacing: p.temporal?.pacing || value.temporal.pacing,
        beats,
      },
    };

    onRawPromptChange(preset.rawPrompt);
    onChange(nextPrompt);
  };

  const handleDurationChange = (nextDuration: number) => {
    const clamped = Math.max(4, Math.min(15, nextDuration));
    onChange({
      ...value,
      totalDurationSec: clamped,
      temporal: {
        ...value.temporal,
        beats: rebalanceTemporalBeats(value.temporal.beats, clamped),
      },
    });
  };

  const handleVisualStyleChange = (styleKey: VideoVisualStyle) => {
    const palette = VISUAL_STYLE_PALETTES[styleKey];
    onChange({
      ...value,
      style: {
        ...value.style,
        visualStyle: styleKey,
        colorGrading: palette.colorGrading,
        accentColor: palette.accentColor,
        secondaryColor: palette.secondaryColor,
        bgHex: palette.bgHex,
        lighting: palette.defaultLighting,
        optics: palette.defaultOptics,
        atmosphere: palette.defaultAtmosphere,
      },
    });
  };

  const handleBeatUpdate = (beatId: number, patch: Partial<TemporalSceneBeat>, rebalance = false) => {
    const updated = value.temporal.beats.map((b) => (b.id === beatId ? { ...b, ...patch } : b));
    const finalBeats = rebalance ? rebalanceTemporalBeats(updated, value.totalDurationSec) : updated;
    onChange({
      ...value,
      temporal: {
        ...value.temporal,
        beats: finalBeats,
      },
    });
  };

  const handleBeatCameraChange = (beatId: number, nextCam: OpenGenCameraMotion, phase: BeatPhase) => {
    const traj = buildCameraTrajectoryForBeat(nextCam, value.camera.motionIntensity, phase);
    handleBeatUpdate(beatId, {
      cameraKeyframe: nextCam,
      cameraZoomStart: traj.zoomStart,
      cameraZoomEnd: traj.zoomEnd,
      cameraPanX: traj.panX,
      cameraPanY: traj.panY,
    });
  };

  const handleAddBeat = () => {
    if (value.temporal.beats.length >= 6) return;
    const prev = value.temporal.beats[value.temporal.beats.length - 1];
    const nextMotion: OpenGenCameraMotion =
      prev?.cameraKeyframe === 'orbit_360' ? 'zoom_out' : 'orbit_360';
    const traj = buildCameraTrajectoryForBeat(nextMotion, value.camera.motionIntensity, 'climax_reveal');
    const newBeat: TemporalSceneBeat = {
      id: value.temporal.beats.length + 1,
      phase: 'climax_reveal',
      startSec: 0,
      endSec: 0,
      durationSec: 2,
      beatTitle: `FÁZE ${value.temporal.beats.length + 1}: VYVRCHOLENÍ`,
      sceneDescription: 'Rozvinutí detailu scény s novým úhlem kamery a zvýrazněním kontrastu.',
      subjectEvolution: 'Hlavní subjekt přechází do vrcholné pozice záběru',
      cameraKeyframe: nextMotion,
      cameraZoomStart: traj.zoomStart,
      cameraZoomEnd: traj.zoomEnd,
      cameraPanX: traj.panX,
      cameraPanY: traj.panY,
      lightingShift: `${LIGHTING_LABELS[value.style.lighting]} · akcentový záblesk`,
      transitionIn: 'whip_pan',
      kineticCaption: 'KLÍČOVÝ MOMENT SCÉNY',
      visualCue: `${OPTICS_LABELS[value.style.optics].split('(')[0].trim()} · ${CAMERA_MOTION_LABELS[nextMotion].split('(')[0].trim()}`,
    };
    const nextBeats = rebalanceTemporalBeats([...value.temporal.beats, newBeat], value.totalDurationSec);
    onChange({
      ...value,
      temporal: {
        ...value.temporal,
        beats: nextBeats,
      },
    });
  };

  const handleRemoveBeat = (beatId: number) => {
    if (value.temporal.beats.length <= 1) return;
    const filtered = value.temporal.beats.filter((b) => b.id !== beatId);
    const rebalanced = rebalanceTemporalBeats(filtered, value.totalDurationSec);
    onChange({
      ...value,
      temporal: {
        ...value.temporal,
        beats: rebalanced,
      },
    });
  };

  return (
    <section
      data-testid="structured-prompt-builder"
      className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-4 space-y-4 font-mono text-xs"
    >
      {/* Top Bar: Engine Identity, Completeness Score & Quick Presets */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="font-bold text-white uppercase tracking-wide text-[11px]">
              Strukturovaný Text-to-Video Engine · Lokálně bez API
            </span>
            <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 tabular-nums whitespace-nowrap">
              Připravenost: {score.overall}/100
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-400 tabular-nums">
            <span>Subjekt {score.pillars.subject}/25</span>
            <span>·</span>
            <span>Styl {score.pillars.style}/25</span>
            <span>·</span>
            <span>Kamera {score.pillars.camera}/25</span>
            <span>·</span>
            <span>Časový vývoj {score.pillars.temporal}/25</span>
          </div>
        </div>

        {/* Preset Quick-Load Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-zinc-500 uppercase mr-1">Předvolby:</span>
          {STRUCTURED_VIDEO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`structured-preset-${preset.id}`}
              onClick={() => handleLoadPreset(preset)}
              title={preset.description}
              className="rounded border border-zinc-800 bg-zinc-900 hover:border-cyan-500/60 hover:text-cyan-300 px-2.5 py-1 text-[11px] text-zinc-300 whitespace-nowrap transition"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Drag-and-Drop Visual Prompt Builder + Dropzone Generation Field */}
      <VisualPromptBuilder
        value={value}
        rawPrompt={rawPrompt}
        onRawPromptChange={onRawPromptChange}
        onChange={onChange}
        onSmartParse={onSmartParse}
        onSmartEnhance={onSmartEnhance}
        onAiSmartEnhance={onAiSmartEnhance}
        isProcessing={isProcessing}
        isAiEnhancing={isAiEnhancing}
        aiEnhanceNotes={aiEnhanceNotes}
      />

      {/* 3-Column Grid for Pillars 1, 2, 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* PILLAR 1: SUBJEKT & KOMPOZICE */}
        <div
          data-testid="pillar-subject-card"
          className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2.5"
        >
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <span className="flex items-center gap-1.5 font-bold text-emerald-300 text-[11px] uppercase">
              <Film className="h-3.5 w-3.5" />
              <span>1. Subjekt &amp; Kompozice</span>
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">{score.pillars.subject}/25</span>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">Hlavní subjekt</span>
            <input
              type="text"
              value={value.subject.primarySubject}
              onChange={(e) =>
                onChange({
                  ...value,
                  subject: { ...value.subject, primarySubject: e.target.value },
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-emerald-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">Akce &amp; pohyb subjektu</span>
            <input
              type="text"
              value={value.subject.subjectAction}
              onChange={(e) =>
                onChange({
                  ...value,
                  subject: { ...value.subject, subjectAction: e.target.value },
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-emerald-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">Prostředí &amp; rekvizity</span>
            <input
              type="text"
              value={value.subject.environment}
              onChange={(e) =>
                onChange({
                  ...value,
                  subject: { ...value.subject, environment: e.target.value },
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-emerald-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">Kompozice záběru</span>
            <select
              value={value.subject.composition}
              onChange={(e) =>
                onChange({
                  ...value,
                  subject: {
                    ...value.subject,
                    composition: e.target.value as CameraComposition,
                  },
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-emerald-500"
            >
              {(Object.keys(COMPOSITION_LABELS) as CameraComposition[]).map((key) => (
                <option key={key} value={key}>
                  {COMPOSITION_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* PILLAR 2: STYL, SVĚTLO & OPTIKA */}
        <div
          data-testid="pillar-style-card"
          className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2.5"
        >
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <span className="flex items-center gap-1.5 font-bold text-cyan-300 text-[11px] uppercase">
              <Palette className="h-3.5 w-3.5" />
              <span>2. Styl, Světlo &amp; Optika</span>
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">{score.pillars.style}/25</span>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">Vizuální styl &amp; barevný grading</span>
            <select
              value={value.style.visualStyle}
              onChange={(e) => handleVisualStyleChange(e.target.value as VideoVisualStyle)}
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-500"
            >
              {(Object.keys(VISUAL_STYLE_PALETTES) as VideoVisualStyle[]).map((key) => (
                <option key={key} value={key}>
                  {VISUAL_STYLE_PALETTES[key].label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">Nasvícení scény</span>
            <select
              value={value.style.lighting}
              onChange={(e) =>
                onChange({
                  ...value,
                  style: { ...value.style, lighting: e.target.value as LightingPreset },
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-500"
            >
              {(Object.keys(LIGHTING_LABELS) as LightingPreset[]).map((key) => (
                <option key={key} value={key}>
                  {LIGHTING_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">Optika objektivu</span>
            <select
              value={value.style.optics}
              onChange={(e) =>
                onChange({
                  ...value,
                  style: { ...value.style, optics: e.target.value as OpticsPreset },
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-500"
            >
              {(Object.keys(OPTICS_LABELS) as OpticsPreset[]).map((key) => (
                <option key={key} value={key}>
                  {OPTICS_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">Atmosféra &amp; částice</span>
            <select
              value={value.style.atmosphere}
              onChange={(e) =>
                onChange({
                  ...value,
                  style: { ...value.style, atmosphere: e.target.value as AtmospherePreset },
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-500"
            >
              {(Object.keys(ATMOSPHERE_LABELS) as AtmospherePreset[]).map((key) => (
                <option key={key} value={key}>
                  {ATMOSPHERE_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* PILLAR 3: POHYB KAMERY & DYNAMIKA */}
        <div
          data-testid="pillar-camera-card"
          className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2.5"
        >
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <span className="flex items-center gap-1.5 font-bold text-amber-300 text-[11px] uppercase">
              <Camera className="h-3.5 w-3.5" />
              <span>3. Pohyb kamery &amp; Dynamika</span>
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">{score.pillars.camera}/25</span>
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] text-zinc-400">Hlavní pohyb kamery</span>
            <select
              value={value.camera.primaryMotion}
              onChange={(e) =>
                onChange({
                  ...value,
                  camera: {
                    ...value.camera,
                    primaryMotion: e.target.value as OpenGenCameraMotion,
                  },
                })
              }
              className="w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-amber-500"
            >
              {(Object.keys(CAMERA_MOTION_LABELS) as OpenGenCameraMotion[]).map((key) => (
                <option key={key} value={key}>
                  {CAMERA_MOTION_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>Intenzita kamery (Motion Strength)</span>
              <span className="font-bold text-white tabular-nums">{value.camera.motionIntensity} / 10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={value.camera.motionIntensity}
              onChange={(e) =>
                onChange({
                  ...value,
                  camera: {
                    ...value.camera,
                    motionIntensity: Number(e.target.value),
                  },
                })
              }
              className="w-full accent-amber-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] text-zinc-400">Křivka (Easing)</span>
              <select
                value={value.camera.easing}
                onChange={(e) =>
                  onChange({
                    ...value,
                    camera: { ...value.camera, easing: e.target.value as CameraEasing },
                  })
                }
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-amber-500"
              >
                {(Object.keys(EASING_LABELS) as CameraEasing[]).map((key) => (
                  <option key={key} value={key}>
                    {EASING_LABELS[key].split('(')[0].trim()}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] text-zinc-400">Stabilizace</span>
              <select
                value={value.camera.stabilization}
                onChange={(e) =>
                  onChange({
                    ...value,
                    camera: {
                      ...value.camera,
                      stabilization: e.target.value as CameraStabilization,
                    },
                  })
                }
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-amber-500"
              >
                {(Object.keys(STABILIZATION_LABELS) as CameraStabilization[]).map((key) => (
                  <option key={key} value={key}>
                    {STABILIZATION_LABELS[key].split('(')[0].trim()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-zinc-400">
              <span>Celková délka videa</span>
              <span className="font-bold text-white tabular-nums">{value.totalDurationSec} s</span>
            </div>
            <input
              type="range"
              min="4"
              max="15"
              step="1"
              value={value.totalDurationSec}
              onChange={(e) => handleDurationChange(Number(e.target.value))}
              className="w-full accent-emerald-400 cursor-pointer h-1.5 bg-zinc-800 rounded"
            />
          </div>
        </div>
      </div>

      {/* PILLAR 4: ČASOVÝ VÝVOJ SCÉNY (TEMPORAL TIMELINE EDITOR) */}
      <div
        data-testid="pillar-temporal-timeline"
        className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-purple-400" />
            <span className="font-bold text-purple-300 text-[11px] uppercase">
              4. Časový vývoj scény ({value.temporal.beats.length} fáze · {value.totalDurationSec}s)
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">{score.pillars.temporal}/25</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Rytmus časového vývoje"
              value={value.temporal.pacing}
              onChange={(e) =>
                onChange({
                  ...value,
                  temporal: {
                    ...value.temporal,
                    pacing: e.target.value as TemporalPacing,
                  },
                })
              }
              className="rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-200 focus:outline-none focus:border-purple-500"
            >
              {(Object.keys(PACING_LABELS) as TemporalPacing[]).map((key) => (
                <option key={key} value={key}>
                  {PACING_LABELS[key]}
                </option>
              ))}
            </select>

            <button
              type="button"
              data-testid="add-temporal-beat-btn"
              disabled={value.temporal.beats.length >= 6}
              onClick={handleAddBeat}
              className="flex items-center gap-1 rounded border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 px-2.5 py-1 text-[11px] font-bold text-purple-300 disabled:opacity-40 whitespace-nowrap transition"
            >
              <Plus className="h-3 w-3" />
              <span>Přidat fázi</span>
            </button>
          </div>
        </div>

        {/* Temporal Beat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {value.temporal.beats.map((beat) => (
            <div
              key={beat.id}
              data-testid={`temporal-beat-card-${beat.id}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                if (dragOverBeatId !== beat.id) setDragOverBeatId(beat.id);
              }}
              onDragLeave={() => setDragOverBeatId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverBeatId(null);
                const tag = parseTagPayload(e.dataTransfer);
                if (tag) {
                  const res = applyVisualTagToPrompt(
                    { ...value, rawPrompt },
                    tag,
                    beat.id
                  );
                  onRawPromptChange(res.structuredPrompt.rawPrompt);
                  onChange(res.structuredPrompt);
                }
              }}
              className={`rounded-lg border p-2.5 space-y-2 transition ${
                dragOverBeatId === beat.id
                  ? 'border-amber-400 bg-amber-950/25 ring-1 ring-amber-400/50'
                  : 'border-zinc-800 bg-zinc-950/90'
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-zinc-800/70 pb-1.5">
                <span className="text-[10px] font-bold text-cyan-300 tabular-nums">
                  #{beat.id} · {beat.startSec.toFixed(1)}–{beat.endSec.toFixed(1)}s ({beat.durationSec.toFixed(1)}s)
                </span>
                {value.temporal.beats.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveBeat(beat.id)}
                    aria-label={`Odebrat fázi ${beat.id}`}
                    className="text-zinc-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <select
                  aria-label={`Typ fáze ${beat.id}`}
                  value={beat.phase}
                  onChange={(e) => handleBeatUpdate(beat.id, { phase: e.target.value as BeatPhase })}
                  className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-white"
                >
                  {(Object.keys(PHASE_LABELS) as BeatPhase[]).map((ph) => (
                    <option key={ph} value={ph}>
                      {PHASE_LABELS[ph]}
                    </option>
                  ))}
                </select>

                <select
                  aria-label={`Přechod fáze ${beat.id}`}
                  value={beat.transitionIn}
                  onChange={(e) =>
                    handleBeatUpdate(beat.id, { transitionIn: e.target.value as BeatTransition })
                  }
                  className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-white"
                >
                  {(Object.keys(TRANSITION_LABELS) as BeatTransition[]).map((tr) => (
                    <option key={tr} value={tr}>
                      {TRANSITION_LABELS[tr].split('(')[0].trim()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <select
                  aria-label={`Pohyb kamery fáze ${beat.id}`}
                  value={beat.cameraKeyframe}
                  onChange={(e) =>
                    handleBeatCameraChange(
                      beat.id,
                      e.target.value as OpenGenCameraMotion,
                      beat.phase
                    )
                  }
                  className="col-span-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-emerald-300"
                >
                  {(Object.keys(CAMERA_MOTION_LABELS) as OpenGenCameraMotion[]).map((cam) => (
                    <option key={cam} value={cam}>
                      {CAMERA_MOTION_LABELS[cam].split('(')[0].trim()}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10"
                  aria-label={`Délka fáze ${beat.id} v sekundách`}
                  value={beat.durationSec}
                  onChange={(e) =>
                    handleBeatUpdate(
                      beat.id,
                      { durationSec: Math.max(0.5, Number(e.target.value) || 1) },
                      true
                    )
                  }
                  className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-white text-right tabular-nums"
                />
              </div>

              <textarea
                rows={2}
                aria-label={`Vývoj děje ve fázi ${beat.id}`}
                value={beat.sceneDescription}
                onChange={(e) => handleBeatUpdate(beat.id, { sceneDescription: e.target.value })}
                placeholder="Co se mění v obraze..."
                className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-200 resize-none focus:outline-none focus:border-purple-500"
              />

              <div className="flex items-center justify-between gap-2 text-[9px] text-zinc-500 tabular-nums">
                <span>
                  Zoom {beat.cameraZoomStart.toFixed(2)}× → {beat.cameraZoomEnd.toFixed(2)}×
                </span>
                <span>
                  Pan ({beat.cameraPanX >= 0 ? '+' : ''}
                  {beat.cameraPanX.toFixed(2)}, {beat.cameraPanY >= 0 ? '+' : ''}
                  {beat.cameraPanY.toFixed(2)})
                </span>
              </div>

              <input
                type="text"
                aria-label={`Titulek fáze ${beat.id}`}
                value={beat.kineticCaption}
                onChange={(e) => handleBeatUpdate(beat.id, { kineticCaption: e.target.value })}
                placeholder="Kinetický titulek..."
                className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-amber-300 focus:outline-none focus:border-amber-500"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible Compiled Directive Preview */}
      <div className="rounded border border-zinc-800/80 bg-zinc-900/30">
        <button
          type="button"
          onClick={() => setShowCompiledPreview(!showCompiledPreview)}
          className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-zinc-400 hover:text-white transition"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span>Kompilovaný 4-pilířový režijní prompt pro lokální FFmpeg/MoviePy render</span>
          </span>
          {showCompiledPreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showCompiledPreview && (
          <pre
            data-testid="compiled-structured-prompt-preview"
            className="border-t border-zinc-800/80 px-3 py-2.5 text-[10px] text-emerald-300/90 whitespace-pre-wrap leading-relaxed"
          >
            {compiledText}
          </pre>
        )}
      </div>
    </section>
  );
};
