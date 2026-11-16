/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Agent,
  Opportunity,
  Activity,
  MemoryRecord,
  Message,
  Thread,
  BoardroomSession,
  FactoryAsset,
  RunTrace,
  EvalResult,
  SystemPerformance,
  SocialIntegration,
  PublishTask,
  UserVideoTemplate,
  AnalyticsData,
  WorkspaceAccount,
  TeamMember,
  VideoCreativeBrief,
  OpenGenModelSpec,
  OpenGenCreditsState,
} from '../types/nexus.ts';
import os from 'node:os';
import { getDefaultPermissionsForRole } from './runtime/rbac.ts';
import { deriveContentRecommendations } from './runtime/analyticsInsights.ts';
import { MoviePyCompiler } from './runtime/moviepy.ts';
import { MediaRenderer } from './runtime/mediaRenderer.ts';

class NexusDatabase {
  public agents: Agent[] = [];
  public opportunities: Opportunity[] = [];
  public activities: Activity[] = [];
  public memories: MemoryRecord[] = [];
  public threads: Thread[] = [];
  public messages: Map<string, Message[]> = new Map();
  public boardroomSessions: BoardroomSession[] = [];
  public factoryAssets: FactoryAsset[] = [];
  public runs: Map<string, RunTrace> = new Map();
  public evalResults: EvalResult[] = [];
  public socialIntegrations: SocialIntegration[] = [];
  public publishTasks: PublishTask[] = [];
  public userTemplates: UserVideoTemplate[] = [];
  public analyticsData!: AnalyticsData;
  public accounts: WorkspaceAccount[] = [];
  public activeAccountId: string = 'acc-main';
  public teamMembers: TeamMember[] = [];
  public currentActorId: string = 'usr-admin-1';
  public idempotencyCache: Map<string, { result: any; timestamp: number }> = new Map();
  public circuitBreakers: Map<string, { failures: number; lastFailure: number; openUntil: number }> = new Map();
  public videoBriefDrafts: Map<string, Partial<VideoCreativeBrief>> = new Map();
  public isSystemPaused: boolean = false;
  public totalCzkBudgetSpent: number = 412.5;
  public dailyCzkBudgetLimit: number = 5000.0;
  public activeJobQueueCount: number = 1;
  public queuedJobsCount: number = 2;
  public openGenModels: OpenGenModelSpec[] = [];
  public openGenCredits: OpenGenCreditsState = {
    available: 350,
    monthlyQuota: 500,
    usedThisPeriod: 150,
    extraCredits: 50,
    plan: 'Creator Pro',
    expiresAt: new Date(Date.now() + 86400000 * 24).toISOString(),
  };
  private lastCpuSample: { idle: number; total: number } | null = null;
  private lastPerfTickAt: number = Date.now();
  private lastLoopLagMs: number = 1.2;

  constructor() {
    this.seed();
  }

  public getCurrentActor(): TeamMember | undefined {
    return this.teamMembers.find((m) => m.id === this.currentActorId) || this.teamMembers[0];
  }

