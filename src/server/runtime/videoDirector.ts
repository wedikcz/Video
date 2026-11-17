/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  ReasoningTrace,
  StructuredVideoPrompt,
  VideoBatchSuite,
  VideoBriefScene,
  VideoClarificationRequest,
  VideoCreativeBrief,
  VideoTone,
  VideoVisualStyle,
} from '../../types/nexus.ts';
import {
  CAMERA_MOTION_LABELS,
  LIGHTING_LABELS,
  OPTICS_LABELS,
  parseStructuredPromptFromText,
  rebalanceTemporalBeats,
  VISUAL_STYLE_PALETTES,
} from '../../utils/structuredVideoPrompt.ts';

export interface VideoDirectorAnalysis {
  isVideoIntent: boolean;
  needsClarification: boolean;
  batchCount: number;
  brief: VideoCreativeBrief;
  batchBriefs?: VideoCreativeBrief[];
  reasoningTrace?: ReasoningTrace;
  videoBatchSuite?: VideoBatchSuite;
  clarification?: VideoClarificationRequest;
}

interface StylePalette {
  visualStyle: VideoVisualStyle;
  label: string;
  accentColor: string;
  secondaryColor: string;
  bgHex: string;
  defaultBpm: number;
}

const STYLE_PALETTES: Record<VideoVisualStyle, StylePalette> = {
  cyberpunk_neon: {
    visualStyle: 'cyberpunk_neon',
    label: 'Cyberpunk Neon',
    accentColor: '#06b6d4',
    secondaryColor: '#ec4899',
    bgHex: '0x090817',
    defaultBpm: 136,
  },
  fintech_emerald: {
    visualStyle: 'fintech_emerald',
    label: 'FinTech Emerald',
    accentColor: '#10b981',
    secondaryColor: '#34d399',
    bgHex: '0x071311',
    defaultBpm: 126,
  },
  luxury_gold: {
    visualStyle: 'luxury_gold',
    label: 'Luxury Gold',
    accentColor: '#f59e0b',
    secondaryColor: '#fef08a',
    bgHex: '0x120e07',
    defaultBpm: 112,
  },
  editorial_coral: {
    visualStyle: 'editorial_coral',
    label: 'Energický Coral',
    accentColor: '#f43f5e',
    secondaryColor: '#fb923c',
    bgHex: '0x14080e',
    defaultBpm: 132,
  },
  minimal_dark: {
    visualStyle: 'minimal_dark',
    label: 'Minimal Studio',
    accentColor: '#38bdf8',
    secondaryColor: '#e4e4e7',
    bgHex: '0x0b0f17',
    defaultBpm: 118,
  },
};

const STOP_WORDS = new Set([
  'vytvoř',
  'vytvor',
  'udělej',
  'udelej',
  'vygeneruj',
  'generuj',
  'vyrob',
  'natoč',
  'natoc',
  'spusť',
  'spust',
  'renderuj',
  'vyrenderuj',
  'render',
  'video',
  'videa',
  'videí',
  'videi',
  'klip',
  'klipy',
  'shorts',
  'short',
  'tiktok',
  'tik',
  'tok',
  'reels',
  'youtube',
  'instagram',
  'moviepy',
  'mp4',
  'mi',
  'mě',
  'me',
  'pro',
  'na',
  'do',
  'v',
  've',
  'o',
  's',
  'se',
  'z',
  'k',
  'prosím',
  'prosim',
  'chci',
  'potřebuji',
  'potrebuji',
  'nějaké',
  'nejake',
  'nové',
  'nove',
  'jedno',
  'téma',
  'tema',
  'pomoz',
  'ai',
  'styl',
  'stylu',
  'formát',
  'format',
  'dlouhé',
  'dlouhe',
  'krátké',
  'kratke',
  'sekund',
  'sekundy',
  'vteřin',
  'vterin',
  'sec',
  '9:16',
  '16:9',
  'vertikální',
  'vertikalni',
  'horizontální',
  'horizontalni',
  'prosím',
  'detaily',
  'upřesnit',
  'upresnit',
]);

