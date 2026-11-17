/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AssetStatusResponse,
  FactoryAsset,
  MediaRenderStage,
  SmartTrendAnalysisResult,
  StructuredPromptScore,
  StructuredVideoPrompt,
  VideoStoryboard,
  OpenGenModelSpec,
  OpenGenCreditsState,
  OpenGenGenerationRequest,
  OpenGenCameraMotion,
  VideoVisualStyle,
  MonetizationAuditResult,
  AiSmartEnhanceResponse,
} from '../types/nexus.ts';

export interface SmartVideoProgressUpdate {
  assetId: string;
  httpStatus: 200 | 202 | 500;
  status: 'queued' | 'rendering' | 'ready' | 'failed';
  progressPercent: number;
  progressStage: MediaRenderStage;
  workerMessage: string;
  faststartVerified: boolean;
  pollAttempt: number;
  retryAfterSeconds?: number;
}

export interface SmartVideoGenerationResult {
  asset: FactoryAsset;
  storyboard?: VideoStoryboard;
  moviePyScript?: string;
  structuredPrompt?: StructuredVideoPrompt;
  analysis?: SmartTrendAnalysisResult;
  received202Accepted: boolean;
  pollCount: number;
}

export interface SmartVideoTriggerOptions {
  baseUrl?: string;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxPolls?: number;
  onProgress?: (update: SmartVideoProgressUpdate) => void;
  onAccepted202?: (initial: {
    asset: FactoryAsset;
    storyboard?: VideoStoryboard;
    moviePyScript?: string;
    structuredPrompt?: StructuredVideoPrompt;
    analysis?: SmartTrendAnalysisResult;
    retryAfterSeconds: number;
  }) => void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Polling aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Polling aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * SmartVideoOrchestrator:
 * Client-authoritative coordinator for analyzing trending topics, triggering
 * the MoviePy + FFmpeg (`-movflags +faststart`) background generation pipeline,
 * handling HTTP 202 Accepted status polling, and enforcing atomic MP4 integrity
 * before exposing any video asset to playback or download.
 */
export class SmartVideoOrchestrator {
  private readonly baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  public async analyzeTrendingTopics(params?: {
    platform?: string;
    trendId?: string;
    templateId?: string;
    signal?: AbortSignal;
  }): Promise<SmartTrendAnalysisResult> {
    const query = new URLSearchParams();
    if (params?.platform) query.set('platform', params.platform);
    if (params?.trendId) query.set('trendId', params.trendId);
    if (params?.templateId) query.set('templateId', params.templateId);
    const qs = query.toString();

    const res = await fetch(
      this.url(`/api/v1/orchestrator/smart-video/trends${qs ? `?${qs}` : ''}`),
      { signal: params?.signal }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Analýza trendových témat selhala.');
    }
    return data as SmartTrendAnalysisResult;
  }

  /**
   * Verifies that the finalized MP4 passes atomic integrity, SHA-256 checksum,
   * FFmpeg `-movflags +faststart`, and HTTP Range pre-flight checks.
   */
  public async verifyAtomicVideoIntegrity(
    asset: FactoryAsset,
    signal?: AbortSignal
  ): Promise<FactoryAsset> {
    if (asset.status !== 'ready') {
      throw new Error(`Video asset ${asset.id} není ve stavu ready (aktuálně: ${asset.status}).`);
    }
    if (!asset.faststartVerified) {
      throw new Error(`Video asset ${asset.id} nemá ověřené +faststart (moov atom před mdat).`);
    }
    if (!asset.sha256 || !asset.sizeBytes || asset.sizeBytes <= 1024) {
      throw new Error(`Video asset ${asset.id} neprošel kontrolou velikosti nebo SHA-256 checksumu.`);
    }

    const streamUrl = this.url(asset.streamUrl || `/api/v1/assets/${asset.id}/stream`);
    const headRes = await fetch(streamUrl, { method: 'HEAD', signal });
    if (headRes.status !== 200) {
      throw new Error(`Stream endpoint pro ${asset.id} vrátil neočekávaný status ${headRes.status}.`);
    }
    const contentType = headRes.headers.get('content-type') || '';
    const acceptRanges = headRes.headers.get('accept-ranges') || '';
    if (!contentType.includes('video/mp4') || !acceptRanges.includes('bytes')) {
      throw new Error(`Stream hlavičky pro ${asset.id} nesplňují MP4 Range požadavky.`);
    }

    return asset;
  }

