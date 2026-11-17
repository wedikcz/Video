/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FactoryAsset,
  HardcoreRealismProfile,
  MonetizationAuditResult,
  MonetizationCheckItem,
  MonetizationCheatsheetBlueprint,
  PromptBuilderTag,
  StructuredVideoPrompt,
  TemporalSceneBeat,
} from '../types/nexus.ts';
import {
  VISUAL_STYLE_PALETTES,
  buildCameraTrajectoryForBeat,
  compileStructuredPromptText,
  rebalanceTemporalBeats,
} from './structuredVideoPrompt.ts';

export const DEFAULT_HARDCORE_REALISM_PROFILE: HardcoreRealismProfile = {
  cameraBody: 'ARRI Alexa 65 · 6.5K Open Gate',
  shutterAngle: '180deg_cinematic',
  colorPipeline: 'ACES_filmic',
  audioLufsTarget: '-14_LUFS_social',
  sensorGrain: 'fine_35mm',
};

export const VISUAL_DRAG_TAGS: PromptBuilderTag[] = [
  // Camera Movement Presets
  {
    id: 'cam-fpv-drone',
    category: 'camera',
    label: 'FPV Dronový průlet',
    shortLabel: 'FPV Dron',
    promptSnippet: 'dynamický nízký FPV dronový průlet prostorem',
    description: 'Agilní nálet s lehkým náklonem v zatáčkách pro maximální první vteřiny.',
    cameraMotion: 'fpv_drone',
    motionIntensity: 8,
  },
  {
    id: 'cam-orbit-360',
    category: 'camera',
    label: 'Orbit 360° kolem subjektu',
    shortLabel: 'Orbit 360°',
    promptSnippet: 'plynulý orbit 360 kolem hlavního objektu',
    description: 'Kruhový záběr zdůrazňující hloubku prostoru a paralaxu popředí.',
    cameraMotion: 'orbit_360',
    motionIntensity: 7,
  },
  {
    id: 'cam-zoom-in',
    category: 'camera',
    label: 'Dolly Zoom In (Nájezd)',
    shortLabel: 'Zoom In',
    promptSnippet: 'plynulý filmový nájezd kamery na detail',
    description: 'Zintenzivní pozornost diváka na hlavní objekt během prvních 2 sekund.',
    cameraMotion: 'zoom_in',
    motionIntensity: 7,
  },
  {
    id: 'cam-zoom-out',
    category: 'camera',
    label: 'Reveal Zoom Out (Odjezd)',
    shortLabel: 'Zoom Out',
    promptSnippet: 'plynulý odjezd kamery do širokého celku',
    description: 'Odhalí kontext scény nebo připraví čistý rám pro závěrečné CTA.',
    cameraMotion: 'zoom_out',
    motionIntensity: 6,
  },
  {
    id: 'cam-pan-right',
    category: 'camera',
    label: 'Tracking Švenk Vpravo',
    shortLabel: 'Pan Right',
    promptSnippet: 'plynulý horizontální švenk vpravo sledující akci',
    description: 'Sleduje pohyb subjektu zleva doprava bez rušivého třesu.',
    cameraMotion: 'pan_right',
    motionIntensity: 6,
  },
  {
    id: 'cam-pan-left',
    category: 'camera',
    label: 'Tracking Švenk Vlevo',
    shortLabel: 'Pan Left',
    promptSnippet: 'plynulý horizontální švenk vlevo',
    description: 'Horizontální pohyb vlevo pro přechod mezi dvěma body scény.',
    cameraMotion: 'pan_left',
    motionIntensity: 6,
  },
  {
    id: 'cam-tilt-up',
    category: 'camera',
    label: 'Hero Tilt Up (Náklon nahoru)',
    shortLabel: 'Tilt Up',
    promptSnippet: 'vertikální náklon kamery zdola nahoru',
    description: 'Buduje monumentálnost produktu, architektury nebo postavy.',
    cameraMotion: 'tilt_up',
    motionIntensity: 6,
  },
  {
    id: 'cam-tilt-down',
    category: 'camera',
    label: 'Reveal Tilt Down',
    shortLabel: 'Tilt Down',
    promptSnippet: 'vertikální náklon shora dolů na pracovní scénu',
    description: 'Přechod z atmosféry oblohy či stropu přímo na detail subjektu.',
    cameraMotion: 'tilt_down',
    motionIntensity: 6,
  },
  {
    id: 'cam-static',
    category: 'camera',
    label: 'Stativ Tripod Locked',
    shortLabel: 'Tripod Statická',
    promptSnippet: 'uzamčená studiová kamera na pevném stativu',
    description: 'Nulový pohyb kamery pro čistá vysvětlující videa a produktové texty.',
    cameraMotion: 'static',
    motionIntensity: 2,
  },

  // Visual Style Tags
  {
    id: 'style-cyberpunk',
    category: 'style',
    label: 'Cyberpunk Neon LUT',
    shortLabel: 'Cyberpunk Neon',
    promptSnippet: 'v kyberpunk neonovém stylu s azurovým a purpurovým kontrastem',
    description: 'Noční odlesky, volumetrické neony a vysoká retence u tech/AI Shorts.',
    visualStyle: 'cyberpunk_neon',
  },
  {
    id: 'style-fintech',
    category: 'style',
    label: 'FinTech Emerald Pro',
    shortLabel: 'FinTech Emerald',
    promptSnippet: 'v čistém smaragdovém FinTech stylu s přesným datovým kontrastem',
    description: 'Vysoká důvěryhodnost a nejvyšší RPM v B2B, financích a AI automatizaci.',
    visualStyle: 'fintech_emerald',
  },
  {
    id: 'style-luxury',
    category: 'style',
    label: 'Luxury Gold Film',
    shortLabel: 'Luxury Gold',
    promptSnippet: 'v luxusním zlatém filmovém stylu při teplém světle',
    description: 'Prémiový vzhled pro e-commerce, kávu, šperky, reality a lifestyle.',
    visualStyle: 'luxury_gold',
  },
  {
    id: 'style-coral',
    category: 'style',
    label: 'Energický Viral Coral',
    shortLabel: 'Viral Coral',
    promptSnippet: 'v energickém virálním korálovém stylu s úderným střihem',
    description: 'Maximalizuje pozornost v prvních 2 sekundách na TikToku a Reels.',
    visualStyle: 'editorial_coral',
  },
  {
    id: 'style-minimal',
    category: 'style',
    label: 'Minimal Architectural Studio',
    shortLabel: 'Minimal Studio',
    promptSnippet: 'v čistém minimalistickém studiovém stylu bez rušivých prvků',
    description: 'Čitelnost na první pohled pro tutoriály, SaaS dema a komentáře.',
    visualStyle: 'minimal_dark',
  },

  // Optics & Lighting Tags
  {
    id: 'optics-35mm-anamorphic',
    category: 'optics',
    label: '35mm Anamorfní Kino',
    shortLabel: '35mm Anamorphic',
    promptSnippet: 'natočeno na 35mm anamorfní objektiv s filmovým bokeh',
    description: 'Klasický širokoúhlý kino look s jemnými horizontálními odlesky.',
    optics: '35mm_anamorphic',
  },
  {
    id: 'optics-100mm-macro',
    category: 'optics',
    label: '100mm Makro Mikrodetaily',
    shortLabel: '100mm Makro',
    promptSnippet: 'extrémní makro detail objektivem 100mm s mělkou hloubkou ostrosti',
    description: 'Odhaluje texturu kapek, kovu, textilu a produktové řemeslnosti.',
    optics: 'macro_100mm',
  },
  {
    id: 'optics-85mm-portrait',
    category: 'optics',
    label: '85mm f/1.2 Portrét',
    shortLabel: '85mm f/1.2',
    promptSnippet: 'portrétní objektiv 85mm f/1.2 s krémově odděleným pozadím',
    description: 'Izoluje hlavní subjekt od pozadí a působí okamžitě prémiově.',
    optics: '85mm_portrait',
  },
  {
    id: 'light-golden-hour',
    category: 'lighting',
    label: 'Golden Hour Protisvětlo',
    shortLabel: 'Golden Hour',
    promptSnippet: 'měkké boční světlo zlaté hodiny a přirozené odlesky',
    description: 'Přirozeně teplá filmová plasticita bez tvrdých stínů.',
    lighting: 'golden_hour',
  },
  {
    id: 'light-studio-rim',
    category: 'lighting',
    label: 'Studiové Rim Light',
    shortLabel: 'Studio Rim',
    promptSnippet: 'přesné studiové konturové světlo oddělující hrany objektu',
    description: 'Ostrá silueta a špičková čitelnost i na malém displeji mobilu.',
    lighting: 'studio_rim',
  },
  {
    id: 'atmo-rain-particles',
    category: 'atmosphere',
    label: 'Odlesky deště & mlha',
    shortLabel: 'Déšť & Odlesky',
    promptSnippet: 'mokré povrchy s jemnými částicemi deště a odlesky světla',
    description: 'Zvyšuje fotorealistickou hloubku a dynamiku pohybu v prostoru.',
    atmosphere: 'rain_particles',
  },
  {
    id: 'atmo-volumetric-dust',
    category: 'atmosphere',
    label: 'Volumetrické paprsky & pára',
    shortLabel: 'Pára & Paprsky',
    promptSnippet: 'jemná stoupající pára a prachové částice v paprscích světla',
    description: 'Dodává scéně hmatatelný prostor a trojrozměrnou atmosféru.',
    atmosphere: 'volumetric_dust',
  },

  // Hardcore Realism Pipeline Tags
  {
    id: 'real-arri-logc4',
    category: 'realism',
    label: 'ARRI Alexa 65 · ACES Filmic',
    shortLabel: 'ARRI 65 ACES',
    promptSnippet: 'fyzikálně přesná expozice ARRI LogC4 a ACES Filmic color pipeline',
    description: 'Přirozené přechody světel bez digitálních přepalů a plastického vzhledu.',
    realismPatch: {
      cameraBody: 'ARRI Alexa 65 · 6.5K Open Gate',
      colorPipeline: 'ACES_filmic',
      sensorGrain: 'fine_35mm',
    },
  },
  {
    id: 'real-180-shutter',
    category: 'realism',
    label: '180° Shutter Motion Blur',
    shortLabel: '180° Shutter',
    promptSnippet: 'přirozené filmové rozostření pohybu podle pravidla 180° závěrky',
    description: 'Eliminuje trhaný CGI pohyb a zajišťuje plynulé kinematografické snímky.',
    realismPatch: {
      shutterAngle: '180deg_cinematic',
    },
  },
  {
    id: 'real-binaural-lufs',
    category: 'realism',
    label: 'Audio -14 LUFS + Foley',
    shortLabel: '-14 LUFS Audio',
    promptSnippet: 'vyrovnaný zvukový mix -14 LUFS s prostorovým foley a čistým voiceoverem',
    description: 'Okamžitě splňuje hlasitostní standard YouTube Shorts, TikTok a Reels.',
    realismPatch: {
      audioLufsTarget: '-14_LUFS_social',
    },
  },

  // Monetization & Retention Tags
  {
    id: 'mon-3s-hook',
    category: 'monetization',
    label: '0–1.5s Pattern Interrupt Hook',
    shortLabel: '1.5s Hook',
    promptSnippet: 'okamžitý vizuální háček v první sekundě s jasným kontrastem problému a výsledku',
    description: 'Zastaví scrollování během prvních 1,5 s pro nadprůměrnou retenci.',
  },
  {
    id: 'mon-ad-safe',
    category: 'monetization',
    label: '100% Brand-Safe Filtr',
    shortLabel: 'Brand-Safe',
    promptSnippet: 'čistý komerčně bezpečný vizuál bez log třetích stran a vodoznaků',
    description: 'Chrání před žlutým dolarem (limited ads) a copyright nároky.',
    negativeAddition:
      'vodoznak, cizí loga, ochranné známky, násilí, clickbait text přes celý obraz, rozmazané tváře',
  },
  {
    id: 'mon-loop-cta',
    category: 'monetization',
    label: 'Nekonečná smyčka & Affiliate CTA',
    shortLabel: 'Loop & CTA',
    promptSnippet: 'závěr plynule navazující na první snímek s jasnou výzvou k akci',
    description: 'Zvyšuje průměrnou dobu sledování přes 100 % a konverze v popisku.',
  },
];

