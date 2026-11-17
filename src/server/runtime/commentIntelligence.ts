/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  CommentAutopilotConfig,
  CommentIntent,
  CommentMultiCoreAnalysis,
  CommentReplyStrategy,
  CommentReplyVariant,
  CommentSwarmKpis,
  PinnedCommentPack,
  SocialComment,
  VideoSharingPlatform,
} from '../../types/nexus.ts';

function redactPiiLocal(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
    .replace(/(?:\+420\s?)?\d{3}\s?\d{3}\s?\d{3}\b/g, '[REDACTED_PHONE]');
}

function sanitizeOutputLocal(text: string): string {
  return redactPiiLocal(text).replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

export const DEFAULT_COMMENT_AUTOPILOT_CONFIG: CommentAutopilotConfig = {
  enabled: true,
  voicePersona: 'alex_hormozi_cz',
  brandCtaBridge: 'Napiš do komentáře nebo DM klíčové slovo a pošlu ti kompletní šablonu + video blueprint.',
  dmKeyword: 'BLUEPRINT',
  trollShieldMode: 'witty_aikido',
  autoReplyThresholdConfidence: 84,
  autoSyncHotLeadsToCrm: true,
};

export const VOICE_PERSONA_LABELS: Record<CommentAutopilotConfig['voicePersona'], string> = {
  alex_hormozi_cz: 'Hormozi Direct Value (High-Retention & ROI)',
  tech_educator: 'Senior AI Architect & Educator',
  witty_creator: 'Viral Creator · Rychlý vtip & Pattern Interrupt',
  executive_b2b: 'Executive B2B Konzultant',
};

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s+prompt/i,
  /reveal\s+.*(secret|api[_\s]?key|env|token|password)/i,
  /vypiš\s+(mi\s+)?(api|systémový|tajný|heslo)/i,
  /bypass\s+(security|guardrail|safety)/i,
  /<script[\s>]/i,
];

const SPAM_PHISHING_PATTERNS = [
  /https?:\/\/(t\.me|wa\.me|bit\.ly|tinyurl\.com|cutt\.ly)/i,
  /whatsapp\s*\+?\d{6,}/i,
  /crypto\s*(airdrop|signals|profit|double|invest)/i,
  /vydělal\s+jsem\s+\d+\s*(usd|eur|\$)\s+za\s+hodinu\s+klikni/i,
  /free\s+iphone|claim\s+prize|giveaway\s+winner/i,
];

const TOXIC_HATE_PATTERNS = [
  /(?:^|[^\p{L}])(podvodn|scam|debil|idiot|odpad|kecy|fejk|zavřete to|trapn|bullshit|garbage|fake)/iu,
];

const HOT_LEAD_PATTERNS = [
  /(?:^|[^\p{L}])(koup|cen[auy]|kolik\s+(to\s+)?stoj|odkaz|link|šablon|prompt|blueprint|kde\s+(stáhn|koup|najd)|jak\s+získ|pošli|chci\s+(to|ten|tu|si)|zájem|objedn)/iu,
  /(?:^|[^\p{L}])(price|buy|where\s+to\s+get|send\s+link|template)/iu,
];

const COLLAB_PATTERNS = [
  /(?:^|[^\p{L}])(spoluprác|b2b|agentur|sponzor|partner|nabídk|faktura|dodavatel|kampan|reklam|kontakt|email)/iu,
];

const QUESTION_PATTERNS = [
  /\?/,
  /(?:^|[^\p{L}])(jak|proč|kde|kdy|který|jaký|funguje|umí|moviepy|ffmpeg|model|jakou|můžu|lze)/iu,
];

const OBJECTION_PATTERNS = [
  /(?:^|[^\p{L}])(drah|moc\s+složit|nefunguje|nevěřím|proč\s+bych|ztráta\s+času|málo|chyba|seká\s+se|pomalu)/iu,
];

const PRAISE_PATTERNS = [
  /(?:^|[^\p{L}])(super|skvěl|pecka|top|úžasn|genial|bomba|respekt|díky|děkuj|best|fire|flame|masakr|hodně\s+dobr)/iu,
  /🔥|🚀|👏|💯|❤️/,
];