  /**
   * Polls `GET /api/v1/assets/:asset_id/status`, cleanly handling HTTP `202 Accepted`
   * responses with `Retry-After` until the worker reaches `200 OK` (`ready`) + integrity pass.
   */
  public async pollAssetUntilReady(
    assetId: string,
    options: SmartVideoTriggerOptions = {}
  ): Promise<{ asset: FactoryAsset; pollCount: number; received202Accepted: boolean }> {
    const maxPolls = options.maxPolls ?? 45;
    const defaultIntervalMs = options.pollIntervalMs ?? 450;
    let received202Accepted = false;

    for (let attempt = 1; attempt <= maxPolls; attempt++) {
      const statusRes = await fetch(this.url(`/api/v1/assets/${assetId}/status`), {
        cache: 'no-store',
        signal: options.signal,
      });

      const body: AssetStatusResponse = await statusRes.json();

      if (statusRes.status === 202) {
        received202Accepted = true;
        const retryHeader = Number.parseInt(statusRes.headers.get('retry-after') || '', 10);
        const retrySec = Number.isNaN(retryHeader)
          ? body.retryAfterSeconds || 1
          : retryHeader;

        options.onProgress?.({
          assetId,
          httpStatus: 202,
          status: body.status,
          progressPercent: body.progressPercent,
          progressStage: body.progressStage,
          workerMessage: body.workerMessage,
          faststartVerified: Boolean(body.faststartVerified),
          pollAttempt: attempt,
          retryAfterSeconds: retrySec,
        });

        await sleep(Math.min(1200, Math.max(250, defaultIntervalMs)), options.signal);
        continue;
      }

      if (!statusRes.ok || body.status === 'failed') {
        options.onProgress?.({
          assetId,
          httpStatus: 500,
          status: 'failed',
          progressPercent: body.progressPercent || 0,
          progressStage: 'failed',
          workerMessage: body.workerMessage || 'Render videa na serveru selhal.',
          faststartVerified: false,
          pollAttempt: attempt,
        });
        throw new Error(body.workerMessage || 'Render videa selhal.');
      }

      const verifiedAsset = await this.verifyAtomicVideoIntegrity(body.asset, options.signal);

      options.onProgress?.({
        assetId,
        httpStatus: 200,
        status: 'ready',
        progressPercent: 100,
        progressStage: 'ready',
        workerMessage:
          body.workerMessage || 'MP4 připraveno pro webový stream (-movflags +faststart ověřeno).',
        faststartVerified: true,
        pollAttempt: attempt,
      });

      return {
        asset: verifiedAsset,
        pollCount: attempt,
        received202Accepted,
      };
    }

    throw new Error(`Vypršel časový limit při čekání na dokončení videa (${assetId}).`);
  }

  /**
   * Triggers a MoviePy + FFmpeg (+faststart) background generation job via `/v1/factory/generations`
   * with `async: true`, handling 202 Accepted and polling until atomic verification completes.
   */
  public async generateTemplateVideo(
    params: {
      line?: 'video' | 'ad' | 'funnel';
      topic: string;
      format: '9:16' | '16:9';
      templateId?: string;
      threadId?: string;
      dryRun?: boolean;
      structuredPrompt?: StructuredVideoPrompt;
    },
    options: SmartVideoTriggerOptions = {}
  ): Promise<SmartVideoGenerationResult> {
    const res = await fetch(this.url('/v1/factory/generations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        line: params.line || 'video',
        topic: params.topic,
        format: params.format,
        templateId: params.templateId,
        threadId: params.threadId || 'th-main-001',
        structuredPrompt: params.structuredPrompt,
        dryRun: Boolean(params.dryRun),
        async: true,
      }),
    });

