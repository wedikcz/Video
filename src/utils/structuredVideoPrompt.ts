/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  StructuredPromptScore,
  StructuredVideoPrompt,
  TemporalPacing,
  TemporalSceneBeat,
  VideoVisualStyle,
} from '../types/nexus.ts';

export const VISUAL_STYLE_PALETTES: Record<
  VideoVisualStyle,
  {
    label: string;
    accentColor: string;
    secondaryColor: string;
    bgHex: string;
    colorGrading: string;
    defaultLighting: LightingPreset;
    defaultOptics: OpticsPreset;
    defaultAtmosphere: AtmospherePreset;
  }
> = {
  cyberpunk_neon: {
    label: 'Cyberpunk Neon',
    accentColor: '#06b6d4',
    secondaryColor: '#ec4899',
    bgHex: '0x090817',
    colorGrading: 'Teal & Magenta Neon LUT',
    defaultLighting: 'volumetric_neon',
    defaultOptics: '35mm_anamorphic',
    defaultAtmosphere: 'rain_particles',
  },
  fintech_emerald: {
    label: 'FinTech Emerald',
    accentColor: '#10b981',
    secondaryColor: '#34d399',
    bgHex: '0x071311',
    colorGrading: 'Emerald Matrix & Crisp Contrast',
    defaultLighting: 'studio_rim',
    defaultOptics: '50mm_prime',
    defaultAtmosphere: 'data_grid',
  },
  luxury_gold: {
    label: 'Luxury Gold',
    accentColor: '#f59e0b',
    secondaryColor: '#fef08a',
    bgHex: '0x120e07',
    colorGrading: 'Warm Amber Gold Film LUT',
    defaultLighting: 'golden_hour',
    defaultOptics: '85mm_portrait',
    defaultAtmosphere: 'volumetric_dust',
  },
  editorial_coral: {
    label: 'Energický Coral',
    accentColor: '#f43f5e',
    secondaryColor: '#fb923c',
    bgHex: '0x14080e',
    colorGrading: 'High-Energy Editorial Punch',
    defaultLighting: 'dramatic_chiaroscuro',
    defaultOptics: '16mm_wide_fpv',
    defaultAtmosphere: 'light_streaks',
  },
  minimal_dark: {
    label: 'Minimal Studio',
    accentColor: '#38bdf8',
    secondaryColor: '#e4e4e7',
    bgHex: '0x0b0f17',
    colorGrading: 'Clean Neutral Architectural LUT',
    defaultLighting: 'clean_daylight',
    defaultOptics: '50mm_prime',
    defaultAtmosphere: 'clean_studio',
  },
};

export const CAMERA_MOTION_LABELS: Record<OpenGenCameraMotion, string> = {
  orbit_360: 'Orbitální rotace 360°',
  zoom_in: 'Plynulý nájezd (Dolly Zoom In)',
  zoom_out: 'Plynulý odjezd (Reveal Zoom Out)',
  pan_left: 'Horizontální švenk vlevo (Pan Left)',
  pan_right: 'Horizontální švenk vpravo (Pan Right)',
  tilt_up: 'Vertikální náklon nahoru (Tilt Up)',
  tilt_down: 'Vertikální náklon dolů (Tilt Down)',
  fpv_drone: 'Dynamický FPV dronový průlet',
  static: 'Statická studiová kamera (Tripod)',
};

export const COMPOSITION_LABELS: Record<CameraComposition, string> = {
  close_up: 'Detailní záběr (Close-Up)',
  medium_shot: 'Polodetail (Medium Shot)',
  wide_establishing: 'Široký celek (Wide Establishing)',
  macro_detail: 'Makro detail (Macro 100mm)',
  pov_first_person: 'Pohled první osoby (POV / FPV)',
};

export const LIGHTING_LABELS: Record<LightingPreset, string> = {
  volumetric_neon: 'Volumetrické neonové svícení',
  golden_hour: 'Zlatá hodina (Golden Hour)',
  studio_rim: 'Studiové konturové světlo (Rim Light)',
  dramatic_chiaroscuro: 'Dramatické šerosvitné kontrasty',
  clean_daylight: 'Čisté rozptýlené denní světlo',
};

export const OPTICS_LABELS: Record<OpticsPreset, string> = {
  '35mm_anamorphic': '35mm Anamorfní filmový objektiv',
  '50mm_prime': '50mm f/1.4 Prime (přirozená perspektiva)',
  '85mm_portrait': '85mm f/1.2 Portrétní bokeh',
  '16mm_wide_fpv': '16mm Širokoúhlá akční optika',
  'macro_100mm': '100mm Makro objektiv (mikrodetaily)',
};

export const ATMOSPHERE_LABELS: Record<AtmospherePreset, string> = {
  rain_particles: 'Odlesky deště a jemná vodní tříšť',
  volumetric_dust: 'Zlaté prachové částice v paprscích',
  light_streaks: 'Kinetické světelné pruhy a bokeh',
  clean_studio: 'Čisté studiové pozadí bez šumu',
  data_grid: 'Holografická datová mřížka a skenovací paprsky',
};

export const TRANSITION_LABELS: Record<BeatTransition, string> = {
  cut: 'Tvrdý střih (Hard Cut)',
  crossfade: 'Plynulý prolínač (Crossfade)',
  whip_pan: 'Rychlý švenk (Whip Pan)',
  zoom_punch: 'Úderný zoom (Zoom Punch)',
  glitch_flash: 'Digitální záblesk (Glitch Flash)',
};

export const PHASE_LABELS: Record<BeatPhase, string> = {
  opening_hook: 'Úvodní Hook',
  development: 'Vývoj scény',
  climax_reveal: 'Vyvrcholení / Reveal',
  closing_loop: 'Závěrečná smyčka / CTA',
};