function extractKeywords(text: string): string[] {
  const candidates = [
    'prompt',
    'šablona',
    'blueprint',
    'cena',
    'koupit',
    'odkaz',
    'spolupráce',
    'B2B',
    'MoviePy',
    'FFmpeg',
    'TikTok',
    'YouTube',
    'Reels',
    'automatizace',
    'AI',
    'scam',
    'injection',
  ];
  const lower = text.toLowerCase();
  const matched = candidates.filter((kw) => lower.includes(kw.toLowerCase()));
  return matched.length > 0 ? matched.slice(0, 6) : ['komunita', 'video'];
}

export function runTrollShieldCore(
  commentText: string,
  config: CommentAutopilotConfig = DEFAULT_COMMENT_AUTOPILOT_CONFIG
): CommentMultiCoreAnalysis['shieldCore'] {
  const sanitized = redactPiiLocal(commentText);
  const spamSignals: string[] = [];
  let injectionAttempt = false;
  let toxicityScore = 4;

  for (const rx of INJECTION_PATTERNS) {
    if (rx.test(sanitized)) {
      injectionAttempt = true;
      spamSignals.push('Prompt Injection / System Probe');
      toxicityScore = Math.max(toxicityScore, 95);
    }
  }

  for (const rx of SPAM_PHISHING_PATTERNS) {
    if (rx.test(sanitized)) {
      spamSignals.push('Externí spam / phishing odkaz');
      toxicityScore = Math.max(toxicityScore, 88);
    }
  }

  for (const rx of TOXIC_HATE_PATTERNS) {
    if (rx.test(sanitized)) {
      spamSignals.push('Zvýšená negativita / skeptický tón');
      toxicityScore = Math.max(toxicityScore, 64);
    }
  }

  if (/https?:\/\//i.test(sanitized) && !spamSignals.some((s) => s.includes('Externí'))) {
    spamSignals.push('Obsahuje cizí URL odkaz');
    toxicityScore = Math.max(toxicityScore, 48);
  }

  let action: CommentMultiCoreAnalysis['shieldCore']['action'] = 'allow';
  let complianceNote = 'Bezpečný komentář: bez PII úniků, bez injekce a v souladu s brand-safety.';

  if (injectionAttempt || toxicityScore >= 82) {
    action = 'quarantine';
    complianceNote = injectionAttempt
      ? 'KRITICKÉ BLOKOVÁNÍ: Detekován pokus o Prompt Injection / extrakci tajných dat. Karanténa aktivována.'
      : 'BLOKOVÁNÍ SPAMU: Phishingový nebo kryptospam vzorec izolován v karanténě.';
  } else if (toxicityScore >= 50) {
    if (config.trollShieldMode === 'strict_quarantine') {
      action = 'quarantine';
      complianceNote = 'Přísný Shield režim: toxický komentář přesunut do karantény.';
    } else {
      action = 'neutralize_wit';
      complianceNote = 'Aikido Shield aktivován: skeptik bude odzbrojen věcnými daty a šarmem bez eskalace.';
    }
  }

  return {
    toxicityScore,
    injectionAttempt,
    spamSignals,
    action,
    complianceNote,
  };
}

export function runIntentSentimentCore(
  commentText: string,
  likesCount: number,
  shieldCore: CommentMultiCoreAnalysis['shieldCore']
): CommentMultiCoreAnalysis['intentCore'] {
  const lower = commentText.toLowerCase();
  const detectedKeywords = extractKeywords(commentText);

  let intent: CommentIntent = 'question';
  let sentimentScore = 20;
  let urgency: CommentMultiCoreAnalysis['intentCore']['urgency'] = 'medium';
  let conversionProbability = 35;

  if (shieldCore.action === 'quarantine' || shieldCore.toxicityScore >= 82) {
    intent = 'troll_spam';
    sentimentScore = -85;
    urgency = shieldCore.injectionAttempt ? 'critical' : 'low';
    conversionProbability = 0;
  } else if (COLLAB_PATTERNS.some((rx) => rx.test(lower))) {
    intent = 'collab';
    sentimentScore = 68;
    urgency = 'high';
    conversionProbability = 78;
  } else if (HOT_LEAD_PATTERNS.some((rx) => rx.test(lower))) {
    intent = 'hot_lead';
    sentimentScore = 76;
    urgency = 'critical';
    conversionProbability = 89;
  } else if (OBJECTION_PATTERNS.some((rx) => rx.test(lower)) || shieldCore.toxicityScore >= 50) {
    intent = 'objection';
    sentimentScore = -42;
    urgency = 'high';
    conversionProbability = 28;
  } else if (QUESTION_PATTERNS.some((rx) => rx.test(lower))) {
    intent = 'question';
    sentimentScore = 32;
    urgency = 'high';
    conversionProbability = 54;
  } else if (PRAISE_PATTERNS.some((rx) => rx.test(lower))) {
    intent = 'praise';
    sentimentScore = 88;
    urgency = 'low';
    conversionProbability = 42;
  }

  const likesFactor = Math.min(1.8, 1 + Math.log10(Math.max(1, likesCount + 1)) * 0.45);
  const viralMultiplier = Math.round(
    Math.min(3.5, Math.max(0.5, likesFactor * (intent === 'hot_lead' || intent === 'objection' ? 1.35 : 1.05))) * 10
  ) / 10;

  return {
    intent,
    sentimentScore,
    urgency,
    viralMultiplier,
    conversionProbability,
    detectedKeywords,
  };
}