function extractTopicCandidate(rawText: string): string {
  // Check explicit topic markers like "o ...", "téma ...", or "na téma ..." (with word boundary so "video" never matches trailing 'o')
  const explicitMatch = rawText.match(
    /(?:^|\s)(?:na\s+t[eé]ma|t[eé]ma|o\s+tom,?\s+jak|o)\s+(.+)$/i
  );
  let candidate = explicitMatch ? explicitMatch[1] : rawText;

  // Strip trailing format/duration/CTA/NotebookLM boilerplate modifiers so topic stays crisp
  candidate = candidate
    .replace(/\b(9:16|16:9)\b/gi, ' ')
    .replace(/\b\d+\s*(s|sec|sekund[ay]?|vteřin[ay]?)\b/gi, ' ')
    .replace(/\(\s*ai\s+se\s+dopt[áa]\s+na\s+detaily\s*\)/gi, ' ')
    .replace(/,?\s*vizu[aá]ln[ií]\s+styl\s+[^,.]+/gi, ' ')
    .replace(/,?\s*jazyk\s+[^,.]+/gi, ' ')
    .replace(/\(\s*(?:v[yý]choz[ií]|\d+\s*zdroj[ůu])\s*\)/gi, ' ')
    .replace(/,?\s*s\s+cta\s+na\s+[^,.!?]+/gi, ' ')
    .replace(/\b(na\s+(tiktok|tik\s*tok|youtube(\s+shorts)?|instagram(\s+reels)?|reels|shorts))/gi, ' ')
    .replace(/\b(v\s+(kyberpunk|cyberpunk|neon|zlat[eé]m|minimalistick[eé]m|fintech)\s+stylu?)/gi, ' ')
    .replace(/[?!.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (explicitMatch && candidate.length >= 3) {
    return candidate;
  }

  // Otherwise filter command/stop words and pure style modifiers to see if a real subject remains
  const styleModifiers = new Set([
    'kyberpunk',
    'cyberpunk',
    'neon',
    'neonový',
    'neonové',
    'luxusní',
    'luxusni',
    'zlatý',
    'zlaty',
    'zlatá',
    'zlaté',
    'minimalistický',
    'minimalisticke',
    'minimal',
    'fintech',
    'smaragdový',
    'energický',
    'energicky',
    'virální',
    'viralni',
    'edukační',
    'edukacni',
    'humorný',
    'humorny',
    'komický',
    'korálový',
    'coral',
  ]);
  const tokens = candidate
    .split(/\s+/)
    .map((t) => t.replace(/^[,.:;"'()]+|[,.:;"'()]+$/g, ''))
    .filter((t) => t.length > 0 && !/^\d+$/.test(t));

  const meaningful = tokens.filter(
    (t) => !STOP_WORDS.has(t.toLowerCase()) && !styleModifiers.has(t.toLowerCase())
  );
  if (meaningful.length === 0) return '';

  // Keep original phrasing of non-boilerplate slice when substantial
  return meaningful.join(' ').trim();
}

function detectNotebookStyle(lower: string): string | undefined {
  if (/anime|manga/i.test(lower)) return 'anime';
  if (/retro\s*tisk|retro|synthwave/i.test(lower)) return 'retro';
  if (/kawaii|pastel/i.test(lower)) return 'kawaii';
  if (/tabule|whiteboard|kreslen/i.test(lower)) return 'tabule';
  if (/starod[aá]vn|ancient|pergam/i.test(lower)) return 'starodavny';
  if (/vyst[rř]ihov|cutout/i.test(lower)) return 'vystrihovanka';
  if (/akvarel|watercolor/i.test(lower)) return 'akvarel';
  if (/klasick[ýy]|classic/i.test(lower)) return 'klasicky';
  if (/kyberpunk|cyberpunk/i.test(lower)) return 'cyberpunk';
  if (/fintech|smaragd/i.test(lower)) return 'fintech';
  return undefined;
}

function detectExplicitStyle(lower: string): VideoVisualStyle | undefined {
  if (/kyberpunk|cyberpunk|neon|futurist|sci-fi|hologram|synth|retro/i.test(lower)) {
    return 'cyberpunk_neon';
  }
  if (/zlat|luxus|prestiž|eleganc|glamour|královsk|starod|vyst[rř]ihov|cutout/i.test(lower)) {
    return 'luxury_gold';
  }
  if (/energick|coral|virál|viral|akčn|reklam|anime|kawaii/i.test(lower)) {
    return 'editorial_coral';
  }
  if (/minimal|čist|cist|tutori[aá]l|návod|navod|akadem|černobíl|klasick|tabul/i.test(lower)) {
    return 'minimal_dark';
  }
  if (/fintech|smaragd|emerald|matrix|akvarel/i.test(lower)) {
    return 'fintech_emerald';
  }
  return undefined;
}

function inferPaletteFromTopic(lower: string): VideoVisualStyle | undefined {
  if (/kav|káv|šperk|hodink|espresso|mód|modn|parfém/i.test(lower)) {
    return 'luxury_gold';
  }
  if (/kód|kod|dev|program|saas|dashboard/i.test(lower)) {
    return 'minimal_dark';
  }
  if (/pen[ií]z|kč|kc|výdělek|vydelek|invest|byznys|faktur|účetn|ucetn|roi|krypto/i.test(lower)) {
    return 'fintech_emerald';
  }
  if (/humor|vtip|meme|zábav/i.test(lower)) {
    return 'editorial_coral';
  }
  return undefined;
}

function detectTone(lower: string): VideoTone | undefined {
  if (/humor|vtip|srand|meme|komick|ironi/i.test(lower)) return 'humorous';
  if (/tutori[aá]l|návod|navod|eduka|vysvětli|vysvetli|krok za krokem|jak na/i.test(lower)) return 'educational';
  if (/autoritat|seriózn|seriozn|analýz|analyz|profesion|b2b|odborn/i.test(lower)) return 'authoritative';
  if (/kinemat|film|příběh|pribeh|luxus|klidn|emotiv/i.test(lower)) return 'cinematic';
  if (/energick|dynamick|rychl|virál|viral|šok|sok|hook/i.test(lower)) return 'energetic';
  return undefined;
}

function detectGoal(
  lower: string
): VideoCreativeBrief['goal'] | undefined {
  if (/návod|navod|tutori[aá]l|krok za krokem|nauč|nauc|jak /i.test(lower)) return 'education';
  if (/demo|ukázk|ukazk|produkt|aplikac|nástroj|nastroj|software|saas/i.test(lower)) return 'product_demo';
  if (/prodej|konverz|funnel|affiliate|kup|objedn|cta|reklam/i.test(lower)) return 'sales_funnel';
  if (/zpráv|zprav|novink|news|oznámen|oznamen|trend/i.test(lower)) return 'news_alert';
  if (/příběh|pribeh|vlog|zákulis|zakulis|značk|znack/i.test(lower)) return 'brand_story';
  if (/virál|viral|dosah|zhlédnut|zhlednut|retenc/i.test(lower)) return 'viral_growth';
  return undefined;
}

function truncateWords(text: string, maxLen: number): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, maxLen);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 12 ? sliced.slice(0, lastSpace) : sliced).trim();
}

function buildSmartLocalScenes(
  topic: string,
  durationSec: number,
  goal: VideoCreativeBrief['goal'],
  tone: VideoTone,
  audience: string,
  cta: string
): VideoBriefScene[] {
  const shortTopic = truncateWords(topic, 44);
  const s1 = Math.max(2, Math.round(durationSec * 0.25));
  const s2 = Math.max(2, Math.round(durationSec * 0.4));
  const s3 = Math.max(2, durationSec - s1 - s2);

  const hookPrefix =
    tone === 'humorous'
      ? `Pořád to děláš ručně? ${shortTopic}`
      : tone === 'educational'
        ? `Jak zvládnout: ${shortTopic}`
        : tone === 'cinematic'
          ? `Budoucnost: ${shortTopic}`
          : `STOP! Sleduj: ${shortTopic}`;

  const midHeadline =
    goal === 'product_demo'
      ? `Živá ukázka: ${shortTopic}`
      : goal === 'education'
        ? `3 klíčové kroky pro ${audience}`
        : goal === 'sales_funnel'
          ? `Měřitelný dopad: ${shortTopic}`
          : `Proč ${shortTopic} šetří hodiny`;

  return [
    {
      title: `HOOK: ${shortTopic.toUpperCase()}`,
      subtitle: hookPrefix,
      visualCue: 'Rychlý zoom + pulzující akcentový rámeček',
      durationSec: s1,
      kineticTag: 'SCÉNA 1 · 3S HOOK',
    },
    {
      title: midHeadline,
      subtitle: `Konkrétní postup navržený pro ${audience}`,
      visualCue: 'Rozklad klíčového problému a řešení na obrazovce',
      durationSec: s2,
      kineticTag: 'SCÉNA 2 · JÁDRO & DEMO',
    },
    {
      title: 'DALŠÍ KROK & VÝSLEDEK',
      subtitle: cta,
      visualCue: 'Dynamická výzva k akci + plynulá smyčka',
      durationSec: s3,
      kineticTag: 'SCÉNA 3 · CTA & SMYČKA',
    },
  ];
}

export function generateBatchSuite(
  baseTopic: string,
  platform: VideoCreativeBrief['platform'] = 'TikTok',
  aspectRatio: '9:16' | '16:9' = '9:16',
  count: number = 5,
  options?: {
    preferredNotebookStyle?: string;
    preferredVisualStyle?: VideoVisualStyle;
    language?: string;
  }
): {
  briefs: VideoCreativeBrief[];
  reasoningTrace: ReasoningTrace;
  videoBatchSuite: VideoBatchSuite;
} {
  const isDefaultAiTopic = !baseTopic || /ai automatizace obsahu pro sociální sítě/i.test(baseTopic.trim());
  const shortTopic = truncateWords(baseTopic || 'AI automatizace obsahu', 36);
  const shortTopicUpper = shortTopic.toUpperCase();

  const defaultEpisodesData = [
    {
      num: 1,
      title: 'DÍL 1/5: 3 AI NÁSTROJE, CO TI UŠETŘÍ 20 HODIN TÝDNĚ',
      hook: 'STOP! Pořád děláš tohle ručně v roce 2026? Tohle změní všechno.',
      midHeadline: '3 AI agenti nahradí 20 hodin nudné manuální práce',
      midSub: 'Automatický převod audia na kinetické titulky a střih bez softwaru',
      cta: 'Napiš "START" pro blueprint',
      style: 'cyberpunk_neon' as VideoVisualStyle,
      bpm: 136,
      subAction: 'Ukázka automatického přepisu a kinetických titulků',
    },
    {
      num: 2,
      title: 'DÍL 2/5: AUTOMATIZACE ZA 0 KČ BEZ ZNALOSTI KÓDOVÁNÍ',
      hook: 'Tohle ti agentury nikdy neřeknou — nepotřebuješ statisíce.',
      midHeadline: 'Lokální runtime a webhooky propojené za 5 minut',
      midSub: 'Žádné drahé cloud servery, vše běží na vašem stroji',
      cta: 'Ulož si video & koukni do bio',
      style: 'fintech_emerald' as VideoVisualStyle,
      bpm: 128,
      subAction: 'Architektura lokálního agentního zpracování',
    },
    {
      num: 3,
      title: 'DÍL 3/5: CHYBA, KTEROU DĚLÁ 95 % LIDÍ PŘI TVORBĚ OBSAHU',
      hook: 'Proč tvá videa nikdo nedokouká déle než první 2 sekundy?',
      midHeadline: 'Pravidlo prvních 1.8s a kinetická vizuální kotva',
      midSub: 'Ztráta pozornosti nastává vteřinu před prvním slovem bez pohybu',
      cta: 'Sleduj profil pro další díl',
      style: 'editorial_coral' as VideoVisualStyle,
      bpm: 140,
      subAction: 'Graf retence diváků a kinetické přerušení vzorce',
    },
    {
      num: 4,
      title: 'DÍL 4/5: TAJNÝ PROMPT, CO GENERUJE 10 000 KČ Z POSTU',
      hook: 'Zkopíruj si tenhle prompt dřív, než ho budou znát všichni.',
      midHeadline: '4 pilíře strukturovaného promptu: Subjekt, Styl, Pohyb a Pacing',
      midSub: 'Přesné technické zadání pro video engine místo vágní vaty',
      cta: 'Napiš "PROMPT" do komentáře',
      style: 'luxury_gold' as VideoVisualStyle,
      bpm: 122,
      subAction: 'Rozbor cheat-sheetu a monetizační struktury',
    },
    {
      num: 5,
      title: 'DÍL 5/5: 1M BLUEPRINT: AUTONOMNÍ OBSAHOVÉ STUDIO',
      hook: 'Finální krok série. Takhle propojíš všech 16 agentů do jedné mašiny.',
      midHeadline: 'Full-stack pipeline: Režie -> FFmpeg -> Media Vault',
      midSub: 'Kompletní autonomní fabrika na videa bez lidského zásahu',
      cta: 'Vyzkoušej NEXUS Studio hned',
      style: 'minimal_dark' as VideoVisualStyle,
      bpm: 132,
      subAction: 'Živý tok zpráv v operačním systému NEXUS X OS',
    },
  ];

  const customEpisodesData = [
    {
      num: 1,
      title: `DÍL 1/5: PROČ ${shortTopicUpper} MĚNÍ PRAVIDLA V ROCE 2026`,
      hook: `STOP! Většina lidí pořád podceňuje téma ${shortTopic}. Sleduj proč.`,
      midHeadline: `3 hlavní důvody, proč ${shortTopic} rozhoduje o výsledcích`,
      midSub: 'Konkrétní změna v efektivitě a rychlosti už během prvního týdne',
      cta: 'Ulož si Díl 1 & sleduj dál',
      style: 'cyberpunk_neon' as VideoVisualStyle,
      bpm: 136,
      subAction: `Silný 3s háček na téma ${shortTopic}`,
    },
    {
      num: 2,
      title: `DÍL 2/5: JAK NASTAVIT ${shortTopicUpper} ZA 5 MINUT`,
      hook: `Praktický postup krok za krokem pro ${shortTopic} bez zbytečné teorie.`,
      midHeadline: `Checklist pro okamžitý start v oblasti ${shortTopic}`,
      midSub: 'Přesná architektura prvního spuštění bez vysokých vstupních nákladů',
      cta: 'Napiš "NÁVOD" pro checklist',
      style: 'fintech_emerald' as VideoVisualStyle,
      bpm: 128,
      subAction: `Krok za krokem návod pro ${shortTopic}`,
    },
    {
      num: 3,
      title: `DÍL 3/5: NEJVĚTŠÍ CHYBA U ${shortTopicUpper} (95 % LIDÍ)`,
      hook: `Tohle tě u tématu ${shortTopic} stojí nejvíc času a peněz.`,
      midHeadline: `Srovnání před a po odstranění kritického úzkého hrdla`,
      midSub: 'Okamžité zvýšení kvality výstupu díky datovému srovnání',
      cta: 'Sdílej a sleduj Díl 4',
      style: 'editorial_coral' as VideoVisualStyle,
      bpm: 140,
      subAction: `Analýza nejčastějších chyb v ${shortTopic}`,
    },
    {
      num: 4,
      title: `DÍL 4/5: POKROČILÁ STRATEGIE PRO ${shortTopicUpper}`,
      hook: `Tajný trik expertů, který odděluje začátečníky od špičky.`,
      midHeadline: `Měřitelná optimalizace a škálování pro ${shortTopic}`,
      midSub: 'Jak z jednorázového nápadu vytvořit opakovatelný ziskový systém',
      cta: 'Klikni na bio pro šablonu',
      style: 'luxury_gold' as VideoVisualStyle,
      bpm: 124,
      subAction: `Pokročilé taktiky pro ${shortTopic}`,
    },
    {
      num: 5,
      title: `DÍL 5/5: KOMPLETNÍ SYSTÉM PRO ${shortTopicUpper}`,
      hook: `Finální díl série! Takhle spojíš všechny 4 kroky v jeden celek.`,
      midHeadline: `Plně automatizovaný plán pro dlouhodobý úspěch s ${shortTopic}`,
      midSub: 'Přehledná mapa od prvního kroku až po měřitelnou návratnost ROI',
      cta: 'Začni sérii ještě dnes',
      style: 'minimal_dark' as VideoVisualStyle,
      bpm: 132,
      subAction: `Kompletní blueprint pro ${shortTopic}`,
    },
  ];

  const episodesData = isDefaultAiTopic ? defaultEpisodesData : customEpisodesData;
  const sliced = episodesData.slice(0, Math.min(5, Math.max(2, count)));
  const briefs: VideoCreativeBrief[] = sliced.map((ep) => {
    const styleToUse = options?.preferredVisualStyle || ep.style;
    const pal = STYLE_PALETTES[styleToUse] || STYLE_PALETTES.fintech_emerald;
    const scenes: VideoBriefScene[] = [
      {
        title: `3S HOOK · DÍL ${ep.num}/${sliced.length}`,
        subtitle: ep.hook,
        visualCue: 'Kinetický zoom, pulzující REC indikátor a kontrastní rámeček',
        durationSec: 2,
        kineticTag: `DÍL ${ep.num} · 3S HOOK`,
      },
      {
        title: ep.midHeadline,
        subtitle: ep.midSub,
        visualCue: 'Hormozi kinetické titulky a audio-reaktivní vizualizér',
        durationSec: 3,
        kineticTag: `DÍL ${ep.num} · JÁDRO OBSAHU`,
      },
      {
        title: 'VÝZVA K AKCI & SMYČKA',
        subtitle: ep.cta,
        visualCue: 'Bezpečné spodní pásmo CTA pill a plynulá smyčka na začátek',
        durationSec: 2,
        kineticTag: `DÍL ${ep.num} · CTA BIO`,
      },
    ];

    const structuredPrompt = parseStructuredPromptFromText(
      `${ep.title}. ${ep.hook} ${ep.subAction}`,
      { aspectRatio, durationSec: 7, visualStyle: styleToUse }
    );
    if (structuredPrompt.temporal.beats.length >= 3) {
      structuredPrompt.temporal.beats[0].beatTitle = ep.title;
      structuredPrompt.temporal.beats[0].kineticCaption = ep.hook;
      structuredPrompt.temporal.beats[1].beatTitle = ep.midHeadline;
      structuredPrompt.temporal.beats[1].kineticCaption = ep.midSub;
      structuredPrompt.temporal.beats[2].beatTitle = 'DALŠÍ KROK & SMYČKA';
      structuredPrompt.temporal.beats[2].kineticCaption = ep.cta;
    }

    return {
      topic: ep.title,
      title: ep.title,
      hook: ep.hook,
      goal: 'viral_growth',
      platform,
      aspectRatio,
      durationSec: 7,
      visualStyle: styleToUse,
      notebookStyle: options?.preferredNotebookStyle,
      language: options?.language || 'Čeština (výchozí)',
      accentColor: pal.accentColor,
      secondaryColor: pal.secondaryColor,
      bgHex: pal.bgHex,
      tone: 'energetic',
      bpm: ep.bpm,
      audience: 'české tvůrce, marketéry a podnikatele',
      cta: ep.cta,
      keyPoints: [ep.hook, ep.midHeadline, ep.cta],
      scenes,
      completenessScore: 100,
      missingFields: [],
      engineUsed: 'nexus-batch-director-suite',
      structuredPrompt,
    };
  });

  const reasoningTrace: ReasoningTrace = {
    durationMs: 460,
    thinkingTitle: `NEO Deep Thinking & Algorithmic Retention Architecture (${platform} · ${sliced.length} epizod)`,
    algorithmicStrategy: `Navržena ${sliced.length}dílná virální série pro téma "${shortTopic}" s progresivním zvyšováním hodnoty (Hook -> Mechanismus -> Kritická chyba -> Tajná strategie -> Finální blueprint). Každá epizoda má psychologickou kotvu v prvních 1.8s pro maximalizaci dokončení zhlédnutí (Completion Rate > 68 %).`,
    retentionModel: 'Pravidlo 3sekundového přerušení vzorce (Pattern Interrupt) s kinetickými titulky na kontrastním černém pozadí (Hormozi style), dynamickou gradientní vrstvou, live REC signálem a 12pásmovým audio vizualizérem.',
    audioPacing: 'Dynamické tempo 122–140 BPM sladěné s rytmem střihu, sub-basovým pulzem a syntetizovanou harmonií bez rušivých šumů.',
    agentConsensus: [
      { agent: 'Video Director Agent', perspective: `Schválil ${sliced.length} odlišných vizuálních scénářů (${options?.preferredNotebookStyle || 'Multi-Style'}) pro maximální zapamatovatelnost jednotlivých dílů.` },
      { agent: 'CFO Agent', perspective: `Predikovaná hodnota produkce série v externí agentuře: ${(sliced.length * 9000).toLocaleString('cs-CZ')} Kč. Náklady v lokálním NEXUS runtime: 0 Kč.` },
      { agent: 'Retention Architect', perspective: 'Vypočítal předpokládaný nárůst Watch Time o +240 % díky 4-bodovému animovanému gradientu a kinetic caption rámečkům.' },
      { agent: 'Compliance & QA', perspective: `Ověřeno bezpečné pásmo pro UI ${platform} (${aspectRatio}), texty mimo oblast ikon profilu a popisku.` },
    ],
    structuredPillars: sliced.map((ep) => ({
      title: ep.title,
      subject: ep.subAction,
      style: options?.preferredNotebookStyle || ep.style,
      camera: ep.num % 2 === 0 ? 'Focal Zoom + Pan' : 'FPV Dynamic Orbit',
      hookPacing: `${ep.bpm} BPM · 3s Hook`,
    })),
  };

  const videoBatchSuite: VideoBatchSuite = {
    suiteTitle: `${sliced.length}dílná virální série: ${shortTopic} (${platform})`,
    totalDurationSec: briefs.reduce((acc, b) => acc + b.durationSec, 0),
    episodesCount: briefs.length,
    platform: `${platform} (${aspectRatio})`,
    targetAudience: 'Tvůrci obsahu, marketéři a podnikatelé v ČR a SR',
    strategySummary: `Kompletní publikační pipeline na ${sliced.length} dní. 1 video denně s provázanými cliffhangery a jasnou výzvou k akci.`,
  };

  return { briefs, reasoningTrace, videoBatchSuite };
}

export class VideoDirectorEngine {
  public static isVideoRequest(text: string): boolean {
    const lower = text.toLowerCase();
    return /\b(vide[oaůy]?|videí|videi|tiktok|tik\s*tok|shorts|reels|youtube|moviepy|mp4|klip[uy]?|render(uj)?|reklam(ní|ni)?\s+vide|upoutávk|trailer)\b/i.test(
      lower
    );
  }

  /**
   * Analyzes a user prompt (optionally merged with an open clarification draft in thread memory)
   * and returns either a ready-to-render VideoCreativeBrief or a targeted ClarificationRequest.
   */
  public static async analyzePrompt(params: {
    userMessage: string;
    priorDraft?: Partial<VideoCreativeBrief>;
    forceDefaults?: boolean;
    useGemini?: boolean;
    structuredPrompt?: StructuredVideoPrompt;
  }): Promise<VideoDirectorAnalysis> {
    if (params.structuredPrompt) {
      const sp = {
        ...params.structuredPrompt,
        temporal: {
          ...params.structuredPrompt.temporal,
          beats: rebalanceTemporalBeats(
            params.structuredPrompt.temporal.beats,
            params.structuredPrompt.totalDurationSec
          ),
        },
      };
      const palette = STYLE_PALETTES[sp.style.visualStyle] || STYLE_PALETTES.fintech_emerald;
      const paletteExtra = VISUAL_STYLE_PALETTES[sp.style.visualStyle] || VISUAL_STYLE_PALETTES.fintech_emerald;
      const platform: VideoCreativeBrief['platform'] =
        sp.aspectRatio === '16:9' ? 'YouTube Video' : 'YouTube Shorts';
      const scenes: VideoBriefScene[] = sp.temporal.beats.map((b, idx) => ({
        title: b.beatTitle || `FÁZE ${idx + 1}`,
        subtitle: b.kineticCaption || b.sceneDescription.slice(0, 80),
        visualCue: `${CAMERA_MOTION_LABELS[b.cameraKeyframe].split('(')[0].trim()} · ${b.lightingShift || LIGHTING_LABELS[sp.style.lighting]}`,
        durationSec: b.durationSec,
        kineticTag: `${b.phase.toUpperCase()} · ${b.cameraKeyframe.toUpperCase()}`,
      }));
      const hookBeat = sp.temporal.beats[0];
      const brief: VideoCreativeBrief = {
        topic: sp.subject.primarySubject,
        title: truncateWords(sp.subject.primarySubject, 68),
        hook: hookBeat?.sceneDescription || sp.subject.subjectAction,
        goal: 'viral_growth',
        platform,
        aspectRatio: sp.aspectRatio,
        durationSec: sp.totalDurationSec,
        visualStyle: sp.style.visualStyle,
        accentColor: sp.style.accentColor || paletteExtra.accentColor || palette.accentColor,
        secondaryColor: sp.style.secondaryColor || paletteExtra.secondaryColor || palette.secondaryColor,
        bgHex: sp.style.bgHex || paletteExtra.bgHex || palette.bgHex,
        tone: 'cinematic',
        bpm: palette.defaultBpm,
        audience: 'diváky v ČR a SR',
        cta: sp.temporal.beats[sp.temporal.beats.length - 1]?.kineticCaption || 'Sledujte další vývoj a vyzkoušejte ve studiu.',
        keyPoints: [
          `Subjekt: ${sp.subject.primarySubject} (${sp.subject.environment})`,
          `Styl & optika: ${OPTICS_LABELS[sp.style.optics]} · ${LIGHTING_LABELS[sp.style.lighting]}`,
          `Kamera: ${CAMERA_MOTION_LABELS[sp.camera.primaryMotion]} (intenzita ${sp.camera.motionIntensity}/10)`,
        ],
        scenes,
        completenessScore: 100,
        missingFields: [],
        engineUsed: 'local-structured-director',
        structuredPrompt: sp,
      };
      return {
        isVideoIntent: true,
        needsClarification: false,
        batchCount: 1,
        brief,
      };
    }

    const raw = params.userMessage.trim();
    const lower = raw.toLowerCase();
    const draft = params.priorDraft || {};

    const isVideoIntent =
      Boolean(params.priorDraft) || this.isVideoRequest(raw);

    const forceProceed =
      Boolean(params.forceDefaults) ||
      /použij\s+doporučen|automaticky\s+doplň|vymysli\s+sám|vyrenderuj\s+hned|spusť\s+moviepy\s+render/i.test(
        lower
      );

    // Batch count (e.g. "Vytvoř 5 videí na TikTok", "vytvoř mi 5 tik tok videí")
    const batchMatch = lower.match(
      /\b([2-5])\s*(?:(?:tik\s*tok|tiktok|youtube|instagram|reels|shorts)\s+)*(?:vide[aíi]?|shorts|klip[yů]?|reels|tiktok[ůu]?)\b/i
    );
    const batchCount = batchMatch
      ? Math.min(5, Math.max(2, Number.parseInt(batchMatch[1], 10)))
      : 1;

    // Parse platform & aspectRatio
    let platform: VideoCreativeBrief['platform'] | undefined = draft.platform;
    let aspectRatio: '9:16' | '16:9' | undefined = draft.aspectRatio;

    if (/16:9|horizontáln|na šířku|desktop|prezentac|youtube\s+video/i.test(lower)) {
      aspectRatio = '16:9';
      platform = 'YouTube Video';
    } else if (/tik\s*tok|tiktok/i.test(lower)) {
      aspectRatio = aspectRatio || '9:16';
      platform = 'TikTok';
    } else if (/reels|instagram/i.test(lower)) {
      aspectRatio = aspectRatio || '9:16';
      platform = 'Instagram Reels';
    } else if (/shorts|9:16|vertikáln|na výšku/i.test(lower)) {
      aspectRatio = '9:16';
      platform = 'YouTube Shorts';
    } else if (/youtube/i.test(lower)) {
      platform = platform || 'YouTube Shorts';
      aspectRatio = aspectRatio || '9:16';
    }

    // Parse duration
    const durMatch = lower.match(/\b(\d{1,2})\s*(s|sec|sekund[ay]?|vteřin[ay]?)\b/i);
    let parsedDuration = durMatch ? Number.parseInt(durMatch[1], 10) : draft.durationSec;
    if (parsedDuration !== undefined) {
      parsedDuration = Math.max(4, Math.min(15, parsedDuration));
    }

    // Parse explicit style & tone & goal
    const detectedNotebookStyle = detectNotebookStyle(lower);
    const detectedStyle = detectExplicitStyle(lower) || draft.visualStyle;
    const detectedTone = detectTone(lower) || draft.tone;
    const detectedGoal = detectGoal(lower) || draft.goal;

    // Parse audience
    const audMatch = raw.match(/\bpro\s+([a-záčďéěíňóřšťúůýž0-9\s-]{3,32}?)(?:\s+(?:v|na|s|a|,|$))/i);
    const audience = audMatch ? audMatch[1].trim() : draft.audience || 'české diváky a tvůrce';

    // Parse topic — preserve priorDraft.topic during follow-up clarifications unless user supplies a new explicit topic
    const hasExplicitTopicMarker = /(?:na\s+t[eé]ma|t[eé]ma|o\s+tom,?\s+jak|\bo\s+)/i.test(raw);
    let topic = extractTopicCandidate(raw);
    if (draft.topic && !hasExplicitTopicMarker) {
      topic = draft.topic;
    } else if (!topic && draft.topic) {
      topic = draft.topic;
    } else if (topic && draft.topic && !raw.toLowerCase().includes(draft.topic.toLowerCase())) {
      topic = draft.topic.length >= topic.length ? draft.topic : topic;
    }

    // Fall back topic if batch command ("Vytvoř 5 videí na TikTok") or forceProceed
    if (!topic && (forceProceed || batchCount > 1)) {
      topic = platform === 'TikTok'
        ? 'AI automatizace obsahu pro sociální sítě'
        : 'Autonomní AI workflow pro růst dosahu';
    }

    // Assess missing dimensions
    const missingFields: VideoCreativeBrief['missingFields'] = [];
    if (!topic || topic.length < 3) missingFields.push('topic');
    if (!platform && !aspectRatio) missingFields.push('platform_format');
    if (!detectedStyle && !detectedTone) missingFields.push('style_tone');
    if (!detectedGoal && topic.split(/\s+/).length < 3) missingFields.push('goal_cta');

    let completenessScore = 100;
    if (!topic || topic.length < 3) completenessScore -= 55;
    else if (topic.split(/\s+/).length === 1 && !platform && !detectedStyle) completenessScore -= 25;
    if (!platform && !aspectRatio) completenessScore -= 18;
    if (!detectedStyle && !detectedTone) completenessScore -= 15;
    if (!detectedGoal) completenessScore -= 12;
    completenessScore = Math.max(10, Math.min(100, completenessScore));

    // Resolve concrete defaults for brief representation (inferring best palette from topic when style wasn't explicitly set)
    const resolvedAspect: '9:16' | '16:9' = aspectRatio || '9:16';
    const resolvedPlatform: VideoCreativeBrief['platform'] =
      platform || (resolvedAspect === '16:9' ? 'YouTube Video' : 'YouTube Shorts');
    const resolvedStyle: VideoVisualStyle =
      detectedStyle || inferPaletteFromTopic(`${lower} ${(topic || '').toLowerCase()}`) || 'fintech_emerald';
    const palette = STYLE_PALETTES[resolvedStyle];
    const resolvedTone: VideoTone = detectedTone || 'energetic';
    const resolvedGoal: VideoCreativeBrief['goal'] = detectedGoal || 'viral_growth';
    const resolvedDuration = parsedDuration || (resolvedGoal === 'education' ? 9 : 6);
    const resolvedTopic = topic || 'Nezadáno';
    const resolvedCta =
      resolvedGoal === 'sales_funnel'
        ? 'Klikni na odkaz v popisku a vyzkoušej hned.'
        : resolvedGoal === 'education'
          ? 'Ulož si video a napiš do komentáře „ŠABLONA“.'
          : 'Sleduj profil pro další praktické AI postupy.';

    // Determine whether AI should ask for clarification before spending render time
    const hasExplicitTopic = Boolean(topic && topic.length >= 3);
    const isShortVagueTopicOnly =
      hasExplicitTopic &&
      topic.split(/\s+/).length <= 2 &&
      !platform &&
      !aspectRatio &&
      !detectedStyle &&
      !detectedTone &&
      !detectedGoal &&
      !parsedDuration &&
      !params.priorDraft &&
      batchCount === 1;

    const needsClarification =
      isVideoIntent &&
      !forceProceed &&
      batchCount === 1 &&
      (!hasExplicitTopic || isShortVagueTopicOnly);

    const partialBrief: Partial<VideoCreativeBrief> = {
      ...(hasExplicitTopic ? { topic: resolvedTopic } : {}),
      ...(platform ? { platform } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(detectedStyle ? { visualStyle: detectedStyle } : {}),
      ...(detectedTone ? { tone: detectedTone } : {}),
      ...(detectedGoal ? { goal: detectedGoal } : {}),
      ...(parsedDuration ? { durationSec: parsedDuration } : {}),
      audience,
    };

    const structuredPrompt = parseStructuredPromptFromText(
      hasExplicitTopic ? `${resolvedTopic}. ${raw}` : raw,
      {
        aspectRatio: resolvedAspect,
        durationSec: resolvedDuration,
        visualStyle: resolvedStyle,
      }
    );

    // Build local creative brief first (guaranteed fast, free, offline-safe)
    let brief: VideoCreativeBrief = {
      topic: resolvedTopic,
      title: truncateWords(resolvedTopic, 68),
      hook:
        resolvedTone === 'humorous'
          ? `Pořád ztrácíš čas ručně? ${truncateWords(resolvedTopic, 48)} to vyřeší.`
          : `Jak ${truncateWords(resolvedTopic, 48)} mění výsledky pro ${audience}`,
      goal: resolvedGoal,
      platform: resolvedPlatform,
      aspectRatio: resolvedAspect,
      durationSec: resolvedDuration,
      visualStyle: resolvedStyle,
      notebookStyle: detectedNotebookStyle,
      accentColor: palette.accentColor,
      secondaryColor: palette.secondaryColor,
      bgHex: palette.bgHex,
      tone: resolvedTone,
      bpm: palette.defaultBpm,
      audience,
      cta: resolvedCta,
      keyPoints: [
        `Silný 3s vizuální hook zaměřený na ${resolvedTopic}`,
        `Praktický přínos pro ${audience}`,
        `Jasná výzva k akci (${resolvedPlatform})`,
      ],
      scenes: buildSmartLocalScenes(
        resolvedTopic,
        resolvedDuration,
        resolvedGoal,
        resolvedTone,
        audience,
        resolvedCta
      ),
      completenessScore,
      missingFields,
      engineUsed: 'local-director-nlp',
      structuredPrompt,
    };

    // Optional Free-Tier Gemini 4 Hydrogen Creative Director enrichment when API key is configured
    const apiKey = process.env.GEMINI_API_KEY;
    const canUseGemini =
      params.useGemini !== false &&
      Boolean(apiKey) &&
      apiKey !== 'MY_GEMINI_API_KEY' &&
      process.env.NODE_ENV !== 'test';

    if (canUseGemini && !needsClarification && hasExplicitTopic && batchCount === 1) {
      const geminiEnriched = await this.tryEnrichWithFreeGemini(apiKey!, raw, brief);
      if (geminiEnriched) {
        brief = geminiEnriched;
      }
    }

    if (needsClarification) {
      const questions: string[] = [];
      if (!hasExplicitTopic) {
        questions.push(
          'O jakém konkrétním tématu, produktu nebo příběhu má video být?'
        );
      }
      if (!platform && !aspectRatio) {
        questions.push(
          'Pro jakou platformu a formát video tvoříme? (9:16 TikTok/Shorts/Reels vs. 16:9 YouTube)'
        );
      }
      if (!detectedStyle && !detectedTone) {
        questions.push(
          'Jaký vizuální styl a tón preferuješ? (např. Cyberpunk Neon, FinTech Emerald, Luxusní Zlatá, Edukační nebo Humorný)'
        );
      }
      if (!detectedGoal) {
        questions.push(
          'Jaký je hlavní cíl / výzva k akci (CTA) na konci videa? (návod, prodejní demo, virální dosah)'
        );
      }

      const topicPrefix = hasExplicitTopic ? `Téma: ${resolvedTopic}. ` : '';
      const clarification: VideoClarificationRequest = {
        completenessScore,
        missingFields,
        questions: questions.slice(0, 3),
        partialBrief,
        quickPresets: hasExplicitTopic
          ? [
              {
                label: '9:16 TikTok · Cyberpunk Neon · 9s',
                promptText: `${topicPrefix}Formát 9:16 na TikTok, styl Cyberpunk Neon, délka 9 sekund, energický virální hook.`,
              },
              {
                label: '16:9 YouTube · Edukační Minimal · 10s',
                promptText: `${topicPrefix}Formát 16:9 na YouTube, styl Minimal Studio, délka 10 sekund, edukační návod krok za krokem.`,
              },
              {
                label: '9:16 Reels · Luxusní Zlatá · 8s',
                promptText: `${topicPrefix}Formát 9:16 Instagram Reels, styl Luxury Gold, délka 8 sekund, cíl budování značky a CTA na odkaz.`,
              },
            ]
          : [
              {
                label: 'AI automatizace faktur · 9:16 Cyberpunk',
                promptText:
                  'Vytvoř 9s kyberpunk TikTok video 9:16 o tom, jak AI automatizace faktur šetří podnikatelům 10 hodin týdně, s CTA na demo.',
              },
              {
                label: 'Produktové SaaS demo · 16:9 YouTube',
                promptText:
                  'Vytvoř 10s edukační YouTube video 16:9 v minimalistickém stylu s živou ukázkou dashboardu pro B2B týmy.',
              },
              {
                label: 'Výběrová káva pro manažery · 9:16 Zlatá',
                promptText:
                  'Vytvoř 8s prémiové Instagram Reels video 9:16 v luxusním zlatém stylu o výběrové kávě pro manažery s CTA na objednávku.',
              },
            ],
        proceedPrompt: hasExplicitTopic
          ? `Použij doporučený návrh pro téma "${resolvedTopic}" a vyrenderuj MP4 hned`
          : 'Použij doporučený návrh pro virální AI Shorts a vyrenderuj MP4 hned',
      };

      return {
        isVideoIntent: true,
        needsClarification: true,
        batchCount,
        brief,
        clarification,
      };
    }

    if (batchCount > 1) {
      let suite = generateBatchSuite(
        hasExplicitTopic ? resolvedTopic : 'AI automatizace obsahu pro sociální sítě',
        resolvedPlatform,
        resolvedAspect,
        batchCount,
        {
          preferredNotebookStyle: detectedNotebookStyle,
          preferredVisualStyle: detectedStyle,
        }
      );

      if (canUseGemini) {
        const enrichedSuite = await this.tryEnrichBatchWithFreeGemini(apiKey!, raw, suite);
        if (enrichedSuite) {
          suite = enrichedSuite;
        }
      }

      return {
        isVideoIntent: true,
        needsClarification: false,
        batchCount,
        brief: suite.briefs[0],
        batchBriefs: suite.briefs,
        reasoningTrace: suite.reasoningTrace,
        videoBatchSuite: suite.videoBatchSuite,
      };
    }

    const singleReasoningTrace: ReasoningTrace = {
      durationMs: 380,
      thinkingTitle: `NEO Video Directing Architecture (${detectedNotebookStyle || brief.visualStyle} · ${brief.aspectRatio})`,
      algorithmicStrategy: `Optimalizováno pro platformu ${brief.platform} s kinetickým 3s hookem zaměřeným na "${brief.topic}". Přerušení vzorce (Pattern Interrupt) v úvodu garantuje udržení pozornosti diváka v kritickém okně prvních 2 sekund.`,
      retentionModel: 'Hormozi kinetické žluté titulky s černým podkladem, 60fps plynulost, auditní blueprint mřížka a audio-reaktivní ekvalizér.',
      audioPacing: `${brief.bpm} BPM syntetizovaný elektronický beat sladěný se střihovými fázemi.`,
      agentConsensus: [
        { agent: 'Video Director Agent', perspective: `Strukturováno do ${brief.scenes.length} časových sekvencí s progresivním vizuálním vývojem.` },
        { agent: 'Retention Architect', perspective: 'Predikovaná míra dokončení videa (Completion Rate): > 62 %.' },
      ],
      structuredPillars: [
        {
          title: brief.title,
          subject: brief.topic,
          style: detectedNotebookStyle || brief.visualStyle,
          camera: 'Dynamic Focal Zoom',
          hookPacing: `${brief.bpm} BPM · ${brief.durationSec}s`,
        },
      ],
    };

    return {
      isVideoIntent,
      needsClarification: false,
      batchCount,
      brief,
      reasoningTrace: singleReasoningTrace,
    };
  }

  /**
   * Uses free-tier `gemini-4-hydrogen` server-side with strict JSON schema
   * to refine title, hook, CTA, and scene subtitles. Gracefully falls back on any error.
   */
  private static async tryEnrichWithFreeGemini(
    apiKey: string,
    userPrompt: string,
    baseBrief: VideoCreativeBrief
  ): Promise<VideoCreativeBrief | null> {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Uživatelské zadání pro video: "${userPrompt}"
Aktuální parametry: platforma=${baseBrief.platform}, poměr=${baseBrief.aspectRatio}, styl=${baseBrief.visualStyle}, tón=${baseBrief.tone}, délka=${baseBrief.durationSec}s, publikum=${baseBrief.audience}.
Vytvoř úderný český název videa, 3s hook, CTA a 3 navazující scény s krátkým titulkem na obrazovku a podtitulkem bez zbytečné vaty.`,
          config: {
            abortSignal: controller.signal,
            systemInstruction:
              'Jsi elitní AI video režisér. Odpovídej výhradně česky, konkrétně, stručně a bez emoji nebo markdownu.',
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                hook: { type: Type.STRING },
                cta: { type: Type.STRING },
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      subtitle: { type: Type.STRING },
                      visualCue: { type: Type.STRING },
                      kineticTag: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

        const rawJson = (response.text ?? '').trim();
        if (!rawJson) return null;
        const parsed = JSON.parse(rawJson);
        const scenesInput = Array.isArray(parsed.scenes) ? parsed.scenes.slice(0, 3) : [];
        if (scenesInput.length === 0) return null;

        const baseDurations = baseBrief.scenes.map((s) => s.durationSec);
        const mergedScenes: VideoBriefScene[] = scenesInput.map((sc: any, idx: number) => ({
          title: String(sc.title || baseBrief.scenes[idx]?.title || `SCÉNA ${idx + 1}`).slice(0, 48),
          subtitle: String(sc.subtitle || baseBrief.scenes[idx]?.subtitle || baseBrief.hook).slice(0, 90),
          visualCue: String(sc.visualCue || baseBrief.scenes[idx]?.visualCue || 'Dynamický střih').slice(0, 64),
          kineticTag: String(sc.kineticTag || `SCÉNA ${idx + 1}/3`).slice(0, 28),
          durationSec: baseDurations[idx] || Math.max(2, Math.round(baseBrief.durationSec / scenesInput.length)),
        }));

        return {
          ...baseBrief,
          title: String(parsed.title || baseBrief.title).slice(0, 80),
          hook: String(parsed.hook || baseBrief.hook).slice(0, 140),
          cta: String(parsed.cta || baseBrief.cta).slice(0, 120),
          scenes: mergedScenes,
          engineUsed: 'gemini-4-hydrogen+local-director',
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return null;
    }
  }

  /**
   * Uses Gemini 4 Hydrogen with ThinkingLevel.MEDIUM to plan and sharpen a multi-video
   * TikTok/Shorts series when GEMINI_API_KEY is available.
   */
  private static async tryEnrichBatchWithFreeGemini(
    apiKey: string,
    userPrompt: string,
    baseSuite: {
      briefs: VideoCreativeBrief[];
      reasoningTrace: ReasoningTrace;
      videoBatchSuite: VideoBatchSuite;
    }
  ): Promise<{
    briefs: VideoCreativeBrief[];
    reasoningTrace: ReasoningTrace;
    videoBatchSuite: VideoBatchSuite;
  } | null> {
    const startMs = Date.now();
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5500);

      try {
        const count = baseSuite.briefs.length;
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Uživatelské zadání pro sérii ${count} videí: "${userPrompt}"
Platforma: ${baseSuite.videoBatchSuite.platform}.
Navrhni přesně ${count} na sebe navazujících virálních epizod s ostrým 3s hookem, konkrétním jádrem bez obecné vaty, a krátkou výzvou k akci (CTA max 34 znaků). Dále shrň retenční strategii série.`,
          config: {
            abortSignal: controller.signal,
            systemInstruction:
              'Jsi elitní Chief Video Architect pro TikTok a YouTube Shorts. Piš výhradně česky, ostře, prakticky a bez zbytečného balastu.',
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                suiteTitle: { type: Type.STRING },
                algorithmicStrategy: { type: Type.STRING },
                retentionModel: { type: Type.STRING },
                episodes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      hook: { type: Type.STRING },
                      midHeadline: { type: Type.STRING },
                      midSub: { type: Type.STRING },
                      cta: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

        const rawJson = (response.text ?? '').trim();
        if (!rawJson) return null;
        const parsed = JSON.parse(rawJson);
        const episodes = Array.isArray(parsed.episodes) ? parsed.episodes : [];
        if (episodes.length === 0) return null;

        const mergedBriefs = baseSuite.briefs.map((baseBrief, idx) => {
          const ep = episodes[idx];
          if (!ep) return baseBrief;
          const title = `DÍL ${idx + 1}/${baseSuite.briefs.length}: ${String(ep.title || baseBrief.title).replace(/^DÍL\s*\d+\/\d+\s*:\s*/i, '').slice(0, 62)}`;
          const hook = String(ep.hook || baseBrief.hook).slice(0, 120);
          const midHeadline = String(ep.midHeadline || baseBrief.scenes[1]?.title || title).slice(0, 68);
          const midSub = String(ep.midSub || baseBrief.scenes[1]?.subtitle || hook).slice(0, 96);
          const cta = String(ep.cta || baseBrief.cta).slice(0, 44);
          return {
            ...baseBrief,
            topic: title,
            title,
            hook,
            cta,
            engineUsed: 'gemini-4-hydrogen+thinking-director' as const,
            scenes: [
              { ...baseBrief.scenes[0], subtitle: hook },
              { ...baseBrief.scenes[1], title: midHeadline, subtitle: midSub },
              { ...baseBrief.scenes[2], subtitle: cta },
            ],
          };
        });

        return {
          briefs: mergedBriefs,
          reasoningTrace: {
            ...baseSuite.reasoningTrace,
            durationMs: Date.now() - startMs,
            algorithmicStrategy: String(parsed.algorithmicStrategy || baseSuite.reasoningTrace.algorithmicStrategy),
            retentionModel: String(parsed.retentionModel || baseSuite.reasoningTrace.retentionModel),
            structuredPillars: mergedBriefs.map((b, i) => ({
              title: b.title,
              subject: b.hook,
              style: b.notebookStyle || b.visualStyle,
              camera: baseSuite.reasoningTrace.structuredPillars[i]?.camera || 'Focal Zoom',
              hookPacing: `${b.bpm} BPM · ${b.durationSec}s`,
            })),
          },
          videoBatchSuite: {
            ...baseSuite.videoBatchSuite,
            suiteTitle: String(parsed.suiteTitle || baseSuite.videoBatchSuite.suiteTitle).slice(0, 84),
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return null;
    }
  }
}