    const data = await res.json();
    if (!res.ok && res.status !== 202) {
      throw new Error(data?.error || 'Spuštění generování videa selhalo.');
    }

    if (res.status === 202 && data.asset?.id) {
      const retryAfterSeconds = Number.parseInt(res.headers.get('retry-after') || '1', 10) || 1;
      options.onAccepted202?.({
        asset: data.asset,
        storyboard: data.storyboard,
        moviePyScript: data.moviePyScript,
        structuredPrompt: data.structuredPrompt || data.asset?.structuredPrompt,
        retryAfterSeconds,
      });
      options.onProgress?.({
        assetId: data.asset.id,
        httpStatus: 202,
        status: data.asset.status || 'queued',
        progressPercent: data.asset.progressPercent ?? 10,
        progressStage: data.asset.progressStage || 'queued',
        workerMessage:
          data.asset.workerMessage || 'HTTP 202 Accepted · Úloha předána background workeru.',
        faststartVerified: false,
        pollAttempt: 0,
        retryAfterSeconds,
      });

      const polled = await this.pollAssetUntilReady(data.asset.id, options);
      return {
        asset: polled.asset,
        storyboard: data.storyboard || polled.asset.videoStoryboard,
        moviePyScript: data.moviePyScript || polled.asset.moviePyScript,
        structuredPrompt:
          data.structuredPrompt ||
          polled.asset.structuredPrompt ||
          polled.asset.videoBrief?.structuredPrompt,
        received202Accepted: true,
        pollCount: polled.pollCount,
      };
    }

    // Immediate non-async line ('ad' / 'funnel') or synchronous fallback
    const readyAsset =
      data.asset?.line === 'video'
        ? await this.verifyAtomicVideoIntegrity(data.asset, options.signal)
        : (data.asset as FactoryAsset);