export const MONETIZATION_CHEATSHEETS: MonetizationCheatsheetBlueprint[] = [
  {
    id: 'cs-yt-shorts-rpm',
    title: 'YouTube Shorts · Vysoká retence >105 %',
    platform: 'YouTube Shorts',
    format: '9:16',
    rpmTier: 'Tier 1 Viral + AdSense Pool',
    hookFormula: 'Vizuální šok / výsledek do 1.5s + velký 3-slovný titulek uprostřed bezpečné zóny',
    retentionRule: 'Změna úhlu kamery každých 2.0–2.5s + plynulý závěr navazující na první větu.',
    adSafetyRule: 'Žádná cizí hudba s copyrightem, čistá originální procedurální scéna a bez vodoznaků.',
    cameraRecipe: 'Zoom In (Hook 2s) → Orbit 360° (Vývoj 3.5s) → Zoom Out (Smyčka 2.5s)',
    checklist: [
      'První fáze pod 2.5 s s okamžitým vizuálním pohybem kamery',
      'Kinetické titulky max. 5 slov v bezpečné středové zóně 9:16',
      'Minimálně 3 časové fáze s odlišným pohybem kamery',
      'Bezpečný negativní prompt blokující vodoznaky a cizí loga',
    ],
    rawPrompt:
      'Nejdříve okamžitý rychlý nájezd na výsledek AI automatizace faktur v čistém studiu, pak plynulý orbit 360 kolem přehledné smaragdové datové mřížky s jasným postupem, nakonec plynulý odjezd zpět do smyčky s výzvou k uložení 8s.',
    structuredPreset: {
      aspectRatio: '9:16',
      totalDurationSec: 8,
      fps: 30,
      subject: {
        primarySubject: 'Ukázka výsledku AI automatizace pro úsporu 10 hodin týdně',
        subjectAction: 'rychlá transformace nepořádku do čistého výstupu s jasnými kroky',
        environment: 'čisté smaragdové FinTech studio s datovou hloubkou',
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
        negativePrompt:
          'vodoznak, cizí loga, nečitelné titulky, rozmazání, statický obraz, klikací spam',
      },
      camera: {
        primaryMotion: 'zoom_in',
        motionIntensity: 8,
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
            endSec: 2.2,
            durationSec: 2.2,
            beatTitle: '0–2S PATTERN INTERRUPT HOOK',
            sceneDescription: 'Rychlý nájezd přímo na finální úsporu času před a po nasazení.',
            subjectEvolution: 'Hlavní číslo a kontrast problému okamžitě upoutá zrak.',
            cameraKeyframe: 'zoom_in',
            cameraZoomStart: 1.0,
            cameraZoomEnd: 1.22,
            cameraPanX: 0,
            cameraPanY: 0,
            lightingShift: 'Ostrý smaragdový akcent v ohnisku',
            transitionIn: 'zoom_punch',
            kineticCaption: 'UŠETŘI 10 HODIN TÝDNĚ',
            visualCue: '50mm prime · Rychlý nájezd',
          },
          {
            id: 2,
            phase: 'development',
            startSec: 2.2,
            endSec: 5.5,
            durationSec: 3.3,
            beatTitle: '3-KROKOVÝ DŮKAZ V POHYBU',
            sceneDescription: 'Orbit 360° odhaluje 3 konkrétní kroky bez zbytečné vaty.',
            subjectEvolution: 'Datové bloky se seřazují v přesném tempu.',
            cameraKeyframe: 'orbit_360',
            cameraZoomStart: 1.12,
            cameraZoomEnd: 1.18,
            cameraPanX: 0.35,
            cameraPanY: 0.08,
            lightingShift: 'Konturové studiové světlo kolem karet',
            transitionIn: 'whip_pan',
            kineticCaption: '3 KROKY BEZ PROGRAMOVÁNÍ',
            visualCue: 'Orbit 360° · Plynulá paralaxa',
          },
          {
            id: 3,
            phase: 'closing_loop',
            startSec: 5.5,
            endSec: 8.0,
            durationSec: 2.5,
            beatTitle: 'SMYČKA & KONVERZNÍ CTA',
            sceneDescription: 'Plynulý odjezd zpět do celku s prostorem pro výzvu v popisku.',
            subjectEvolution: 'Obraz se vrací do výchozí kompozice pro plynulý replay.',
            cameraKeyframe: 'zoom_out',
            cameraZoomStart: 1.15,
            cameraZoomEnd: 1.0,
            cameraPanX: 0,
            cameraPanY: 0,
            lightingShift: 'Čisté symetrické dosvícení pro CTA',
            transitionIn: 'crossfade',
            kineticCaption: 'ULOŽ SI POSTUP V POPISKU',
            visualCue: 'Zoom Out · Loop Ready',
          },
        ],
      },
      realismProfile: { ...DEFAULT_HARDCORE_REALISM_PROFILE },
    },
    monetizationKit: {
      seoTitle: 'Jak ušetřit 10 hodin týdně pomocí AI workflow (3 konkrétní kroky)',
      hookLine: 'Většina lidí tohle stále dělá ručně – tady jsou 3 kroky za 60 sekund.',
      ctaLine: 'Ulož si video a získej šablonu přes odkaz v připnutém komentáři.',
      brandSafeTags: ['AIAutomatizace', 'Produktivita', 'FinTech', 'Tutorial', 'Podnikani'],
      estimatedRpmTier: 'Vysoké B2B / Tech RPM (100 % Ad-Friendly)',
    },
  },
  {
    id: 'cs-high-rpm-b2b-16x9',
    title: 'YouTube 16:9 · High-RPM Tech & FinTech Deep Dive',
    platform: 'YouTube Video',
    format: '16:9',
    rpmTier: 'Nejvyšší CPM/RPM (Finance, SaaS, AI)',
    hookFormula: 'Konkrétní problém s číslem + vizuální důkaz funkčního systému během 3 sekund',
    retentionRule: 'Kombinace 35mm anamorfní optiky, klidnějšího Dolly pohybu a jasných vizuálních kapitol.',
    adSafetyRule: 'Vyvážené tvrzení bez nereálných slibů zisku, plně kompatibilní s B2B sponzory.',
    cameraRecipe: 'Dolly Zoom In → Pan Right (Architektura) → Static/Zoom Out (Sponzor & CTA)',
    checklist: [
      'Širokoúhlý formát 16:9 s 35mm anamorfní hloubkou',
      'ACES Filmic barevné podání bez přesaturovaných neonů',
      'Strukturovaný přechod Problém → Systém → Výsledek',
      'Bezpečný affiliate / lead-magnet CTA závěr',
    ],
    rawPrompt:
      'Nejdříve filmový 35mm anamorfní nájezd na čistou B2B FinTech konzoli v tmavém studiu, pak plynulý švenk vpravo přes architekturu datového toku a reálné úspory nákladů, nakonec široký stabilní záběr pro doporučení nástroje 12s 16:9.',
    structuredPreset: {
      aspectRatio: '16:9',
      totalDurationSec: 12,
      fps: 24,
      subject: {
        primarySubject: 'Architektura autonomního B2B SaaS a finančního workflow',
        subjectAction: 'přesné proudění dat mezi moduly s měřitelným snížením chybovosti',
        environment: 'čisté architektonické studio s jemným rim osvětlením',
        composition: 'wide_establishing',
      },
      style: {
        visualStyle: 'minimal_dark',
        lighting: 'studio_rim',
        optics: '35mm_anamorphic',
        colorGrading: 'Clean Neutral Architectural LUT',
        atmosphere: 'clean_studio',
        accentColor: '#38bdf8',
        secondaryColor: '#e4e4e7',
        bgHex: '0x0b0f17',
        negativePrompt:
          'clickbait šipky, křiklavé nápisy, vodoznaky, sliby garantovaného zbohatnutí, nízké rozlišení',
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
            endSec: 3.5,
            durationSec: 3.5,
            beatTitle: 'TEZE & KONTEXT PROBLÉMU',
            sceneDescription: 'Pomalý anamorfní nájezd na reálnou datovou konzoli v tmavém studiu.',
            subjectEvolution: 'Klíčové metrické okno vystupuje do popředí.',
            cameraKeyframe: 'zoom_in',
            cameraZoomStart: 1.0,
            cameraZoomEnd: 1.14,
            cameraPanX: 0,
            cameraPanY: 0,
            lightingShift: 'Studené studiové klíčové světlo 5600K',
            transitionIn: 'crossfade',
            kineticCaption: 'PROČ VĚTŠINA FIREM ZTRÁCÍ 30 % ČASU',
            visualCue: '35mm Anamorfní · Dolly Zoom In',
          },
          {
            id: 2,
            phase: 'development',
            startSec: 3.5,
            endSec: 8.5,
            durationSec: 5.0,
            beatTitle: 'ROZBOR SYSTÉMU & ARCHITEKTURA',
            sceneDescription: 'Horizontální tracking švenk vpravo přes jednotlivé vrstvy řešení.',
            subjectEvolution: 'Propojení vstupu, validace a výstupního reportu v přímém přenosu.',
            cameraKeyframe: 'pan_right',
            cameraZoomStart: 1.08,
            cameraZoomEnd: 1.08,
            cameraPanX: 0.45,
            cameraPanY: 0,
            lightingShift: 'Jemný rim kontrast oddělující vrstvy',
            transitionIn: 'crossfade',
            kineticCaption: '3 VRSTVY OVĚŘENÉ AUTOMATIZACE',
            visualCue: 'Cinematic Dolly · Pan Right',
          },
          {
            id: 3,
            phase: 'climax_reveal',
            startSec: 8.5,
            endSec: 12.0,
            durationSec: 3.5,
            beatTitle: 'SHRNUTÍ & LEAD-MAGNET CTA',
            sceneDescription: 'Široký odjezd do čistého rozvržení pro koncovou obrazovku a odkaz.',
            subjectEvolution: 'Přehled celého workflow připravený pro proklik.',
            cameraKeyframe: 'zoom_out',
            cameraZoomStart: 1.12,
            cameraZoomEnd: 0.98,
            cameraPanX: 0,
            cameraPanY: 0,
            lightingShift: 'Vyvážené neutrální osvětlení pro texty',
            transitionIn: 'crossfade',
            kineticCaption: 'KOMPLETNÍ CHECKLIST V POPISKU',
            visualCue: 'Reveal Zoom Out · 24fps Cinema',
          },
        ],
      },
      realismProfile: {
        cameraBody: 'ARRI Alexa 65 · 6.5K Open Gate',
        shutterAngle: '180deg_cinematic',
        colorPipeline: 'ARRI_LogC4',
        audioLufsTarget: '-16_LUFS_youtube',
        sensorGrain: 'fine_35mm',
      },
    },
    monetizationKit: {
      seoTitle: 'Kompletní B2B AI Automatizace Workflow: Reálná architektura a ROI',
      hookLine: 'Rozebrali jsme reálný provozní proces krok za krokem bez marketingové omáčky.',
      ctaLine: 'Stáhněte si kompletní technickou šablonu a checklist v popisku videa.',
      brandSafeTags: ['SaaS', 'B2BAutomatizace', 'TechReview', 'Workflow', 'Efektivita'],
      estimatedRpmTier: 'Prémiové SaaS / B2B RPM (Vhodné pro sponzoring)',
    },
  },
  {
    id: 'cs-ugc-product-macro',
    title: 'E-commerce / UGC · Produktový Konverzní Funnel',
    platform: 'Instagram Reels',
    format: '9:16',
    rpmTier: 'Přímá konverze & Affiliate Prodej',
    hookFormula: '100mm Makro senzorický detail v prvních 2 sekundách + okamžitá benefiční demonstrace',
    retentionRule: 'Rychlý přechod z extrémního makro detailu do plynulého orbitu kolem produktu.',
    adSafetyRule: 'Realistické vlastnosti produktu bez klamavých tvrzení, čisté produktové nasvícení.',
    cameraRecipe: 'Makro Zoom In → Orbit 360° (Demonstrace) → Zoom Out (Produkt & Nabídka)',
    checklist: [
      '100mm makro optika odhalující reálnou texturu produktu',
      'Zlatá hodina / studiový rim pro prémiovou hodnotu značky',
      'Konverzní finále s prostorem pro produktový štítek',
      'Čisté pozadí bez rušivých prvků v okolí produktu',
    ],
    rawPrompt:
      'Nejdříve makro detail zlaté cremy výběrového espressa padající do dvojitého skla v ranním slunci, pak orbit 360 kolem šálku skrz jemnou páru, nakonec čistý produktový odjezd v teplém studiu 8s.',
    structuredPreset: {
      aspectRatio: '9:16',
      totalDurationSec: 8,
      fps: 30,
      subject: {
        primarySubject: 'Prémiové výběrové espresso ve dvojitém termálním skle',
        subjectAction: 'hustá zlatá crema se víří a stoupá aromatická pára v protisvětle',
        environment: 'tmavý broušený kámen s paprsky ranního slunce',
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
        negativePrompt:
          'umělý plastový vzhled, vodoznaky, přeexponovaná bílá, roztřesená ruční kamera',
      },
      camera: {
        primaryMotion: 'zoom_in',
        motionIntensity: 6,
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
            beatTitle: '100MM SENZORICKÝ MAKRO HOOK',
            sceneDescription: 'Hluboký makro nájezd na první dotek zlaté cremy se sklem.',
            subjectEvolution: 'Hladina ožívá v teplém bočním paprsku.',
            cameraKeyframe: 'zoom_in',
            cameraZoomStart: 1.0,
            cameraZoomEnd: 1.18,
            cameraPanX: 0,
            cameraPanY: 0.06,
            lightingShift: 'Zlaté boční protisvětlo',
            transitionIn: 'crossfade',
            kineticCaption: 'EXTRAKCE 9 BARŮ V DETAILU',
            visualCue: '100mm Macro · Zoom In',
          },
          {
            id: 2,
            phase: 'development',
            startSec: 2.5,
            endSec: 5.5,
            durationSec: 3.0,
            beatTitle: 'ORBIT SKRZ AROMATICKOU PÁRU',
            sceneDescription: 'Kamera krouží kolem šálku, pára láme zlaté světlo.',
            subjectEvolution: 'Značka vyniká v přirozeném prostorovém kontrastu.',
            cameraKeyframe: 'orbit_360',
            cameraZoomStart: 1.14,
            cameraZoomEnd: 1.08,
            cameraPanX: 0.35,
            cameraPanY: -0.04,
            lightingShift: 'Volumetrické zlaté částice v protisvětle',
            transitionIn: 'crossfade',
            kineticCaption: 'ČERSTVĚ PRAŽENÉ ZRNKO',
            visualCue: 'Orbit 360° · Gimbal Smooth',
          },
          {
            id: 3,
            phase: 'climax_reveal',
            startSec: 5.5,
            endSec: 8.0,
            durationSec: 2.5,
            beatTitle: 'KONVERZNÍ PRODUKTOVÝ REVEAL',
            sceneDescription: 'Plynulý pull-back otevírá čistý prostor pro slevový kód a odkaz.',
            subjectEvolution: 'Produkt dominuje v klidném ohnisku kompozice.',
            cameraKeyframe: 'zoom_out',
            cameraZoomStart: 1.1,
            cameraZoomEnd: 0.98,
            cameraPanX: 0,
            cameraPanY: 0,
            lightingShift: 'Měkké studiové vyvážení pro čitelnost CTA',
            transitionIn: 'crossfade',
            kineticCaption: 'OBJEDNEJTE DNES · ODKAZ V BIO',
            visualCue: 'Zoom Out · Clean Offer Frame',
          },
        ],
      },
      realismProfile: {
        cameraBody: 'RED V-Raptor 8K VV',
        shutterAngle: '180deg_cinematic',
        colorPipeline: 'RED_IPP2',
        audioLufsTarget: '-14_LUFS_social',
        sensorGrain: 'fine_35mm',
      },
    },
    monetizationKit: {
      seoTitle: 'Ranní rituál dokonalého espressa | Výběrová káva v makro detailu',
      hookLine: 'Rozdíl mezi průměrnou a výběrovou kávou poznáte v prvních 2 sekundách extrakce.',
      ctaLine: 'Vyzkoušejte degustační sadu přes odkaz v profilu se slevou 15 %.',
      brandSafeTags: ['VyberovaKava', 'Espresso', 'ProduktoveVideo', 'LuxuryStyle', 'Barista'],
      estimatedRpmTier: 'E-commerce / Affiliate Direct ROAS',
    },
  },
  {
    id: 'cs-tiktok-creativity-story',
    title: 'TikTok Creativity · Kyberpunk FPV Příběh',
    platform: 'TikTok',
    format: '9:16',
    rpmTier: 'TikTok Creativity Program + Brand Deals',
    hookFormula: 'FPV dronový průlet do děje v 0.0s + dynamická změna světla v polovině klipu',
    retentionRule: 'Silné kinetické předěly (Glitch / Whip Pan) udržují pozornost až k závěrečnému odhalení.',
    adSafetyRule: 'Bezpečná originální audiovizuální kompozice bez rizika ztlumení zvuku.',
    cameraRecipe: 'FPV Dron → Orbit 360° (Vyvrcholení) → Zoom Out (Reveal)',
    checklist: [
      'Agilní FPV trajektorie v úvodní fázi',
      '60 FPS pro máslově plynulý pohyb při akčních přechodech',
      'Konzistentní barevná paleta s jasným kontrastním bodem',
      'Originální foley + -14 LUFS normalizace',
    ],
    rawPrompt:
      'Nejdříve nízký FPV dronový průlet nad mokrou futuristickou Prahou v neonovém dešti, pak orbit 360 kolem centrální holografické věže s přechodem světla, nakonec rychlý odjezd nad panorama města 9s 60fps.',
    structuredPreset: {
      aspectRatio: '9:16',
      totalDurationSec: 9,
      fps: 60,
      subject: {
        primarySubject: 'Futuristické centrum Prahy se skleněnou AI věží v dešti',
        subjectAction: 'holografické světelné toky a odlesky kapek na mokrém asfaltu',
        environment: 'noční evropská metropole s neony a sklem',
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
        negativePrompt:
          'rozmazané texty, vodoznak, statická kamera, nízké FPS, přepaly světel',
      },
      camera: {
        primaryMotion: 'fpv_drone',
        motionIntensity: 9,
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
            endSec: 3.0,
            durationSec: 3.0,
            beatTitle: 'FPV NÁLET NAD MOKROU ULICÍ',
            sceneDescription: 'Rychlý nízký průlet mezi světly směrem k hlavní věži.',
            subjectEvolution: 'Odlesky deště vytvářejí dynamické vodicí linie.',
            cameraKeyframe: 'fpv_drone',
            cameraZoomStart: 1.0,
            cameraZoomEnd: 1.2,
            cameraPanX: 0.25,
            cameraPanY: -0.1,
            lightingShift: 'Ostrý azurový neonový kontrast',
            transitionIn: 'glitch_flash',
            kineticCaption: 'PRAHA 2049 · NOČNÍ PRŮLET',
            visualCue: '16mm Wide FPV · 60fps',
          },
          {
            id: 2,
            phase: 'climax_reveal',
            startSec: 3.0,
            endSec: 6.5,
            durationSec: 3.5,
            beatTitle: 'ORBIT KOLEM HOLOGRAFICKÉ VĚŽE',
            sceneDescription: 'Plynulé obkroužení centrální věže při rozsvícení sítě.',
            subjectEvolution: 'Purpurová záře přechází přes skleněnou fasádu.',
            cameraKeyframe: 'orbit_360',
            cameraZoomStart: 1.18,
            cameraZoomEnd: 1.08,
            cameraPanX: -0.45,
            cameraPanY: 0.05,
            lightingShift: 'Přechod do purpurové neonové dominance',
            transitionIn: 'whip_pan',
            kineticCaption: 'AUTONOMNÍ MĚSTO V POHYBU',
            visualCue: 'Orbit 360° · Dynamic Bank',
          },
          {
            id: 3,
            phase: 'closing_loop',
            startSec: 6.5,
            endSec: 9.0,
            durationSec: 2.5,
            beatTitle: 'PANORAMA REVEAL & SMYČKA',
            sceneDescription: 'Výstup nad panorama města navazující na úvodní nálet.',
            subjectEvolution: 'Celé panorama pulzuje do čistého závěru.',
            cameraKeyframe: 'zoom_out',
            cameraZoomStart: 1.12,
            cameraZoomEnd: 0.96,
            cameraPanX: 0,
            cameraPanY: -0.22,
            lightingShift: 'Vyvážený kontrast připravený pro nekonečnou smyčku',
            transitionIn: 'zoom_punch',
            kineticCaption: 'SLEDUJTE DALŠÍ DÍL SÉRIE',
            visualCue: 'Reveal Zoom Out · Loop',
          },
        ],
      },
      realismProfile: {
        cameraBody: 'Sony FX6 · CineWhoop FPV Rig',
        shutterAngle: '90deg_crisp_action',
        colorPipeline: 'ACES_filmic',
        audioLufsTarget: '-14_LUFS_social',
        sensorGrain: 'anamorphic_halation',
      },
    },
    monetizationKit: {
      seoTitle: 'Praha 2049 v dešti: FPV průlet futuristickým městem (60 FPS)',
      hookLine: 'Co kdyby centrum Prahy poháněla autonomní světelná infrastruktura?',
      ctaLine: 'Napište do komentáře další město a uložte si profil pro pokračování.',
      brandSafeTags: ['Praha2049', 'SciFiCinema', 'FPVDrone', 'AIVideo', 'Cyberpunk'],
      estimatedRpmTier: 'Kreativní Discovery + Branded Storytelling',
    },
  },
];

