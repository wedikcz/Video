/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AtmospherePreset,
  BeatPhase,
  BeatTransition,
  CameraComposition,
  LightingPreset,
  OpenGenCameraMotion,
  OpticsPreset,
  PromptBuilderTag,
  StructuredVideoPrompt,
  TemporalSceneBeat,
  VideoVisualStyle,
} from '../types/nexus.ts';
import { VISUAL_DRAG_TAGS } from './monetizationCheatsheets.ts';
import {
  CAMERA_MOTION_LABELS,
  LIGHTING_LABELS,
  OPTICS_LABELS,
  VISUAL_STYLE_PALETTES,
  buildCameraTrajectoryForBeat,
  rebalanceTemporalBeats,
} from './structuredVideoPrompt.ts';

export interface ActiveStyleContext {
  styleKey: VideoVisualStyle;
  tagId?: string;
  tagLabel: string;
  promptSnippet: string;
  palette: (typeof VISUAL_STYLE_PALETTES)[VideoVisualStyle];
}

export interface AiGeneratedStructurePayload {
  expandedRawPrompt: string;
  primarySubject: string;
  subjectAction: string;
  environment: string;
  composition?: string;
  lighting?: string;
  optics?: string;
  atmosphere?: string;
  cameraMotion?: string;
  motionIntensity?: number;
  cinematicNotes?: string[];
  beats?: Array<{
    phase?: string;
    beatTitle?: string;
    sceneDescription: string;
    subjectEvolution?: string;
    cameraKeyframe?: string;
    lightingShift?: string;
    transitionIn?: string;
    kineticCaption?: string;
  }>;
}

const VALID_COMPOSITIONS = new Set<CameraComposition>([
  'close_up',
  'medium_shot',
  'wide_establishing',
  'macro_detail',
  'pov_first_person',
]);

const VALID_LIGHTINGS = new Set<LightingPreset>([
  'volumetric_neon',
  'golden_hour',
  'studio_rim',
  'dramatic_chiaroscuro',
  'clean_daylight',
]);

const VALID_OPTICS = new Set<OpticsPreset>([
  '35mm_anamorphic',
  '50mm_prime',
  '85mm_portrait',
  '16mm_wide_fpv',
  'macro_100mm',
]);

const VALID_ATMOSPHERES = new Set<AtmospherePreset>([
  'rain_particles',
  'volumetric_dust',
  'light_streaks',
  'clean_studio',
  'data_grid',
]);

const VALID_CAMERA_MOTIONS = new Set<OpenGenCameraMotion>([
  'static',
  'pan_left',
  'pan_right',
  'tilt_up',
  'tilt_down',
  'zoom_in',
  'zoom_out',
  'orbit_360',
  'fpv_drone',
]);

const VALID_PHASES = new Set<BeatPhase>([
  'opening_hook',
  'development',
  'climax_reveal',
  'closing_loop',
]);

const VALID_TRANSITIONS = new Set<BeatTransition>([
  'cut',
  'crossfade',
  'whip_pan',
  'zoom_punch',
  'glitch_flash',
]);

/**
 * Resolves the currently selected style tag (either explicitly passed, present in activeTagIds,
 * or derived from `structuredPrompt.style.visualStyle`).
 */
export function resolveSelectedStyleTag(
  structuredPrompt: StructuredVideoPrompt,
  explicitStyleTagId?: string
): ActiveStyleContext {
  const styleTags = VISUAL_DRAG_TAGS.filter((t) => t.category === 'style');
  let matchedTag: PromptBuilderTag | undefined;

  if (explicitStyleTagId) {
    matchedTag = styleTags.find((t) => t.id === explicitStyleTagId);
  }

  if (!matchedTag && structuredPrompt.activeTagIds?.length) {
    for (let i = structuredPrompt.activeTagIds.length - 1; i >= 0; i--) {
      const candidate = styleTags.find((t) => t.id === structuredPrompt.activeTagIds![i]);
      if (candidate) {
        matchedTag = candidate;
        break;
      }
    }
  }

  if (!matchedTag) {
    matchedTag = styleTags.find((t) => t.visualStyle === structuredPrompt.style.visualStyle);
  }

  const styleKey = matchedTag?.visualStyle || structuredPrompt.style.visualStyle;
  const palette = VISUAL_STYLE_PALETTES[styleKey];

  return {
    styleKey,
    tagId: matchedTag?.id,
    tagLabel: matchedTag?.label || palette.label,
    promptSnippet:
      matchedTag?.promptSnippet || `ve vizuálním stylu ${palette.label} (${palette.colorGrading})`,
    palette,
  };
}