export function runLeadConversionCore(
  comment: Pick<SocialComment, 'videoTitle' | 'platform' | 'authorHandle' | 'text'>,
  intentCore: CommentMultiCoreAnalysis['intentCore'],
  config: CommentAutopilotConfig = DEFAULT_COMMENT_AUTOPILOT_CONFIG
): CommentMultiCoreAnalysis['conversionCore'] {
  const kw = config.dmKeyword || 'BLUEPRINT';

  if (intentCore.intent === 'hot_lead') {
    return {
      leadDetected: true,
      funnelStage: 'hot_checkout',
      dmTriggerKeyword: kw,
      suggestedOpportunityTitle: `Inbound Lead (${comment.platform}): ${comment.authorHandle} · ${comment.videoTitle.slice(0, 34)}`,
      estimatedValueCzk: 4900,
    };
  }

  if (intentCore.intent === 'collab') {
    return {
      leadDetected: true,
      funnelStage: 'consideration',
      dmTriggerKeyword: 'B2B_PARTNER',
      suggestedOpportunityTitle: `B2B Spolupráce (${comment.platform}): ${comment.authorHandle}`,
      estimatedValueCzk: 24500,
    };
  }

  if (intentCore.intent === 'question' && intentCore.conversionProbability >= 50) {
    return {
      leadDetected: true,
      funnelStage: 'consideration',
      dmTriggerKeyword: kw,
      suggestedOpportunityTitle: `Technický zájemce (${comment.platform}): ${comment.authorHandle}`,
      estimatedValueCzk: 2900,
    };
  }

  return {
    leadDetected: false,
    funnelStage: intentCore.intent === 'praise' ? 'awareness' : 'none',
  };
}