export function applyVisualTagToPrompt(
  current: StructuredVideoPrompt,
  tag: PromptBuilderTag,
  targetBeatId?: number
): { structuredPrompt: StructuredVideoPrompt; notice: string } {
  const next: StructuredVideoPrompt = structuredClone(current);
  const existingTags = new Set(next.activeTagIds || []);
  if (tag.category === 'style') {
    for (const id of Array.from(existingTags)) {
      if (id.startsWith('style-')) {
        existingTags.delete(id);
      }
    }
  }
  existingTags.add(tag.id);
  next.activeTagIds = Array.from(existingTags);

  // If dropped directly onto a specific temporal beat card
  if (targetBeatId !== undefined && tag.cameraMotion) {
    const beatIndex = next.temporal.beats.findIndex((b) => b.id === targetBeatId);
    if (beatIndex >= 0) {
      const targetBeat = next.temporal.beats[beatIndex];
      const traj = buildCameraTrajectoryForBeat(
        tag.cameraMotion,
        tag.motionIntensity ?? next.camera.motionIntensity,
        targetBeat.phase
      );
      next.temporal.beats[beatIndex] = {
        ...targetBeat,
        cameraKeyframe: tag.cameraMotion,
        cameraZoomStart: traj.zoomStart,
        cameraZoomEnd: traj.zoomEnd,
        cameraPanX: traj.panX,
        cameraPanY: traj.panY,
      };
      if (beatIndex === 0) {
        next.camera.primaryMotion = tag.cameraMotion;
      }
      return {
        structuredPrompt: next,
        notice: `Kamera "${tag.shortLabel}" přiřazena do fáze #${targetBeatId}.`,
      };
    }
  }

  // Apply structured parameter patches by tag category
  if (tag.cameraMotion) {
    next.camera.primaryMotion = tag.cameraMotion;
    if (tag.motionIntensity !== undefined) {
      next.camera.motionIntensity = tag.motionIntensity;
    }
    if (next.temporal.beats.length > 0) {
      const firstBeat = next.temporal.beats[0];
      const traj = buildCameraTrajectoryForBeat(
        tag.cameraMotion,
        next.camera.motionIntensity,
        firstBeat.phase
      );
      next.temporal.beats[0] = {
        ...firstBeat,
        cameraKeyframe: tag.cameraMotion,
        cameraZoomStart: traj.zoomStart,
        cameraZoomEnd: traj.zoomEnd,
        cameraPanX: traj.panX,
        cameraPanY: traj.panY,
      };
    }
  }

  if (tag.visualStyle) {
    const palette = VISUAL_STYLE_PALETTES[tag.visualStyle];
    next.style.visualStyle = tag.visualStyle;
    next.style.accentColor = palette.accentColor;
    next.style.secondaryColor = palette.secondaryColor;
    next.style.bgHex = palette.bgHex;
    next.style.colorGrading = palette.colorGrading;
  }

  if (tag.optics) {
    next.style.optics = tag.optics;
  }

  if (tag.lighting) {
    next.style.lighting = tag.lighting;
  }

  if (tag.atmosphere) {
    next.style.atmosphere = tag.atmosphere;
  }

  if (tag.realismPatch) {
    next.realismProfile = {
      ...(next.realismProfile || DEFAULT_HARDCORE_REALISM_PROFILE),
      ...tag.realismPatch,
    };
  }

  if (tag.negativeAddition) {
    const negParts = new Set(
      next.style.negativePrompt
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    for (const part of tag.negativeAddition.split(',').map((s) => s.trim())) {
      if (part) negParts.add(part);
    }
    next.style.negativePrompt = Array.from(negParts).join(', ');
  }

  // Append prompt snippet cleanly without duplication
  const normalizedRaw = next.rawPrompt.trim();
  if (
    tag.promptSnippet &&
    !normalizedRaw.toLowerCase().includes(tag.promptSnippet.toLowerCase())
  ) {
    const separator =
      !normalizedRaw || /[,.;]$/.test(normalizedRaw) ? ' ' : ', ';
    next.rawPrompt = `${normalizedRaw}${separator}${tag.promptSnippet}`.trim();
  }

  return {
    structuredPrompt: next,
    notice: `Přidáno do promptu: ${tag.label}`,
  };
}

export function removeVisualTagFromPrompt(
  current: StructuredVideoPrompt,
  tagId: string
): StructuredVideoPrompt {
  const next: StructuredVideoPrompt = structuredClone(current);
  next.activeTagIds = (next.activeTagIds || []).filter((id) => id !== tagId);

  const tag = VISUAL_DRAG_TAGS.find((t) => t.id === tagId);
  if (tag && tag.promptSnippet) {
    const escaped = tag.promptSnippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    next.rawPrompt = next.rawPrompt
      .replace(new RegExp(`[,;\\s]*${escaped}[,;\\s]*`, 'i'), ', ')
      .replace(/^[,.\s]+|[,.\s]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return next;
}

export function applyBlueprintToPrompt(
  current: StructuredVideoPrompt,
  blueprint: MonetizationCheatsheetBlueprint
): StructuredVideoPrompt {
  const p = blueprint.structuredPreset;
  const visualStyle = p.style?.visualStyle || current.style.visualStyle;
  const palette = VISUAL_STYLE_PALETTES[visualStyle];
  const duration = p.totalDurationSec || current.totalDurationSec;
  const beats: TemporalSceneBeat[] = p.temporal?.beats
    ? rebalanceTemporalBeats(
        p.temporal.beats.map((b) => ({ ...b })),
        duration
      )
    : rebalanceTemporalBeats(current.temporal.beats, duration);

  return {
    ...current,
    rawPrompt: blueprint.rawPrompt,
    aspectRatio: p.aspectRatio || blueprint.format,
    totalDurationSec: duration,
    fps: (p.fps as 24 | 30 | 60) || current.fps,
    subject: p.subject ? { ...p.subject } : current.subject,
    style: p.style
      ? {
          ...p.style,
          accentColor: palette.accentColor,
          secondaryColor: palette.secondaryColor,
          bgHex: palette.bgHex,
        }
      : current.style,
    camera: p.camera ? { ...p.camera } : current.camera,
    temporal: {
      pacing: p.temporal?.pacing || current.temporal.pacing,
      beats,
    },
    realismProfile: p.realismProfile
      ? { ...p.realismProfile }
      : current.realismProfile || { ...DEFAULT_HARDCORE_REALISM_PROFILE },
    monetizationKit: { ...blueprint.monetizationKit },
    activeTagIds: ['mon-3s-hook', 'mon-ad-safe', 'mon-loop-cta'],
  };
}

const DEMONETIZATION_RISK_PATTERNS =
  /\b(hazard|kasino|gambling|zbraně|krev|násilí|crack|warez|fake\s+money|rychlé\s+zbohatnutí)\b/i;

export function evaluateMonetizationReadiness(
  prompt: StructuredVideoPrompt,
  asset?: FactoryAsset | null
): MonetizationAuditResult {
  const beats = prompt.temporal.beats || [];
  const firstBeat = beats[0];
  const lastBeat = beats[beats.length - 1];
  const distinctCameras = new Set(beats.map((b) => b.cameraKeyframe));
  const combinedText = `${prompt.rawPrompt} ${prompt.subject.primarySubject} ${prompt.subject.subjectAction}`;
  const adSafe = !DEMONETIZATION_RISK_PATTERNS.test(combinedText);

  const checks: MonetizationCheckItem[] = [
    {
      id: 'hook-velocity',
      label: 'Úvodní 3s Hook & Kinetický titulek',
      passed: Boolean(
        firstBeat &&
          firstBeat.durationSec <= 3.5 &&
          firstBeat.kineticCaption.trim().length >= 4 &&
          firstBeat.cameraKeyframe !== 'static'
      ),
      detail: firstBeat
        ? `Fáze 1 má ${firstBeat.durationSec.toFixed(1)}s (${firstBeat.cameraKeyframe}) a titulek "${firstBeat.kineticCaption}".`
        : 'Chybí úvodní fáze.',
      fixHint: 'Zkraťte první fázi do 3.0s a nastavte dynamický pohyb kamery + silný titulek.',
    },
    {
      id: 'retention-pacing',
      label: 'Retenční dynamika (3+ fáze & změna kamery)',
      passed: beats.length >= 3 && distinctCameras.size >= 2,
      detail: `${beats.length} časových fází, ${distinctCameras.size} rozdílné kamerové trajektorie.`,
      fixHint: 'Přidejte alespoň 3 časové fáze a střídejte pohyb kamery mezi fázemi.',
    },
    {
      id: 'ad-safety',
      label: '100% Brand-Safe & Copyright ochrana',
      passed:
        adSafe &&
        /vodoznak|watermark|logo|loga/i.test(prompt.style.negativePrompt) &&
        prompt.style.negativePrompt.trim().length >= 12,
      detail: adSafe
        ? 'Prompt je komerčně čistý a negativní prompt filtruje cizí loga i vodoznaky.'
        : 'Prompt obsahuje rizikové klíčové slovo pro omezení reklam.',
      fixHint: 'Doplňte negativní prompt o vyloučení vodoznaků a cizích log.',
    },
    {
      id: 'hardcore-realism',
      label: 'Hardcore Realistická Optika & Světlo',
      passed: Boolean(
        prompt.style.optics &&
          prompt.style.lighting &&
          prompt.style.atmosphere &&
          prompt.camera.stabilization
      ),
      detail: `${prompt.style.optics} · ${prompt.style.lighting} · ${prompt.realismProfile?.colorPipeline || 'ACES_filmic'}.`,
      fixHint: 'Nastavte konkrétní optiku objektivu, typ svícení a realistický profil kamery.',
    },
    {
      id: 'closing-cta-loop',
      label: 'Závěrečný Loop / Monetizační CTA',
      passed: Boolean(
        lastBeat &&
          lastBeat.kineticCaption.trim().length >= 6 &&
          (lastBeat.phase === 'closing_loop' || lastBeat.phase === 'climax_reveal')
      ),
      detail: lastBeat
        ? `Závěr (${lastBeat.phase}): "${lastBeat.kineticCaption}".`
        : 'Chybí závěrečná fáze.',
      fixHint: 'Nastavte závěrečnou fázi jako closing_loop s konkrétní výzvou k akci.',
    },
    {
      id: 'technical-delivery',
      label: 'Technický Standard (MP4 +faststart / Rozlišení)',
      passed: asset
        ? Boolean(asset.faststartVerified || asset.status === 'ready')
        : prompt.fps >= 24 && (prompt.aspectRatio === '9:16' || prompt.aspectRatio === '16:9'),
      detail: asset
        ? `${asset.resolution || prompt.aspectRatio} · ${asset.faststartVerified ? '+faststart ověřeno' : asset.status || 'připraveno'}`
        : `Nastaveno ${prompt.aspectRatio} @ ${prompt.fps} FPS pro čistý FFmpeg H.264 render.`,
      fixHint: 'Spusťte render pro ověření +faststart MP4 streamu.',
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const recommendedFixLabels = checks
    .filter((c) => !c.passed && c.fixHint)
    .map((c) => c.fixHint!);

  return {
    score,
    is100PercentMonetizable: passedCount === checks.length && adSafe,
    adSafe,
    checks,
    recommendedFixLabels,
  };
}

export function optimizePromptForMonetization(
  prompt: StructuredVideoPrompt,
  blueprintId?: string
): {
  structuredPrompt: StructuredVideoPrompt;
  audit: MonetizationAuditResult;
  compiledText: string;
} {
  if (blueprintId) {
    const bp = MONETIZATION_CHEATSHEETS.find((b) => b.id === blueprintId);
    if (bp) {
      const applied = applyBlueprintToPrompt(prompt, bp);
      const audit = evaluateMonetizationReadiness(applied);
      return {
        structuredPrompt: applied,
        audit,
        compiledText: compileStructuredPromptText(applied),
      };
    }
  }

  const next = structuredClone(prompt);
  next.engine = 'local-structured-director';
  next.realismProfile = next.realismProfile || { ...DEFAULT_HARDCORE_REALISM_PROFILE };

  // Ensure brand-safe negative prompt
  const negItems = new Set(
    next.style.negativePrompt
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  ['vodoznak', 'cizí loga', 'ochranné známky', 'artefakty', 'rozmazání'].forEach((item) =>
    negItems.add(item)
  );
  next.style.negativePrompt = Array.from(negItems).join(', ');

  // Ensure >= 3 distinct beats with crisp <= 3.0s hook & CTA closing loop
  let beats = next.temporal.beats.map((b) => ({ ...b }));
  while (beats.length < 3) {
    const last = beats[beats.length - 1];
    const nextMotion =
      beats.length === 1 ? 'orbit_360' : 'zoom_out';
    const traj = buildCameraTrajectoryForBeat(nextMotion, next.camera.motionIntensity, 'closing_loop');
    beats.push({
      id: beats.length + 1,
      phase: beats.length === 1 ? 'development' : 'closing_loop',
      startSec: 0,
      endSec: 0,
      durationSec: 2.5,
      beatTitle: beats.length === 1 ? 'ROZVOJ DETAILU & DŮKAZ' : 'ZÁVĚREČNÉ CTA & SMYČKA',
      sceneDescription:
        last?.sceneDescription ||
        'Plynulý vývoj hlavní scény s čistou kompozicí pro čitelnost sdělení.',
      subjectEvolution: 'Subjekt vrcholí v čistém rámu bez rušivých prvků',
      cameraKeyframe: nextMotion,
      cameraZoomStart: traj.zoomStart,
      cameraZoomEnd: traj.zoomEnd,
      cameraPanX: traj.panX,
      cameraPanY: traj.panY,
      lightingShift: 'Vyvážené studiové dosvícení',
      transitionIn: 'whip_pan',
      kineticCaption: beats.length === 1 ? 'KLÍČOVÝ DŮKAZ V PRAXI' : 'ULOŽ SI POSTUP V POPISKU',
      visualCue: `${next.style.optics} · ${nextMotion}`,
    });
  }

  // Calibrate beat 1 hook velocity & last beat CTA
  if (beats[0].cameraKeyframe === 'static') {
    beats[0].cameraKeyframe = 'zoom_in';
    const traj = buildCameraTrajectoryForBeat('zoom_in', Math.max(6, next.camera.motionIntensity), 'opening_hook');
    beats[0].cameraZoomStart = traj.zoomStart;
    beats[0].cameraZoomEnd = traj.zoomEnd;
  }
  if (beats[0].kineticCaption.trim().length < 4) {
    beats[0].kineticCaption = next.subject.primarySubject.slice(0, 32).toUpperCase();
  }
  if (beats[0].durationSec > 3.2 && next.totalDurationSec <= 10) {
    beats[0].durationSec = 2.5;
  }

  const lastIdx = beats.length - 1;
  beats[lastIdx].phase = 'closing_loop';
  if (beats[lastIdx].cameraKeyframe === beats[0].cameraKeyframe) {
    beats[lastIdx].cameraKeyframe = 'zoom_out';
    const traj = buildCameraTrajectoryForBeat('zoom_out', next.camera.motionIntensity, 'closing_loop');
    beats[lastIdx].cameraZoomStart = traj.zoomStart;
    beats[lastIdx].cameraZoomEnd = traj.zoomEnd;
  }
  if (beats[lastIdx].kineticCaption.trim().length < 6) {
    beats[lastIdx].kineticCaption = 'SLEDUJTE DALŠÍ POSTUP V POPISKU';
  }

  next.temporal.beats = rebalanceTemporalBeats(beats, next.totalDurationSec);

  if (!next.monetizationKit) {
    next.monetizationKit = {
      seoTitle: `${next.subject.primarySubject.slice(0, 56)} | Praktický postup`,
      hookLine: next.temporal.beats[0]?.sceneDescription || next.subject.subjectAction,
      ctaLine: 'Uložte si video a prohlédněte si kompletní šablonu v popisku.',
      brandSafeTags: ['AIVideoStudio', 'Produktivita', 'Automatizace', 'Shorts', 'Tutorial'],
      estimatedRpmTier: '100% Brand-Safe · Monetizovatelné',
    };
  }

  const audit = evaluateMonetizationReadiness(next);
  return {
    structuredPrompt: next,
    audit,
    compiledText: compileStructuredPromptText(next),
  };
}