export interface StructuredVideoPreset {
  id: string;
  label: string;
  description: string;
  rawPrompt: string;
  prompt: Partial<StructuredVideoPrompt>;
}

export const STRUCTURED_VIDEO_PRESETS: StructuredVideoPreset[] = [
  {
    id: 'preset-prague-drone',
    label: 'Kyberpunk Dron nad Prahou',
    description: 'FPV průlet deštivou metropolí s přechodem na orbit kolem světelného mrakodrapu',
    rawPrompt:
      'Nejdříve nízký FPV dronový průlet nad mokrou futuristickou Prahou v dešti a neonových odlescích, pak plynulý orbit 360 kolem centrální holografické věže, nakonec rychlý odjezd do širokého celku města.',
    prompt: {
      aspectRatio: '9:16',
      totalDurationSec: 9,
      fps: 30,
      subject: {
        primarySubject: 'Futuristické centrum Prahy se skleněnou AI věží',
        subjectAction: 'pulzující holografické displeje a klouzající světelné dráhy dopravy',
        environment: 'mokré noční bulváry s odlesky deště na skle a oceli',
        composition: 'pov_first_person',
      },
      style: {
        visualStyle: 'cyberpunk_neon',
        lighting: 'volumetric_neon',
        optics: '16mm_wide_fpv',
        colorGrading: 'Teal & Magenta Neon LUT',
        atmosphere: 'rain_particles',
        accentColor: '#06b6d4',
        secondaryColor: '#ec4899',
        bgHex: '0x090817',
        negativePrompt: 'rozmazané texty, přepaly, statická kamera, ploché světlo',
      },
      camera: {
        primaryMotion: 'fpv_drone',
        motionIntensity: 8,
        easing: 'whip_accelerate',
        stabilization: 'dynamic_fpv',
      },
      temporal: {
        pacing: 'crescendo_build',
        beats: [
          {
            id: 1,
            phase: 'opening_hook',
            startSec: 0,
            endSec: 3,
            durationSec: 3,
            beatTitle: 'NOČNÍ FPV NÁLET V DEŠTI',
            sceneDescription: 'Nízký průlet nad mokrou ulicí mezi neonovými poutači směrem k věži.',
            subjectEvolution: 'Světla města se zrychlují a sbíhají k centrálnímu objektu.',
            cameraKeyframe: 'fpv_drone',
            cameraZoomStart: 1.0,
            cameraZoomEnd: 1.18,
            cameraPanX: 0.25,
            cameraPanY: -0.1,
            lightingShift: 'Chladný azurový kontrast s ostrými odlesky deště',
            transitionIn: 'glitch_flash',
            kineticCaption: 'PRAHA 2049 · NOČNÍ PRŮLET',
            visualCue: 'FPV nálet přes kapky deště',
          },
          {
            id: 2,
            phase: 'development',
            startSec: 3,
            endSec: 6.5,
            durationSec: 3.5,
            beatTitle: 'ORBIT KOLEM HOLOGRAFICKÉ VĚŽE',
            sceneDescription: 'Kamera obkrouží prosklenou věž, zatímco se aktivuje světelná síť.',
            subjectEvolution: 'Hologramy na fasádě se rozsvítí v purpurovém spektru.',
            cameraKeyframe: 'orbit_360',
            cameraZoomStart: 1.18,
            cameraZoomEnd: 1.08,
            cameraPanX: -0.45,
            cameraPanY: 0.05,
            lightingShift: 'Přechod z azurové do purpurové neonové záře',
            transitionIn: 'whip_pan',
            kineticCaption: 'AUTONOMNÍ DATOVÁ SÍŤ AKTIVNÍ',
            visualCue: 'Orbit 360° kolem věže s paralaxou',
          },
          {
            id: 3,
            phase: 'closing_loop',
            startSec: 6.5,
            endSec: 9,
            durationSec: 2.5,
            beatTitle: 'ŠIROKÝ REVEAL & SMYČKA',
            sceneDescription: 'Rychlé stoupání nad panorama města s napojením na úvodní nálet.',
            subjectEvolution: 'Celé panorama pulzuje v rytmu 136 BPM.',
            cameraKeyframe: 'zoom_out',
            cameraZoomStart: 1.12,
            cameraZoomEnd: 0.96,
            cameraPanX: 0,
            cameraPanY: -0.25,
            lightingShift: 'Vyvážený široký kontrast připravený pro smyčku',
            transitionIn: 'zoom_punch',
            kineticCaption: 'BUDOUCNOST ZAČÍNÁ TEĎ',
            visualCue: 'Odjezd kamery do panoramatu',
          },
        ],
      },
    },
  },
  {
    id: 'preset-espresso-macro',
    label: 'Luxusní Espresso Makro',
    description: 'Zlatá hodina, makro objektiv 100mm, extrakce kávy a plynulý orbit',
    rawPrompt:
      'Nejdříve makro detail zlaté cremy padající do skleněného šálku při ranním slunci, pak jemný nájezd kamery skrz stoupající páru, nakonec čistý produktový záběr v teplém studiovém světle.',
    prompt: {
      aspectRatio: '9:16',
      totalDurationSec: 8,
      fps: 30,
      subject: {
        primarySubject: 'Výběrové espresso ve dvojitém skleněném šálku',
        subjectAction: 'hustá zlatohnědá crema se víří a stoupá jemná aromatická pára',
        environment: 'tmavý kartáčovaný mramor s ranními paprsky skrz žaluzie',
        composition: 'macro_detail',
      },
      style: {
        visualStyle: 'luxury_gold',
        lighting: 'golden_hour',
        optics: 'macro_100mm',
        colorGrading: 'Warm Amber Gold Film LUT',
        atmosphere: 'volumetric_dust',
        accentColor: '#f59e0b',
        secondaryColor: '#fef08a',
        bgHex: '0x120e07',
        negativePrompt: 'studené modré tóny, tvrdý digitální šum, roztřesená ruka',
      },
      camera: {
        primaryMotion: 'zoom_in',
        motionIntensity: 5,
        easing: 'ease_in_out',
        stabilization: 'cinematic_dolly',
      },
      temporal: {
        pacing: 'steady_narrative',
        beats: [
          {
            id: 1,
            phase: 'opening_hook',
            startSec: 0,
            endSec: 2.5,
            durationSec: 2.5,
            beatTitle: 'MAKRO EXTRAKCE CREMY',
            sceneDescription: 'Detailní pohled na první kapky espressa dopadající do skla.',
            subjectEvolution: 'Zlatá pěna vytváří vír uprostřed hladiny.',
            cameraKeyframe: 'zoom_in',
            cameraZoomStart: 1.0,
            cameraZoomEnd: 1.15,
            cameraPanX: 0,
            cameraPanY: 0.08,
            lightingShift: 'Teplý boční paprsek zlaté hodiny',
            transitionIn: 'crossfade',
            kineticCaption: 'DOKONALÁ EXTRAKCE 9 BARŮ',
            visualCue: '100mm makro pohled na hladinu',
          },
          {
            id: 2,
            phase: 'development',
            startSec: 2.5,
            endSec: 5.5,
            durationSec: 3,
            beatTitle: 'PÁRA & ORBIT KOLEM ŠÁLKU',
            sceneDescription: 'Kamera plynule krouží kolem šálku v protisvětle páry.',
            subjectEvolution: 'Pára se zvedá a rozptyluje zlaté odlesky v prostoru.',
            cameraKeyframe: 'orbit_360',
            cameraZoomStart: 1.15,
            cameraZoomEnd: 1.08,
            cameraPanX: 0.3,
            cameraPanY: -0.05,
            lightingShift: 'Protisvětlo zvýrazňuje obrys skla a prachové částice',
            transitionIn: 'crossfade',
            kineticCaption: 'AROMA ČERSTVÉ PRAŽENÍ',
            visualCue: 'Orbitální pohyb přes světelný paprsek',
          },
          {
            id: 3,
            phase: 'climax_reveal',
            startSec: 5.5,
            endSec: 8,
            durationSec: 2.5,
            beatTitle: 'FINÁLNÍ PRODUKTOVÝ REVEAL',
            sceneDescription: 'Lehký odjezd do čisté kompozice s prostorem pro značku.',
            subjectEvolution: 'Šálek stojí klidně v ohnisku teplého světla.',
            cameraKeyframe: 'zoom_out',
            cameraZoomStart: 1.1,
            cameraZoomEnd: 0.98,
            cameraPanX: 0,
            cameraPanY: 0,
            lightingShift: 'Měkké studiové dosvícení pro čitelnost CTA',
            transitionIn: 'crossfade',
            kineticCaption: 'OBJEDNEJ SI RANNÍ RITUÁL',
            visualCue: 'Plynulý pull-back na celý stůl',
          },
        ],
      },
    },
  },
  {
    id: 'preset-fintech-ai',
    label: 'FinTech AI Automatizace',
    description: 'Smaragdová datová mřížka, čisté studiové světlo a dynamický zoom punch',
    rawPrompt:
      'Úvodní rychlý nájezd na chaotický stůl s papírovými fakturami, pak transformace do čisté smaragdové datové mřížky automatizace, nakonec klidný odjezd s výsledkem úspory času.',
    prompt: {
      aspectRatio: '9:16',
      totalDurationSec: 6,
      fps: 30,
      subject: {
        primarySubject: 'Autonomní AI modul zpracovávající faktury v reálném čase',
        subjectAction: 'chaotické bloky dat se seřazují do přesných smaragdových karet',
        environment: 'moderní tmavé FinTech studio s datovou mřížkou',
        composition: 'medium_shot',
      },
      style: {
        visualStyle: 'fintech_emerald',
        lighting: 'studio_rim',
        optics: '50mm_prime',
        colorGrading: 'Emerald Matrix & Crisp Contrast',
        atmosphere: 'data_grid',
        accentColor: '#10b981',
        secondaryColor: '#34d399',
        bgHex: '0x071311',
        negativePrompt: 'chaos, nečitelné písmo, pastelové barvy, nízký kontrast',
      },
      camera: {
        primaryMotion: 'zoom_in',
        motionIntensity: 7,
        easing: 'whip_accelerate',
        stabilization: 'gimbal_smooth',
      },
      temporal: {
        pacing: 'explosive_hook',
        beats: [
          {
            id: 1,
            phase: 'opening_hook',
            startSec: 0,
            endSec: 2,
            durationSec: 2,
            beatTitle: 'STOP RUČNÍMU PŘEPISOVÁNÍ',
            sceneDescription: 'Rychlý nájezd na hromadící se bloky neuspořádaných dat.',
            subjectEvolution: 'Časovač v rohu zrychluje a vytváří naléhavost.',
            cameraKeyframe: 'zoom_in',
            cameraZoomStart: 1.0,
            cameraZoomEnd: 1.22,
            cameraPanX: -0.1,
            cameraPanY: 0,
            lightingShift: 'Ostrý kontrast s jantarovým varováním',
            transitionIn: 'zoom_punch',
            kineticCaption: '10 HODIN TÝDNĚ ZTRACENO',
            visualCue: 'Rychlý dolly push-in na problém',
          },
          {
            id: 2,
            phase: 'development',
            startSec: 2,
            endSec: 4,
            durationSec: 2,
            beatTitle: 'OKAMŽITÁ AI SYNCHRONIZACE',
            sceneDescription: 'Švenk vpravo sleduje paprsek skeneru, který srovnává data.',
            subjectEvolution: 'Prvky se přepínají do čisté smaragdové struktury.',
            cameraKeyframe: 'pan_right',
            cameraZoomStart: 1.12,
            cameraZoomEnd: 1.12,
            cameraPanX: 0.4,
            cameraPanY: 0,
            lightingShift: 'Smaragdové konturové světlo zaplaví scénu',
            transitionIn: 'whip_pan',
            kineticCaption: 'AUTONOMNÍ EXTRAKCE ZA 0,4 S',
            visualCue: 'Horizontální tracking švenk',
          },
          {
            id: 3,
            phase: 'closing_loop',
            startSec: 4,
            endSec: 6,
            durationSec: 2,
            beatTitle: 'ČISTÝ VÝSLEDEK & CTA',
            sceneDescription: 'Stabilní odjezd na přehledný výstupní panel.',
            subjectEvolution: 'Kompletní workflow svítí v ustáleném rytmu.',
            cameraKeyframe: 'zoom_out',
            cameraZoomStart: 1.15,
            cameraZoomEnd: 1.0,
            cameraPanX: 0,
            cameraPanY: 0,
            lightingShift: 'Čisté symetrické studiové světlo',
            transitionIn: 'crossfade',
            kineticCaption: 'SPUSŤTE AUTOMATIZACI DNES',
            visualCue: 'Vyvážený závěrečný celek',
          },
        ],
      },
    },
  },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 999999;
}