export function buildAiEnhanceSystemInstruction(styleInfo: ActiveStyleContext): string {
  return [
    'Jsi elitní AI filmový režisér a kameraman specializovaný na text-to-video generování.',
    `Tvým úkolem je rozvinout stručný popis uživatele do vysoce realistické, kinematografické 4-pilířové struktury scény striktně sladěné se zvoleným stylem: "${styleInfo.tagLabel}" (${styleInfo.palette.colorGrading}).`,
    'Odpovídej výhradně česky (kromě technických názvů objektivů) a striktně jako validní JSON podle schématu, bez markdownu či vysvětlivek okolo.',
    'Každá časová fáze musí obsahovat konkrétní vizuální vývoj scény, posun světla a realistický pohyb kamery.',
  ].join(' ');
}

export function buildAiEnhanceUserPrompt(
  rawPrompt: string,
  baseStructured: StructuredVideoPrompt,
  styleInfo: ActiveStyleContext
): string {
  return [
    `Základní uživatelský popis scény: "${rawPrompt.trim()}"`,
    `Zvolený stylový tag: ${styleInfo.tagLabel} (${styleInfo.promptSnippet})`,
    `Formát videa: ${baseStructured.aspectRatio}, délka: ${baseStructured.totalDurationSec}s @ ${baseStructured.fps} FPS`,
    `Výchozí kamera: ${CAMERA_MOTION_LABELS[baseStructured.camera.primaryMotion]} (intenzita ${baseStructured.camera.motionIntensity}/10)`,
    `Aktuální optika: ${OPTICS_LABELS[baseStructured.style.optics]}, světlo: ${LIGHTING_LABELS[baseStructured.style.lighting]}`,
    baseStructured.realismProfile
      ? `Kino rig: ${baseStructured.realismProfile.cameraBody}, ${baseStructured.realismProfile.colorPipeline}, ${baseStructured.realismProfile.shutterAngle}`
      : '',
    'Rozšiř popis do kinematografického zadání (expandedRawPrompt) a definuj 3 navazující časové fáze (opening_hook -> development/climax_reveal -> closing_loop) s dynamickým kamerovým vývojem.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function mergeAiEnhancedStructure(
  base: StructuredVideoPrompt,
  aiData: AiGeneratedStructurePayload,
  styleInfo: ActiveStyleContext
): {
  structuredPrompt: StructuredVideoPrompt;
  cinematicNotes: string[];
} {
  const next: StructuredVideoPrompt = structuredClone(base);

  const expandedRawPrompt =
    typeof aiData.expandedRawPrompt === 'string' && aiData.expandedRawPrompt.trim().length >= 12
      ? aiData.expandedRawPrompt.trim()
      : `${base.rawPrompt.trim()}, ${styleInfo.promptSnippet}`;

  const composition = VALID_COMPOSITIONS.has(aiData.composition as CameraComposition)
    ? (aiData.composition as CameraComposition)
    : next.subject.composition;

  const lighting = VALID_LIGHTINGS.has(aiData.lighting as LightingPreset)
    ? (aiData.lighting as LightingPreset)
    : styleInfo.palette.defaultLighting;

  const optics = VALID_OPTICS.has(aiData.optics as OpticsPreset)
    ? (aiData.optics as OpticsPreset)
    : styleInfo.palette.defaultOptics;

  const atmosphere = VALID_ATMOSPHERES.has(aiData.atmosphere as AtmospherePreset)
    ? (aiData.atmosphere as AtmospherePreset)
    : styleInfo.palette.defaultAtmosphere;

  const primaryMotion = VALID_CAMERA_MOTIONS.has(aiData.cameraMotion as OpenGenCameraMotion)
    ? (aiData.cameraMotion as OpenGenCameraMotion)
    : next.camera.primaryMotion;

  const motionIntensity =
    typeof aiData.motionIntensity === 'number' && Number.isFinite(aiData.motionIntensity)
      ? Math.max(1, Math.min(10, Math.round(aiData.motionIntensity)))
      : Math.max(6, next.camera.motionIntensity);

  next.rawPrompt = expandedRawPrompt;
  next.subject = {
    primarySubject:
      aiData.primarySubject?.trim() || next.subject.primarySubject,
    subjectAction:
      aiData.subjectAction?.trim() || next.subject.subjectAction,
    environment:
      aiData.environment?.trim() || next.subject.environment,
    composition,
  };

  next.style = {
    ...next.style,
    visualStyle: styleInfo.styleKey,
    lighting,
    optics,
    atmosphere,
    colorGrading: styleInfo.palette.colorGrading,
    accentColor: styleInfo.palette.accentColor,
    secondaryColor: styleInfo.palette.secondaryColor,
    bgHex: styleInfo.palette.bgHex,
  };

  if (styleInfo.tagId) {
    const tags = new Set((next.activeTagIds || []).filter((id) => !id.startsWith('style-')));
    tags.add(styleInfo.tagId);
    next.activeTagIds = Array.from(tags);
  }

  next.camera = {
    ...next.camera,
    primaryMotion,
    motionIntensity,
  };

  const incomingBeats = Array.isArray(aiData.beats) ? aiData.beats.slice(0, 4) : [];
  if (incomingBeats.length >= 2) {
    const mappedBeats: TemporalSceneBeat[] = incomingBeats.map((b, idx) => {
      const existing = next.temporal.beats[idx] || next.temporal.beats[0];
      const phase: BeatPhase = VALID_PHASES.has(b.phase as BeatPhase)
        ? (b.phase as BeatPhase)
        : idx === 0
        ? 'opening_hook'
        : idx === incomingBeats.length - 1
        ? 'closing_loop'
        : 'development';
      const camKey: OpenGenCameraMotion = VALID_CAMERA_MOTIONS.has(
        b.cameraKeyframe as OpenGenCameraMotion
      )
        ? (b.cameraKeyframe as OpenGenCameraMotion)
        : idx === 0
        ? primaryMotion
        : idx === incomingBeats.length - 1
        ? 'zoom_out'
        : 'orbit_360';
      const transitionIn: BeatTransition = VALID_TRANSITIONS.has(
        b.transitionIn as BeatTransition
      )
        ? (b.transitionIn as BeatTransition)
        : idx === 0
        ? 'zoom_punch'
        : 'crossfade';

      const traj = buildCameraTrajectoryForBeat(camKey, motionIntensity, phase);
      return {
        id: idx + 1,
        phase,
        startSec: existing?.startSec ?? idx * 2,
        endSec: existing?.endSec ?? (idx + 1) * 2,
        durationSec: existing?.durationSec ?? 2,
        beatTitle: (b.beatTitle?.trim() || existing?.beatTitle || `FÁZE ${idx + 1}`).slice(0, 48),
        sceneDescription: b.sceneDescription?.trim() || existing?.sceneDescription || expandedRawPrompt,
        subjectEvolution: b.subjectEvolution?.trim() || existing?.subjectEvolution || next.subject.subjectAction,
        cameraKeyframe: camKey,
        cameraZoomStart: traj.zoomStart,
        cameraZoomEnd: traj.zoomEnd,
        cameraPanX: traj.panX,
        cameraPanY: traj.panY,
        lightingShift: b.lightingShift?.trim() || `${LIGHTING_LABELS[lighting]} · ${styleInfo.palette.colorGrading}`,
        transitionIn,
        kineticCaption: (b.kineticCaption?.trim() || existing?.kineticCaption || next.subject.primarySubject).slice(0, 48),
        visualCue: `${OPTICS_LABELS[optics].split('(')[0].trim()} · ${CAMERA_MOTION_LABELS[camKey].split('(')[0].trim()}`,
      };
    });

    next.temporal.beats = rebalanceTemporalBeats(mappedBeats, next.totalDurationSec);
  }

  const cinematicNotes =
    Array.isArray(aiData.cinematicNotes) && aiData.cinematicNotes.length > 0
      ? aiData.cinematicNotes.map((n) => String(n).trim()).filter(Boolean).slice(0, 4)
      : [
          `Stylizováno pomocí AI pro styl "${styleInfo.tagLabel}" (${styleInfo.palette.colorGrading}).`,
          `Optika ${OPTICS_LABELS[optics]} a nasvícení ${LIGHTING_LABELS[lighting]} pro maximální hloubku.`,
        ];

  return {
    structuredPrompt: next,
    cinematicNotes,
  };
}