export function runVoiceResponseCore(
  comment: Pick<SocialComment, 'videoTitle' | 'platform' | 'authorHandle' | 'text'>,
  intentCore: CommentMultiCoreAnalysis['intentCore'],
  shieldCore: CommentMultiCoreAnalysis['shieldCore'],
  conversionCore: CommentMultiCoreAnalysis['conversionCore'],
  config: CommentAutopilotConfig = DEFAULT_COMMENT_AUTOPILOT_CONFIG
): CommentMultiCoreAnalysis['voiceCore'] {
  const handle = comment.authorHandle.startsWith('@') ? comment.authorHandle : `@${comment.authorHandle}`;
  const kw = conversionCore.dmTriggerKeyword || config.dmKeyword || 'BLUEPRINT';
  const shortTopic = comment.videoTitle.split(/[(:|—]/)[0].trim().slice(0, 44);
  const personaLabel = VOICE_PERSONA_LABELS[config.voicePersona];

  let variants: CommentReplyVariant[] = [];

  if (shieldCore.action === 'quarantine') {
    variants = [
      {
        id: 'var-shield-1',
        strategy: 'witty_shield',
        label: 'Karanténa · Tichá izolace',
        toneBadge: 'AUTO-BLOCK',
        replyText: `[SYSTÉMOVÁ KARANTÉNA] Komentář od ${handle} byl automaticky skryt (důvod: ${shieldCore.spamSignals[0] || 'bezpečnostní pravidlo'}). Veřejná odpověď se neodesílá.`,
        predictedCtrLift: '0 % (Chráněná konverze)',
        recommendedCta: 'Skrýt & nahlásit jako spam',
      },
      {
        id: 'var-shield-2',
        strategy: 'authority_guide',
        label: 'Bezpečná systémová poznámka',
        toneBadge: 'COMPLIANCE',
        replyText: `${handle} Díky za zprávu — externí odkazy a systémové dotazy v komentářích automaticky filtrujeme kvůli bezpečnosti komunity.`,
        predictedCtrLift: '+4 % důvěra publika',
        recommendedCta: 'Bez odkazu',
      },
    ];
  } else if (intentCore.intent === 'hot_lead') {
    variants = [
      {
        id: 'var-hormozi-1',
        strategy: 'hormozi_hook',
        label: 'Hormozi Value Hook',
        toneBadge: 'HIGH CONVERSION',
        replyText: `${handle} Přesně tohle ušetří 6 hodin práce týdně. Celou šablonu pro "${shortTopic}" máme připravenou v balíčku — napiš nám DM "${kw}" a systém ti ji hned pošle! 🔥`,
        predictedCtrLift: '+34 % DM konverze',
        recommendedCta: `DM trigger "${kw}"`,
      },
      {
        id: 'var-sales-2',
        strategy: 'sales_funnel',
        label: 'Přímý Checkout Funnel',
        toneBadge: 'DIRECT ROI',
        replyText: `${handle} Skvělé načasování — odkaz na okamžité stažení šablony a video návodu najdeš v připnutém komentáři nebo v našem bio profilu pod heslem "${kw}". 🚀`,
        predictedCtrLift: '+28 % proklik do bio',
        recommendedCta: 'Bio link / připnutý komentář',
      },
      {
        id: 'var-auth-3',
        strategy: 'authority_guide',
        label: 'Expertní průvodce + CTA',
        toneBadge: 'AUTHORITY',
        replyText: `${handle} Jasně! Používáme 4pilířovou strukturu (Subjekt → Styl → Kamera → Časový vývoj) + FFmpeg +faststart export. Kompletní preset posíláme obratem na heslo "${kw}".`,
        predictedCtrLift: '+21 % důvěryhodnost',
        recommendedCta: `Heslo "${kw}"`,
      },
      {
        id: 'var-wit-4',
        strategy: 'witty_shield',
        label: 'Krátká virální odpověď',
        toneBadge: 'PATTERN INTERRUPT',
        replyText: `${handle} Pošli "${kw}" do zpráv a zítra ráno už nemusíš stříhat ručně. 😉`,
        predictedCtrLift: '+19 % odpovědí ve vlákně',
        recommendedCta: 'Mikro-konverze',
      },
    ];
  } else if (intentCore.intent === 'collab') {
    variants = [
      {
        id: 'var-sales-1',
        strategy: 'sales_funnel',
        label: 'B2B Pipeline Akcelerátor',
        toneBadge: 'B2B DEAL',
        replyText: `${handle} Díky za oslovení! Rádi probereme B2B integraci nebo produkční balíček — napište nám zprávu s předmětem "${kw}" nebo na náš studio kontakt a domluvíme 15min call.`,
        predictedCtrLift: '+41 % B2B lead rate',
        recommendedCta: 'Domluvit B2B call',
      },
      {
        id: 'var-auth-2',
        strategy: 'authority_guide',
        label: 'Profesionální Brand Odpověď',
        toneBadge: 'EXECUTIVE',
        replyText: `${handle} Velmi zajímavý návrh ke spolupráci na projektu "${shortTopic}". Pošlete prosím stručný brief do DM, náš Growth tým na to hned naváže.`,
        predictedCtrLift: '+30 % kvalifikace',
        recommendedCta: 'Brief do DM',
      },
      {
        id: 'var-hormozi-3',
        strategy: 'hormozi_hook',
        label: 'Value-First Partnerství',
        toneBadge: 'WIN-WIN',
        replyText: `${handle} Jsme pro projekty, které doručují měřitelný výsledek. Napište do DM "${kw}" s odhadovaným objemem a pošleme case study s ROI.`,
        predictedCtrLift: '+25 % konverze',
        recommendedCta: 'Case study bridge',
      },
      {
        id: 'var-wit-4',
        strategy: 'witty_shield',
        label: 'Rychlý kontakt',
        toneBadge: 'FAST TRACK',
        replyText: `${handle} DM otevřeno — pojďme z toho udělat virální case study! 🚀`,
        predictedCtrLift: '+16 % rychlá reakce',
        recommendedCta: 'Přímý DM',
      },
    ];
  } else if (intentCore.intent === 'objection') {
    variants = [
      {
        id: 'var-wit-1',
        strategy: 'witty_shield',
        label: 'Aikido De-eskalace s fakty',
        toneBadge: 'TROLL-SHIELD',
        replyText: `${handle} Férová skepse — taky jsme tomu nevěřili, dokud nám lokální render pipeline nezkrátila střih z 3 hodin na 14 sekund. Mrkni na čas 0:04 ve videu, tam běží živý výstup bez filtru.`,
        predictedCtrLift: '+26 % pozitivní obrat',
        recommendedCta: 'Obrátit skeptika na sledování',
      },
      {
        id: 'var-auth-2',
        strategy: 'authority_guide',
        label: 'Transparentní důkaz & vysvětlení',
        toneBadge: 'PROOF',
        replyText: `${handle} Rozumíme pohledu — důležité je vědět, že vše renderujeme v nativním H.264/AAC MP4 se SHA-256 kontrolou. Pokud chceš vidět surový skript, napiš "${kw}".`,
        predictedCtrLift: '+22 % důvěra',
        recommendedCta: 'Nabídnout technický důkaz',
      },
      {
        id: 'var-hormozi-3',
        strategy: 'hormozi_hook',
        label: 'Value Pivot',
        toneBadge: 'VALUE PIVOT',
        replyText: `${handle} Přesně tuhle námitku jsme řešili v příštím díle — kdyby to nefungovalo v praxi, nedrží to přes 114 % retence. Kterou konkrétní část chceš otestovat?`,
        predictedCtrLift: '+18 % diskuze = dosah',
        recommendedCta: 'Zvýšit dwell time ve vlákně',
      },
      {
        id: 'var-sales-4',
        strategy: 'sales_funnel',
        label: 'Zero-Risk Pozvánka',
        toneBadge: 'ZERO-RISK',
        replyText: `${handle} Nejlepší test je vlastní rukou — vyzkoušej si bezplatný lokální režim přes heslo "${kw}" a dej vědět reálný výsledek.`,
        predictedCtrLift: '+15 % konverze skeptiků',
        recommendedCta: 'Bezplatný test',
      },
    ];
  } else if (intentCore.intent === 'praise') {
    variants = [
      {
        id: 'var-hormozi-1',
        strategy: 'hormozi_hook',
        label: 'Díky + Pokračovací Hook',
        toneBadge: 'RETENTION BOOST',
        replyText: `${handle} Díky moc! 🔥 Jestli se ti líbilo "${shortTopic}", v dalším díle jdeme ještě hlouběji do monetizace — sleduj a napiš "${kw}" pro bonusový checklist.`,
        predictedCtrLift: '+24 % follow + komentáře',
        recommendedCta: 'Konvertovat fanouška do funnelu',
      },
      {
        id: 'var-wit-2',
        strategy: 'witty_shield',
        label: 'Autentický Creator Vibe',
        toneBadge: 'COMMUNITY',
        replyText: `${handle} Velký respekt, přesně pro takové tvůrce to ladíme! Co máme rozebrat v příštím videu? 🚀`,
        predictedCtrLift: '+20 % opakované komentáře',
        recommendedCta: 'Otázka pro algoritmus',
      },
      {
        id: 'var-auth-3',
        strategy: 'authority_guide',
        label: 'Sdílení know-how',
        toneBadge: 'EDUCATOR',
        replyText: `${handle} Moc si toho vážíme! Která část workflow ti v praxi ušetří nejvíc času?`,
        predictedCtrLift: '+17 % engagement',
        recommendedCta: 'Zvýšení komentářového skóre',
      },
      {
        id: 'var-sales-4',
        strategy: 'sales_funnel',
        label: 'Tichý Lead Magnet',
        toneBadge: 'SOFT FUNNEL',
        replyText: `${handle} Jsme rádi, že to dává smysl! Kompletní šablony k tématu najdeš přes heslo "${kw}" v připnutém komentáři.`,
        predictedCtrLift: '+19 % bio proklik',
        recommendedCta: 'Soft bridge do bio',
      },
    ];
  } else {
    // Question (default high-engagement)
    variants = [
      {
        id: 'var-auth-1',
        strategy: 'authority_guide',
        label: 'Expertní odpověď + Řešení',
        toneBadge: 'EDUCATOR #1',
        replyText: `${handle} Skvělá otázka! U "${shortTopic}" kombinujeme 4pilířový strukturovaný prompt (Subjekt, Styl, Kamera, Časové beaty) a FFmpeg H.264 render. Chceš kompletní šablonu? Napiš "${kw}".`,
        predictedCtrLift: '+31 % odpověď → lead',
        recommendedCta: `DM "${kw}"`,
      },
      {
        id: 'var-hormozi-2',
        strategy: 'hormozi_hook',
        label: 'Hormozi Rychlá Hodnota',
        toneBadge: 'HIGH VALUE',
        replyText: `${handle} Krátká odpověď: ano, běží to plně automaticky i bez placených video API díky lokálnímu enginu. Napiš "${kw}" a pošleme ti přesný postup krok za krokem! ⚡`,
        predictedCtrLift: '+29 % DM konverze',
        recommendedCta: `Komentář "${kw}"`,
      },
      {
        id: 'var-sales-3',
        strategy: 'sales_funnel',
        label: 'Bridge na Video Blueprint',
        toneBadge: 'FUNNEL',
        replyText: `${handle} Celé nastavení jsme zabalili do 1-klik šablony pro tvůrce — napiš pod video "${kw}" a dostaneš odkaz s ukázkou. 🎯`,
        predictedCtrLift: '+24 % proklik',
        recommendedCta: 'Lead magnet trigger',
      },
      {
        id: 'var-wit-4',
        strategy: 'witty_shield',
        label: 'Konverzační micro-hook',
        toneBadge: 'ALGORITHMIC BOOST',
        replyText: `${handle} To nejlepší je, že to zvládneš nastavit pod 3 minuty. Testuješ to pro YouTube nebo TikTok?`,
        predictedCtrLift: '+22 % hloubka vlákna',
        recommendedCta: 'Vyvolat 2. reakci uživatele',
      },
    ];
  }

  const pinnedCommentSuggestion = `📌 CHCEŠ CELÝ SYSTÉM PRO "${shortTopic.toUpperCase()}"? Napiš do komentáře "${kw}" nebo mrkni na odkaz v bio — pošleme ti hotovou šablonu + 4pilířový prompt zdarma! 🚀`;

  return {
    voicePersonaLabel: personaLabel,
    replyVariants: variants,
    pinnedCommentSuggestion,
  };
}

export function analyzeCommentSync(
  comment: Pick<SocialComment, 'videoTitle' | 'platform' | 'authorHandle' | 'text' | 'likesCount'>,
  config: CommentAutopilotConfig = DEFAULT_COMMENT_AUTOPILOT_CONFIG
): CommentMultiCoreAnalysis {
  const start = Date.now();
  const shieldCore = runTrollShieldCore(comment.text, config);
  const intentCore = runIntentSentimentCore(comment.text, comment.likesCount || 0, shieldCore);
  const conversionCore = runLeadConversionCore(comment, intentCore, config);
  const voiceCore = runVoiceResponseCore(comment, intentCore, shieldCore, conversionCore, config);

  const weights =
    shieldCore.action === 'quarantine'
      ? { intent: 0.2, voice: 0.1, shield: 0.6, conversion: 0.1 }
      : intentCore.intent === 'hot_lead' || intentCore.intent === 'collab'
        ? { intent: 0.3, voice: 0.25, shield: 0.1, conversion: 0.35 }
        : { intent: 0.3, voice: 0.35, shield: 0.15, conversion: 0.2 };

  const confidenceScore =
    shieldCore.injectionAttempt
      ? 98
      : intentCore.intent === 'hot_lead'
        ? 93
        : intentCore.intent === 'praise'
          ? 91
          : 87;

  const reasoningSummary =
    shieldCore.action === 'quarantine'
      ? `Core 3 (Troll-Shield) zablokoval zprávu (${shieldCore.toxicityScore}/100) dříve, než se dostala do Core 2 konverzace.`
      : conversionCore.leadDetected
        ? `Core 1 detekoval záměr "${intentCore.intent}" (${intentCore.conversionProbability}% šance konverze). Core 4 připravil DM trigger "${conversionCore.dmTriggerKeyword}" a Core 2 vygeneroval 4 varianty odpovědí.`
        : `Core 1 vyhodnotil sentiment ${intentCore.sentimentScore > 0 ? '+' : ''}${intentCore.sentimentScore} s virovým násobitelem ${intentCore.viralMultiplier}×. Core 2 navrhl 4 strategie odpovědi.`;

  return {
    intentCore,
    voiceCore,
    shieldCore,
    conversionCore,
    consensusCore: {
      engineUsed: 'nexus-godtier-5core-v2',
      confidenceScore,
      coreWeights: weights,
      reasoningSummary,
      executionMs: Math.max(2, Date.now() - start),
    },
  };
}

export async function analyzeCommentWithMultiCore(
  comment: Pick<SocialComment, 'videoTitle' | 'platform' | 'authorHandle' | 'text' | 'likesCount'>,
  config: CommentAutopilotConfig = DEFAULT_COMMENT_AUTOPILOT_CONFIG,
  options?: {
    apiKeyOverride?: string;
    generateContentOverride?: (args: {
      model: string;
      contents: string;
      systemInstruction: string;
    }) => Promise<string>;
  }
): Promise<CommentMultiCoreAnalysis> {
  const start = Date.now();
  const baseAnalysis = analyzeCommentSync(comment, config);

  // Never allow Gemini LLM to process quarantined prompt-injection comments
  if (baseAnalysis.shieldCore.injectionAttempt || baseAnalysis.shieldCore.action === 'quarantine') {
    return baseAnalysis;
  }

  const isTestEnv =
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.NODE_TEST_CONTEXT) ||
    process.argv.some((a) => a === '--test');
  const apiKey = options?.apiKeyOverride ?? process.env.GEMINI_API_KEY;
  const canUseGemini =
    Boolean(options?.generateContentOverride) ||
    (!isTestEnv && Boolean(apiKey && apiKey.trim() && apiKey !== 'MY_GEMINI_API_KEY'));

  if (!canUseGemini) {
    return baseAnalysis;
  }

  const systemInstruction = [
    'Jsi NEXUS Comment Intelligence Swarm (Core 2 Voice Architect + Core 5 Consensus).',
    'Odpovídej VÝHRADNĚ validním JSON objektem v češtině.',
    `Persona: ${VOICE_PERSONA_LABELS[config.voicePersona]}.`,
    `CTA můstek značky: ${config.brandCtaBridge}.`,
    'Zachovej profesionální, stručný, úderný tón bez halucinovaných garancí peněz.',
  ].join(' ');

  const safeComment = redactPiiLocal(comment.text);
  const prompt = [
    `Video: ${comment.videoTitle} (${comment.platform})`,
    `Autor: ${comment.authorHandle}`,
    `Komentář diváka: "${safeComment}"`,
    `Detekovaný záměr Core 1: ${baseAnalysis.intentCore.intent}, sentiment ${baseAnalysis.intentCore.sentimentScore}`,
    `Navrhni vylepšenou odpověď pro strategie hormozi_hook a authority_guide + připnutý komentář.`,
  ].join('\n');

  try {
    let rawJson = '';
    if (options?.generateContentOverride) {
      rawJson = await options.generateContentOverride({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        systemInstruction,
      });
    } else if (apiKey) {
      const ai = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hormoziReply: { type: Type.STRING },
              authorityReply: { type: Type.STRING },
              pinnedSuggestion: { type: Type.STRING },
              reasoningSummary: { type: Type.STRING },
            },
          },
        },
      });
      rawJson = (response.text ?? '').trim();
    }

    if (rawJson) {
      const parsed = JSON.parse(rawJson) as {
        hormoziReply?: string;
        authorityReply?: string;
        pinnedSuggestion?: string;
        reasoningSummary?: string;
      };

      const nextVariants = baseAnalysis.voiceCore.replyVariants.map((v) => {
        if (v.strategy === 'hormozi_hook' && parsed.hormoziReply?.trim()) {
          return { ...v, replyText: sanitizeOutputLocal(parsed.hormoziReply.trim()) };
        }
        if (v.strategy === 'authority_guide' && parsed.authorityReply?.trim()) {
          return { ...v, replyText: sanitizeOutputLocal(parsed.authorityReply.trim()) };
        }
        return v;
      });

      return {
        ...baseAnalysis,
        voiceCore: {
          ...baseAnalysis.voiceCore,
          replyVariants: nextVariants,
          pinnedCommentSuggestion: parsed.pinnedSuggestion?.trim()
            ? sanitizeOutputLocal(parsed.pinnedSuggestion.trim())
            : baseAnalysis.voiceCore.pinnedCommentSuggestion,
        },
        consensusCore: {
          ...baseAnalysis.consensusCore,
          engineUsed: 'gemini-4-hydrogen+5core-swarm',
          confidenceScore: Math.min(99, baseAnalysis.consensusCore.confidenceScore + 4),
          reasoningSummary: parsed.reasoningSummary?.trim()
            ? sanitizeOutputLocal(parsed.reasoningSummary.trim())
            : baseAnalysis.consensusCore.reasoningSummary,
          executionMs: Math.max(5, Date.now() - start),
        },
      };
    }
  } catch {
    // Seamless deterministic 5-core fallback when Gemini endpoint is offline or throttled
  }

  return baseAnalysis;
}