export function buildCameraTrajectoryForBeat(
  motion: OpenGenCameraMotion,
  intensity: number,
  phase: BeatPhase
): { zoomStart: number; zoomEnd: number; panX: number; panY: number } {
  const factor = clamp(intensity, 1, 10) / 10; // 0.1 - 1.0
  const zoomDelta = 0.06 + factor * 0.18;
  const panAmp = 0.15 + factor * 0.45;

  switch (motion) {
    case 'zoom_in':
      return { zoomStart: 1.0, zoomEnd: Number((1.0 + zoomDelta).toFixed(2)), panX: 0, panY: 0 };
    case 'zoom_out':
      return { zoomStart: Number((1.0 + zoomDelta).toFixed(2)), zoomEnd: 0.98, panX: 0, panY: 0 };
    case 'pan_left':
      return { zoomStart: 1.08, zoomEnd: 1.08, panX: Number((-panAmp).toFixed(2)), panY: 0 };
    case 'pan_right':
      return { zoomStart: 1.08, zoomEnd: 1.08, panX: Number(panAmp.toFixed(2)), panY: 0 };
    case 'tilt_up':
      return { zoomStart: 1.08, zoomEnd: 1.06, panX: 0, panY: Number((-panAmp).toFixed(2)) };
    case 'tilt_down':
      return { zoomStart: 1.06, zoomEnd: 1.1, panX: 0, panY: Number(panAmp.toFixed(2)) };
    case 'orbit_360':
      return {
        zoomStart: phase === 'opening_hook' ? 1.02 : 1.1,
        zoomEnd: Number((1.1 + factor * 0.08).toFixed(2)),
        panX: Number((panAmp * 0.85).toFixed(2)),
        panY: Number((panAmp * 0.25).toFixed(2)),
      };
    case 'fpv_drone':
      return {
        zoomStart: 0.98,
        zoomEnd: Number((1.12 + factor * 0.14).toFixed(2)),
        panX: Number((panAmp * 0.65).toFixed(2)),
        panY: Number((-panAmp * 0.35).toFixed(2)),
      };
    case 'static':
    default:
      return { zoomStart: 1.0, zoomEnd: 1.02, panX: 0, panY: 0 };
  }
}