  public seed(): void {
    if (this.agents.length > 0) return;

    // 16 Agents seeded according to specification
    const rawAgents: Array<Omit<Agent, 'status'>> = [
      { id: 'agent-ceo', name: 'CEO Agent', role: 'Strategie', focus: 'Exekutivní řízení, vize a alokace kapitálu', confidence: 94, tasks: 42, avatarIcon: 'Crown' },
      { id: 'agent-cfo', name: 'CFO Agent', role: 'Finance', focus: 'Cashflow, marže, jednotková ekonomika a ROI', confidence: 91, tasks: 38, avatarIcon: 'DollarSign' },
      { id: 'agent-coo', name: 'COO Agent', role: 'Provoz', focus: 'Procesní kapacity, orchestrace a odstranění úzkých hrdel', confidence: 89, tasks: 31, avatarIcon: 'Settings' },
      { id: 'agent-cto', name: 'CTO Agent', role: 'Technika', focus: 'Architektura systémů, spolehlivost API a bezpečnost', confidence: 92, tasks: 35, avatarIcon: 'Cpu' },
      { id: 'agent-cmo', name: 'CMO Agent', role: 'Marketing', focus: 'Akvizice, retention, značka a virální distribuce', confidence: 88, tasks: 29, avatarIcon: 'Megaphone' },
      { id: 'agent-video', name: 'Video Agent', role: 'Video Factory', focus: 'YouTube Shorts střih, retence, humorný timing a MoviePy automatizace', confidence: 93, tasks: 40, avatarIcon: 'Video' },
      { id: 'agent-visual', name: 'Visual Agent', role: 'Vizuál', focus: 'Miniatury, vizuální hooky, kinetická typografie a brand pack', confidence: 87, tasks: 24, avatarIcon: 'Image' },
      { id: 'agent-affiliate', name: 'Affiliate Agent', role: 'Affiliate', focus: 'Provizní programy, partnerské můstky a konverze', confidence: 86, tasks: 27, avatarIcon: 'Share2' },
      { id: 'agent-seo', name: 'SEO Agent', role: 'SEO', focus: 'Vyhledávací záměr na YouTube a Google, metadata a indexace', confidence: 84, tasks: 22, avatarIcon: 'Search' },
      { id: 'agent-trend', name: 'Trend Agent', role: 'Trendy', focus: 'Real-time monitoring sociálních signálů a breakout témat', confidence: 89, tasks: 33, avatarIcon: 'TrendingUp' },
      { id: 'agent-research', name: 'Research Agent', role: 'Výzkum', focus: 'Konkurenční rozbory, benchmarky a fact-checking', confidence: 83, tasks: 19, avatarIcon: 'FileSearch' },
      { id: 'agent-analytics', name: 'Analytics Agent', role: 'Data', focus: 'Konverzní poměry, retence diváků a atribuční modely', confidence: 90, tasks: 30, avatarIcon: 'BarChart3' },
      { id: 'agent-automation', name: 'Automation Agent', role: 'Automatizace', focus: 'Webhooky, MoviePy render pipelines a bezobslužný provoz', confidence: 92, tasks: 36, avatarIcon: 'Zap' },
      { id: 'agent-revenue', name: 'Revenue Agent', role: 'Výnosy', focus: 'Cenotvorba, monetizační kaskády a upsell architektura', confidence: 88, tasks: 28, avatarIcon: 'Coins' },
      { id: 'agent-knowledge', name: 'Knowledge Agent', role: 'Znalosti', focus: 'Sémantická paměť, dokumentace a korporátní kontext', confidence: 85, tasks: 16, avatarIcon: 'BookOpen' },
      { id: 'agent-experiment', name: 'Experiment Agent', role: 'Experimenty', focus: 'A/B testování hooků, miniatury a statistická inference', confidence: 82, tasks: 14, avatarIcon: 'FlaskConical' },
    ];

    this.agents = rawAgents.map((a) => ({
      ...a,
      status: a.tasks > 25 ? 'active' : 'paused',
    }));

    // 6 Opportunities seeded
    this.opportunities = [
      {
        id: 'opp-1',
        title: 'Affiliate funnel pro AI nástroje',
        channel: 'Affiliate',
        projectionCzk: 18400,
        confidence: 86,
        status: 'active',
        updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
      {
        id: 'opp-2',
        title: 'TikTok série pro lokální e-shop',
        channel: 'TikTok',
        projectionCzk: 12000,
        confidence: 79,
        status: 'active',
        updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      },
      {
        id: 'opp-3',
        title: 'YouTube Shorts na poptávkové klíčovky',
        channel: 'YouTube',
        projectionCzk: 9600,
        confidence: 74,
        status: 'new',
        updatedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
      },
      {
        id: 'opp-4',
        title: 'Remarketingový balík pro SaaS',
        channel: 'Meta Ads',
        projectionCzk: 15200,
        confidence: 81,
        status: 'new',
        updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      },
      {
        id: 'opp-5',
        title: 'Newsletter monetizace',
        channel: 'E-mail',
        projectionCzk: 7300,
        confidence: 68,
        status: 'new',
        updatedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
      },
      {
        id: 'opp-6',
        title: 'Digitální produkt: šablony promptů',
        channel: 'Produkt',
        projectionCzk: 6100,
        confidence: 72,
        status: 'won',
        updatedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
    ];

    // 4 Initial Activities
    this.activities = [
      {
        id: 'act-1',
        title: 'Vygenerován YouTube Shorts scénář #402',
        description: 'Video Agent dokončil virální scénář pro téma "5 AI triků, které vám ušetří 4 hodiny denně".',
        agent: 'Video Agent',
        timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        type: 'action',
      },
      {
        id: 'act-2',
        title: 'Synchronizována analytika YouTube, TikTok & Reels',
        description: 'Analytics Agent načetl nové metriky zapojení (148 200 zhlédnutí, 12 430 lajků, 842 komentářů).',
        agent: 'Analytics Agent',
        timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
        type: 'metric',
      },
      {
        id: 'act-3',
        title: 'Boardroom konsenzus k cenové strategii',
        description: 'CFO a Revenue Agent schválili dynamickou cenotvorbu pro digitální šablony promptů.',
        agent: 'CFO Agent',
        timestamp: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
        type: 'decision',
      },
      {
        id: 'act-4',
        title: 'Systémový audit paměti dokončen',
        description: 'Knowledge Agent zaindexoval 8 nových procedurálních workflow šablon do sémantické báze.',
        agent: 'Knowledge Agent',
        timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        type: 'system',
      },
    ];

    // Seed Initial Thread & Message
    const defaultThreadId = 'th-main-001';
    this.threads.push({
      id: defaultThreadId,
      title: 'NEO Primární Operační Řízení',
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      updatedAt: new Date().toISOString(),
      messagesCount: 1,
    });

    // Initial Factory Assets (prepare asset-001 first so chat message can embed it)
    const initialStoryboard = MoviePyCompiler.createViralStoryboard(
      'Jak jsem nechal AI vydělávat zatímco spím',
      '9:16'
    );
    const initialMoviePy = MoviePyCompiler.generatePythonScript(initialStoryboard);
    const seedAsset001: FactoryAsset = {
      id: 'asset-001',
      threadId: defaultThreadId,
      line: 'video',
      title: 'Jak jsem nechal AI vydělávat zatímco spím (a proč to skoro krachlo)',
      prompt: 'Jak jsem nechal AI vydělávat zatímco spím',
      body: 'Hook: "Myslíte si, že AI vám vydělá miliony za noc? Ukážu vám přesně, co se stalo v prvním týdnu..."\nRetence: Ukázka reálných čísel, selhání skriptu ve 3 ráno a vtipný obrat s affiliate linkem.\nCTA: "Celý kód a prompt workflow stahujte v odkazu v popisku."',
      meta: 'Formát: YouTube Shorts (9:16), 6s H.264 MP4 preview, humor/retence score 92/100',
      tags: ['YouTube', 'Shorts', 'Virální', 'Automatizace', 'MP4'],
      status: 'ready',
      mimeType: 'video/mp4',
      sizeBytes: 64500,
      durationSec: 6,
      resolution: '720x1280',
      filePath: MediaRenderer.getAssetFilePath(defaultThreadId, 'asset-001'),
      streamUrl: '/api/v1/assets/asset-001/stream',
      downloadUrl: '/api/v1/assets/asset-001/download',
      videoStoryboard: initialStoryboard,
      moviePyScript: initialMoviePy,
      createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
      dryRun: false,
    };

    const initialMessage: Message = {
      id: 'msg-init-001',
      threadId: defaultThreadId,
      role: 'assistant',
      content:
        'Jsem NEO, operační mozek NEXUS OS. Řekni mi cíl a já navrhnu cestu, sestavím workflow a rozdělím práci agentům. Níže máš ihned připravený referenční MP4 výstup z Media Vaultu.',
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      plan: [
        {
          id: 1,
          title: 'Strategická analýza cíle a monetizace',
          description: 'Identifikace poptávkových témat a vyčíslení potenciálu',
          status: 'completed',
          assignedAgent: 'CEO Agent',
        },
        {
          id: 2,
          title: 'Alokace specializovaných výrobních linek',
          description: 'Aktivace Video Agenta, Affiliate pipeline a MoviePy automatizace',
          status: 'in_progress',
          assignedAgent: 'Video Agent',
        },
        {
          id: 3,
          title: 'Exekuce a nasazení s měřením konverzí',
          description: 'Distribuce na YouTube/TikTok/Reels a sběr konverzních dat',
          status: 'pending',
          assignedAgent: 'Revenue Agent',
        },
      ],
      suggestions: [
        'Vytvoř 9s kyberpunk TikTok video o AI automatizaci faktur',
        'Vytvoř mi video',
        'Vytvoř 5 videí na TikTok',
        'Chci vydělat 50 000 Kč měsíčně',
        'Spusť AI boardroom',
        'Najdi affiliate příležitosti',
      ],
      agentNotes: [
        { agent: 'CEO Agent', note: 'Pipeline je připravena k okamžitému spuštění bez externích závislostí.' },
        { agent: 'Video Agent', note: 'FFmpeg H.264/AAC pipeline a MoviePy orchestrace jsou aktivní.' },
        { agent: 'MediaVault', note: 'Referenční MP4 asset-001 je připraven ke streamu i stažení.' },
      ],
      generatedAssets: [seedAsset001],
      confidence: 94,
    };

    this.messages.set(defaultThreadId, [initialMessage]);

    // Initial Memories
    this.memories = [
      {
        id: 'mem-1',
        kind: 'procedural',
        scope: 'business',
        content: 'Virální YouTube Shorts vyžadují hook v prvních 2.5 sekundách s vizuálním pattern interruptem každých 1.8 s.',
        importance: 0.95,
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        lastUsedAt: new Date().toISOString(),
        decayAt: new Date(Date.now() + 86400000 * 90).toISOString(),
      },
      {
        id: 'mem-2',
        kind: 'trend',
        scope: 'campaign',
        content: 'AI nástroje pro automatizaci kancelářské práce mají v ČR průměrné CPC o 40 % nižší než v US, ale konverzní poměr 3.8 %.',
        importance: 0.88,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        lastUsedAt: new Date().toISOString(),
        decayAt: new Date(Date.now() + 86400000 * 60).toISOString(),
      },
      {
        id: 'mem-3',
        kind: 'decision',
        scope: 'business',
        content: 'Boardroom rozhodl držet maximální délku YouTube Shorts na 42 sekundách pro maximalizaci míry dokoukání (>115 %).',
        importance: 0.92,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        lastUsedAt: new Date().toISOString(),
        decayAt: new Date(Date.now() + 86400000 * 120).toISOString(),
      },
      {
        id: 'mem-4',
        kind: 'semantic',
        scope: 'user',
        content: 'Cílová skupina preferuje humor, sebeironii a okamžitý praktický návod místo teoretického vysvětlování.',
        importance: 0.89,
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        lastUsedAt: new Date().toISOString(),
        decayAt: new Date(Date.now() + 86400000 * 90).toISOString(),
      },
    ];

    // Initial Factory Assets
    this.factoryAssets = [
      seedAsset001,
      {
        id: 'asset-002',
        threadId: defaultThreadId,
        line: 'ad',
        title: 'Hook: Přestaňte stříhat ručně | Headline: 1 klik = 5 virálních Shorts | CTA: Vyzkoušet pipeline zdarma',
        body: 'Kreativa zaměřená na úsporu 15 hodin týdně pro tvůrce obsahu. Žádné plané sliby, pouze konkrétní workflow krok za krokem.',
        meta: 'Formát: Meta Ads / IG Feed, 3 varianty hooku',
        tags: ['Meta Ads', 'Konverze', 'B2B'],
        status: 'ready',
        createdAt: new Date(Date.now() - 3600000 * 14).toISOString(),
      },
      {
        id: 'asset-003',
        threadId: defaultThreadId,
        line: 'funnel',
        title: 'Opt-in landing page: AI YouTube Blueprint 2026',
        body: 'Jednoduchá 1-page struktura s video náhledem, 3 sociálními důkazy, kalkulačkou projekce a okamžitým doručením na e-mail.',
        meta: 'Formát: Next-gen minimalistický funnel, konverzní cíl 24 %',
        tags: ['Landing Page', 'Opt-in', 'Lead Magnet'],
        status: 'ready',
        createdAt: new Date(Date.now() - 3600000 * 20).toISOString(),
      },
    ];

    // Materialize verified reference MP4 on disk in background
    MediaRenderer.ensureReferenceVideoFile(
      'asset-001',
      defaultThreadId,
      seedAsset001.title,
      '9:16'
    )
      .then((artifact) => {
        seedAsset001.sizeBytes = artifact.sizeBytes;
        seedAsset001.sha256 = artifact.sha256;
        seedAsset001.filePath = artifact.filePath;
        seedAsset001.status = 'ready';
      })
      .catch(() => {
        // Fallback ensured lazily on stream/download
      });

    // Seed Video Sharing Platforms (YouTube, TikTok, Instagram Reels) & CMS Integrations
    this.socialIntegrations = [
      {
        id: 'youtube_studio',
        name: 'YouTube Studio API',
        platformKey: 'YouTube',
        category: 'social_publisher',
        connected: true,
        accountEmail: 'bpcme66@gmail.com',
        handle: '@NexusStudioCZ',
        authMethod: 'OAuth 2.0',
        tokenExpiry: new Date(Date.now() + 86400000 * 28).toISOString(),
        status: 'active',
        icon: 'Youtube',
      },
      {
        id: 'tiktok_creator',
        name: 'TikTok Creator API',
        platformKey: 'TikTok',
        category: 'social_publisher',
        connected: true,
        accountEmail: 'bpcme66@gmail.com',
        handle: '@nexus.viral.lab',
        authMethod: 'OAuth 2.0',
        tokenExpiry: new Date(Date.now() + 86400000 * 21).toISOString(),
        status: 'active',
        icon: 'Music',
      },
      {
        id: 'instagram_reels',
        name: 'Instagram Reels API',
        platformKey: 'Instagram Reels',
        category: 'social_publisher',
        connected: true,
        accountEmail: 'bpcme66@gmail.com',
        handle: '@nexus.reels',
        authMethod: 'OAuth 2.0',
        tokenExpiry: new Date(Date.now() + 86400000 * 30).toISOString(),
        status: 'active',
        icon: 'Instagram',
      },
      {
        id: 'google_drive',
        name: 'Google Drive Cloud',
        platformKey: 'Storage',
        category: 'cloud_storage',
        connected: true,
        accountEmail: 'bpcme66@gmail.com',
        authMethod: 'OAuth 2.0',
        tokenExpiry: new Date(Date.now() + 86400000 * 60).toISOString(),
        status: 'active',
        icon: 'HardDrive',
      },
      {
        id: 'buffer',
        name: 'Buffer Multi-Channel',
        platformKey: 'CMS',
        category: 'cms',
        connected: true,
        accountEmail: 'bpcme66@gmail.com',
        authMethod: 'OAuth 2.0',
        tokenExpiry: new Date(Date.now() + 86400000 * 45).toISOString(),
        status: 'active',
        icon: 'Layers',
      },
      {
        id: 'dropbox',
        name: 'Dropbox Cloud Archive',
        platformKey: 'Storage',
        category: 'cloud_storage',
        connected: false,
        authMethod: 'API Key',
        status: 'disconnected',
        icon: 'Box',
      },
    ];

    // Seed Publish Tasks
    this.publishTasks = [
      {
        id: 'pub-001',
        assetId: 'asset-001',
        videoTitle: 'Jak jsem nechal AI vydělávat zatímco spím (a proč to skoro krachlo)',
        platforms: ['YouTube Studio API', 'TikTok Creator API', 'Instagram Reels API'],
        publishedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
        status: 'published',
        destinationUrl: 'https://youtube.com/shorts/nexus_402',
        metadata: {
          title: 'Jak jsem nechal AI vydělávat zatímco spím (a proč to skoro krachlo) #Shorts',
          description: 'Kompletní ukázka automatizace a MoviePy skriptu pro YouTube Shorts, TikTok a Reels.',
          tags: ['AI', 'Shorts', 'TikTok', 'Reels', 'Automatizace'],
          privacy: 'public',
        },
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      },
      {
        id: 'pub-002',
        assetId: 'asset-001',
        videoTitle: '5 AI triků, které vám ušetří 4 hodiny denně',
        platforms: ['YouTube Studio API', 'TikTok Creator API'],
        scheduledFor: new Date(Date.now() + 3600000 * 18).toISOString(),
        status: 'scheduled',
        metadata: {
          title: '5 AI triků, které vám ušetří 4 hodiny denně | Automatizace 2026',
          description: 'Přestaňte dělat rutinní úkoly ručně. Zde je 5 prověřených automatizací.',
          tags: ['Produktivita', 'AI2026', 'YouTubeShorts', 'TikTok'],
          privacy: 'public',
        },
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
    ];

    // Seed Comprehensive Video Styles & Templates Library
    this.userTemplates = [
      {
        id: 'tpl-tutorial-step',
        name: 'Krok-za-krokem Tutoriál (How-To)',
        category: 'tutorial',
        description: 'Přehledný výukový formát s číslovanými kroky, zvýrazněním obrazovky a jasnou strukturou pro maximální dobu sledování.',
        aspectRatio: '16:9',
        visualStyle: 'Clean Studio Slate',
        subtitleStyle: {
          font: 'Plus-Jakarta-Sans-Bold',
          color: '#f8fafc',
          highlightColor: '#38bdf8',
          fontSize: 48,
        },
        musicPreset: {
          beatType: 'Minimal Focus Lo-Fi',
          bpm: 96,
          sfxPack: 'Soft UI Click + Subtle Whoosh',
        },
        structureArchetype: 'Cíl výsledku → Prerekvizity → Kroky 1-3 → Častá chyba → Shrnutí',
        pacingNotes: 'Klidné tempo 140 slov/min, prostor pro čtení kódu a obrazovky.',
        scenesTemplate: [
          { durationSec: 5, visualPrompt: 'Ukázka hotového výsledku na obrazovce', patternInterrupt: 'Split-screen Před/Po', bRollKeyword: 'tutorial finished result' },
          { durationSec: 12, visualPrompt: 'Krok 1: Základní nastavení a nástroje', patternInterrupt: 'Číslovaný badge KROK 1', bRollKeyword: 'software setup clean' },
          { durationSec: 13, visualPrompt: 'Krok 2: Hlavní implementace v praxi', patternInterrupt: 'Zvětšení klíčové oblasti 150%', bRollKeyword: 'coding live walkthrough' },
          { durationSec: 7, visualPrompt: 'Krok 3: Testování a oprava časté chyby', patternInterrupt: 'Varovný banner POZOR', bRollKeyword: 'debugging checklist' },
          { durationSec: 5, visualPrompt: 'Závěrečná rekapitulace a odkaz na šablonu', patternInterrupt: 'Checklist animace', bRollKeyword: 'download guide cta' },
        ],
        isBuiltIn: true,
        createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
      },
      {
        id: 'tpl-vlog-creator',
        name: 'Creator Daily & Zákulisní Vlog',
        category: 'vlog',
        description: 'Autentický vypravěčský styl z pohledu tvůrce. Teplé tóny, dynamické přechody z ruky a osobní komentář.',
        aspectRatio: '9:16',
        visualStyle: 'Warm Documentary Film',
        subtitleStyle: {
          font: 'DM-Sans-Bold',
          color: '#fefce8',
          highlightColor: '#fb923c',
          fontSize: 58,
        },
        musicPreset: {
          beatType: 'Indie Acoustic Chill',
          bpm: 108,
          sfxPack: 'Camera Shutter + Tape Rewind + Ambient Room',
        },
        structureArchetype: 'Osobní moment → Denní výzva → Zlomový objev → Upřímný závěr',
        pacingNotes: 'Přirozený hlas, vkládané B-roll záběry každé 3–4 sekundy.',
        scenesTemplate: [
          { durationSec: 4, visualPrompt: 'Ranní záběr ze studia s osobním háčkem', patternInterrupt: 'Analog film frame flash', bRollKeyword: 'creator studio morning' },
          { durationSec: 10, visualPrompt: 'Co se pokazilo při prvním pokusu', patternInterrupt: 'Camera shake + rewind SFX', bRollKeyword: 'behind the scenes work' },
          { durationSec: 14, visualPrompt: 'Průlomový moment a ukázka řešení', patternInterrupt: 'Warm golden light transition', bRollKeyword: 'creative breakthrough' },
          { durationSec: 9, visualPrompt: 'Reálná čísla a lekce pro diváky', patternInterrupt: 'Handwritten note overlay', bRollKeyword: 'analytics notebook' },
          { durationSec: 5, visualPrompt: 'Otázka pro publikum do komentářů', patternInterrupt: 'Comment prompt card', bRollKeyword: 'community discussion' },
        ],
        isBuiltIn: true,
        createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      },
      {
        id: 'tpl-news-short',
        name: 'Breaking AI News Short (60s)',
        category: 'news_short',
        description: 'Rychlý zpravodajský formát pro YouTube Shorts, TikTok a Reels. Vysoká naléhavost, datové grafy a výrazný ticker.',
        aspectRatio: '9:16',
        visualStyle: 'Editorial Broadcast News',
        subtitleStyle: {
          font: 'Impact-Bold',
          color: '#ffffff',
          highlightColor: '#f43f5e',
          fontSize: 66,
        },
        musicPreset: {
          beatType: 'Urgent Electronic Pulse',
          bpm: 134,
          sfxPack: 'News Teletype + Sub Boom + Alert Ping',
        },
        structureArchetype: 'Breaking Headline → Co se stalo → Dopad na trh → Co dělat teď',
        pacingNotes: 'Rychlé střihy každé 2 sekundy, jasná fakta a čísla na obrazovce.',
        scenesTemplate: [
          { durationSec: 3, visualPrompt: 'Červený banner BREAKING NEWS s titulkem', patternInterrupt: 'Broadcast flash + alert ping', bRollKeyword: 'breaking news headline' },
          { durationSec: 11, visualPrompt: 'Screenshot oficiálního oznámení s highlightem', patternInterrupt: 'Red marker underline animation', bRollKeyword: 'press release document' },
          { durationSec: 13, visualPrompt: 'Srovnání před a po v přehledném grafu', patternInterrupt: 'Data spike counter', bRollKeyword: 'market impact chart' },
          { durationSec: 10, visualPrompt: '3 praktické dopady pro tvůrce a firmy', patternInterrupt: 'Rapid 1-2-3 bullet pop', bRollKeyword: 'strategy board' },
          { durationSec: 5, visualPrompt: 'Výzva ke sledování dalších novinek', patternInterrupt: 'Follow ticker bar', bRollKeyword: 'news subscribe alert' },
        ],
        isBuiltIn: true,
        createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
      },
      {
        id: 'tpl-animated-explainer',
        name: 'Animovaný Explainer & Motion Grafika',
        category: 'animated_explainer',
        description: 'Vektorová a izometrická vysvětlující videa pro složitější SaaS nebo AI koncepty. Vysoká srozumitelnost a čistá typografie.',
        aspectRatio: '16:9',
        visualStyle: 'Isometric Motion Vector',
        subtitleStyle: {
          font: 'Inter-SemiBold',
          color: '#e2e8f0',
          highlightColor: '#22d3ee',
          fontSize: 50,
        },
        musicPreset: {
          beatType: 'Upbeat Tech Marimba',
          bpm: 116,
          sfxPack: 'Motion Swoop + Vector Pop + Sparkle',
        },
        structureArchetype: 'Otázka → Vizuální metafora → Jak funguje jádro → Výsledek',
        pacingNotes: 'Synchronizované motion grafiky s přesným voiceoverem.',
        scenesTemplate: [
          { durationSec: 5, visualPrompt: 'Animovaná ilustrace problému uživatele', patternInterrupt: 'Icon morph transition', bRollKeyword: 'animated problem metaphor' },
          { durationSec: 11, visualPrompt: 'Izometrické schéma toku dat a agentů', patternInterrupt: 'Flowing line connectors', bRollKeyword: 'isometric workflow diagram' },
          { durationSec: 14, visualPrompt: 'Ukázka automatizace na časové ose', patternInterrupt: 'Clock speed-up animation', bRollKeyword: 'motion timeline speed' },
          { durationSec: 7, visualPrompt: 'Shrnutí přínosů ve 3 ikonách', patternInterrupt: '3-column card reveal', bRollKeyword: 'benefits icons vector' },
          { durationSec: 5, visualPrompt: 'Finální logo a CTA banner', patternInterrupt: 'Clean brand outro', bRollKeyword: 'brand logo reveal' },
        ],
        isBuiltIn: true,
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
      {
        id: 'tpl-product-demo',
        name: 'Produktové Demo & Konverzní Ukázka',
        category: 'product_demo',
        description: 'Zaměřeno na produktové funkce, reálné použití v prohlížeči a konverzi na vyzkoušení zdarma nebo nákup.',
        aspectRatio: '9:16',
        visualStyle: 'High-Contrast Product Showcase',
        subtitleStyle: {
          font: 'Plus-Jakarta-Sans-Bold',
          color: '#ffffff',
          highlightColor: '#10b981',
          fontSize: 60,
        },
        musicPreset: {
          beatType: 'Modern Bass Groove',
          bpm: 122,
          sfxPack: 'Click Trigger + Bass Hit + Cash Chime',
        },
        structureArchetype: 'Pain Hook → 1-Klik Demo → Klíčový benefit → Sociální důkaz → Offer CTA',
        pacingNotes: 'Rychlý zoom na UI tlačítka a konkrétní výstup produktu.',
        scenesTemplate: [
          { durationSec: 3, visualPrompt: 'Bolestivý manuální proces (stopky)', patternInterrupt: 'Red X stamp over timer', bRollKeyword: 'manual work slow' },
          { durationSec: 10, visualPrompt: 'Live kliknutí na funkci v aplikaci', patternInterrupt: 'Cursor click ripple + zoom', bRollKeyword: 'app ui interaction' },
          { durationSec: 13, visualPrompt: 'Okamžitý výsledek a export jedním klikem', patternInterrupt: 'Emerald success glow', bRollKeyword: 'instant output showcase' },
          { durationSec: 10, visualPrompt: 'Porovnání času a nákladů', patternInterrupt: 'Before/After slider', bRollKeyword: 'roi comparison chart' },
          { durationSec: 6, visualPrompt: 'Odkaz na demo a bonusový kód', patternInterrupt: 'CTA arrow pulse', bRollKeyword: 'try demo link' },
        ],
        isBuiltIn: true,
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      },
      {
        id: 'tpl-viral-shorts',
        name: 'Virální Shorts 3s Hook',
        category: 'viral_hook',
        description: 'Dynamický vertikální formát s 3s zvratovým háčkem, žlutou kinetickou typografií a rychlým lo-fi beatem pro maximální retenci (>115 %).',
        aspectRatio: '9:16',
        visualStyle: 'Cyberpunk Neon',
        subtitleStyle: {
          font: 'DejaVu-Sans-Bold',
          color: '#ffffff',
          highlightColor: '#facc15',
          fontSize: 64,
        },
        musicPreset: {
          beatType: 'Lo-Fi Synthwave',
          bpm: 128,
          sfxPack: 'Whoosh + Vinyl Scratch + Cash Ding',
        },
        structureArchetype: '3s Hook → Rapid Proof → Twist Gag → CTA Loop',
        scenesTemplate: [
          { durationSec: 3, visualPrompt: 'Zoom-in glitch face with warning text', patternInterrupt: 'Black & white pause', bRollKeyword: 'cyberpunk hacker room' },
          { durationSec: 9, visualPrompt: 'Rapid terminal code recording', patternInterrupt: '200% zoom with meme sound', bRollKeyword: 'python terminal rapid' },
          { durationSec: 14, visualPrompt: 'Revenue chart soaring upward', patternInterrupt: 'Confetti explosion', bRollKeyword: 'green graph growth' },
          { durationSec: 12, visualPrompt: '3 actionable replication steps', patternInterrupt: 'Haptic countdown 3-2-1', bRollKeyword: 'ai neural glow' },
          { durationSec: 4, visualPrompt: 'Seamless CTA loop pointing to bio', patternInterrupt: 'Seamless audio bridge', bRollKeyword: 'subscribe button neon' },
        ],
        isBuiltIn: true,
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      },
      {
        id: 'tpl-saas-explainer',
        name: 'SaaS B2B Explainer 16:9',
        category: 'animated_explainer',
        description: 'Profesionální širokoúhlý formát pro YouTube s čistým minimalistickým designem, tyrkysovými akcenty a logickým 5krokovým postupem.',
        aspectRatio: '16:9',
        visualStyle: 'Clean Minimalist',
        subtitleStyle: {
          font: 'Inter-SemiBold',
          color: '#e2e8f0',
          highlightColor: '#06b6d4',
          fontSize: 48,
        },
        musicPreset: {
          beatType: 'Deep Ambient Tech',
          bpm: 110,
          sfxPack: 'Soft Pop + Digital Click',
        },
        structureArchetype: 'Problem Identification → Architectural Solution → Live Demo → ROI Proof → Free Trial CTA',
        scenesTemplate: [
          { durationSec: 5, visualPrompt: 'Corporate pain point illustration', patternInterrupt: 'Data counter alert', bRollKeyword: 'office analytics stress' },
          { durationSec: 12, visualPrompt: 'Cloud infrastructure diagram', patternInterrupt: 'Isometric layer shift', bRollKeyword: 'cloud server network' },
          { durationSec: 15, visualPrompt: 'Live workflow execution screencast', patternInterrupt: 'Success metric highlight', bRollKeyword: 'dashboard ui clean' },
          { durationSec: 10, visualPrompt: 'Sign up CTA with trial warranty', patternInterrupt: 'Calendar booking animation', bRollKeyword: 'saas signup modern' },
        ],
        isBuiltIn: true,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        id: 'tpl-comedy-skit',
        name: 'TikTok Comedy Skit & Meme Hook',
        category: 'vlog',
        description: 'Vysokofrekvenční humor pro mladší demografii. Rychlé střihy, sebeironie a sound gagy, které přirozeně vedou na monetizovaný odkaz.',
        aspectRatio: '9:16',
        visualStyle: 'Bold Viral Yellow',
        subtitleStyle: {
          font: 'Impact-Bold',
          color: '#ffffff',
          highlightColor: '#ef4444',
          fontSize: 70,
        },
        musicPreset: {
          beatType: 'Fast Trap Meme Beat',
          bpm: 135,
          sfxPack: 'Cartoon Squeak + Vine Boom + Record Scratch',
        },
        structureArchetype: 'Expectation vs Reality → Relatable Crisis → Absurd AI Fix → Casual CTA',
        scenesTemplate: [
          { durationSec: 3, visualPrompt: 'Expectation meme clip', patternInterrupt: 'Bass drop distorted', bRollKeyword: 'comedy face expression' },
          { durationSec: 10, visualPrompt: 'Reality disaster moment', patternInterrupt: 'Record scratch freeze frame', bRollKeyword: 'messy desk laptop error' },
          { durationSec: 14, visualPrompt: 'AI agent saves the day', patternInterrupt: 'Neon victory flash', bRollKeyword: 'celebration dance meme' },
          { durationSec: 15, visualPrompt: 'Bio link reminder with humorous disclaimer', patternInterrupt: 'Funny face outro', bRollKeyword: 'pointing down sticker' },
        ],
        isBuiltIn: true,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];

    // Seed OpenGen.ai/cs leading AI video and image models catalog
    this.openGenModels = [
      {
        id: 'veo-3-1',
        name: 'Google Veo 3.1',
        category: 'video',
        provider: 'Google DeepMind',
        description: 'Vlajkový model pro kinematografické video s realistickou fyzikou, detailním nasvícením a dynamickým pohybem kamery.',
        badge: '4K CINEMA',
        supportedModes: ['text_to_video', 'image_to_video', 'video_to_video'],
        maxDurationSec: 10,
        creditCost: 12,
        defaultFps: 30,
        resolutions: ['720p', '1080p', '4K'],
        aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
        features: ['Camera Motion', 'HDR Lighting', 'Physics Simulation', 'Prompt Magic'],
        avatarIcon: 'Sparkles',
      },
      {
        id: 'runway-gen-4-5',
        name: 'Runway Gen-4.5',
        category: 'video',
        provider: 'Runway',
        description: 'Hollywoodský režijní model s přesnou kontrolou klíčových snímků, orbitálního pohybu a zachování identity postav.',
        badge: 'DIRECTOR PRO',
        supportedModes: ['text_to_video', 'image_to_video', 'video_to_video'],
        maxDurationSec: 10,
        creditCost: 14,
        defaultFps: 24,
        resolutions: ['720p', '1080p', '4K'],
        aspectRatios: ['16:9', '9:16', '1:1', '21:9'],
        features: ['Director Keyframes', 'Multi-Brush Motion', 'Camera Roll/Tilt', 'Negative Prompt'],
        avatarIcon: 'Film',
      },
      {
        id: 'minimax-hailuo-2-3',
        name: 'MiniMax Hailuo 2.3',
        category: 'video',
        provider: 'MiniMax',
        description: 'Bleskurychlá generace s bezkonkurenční mimikou lidských obličejů, plynulou gestikulací a ostrými texturami.',
        badge: 'HYPER-FAST',
        supportedModes: ['text_to_video', 'image_to_video'],
        maxDurationSec: 6,
        creditCost: 8,
        defaultFps: 30,
        resolutions: ['720p', '1080p'],
        aspectRatios: ['9:16', '16:9', '1:1'],
        features: ['Realistic Faces', 'Natural Pacing', 'Fast Render', 'High Consistency'],
        avatarIcon: 'Zap',
      },
      {
        id: 'kling-o3',
        name: 'Kling 4.0 / O3',
        category: 'video',
        provider: 'Kuaishou',
        description: 'Špičková prostorová simulace, reálná dynamika kapalin, částic a komplexních scén s podporou 3D trajektorií.',
        badge: 'MULTI-CAM',
        supportedModes: ['text_to_video', 'image_to_video'],
        maxDurationSec: 10,
        creditCost: 10,
        defaultFps: 30,
        resolutions: ['720p', '1080p'],
        aspectRatios: ['9:16', '16:9', '1:1'],
        features: ['3D Camera Trajectory', 'Fluid Dynamics', 'Cloth Physics', 'Prompt Magic'],
        avatarIcon: 'Layers',
      },
      {
        id: 'luma-ray-v3-2',
        name: 'Luma Ray v3.2',
        category: 'video',
        provider: 'Luma AI',
        description: 'Vysoká prostorová koherence s 3D volumetrickým svícením, plynulým dronovým průletem a minimem artefaktů.',
        badge: 'SMOOTH MOTION',
        supportedModes: ['text_to_video', 'image_to_video'],
        maxDurationSec: 8,
        creditCost: 7,
        defaultFps: 30,
        resolutions: ['720p', '1080p'],
        aspectRatios: ['16:9', '9:16', '1:1'],
        features: ['Volumetric Light', 'Drone Paths', 'Loop Video', 'Start/End Frame'],
        avatarIcon: 'Camera',
      },
      {
        id: 'seedance-2-5',
        name: 'Seedance 2.5',
        category: 'video',
        provider: 'OpenGen / ByteDance',
        description: 'Specialista na energický tanec, extrémní sporty, akční choreografie a rychlý kinetický střih.',
        badge: 'ACTION BEAT',
        supportedModes: ['text_to_video', 'image_to_video'],
        maxDurationSec: 6,
        creditCost: 6,
        defaultFps: 30,
        resolutions: ['720p', '1080p'],
        aspectRatios: ['9:16', '16:9'],
        features: ['Music Sync', 'Choreography Tracking', 'Extreme Sports', 'Fast Motion'],
        avatarIcon: 'Flame',
      },
      {
        id: 'gemini-omni-flash',
        name: 'Gemini Omni Flash',
        category: 'video',
        provider: 'Google',
        description: 'Nativní multimodální reasoning engine kombinující české textové nuance, storyboard a synchronizovaný voiceover.',
        badge: 'MULTIMODAL',
        supportedModes: ['text_to_video', 'image_to_video', 'video_to_video'],
        maxDurationSec: 12,
        creditCost: 9,
        defaultFps: 30,
        resolutions: ['720p', '1080p'],
        aspectRatios: ['9:16', '16:9', '1:1'],
        features: ['Czech Nuance', 'Voiceover Sync', 'Native Audio', 'Faststart Ready'],
        avatarIcon: 'Cpu',
      },
      {
        id: 'wan-2-1',
        name: 'Wan 2.1 MoE',
        category: 'video',
        provider: 'Alibaba Wan-AI',
        description: 'Přední open-weights video model s Mixture-of-Experts architekturou, bezkonkurenční flexibilitou a nízkou cenou.',
        badge: 'OPEN-WEIGHTS',
        supportedModes: ['text_to_video', 'image_to_video'],
        maxDurationSec: 8,
        creditCost: 5,
        defaultFps: 30,
        resolutions: ['720p', '1080p'],
        aspectRatios: ['9:16', '16:9', '1:1', '4:5'],
        features: ['Open-Weights', 'MoE Efficiency', 'Text Purity', 'No Censorship'],
        avatarIcon: 'Globe',
      },
      {
        id: 'hunyuan-video',
        name: 'HunyuanVideo',
        category: 'video',
        provider: 'Tencent',
        description: 'Velký open-source kinematografický model se silným dodržováním složitých instrukcí a bohatými scénickými detaily.',
        badge: 'OPEN SOURCE',
        supportedModes: ['text_to_video'],
        maxDurationSec: 6,
        creditCost: 5,
        defaultFps: 24,
        resolutions: ['720p', '1080p'],
        aspectRatios: ['16:9', '9:16'],
        features: ['Open-Source', 'High Prompt Adherence', 'Cinematic Depth', 'Rich Textures'],
        avatarIcon: 'Film',
      },
      {
        id: 'flux-2-pro',
        name: 'Flux 2 Pro',
        category: 'image',
        provider: 'Black Forest Labs',
        description: 'Generátor fotorealistických klíčových snímků a výchozích obrázků pro Image-to-Video a start/end frame animaci.',
        badge: 'IMAGE BASE',
        supportedModes: ['image_to_video'],
        maxDurationSec: 0,
        creditCost: 3,
        defaultFps: 0,
        resolutions: ['1080p', '4K'],
        aspectRatios: ['9:16', '16:9', '1:1', '4:5'],
        features: ['Photorealistic Detail', 'Typography Rendering', 'Keyframe Anchor'],
        avatarIcon: 'Palette',
      },
    ];

    // Seed Published Video Performance & Multi-Platform Analytics
    const initialPublishedVideos = [
      {
        id: 'vid-yt-402',
        title: 'Jak jsem nechal AI vydělávat zatímco spím (a proč to skoro krachlo)',
        platform: 'YouTube' as const,
        format: '9:16' as const,
        templateCategory: 'viral_hook' as const,
        views: 68400,
        likes: 5420,
        comments: 384,
        watchTimeHours: 792,
        avgWatchSeconds: 41.7,
        retentionRate: 118.4,
        publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        url: 'https://youtube.com/shorts/nexus_402',
      },
      {
        id: 'vid-tt-311',
        title: 'Breaking AI News: Nový autonomní střih v Pythonu za 4 vteřiny',
        platform: 'TikTok' as const,
        format: '9:16' as const,
        templateCategory: 'news_short' as const,
        views: 49100,
        likes: 4680,
        comments: 295,
        watchTimeHours: 486,
        avgWatchSeconds: 35.6,
        retentionRate: 112.0,
        publishedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        url: 'https://tiktok.com/@nexus.viral.lab/video/74029182',
      },
      {
        id: 'vid-ig-209',
        title: 'Produktové Demo: 1 kliknutí z nápadu na hotové Reels video',
        platform: 'Instagram Reels' as const,
        format: '9:16' as const,
        templateCategory: 'product_demo' as const,
        views: 30700,
        likes: 2330,
        comments: 163,
        watchTimeHours: 318,
        avgWatchSeconds: 37.3,
        retentionRate: 109.5,
        publishedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        url: 'https://instagram.com/reel/nexus_demo_209',
      },
      {
        id: 'vid-yt-188',
        title: 'Krok-za-krokem Tutoriál: Kompletní MoviePy 2.x pipeline pro tvůrce',
        platform: 'YouTube' as const,
        format: '16:9' as const,
        templateCategory: 'tutorial' as const,
        views: 21400,
        likes: 1890,
        comments: 214,
        watchTimeHours: 1140,
        avgWatchSeconds: 191.8,
        retentionRate: 78.4,
        publishedAt: new Date(Date.now() - 86400000 * 6).toISOString(),
        url: 'https://youtube.com/watch?v=nexus_tut_188',
      },
    ];

    this.analyticsData = {
      lastSyncedAt: new Date().toISOString(),
      summary: {
        totalViews: 169600,
        totalLikes: 14320,
        totalComments: 1056,
        totalWatchTimeHours: 2736,
        engagementRate: 9.07,
        avgRetentionRate: 114.2,
        avgCtr: 8.6,
        estimatedRevenueCzk: 5640,
        rpmCzk: 33.2,
      },
      platformBreakdown: [
        {
          platform: 'YouTube',
          connected: true,
          views: 89800,
          likes: 7310,
          comments: 598,
          watchTimeHours: 1932,
          avgRetentionRate: 114.6,
          engagementRate: 8.81,
          growth24h: '+26.4 %',
          topFormat: 'Tutoriály 16:9 & Shorts 9:16',
        },
        {
          platform: 'TikTok',
          connected: true,
          views: 49100,
          likes: 4680,
          comments: 295,
          watchTimeHours: 486,
          avgRetentionRate: 112.0,
          engagementRate: 10.13,
          growth24h: '+34.2 %',
          topFormat: 'Breaking AI News Shorts',
        },
        {
          platform: 'Instagram Reels',
          connected: true,
          views: 30700,
          likes: 2330,
          comments: 163,
          watchTimeHours: 318,
          avgRetentionRate: 109.5,
          engagementRate: 8.12,
          growth24h: '+19.8 %',
          topFormat: 'Produktová Dema 9:16',
        },
      ],
      publishedVideoPerformance: initialPublishedVideos,
      contentRecommendations: deriveContentRecommendations(initialPublishedVideos),
      viewsTimeline: [
        { date: '03. 11.', views: 6400, watchTimeHours: 102, subscribersGained: 24, likes: 510, comments: 32 },
        { date: '04. 11.', views: 8200, watchTimeHours: 135, subscribersGained: 38, likes: 680, comments: 44 },
        { date: '05. 11.', views: 7900, watchTimeHours: 129, subscribersGained: 31, likes: 640, comments: 39 },
        { date: '06. 11.', views: 11400, watchTimeHours: 182, subscribersGained: 52, likes: 920, comments: 68 },
        { date: '07. 11.', views: 14200, watchTimeHours: 228, subscribersGained: 69, likes: 1180, comments: 84 },
        { date: '08. 11.', views: 12800, watchTimeHours: 195, subscribersGained: 58, likes: 1040, comments: 72 },
        { date: '09. 11.', views: 9600, watchTimeHours: 152, subscribersGained: 41, likes: 790, comments: 55 },
        { date: '10. 11.', views: 10400, watchTimeHours: 164, subscribersGained: 44, likes: 860, comments: 61 },
        { date: '11. 11.', views: 15800, watchTimeHours: 244, subscribersGained: 78, likes: 1340, comments: 96 },
        { date: '12. 11.', views: 18200, watchTimeHours: 285, subscribersGained: 92, likes: 1590, comments: 118 },
        { date: '13. 11.', views: 16400, watchTimeHours: 256, subscribersGained: 81, likes: 1410, comments: 104 },
        { date: '14. 11.', views: 13900, watchTimeHours: 212, subscribersGained: 64, likes: 1150, comments: 88 },
        { date: '15. 11.', views: 19800, watchTimeHours: 308, subscribersGained: 104, likes: 1720, comments: 132 },
        { date: '16. 11.', views: 23200, watchTimeHours: 359, subscribersGained: 126, likes: 2040, comments: 154 },
      ],
      retentionCurve: [
        { second: 0, retentionPercent: 100, event: 'Začátek videa' },
        { second: 1, retentionPercent: 108, event: 'Hook upoutávka' },
        { second: 2, retentionPercent: 118, event: '⚡ Hook Peak (nejvyšší zájem)' },
        { second: 3, retentionPercent: 112 },
        { second: 5, retentionPercent: 96 },
        { second: 8, retentionPercent: 90 },
        { second: 12, retentionPercent: 86 },
        { second: 15, retentionPercent: 92, event: '⚡ Pattern Interrupt (zvýšení retence)' },
        { second: 20, retentionPercent: 84 },
        { second: 25, retentionPercent: 79 },
        { second: 30, retentionPercent: 74 },
        { second: 35, retentionPercent: 71, event: 'Výzva k akci (CTA)' },
        { second: 40, retentionPercent: 88, event: '⚡ Plynulá smyčka (druhé přehrání)' },
        { second: 42, retentionPercent: 94 },
      ],
      demographics: {
        ageGroups: [
          { label: '18–24 let', percent: 42 },
          { label: '25–34 let', percent: 38 },
          { label: '35–44 let', percent: 14 },
          { label: '45+ let', percent: 6 },
        ],
        gender: { male: 68, female: 32 },
        topCountries: [
          { country: 'Česká republika', code: 'CZ', percent: 62 },
          { country: 'Slovensko', code: 'SK', percent: 24 },
          { country: 'Polsko', code: 'PL', percent: 8 },
          { country: 'Spojené státy', code: 'US', percent: 6 },
        ],
      },
      viralTrends: [
        {
          id: 'trend-1',
          keyword: 'AI automatizace 2026 bez kódování',
          velocityScore: 96,
          searchVolume: '48K / měsíc',
          suggestedHook: 'Zapomeňte na Excel. Takhle řídím celou firmu 3 AI agenty.',
          platform: 'YouTube Shorts',
          growth24h: '+142 %',
        },
        {
          id: 'trend-2',
          keyword: 'Jak MoviePy nahradí Premiere Pro',
          velocityScore: 91,
          searchVolume: '29K / měsíc',
          suggestedHook: 'Proč stříhat 6 hodin video, když to python skript udělá za 4 vteřiny?',
          platform: 'TikTok',
          growth24h: '+88 %',
        },
        {
          id: 'trend-3',
          keyword: 'Produktové demo v AI studiu za 5 minut',
          velocityScore: 89,
          searchVolume: '34K / měsíc',
          suggestedHook: 'Tento jednoduchý 40s formát zvýšil konverze na Reels o 38 %.',
          platform: 'Instagram Reels',
          growth24h: '+74 %',
        },
        {
          id: 'trend-4',
          keyword: 'Prompt engineering je v roce 2026 mrtvý',
          velocityScore: 85,
          searchVolume: '52K / měsíc',
          suggestedHook: 'Psaní dlouhých promptů skončilo. Dnes se používají autonomní runtimes.',
          platform: 'Instagram Reels',
          growth24h: '+65 %',
        },
        {
          id: 'trend-5',
          keyword: 'Autonomní AI YouTube Studio',
          velocityScore: 94,
          searchVolume: '61K / měsíc',
          suggestedHook: 'Nechal jsem AI kompletně převzít můj YouTube kanál. Výsledek?',
          platform: 'YouTube Shorts',
          growth24h: '+118 %',
        },
      ],
    };

    // Seed Multi-Account Workspaces
    this.accounts = [
      {
        id: 'acc-main',
        name: 'NEXUS Hlavní Studio',
        slug: 'nexus-hlavni-studio',
        plan: 'Enterprise Swarm',
        ownerEmail: 'bpcme66@gmail.com',
        defaultAspectRatio: '9:16',
        createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      },
      {
        id: 'acc-b2b',
        name: 'B2B SaaS Kanál & Tutoriály',
        slug: 'b2b-saas-kanal',
        plan: 'Studio Pro',
        ownerEmail: 'bpcme66@gmail.com',
        defaultAspectRatio: '16:9',
        createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
      },
    ];
    this.activeAccountId = 'acc-main';

    // Seed Team Members with RBAC Roles (Admin, Editor, Viewer)
    this.teamMembers = [
      {
        id: 'usr-admin-1',
        accountId: 'acc-main',
        name: 'Hlavní Vlastník (Vy)',
        email: 'bpcme66@gmail.com',
        role: 'admin',
        permissions: getDefaultPermissionsForRole('admin'),
        status: 'active',
        invitedBy: 'Systém',
        joinedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
        lastActiveAt: new Date().toISOString(),
      },
      {
        id: 'usr-editor-1',
        accountId: 'acc-main',
        name: 'Tomáš Král',
        email: 'tomas.kral@nexus-studio.cz',
        role: 'editor',
        permissions: getDefaultPermissionsForRole('editor'),
        status: 'active',
        invitedBy: 'bpcme66@gmail.com',
        joinedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
        lastActiveAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
      {
        id: 'usr-viewer-1',
        accountId: 'acc-main',
        name: 'Eva Novotná',
        email: 'eva.novotna@nexus-studio.cz',
        role: 'viewer',
        permissions: getDefaultPermissionsForRole('viewer'),
        status: 'active',
        invitedBy: 'bpcme66@gmail.com',
        joinedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
        lastActiveAt: new Date(Date.now() - 3600000 * 6).toISOString(),
      },
      {
        id: 'usr-editor-2',
        accountId: 'acc-b2b',
        name: 'Martin Svoboda',
        email: 'martin.svoboda@saas-agentura.cz',
        role: 'editor',
        permissions: getDefaultPermissionsForRole('editor'),
        status: 'invited',
        invitedBy: 'bpcme66@gmail.com',
        joinedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        lastActiveAt: new Date(Date.now() - 86400000 * 1).toISOString(),
      },
    ];
    this.currentActorId = 'usr-admin-1';
  }

  public syncAnalyticsMetrics(): AnalyticsData {
    // Recompute summary & platform breakdown dynamically from published videos + simulated fresh delta
    this.analyticsData.publishedVideoPerformance = this.analyticsData.publishedVideoPerformance.map((v, idx) => {
      const viewsBoost = 180 + idx * 95;
      const likesBoost = Math.round(viewsBoost * 0.085);
      const commentsBoost = Math.round(viewsBoost * 0.006);
      const watchBoost = Math.round((viewsBoost * v.avgWatchSeconds) / 3600);
      return {
        ...v,
        views: v.views + viewsBoost,
        likes: v.likes + likesBoost,
        comments: v.comments + commentsBoost,
        watchTimeHours: v.watchTimeHours + Math.max(1, watchBoost),
      };
    });

    const platforms: Array<'YouTube' | 'TikTok' | 'Instagram Reels'> = ['YouTube', 'TikTok', 'Instagram Reels'];
    this.analyticsData.platformBreakdown = platforms.map((plat) => {
      const vids = this.analyticsData.publishedVideoPerformance.filter((v) => v.platform === plat);
      const views = vids.reduce((acc, v) => acc + v.views, 0);
      const likes = vids.reduce((acc, v) => acc + v.likes, 0);
      const comments = vids.reduce((acc, v) => acc + v.comments, 0);
      const watchTimeHours = vids.reduce((acc, v) => acc + v.watchTimeHours, 0);
      const avgRetentionRate =
        vids.length > 0
          ? Math.round((vids.reduce((acc, v) => acc + v.retentionRate, 0) / vids.length) * 10) / 10
          : 0;
      const engagementRate =
        views > 0 ? Math.round(((likes + comments) / views) * 10000) / 100 : 0;

      const integration = this.socialIntegrations.find((i) => i.platformKey === plat);

      return {
        platform: plat,
        connected: integration ? integration.connected : true,
        views,
        likes,
        comments,
        watchTimeHours,
        avgRetentionRate,
        engagementRate,
        growth24h: plat === 'TikTok' ? '+36.1 %' : plat === 'YouTube' ? '+28.2 %' : '+21.4 %',
        topFormat:
          plat === 'YouTube'
            ? 'Tutoriály 16:9 & Shorts 9:16'
            : plat === 'TikTok'
              ? 'Breaking AI News Shorts'
              : 'Produktová Dema 9:16',
      };
    });

    const totalViews = this.analyticsData.publishedVideoPerformance.reduce((s, v) => s + v.views, 0);
    const totalLikes = this.analyticsData.publishedVideoPerformance.reduce((s, v) => s + v.likes, 0);
    const totalComments = this.analyticsData.publishedVideoPerformance.reduce((s, v) => s + v.comments, 0);
    const totalWatchTimeHours = this.analyticsData.publishedVideoPerformance.reduce((s, v) => s + v.watchTimeHours, 0);

    this.analyticsData.summary = {
      ...this.analyticsData.summary,
      totalViews,
      totalLikes,
      totalComments,
      totalWatchTimeHours,
      engagementRate: totalViews > 0 ? Math.round(((totalLikes + totalComments) / totalViews) * 10000) / 100 : 0,
      estimatedRevenueCzk: Math.round((totalViews / 1000) * this.analyticsData.summary.rpmCzk),
    };

    this.analyticsData.lastSyncedAt = new Date().toISOString();
    this.analyticsData.contentRecommendations = deriveContentRecommendations(
      this.analyticsData.publishedVideoPerformance
    );

    return this.analyticsData;
  }

  public getSystemPerformance(): SystemPerformance {
    const memUsage = process.memoryUsage();
    const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMb = Math.round(memUsage.rss / 1024 / 1024);
    const systemMemoryTotalMb = Math.round(os.totalmem() / 1024 / 1024);
    const systemMemoryUsedMb = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);

    // Real CPU measurement via os.cpus() tick deltas
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }

    let cpuUsagePercent = 0;
    if (this.lastCpuSample && total > this.lastCpuSample.total) {
      const idleDelta = idle - this.lastCpuSample.idle;
      const totalDelta = total - this.lastCpuSample.total;
      cpuUsagePercent = Math.round(((1 - idleDelta / totalDelta) * 100) * 10) / 10;
    } else {
      const load1m = os.loadavg()[0] || 0.25;
      cpuUsagePercent = Math.min(99, Math.round((load1m / Math.max(1, cpus.length)) * 1000) / 10);
    }
    this.lastCpuSample = { idle, total };
    cpuUsagePercent = Math.max(0.5, Math.min(100, cpuUsagePercent));

    const now = Date.now();
    const elapsedSinceLast = now - this.lastPerfTickAt;
    this.lastPerfTickAt = now;
    if (elapsedSinceLast > 0) {
      this.lastLoopLagMs = Math.round((Math.abs(elapsedSinceLast % 100) * 0.08 + 0.6) * 10) / 10;
    }

    const mediaVaultCount = this.factoryAssets.filter((a) => a.line === 'video').length;

    return {
      cpuUsagePercent,
      cpuCores: cpus.length,
      loadAvg1m: Math.round((os.loadavg()[0] || 0) * 100) / 100,
      memoryUsageMb: heapUsedMb,
      memoryTotalMb: heapTotalMb,
      rssMb,
      systemMemoryUsedMb,
      systemMemoryTotalMb,
      activeJobsCount: this.isSystemPaused ? 0 : this.activeJobQueueCount,
      queuedJobsCount: this.queuedJobsCount,
      renderWorkers: Math.max(2, Math.min(8, cpus.length)),
      mediaVaultCount,
      eventLoopLagMs: this.lastLoopLagMs,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}

export const db = new NexusDatabase();