export function pickBestReplyStrategy(
  analysis: CommentMultiCoreAnalysis,
  preferredStrategy?: CommentReplyStrategy
): CommentReplyVariant | undefined {
  if (preferredStrategy) {
    const exact = analysis.voiceCore.replyVariants.find((v) => v.strategy === preferredStrategy);
    if (exact) return exact;
  }
  return analysis.voiceCore.replyVariants[0];
}

export function generatePinnedCommentPack(params: {
  videoTitle: string;
  platform?: VideoSharingPlatform;
  dmKeyword?: string;
  ctaGoal?: string;
}): PinnedCommentPack {
  const title = params.videoTitle.trim() || 'AI Video Produkce 2026';
  const platform: VideoSharingPlatform = params.platform || 'YouTube';
  const kw = (params.dmKeyword || 'BLUEPRINT').trim().toUpperCase();
  const shortTitle = title.split(/[(:|—]/)[0].trim().slice(0, 46);

  const pinnedText =
    platform === 'TikTok'
      ? `📌 Chceš šablonu pro "${shortTitle}"? Napiš do komentáře "${kw}" 👇 Pošleme ti hotový preset + 4pilířový prompt do zpráv!`
      : platform === 'Instagram Reels'
        ? `🔥 Napiš "${kw}" do komentáře a náš AI agent ti obratem do DM pošle kompletní návod + šablonu pro "${shortTitle}"!`
        : `📌 KOMPLETNÍ BALÍČEK K VIDEU "${shortTitle.toUpperCase()}": Napiš "${kw}" do komentáře nebo klikni na připnutý odkaz v popisku a získej hotový blueprint + skripty zdarma. 🚀`;

  const abAlternativeText = `⚡ Kterou část z "${shortTitle}" chceš nasadit jako první? Napiš číslo 1–3 do komentáře (pro šablonu přidej heslo "${kw}").`;

  return {
    videoTitle: title,
    platform,
    pinnedText,
    dmTriggerKeyword: kw,
    abAlternativeText,
    predictedEngagementBoost: platform === 'YouTube' ? '+38 % CTR do popisku' : '+44 % DM konverzí',
  };
}

export function computeCommentKpis(comments: SocialComment[]): CommentSwarmKpis {
  const totalComments = comments.length;
  const pendingCount = comments.filter((c) => c.status === 'pending' || c.status === 'ai_drafted').length;
  const repliedCount = comments.filter(
    (c) => c.status === 'published_reply' || c.status === 'auto_replied' || c.status === 'escalated_lead'
  ).length;
  const hotLeadsCount = comments.filter(
    (c) =>
      c.multiCoreAnalysis.intentCore.intent === 'hot_lead' ||
      c.multiCoreAnalysis.intentCore.intent === 'collab' ||
      c.multiCoreAnalysis.conversionCore.leadDetected
  ).length;
  const blockedSpamCount = comments.filter(
    (c) => c.status === 'shield_blocked' || c.multiCoreAnalysis.shieldCore.action === 'quarantine'
  ).length;
  const avgSentimentScore =
    totalComments > 0
      ? Math.round(
          comments.reduce((acc, c) => acc + c.multiCoreAnalysis.intentCore.sentimentScore, 0) / totalComments
        )
      : 0;
  const unlockedCrmValueCzk = comments.reduce(
    (acc, c) => acc + (c.multiCoreAnalysis.conversionCore.estimatedValueCzk || 0),
    0
  );

  return {
    totalComments,
    pendingCount,
    repliedCount,
    hotLeadsCount,
    blockedSpamCount,
    avgSentimentScore,
    unlockedCrmValueCzk,
  };
}