export function rebalanceTemporalBeats(
  beats: TemporalSceneBeat[],
  totalDurationSec: number
): TemporalSceneBeat[] {
  const safeTotal = clamp(Math.round(totalDurationSec * 10) / 10, 3, 20);
  if (!beats || beats.length === 0) return [];

  const sumRaw = beats.reduce((acc, b) => acc + Math.max(0.5, b.durationSec || 1), 0);
  let cursor = 0;

  return beats.map((beat, idx) => {
    const isLast = idx === beats.length - 1;
    const scaled = isLast
      ? Math.max(0.5, Number((safeTotal - cursor).toFixed(1)))
      : Math.max(0.5, Number((((Math.max(0.5, beat.durationSec || 1) / sumRaw) * safeTotal)).toFixed(1)));
    const startSec = Number(cursor.toFixed(1));
    const endSec = isLast ? safeTotal : Number((cursor + scaled).toFixed(1));
    cursor = endSec;

    return {
      ...beat,
      id: idx + 1,
      startSec,
      endSec,
      durationSec: Number(Math.max(0.5, endSec - startSec).toFixed(1)),
    };
  });
}

function detectCameraMotionFromText(lower: string): OpenGenCameraMotion | undefined {
  if (/orbit|krouž|obkrouž|360/i.test(lower)) return 'orbit_360';
  if (/fpv|dron|průlet|let[ií]|nad\s+/i.test(lower)) return 'fpv_drone';
  if (/odjezd|oddál|pull[- ]?back|zoom[- ]?out|do celku/i.test(lower)) return 'zoom_out';
  if (/nájezd|přiblíž|dolly|push[- ]?in|zoom[- ]?in|makro|detail/i.test(lower)) return 'zoom_in';
  if (/švenk\s+vlevo|doleva|pan\s+left/i.test(lower)) return 'pan_left';
  if (/švenk\s+vpravo|doprava|pan\s+right/i.test(lower)) return 'pan_right';
  if (/nahoru|stoup|tilt\s+up|zved/i.test(lower)) return 'tilt_up';
  if (/dolů|kles|tilt\s+down/i.test(lower)) return 'tilt_down';
  if (/statick|stativ|tripod|pevná kamera/i.test(lower)) return 'static';
  return undefined;
}