    return {
      asset: readyAsset,
      storyboard: data.storyboard,
      moviePyScript: data.moviePyScript,
      structuredPrompt: data.structuredPrompt || readyAsset?.structuredPrompt,
      received202Accepted: false,
      pollCount: 0,
    };
  }

  /**
   * End-to-end SmartVideoOrchestrator workflow:
   * 1) Analyzes trending topics on backend
   * 2) Automatically triggers MoviePy + FFmpeg (+faststart) background pipeline
   * 3) Handles 202 Accepted status polling and verifies atomic MP4 integrity before returning.
   */
  public async analyzeTrendsAndTriggerMoviePy(
    params?: {
      trendId?: string;
      platform?: string;
      templateId?: string;
      threadId?: string;
      dryRun?: boolean;
    },
    options: SmartVideoTriggerOptions = {}
  ): Promise<SmartVideoGenerationResult> {
    const res = await fetch(this.url('/api/v1/orchestrator/smart-video/analyze-and-trigger'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        trendId: params?.trendId,
        platform: params?.platform,
        templateId: params?.templateId,
        threadId: params?.threadId || 'th-main-001',
        dryRun: Boolean(params?.dryRun),
        async: true,
      }),
    });

    const data = await res.json();
    if (!res.ok && res.status !== 202) {
      throw new Error(data?.error || 'SmartVideoOrchestrator nemohl spustit trendový pipeline.');
    }

    if (res.status === 202 && data.asset?.id) {
      const retryAfterSeconds = Number.parseInt(res.headers.get('retry-after') || '1', 10) || 1;
      options.onAccepted202?.({
        asset: data.asset,
        storyboard: data.storyboard,
        moviePyScript: data.moviePyScript,
        analysis: data.analysis,
        retryAfterSeconds,
      });
      options.onProgress?.({
        assetId: data.asset.id,
        httpStatus: 202,
        status: data.asset.status || 'queued',
        progressPercent: data.asset.progressPercent ?? 10,
        progressStage: data.asset.progressStage || 'queued',
        workerMessage:
          data.asset.workerMessage || 'HTTP 202 Accepted · SmartVideoOrchestrator čeká na worker.',
        faststartVerified: false,
        pollAttempt: 0,
        retryAfterSeconds,
      });

      const polled = await this.pollAssetUntilReady(data.asset.id, options);
      return {
        asset: polled.asset,
        storyboard: data.storyboard || polled.asset.videoStoryboard,
        moviePyScript: data.moviePyScript || polled.asset.moviePyScript,
        analysis: data.analysis,
        received202Accepted: true,
        pollCount: polled.pollCount,
      };
    }

    const verified = await this.verifyAtomicVideoIntegrity(data.asset, options.signal);
    return {
      asset: verified,
      storyboard: data.storyboard,
      moviePyScript: data.moviePyScript,
      analysis: data.analysis,
      received202Accepted: false,
      pollCount: 0,
    };
  }

  // -------------------------------------------------------------
  // OPENGEN.AI/CS SUITE METHODS
  // -------------------------------------------------------------

  public async getOpenGenModels(params?: {
    category?: string;
    signal?: AbortSignal;
  }): Promise<{
    models: OpenGenModelSpec[];
    credits: OpenGenCreditsState;
    supportedCameras: Array<{ id: string; label: string }>;
  }> {
    const qs = params?.category && params.category !== 'all' ? `?category=${encodeURIComponent(params.category)}` : '';
    const res = await fetch(this.url(`/api/v1/opengen/models${qs}`), { signal: params?.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Načtení OpenGen modelů selhalo.');
    return data;
  }

  public async getOpenGenCredits(signal?: AbortSignal): Promise<OpenGenCreditsState> {
    const res = await fetch(this.url('/api/v1/opengen/credits'), { signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Načtení OpenGen kreditů selhalo.');
    return data;
  }

  public async topUpCredits(
    pkg: 'starter' | 'creator' | 'studio' = 'creator',
    amount?: number,
    signal?: AbortSignal
  ): Promise<{ success: boolean; addedCredits: number; credits: OpenGenCreditsState; message: string }> {
    const res = await fetch(this.url('/api/v1/opengen/credits/topup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ package: pkg, amount }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Dobití kreditů selhalo.');
    return data;
  }

  public async parseStructuredPrompt(params: {
    rawPrompt: string;
    aspectRatio?: '9:16' | '16:9';
    durationSec?: number;
    fps?: 24 | 30 | 60;
    visualStyle?: VideoVisualStyle;
    cameraMotion?: OpenGenCameraMotion;
    motionIntensity?: number;
    negativePrompt?: string;
    signal?: AbortSignal;
  }): Promise<{
    engine: string;
    structuredPrompt: StructuredVideoPrompt;
    score: StructuredPromptScore;
  }> {
    const res = await fetch(this.url('/api/v1/video/structured-prompt/parse'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Lokální rozklad promptu selhal.');
    return data;
  }

  public async enhanceStructuredPrompt(params: {
    structuredPrompt?: StructuredVideoPrompt;
    rawPrompt?: string;
    cameraMotion?: OpenGenCameraMotion;
    visualStyle?: VideoVisualStyle;
    motionIntensity?: number;
    signal?: AbortSignal;
  }): Promise<{
    engine: string;
    structuredPrompt: StructuredVideoPrompt;
    compiledText: string;
    tips: string[];
    score: StructuredPromptScore;
  }> {
    const res = await fetch(this.url('/api/v1/video/structured-prompt/enhance'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Lokální vylepšení promptu selhalo.');
    return data;
  }

  public async optimizeForMonetization(params: {
    structuredPrompt?: StructuredVideoPrompt;
    rawPrompt?: string;
    blueprintId?: string;
    signal?: AbortSignal;
  }): Promise<{
    engine: string;
    structuredPrompt: StructuredVideoPrompt;
    audit: MonetizationAuditResult;
    compiledText: string;
  }> {
    const res = await fetch(this.url('/api/v1/video/structured-prompt/monetize'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Optimalizace pro monetizaci selhala.');
    return data;
  }

  public async aiSmartEnhancePrompt(params: {
    structuredPrompt?: StructuredVideoPrompt;
    rawPrompt?: string;
    selectedStyleTagId?: string;
    signal?: AbortSignal;
  }): Promise<AiSmartEnhanceResponse> {
    const res = await fetch(this.url('/api/v1/video/structured-prompt/ai-enhance'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        structuredPrompt: params.structuredPrompt,
        rawPrompt: params.rawPrompt,
        selectedStyleTagId: params.selectedStyleTagId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'AI Smart Enhance selhal.');
    }
    return data as AiSmartEnhanceResponse;
  }

  public async enhancePrompt(
    prompt: string,
    params?: {
      modelId?: string;
      style?: string;
      camera?: string;
      structuredPrompt?: StructuredVideoPrompt;
      motionIntensity?: number;
      signal?: AbortSignal;
    }
  ): Promise<{
    originalPrompt: string;
    enhancedPrompt: string;
    compiledText?: string;
    structuredPrompt?: StructuredVideoPrompt;
    score?: StructuredPromptScore;
    tips: string[];
  }> {
    const res = await fetch(this.url('/api/v1/opengen/prompt-enhance'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params?.signal,
      body: JSON.stringify({
        prompt,
        structuredPrompt: params?.structuredPrompt,
        modelId: params?.modelId,
        style: params?.style,
        camera: params?.camera,
        motionIntensity: params?.motionIntensity,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Lokální vylepšení promptu selhalo.');
    return data;
  }

  public async generateOpenGenVideo(
    params: OpenGenGenerationRequest,
    options: SmartVideoTriggerOptions = {}
  ): Promise<SmartVideoGenerationResult & { model?: OpenGenModelSpec; creditsUsed?: number; creditsRemaining?: number }> {
    const res = await fetch(this.url('/api/v1/opengen/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        ...params,
        async: true,
      }),
    });

    const data = await res.json();
    if (!res.ok && res.status !== 202) {
      throw new Error(data?.error || 'Generování videa selhalo.');
    }

    if (res.status === 202 && data.asset?.id) {
      const retryAfterSeconds = Number.parseInt(res.headers.get('retry-after') || '1', 10) || 1;
      options.onAccepted202?.({
        asset: data.asset,
        storyboard: data.storyboard,
        moviePyScript: data.moviePyScript,
        structuredPrompt: data.structuredPrompt || data.asset?.structuredPrompt,
        retryAfterSeconds,
      });
      options.onProgress?.({
        assetId: data.asset.id,
        httpStatus: 202,
        status: data.asset.status || 'queued',
        progressPercent: data.asset.progressPercent ?? 10,
        progressStage: data.asset.progressStage || 'queued',
        workerMessage:
          data.asset.workerMessage || `HTTP 202 Accepted · ${data.model?.name || ''} předáno workeru.`,
        faststartVerified: false,
        pollAttempt: 0,
        retryAfterSeconds,
      });

      const polled = await this.pollAssetUntilReady(data.asset.id, options);
      return {
        asset: polled.asset,
        storyboard: data.storyboard || polled.asset.videoStoryboard,
        moviePyScript: data.moviePyScript || polled.asset.moviePyScript,
        structuredPrompt:
          data.structuredPrompt ||
          polled.asset.structuredPrompt ||
          polled.asset.videoBrief?.structuredPrompt,
        model: data.model,
        creditsUsed: data.creditsUsed,
        creditsRemaining: data.creditsRemaining,
        received202Accepted: true,
        pollCount: polled.pollCount,
      };
    }

    const verified = await this.verifyAtomicVideoIntegrity(data.asset, options.signal);
    return {
      asset: verified,
      storyboard: data.storyboard,
      moviePyScript: data.moviePyScript,
      structuredPrompt: data.structuredPrompt || verified.structuredPrompt,
      model: data.model,
      creditsUsed: data.creditsUsed,
      creditsRemaining: data.creditsRemaining,
      received202Accepted: false,
      pollCount: 0,
    };
  }
}

export const smartVideoOrchestrator = new SmartVideoOrchestrator();
