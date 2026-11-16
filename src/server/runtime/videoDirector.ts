/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  VideoBriefScene,
  VideoClarificationRequest,
  VideoCreativeBrief,
  VideoTone,
  VideoVisualStyle,
} from '../../types/nexus.ts';

export interface VideoDirectorAnalysis {
  isVideoIntent: boolean;
  needsClarification: boolean;
  batchCount: number;
  brief: VideoCreativeBrief;
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

  // Strip trailing format/duration/CTA modifiers so topic stays crisp
  candidate = candidate
    .replace(/\b(9:16|16:9)\b/gi, ' ')
    .replace(/\b\d+\s*(s|sec|sekund[ay]?|vteřin[ay]?)\b/gi, ' ')
    .replace(/\(\s*ai\s+se\s+dopt[áa]\s+na\s+detaily\s*\)/gi, ' ')
    .replace(/,?\s*s\s+cta\s+na\s+[^,.!?]+/gi, ' ')
    .replace(/\b(na\s+(tiktok|youtube(\s+shorts)?|instagram(\s+reels)?|reels|shorts))\b/gi, ' ')
    .replace(/\b(v\s+(kyberpunk|cyberpunk|neon|zlat[eé]m|minimalistick[eé]m|fintech)\s+stylu?)\b/gi, ' ')
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

function detectExplicitStyle(lower: string): VideoVisualStyle | undefined {
  if (/kyberpunk|cyberpunk|neon|futurist|sci-fi|hologram|synth/i.test(lower)) {
    return 'cyberpunk_neon';
  }
  if (/zlat|luxus|prestiž|eleganc|glamour|královsk/i.test(lower)) {
    return 'luxury_gold';
  }
  if (/energick|coral|virál|viral|akčn|reklam/i.test(lower)) {
    return 'editorial_coral';
  }
  if (/minimal|čist|cist|tutori[aá]l|návod|navod|akadem|černobíl/i.test(lower)) {
    return 'minimal_dark';
  }
  if (/fintech|smaragd|emerald|matrix/i.test(lower)) {
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

export class VideoDirectorEngine {
  public static isVideoRequest(text: string): boolean {
    const lower = text.toLowerCase();
    return /\b(vide[oaůy]?|videí|videi|tiktok|shorts|reels|youtube|moviepy|mp4|klip[uy]?|render(uj)?|reklam(ní|ni)?\s+vide|upoutávk|trailer)\b/i.test(
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
  }): Promise<VideoDirectorAnalysis> {
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

    // Batch count (e.g. "Vytvoř 5 videí na TikTok")
    const batchMatch = lower.match(/\b([2-5])\s*(vide[aíi]?|shorts|klip[yů]?|reels)/i);
    const batchCount = batchMatch
      ? Math.min(5, Math.max(2, Number.parseInt(batchMatch[1], 10)))
      : 1;

    // Parse platform & aspectRatio
    let platform: VideoCreativeBrief['platform'] | undefined = draft.platform;
    let aspectRatio: '9:16' | '16:9' | undefined = draft.aspectRatio;

    if (/16:9|horizontáln|na šířku|desktop|prezentac|youtube\s+video/i.test(lower)) {
      aspectRatio = '16:9';
      platform = 'YouTube Video';
    } else if (/tiktok/i.test(lower)) {
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
        ? 'Rychlá AI automatizace každodenní práce'
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
    };

    // Optional Free-Tier Gemini 4 Hydrogen Creative Director enrichment when API key is configured
    const apiKey = process.env.GEMINI_API_KEY;
    const canUseGemini =
      params.useGemini !== false &&
      Boolean(apiKey) &&
      apiKey !== 'MY_GEMINI_API_KEY' &&
      process.env.NODE_ENV !== 'test';

    if (canUseGemini && !needsClarification && hasExplicitTopic) {
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

    return {
      isVideoIntent,
      needsClarification: false,
      batchCount,
      brief,
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
}