function detectStyleFromText(lower: string): VideoVisualStyle {
  if (/kyberpunk|cyberpunk|neon|futurist|sci-fi|hologram|noční|prší|déšť/i.test(lower)) {
    return 'cyberpunk_neon';
  }
  if (/zlat|luxus|káva|espresso|hodink|šperk|prestiž|eleganc|ranní slunce/i.test(lower)) {
    return 'luxury_gold';
  }
  if (/energick|coral|virál|akčn|sport|tanec|exploz/i.test(lower)) {
    return 'editorial_coral';
  }
  if (/minimal|čist|studio|tutoriál|architekt|černobíl|produkt/i.test(lower)) {
    return 'minimal_dark';
  }
  if (/fintech|smaragd|emerald|\bai\b|faktur|kód|data|byznys|automat/i.test(lower)) {
    return 'fintech_emerald';
  }
  return 'fintech_emerald';
}

function detectCompositionFromText(lower: string): CameraComposition {
  if (/makro|kapk|textur|crema|detailn/i.test(lower)) return 'macro_detail';
  if (/close[- ]?up|obličej|portrét|detail\b/i.test(lower)) return 'close_up';
  if (/fpv|z pohledu|pov|dron/i.test(lower)) return 'pov_first_person';
  if (/širok|panorama|měst|celek|krajin|kancelář/i.test(lower)) return 'wide_establishing';
  return 'medium_shot';
}

function detectLightingFromText(lower: string, style: VideoVisualStyle): LightingPreset {
  if (/zlat[áé]\s+hodin|západ|východ|slunc|tepl/i.test(lower)) return 'golden_hour';
  if (/neon|kyber|hologram|laser/i.test(lower)) return 'volumetric_neon';
  if (/stín|chiaroscuro|dramat|temn|noční/i.test(lower)) return 'dramatic_chiaroscuro';
  if (/denní|přirozen|okno|světl[ýé]/i.test(lower)) return 'clean_daylight';
  if (/studio|rim|produkt|kontur/i.test(lower)) return 'studio_rim';
  return VISUAL_STYLE_PALETTES[style].defaultLighting;
}

function detectOpticsFromText(lower: string, style: VideoVisualStyle): OpticsPreset {
  if (/makro|100mm/i.test(lower)) return 'macro_100mm';
  if (/anamorf|35mm|kino|film/i.test(lower)) return '35mm_anamorphic';
  if (/portrét|85mm|bokeh/i.test(lower)) return '85mm_portrait';
  if (/dron|fpv|16mm|širokoúhl/i.test(lower)) return '16mm_wide_fpv';
  if (/50mm/i.test(lower)) return '50mm_prime';
  return VISUAL_STYLE_PALETTES[style].defaultOptics;
}

function detectAtmosphereFromText(lower: string, style: VideoVisualStyle): AtmospherePreset {
  if (/déšť|prší|mokr|kapk/i.test(lower)) return 'rain_particles';
  if (/pára|mlha|prach|kouř/i.test(lower)) return 'volumetric_dust';
  if (/pruh|záblesk|rychl|světel/i.test(lower)) return 'light_streaks';
  if (/data|mřížk|kód|\bai\b|síť|faktur/i.test(lower)) return 'data_grid';
  if (/čist|minimal|studio/i.test(lower)) return 'clean_studio';
  return VISUAL_STYLE_PALETTES[style].defaultAtmosphere;
}

function splitTemporalClauses(rawText: string): string[] {
  const cleaned = rawText.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  // Split by Czech/English temporal progression markers
  const parts = cleaned
    .split(/(?:\b(?:nejdříve|nejprve|na začátku|úvodem|pak|poté|následně|mezitím|nakonec|na závěr|finálně|then|next|finally)\b|->|→)/i)
    .map((s) => s.replace(/^[,.\s:-]+|[,.\s:-]+$/g, '').trim())
    .filter((s) => s.length >= 4);

  if (parts.length >= 2) {
    return parts.slice(0, 4);
  }

  // Fallback sentence split
  const sentences = cleaned
    .split(/[.;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
  return sentences;
}

function extractPrimarySubject(rawText: string): {
  primarySubject: string;
  subjectAction: string;
  environment: string;
} {
  const clauses = splitTemporalClauses(rawText);
  const firstClause = clauses[0] || rawText.trim() || 'Autonomní AI scéna';

  // Remove command boilerplate
  const stripped = firstClause
    .replace(/^(vytvoř|udělej|vygeneruj|natoč|renderuj|spusť)\s+(?:\d+s?\s*)?(?:video|klip|shorts|reels)?\s*(?:o\s+|na\s+téma\s+)?/i, '')
    .replace(/\b(9:16|16:9|\d+\s*s(ekund)?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const subject = (stripped || firstClause).slice(0, 96);

  let environment = 'dynamická filmová scéna s měřeným kontrastem';
  const envMatch = rawText.match(/\b(?:v|ve|na|nad|uprostřed)\s+([a-záčďéěíňóřšťúůýž0-9\s-]{4,48}?)(?:[,.;]|$)/i);
  if (envMatch && envMatch[1]) {
    environment = envMatch[1].trim();
  }

  let subjectAction = 'plynulý přirozený pohyb a postupné odhalení hlavního detailu';
  if (/let[ií]|průlet|dron/i.test(rawText)) {
    subjectAction = 'rychlý prostorový průlet kolem dominantního prvku';
  } else if (/extrakc|padá|teče|víří/i.test(rawText)) {
    subjectAction = 'jemný dynamický tok textur a stoupající pára v protisvětle';
  } else if (/automat|data|\bai\b|faktur|kód/i.test(rawText)) {
    subjectAction = 'transformace chaotických dat do čisté strukturované podoby';
  }

  return {
    primarySubject: subject,
    subjectAction,
    environment,
  };
}

/**
 * Deterministically parses a free-form Czech/English prompt into a 4-pillar
 * StructuredVideoPrompt (Subject, Style, Camera Motion, Temporal Progression)
 * with zero external / paid / embedded API calls.
 */
export function parseStructuredPromptFromText(
  rawText: string,
  overrides?: {
    aspectRatio?: '9:16' | '16:9';
    durationSec?: number;
    fps?: 24 | 30 | 60;
    visualStyle?: VideoVisualStyle;
    cameraMotion?: OpenGenCameraMotion;
    motionIntensity?: number;
    negativePrompt?: string;
    seed?: number;
  }
): StructuredVideoPrompt {
  const cleanRaw = rawText.trim() || 'Autonomní AI video scéna s dynamickou kamerou';
  const lower = cleanRaw.toLowerCase();

  const aspectRatio: '9:16' | '16:9' =
    overrides?.aspectRatio ||
    (/16:9|horizontáln|na šířku|youtube\s+video/i.test(lower) ? '16:9' : '9:16');

  const durMatch = lower.match(/\b(\d{1,2})\s*(s|sec|sekund[ay]?|vteřin[ay]?)\b/i);
  const parsedDur = durMatch ? Number.parseInt(durMatch[1], 10) : undefined;
  const totalDurationSec = clamp(overrides?.durationSec || parsedDur || 6, 4, 15);
  const fps: 24 | 30 | 60 = overrides?.fps || 30;

  const visualStyle = overrides?.visualStyle || detectStyleFromText(lower);
  const palette = VISUAL_STYLE_PALETTES[visualStyle];
  const lighting = detectLightingFromText(lower, visualStyle);
  const optics = detectOpticsFromText(lower, visualStyle);
  const atmosphere = detectAtmosphereFromText(lower, visualStyle);

  const clauses = splitTemporalClauses(cleanRaw);
  const openingClauseMotion = clauses[0]
    ? detectCameraMotionFromText(clauses[0].toLowerCase())
    : undefined;

  const primaryMotion: OpenGenCameraMotion =
    overrides?.cameraMotion || openingClauseMotion || detectCameraMotionFromText(lower) || 'orbit_360';
  const motionIntensity = clamp(
    overrides?.motionIntensity ?? (primaryMotion === 'static' ? 2 : primaryMotion === 'fpv_drone' ? 8 : 7),
    1,
    10
  );

  const easing: CameraEasing =
    primaryMotion === 'fpv_drone'
      ? 'whip_accelerate'
      : primaryMotion === 'static'
      ? 'linear'
      : 'ease_in_out';

  const stabilization: CameraStabilization =
    primaryMotion === 'fpv_drone'
      ? 'dynamic_fpv'
      : primaryMotion === 'static'
      ? 'tripod_locked'
      : 'gimbal_smooth';

  const subjectInfo = extractPrimarySubject(cleanRaw);
  const composition = detectCompositionFromText(lower);

  const beatPhases: Array<{
    phase: BeatPhase;
    weight: number;
    fallbackMotion: OpenGenCameraMotion;
    transition: BeatTransition;
  }> = [
    {
      phase: 'opening_hook',
      weight: 0.3,
      fallbackMotion: primaryMotion === 'static' ? 'zoom_in' : primaryMotion,
      transition: visualStyle === 'cyberpunk_neon' ? 'glitch_flash' : 'zoom_punch',
    },
    {
      phase: 'development',
      weight: 0.4,
      fallbackMotion:
        primaryMotion === 'zoom_in'
          ? 'orbit_360'
          : primaryMotion === 'fpv_drone'
          ? 'pan_right'
          : primaryMotion,
      transition: 'whip_pan',
    },
    {
      phase: 'closing_loop',
      weight: 0.3,
      fallbackMotion: primaryMotion === 'zoom_out' ? 'zoom_out' : 'zoom_out',
      transition: 'crossfade',
    },
  ];

  const truncateClean = (val: string, maxLen: number): string => {
    const t = val.trim();
    if (t.length <= maxLen) return t;
    const cut = t.slice(0, maxLen);
    const spIdx = cut.lastIndexOf(' ');
    return (spIdx > Math.floor(maxLen * 0.45) ? cut.slice(0, spIdx) : cut).trim();
  };

  const rawBeats: TemporalSceneBeat[] = beatPhases.map((cfg, idx) => {
    const clause = clauses[idx];
    const clauseMotion = clause ? detectCameraMotionFromText(clause.toLowerCase()) : undefined;
    const camKey = idx === 0 ? primaryMotion : clauseMotion || cfg.fallbackMotion;
    const traj = buildCameraTrajectoryForBeat(camKey, motionIntensity, cfg.phase);
    const shortSubj = truncateClean(subjectInfo.primarySubject, 48);

    const beatTitle =
      idx === 0
        ? shortSubj.toUpperCase()
        : idx === 1
        ? `VÝVOJ: ${CAMERA_MOTION_LABELS[camKey].split('(')[0].trim().toUpperCase()}`
        : 'REVEAL & PLYNULÁ SMYČKA';

    const sceneDescription =
      clause ||
      (idx === 0
        ? `Úvodní představení subjektu (${subjectInfo.primarySubject}) v ${LIGHTING_LABELS[lighting].toLowerCase()}.`
        : idx === 1
        ? `Prostorový vývoj scény: ${subjectInfo.subjectAction}, kamera přechází na ${CAMERA_MOTION_LABELS[camKey].toLowerCase()}.`
        : `Závěrečné vyvrcholení v prostředí ${subjectInfo.environment} připravené na čisté zacyklení.`);

    const subjectEvolution =
      idx === 0
        ? `Subjekt vstupuje do ohniska (${COMPOSITION_LABELS[composition].split('(')[0].trim()})`
        : idx === 1
        ? `Vrchol pohybu: ${subjectInfo.subjectAction}`
        : 'Kompozice se uzavírá do stabilního rámu';

    const lightingShift =
      idx === 0
        ? `${LIGHTING_LABELS[lighting]} · úvodní akcent`
        : idx === 1
        ? `Zesílený kontrast a barevný posun (${palette.colorGrading})`
        : 'Vyvážené finální dosvícení scény';

    return {
      id: idx + 1,
      phase: cfg.phase,
      startSec: 0,
      endSec: 0,
      durationSec: Number((totalDurationSec * cfg.weight).toFixed(1)),
      beatTitle,
      sceneDescription,
      subjectEvolution,
      cameraKeyframe: camKey,
      cameraZoomStart: traj.zoomStart,
      cameraZoomEnd: traj.zoomEnd,
      cameraPanX: traj.panX,
      cameraPanY: traj.panY,
      lightingShift,
      transitionIn: cfg.transition,
      kineticCaption:
        idx === 0
          ? shortSubj
          : idx === 1
          ? truncateClean(subjectInfo.subjectAction, 56)
          : 'SLEDUJTE DALŠÍ VÝVOJ',
      visualCue: `${OPTICS_LABELS[optics].split('(')[0].trim()} · ${CAMERA_MOTION_LABELS[camKey].split('(')[0].trim()}`,
    };
  });

  const beats = rebalanceTemporalBeats(rawBeats, totalDurationSec);

  return {
    version: '2.0',
    engine: 'local-structured-director',
    seed: overrides?.seed ?? hashSeed(cleanRaw),
    rawPrompt: cleanRaw,
    aspectRatio,
    totalDurationSec,
    fps,
    subject: {
      primarySubject: subjectInfo.primarySubject,
      subjectAction: subjectInfo.subjectAction,
      environment: subjectInfo.environment,
      composition,
    },
    style: {
      visualStyle,
      lighting,
      optics,
      colorGrading: palette.colorGrading,
      atmosphere,
      accentColor: palette.accentColor,
      secondaryColor: palette.secondaryColor,
      bgHex: palette.bgHex,
      negativePrompt:
        overrides?.negativePrompt?.trim() ||
        'artefakty, rozmazání, deformace, statický obraz, přepaly, vodoznak',
    },
    camera: {
      primaryMotion,
      motionIntensity,
      easing,
      stabilization,
    },
    temporal: {
      pacing:
        primaryMotion === 'fpv_drone'
          ? 'crescendo_build'
          : primaryMotion === 'static'
          ? 'steady_narrative'
          : 'explosive_hook',
      beats,
    },
  };
}

/**
 * Compiles a StructuredVideoPrompt into an explicit, transparent directive string
 * covering Subject, Style, Camera Motion, and Temporal Evolution.
 */
export function compileStructuredPromptText(prompt: StructuredVideoPrompt): string {
  const beatsSummary = prompt.temporal.beats
    .map(
      (b) =>
        `[${b.startSec.toFixed(1)}–${b.endSec.toFixed(1)}s · ${PHASE_LABELS[b.phase]}] ${b.sceneDescription} (Kamera: ${CAMERA_MOTION_LABELS[b.cameraKeyframe]}, Přechod: ${TRANSITION_LABELS[b.transitionIn]})`
    )
    .join(' -> ');

  return [
    `[SUBJEKT] ${prompt.subject.primarySubject}; akce: ${prompt.subject.subjectAction}; prostředí: ${prompt.subject.environment}; záběr: ${COMPOSITION_LABELS[prompt.subject.composition]}.`,
    `[STYL] ${VISUAL_STYLE_PALETTES[prompt.style.visualStyle].label}; světlo: ${LIGHTING_LABELS[prompt.style.lighting]}; optika: ${OPTICS_LABELS[prompt.style.optics]}; grading: ${prompt.style.colorGrading}; atmosféra: ${ATMOSPHERE_LABELS[prompt.style.atmosphere]}.`,
    `[KAMERA] ${CAMERA_MOTION_LABELS[prompt.camera.primaryMotion]} (intenzita ${prompt.camera.motionIntensity}/10, ${prompt.camera.easing}, ${prompt.camera.stabilization}).`,
    `[ČASOVÝ VÝVOJ ${prompt.totalDurationSec}s @ ${prompt.fps}fps] ${beatsSummary}`,
  ].join('\n');
}

/**
 * Purely local, deterministic intelligent prompt enrichment (no paid/open-source/embedded API).
 * Refines subject details, optical realism, camera keyframes, and temporal progression.
 */
export function enhanceStructuredPromptLocally(
  input: StructuredVideoPrompt | string,
  options?: {
    cameraMotion?: OpenGenCameraMotion;
    visualStyle?: VideoVisualStyle;
    motionIntensity?: number;
  }
): {
  structuredPrompt: StructuredVideoPrompt;
  compiledText: string;
  tips: string[];
} {
  const base =
    typeof input === 'string'
      ? parseStructuredPromptFromText(input, {
          cameraMotion: options?.cameraMotion,
          visualStyle: options?.visualStyle,
          motionIntensity: options?.motionIntensity,
        })
      : structuredClone(input);

  const palette = VISUAL_STYLE_PALETTES[options?.visualStyle || base.style.visualStyle];
  const cameraMotion = options?.cameraMotion || base.camera.primaryMotion;
  const intensity = clamp(options?.motionIntensity ?? Math.max(6, base.camera.motionIntensity), 1, 10);

  // Enrich subject action and environment if terse
  const enrichedSubject = {
    ...base.subject,
    subjectAction:
      base.subject.subjectAction.length < 36
        ? `${base.subject.subjectAction}, s mikro-pohybem detailů a přirozenou reakcí na světlo`
        : base.subject.subjectAction,
    environment:
      base.subject.environment.length < 32
        ? `${base.subject.environment}, hloubková paralaxa popředí a pozadí`
        : base.subject.environment,
  };

  // Enrich style & negative prompt
  const enrichedStyle = {
    ...base.style,
    visualStyle: options?.visualStyle || base.style.visualStyle,
    accentColor: palette.accentColor,
    secondaryColor: palette.secondaryColor,
    bgHex: palette.bgHex,
    colorGrading: palette.colorGrading,
    negativePrompt:
      base.style.negativePrompt ||
      'artefakty, rozmazání pohybu, ploché osvětlení, deformace geometrie, vodoznak',
  };

  // Enrich temporal beats so each beat has distinct camera progression & lighting shift
  const progressionMotions: OpenGenCameraMotion[] =
    cameraMotion === 'fpv_drone'
      ? ['fpv_drone', 'orbit_360', 'zoom_out']
      : cameraMotion === 'orbit_360'
      ? ['zoom_in', 'orbit_360', 'zoom_out']
      : cameraMotion === 'static'
      ? ['static', 'zoom_in', 'static']
      : [cameraMotion, 'orbit_360', 'zoom_out'];

  const enrichedBeats = rebalanceTemporalBeats(
    base.temporal.beats.map((beat, idx) => {
      const beatCam = progressionMotions[idx % progressionMotions.length] || beat.cameraKeyframe;
      const traj = buildCameraTrajectoryForBeat(beatCam, intensity, beat.phase);
      return {
        ...beat,
        cameraKeyframe: beatCam,
        cameraZoomStart: traj.zoomStart,
        cameraZoomEnd: traj.zoomEnd,
        cameraPanX: traj.panX,
        cameraPanY: traj.panY,
        lightingShift:
          idx === 0
            ? `${LIGHTING_LABELS[enrichedStyle.lighting]} · ostrý nástup`
            : idx === 1
            ? `Gradace atmosféry (${ATMOSPHERE_LABELS[enrichedStyle.atmosphere].toLowerCase()})`
            : `Finální vyrovnání barev (${enrichedStyle.colorGrading})`,
      };
    }),
    base.totalDurationSec
  );

  const structuredPrompt: StructuredVideoPrompt = {
    ...base,
    engine: 'local-structured-director',
    subject: enrichedSubject,
    style: enrichedStyle,
    camera: {
      ...base.camera,
      primaryMotion: cameraMotion,
      motionIntensity: intensity,
    },
    temporal: {
      ...base.temporal,
      beats: enrichedBeats,
    },
  };

  return {
    structuredPrompt,
    compiledText: compileStructuredPromptText(structuredPrompt),
    tips: [
      `Subjekt byl propojen s prostředím (${COMPOSITION_LABELS[enrichedSubject.composition]}) bez externího API.`,
      `Časový vývoj rozdělil ${structuredPrompt.totalDurationSec}s do ${enrichedBeats.length} navazujících fází kamery (${enrichedBeats.map((b) => CAMERA_MOTION_LABELS[b.cameraKeyframe].split('(')[0].trim()).join(' → ')}).`,
      `Optika ${OPTICS_LABELS[enrichedStyle.optics]} a atmosféra (${ATMOSPHERE_LABELS[enrichedStyle.atmosphere]}) jsou přímo napojeny na lokální FFmpeg render.`,
    ],
  };
}

/**
 * Evaluates completeness across the 4 pillars (Subject, Style, Camera, Temporal)
 */
export function scoreStructuredPromptCompleteness(
  prompt: StructuredVideoPrompt
): StructuredPromptScore {
  const tips: string[] = [];

  let subjectScore = 0;
  if (prompt.subject.primarySubject.trim().length >= 5) subjectScore += 10;
  else tips.push('Upřesněte hlavní subjekt (alespoň 5 znaků).');
  if (prompt.subject.subjectAction.trim().length >= 8) subjectScore += 8;
  else tips.push('Doplňte konkrétní akci nebo pohyb subjektu.');
  if (prompt.subject.environment.trim().length >= 6) subjectScore += 7;
  else tips.push('Popište prostředí a pozadí scény.');

  let styleScore = 0;
  if (prompt.style.visualStyle) styleScore += 8;
  if (prompt.style.lighting) styleScore += 6;
  if (prompt.style.optics) styleScore += 6;
  if (prompt.style.negativePrompt.trim().length >= 4) styleScore += 5;
  else tips.push('Zadejte negativní prompt pro čistší výstup.');

  let cameraScore = 0;
  if (prompt.camera.primaryMotion) cameraScore += 12;
  if (prompt.camera.motionIntensity >= 1 && prompt.camera.motionIntensity <= 10) cameraScore += 7;
  if (prompt.camera.easing && prompt.camera.stabilization) cameraScore += 6;

  let temporalScore = 0;
  const beats = prompt.temporal.beats || [];
  if (beats.length >= 2) temporalScore += 10;
  else tips.push('Přidejte alespoň 2 časové fáze vývoje scény.');
  if (beats.length >= 3) temporalScore += 5;
  const distinctMotions = new Set(beats.map((b) => b.cameraKeyframe));
  if (distinctMotions.size >= 2) temporalScore += 5;
  else if (beats.length >= 2) tips.push('Pro dynamičtější vývoj použijte různý pohyb kamery v jednotlivých fázích.');
  if (beats.every((b) => b.sceneDescription.trim().length >= 8)) temporalScore += 5;
  else tips.push('Každá časová fáze by měla mít vlastní popis vývoje scény.');

  return {
    overall: clamp(subjectScore + styleScore + cameraScore + temporalScore, 0, 100),
    pillars: {
      subject: subjectScore,
      style: styleScore,
      camera: cameraScore,
      temporal: temporalScore,
    },
    tips,
  };
}
