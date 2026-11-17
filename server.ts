/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db } from './src/server/db.ts';
import { generateOpenApi31Spec } from './src/server/openapi.ts';
import { AgentOrchestrator } from './src/server/runtime/orchestrator.ts';
import { BoardroomEngine } from './src/server/boardroom.ts';
import { MoviePyCompiler } from './src/server/runtime/moviepy.ts';
import { VideoDirectorEngine } from './src/server/runtime/videoDirector.ts';
import { TracerService } from './src/server/runtime/tracer.ts';
import { buildNextCommands, runTitanCoreMadLipz } from './src/engines/titancore_madlipz.ts';
import {
  buildAgentWorkflowPlan,
  buildSdkAndCliSnippets,
  createComputeInstanceRecord,
  createLoraTrainingJobRecord,
  createServerlessEndpointRecord,
  executeInfraWorkflow,
  getFalCatalog,
  GPU_OFFERINGS,
  MCP_TOOLS,
  PRESET_INFRA_WORKFLOWS,
  runFalUnifiedInference,
} from './src/engines/fal_infrastructure.ts';
import {
  MediaRenderer,
  inspectMp4Atoms,
  parseHttpRange,
  slugifyFilename,
  signMediaStreamToken,
  verifyMediaStreamToken,
  STORAGE_ROOT,
} from './src/server/runtime/mediaRenderer.ts';
import {
  analyzeTrendingVideoOpportunity,
  createPendingVideoAsset,
  enqueueBackgroundVideoRenderJob,
  executeVideoRenderJob,
} from './src/server/runtime/videoJobRunner.ts';
import { EvalsRunner } from './src/server/evals.ts';
import { MemoryService } from './src/server/runtime/memory.ts';
import {
  ALL_PERMISSIONS,
  getDefaultPermissionsForRole,
  hasPermission,
  PERMISSION_LABELS,
  ROLE_LABELS,
  validateAccountInput,
  validateInviteInput,
} from './src/server/runtime/rbac.ts';
import {
  deriveContentRecommendations,
  filterAnalyticsByPlatform,
} from './src/server/runtime/analyticsInsights.ts';
import {
  enhanceStructuredPromptLocally,
  parseStructuredPromptFromText,
  scoreStructuredPromptCompleteness,
} from './src/utils/structuredVideoPrompt.ts';
import { optimizePromptForMonetization } from './src/utils/monetizationCheatsheets.ts';
import {
  AiPromptEnhanceError,
  enhanceStructuredPromptWithGemini,
} from './src/server/runtime/aiPromptEnhancer.ts';
import {
  analyzeCommentWithMultiCore,
  generatePinnedCommentPack,
  pickBestReplyStrategy,
} from './src/server/runtime/commentIntelligence.ts';
import {
  CommentReplyStrategy,
  FactoryAsset,
  MultiGenMode,
  RolePermission,
  SocialComment,
  StructuredVideoPrompt,
  UserRole,
  VideoSharingPlatform,
} from './src/types/nexus.ts';
import { computeAgentRevenueContributions } from './src/server/runtime/revenueAttribution.ts';
import { buildOptimizedBatchSchedule } from './src/utils/batchVideoQueue.ts';
import {
  generateAdaptableMcpEndpoint,
  handleMcpJsonRpc,
  HUB_MCP_PROMPTS,
  HUB_MCP_RESOURCES,
  HUB_MCP_TOOLS,
  runMultiGenToolkit,
} from './src/engines/mcp_hub.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isTestMode =
  process.env.NODE_ENV === 'test' ||
  process.env.NEXUS_SKIP_LISTEN === '1' ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.execArgv.some((arg) => arg.includes('test')) ||
  process.argv.some((arg) => arg === '--test' || arg.includes('.test.'));

function checkActorPermission(req: Request, res: Response, permission: RolePermission): boolean {
  const headerActorId = req.headers['x-nexus-actor-id'] as string | undefined;
  const actor = headerActorId
    ? db.teamMembers.find((m) => m.id === headerActorId)
    : db.getCurrentActor();

  if (!hasPermission(actor, permission)) {
    res.status(403).json({
      error: `Přístup odepřen (RBAC): Vaše role (${actor ? ROLE_LABELS[actor.role] : 'Neznámá'}) nemá oprávnění "${PERMISSION_LABELS[permission]}".`,
      requiredPermission: permission,
    });
    return false;
  }
  return true;
}

function ensureSystemActive(res: Response): boolean {
  if (db.isSystemPaused) {
    res.status(423).json({
      error: 'NEXUS X OS je aktuálně pozastaven (Nouzový Kill Switch). Obnovte systém v horní liště před spuštěním exekuce.',
      isSystemPaused: true,
    });
    return false;
  }
  return true;
}

app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use((err: any, _req: Request, res: Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Neplatný JSON formát požadavku.' });
  }
  return next(err);
});

app.use((req: Request, res: Response, next: express.NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  res.setHeader('X-Request-Id', reqId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (!isTestMode && req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => {
      if (res.statusCode < 500) {
        db.schedulePersist();
      }
    });
  }
  next();
});

// 1. OpenAPI 3.1 & Interactive Docs
app.get('/openapi.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(generateOpenApi31Spec());
});

app.get('/docs', (req: Request, res: Response) => {
  const html = `<!doctype html>
<html>
  <head>
    <title>NEXUS X OS - OpenAPI 3.1 Dokumentace</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest/style.css" />
    <style>
      body { margin: 0; background-color: #090a0f; color: #fff; font-family: ui-sans-serif, system-ui; }
    </style>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest"></script>
  </body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// 2. Health, Readiness & System Pause
app.get('/healthz', (req: Request, res: Response) => {
  res.json({
    status: db.isSystemPaused ? 'paused' : 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    agentsCount: db.agents.length,
    opportunitiesCount: db.opportunities.length,
  });
});

app.get('/readyz', (_req: Request, res: Response) => {
  res.json({
    status: 'ready',
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.round(process.uptime()),
    mediaStorageRoot: STORAGE_ROOT,
    assetsCount: db.factoryAssets.length,
    endpointsCount: db.serverlessEndpoints.length,
  });
});

app.post('/v1/system/pause', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'system_kill_switch')) return;
  db.isSystemPaused = !db.isSystemPaused;
  db.activities.unshift({
    id: `act-${Date.now()}`,
    title: db.isSystemPaused ? 'Systém byl pozastaven (Kill Switch)' : 'Systém byl obnoven',
    description: `Operátor změnil systémový stav na: ${db.isSystemPaused ? 'PAUSED' : 'ACTIVE'}.`,
    agent: 'CTO Agent',
    timestamp: new Date().toISOString(),
    type: 'system',
  });
  res.json({
    isSystemPaused: db.isSystemPaused,
    message: db.isSystemPaused ? 'NEXUS X OS byl úspěšně pozastaven.' : 'NEXUS X OS byl úspěšně obnoven do provozu.',
  });
});

// 3. Threads & Messages (NEO Chat OS)
app.get('/v1/threads', (req: Request, res: Response) => {
  res.json(db.threads);
});

app.post('/v1/threads', (req: Request, res: Response) => {
  const { title } = req.body;
  const newThread = {
    id: `th-${Date.now().toString(36)}`,
    title: title || 'Nová exekutivní relace',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messagesCount: 0,
  };
  db.threads.unshift(newThread);
  db.messages.set(newThread.id, []);
  res.status(201).json(newThread);
});

app.get('/v1/threads/:id/messages', (req: Request, res: Response) => {
  const messages = db.messages.get(req.params.id) || [];
  res.json(messages);
});

app.post('/v1/threads/:id/messages', async (req: Request, res: Response) => {
  const threadId = req.params.id;
  const { content, dryRun = false, modelId, multiGenMode } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Obsah zprávy je povinný.' });
  }

  const normalizedMode: MultiGenMode | undefined =
    typeof multiGenMode === 'string' &&
    ['chat', 'image', 'video', 'movie', 'sketch', 'meme'].includes(multiGenMode)
      ? (multiGenMode as MultiGenMode)
      : undefined;

  // Save user message
  const userMsg = {
    id: `msg-usr-${Date.now()}`,
    threadId,
    role: 'user' as const,
    content,
    modelId: typeof modelId === 'string' ? modelId : undefined,
    multiGenMode: normalizedMode,
    createdAt: new Date().toISOString(),
  };
  const list = db.messages.get(threadId) || [];
  list.push(userMsg);
  db.messages.set(threadId, list);

  // Check if client accepts SSE
  const acceptsSse = req.headers.accept?.includes('text/event-stream');

  if (acceptsSse) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      const result = await AgentOrchestrator.executeGoal({
        threadId,
        userMessage: content,
        dryRun,
        modelId: typeof modelId === 'string' ? modelId : undefined,
        multiGenMode: normalizedMode,
        onStreamEvent: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
      });

      res.write(`data: ${JSON.stringify({ type: 'done', data: result.message })}\n\n`);
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  } else {
    try {
      const result = await AgentOrchestrator.executeGoal({
        threadId,
        userMessage: content,
        dryRun,
        modelId: typeof modelId === 'string' ? modelId : undefined,
        multiGenMode: normalizedMode,
      });
      res.json(result.message);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
});

// 4. Boardroom Sessions
app.get('/v1/boardroom/sessions', (req: Request, res: Response) => {
  res.json(db.boardroomSessions);
});

app.get('/v1/boardroom/sessions/:id', (req: Request, res: Response) => {
  const session = db.boardroomSessions.find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Zasedání nenalezeno' });
  res.json(session);
});

app.post('/v1/boardroom/sessions', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;
  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'Téma zasedání je povinné.' });

  try {
    const session = await BoardroomEngine.conveneSession(topic);
    res.status(201).json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Agents & Revenue Contribution Attribution
app.get('/v1/agents', (req: Request, res: Response) => {
  const computed = computeAgentRevenueContributions(
    db.agents,
    db.factoryAssets,
    db.opportunities,
    db.activities
  );
  res.json(computed.agents);
});

app.get('/v1/agents/revenue-contribution', (_req: Request, res: Response) => {
  const computed = computeAgentRevenueContributions(
    db.agents,
    db.factoryAssets,
    db.opportunities,
    db.activities
  );
  res.json(computed);
});

app.patch('/v1/agents/:id', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'manage_team')) return;
  const agent = db.agents.find((a) => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent nenalezen.' });

  const { status } = req.body;
  if (status && ['active', 'paused'].includes(status)) {
    agent.status = status;
  }
  res.json(agent);
});

// 6. Opportunities & Pipeline
app.get('/v1/opportunities', (req: Request, res: Response) => {
  res.json(db.opportunities);
});

app.patch('/v1/opportunities/:id', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  const opp = db.opportunities.find((o) => o.id === req.params.id);
  if (!opp) return res.status(404).json({ error: 'Příležitost nenalezena.' });

  const { status } = req.body;
  if (status && ['new', 'active', 'won', 'paused', 'closed'].includes(status)) {
    opp.status = status;
    opp.updatedAt = new Date().toISOString();
  }
  res.json(opp);
});

app.get('/v1/revenue/autonomous-loop', (_req: Request, res: Response) => {
  res.json({
    isAutonomousRevenueLoopActive: db.isAutonomousRevenueLoopActive,
    isAutonomousLoopActive: db.isAutonomousRevenueLoopActive,
  });
});

app.post('/v1/revenue/autonomous-loop', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  const next = typeof req.body?.active === 'boolean' ? req.body.active : !db.isAutonomousRevenueLoopActive;
  db.isAutonomousRevenueLoopActive = next;
  db.activities.unshift({
    id: `act-${Date.now()}-revloop`,
    title: next ? 'Autonomní monetizační smyčka zapnuta' : 'Autonomní monetizační smyčka pozastavena',
    description: `Operátor přepnul 24/7 ověřování CPC a konverzí na stav: ${next ? 'AKTIVNÍ' : 'VYPNUTO'}.`,
    agent: 'Revenue Agent',
    timestamp: new Date().toISOString(),
    type: 'system',
  });
  res.json({
    isAutonomousRevenueLoopActive: db.isAutonomousRevenueLoopActive,
    isAutonomousLoopActive: db.isAutonomousRevenueLoopActive,
  });
});

// 7. Factory Assets, Media Vault & Video Generations (FFmpeg H.264/AAC + MoviePy)
async function resolveReadyVideoFile(assetId: string): Promise<
  | { status: 'not_found' }
  | { status: 'generating'; asset: (typeof db.factoryAssets)[number] }
  | { status: 'ready'; asset: (typeof db.factoryAssets)[number]; filePath: string; posterPath: string }
> {
  let asset = db.factoryAssets.find((a) => a.id === assetId);
  if (!asset || asset.line !== 'video') {
    // Check if video file or preview exists on disk across storage
    const potentialPaths = [
      MediaRenderer.getAssetFilePath('th-main-001', assetId),
      MediaRenderer.getAssetFilePath('th-preview-test', assetId),
    ];
    let foundPath = potentialPaths.find((p) => fs.existsSync(p) && fs.statSync(p).size > 0);
    if (!foundPath && fs.existsSync(STORAGE_ROOT)) {
      try {
        const subdirs = fs.readdirSync(STORAGE_ROOT);
        for (const sub of subdirs) {
          const candidate = path.join(STORAGE_ROOT, sub, `${assetId}.mp4`);
          if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
            foundPath = candidate;
            break;
          }
        }
      } catch {
        // ignore
      }
    }
    if (foundPath) {
      const checksum = MediaRenderer.computeFileChecksum(foundPath);
      const newAsset: (typeof db.factoryAssets)[number] = {
        id: assetId,
        threadId: path.basename(path.dirname(foundPath)),
        line: 'video',
        title: `Discovered Video ${assetId}`,
        body: 'Discovered from local video storage',
        meta: 'Local Storage Discovery',
        status: 'ready',
        faststartVerified: true,
        filePath: foundPath,
        sizeBytes: checksum.sizeBytes,
        sha256: checksum.sha256,
        durationSec: 3,
        mimeType: 'video/mp4',
        createdAt: new Date().toISOString(),
      };
      db.factoryAssets.unshift(newAsset);
      asset = newAsset;
    } else {
      return { status: 'not_found' };
    }
  }

  if (asset.status === 'queued' || asset.status === 'rendering') {
    return { status: 'generating', asset };
  }

  const threadId = asset.threadId || 'th-main-001';
  const expectedPath = asset.filePath || MediaRenderer.getAssetFilePath(threadId, asset.id);
  const expectedPoster = MediaRenderer.getPosterFilePath(threadId, asset.id);

  let fileExists = false;
  try {
    const st = await fs.promises.stat(expectedPath);
    fileExists = st.isFile() && st.size > 0;
  } catch {
    fileExists = false;
  }

  if (!fileExists) {
    const artifact = await MediaRenderer.ensureReferenceVideoFile(
      asset.id,
      threadId,
      asset.title,
      asset.videoStoryboard?.aspectRatio || '9:16'
    );
    asset.filePath = artifact.filePath;
    asset.sizeBytes = artifact.sizeBytes;
    asset.sha256 = artifact.sha256;
    asset.durationSec = artifact.durationSec;
    asset.resolution = artifact.resolution;
    asset.mimeType = 'video/mp4';
    asset.streamUrl = `/api/v1/assets/${asset.id}/stream`;
    asset.downloadUrl = `/api/v1/assets/${asset.id}/download`;
    asset.status = 'ready';
  }

  const filePath = asset.filePath || expectedPath;
  if (!asset.faststartVerified) {
    const atomCheck = inspectMp4Atoms(filePath);
    if (atomCheck.moovBeforeMdat) {
      asset.faststartVerified = true;
    } else {
      const remux = await MediaRenderer.ensureFaststartMp4(filePath);
      asset.faststartVerified = remux.faststartVerified;
    }
  }
  await MediaRenderer.ensurePosterFile(filePath, expectedPoster);
  if (!asset.sizeBytes || !asset.sha256) {
    const checksum = MediaRenderer.computeFileChecksum(filePath);
    asset.sizeBytes = checksum.sizeBytes;
    asset.sha256 = checksum.sha256;
  }
  if (!asset.streamUrl) asset.streamUrl = `/api/v1/assets/${asset.id}/stream`;
  if (!asset.downloadUrl) asset.downloadUrl = `/api/v1/assets/${asset.id}/download`;
  if (!asset.status) asset.status = 'ready';

  return { status: 'ready', asset, filePath, posterPath: expectedPoster };
}

function validateStreamAuthAndCors(req: Request, res: Response, assetId: string): boolean {
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  const host = req.headers.host || 'localhost:3000';

  const expiresRaw = req.query.expires as string | undefined;
  const signatureRaw = req.query.signature as string | undefined;
  let tokenValidated = false;

  if (expiresRaw !== undefined || signatureRaw !== undefined) {
    const check = verifyMediaStreamToken(assetId, expiresRaw, signatureRaw);
    if (!check.valid) {
      res.status(403).json({ error: check.reason || 'Neautorizovaný přístup ke streamu.' });
      return false;
    }
    tokenValidated = true;
  }

  // Optional strict hotlink protection when STRICT_HOTLINK_CHECK=1 (allows same-origin, localhost, AI Studio, or signed tokens)
  if (process.env.STRICT_HOTLINK_CHECK === '1' && !tokenValidated) {
    const sourceUrl = origin || referer || '';
    if (
      sourceUrl &&
      !sourceUrl.includes(host) &&
      !sourceUrl.includes('localhost') &&
      !sourceUrl.includes('127.0.0.1') &&
      !sourceUrl.includes('run.app')
    ) {
      res.status(403).json({ error: 'Hotlinking videa bez podepsaného tokenu není povolen.' });
      return false;
    }
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin, Range');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Vary', 'Range');
  }
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Range, Accept-Ranges, Content-Length, ETag, Content-Disposition, Retry-After'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, If-Range, If-None-Match, Authorization');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('X-No-Compression', '1');
  return true;
}

function pipeFileSafely(
  req: Request,
  res: Response,
  filePath: string,
  range?: { start: number; end: number }
) {
  const stream = range
    ? fs.createReadStream(filePath, { start: range.start, end: range.end })
    : fs.createReadStream(filePath);

  const cleanup = () => {
    if (!stream.destroyed) {
      stream.destroy();
    }
  };

  res.on('close', cleanup);
  req.on('aborted', cleanup);
  stream.on('error', (streamErr) => {
    cleanup();
    if (!res.headersSent) {
      res.status(500).json({ error: streamErr.message });
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  return stream.pipe(res);
}

app.get('/v1/factory/assets', (req: Request, res: Response) => {
  const sorted = [...db.factoryAssets]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((asset) => ({
      ...asset,
      yppScore: asset.yppScore ?? asset.titanCoreManifest?.ypp_score ?? (asset.line === 'video' ? 92 : undefined),
      renderStatus: asset.renderStatus ?? asset.status ?? 'ready',
      openSourceGenPrompt:
        asset.openSourceGenPrompt ?? asset.titanCoreManifest?.asset_bridge?.opensourcegen_prompt,
      agnesManifest: asset.agnesManifest ?? asset.titanCoreManifest?.asset_bridge?.agnes_manifest,
      nextCommands:
        asset.nextCommands ??
        asset.titanCoreManifest?.next_commands ??
        buildNextCommands({
          series_name: asset.title,
          episode_number: 1,
          target_duration_sec: Math.max(10, Math.min(25, asset.durationSec || 15)),
        }),
    }));
  res.json(sorted);
});

app.get('/api/v1/assets', (req: Request, res: Response) => {
  const threadId = req.query.thread_id as string | undefined;
  const lineFilter = (req.query.line as string | undefined) || (req.query.type as string | undefined);
  const statusFilter = req.query.status as string | undefined;

  const filtered = db.factoryAssets
    .filter((asset) => {
      if (threadId && asset.threadId !== threadId) return false;
      if (lineFilter && lineFilter !== 'all' && asset.line !== lineFilter) return false;
      if (statusFilter && statusFilter !== 'all' && (asset.status || 'ready') !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const mapped = filtered.map((a) => ({
    ...a,
    posterUrl: a.line === 'video' ? `/api/v1/assets/${a.id}/stream?format=poster` : undefined,
    previewUrl: a.line === 'video' ? `/api/v1/assets/${a.id}/preview` : undefined,
  }));

  res.json({
    assets: mapped,
    total: mapped.length,
  });
});

app.get('/api/v1/assets/:asset_id', async (req: Request, res: Response) => {
  const asset = db.factoryAssets.find((a) => a.id === req.params.asset_id);
  if (!asset) {
    return res.status(404).json({ error: 'Video asset nebyl nalezen v Media Vaultu.' });
  }
  if (asset.line === 'video' && asset.status !== 'queued' && asset.status !== 'rendering') {
    await resolveReadyVideoFile(asset.id);
  }
  const signed = signMediaStreamToken(asset.id);
  res.json({
    ...asset,
    posterUrl: asset.line === 'video' ? `/api/v1/assets/${asset.id}/stream?format=poster` : undefined,
    previewUrl: asset.line === 'video' ? `/api/v1/assets/${asset.id}/preview` : undefined,
    signedStreamUrl:
      asset.line === 'video'
        ? `/api/v1/assets/${asset.id}/stream?expires=${signed.expires}&signature=${signed.signature}`
        : undefined,
  });
});

const handleAssetStatusPoll = async (req: Request, res: Response) => {
  const asset = db.factoryAssets.find((a) => a.id === req.params.asset_id);
  if (!asset || asset.line !== 'video') {
    return res.status(404).json({ error: 'Video úloha nebyla nalezena.' });
  }

  res.setHeader('Cache-Control', 'no-store');

  if (asset.status === 'queued' || asset.status === 'rendering') {
    res.setHeader('Retry-After', '1');
    return res.status(202).json({
      assetId: asset.id,
      status: asset.status,
      progressPercent: asset.progressPercent ?? (asset.status === 'queued' ? 10 : 50),
      progressStage: asset.progressStage || asset.status,
      workerMessage:
        asset.workerMessage ||
        'Background worker zpracovává FFmpeg H.264/AAC +faststart render...',
      faststartVerified: Boolean(asset.faststartVerified),
      retryAfterSeconds: 1,
      asset,
    });
  }

  if (asset.status === 'failed') {
    return res.status(500).json({
      assetId: asset.id,
      status: 'failed',
      progressPercent: asset.progressPercent ?? 0,
      progressStage: 'failed',
      workerMessage: asset.workerMessage || 'Render videa selhal.',
      faststartVerified: false,
      asset,
    });
  }

  const resolved = await resolveReadyVideoFile(asset.id);
  if (resolved.status !== 'ready') {
    res.setHeader('Retry-After', '1');
    return res.status(202).json({
      assetId: asset.id,
      status: 'rendering',
      progressPercent: 90,
      progressStage: 'verifying_integrity',
      workerMessage: 'Ověřuji atomickou integritu MP4 před zpřístupněním...',
      faststartVerified: false,
      retryAfterSeconds: 1,
      asset,
    });
  }

  return res.status(200).json({
    assetId: resolved.asset.id,
    status: 'ready',
    progressPercent: 100,
    progressStage: 'ready',
    workerMessage:
      resolved.asset.workerMessage ||
      'MP4 je připraveno pro webový stream (-movflags +faststart ověřeno).',
    faststartVerified: Boolean(resolved.asset.faststartVerified),
    asset: {
      ...resolved.asset,
      posterUrl: `/api/v1/assets/${resolved.asset.id}/stream?format=poster`,
    },
  });
};

app.get('/api/v1/assets/:asset_id/status', handleAssetStatusPoll);
app.get('/v1/factory/jobs/:asset_id', handleAssetStatusPoll);

const handleAssetStream = async (req: Request, res: Response) => {
  try {
    if (!validateStreamAuthAndCors(req, res, req.params.asset_id)) {
      return;
    }

    const resolved = await resolveReadyVideoFile(req.params.asset_id);
    if (resolved.status === 'not_found') {
      return res.status(404).json({ error: 'Video asset nebyl nalezen nebo není typu video.' });
    }
    if (resolved.status === 'generating') {
      res.setHeader('Retry-After', '2');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(202).json({
        status: resolved.asset.status,
        retryAfterSeconds: 2,
        message: 'Video asset se právě renderuje nebo remuxuje. Opakujte požadavek za 2 sekundy.',
      });
    }

    const { asset, filePath, posterPath } = resolved;
    const isPoster = req.query.format === 'poster';
    const isDownload = req.query.download === '1' || req.query.download === 'true';

    // Serve lightweight JPEG poster frame when ?format=poster is requested
    if (isPoster) {
      const posterStat = await fs.promises.stat(posterPath);
      const posterEtag = `"poster-${asset.id}-${posterStat.size.toString(16)}"`;
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', posterStat.size);
      res.setHeader('ETag', posterEtag);
      res.setHeader('Last-Modified', new Date(posterStat.mtimeMs).toUTCString());
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Disposition', 'inline');

      if (req.headers['if-none-match'] === posterEtag) {
        return res.status(304).end();
      }
      res.status(200);
      if (req.method === 'HEAD') return res.end();
      return pipeFileSafely(req, res, posterPath);
    }

    const stat = await fs.promises.stat(filePath);
    const totalSize = stat.size;
    const etag = `"sha256-${(asset.sha256 || '').slice(0, 24) || totalSize.toString(16)}"`;
    const lastModified = new Date(stat.mtimeMs).toUTCString();
    const mimeType = asset.mimeType || 'video/mp4';
    const downloadName = `nexus-video-${slugifyFilename(asset.title)}-${asset.id}.mp4`;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', lastModified);

    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    // Optional reverse-proxy internal offload (X-Accel-Redirect / X-Sendfile)
    const offloadHeader = process.env.STREAM_OFFLOAD_HEADER;
    if (offloadHeader && !req.headers.range && req.method === 'GET') {
      const prefix = process.env.STREAM_OFFLOAD_PREFIX || '/internal-videos';
      const relPath = path.relative(STORAGE_ROOT, filePath).replace(/\\/g, '/');
      const target = offloadHeader.toLowerCase() === 'x-sendfile' ? filePath : `${prefix}/${relPath}`;
      res.setHeader(offloadHeader, target);
      return res.status(200).end();
    }

    const rawRangeHeader = req.headers.range;
    const ifRangeHeader = req.headers['if-range'];
    const ifRangeMatches =
      !ifRangeHeader || ifRangeHeader === etag || ifRangeHeader === lastModified;

    if (!rawRangeHeader && !isDownload && req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    if (rawRangeHeader && ifRangeMatches) {
      const parsed = parseHttpRange(rawRangeHeader, totalSize);
      if (parsed && !parsed.valid) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }
      if (parsed && parsed.valid) {
        const chunkSize = parsed.end - parsed.start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${parsed.start}-${parsed.end}/${totalSize}`);
        res.setHeader('Content-Length', chunkSize);
        if (req.method === 'HEAD') return res.end();
        return pipeFileSafely(req, res, filePath, { start: parsed.start, end: parsed.end });
      }
    }

    res.status(200);
    res.setHeader('Content-Length', totalSize);
    if (req.method === 'HEAD') return res.end();
    return pipeFileSafely(req, res, filePath);
  } catch (err: any) {
    return res.status(500).json({ error: `Chyba při streamování videa: ${err.message}` });
  }
};

app
  .route('/api/v1/assets/:asset_id/stream')
  .options((req: Request, res: Response) => {
    validateStreamAuthAndCors(req, res, req.params.asset_id);
    return res.status(204).end();
  })
  .head(handleAssetStream)
  .get(handleAssetStream);

const handleAssetPreview = async (req: Request, res: Response) => {
  try {
    const assetId = req.params.asset_id;
    if (!validateStreamAuthAndCors(req, res, assetId)) {
      return;
    }

    const resolved = await resolveReadyVideoFile(assetId);
    if (resolved.status === 'not_found') {
      return res.status(404).json({ error: 'Video asset nebyl nalezen nebo není typu video.' });
    }
    if (resolved.status === 'generating') {
      res.setHeader('Retry-After', '2');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(202).json({
        status: resolved.asset.status,
        retryAfterSeconds: 2,
        message: 'Video asset se právě generuje, transient preview bude k dispozici po dokončení.',
      });
    }

    const { asset, filePath } = resolved;
    const requestedDuration = Number.parseFloat(
      (req.query.duration as string) || (req.body?.duration as string) || '2.5'
    );
    const forceRegenerate =
      req.query.force === '1' || req.query.force === 'true' || req.body?.force === true;

    const previewArtifact = await MediaRenderer.ensurePreviewSnippet({
      assetId: asset.id,
      threadId: asset.threadId || 'th-main-001',
      sourcePath: filePath,
      durationSec: Number.isNaN(requestedDuration) ? 2.5 : requestedDuration,
      forceRegenerate,
    });

    const isJsonRequest =
      req.query.format === 'json' ||
      Boolean(req.headers.accept && req.headers.accept.includes('application/json')) ||
      req.method === 'POST';

    if (isJsonRequest) {
      return res.status(req.method === 'POST' ? 201 : 200).json({
        status: 'ready',
        assetId: asset.id,
        previewUrl: `/api/v1/assets/${asset.id}/preview`,
        durationSec: previewArtifact.durationSec,
        sizeBytes: previewArtifact.sizeBytes,
        sha256: previewArtifact.sha256,
        cached: previewArtifact.cached,
        faststartVerified: previewArtifact.faststartVerified,
        renderedWithFfmpeg: previewArtifact.renderedWithFfmpeg,
      });
    }

    const previewStat = await fs.promises.stat(previewArtifact.previewPath);
    const totalSize = previewStat.size;
    const etag = `"preview-${asset.id}-${(previewArtifact.sha256 || '').slice(0, 16) || totalSize.toString(16)}"`;
    const lastModified = new Date(previewStat.mtimeMs).toUTCString();

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', lastModified);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    res.setHeader('X-Preview-Transient', '1');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    const rawRangeHeader = req.headers.range;
    const ifRangeHeader = req.headers['if-range'];
    const ifRangeMatches =
      !ifRangeHeader || ifRangeHeader === etag || ifRangeHeader === lastModified;

    if (rawRangeHeader && ifRangeMatches) {
      const parsed = parseHttpRange(rawRangeHeader, totalSize);
      if (parsed && !parsed.valid) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }
      if (parsed && parsed.valid) {
        const chunkSize = parsed.end - parsed.start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${parsed.start}-${parsed.end}/${totalSize}`);
        res.setHeader('Content-Length', chunkSize);
        if (req.method === 'HEAD') return res.end();
        return pipeFileSafely(req, res, previewArtifact.previewPath, {
          start: parsed.start,
          end: parsed.end,
        });
      }
    }

    res.status(200);
    res.setHeader('Content-Length', totalSize);
    if (req.method === 'HEAD') return res.end();
    return pipeFileSafely(req, res, previewArtifact.previewPath);
  } catch (err: any) {
    return res.status(500).json({ error: `Chyba při generování preview videa: ${err.message}` });
  }
};

app
  .route('/api/v1/assets/:asset_id/preview')
  .options((req: Request, res: Response) => {
    validateStreamAuthAndCors(req, res, req.params.asset_id);
    return res.status(204).end();
  })
  .head(handleAssetPreview)
  .get(handleAssetPreview)
  .post(handleAssetPreview);

app
  .route('/v1/preview/:asset_id')
  .options((req: Request, res: Response) => {
    validateStreamAuthAndCors(req, res, req.params.asset_id);
    return res.status(204).end();
  })
  .head(handleAssetPreview)
  .get(handleAssetPreview)
  .post(handleAssetPreview);

app.get('/api/v1/assets/:asset_id/download', async (req: Request, res: Response) => {
  try {
    if (!validateStreamAuthAndCors(req, res, req.params.asset_id)) {
      return;
    }

    const resolved = await resolveReadyVideoFile(req.params.asset_id);
    if (resolved.status === 'not_found') {
      return res.status(404).json({ error: 'Video asset nebyl nalezen v Media Vaultu.' });
    }
    if (resolved.status === 'generating') {
      res.setHeader('Retry-After', '2');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(202).json({
        status: resolved.asset.status,
        retryAfterSeconds: 2,
        message: 'Video asset se právě dokončuje. Stažení bude dostupné za okamžik.',
      });
    }

    const { asset, filePath } = resolved;
    const stat = await fs.promises.stat(filePath);
    const downloadName = `nexus-video-${slugifyFilename(asset.title)}-${asset.id}.mp4`;

    res.status(200);
    res.setHeader('Content-Type', asset.mimeType || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'HEAD') return res.end();
    return pipeFileSafely(req, res, filePath);
  } catch (err: any) {
    return res.status(500).json({ error: `Chyba při stahování videa: ${err.message}` });
  }
});

app.post('/api/v1/assets/render', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;
  const {
    topic,
    title,
    threadId = 'th-main-001',
    format = '9:16',
    templateId,
    dryRun = false,
    durationSec = 6,
    async: isAsync = false,
    structuredPrompt,
  } = req.body as {
    topic?: string;
    title?: string;
    threadId?: string;
    format?: string;
    templateId?: string;
    dryRun?: boolean;
    durationSec?: number;
    async?: boolean;
    structuredPrompt?: StructuredVideoPrompt;
  };

  const resolvedTopic = (topic || title || structuredPrompt?.subject?.primarySubject || '').trim();
  if (!resolvedTopic) {
    return res.status(400).json({ error: 'Parametr topic nebo title je povinný.' });
  }

  const template = templateId ? db.userTemplates.find((t) => t.id === templateId) : undefined;
  const aspectRatio: '9:16' | '16:9' =
    structuredPrompt?.aspectRatio || (format === '16:9' ? '16:9' : '9:16');
  const analyzed = await VideoDirectorEngine.analyzePrompt({
    userMessage: `${resolvedTopic} ${aspectRatio}`,
    forceDefaults: true,
    structuredPrompt,
  });
  const brief = {
    ...analyzed.brief,
    aspectRatio,
    durationSec: structuredPrompt?.totalDurationSec || durationSec || analyzed.brief.durationSec,
    ...(title ? { title } : {}),
  };

  const assetId = `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const storyboard = MoviePyCompiler.createBriefDrivenStoryboard(brief, template);
  const moviePyScript = MoviePyCompiler.generatePythonScript(storyboard, template);

  const pendingAsset = createPendingVideoAsset({
    assetId,
    threadId,
    prompt: resolvedTopic,
    aspectRatio,
    brief,
    storyboard,
    moviePyScript,
    template,
    structuredPrompt: brief.structuredPrompt,
    dryRun: Boolean(dryRun),
  });
  db.factoryAssets.unshift(pendingAsset);

  if (isAsync) {
    enqueueBackgroundVideoRenderJob({
      asset: pendingAsset,
      threadId,
      aspectRatio,
      brief,
      storyboard,
      template,
      topic: resolvedTopic,
      dryRun: Boolean(dryRun),
    });
    res.setHeader('Retry-After', '1');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(202).json({
      status: 'accepted',
      statusCode: 202,
      retryAfterSeconds: 1,
      asset: pendingAsset,
      job: {
        assetId,
        status: pendingAsset.status,
        progressPercent: pendingAsset.progressPercent,
        progressStage: pendingAsset.progressStage,
        statusUrl: `/api/v1/assets/${assetId}/status`,
        streamUrl: `/api/v1/assets/${assetId}/stream`,
      },
      storyboard,
      moviePyScript,
      structuredPrompt: brief.structuredPrompt,
    });
  }

  try {
    const result = await executeVideoRenderJob({
      asset: pendingAsset,
      threadId,
      aspectRatio,
      brief,
      storyboard,
      template,
      topic: resolvedTopic,
      dryRun: Boolean(dryRun),
    });

    return res.status(201).json({
      asset: {
        ...result.asset,
        posterUrl: `/api/v1/assets/${result.asset.id}/stream?format=poster`,
      },
      renderedWithFfmpeg: result.renderedWithFfmpeg,
      faststartVerified: Boolean(result.asset.faststartVerified),
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Render videa selhal: ${err.message}` });
  }
});

app.post('/v1/factory/generations', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;

  const isTitanCoreRequest =
    typeof req.body?.visualDescription === 'string' || req.body?.line === 'titancore';

  if (isTitanCoreRequest) {
    const visualDescription = String(req.body?.visualDescription || req.body?.topic || '').trim();
    if (!visualDescription) {
      return res.status(400).json({
        error: 'Parametr visualDescription je povinný.',
        next_commands: buildNextCommands({
          series_name: 'MadLipz CZ Série',
          episode_number: 1,
          target_duration_sec: 15,
        }),
      });
    }

    const rawDuration = Number(req.body?.durationSec ?? 15);
    const durationSec = Number.isFinite(rawDuration)
      ? Math.max(10, Math.min(25, rawDuration))
      : 15;
    const seriesName = String(req.body?.seriesName || 'MadLipz CZ Série').trim() || 'MadLipz CZ Série';
    const episodeNumber = Math.max(1, Number(req.body?.episodeNumber || 1) || 1);
    const humorStyle =
      typeof req.body?.humorStyle === 'string' && req.body.humorStyle.trim()
        ? req.body.humorStyle.trim()
        : undefined;
    const rawVideoPath =
      typeof req.body?.rawVideoPath === 'string' && req.body.rawVideoPath.trim()
        ? req.body.rawVideoPath.trim()
        : undefined;
    const dubAudioPath =
      typeof req.body?.dubAudioPath === 'string' && req.body.dubAudioPath.trim()
        ? req.body.dubAudioPath.trim()
        : undefined;
    const threadId =
      typeof req.body?.threadId === 'string' && req.body.threadId.trim()
        ? req.body.threadId.trim()
        : 'th-main-001';
    const dryRun = Boolean(req.body?.dryRun);

    const runId = `run-tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const tracer = new TracerService(runId, threadId, `TitanCore MadLipz CZ: ${seriesName}`);

    try {
      const endRouterSpan = tracer.startSpan('titancore_multi_engine_router');
      const tcStart = Date.now();
      const tcResult = await runTitanCoreMadLipz({
        visualDescription,
        durationSec,
        seriesName,
        episodeNumber,
        humorStyle,
        rawVideoPath,
        dubAudioPath,
      });
      const tcDuration = Date.now() - tcStart;
      endRouterSpan(tcResult.traceMeta.healingIterations > 0 ? 'repaired' : 'ok', {
        engineUsed: tcResult.manifest.engine_used,
        healingIterations: tcResult.traceMeta.healingIterations,
        yppScore: tcResult.manifest.ypp_score,
        engineHistory: tcResult.traceMeta.engineHistory,
      });

      const endAuditSpan = tracer.startSpan('critic_ypp_audit');
      endAuditSpan(tcResult.audit.passed ? 'ok' : 'error', {
        passed: tcResult.audit.passed,
        issues: tcResult.audit.issues,
      });

      tracer.recordTokens(tcResult.traceMeta.promptTokens, tcResult.traceMeta.completionTokens);
      tracer.recordToolCall(
        'run_titancore_madlipz',
        { visualDescription, durationSec, seriesName, episodeNumber },
        {
          ypp_score: tcResult.manifest.ypp_score,
          healing_iterations: tcResult.manifest.healing_iterations,
          engine_used: tcResult.manifest.engine_used,
        },
        tcDuration
      );

      tracer.finish({
        goalFulfilled: tcResult.audit.passed,
        concreteness: true,
        riskAwareness: tcResult.manifest.ypp_score >= 92,
        noFictitiousMoney: true,
        repaired: tcResult.traceMeta.healingIterations > 0,
      });

      const assetId = `asset-tc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const tmpDir = path.resolve(process.cwd(), 'tmp');
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const manifestPath = path.join(tmpDir, `titancore-${assetId}.json`);
      await fs.promises.writeFile(manifestPath, JSON.stringify(tcResult.manifest, null, 2), 'utf-8');

      const mp4FilePath = MediaRenderer.getAssetFilePath(threadId, assetId);
      await fs.promises.mkdir(path.dirname(mp4FilePath), { recursive: true });
      const posterPath = MediaRenderer.getPosterFilePath(threadId, assetId);

      const newAsset: FactoryAsset = {
        id: assetId,
        threadId,
        line: 'video',
        title: tcResult.manifest.youtube_metadata.title,
        prompt: visualDescription,
        body: tcResult.manifest.blocks
          .map((b) => `[${b.start_sec.toFixed(1)}s–${b.end_sec.toFixed(1)}s | ${b.role}] ${b.voiceover_cz}`)
          .join('\n'),
        meta: `TitanCore MadLipz CZ · YPP ${tcResult.manifest.ypp_score}/100 · ${tcResult.manifest.target_duration_sec}s · ${tcResult.manifest.engine_used}`,
        tags: tcResult.manifest.youtube_metadata.tags,
        status: 'rendering',
        renderStatus: 'rendering',
        progressPercent: 30,
        progressStage: 'rendering_ffmpeg',
        workerMessage: 'MoviePy 2.x YPP-safe pipeline renderuje MP4...',
        filePath: mp4FilePath,
        mimeType: 'video/mp4',
        durationSec: tcResult.manifest.target_duration_sec,
        resolution: tcResult.manifest.delivery.resolution,
        faststartVerified: false,
        streamUrl: `/api/v1/assets/${assetId}/stream`,
        downloadUrl: `/api/v1/assets/${assetId}/download`,
        posterUrl: `/api/v1/assets/${assetId}/stream?format=poster`,
        yppScore: tcResult.manifest.ypp_score,
        healingIterations: tcResult.manifest.healing_iterations,
        manifestPath,
        runId,
        openSourceGenPrompt: tcResult.manifest.asset_bridge.opensourcegen_prompt,
        agnesManifest: tcResult.manifest.asset_bridge.agnes_manifest,
        titanCoreManifest: tcResult.manifest,
        nextCommands: tcResult.manifest.next_commands,
        createdAt: new Date().toISOString(),
      };

      db.factoryAssets.unshift(newAsset);

      db.activities.unshift({
        id: `act-${Date.now()}-tc`,
        title: `TitanCore MadLipz CZ: ${tcResult.manifest.series_name} #${tcResult.manifest.episode_number}`,
        description: `YPP skóre ${tcResult.manifest.ypp_score}/100 · Self-Healing iterací: ${tcResult.manifest.healing_iterations} · Engine: ${tcResult.manifest.engine_used}`,
        agent: 'Video Agent',
        timestamp: new Date().toISOString(),
        type: 'action',
      });

      const scriptPath = path.resolve(process.cwd(), 'scripts', 'render_ypp_safe.py');
      const spawnArgs = [scriptPath, '--manifest', manifestPath, '--output', mp4FilePath];
      if (!rawVideoPath || dryRun || isTestMode) {
        spawnArgs.push('--mock');
      }
      if (rawVideoPath) {
        spawnArgs.push('--raw-video', rawVideoPath);
      }
      if (dubAudioPath) {
        spawnArgs.push('--dub-audio', dubAudioPath);
      }

      const child = spawn('python3', spawnArgs, {
        cwd: process.cwd(),
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderrTail = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString('utf-8')).slice(-600);
      });

      child.on('close', async (code) => {
        if (code === 0 && fs.existsSync(mp4FilePath)) {
          try {
            const atomCheck = inspectMp4Atoms(mp4FilePath);
            if (!atomCheck.moovBeforeMdat) {
              await MediaRenderer.ensureFaststartMp4(mp4FilePath);
            }
            const checksum = MediaRenderer.computeFileChecksum(mp4FilePath);
            await MediaRenderer.ensurePosterFile(mp4FilePath, posterPath);
            newAsset.sizeBytes = checksum.sizeBytes;
            newAsset.sha256 = checksum.sha256;
            newAsset.faststartVerified = true;
            newAsset.status = 'ready';
            newAsset.renderStatus = 'ready';
            newAsset.progressPercent = 100;
            newAsset.progressStage = 'ready';
            newAsset.workerMessage = 'MoviePy 2.x YPP-safe MP4 připraveno (-movflags +faststart ověřeno).';
            return;
          } catch {
            // Fall through to failed status
          }
        }
        newAsset.status = 'failed';
        newAsset.renderStatus = 'failed';
        newAsset.progressPercent = 0;
        newAsset.progressStage = 'failed';
        newAsset.workerMessage = `MoviePy render selhal (exit ${code}): ${stderrTail || 'neznámá chyba'}`;
      });

      child.on('error', (spawnErr) => {
        newAsset.status = 'failed';
        newAsset.renderStatus = 'failed';
        newAsset.progressPercent = 0;
        newAsset.progressStage = 'failed';
        newAsset.workerMessage = `Nelze spustit python3 worker: ${spawnErr.message}`;
      });

      child.unref();
      (child.stdout as unknown as { unref?: () => void })?.unref?.();
      (child.stderr as unknown as { unref?: () => void })?.unref?.();

      return res.status(201).json({
        status: 'ok',
        runId,
        traceUrl: `/v1/runs/${runId}`,
        manifestPath,
        manifest: tcResult.manifest,
        audit: tcResult.audit,
        ypp_score: tcResult.manifest.ypp_score,
        healing_iterations: tcResult.manifest.healing_iterations,
        next_commands: tcResult.manifest.next_commands,
        asset_bridge: tcResult.manifest.asset_bridge,
        asset: newAsset,
        items: [
          {
            title: tcResult.manifest.youtube_metadata.title,
            body: tcResult.manifest.youtube_metadata.description,
            meta: `YPP ${tcResult.manifest.ypp_score}/100 · ${tcResult.manifest.target_duration_sec}s · Healing: ${tcResult.manifest.healing_iterations}`,
          },
        ],
      });
    } catch (err: any) {
      tracer.finish({
        goalFulfilled: false,
        concreteness: true,
        riskAwareness: true,
        noFictitiousMoney: true,
        repaired: false,
      });
      return res.status(500).json({
        error: `TitanCore generování selhalo: ${err.message}`,
        runId,
        traceUrl: `/v1/runs/${runId}`,
        next_commands: buildNextCommands({
          series_name: seriesName,
          episode_number: episodeNumber,
          target_duration_sec: durationSec,
        }),
      });
    }
  }

  const {
    line,
    topic,
    format = '9:16',
    templateId,
    threadId = 'th-main-001',
    dryRun = false,
    async: isAsync = false,
    structuredPrompt,
  } = req.body as {
    line?: string;
    topic?: string;
    format?: string;
    templateId?: string;
    threadId?: string;
    dryRun?: boolean;
    async?: boolean;
    structuredPrompt?: StructuredVideoPrompt;
  };
  if (!line || !topic) {
    return res.status(400).json({
      error: 'Line i topic jsou povinné.',
      next_commands: buildNextCommands({
        series_name: 'NEXUS Video Série',
        episode_number: 1,
        target_duration_sec: 15,
      }),
    });
  }

  const template = templateId
    ? db.userTemplates.find((t) => t.id === templateId)
    : undefined;

  const fallbackCommands = buildNextCommands({
    series_name: topic.slice(0, 40),
    episode_number: 1,
    target_duration_sec: 15,
  });

  const stdRunId = `run-fac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const stdTracer = new TracerService(stdRunId, threadId, `Factory ${line}: ${topic.slice(0, 60)}`);

  if (line === 'video') {
    const endPlanSpan = stdTracer.startSpan('factory_video_storyboard');
    const aspectRatio: '9:16' | '16:9' =
      structuredPrompt?.aspectRatio || (format === '16:9' ? '16:9' : '9:16');
    const assetId = `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const analyzed = await VideoDirectorEngine.analyzePrompt({
      userMessage: `${topic} ${aspectRatio}`,
      forceDefaults: true,
      structuredPrompt,
    });
    const brief = {
      ...analyzed.brief,
      aspectRatio,
    };
    const storyboard = MoviePyCompiler.createBriefDrivenStoryboard(brief, template);
    const moviePyScript = MoviePyCompiler.generatePythonScript(storyboard, template);

    const pendingAsset = createPendingVideoAsset({
      assetId,
      threadId,
      prompt: topic,
      aspectRatio,
      brief,
      storyboard,
      moviePyScript,
      template,
      structuredPrompt: brief.structuredPrompt,
      dryRun: Boolean(dryRun),
    });
    pendingAsset.nextCommands = fallbackCommands;
    db.factoryAssets.unshift(pendingAsset);

    if (isAsync) {
      enqueueBackgroundVideoRenderJob({
        asset: pendingAsset,
        threadId,
        aspectRatio,
        brief,
        storyboard,
        template,
        topic,
        dryRun: Boolean(dryRun),
      });
      endPlanSpan('ok', { mode: 'async_202', assetId, aspectRatio });
      stdTracer.recordTokens(280, 390);
      stdTracer.recordToolCall(
        'factory_enqueue_video',
        { line, topic, aspectRatio, async: true },
        { assetId, status: 'accepted' },
        15
      );
      stdTracer.finish({
        goalFulfilled: true,
        concreteness: true,
        riskAwareness: true,
        noFictitiousMoney: true,
        repaired: false,
      });
      res.setHeader('Retry-After', '1');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(202).json({
        status: 'accepted',
        statusCode: 202,
        retryAfterSeconds: 1,
        runId: stdRunId,
        traceUrl: `/v1/runs/${stdRunId}`,
        items: [
          {
            title: storyboard.title,
            body: `Hook: ${storyboard.hook} | CTA: ${storyboard.cta}`,
            meta: `Fronta workeru (${aspectRatio}), +faststart optimalizace...`,
          },
        ],
        asset: pendingAsset,
        job: {
          assetId,
          status: pendingAsset.status,
          progressPercent: pendingAsset.progressPercent,
          progressStage: pendingAsset.progressStage,
          statusUrl: `/api/v1/assets/${assetId}/status`,
          streamUrl: `/api/v1/assets/${assetId}/stream`,
        },
        storyboard,
        moviePyScript,
        next_commands: fallbackCommands,
      });
    }

    try {
      const result = await executeVideoRenderJob({
        asset: pendingAsset,
        threadId,
        aspectRatio,
        brief,
        storyboard,
        template,
        topic,
        dryRun: Boolean(dryRun),
      });
      endPlanSpan('ok', { mode: 'sync_200', assetId, faststartVerified: Boolean(result.asset.faststartVerified) });
      stdTracer.recordTokens(320, 440);
      stdTracer.recordToolCall(
        'factory_render_video',
        { line, topic, aspectRatio },
        { assetId, durationSec: result.asset.durationSec },
        40
      );
      stdTracer.finish({
        goalFulfilled: true,
        concreteness: true,
        riskAwareness: true,
        noFictitiousMoney: true,
        repaired: false,
      });

      return res.json({
        runId: stdRunId,
        traceUrl: `/v1/runs/${stdRunId}`,
        items: [
          {
            title: storyboard.title,
            body: `Hook: ${storyboard.hook} | CTA: ${storyboard.cta}`,
            meta: `YouTube ${aspectRatio}, ${result.asset.durationSec}s MP4`,
          },
        ],
        asset: {
          ...result.asset,
          posterUrl: `/api/v1/assets/${result.asset.id}/stream?format=poster`,
        },
        faststartVerified: Boolean(result.asset.faststartVerified),
        storyboard,
        moviePyScript,
        next_commands: fallbackCommands,
      });
    } catch (err: any) {
      endPlanSpan('error', { error: err?.message });
      stdTracer.finish({
        goalFulfilled: false,
        concreteness: true,
        riskAwareness: true,
        noFictitiousMoney: true,
        repaired: false,
      });
      return res.status(500).json({
        error: `Chyba při renderu MP4: ${err.message}`,
        runId: stdRunId,
        traceUrl: `/v1/runs/${stdRunId}`,
        next_commands: fallbackCommands,
      });
    }
  } else if (line === 'ad') {
    const endAdSpan = stdTracer.startSpan('factory_ad_creative');
    const asset = {
      id: `asset-${Date.now().toString(36)}`,
      threadId,
      line: 'ad' as const,
      title: `Hook: Automatizujte bez programování | Headline: Od 0 k 50k za 30 dní | CTA: Zahájit bezplatný trial`,
      body: `Reklamní kreativa pro ${topic}. Zaměřeno na konkrétní návratnost bez planých slibů.`,
      meta: 'Meta Ads & YouTube In-Stream, 3 hook varianty',
      tags: ['Meta Ads', 'Konverze', 'PPC'],
      status: 'ready' as const,
      runId: stdRunId,
      nextCommands: fallbackCommands,
      createdAt: new Date().toISOString(),
    };
    db.factoryAssets.unshift(asset);
    endAdSpan('ok', { assetId: asset.id });
    stdTracer.recordTokens(210, 310);
    stdTracer.finish({
      goalFulfilled: true,
      concreteness: true,
      riskAwareness: true,
      noFictitiousMoney: true,
      repaired: false,
    });
    return res.json({
      runId: stdRunId,
      traceUrl: `/v1/runs/${stdRunId}`,
      items: [{ title: asset.title, body: asset.body, meta: asset.meta }],
      asset,
      next_commands: fallbackCommands,
    });
  } else {
    const endFunnelSpan = stdTracer.startSpan('factory_funnel_blueprint');
    const asset = {
      id: `asset-${Date.now().toString(36)}`,
      threadId,
      line: 'funnel' as const,
      title: `Funnel struktura: ${topic}`,
      body: `1. Opt-in Video Squeeze Page -> 2. VSL s interaktivní kalkulačkou -> 3. Okamžitý affiliate checkout.`,
      meta: 'Landing Page Architecture, odhadovaná konverze 26%',
      tags: ['Funnel', 'Landing Page', 'Lead Magnet'],
      status: 'ready' as const,
      runId: stdRunId,
      nextCommands: fallbackCommands,
      createdAt: new Date().toISOString(),
    };
    db.factoryAssets.unshift(asset);
    endFunnelSpan('ok', { assetId: asset.id });
    stdTracer.recordTokens(220, 320);
    stdTracer.finish({
      goalFulfilled: true,
      concreteness: true,
      riskAwareness: true,
      noFictitiousMoney: true,
      repaired: false,
    });
    return res.json({
      runId: stdRunId,
      traceUrl: `/v1/runs/${stdRunId}`,
      items: [{ title: asset.title, body: asset.body, meta: asset.meta }],
      asset,
      next_commands: fallbackCommands,
    });
  }
});

// 7b. SmartVideoOrchestrator: Trend Analysis & Automated MoviePy + FFmpeg (+faststart) Trigger
app.get('/api/v1/orchestrator/smart-video/trends', async (req: Request, res: Response) => {
  try {
    const platform = (req.query.platform as string | undefined) || undefined;
    const trendId = (req.query.trendId as string | undefined) || undefined;
    const templateId = (req.query.templateId as string | undefined) || undefined;
    const analysis = await analyzeTrendingVideoOpportunity({ platform, trendId, templateId });
    return res.json(analysis);
  } catch (err: any) {
    return res.status(500).json({ error: `Analýza trendů selhala: ${err.message}` });
  }
});

app.post('/api/v1/orchestrator/smart-video/analyze-and-trigger', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;
  try {
    const {
      trendId,
      platform,
      templateId,
      threadId = 'th-main-001',
      dryRun = false,
      async: isAsync = true,
    } = req.body || {};

    const analysis = await analyzeTrendingVideoOpportunity({ trendId, platform, templateId });
    const template = db.userTemplates.find((t) => t.id === analysis.recommendedTemplateId);
    const aspectRatio = analysis.recommendedFormat;
    const topic = `${analysis.selectedTrend.keyword} — ${analysis.selectedTrend.suggestedHook}`;

    const assetId = `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const storyboard = MoviePyCompiler.createBriefDrivenStoryboard(analysis.brief, template);
    const moviePyScript = MoviePyCompiler.generatePythonScript(storyboard, template);

    const pendingAsset = createPendingVideoAsset({
      assetId,
      threadId,
      prompt: topic,
      aspectRatio,
      brief: analysis.brief,
      storyboard,
      moviePyScript,
      template,
      dryRun: Boolean(dryRun),
    });
    db.factoryAssets.unshift(pendingAsset);

    db.activities.unshift({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `SmartVideoOrchestrator spustil trendový render: ${analysis.selectedTrend.keyword}`,
      description: analysis.rationale,
      agent: 'Trend Agent',
      timestamp: new Date().toISOString(),
      type: 'action',
    });

    if (isAsync) {
      enqueueBackgroundVideoRenderJob({
        asset: pendingAsset,
        threadId,
        aspectRatio,
        brief: analysis.brief,
        storyboard,
        template,
        topic,
        dryRun: Boolean(dryRun),
      });
      res.setHeader('Retry-After', '1');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(202).json({
        status: 'accepted',
        statusCode: 202,
        retryAfterSeconds: 1,
        analysis,
        asset: pendingAsset,
        job: {
          assetId,
          status: pendingAsset.status,
          progressPercent: pendingAsset.progressPercent,
          progressStage: pendingAsset.progressStage,
          statusUrl: `/api/v1/assets/${assetId}/status`,
          streamUrl: `/api/v1/assets/${assetId}/stream`,
        },
        storyboard,
        moviePyScript,
      });
    }

    const result = await executeVideoRenderJob({
      asset: pendingAsset,
      threadId,
      aspectRatio,
      brief: analysis.brief,
      storyboard,
      template,
      topic,
      dryRun: Boolean(dryRun),
    });

    return res.status(201).json({
      status: 'ready',
      analysis,
      asset: {
        ...result.asset,
        posterUrl: `/api/v1/assets/${result.asset.id}/stream?format=poster`,
      },
      faststartVerified: Boolean(result.asset.faststartVerified),
      storyboard,
      moviePyScript,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `SmartVideoOrchestrator selhal: ${err.message}` });
  }
});

// 7c. OpenGen.ai/cs Suite: Multi-Model Catalog, Credits, Prompt Magic & Video Generation
app.get('/api/v1/opengen/models', (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  let models = db.openGenModels;
  if (category && category !== 'all') {
    models = models.filter((m) => m.category === category);
  }
  return res.json({
    models,
    total: models.length,
    credits: db.openGenCredits,
    supportedCameras: [
      { id: 'static', label: 'Statická kamera (Tripod)' },
      { id: 'pan_left', label: 'Švenk vlevo (Pan Left)' },
      { id: 'pan_right', label: 'Švenk vpravo (Pan Right)' },
      { id: 'tilt_up', label: 'Náklon nahoru (Tilt Up)' },
      { id: 'tilt_down', label: 'Náklon dolů (Tilt Down)' },
      { id: 'zoom_in', label: 'Plynulý nájezd (Zoom In)' },
      { id: 'zoom_out', label: 'Plynulý odjezd (Zoom Out)' },
      { id: 'orbit_360', label: 'Orbitální rotace 360°' },
      { id: 'fpv_drone', label: 'FPV Dronový průlet' },
    ],
  });
});

app.get('/api/v1/opengen/credits', (_req: Request, res: Response) => {
  return res.json(db.openGenCredits);
});

app.post('/api/v1/opengen/credits/topup', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  const { package: pkg = 'creator', amount } = req.body || {};
  let added = Number(amount) || 0;
  if (!added) {
    if (pkg === 'starter') added = 100;
    else if (pkg === 'creator') added = 500;
    else if (pkg === 'studio') added = 2000;
    else added = 250;
  }
  db.openGenCredits.available += added;
  db.openGenCredits.extraCredits += added;
  db.activities.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    title: `OpenGen kredity navýšeny (+${added} kreditů)`,
    description: `Úspěšné dobití balíčku ${String(pkg).toUpperCase()}. Nový zůstatek: ${db.openGenCredits.available} kreditů.`,
    agent: 'Billing Agent',
    timestamp: new Date().toISOString(),
    type: 'action',
  });
  return res.json({
    success: true,
    addedCredits: added,
    credits: db.openGenCredits,
    message: `Úspěšně připsáno +${added} kreditů. Aktuální zůstatek: ${db.openGenCredits.available}.`,
  });
});

// 7d. Zero-API Local Structured Text-to-Video Prompt Parser & Enhancer
app.post('/api/v1/video/structured-prompt/parse', (req: Request, res: Response) => {
  const { rawPrompt, aspectRatio, durationSec, fps, visualStyle, cameraMotion, motionIntensity, negativePrompt } =
    req.body || {};
  if (!rawPrompt || typeof rawPrompt !== 'string') {
    return res.status(400).json({ error: 'Parametr rawPrompt je povinný.' });
  }
  const structuredPrompt = parseStructuredPromptFromText(rawPrompt, {
    aspectRatio: aspectRatio === '16:9' ? '16:9' : aspectRatio === '9:16' ? '9:16' : undefined,
    durationSec: typeof durationSec === 'number' ? durationSec : undefined,
    fps: fps === 24 || fps === 60 || fps === 30 ? fps : undefined,
    visualStyle,
    cameraMotion,
    motionIntensity: typeof motionIntensity === 'number' ? motionIntensity : undefined,
    negativePrompt: typeof negativePrompt === 'string' ? negativePrompt : undefined,
  });
  const score = scoreStructuredPromptCompleteness(structuredPrompt);
  return res.json({
    engine: 'local-structured-director',
    structuredPrompt,
    score,
  });
});

app.post('/api/v1/video/structured-prompt/enhance', (req: Request, res: Response) => {
  const { structuredPrompt, rawPrompt, cameraMotion, visualStyle, motionIntensity } = req.body || {};
  const input = structuredPrompt || rawPrompt;
  if (!input) {
    return res.status(400).json({ error: 'Zadejte structuredPrompt nebo rawPrompt.' });
  }
  const enhanced = enhanceStructuredPromptLocally(input, {
    cameraMotion,
    visualStyle,
    motionIntensity: typeof motionIntensity === 'number' ? motionIntensity : undefined,
  });
  const score = scoreStructuredPromptCompleteness(enhanced.structuredPrompt);
  return res.json({
    engine: 'local-structured-director',
    ...enhanced,
    score,
  });
});

app.post('/api/v1/video/structured-prompt/monetize', (req: Request, res: Response) => {
  const { structuredPrompt, rawPrompt, blueprintId } = req.body || {};
  const basePrompt =
    structuredPrompt ||
    (typeof rawPrompt === 'string' && rawPrompt.trim()
      ? parseStructuredPromptFromText(rawPrompt)
      : undefined);

  if (!basePrompt) {
    return res.status(400).json({ error: 'Zadejte structuredPrompt nebo rawPrompt.' });
  }

  const result = optimizePromptForMonetization(basePrompt, blueprintId);
  return res.json({
    engine: 'local-structured-director',
    ...result,
  });
});

app.post('/api/v1/video/structured-prompt/ai-enhance', async (req: Request, res: Response) => {
  const { structuredPrompt, rawPrompt, selectedStyleTagId } = req.body || {};
  try {
    const result = await enhanceStructuredPromptWithGemini({
      structuredPrompt,
      rawPrompt,
      selectedStyleTagId,
    });
    return res.json(result);
  } catch (err: any) {
    if (err instanceof AiPromptEnhanceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({
      error: err?.message || 'AI Smart Enhance selhal při komunikaci se serverem.',
    });
  }
});

app.post('/api/v1/opengen/prompt-enhance', async (req: Request, res: Response) => {
  const {
    prompt,
    structuredPrompt,
    modelId = 'nexus-local-director',
    style,
    camera = 'orbit_360',
    motionIntensity,
  } = req.body || {};
  if (!prompt && !structuredPrompt) {
    return res.status(400).json({ error: 'Prompt nebo structuredPrompt je povinný.' });
  }

  const modelSpec = db.openGenModels.find((m) => m.id === modelId) || db.openGenModels[0];
  const localResult = enhanceStructuredPromptLocally(structuredPrompt || String(prompt), {
    cameraMotion: camera,
    visualStyle: style,
    motionIntensity: typeof motionIntensity === 'number' ? motionIntensity : undefined,
  });

  const baseRaw = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : localResult.structuredPrompt.rawPrompt;
  const enhancedPrompt = `${baseRaw} | 35mm anamorphic optics (Arri Alexa 65 reference), ${camera} camera trajectory, ${localResult.compiledText.replace(/\n/g, ' ')}`;
  const score = scoreStructuredPromptCompleteness(localResult.structuredPrompt);

  return res.json({
    originalPrompt: baseRaw,
    enhancedPrompt,
    compiledText: localResult.compiledText,
    structuredPrompt: localResult.structuredPrompt,
    score,
    modelId: modelSpec.id,
    camera,
    style: localResult.structuredPrompt.style.visualStyle,
    tips: localResult.tips,
  });
});

app.post('/api/v1/opengen/generate', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;

  let creditsCharged = 0;
  const refundChargedCredits = (reason: string) => {
    if (creditsCharged <= 0) return;
    db.openGenCredits.available += creditsCharged;
    db.openGenCredits.usedThisPeriod = Math.max(0, db.openGenCredits.usedThisPeriod - creditsCharged);
    db.activities.unshift({
      id: `act-${Date.now()}-refund`,
      title: `Vráceno +${creditsCharged} OpenGen kreditů`,
      description: `Automatická kompenzace po neúspěšném renderu: ${reason}`,
      agent: 'Billing Agent',
      timestamp: new Date().toISOString(),
      type: 'system',
    });
    creditsCharged = 0;
  };

  try {
    const {
      modelId = 'nexus-local-director',
      mode = 'text_to_video',
      prompt,
      negativePrompt,
      aspectRatio = '9:16',
      durationSec = 6,
      cameraMotion = 'orbit_360',
      motionIntensity = 7,
      fps = 30,
      qualityTier = '1080p',
      promptMagic = true,
      templateId,
      threadId = 'th-main-001',
      dryRun = false,
      async: isAsync = true,
      structuredPrompt: incomingStructuredPrompt,
    } = req.body || {};

    if ((!prompt || typeof prompt !== 'string') && !incomingStructuredPrompt) {
      return res.status(400).json({ error: 'Prompt nebo structuredPrompt je povinný parametr.' });
    }

    const modelSpec = db.openGenModels.find((m) => m.id === modelId) || db.openGenModels[0];
    const cost = modelSpec.creditCost;

    if (cost > 0 && db.openGenCredits.available < cost) {
      return res.status(402).json({
        error: `Nedostatek OpenGen kreditů. Požadováno ${cost} kreditů, máte k dispozici ${db.openGenCredits.available}.`,
        requiredCredits: cost,
        availableCredits: db.openGenCredits.available,
      });
    }

    if (cost > 0) {
      db.openGenCredits.available -= cost;
      db.openGenCredits.usedThisPeriod += cost;
      creditsCharged = cost;
    }

    const normalizedRatio: '9:16' | '16:9' =
      incomingStructuredPrompt?.aspectRatio === '16:9' || aspectRatio === '16:9' ? '16:9' : '9:16';
    const normalizedDuration = Math.min(
      modelSpec.maxDurationSec || 15,
      Math.max(3, incomingStructuredPrompt?.totalDurationSec || durationSec)
    );

    const baseStructured =
      incomingStructuredPrompt ||
      parseStructuredPromptFromText(String(prompt || ''), {
        aspectRatio: normalizedRatio,
        durationSec: normalizedDuration,
        fps: fps === 24 || fps === 60 ? fps : 30,
        cameraMotion,
        motionIntensity,
        negativePrompt,
      });

    const finalStructuredPrompt: StructuredVideoPrompt = promptMagic
      ? enhanceStructuredPromptLocally(baseStructured, {
          cameraMotion: incomingStructuredPrompt ? undefined : cameraMotion,
          motionIntensity: incomingStructuredPrompt ? undefined : motionIntensity,
        }).structuredPrompt
      : baseStructured;

    const resolvedPrompt =
      typeof prompt === 'string' && prompt.trim()
        ? prompt.trim()
        : finalStructuredPrompt.subject.primarySubject;

    const template = templateId
      ? db.userTemplates.find((t) => t.id === templateId)
      : undefined;

    const analyzed = await VideoDirectorEngine.analyzePrompt({
      userMessage: `${resolvedPrompt} ${normalizedRatio}`,
      forceDefaults: true,
      structuredPrompt: finalStructuredPrompt,
    });

    const brief = {
      ...analyzed.brief,
      aspectRatio: normalizedRatio,
      durationSec: normalizedDuration,
      structuredPrompt: finalStructuredPrompt,
    };

    const storyboard = MoviePyCompiler.createBriefDrivenStoryboard(brief, template);
    const moviePyScript = MoviePyCompiler.generatePythonScript(storyboard, template);
    const assetId = `asset-opengen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    const pendingAsset = createPendingVideoAsset({
      assetId,
      threadId,
      prompt: resolvedPrompt,
      aspectRatio: normalizedRatio,
      brief,
      storyboard,
      moviePyScript,
      template,
      structuredPrompt: finalStructuredPrompt,
      dryRun: Boolean(dryRun),
    });

    pendingAsset.title = `[${modelSpec.name}] ${storyboard.title}`;
    pendingAsset.tags = [
      'OpenGen',
      modelSpec.name,
      mode,
      finalStructuredPrompt.camera.primaryMotion,
      qualityTier,
      `${finalStructuredPrompt.fps}fps`,
      normalizedRatio,
      '+faststart',
      'StructuredPrompt',
    ];
    pendingAsset.meta = `${modelSpec.name} · ${finalStructuredPrompt.temporal.beats.length} fází · ${finalStructuredPrompt.camera.primaryMotion} · ${cost === 0 ? 'Lokálně (0 kreditů)' : `${cost} kreditů`}`;

    db.factoryAssets.unshift(pendingAsset);

    db.activities.unshift({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `Spuštěn strukturovaný render přes ${modelSpec.name}`,
      description: `Subjekt: "${finalStructuredPrompt.subject.primarySubject.slice(0, 48)}" | Kamera: ${finalStructuredPrompt.camera.primaryMotion} | ${finalStructuredPrompt.temporal.beats.length} fází.`,
      agent: 'Video Agent',
      timestamp: new Date().toISOString(),
      type: 'action',
    });

    if (isAsync) {
      enqueueBackgroundVideoRenderJob({
        asset: pendingAsset,
        threadId,
        aspectRatio: normalizedRatio,
        brief,
        storyboard,
        template,
        topic: resolvedPrompt,
        dryRun: Boolean(dryRun),
        onJobFailed: (err) => refundChargedCredits(err.message),
      });
      res.setHeader('Retry-After', '1');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(202).json({
        statusCode: 202,
        status: 'accepted',
        retryAfterSeconds: 1,
        asset: pendingAsset,
        job: {
          assetId,
          status: pendingAsset.status,
          progressPercent: pendingAsset.progressPercent,
          progressStage: pendingAsset.progressStage,
          statusUrl: `/api/v1/assets/${assetId}/status`,
          streamUrl: `/api/v1/assets/${assetId}/stream`,
        },
        creditsUsed: cost,
        creditsRemaining: db.openGenCredits.available,
        model: modelSpec,
        enhancedPrompt: resolvedPrompt,
        storyboard,
        moviePyScript,
        structuredPrompt: finalStructuredPrompt,
      });
    }

    const result = await executeVideoRenderJob({
      asset: pendingAsset,
      threadId,
      aspectRatio: normalizedRatio,
      brief,
      storyboard,
      template,
      topic: resolvedPrompt,
      dryRun: Boolean(dryRun),
      onJobFailed: (err) => refundChargedCredits(err.message),
    });

    return res.status(201).json({
      statusCode: 201,
      status: 'ready',
      asset: {
        ...result.asset,
        posterUrl: `/api/v1/assets/${result.asset.id}/stream?format=poster`,
      },
      creditsUsed: cost,
      creditsRemaining: db.openGenCredits.available,
      model: modelSpec,
      enhancedPrompt: resolvedPrompt,
      faststartVerified: Boolean(result.asset.faststartVerified),
      storyboard,
      moviePyScript,
      structuredPrompt: finalStructuredPrompt,
    });
  } catch (err: any) {
    refundChargedCredits(err?.message || 'Neočekávaná chyba OpenGen workeru');
    return res.status(500).json({ error: `OpenGen generování selhalo: ${err.message}` });
  }
});

// 8. Metrics & Activity
app.get('/v1/metrics/summary', (req: Request, res: Response) => {
  const totalPipeline = db.opportunities.reduce((acc, o) => acc + o.projectionCzk, 0);
  const totalWon = db.opportunities.filter((o) => o.status === 'won').reduce((acc, o) => acc + o.projectionCzk, 0);

  res.json({
    pipelineValueCzk: totalPipeline,
    closedWonCzk: totalWon,
    avgConfidence: 82.5,
    activeAgentsCount: db.agents.filter((a) => a.status === 'active').length,
    pausedAgentsCount: db.agents.filter((a) => a.status === 'paused').length,
    totalAssetsCount: db.factoryAssets.length,
    budgetSpentCzk: db.totalCzkBudgetSpent,
    dailyBudgetLimitCzk: db.dailyCzkBudgetLimit,
    isSystemPaused: db.isSystemPaused,
    isAutonomousRevenueLoopActive: db.isAutonomousRevenueLoopActive,
  });
});

app.get('/v1/activity', (req: Request, res: Response) => {
  res.json(db.activities);
});

// 9. Memory
app.get('/v1/memory/search', (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const result = MemoryService.search(query, 8);
  res.json(result);
});

app.post('/v1/memory', (req: Request, res: Response) => {
  const { kind, scope, content, importance = 0.8 } = req.body;
  if (!kind || !scope || !content) {
    return res.status(400).json({ error: 'Pole kind, scope a content jsou povinná.' });
  }
  const mem = MemoryService.save({ kind, scope, content, importance });
  res.status(201).json(mem);
});

// 10. Runs & Traces
app.get('/v1/runs/:id', (req: Request, res: Response) => {
  const run = db.runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Trace běhu nenalezen.' });
  res.json(run);
});

// 11. Golden Evals
app.post('/v1/evals/run', async (req: Request, res: Response) => {
  const result = await EvalsRunner.runAllEvals();
  res.json(result);
});

app.get('/v1/evals/results', (req: Request, res: Response) => {
  res.json(db.evalResults);
});

// 12. Real-time System Performance & Health Monitor (REST + SSE)
app.get('/v1/system/performance', (req: Request, res: Response) => {
  res.json(db.getSystemPerformance());
});

const handleSystemHealthSse = (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const pushHealth = () => {
    const snapshot = {
      ...db.getSystemPerformance(),
      isSystemPaused: db.isSystemPaused,
      activeAgentsCount: db.agents.filter((a) => a.status === 'active').length,
    };
    res.write(`event: health\ndata: ${JSON.stringify(snapshot)}\n\n`);
  };

  pushHealth();
  const interval = setInterval(pushHealth, 1200);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
};

app.get('/v1/system/health/stream', handleSystemHealthSse);
app.get('/api/v1/system/health/stream', handleSystemHealthSse);

// 13. Social Media & CMS Integrations (Google Drive, Dropbox, YouTube Studio, Facebook Creator, Buffer)
app.get('/v1/integrations', (req: Request, res: Response) => {
  res.json(db.socialIntegrations);
});

app.post('/v1/integrations/:id/toggle', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'manage_integrations')) return;
  const integration = db.socialIntegrations.find((i) => i.id === req.params.id);
  if (!integration) return res.status(404).json({ error: 'Integrace nenalezena.' });

  integration.connected = !integration.connected;
  integration.status = integration.connected ? 'active' : 'disconnected';
  if (integration.connected) {
    integration.tokenExpiry = new Date(Date.now() + 86400000 * 30).toISOString();
    integration.accountEmail = 'bpcme66@gmail.com';
  }

  db.activities.unshift({
    id: `act-${Date.now()}`,
    title: `${integration.name}: ${integration.connected ? 'Autorizováno přes ' + integration.authMethod : 'Odpojeno'}`,
    description: `Kanál ${integration.name} byl ${integration.connected ? 'úspěšně propojen' : 'odpojen uživatelem'}.`,
    agent: 'Automation Agent',
    timestamp: new Date().toISOString(),
    type: 'system',
  });

  res.json(integration);
});

// 14. Publishing & Scheduled Releases (YouTube, TikTok, Instagram Reels & CMS)
app.get('/v1/publish/tasks', (req: Request, res: Response) => {
  res.json(db.publishTasks);
});

app.post('/v1/publish', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'publish_videos')) return;
  if (!ensureSystemActive(res)) return;
  const { assetId, videoTitle, platforms, scheduledFor, metadata, format = '9:16', templateCategory = 'viral_hook' } = req.body;
  if (!videoTitle || !platforms || platforms.length === 0) {
    return res.status(400).json({ error: 'videoTitle a alespoň jedna platforma jsou povinné.' });
  }

  const isScheduled = Boolean(scheduledFor);
  const slugId = Math.random().toString(36).substring(2, 9);
  let destinationUrl: string | undefined;

  if (!isScheduled) {
    if (platforms.some((p: string) => p.includes('YouTube'))) {
      destinationUrl = `https://youtube.com/shorts/${slugId}`;
    } else if (platforms.some((p: string) => p.includes('TikTok'))) {
      destinationUrl = `https://tiktok.com/@nexus.viral.lab/video/${slugId}`;
    } else if (platforms.some((p: string) => p.includes('Instagram'))) {
      destinationUrl = `https://instagram.com/reel/${slugId}`;
    } else {
      destinationUrl = `https://nexus.cdn/published/${slugId}`;
    }
  }

  const newTask = {
    id: `pub-${Date.now().toString(36)}`,
    assetId: assetId || 'asset-custom',
    videoTitle,
    platforms,
    scheduledFor: isScheduled ? new Date(scheduledFor).toISOString() : undefined,
    publishedAt: !isScheduled ? new Date().toISOString() : undefined,
    status: isScheduled ? ('scheduled' as const) : ('published' as const),
    destinationUrl,
    metadata: metadata || {
      title: videoTitle,
      description: 'Publikováno automaticky pomocí NEXUS X OS AI Video Studio.',
      tags: ['Shorts', 'TikTok', 'Reels', 'AI'],
      privacy: 'public',
    },
    createdAt: new Date().toISOString(),
  };

  db.publishTasks.unshift(newTask);

  // If published immediately to YouTube / TikTok / Instagram Reels, register initial performance row for closed-loop analytics
  if (!isScheduled) {
    const sharingPlatforms: VideoSharingPlatform[] = [];
    if (platforms.some((p: string) => p.includes('YouTube'))) sharingPlatforms.push('YouTube');
    if (platforms.some((p: string) => p.includes('TikTok'))) sharingPlatforms.push('TikTok');
    if (platforms.some((p: string) => p.includes('Instagram'))) sharingPlatforms.push('Instagram Reels');

    for (const sp of sharingPlatforms) {
      db.analyticsData.publishedVideoPerformance.unshift({
        id: `vid-${sp.toLowerCase().replace(/\s+/g, '')}-${Date.now().toString(36)}`,
        title: videoTitle,
        platform: sp,
        format: format === '16:9' ? '16:9' : '9:16',
        templateCategory,
        views: 420,
        likes: 38,
        comments: 5,
        watchTimeHours: 4,
        avgWatchSeconds: 34.2,
        retentionRate: 106.5,
        publishedAt: new Date().toISOString(),
        url: destinationUrl || `https://nexus.cdn/${slugId}`,
      });
    }
    db.analyticsData.contentRecommendations = deriveContentRecommendations(
      db.analyticsData.publishedVideoPerformance
    );
  }

  db.activities.unshift({
    id: `act-${Date.now()}`,
    title: isScheduled ? `Naplánováno vydání: ${videoTitle}` : `Publikováno video: ${videoTitle}`,
    description: `${isScheduled ? 'Naplánováno na ' + new Date(scheduledFor).toLocaleString() : 'Okamžitě odesláno'} na platformy: ${platforms.join(', ')}.`,
    agent: 'Video Agent',
    timestamp: new Date().toISOString(),
    type: 'action',
  });

  res.status(201).json(newTask);
});

// 15. User Video Styles & Templates System
app.get('/v1/templates', (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  if (category && category !== 'all') {
    return res.json(db.userTemplates.filter((t) => t.category === category));
  }
  res.json(db.userTemplates);
});

app.post('/v1/templates', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'manage_templates')) return;
  const { name, category, description, aspectRatio, visualStyle, subtitleStyle, musicPreset, structureArchetype, pacingNotes, scenesTemplate } = req.body;
  if (!name || !aspectRatio) {
    return res.status(400).json({ error: 'Název a poměr stran jsou povinné.' });
  }

  const newTemplate = {
    id: `tpl-${Date.now().toString(36)}`,
    name,
    category: category || 'tutorial',
    description: description || 'Vlastní uživatelská šablona střihu a scénáře.',
    aspectRatio: aspectRatio || '9:16',
    visualStyle: visualStyle || 'Cyberpunk Neon',
    subtitleStyle: subtitleStyle || {
      font: 'DejaVu-Sans-Bold',
      color: '#ffffff',
      highlightColor: '#facc15',
      fontSize: 64,
    },
    musicPreset: musicPreset || {
      beatType: 'Lo-Fi Synthwave',
      bpm: 128,
      sfxPack: 'Standard Whoosh Pack',
    },
    structureArchetype: structureArchetype || '3s Hook → Content → CTA',
    pacingNotes: pacingNotes || 'Přizpůsobené tempo střihu a titulků.',
    scenesTemplate: scenesTemplate || [],
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
  };

  db.userTemplates.unshift(newTemplate);

  db.activities.unshift({
    id: `act-${Date.now()}`,
    title: `Uložena nová šablona: ${name}`,
    description: `Uživatel uložil novou šablonu střihu (${aspectRatio}, kategorie ${newTemplate.category}, styl ${visualStyle}).`,
    agent: 'Visual Agent',
    timestamp: new Date().toISOString(),
    type: 'action',
  });

  res.status(201).json(newTemplate);
});

app.patch('/v1/templates/:id', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'manage_templates')) return;
  const tpl = db.userTemplates.find((t) => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Šablona nenalezena.' });

  const { name, category, description, aspectRatio, visualStyle, subtitleStyle, musicPreset, structureArchetype, pacingNotes, scenesTemplate } = req.body;
  if (name) tpl.name = name;
  if (category) tpl.category = category;
  if (description !== undefined) tpl.description = description;
  if (aspectRatio === '9:16' || aspectRatio === '16:9') tpl.aspectRatio = aspectRatio;
  if (visualStyle) tpl.visualStyle = visualStyle;
  if (subtitleStyle) tpl.subtitleStyle = { ...tpl.subtitleStyle, ...subtitleStyle };
  if (musicPreset) tpl.musicPreset = { ...tpl.musicPreset, ...musicPreset };
  if (structureArchetype) tpl.structureArchetype = structureArchetype;
  if (pacingNotes !== undefined) tpl.pacingNotes = pacingNotes;
  if (Array.isArray(scenesTemplate) && scenesTemplate.length > 0) tpl.scenesTemplate = scenesTemplate;

  db.activities.unshift({
    id: `act-${Date.now()}`,
    title: `Upravena šablona: ${tpl.name}`,
    description: `Šablona byla přizpůsobena (${tpl.aspectRatio}, ${tpl.visualStyle}, ${tpl.musicPreset.bpm} BPM).`,
    agent: 'Visual Agent',
    timestamp: new Date().toISOString(),
    type: 'action',
  });

  res.json(tpl);
});

app.delete('/v1/templates/:id', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'manage_templates')) return;
  const index = db.userTemplates.findIndex((t) => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Šablona nenalezena.' });
  if (db.userTemplates[index].isBuiltIn) {
    return res.status(400).json({ error: 'Výchozí systémové šablony nelze smazat.' });
  }

  db.userTemplates.splice(index, 1);
  res.json({ success: true, message: 'Šablona smazána.' });
});

// 16. Multi-Platform Performance Analytics & AI Content Loop
app.get('/v1/analytics', (req: Request, res: Response) => {
  const platform = (req.query.platform as 'all' | VideoSharingPlatform) || 'all';
  const filtered = filterAnalyticsByPlatform(db.analyticsData, platform);
  res.json({
    ...db.analyticsData,
    filteredSummary: filtered.summary,
    filteredVideos: filtered.videos,
    activePlatformFilter: platform,
  });
});

app.post('/v1/analytics/sync', (req: Request, res: Response) => {
  const updated = db.syncAnalyticsMetrics();
  db.activities.unshift({
    id: `act-${Date.now()}`,
    title: 'Synchronizovány metriky z YouTube, TikTok & Instagram Reels',
    description: `Načteno ${updated.summary.totalViews.toLocaleString()} zhlédnutí, ${updated.summary.totalLikes.toLocaleString()} lajků a ${updated.summary.totalWatchTimeHours.toLocaleString()} h sledování.`,
    agent: 'Analytics Agent',
    timestamp: new Date().toISOString(),
    type: 'metric',
  });
  res.json(updated);
});

// 17. Multi-Account & Team Role Management (RBAC)
app.get('/v1/accounts', (req: Request, res: Response) => {
  res.json({
    accounts: db.accounts,
    activeAccountId: db.activeAccountId,
    currentActor: db.getCurrentActor(),
  });
});

app.post('/v1/accounts', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'manage_team')) return;
  const { name, ownerEmail = 'bpcme66@gmail.com', plan = 'Studio Pro', defaultAspectRatio = '9:16' } = req.body;
  const check = validateAccountInput({ name, ownerEmail });
  if (!check.valid) return res.status(400).json({ error: check.error });

  const newAccount = {
    id: `acc-${Date.now().toString(36)}`,
    name: name.trim(),
    slug: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    plan,
    ownerEmail: ownerEmail.trim(),
    defaultAspectRatio: defaultAspectRatio === '16:9' ? ('16:9' as const) : ('9:16' as const),
    createdAt: new Date().toISOString(),
  };

  db.accounts.push(newAccount);

  // Also ensure the current admin is an active admin on the new workspace
  const currentActor = db.getCurrentActor();
  if (currentActor) {
    db.teamMembers.push({
      id: `usr-${Date.now().toString(36)}`,
      accountId: newAccount.id,
      name: currentActor.name,
      email: currentActor.email,
      role: 'admin',
      permissions: getDefaultPermissionsForRole('admin'),
      status: 'active',
      invitedBy: 'Systém',
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    });
  }

  db.activities.unshift({
    id: `act-${Date.now()}`,
    title: `Vytvořen nový účet studia: ${newAccount.name}`,
    description: `Workspace "${newAccount.name}" (${newAccount.plan}) byl založen vlastníkem ${newAccount.ownerEmail}.`,
    agent: 'CEO Agent',
    timestamp: new Date().toISOString(),
    type: 'system',
  });

  res.status(201).json(newAccount);
});

app.post('/v1/accounts/:id/switch', (req: Request, res: Response) => {
  const account = db.accounts.find((a) => a.id === req.params.id);
  if (!account) return res.status(404).json({ error: 'Účet nenalezen.' });
  db.activeAccountId = account.id;
  res.json({ activeAccountId: db.activeAccountId, account });
});

app.get('/v1/team', (req: Request, res: Response) => {
  const accountId = (req.query.accountId as string) || undefined;
  const members = accountId
    ? db.teamMembers.filter((m) => m.accountId === accountId)
    : db.teamMembers;

  res.json({
    members,
    currentActor: db.getCurrentActor(),
    allPermissions: ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSION_LABELS[key] })),
    roleLabels: ROLE_LABELS,
  });
});

app.post('/v1/team/invite', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'manage_team')) return;
  const { name, email, role = 'editor', accountId = db.activeAccountId, permissions } = req.body;
  const validation = validateInviteInput({ name, email, role });
  if (!validation.valid) return res.status(400).json({ error: validation.error });

  const normalizedEmail = email.trim().toLowerCase();
  const duplicate = db.teamMembers.find(
    (m) => m.accountId === accountId && m.email.toLowerCase() === normalizedEmail
  );
  if (duplicate) {
    return res.status(409).json({ error: 'Uživatel s tímto e-mailem je již v tomto účtu registrován.' });
  }

  const actor = db.getCurrentActor();
  const resolvedRole = role as UserRole;
  const member = {
    id: `usr-${Date.now().toString(36)}`,
    accountId,
    name: name.trim(),
    email: normalizedEmail,
    role: resolvedRole,
    permissions: Array.isArray(permissions) && permissions.length > 0
      ? permissions
      : getDefaultPermissionsForRole(resolvedRole),
    status: 'active' as const,
    invitedBy: actor?.email || 'bpcme66@gmail.com',
    joinedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  db.teamMembers.unshift(member);

  db.activities.unshift({
    id: `act-${Date.now()}`,
    title: `Pozván člen týmu: ${member.name} (${ROLE_LABELS[member.role]})`,
    description: `Uživatel ${member.email} získal roli ${ROLE_LABELS[member.role]} s ${member.permissions.length} oprávněními.`,
    agent: 'CTO Agent',
    timestamp: new Date().toISOString(),
    type: 'system',
  });

  res.status(201).json(member);
});

app.patch('/v1/team/:id', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'manage_team')) return;
  const member = db.teamMembers.find((m) => m.id === req.params.id);
  if (!member) return res.status(404).json({ error: 'Člen týmu nenalezen.' });

  const { role, permissions, status } = req.body;
  if (role && ['admin', 'editor', 'viewer'].includes(role)) {
    member.role = role;
    if (!permissions) {
      member.permissions = getDefaultPermissionsForRole(role);
    }
  }
  if (Array.isArray(permissions)) {
    member.permissions = permissions;
  }
  if (status && ['active', 'invited', 'suspended'].includes(status)) {
    member.status = status;
  }

  res.json(member);
});

app.delete('/v1/team/:id', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'manage_team')) return;
  const idx = db.teamMembers.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Člen týmu nenalezen.' });
  if (db.teamMembers[idx].id === db.currentActorId) {
    return res.status(400).json({ error: 'Nelze odstranit aktuálně přihlášeného správce relace.' });
  }

  db.teamMembers.splice(idx, 1);
  res.json({ success: true });
});

app.post('/v1/team/switch-actor', (req: Request, res: Response) => {
  const { memberId } = req.body;
  const member = db.teamMembers.find((m) => m.id === memberId);
  if (!member) return res.status(404).json({ error: 'Uživatelský profil nenalezen.' });
  if (member.status !== 'active') {
    return res.status(400).json({ error: 'Lze přepnout pouze na aktivního člena týmu.' });
  }
  db.currentActorId = member.id;
  res.json({ currentActor: member });
});

// 18. Smart AI Commenting & 5-Core Godtier Swarm Endpoints
app.get('/v1/comments', (req: Request, res: Response) => {
  const platform = req.query.platform as string | undefined;
  const status = req.query.status as string | undefined;
  const intent = req.query.intent as string | undefined;

  let filtered = [...db.comments];
  if (platform && platform !== 'all') {
    filtered = filtered.filter((c) => c.platform === platform);
  }
  if (status && status !== 'all') {
    filtered = filtered.filter((c) => c.status === status);
  }
  if (intent && intent !== 'all') {
    filtered = filtered.filter((c) => c.multiCoreAnalysis.intentCore.intent === intent);
  }

  filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json({
    comments: filtered,
    kpis: db.getCommentSwarmKpis(),
    config: db.commentAutopilotConfig,
  });
});

app.post('/v1/comments', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  const {
    text,
    authorHandle = '@divak_nexus',
    platform = 'YouTube',
    videoTitle = 'AI Video Studio 2026',
    assetId,
    likesCount = 1,
  } = req.body || {};

  if (!text || typeof text !== 'string' || text.trim().length < 2) {
    return res.status(400).json({ error: 'Text komentáře je povinný.' });
  }

  const normalizedPlatform: VideoSharingPlatform =
    platform === 'TikTok' || platform === 'Instagram Reels' ? platform : 'YouTube';
  const normalizedAuthor = String(authorHandle).trim().startsWith('@')
    ? String(authorHandle).trim()
    : `@${String(authorHandle).trim()}`;

  const draft: Omit<SocialComment, 'multiCoreAnalysis'> = {
    id: `cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    assetId: typeof assetId === 'string' ? assetId : undefined,
    videoTitle: String(videoTitle).trim() || 'AI Video Studio 2026',
    platform: normalizedPlatform,
    authorHandle: normalizedAuthor,
    text: text.trim(),
    timestamp: new Date().toISOString(),
    likesCount: Math.max(0, Number(likesCount) || 0),
    status: 'pending',
  };

  const analysis = await analyzeCommentWithMultiCore(draft, db.commentAutopilotConfig);
  const newComment: SocialComment = {
    ...draft,
    status: analysis.shieldCore.action === 'quarantine' ? 'shield_blocked' : 'pending',
    multiCoreAnalysis: analysis,
  };

  db.comments.unshift(newComment);

  db.activities.unshift({
    id: `act-${Date.now()}-cmt`,
    title:
      newComment.status === 'shield_blocked'
        ? `Troll-Shield izoloval komentář: ${newComment.authorHandle}`
        : `Nový komentář (${newComment.platform}): ${newComment.authorHandle}`,
    description: analysis.consensusCore.reasoningSummary,
    agent: newComment.status === 'shield_blocked' ? 'CTO Agent' : 'CMO Agent',
    timestamp: new Date().toISOString(),
    type: newComment.status === 'shield_blocked' ? 'system' : 'action',
  });

  res.status(201).json({
    comment: newComment,
    kpis: db.getCommentSwarmKpis(),
  });
});

app.post('/v1/comments/:id/analyze', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  const comment = db.comments.find((c) => c.id === req.params.id);
  if (!comment) {
    return res.status(404).json({ error: 'Komentář nebyl nalezen.' });
  }

  const { voicePersona } = req.body || {};
  const configOverride = voicePersona
    ? { ...db.commentAutopilotConfig, voicePersona }
    : db.commentAutopilotConfig;

  const prevSyncedId = comment.multiCoreAnalysis.conversionCore.syncedOpportunityId;
  comment.multiCoreAnalysis = await analyzeCommentWithMultiCore(comment, configOverride);
  if (prevSyncedId) {
    comment.multiCoreAnalysis.conversionCore.syncedOpportunityId = prevSyncedId;
  }
  if (comment.multiCoreAnalysis.shieldCore.action === 'quarantine') {
    comment.status = 'shield_blocked';
  } else if (comment.status === 'pending') {
    comment.status = 'ai_drafted';
  }

  res.json({
    comment,
    kpis: db.getCommentSwarmKpis(),
  });
});

app.post('/v1/comments/:id/reply', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'publish_videos')) return;
  const comment = db.comments.find((c) => c.id === req.params.id);
  if (!comment) {
    return res.status(404).json({ error: 'Komentář nebyl nalezen.' });
  }

  const { replyText, strategy, quarantine = false, syncLead = false } = req.body || {};

  if (quarantine) {
    comment.status = 'shield_blocked';
    comment.selectedReply = '[KARANTÉNA] Komentář byl skryt modulem Core 3 Troll-Shield.';
    comment.repliedAt = new Date().toISOString();
    return res.json({
      comment,
      kpis: db.getCommentSwarmKpis(),
    });
  }

  const pickedVariant = pickBestReplyStrategy(
    comment.multiCoreAnalysis,
    strategy as CommentReplyStrategy | undefined
  );
  const finalReply =
    typeof replyText === 'string' && replyText.trim()
      ? replyText.trim()
      : pickedVariant?.replyText || '';

  if (!finalReply) {
    return res.status(400).json({ error: 'Text odpovědi nesmí být prázdný.' });
  }

  comment.selectedReply = finalReply;
  comment.repliedByStrategy = (strategy as CommentReplyStrategy) || pickedVariant?.strategy || 'hormozi_hook';
  comment.repliedAt = new Date().toISOString();
  comment.status = 'published_reply';

  let syncedOpportunity = null;
  if (syncLead || (db.commentAutopilotConfig.autoSyncHotLeadsToCrm && comment.multiCoreAnalysis.intentCore.intent === 'hot_lead')) {
    const syncRes = db.syncCommentLeadToCrm(comment.id);
    syncedOpportunity = syncRes?.opportunity || null;
  }

  db.activities.unshift({
    id: `act-${Date.now()}-reply`,
    title: `Odeslána AI odpověď (${comment.platform}): ${comment.authorHandle}`,
    description: `Strategie ${comment.repliedByStrategy}: "${finalReply.slice(0, 90)}"`,
    agent: 'CMO Agent',
    timestamp: new Date().toISOString(),
    type: 'action',
  });

  res.json({
    comment,
    syncedOpportunity,
    kpis: db.getCommentSwarmKpis(),
  });
});

app.post('/v1/comments/:id/sync-lead', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  const syncRes = db.syncCommentLeadToCrm(req.params.id);
  if (!syncRes) {
    return res.status(404).json({ error: 'Komentář nebyl nalezen.' });
  }
  res.status(201).json({
    ...syncRes,
    kpis: db.getCommentSwarmKpis(),
  });
});

app.post('/v1/comments/swarm/autopilot', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'publish_videos')) return;
  if (!ensureSystemActive(res)) return;
  const {
    strategy = 'hormozi_hook',
    syncLeads = db.commentAutopilotConfig.autoSyncHotLeadsToCrm,
    platform = 'all',
  } = req.body || {};

  const candidates = db.comments.filter((c) => {
    if (platform !== 'all' && c.platform !== platform) return false;
    return c.status === 'pending' || c.status === 'ai_drafted';
  });

  let repliedCount = 0;
  let blockedCount = 0;
  let leadsSyncedCount = 0;

  for (const comment of candidates) {
    const prevSyncedId = comment.multiCoreAnalysis.conversionCore.syncedOpportunityId;
    comment.multiCoreAnalysis = await analyzeCommentWithMultiCore(comment, db.commentAutopilotConfig);
    if (prevSyncedId) {
      comment.multiCoreAnalysis.conversionCore.syncedOpportunityId = prevSyncedId;
    }

    if (comment.multiCoreAnalysis.shieldCore.action === 'quarantine') {
      comment.status = 'shield_blocked';
      blockedCount += 1;
      continue;
    }

    const picked = pickBestReplyStrategy(comment.multiCoreAnalysis, strategy as CommentReplyStrategy);
    if (picked) {
      comment.selectedReply = picked.replyText;
      comment.repliedByStrategy = picked.strategy;
      comment.repliedAt = new Date().toISOString();
      comment.status = 'auto_replied';
      repliedCount += 1;
    }

    if (syncLeads && comment.multiCoreAnalysis.conversionCore.leadDetected) {
      db.syncCommentLeadToCrm(comment.id);
      leadsSyncedCount += 1;
    }
  }

  db.activities.unshift({
    id: `act-${Date.now()}-autopilot`,
    title: `5jádrový Swarm Autopilot dokončen (${repliedCount} odpovědí)`,
    description: `Zpracováno ${candidates.length} čekajících komentářů: ${repliedCount} odpovězeno, ${blockedCount} v karanténě, ${leadsSyncedCount} CRM leadů.`,
    agent: 'CMO Agent',
    timestamp: new Date().toISOString(),
    type: 'action',
  });

  res.json({
    processedCount: candidates.length,
    repliedCount,
    blockedCount,
    leadsSyncedCount,
    comments: db.comments,
    kpis: db.getCommentSwarmKpis(),
  });
});

app.post('/v1/comments/pinned/generate', (req: Request, res: Response) => {
  const { videoTitle, platform = 'YouTube', dmKeyword } = req.body || {};
  if (!videoTitle || typeof videoTitle !== 'string') {
    return res.status(400).json({ error: 'Název videa je povinný.' });
  }
  const pack = generatePinnedCommentPack({
    videoTitle,
    platform,
    dmKeyword: dmKeyword || db.commentAutopilotConfig.dmKeyword,
  });
  res.json(pack);
});

app.patch('/v1/comments/config', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  const {
    enabled,
    voicePersona,
    brandCtaBridge,
    dmKeyword,
    trollShieldMode,
    autoReplyThresholdConfidence,
    autoSyncHotLeadsToCrm,
  } = req.body || {};

  if (typeof enabled === 'boolean') db.commentAutopilotConfig.enabled = enabled;
  if (
    voicePersona &&
    ['alex_hormozi_cz', 'tech_educator', 'witty_creator', 'executive_b2b'].includes(voicePersona)
  ) {
    db.commentAutopilotConfig.voicePersona = voicePersona;
  }
  if (typeof brandCtaBridge === 'string' && brandCtaBridge.trim()) {
    db.commentAutopilotConfig.brandCtaBridge = brandCtaBridge.trim();
  }
  if (typeof dmKeyword === 'string' && dmKeyword.trim()) {
    db.commentAutopilotConfig.dmKeyword = dmKeyword.trim().toUpperCase().slice(0, 24);
  }
  if (
    trollShieldMode &&
    ['strict_quarantine', 'witty_aikido', 'balanced'].includes(trollShieldMode)
  ) {
    db.commentAutopilotConfig.trollShieldMode = trollShieldMode;
  }
  if (typeof autoReplyThresholdConfidence === 'number') {
    db.commentAutopilotConfig.autoReplyThresholdConfidence = Math.max(
      50,
      Math.min(99, Math.round(autoReplyThresholdConfidence))
    );
  }
  if (typeof autoSyncHotLeadsToCrm === 'boolean') {
    db.commentAutopilotConfig.autoSyncHotLeadsToCrm = autoSyncHotLeadsToCrm;
  }

  res.json({ config: db.commentAutopilotConfig });
});

// 13. Fal Media Infrastructure Layer (Model APIs 1500+, Inference Engine™, Serverless, Compute GPU, Workflows, LoRA Training, CLI & MCP)
app.get('/v1/infra/overview', (req: Request, res: Response) => {
  const query = typeof req.query.query === 'string' ? req.query.query : undefined;
  const modality = (typeof req.query.modality === 'string' ? req.query.modality : 'all') as
    | 'all'
    | 'image'
    | 'video'
    | '3d'
    | 'audio';
  const catalog = getFalCatalog({ query, modality, limit: 48 });
  return res.json({
    summary: catalog.summary,
    models: catalog.models,
    recentRuns: db.falInferenceRuns.slice(0, 20),
    endpoints: db.serverlessEndpoints,
    gpuOfferings: GPU_OFFERINGS,
    gpuInstances: db.computeGpuInstances,
    presetWorkflows: PRESET_INFRA_WORKFLOWS,
    workflowRuns: db.infraWorkflowRuns.slice(0, 15),
    trainingJobs: db.loraTrainingJobs,
    mcpTools: MCP_TOOLS,
  });
});

app.get('/v1/infra/models', (req: Request, res: Response) => {
  const query = typeof req.query.query === 'string' ? req.query.query : undefined;
  const modality = (typeof req.query.modality === 'string' ? req.query.modality : 'all') as
    | 'all'
    | 'image'
    | 'video'
    | '3d'
    | 'audio';
  const limit = req.query.limit ? Number(req.query.limit) : 48;
  return res.json(getFalCatalog({ query, modality, limit }));
});

app.post('/v1/infra/models/run', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;
  try {
    const run = await runFalUnifiedInference(req.body || {});
    db.falInferenceRuns.unshift(run);
    db.activities.unshift({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `Model API: ${run.modelName} (${run.speedupFactor}×)`,
      description: `${run.actualLatencyMs} ms · ${run.outputSummary}`,
      agent: 'CTO Agent',
      timestamp: new Date().toISOString(),
      type: 'action',
    });
    return res.status(201).json({
      run,
      snippets: buildSdkAndCliSnippets(run.modelId, run.prompt),
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Neplatný požadavek na Model API.' });
  }
});

app.get('/v1/infra/serverless', (_req: Request, res: Response) => {
  return res.json({ endpoints: db.serverlessEndpoints });
});

app.post('/v1/infra/serverless/deploy', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;
  try {
    const endpoint = createServerlessEndpointRecord(req.body || {});
    db.serverlessEndpoints.unshift(endpoint);
    db.activities.unshift({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `Serverless 1-Click Deploy: ${endpoint.name}`,
      description: `${endpoint.endpointUrl} (${endpoint.gpuProfile}, cold start ${endpoint.coldStartMs} ms)`,
      agent: 'Automation Agent',
      timestamp: new Date().toISOString(),
      type: 'action',
    });
    return res.status(201).json({ endpoint });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Neplatná konfigurace Serverless endpointu.' });
  }
});

app.post('/v1/infra/serverless/:id/invoke', async (req: Request, res: Response) => {
  if (!ensureSystemActive(res)) return;
  const endpoint = db.serverlessEndpoints.find((e) => e.id === req.params.id);
  if (!endpoint) {
    return res.status(404).json({ error: 'Serverless endpoint nebyl nalezen.' });
  }
  if (endpoint.status === 'paused') {
    return res.status(409).json({ error: 'Endpoint je pozastaven. Nejprve ho aktivujte.' });
  }
  try {
    const prompt = String(req.body?.prompt || `Testovací požadavek na ${endpoint.name}`);
    const run = await runFalUnifiedInference({
      modelId: endpoint.baseModel,
      prompt,
      aspectRatio: '16:9',
      inferenceEngineAccelerated: true,
      loraUrl: endpoint.weightsSourceUrl,
    });
    endpoint.status = 'ready';
    endpoint.requestsCount += 1;
    endpoint.avgLatencyMs = Math.round((endpoint.avgLatencyMs + run.actualLatencyMs) / 2);
    endpoint.updatedAt = new Date().toISOString();
    db.falInferenceRuns.unshift(run);
    return res.json({ endpoint, run });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Volání endpointu selhalo.' });
  }
});

app.patch('/v1/infra/serverless/:id', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  const endpoint = db.serverlessEndpoints.find((e) => e.id === req.params.id);
  if (!endpoint) {
    return res.status(404).json({ error: 'Serverless endpoint nebyl nalezen.' });
  }
  const { status } = req.body || {};
  if (status && ['ready', 'scaled_to_zero', 'paused'].includes(status)) {
    endpoint.status = status;
    endpoint.updatedAt = new Date().toISOString();
  }
  return res.json({ endpoint });
});

app.get('/v1/infra/compute', (_req: Request, res: Response) => {
  return res.json({
    offerings: GPU_OFFERINGS,
    instances: db.computeGpuInstances,
  });
});

app.post('/v1/infra/compute/instances', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;
  try {
    const instance = createComputeInstanceRecord(req.body || {});
    db.computeGpuInstances.unshift(instance);
    db.activities.unshift({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `Compute GPU pronajato: ${instance.gpuCount}× ${instance.gpuName}`,
      description: `${instance.totalVramGb} GB VRAM · $${instance.hourlyCostUsd}/h · ${instance.region}`,
      agent: 'CTO Agent',
      timestamp: new Date().toISOString(),
      type: 'action',
    });
    return res.status(201).json({ instance });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Pronájem GPU selhal.' });
  }
});

app.patch('/v1/infra/compute/instances/:id', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  const instance = db.computeGpuInstances.find((g) => g.id === req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'GPU instance nebyla nalezena.' });
  }
  const { status } = req.body || {};
  if (status && ['running', 'stopped', 'terminated'].includes(status)) {
    instance.status = status;
    if (status !== 'running') {
      instance.utilizationPercent = 0;
      instance.vramUsedGb = 0;
    } else {
      instance.utilizationPercent = 66;
      instance.vramUsedGb = Math.round(instance.totalVramGb * 0.48);
    }
  }
  return res.json({ instance });
});

app.post('/v1/infra/workflows/run', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;
  const { presetId, name, goal, steps, mode = 'workflow' } = req.body || {};
  const preset = presetId ? PRESET_INFRA_WORKFLOWS.find((w) => w.id === presetId) : undefined;
  const resolvedSteps = Array.isArray(steps) && steps.length > 0 ? steps : preset?.steps;
  if (!resolvedSteps || resolvedSteps.length === 0) {
    return res.status(400).json({ error: 'Zadejte presetId nebo alespoň 1 krok workflow.' });
  }
  const run = await executeInfraWorkflow({
    name: name || preset?.name || 'Vlastní Media Workflow',
    goal: goal || preset?.description || 'Multi-step generování médií',
    mode,
    steps: resolvedSteps,
  });
  db.infraWorkflowRuns.unshift(run);
  return res.status(201).json({ workflowRun: run });
});

app.post('/v1/infra/agent/plan', async (req: Request, res: Response) => {
  if (!ensureSystemActive(res)) return;
  const { goal, execute = true } = req.body || {};
  if (!goal || typeof goal !== 'string' || goal.trim().length < 3) {
    return res.status(400).json({ error: 'Parametr goal je povinný (min. 3 znaky).' });
  }
  const plan = buildAgentWorkflowPlan(goal.trim());
  if (!execute) {
    return res.json({ plan });
  }
  const workflowRun = await executeInfraWorkflow({
    name: plan.name,
    goal: goal.trim(),
    mode: 'fal_agent',
    steps: plan.steps,
  });
  db.infraWorkflowRuns.unshift(workflowRun);
  return res.status(201).json({ plan, workflowRun });
});

app.get('/v1/infra/training/jobs', (_req: Request, res: Response) => {
  return res.json({ jobs: db.loraTrainingJobs });
});

app.post('/v1/infra/training/jobs', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;
  try {
    const job = createLoraTrainingJobRecord(req.body || {});
    db.loraTrainingJobs.unshift(job);
    db.activities.unshift({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `LoRA Training dokončen: ${job.adapterName}`,
      description: `Base: ${job.baseModelId} · Trigger: ${job.triggerWord} · Final loss ${job.currentLoss}`,
      agent: 'Video Agent',
      timestamp: new Date().toISOString(),
      type: 'action',
    });
    return res.status(201).json({ job });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Konfigurace LoRA tréninku je neplatná.' });
  }
});

app.post('/v1/infra/training/jobs/:id/deploy', (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  const job = db.loraTrainingJobs.find((j) => j.id === req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Tréninková úloha LoRA nebyla nalezena.' });
  }
  const endpoint = createServerlessEndpointRecord({
    name: `${job.adapterName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-ep`,
    baseModel: job.baseModelId,
    weightsSourceUrl: job.weightsArtifactUrl || `s3://nexus-weights/${job.id}.safetensors`,
    gpuProfile: job.gpuTier === 'rtx-5090' ? 'rtx-4090' : job.gpuTier,
    visibility: 'private',
    minReplicas: 0,
    maxReplicas: 8,
    scaleToZeroSec: 90,
  });
  db.serverlessEndpoints.unshift(endpoint);
  job.deployedEndpointId = endpoint.id;
  return res.status(201).json({ job, endpoint });
});

app.get('/v1/infra/mcp/manifest', (_req: Request, res: Response) => {
  return res.json({
    protocolVersion: '2025-11-05',
    serverInfo: {
      name: 'nexus-fal-media-infrastructure',
      version: '1.0.0',
    },
    tools: MCP_TOOLS,
  });
});

app.post('/v1/infra/mcp/call', async (req: Request, res: Response) => {
  if (!ensureSystemActive(res)) return;
  const { name, arguments: args = {} } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Parametr name (název MCP toolu) je povinný.' });
  }
  try {
    if (name === 'fal_generate_media') {
      const run = await runFalUnifiedInference(args);
      db.falInferenceRuns.unshift(run);
      return res.json({ content: [{ type: 'text', text: run.outputSummary }], structuredContent: run });
    }
    if (name === 'fal_deploy_serverless') {
      const endpoint = createServerlessEndpointRecord({
        name: args.name || 'mcp-endpoint',
        baseModel: args.baseModel || 'fal-ai/flux-3/pro',
        weightsSourceUrl: args.weightsSourceUrl || 's3://nexus-weights/mcp-lora.safetensors',
        gpuProfile: args.gpuProfile || 'h100-sxm',
        visibility: 'private',
        minReplicas: 0,
        maxReplicas: 8,
        scaleToZeroSec: 90,
      });
      db.serverlessEndpoints.unshift(endpoint);
      return res.json({ content: [{ type: 'text', text: `Nasazen endpoint ${endpoint.endpointUrl}` }], structuredContent: endpoint });
    }
    if (name === 'fal_provision_gpu') {
      const instance = createComputeInstanceRecord({
        gpuId: args.gpuId || 'b200-hgx',
        gpuCount: args.gpuCount || 1,
        workload: args.workload || 'lora_training',
        region: 'eu-central-prague',
      });
      db.computeGpuInstances.unshift(instance);
      return res.json({ content: [{ type: 'text', text: `Pronajato ${instance.gpuCount}× ${instance.gpuName}` }], structuredContent: instance });
    }
    if (name === 'fal_run_workflow') {
      const plan = buildAgentWorkflowPlan(String(args.goal || 'Video kampaň'));
      const workflowRun = await executeInfraWorkflow({
        name: plan.name,
        goal: String(args.goal || 'Video kampaň'),
        mode: 'fal_agent',
        steps: plan.steps,
      });
      db.infraWorkflowRuns.unshift(workflowRun);
      return res.json({ content: [{ type: 'text', text: `Workflow ${workflowRun.name} dokončen` }], structuredContent: workflowRun });
    }
    if (name === 'fal_train_lora') {
      const job = createLoraTrainingJobRecord({
        adapterName: args.adapterName || 'MCP LoRA',
        baseModelId: args.baseModelId || 'fal-ai/flux-3/pro',
        triggerWord: args.triggerWord || 'MCPSTYLE',
        datasetSource: 's3://nexus-datasets/mcp-pack.zip',
        gpuTier: 'h100-sxm',
        rank: 32,
        steps: 1000,
        learningRate: 0.0002,
      });
      db.loraTrainingJobs.unshift(job);
      return res.json({ content: [{ type: 'text', text: `LoRA ${job.adapterName} natrénována` }], structuredContent: job });
    }
    return res.status(404).json({ error: `Neznámý MCP tool "${name}".` });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'MCP volání selhalo.' });
  }
});

app.post('/v1/infra/cli/exec', async (req: Request, res: Response) => {
  if (!ensureSystemActive(res)) return;
  const command = String(req.body?.command || '').trim();
  if (!command) {
    return res.status(400).json({ error: 'Zadejte CLI příkaz (např. "genmedia models list" nebo "genmedia run fal-ai/flux-3/pro --prompt ...").' });
  }
  const lower = command.toLowerCase();
  if (lower.startsWith('mcp tools/list')) {
    return res.json({
      exitCode: 0,
      stdout: MCP_TOOLS.map((t) => `• ${t.name} — ${t.description}`).join('\n'),
      data: MCP_TOOLS,
    });
  }
  if (lower.startsWith('genmedia models')) {
    const cat = getFalCatalog({ limit: 8 });
    return res.json({
      exitCode: 0,
      stdout: `Katalog: ${cat.summary.totalModelsCount} produkčních modelů (SLA ${cat.summary.slaUptime}, ${cat.summary.engineName})\n` +
        cat.models.map((m) => `  ${m.id.padEnd(28)} ${m.modality.toUpperCase().padEnd(6)} ${m.speedupFactor}  ${m.pricePerUnit}`).join('\n'),
      data: cat,
    });
  }
  if (lower.startsWith('genmedia run')) {
    const tokens = command.split(/\s+/);
    const modelId = tokens[2] && !tokens[2].startsWith('--') ? tokens[2] : 'fal-ai/flux-3/pro';
    const promptMatch = command.match(/--prompt\s+"([^"]+)"|--prompt\s+'([^']+)'|--prompt\s+([^\s]+)/i);
    const prompt = promptMatch ? promptMatch[1] || promptMatch[2] || promptMatch[3] : 'CLI testovací generace přes fal Inference Engine';
    const run = await runFalUnifiedInference({ modelId, prompt, inferenceEngineAccelerated: true });
    db.falInferenceRuns.unshift(run);
    return res.json({
      exitCode: 0,
      stdout: `[${run.id}] ${run.modelName} (${run.speedupFactor}× · ${run.actualLatencyMs} ms)\n${run.outputSummary}`,
      data: run,
    });
  }
  if (lower.startsWith('genmedia compute rent')) {
    const gpuMatch = command.match(/--gpu\s+([^\s]+)/i);
    const countMatch = command.match(/--count\s+(\d+)/i);
    const gpuId = (gpuMatch?.[1] || 'b300-ultra') as any;
    const instance = createComputeInstanceRecord({
      gpuId: ['rtx-4090', 'rtx-5090', 'h100-sxm', 'h200-sxm', 'b200-hgx', 'b300-ultra'].includes(gpuId)
        ? gpuId
        : 'b300-ultra',
      gpuCount: countMatch ? Math.min(8, Math.max(1, Number(countMatch[1]))) : 1,
      region: 'eu-central-prague',
      workload: 'lora_training',
    });
    db.computeGpuInstances.unshift(instance);
    return res.json({
      exitCode: 0,
      stdout: `[${instance.id}] Pronajato ${instance.gpuCount}× ${instance.gpuName} (${instance.totalVramGb} GB VRAM, $${instance.hourlyCostUsd}/h)\nSSH: ${instance.sshEndpoint}`,
      data: instance,
    });
  }
  if (lower.startsWith('genmedia deploy')) {
    const nameMatch = command.match(/--name\s+([^\s]+)/i);
    const baseMatch = command.match(/--base\s+([^\s]+)/i);
    const endpoint = createServerlessEndpointRecord({
      name: nameMatch?.[1] || `cli-ep-${Date.now().toString(36).slice(-4)}`,
      baseModel: baseMatch?.[1] || 'fal-ai/flux-3/pro',
      weightsSourceUrl: 's3://nexus-weights/cli-deploy.safetensors',
      gpuProfile: 'h100-sxm',
      visibility: 'private',
      minReplicas: 0,
      maxReplicas: 8,
      scaleToZeroSec: 90,
    });
    db.serverlessEndpoints.unshift(endpoint);
    return res.json({
      exitCode: 0,
      stdout: `[${endpoint.id}] Serverless endpoint připraven: ${endpoint.endpointUrl} (cold start ${endpoint.coldStartMs} ms)`,
      data: endpoint,
    });
  }

  return res.json({
    exitCode: 0,
    stdout: `Dostupné příkazy:\n  genmedia models list\n  genmedia run fal-ai/gpt-image-2.6 --prompt "Pražský hrad za úsvitu"\n  genmedia deploy --name my-lora --base fal-ai/flux-3/pro\n  genmedia compute rent --gpu b300-ultra --count 2\n  mcp tools/list`,
  });
});

// 14. Batch Processing Chunk Scheduler, All-in-One MultiGen & Godmode-TitanCore MCP Hub
app.post('/v1/factory/batch/schedule', (req: Request, res: Response) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const autoChunkOptimize = req.body?.autoChunkOptimize !== false;
  const maxChunkSize = Number(req.body?.maxChunkSize || 3);
  const plan = buildOptimizedBatchSchedule(items, {
    autoChunkOptimize,
    maxChunkSize: Number.isFinite(maxChunkSize) ? Math.max(1, Math.min(8, maxChunkSize)) : 3,
  });
  return res.json(plan);
});

app.get('/v1/multigen/artifacts', (_req: Request, res: Response) => {
  return res.json(db.multiGenArtifacts);
});

app.post('/v1/multigen/generate', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;
  try {
    const result = await runMultiGenToolkit({
      type: req.body?.type,
      modelId: req.body?.modelId,
      prompt: req.body?.prompt,
      aspectRatio: req.body?.aspectRatio,
      durationSec: req.body?.durationSec ? Number(req.body.durationSec) : undefined,
      threadId: req.body?.threadId || 'th-main-001',
      captionTop: req.body?.captionTop,
      captionBottom: req.body?.captionBottom,
      dryRun: Boolean(req.body?.dryRun),
    });
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'MultiGen generace selhala.' });
  }
});

app.post('/v1/multigen/avatars/generate', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  if (!ensureSystemActive(res)) return;
  try {
    const modelId = String(req.body?.modelId || 'wan-2-2').trim();
    const prompt =
      typeof req.body?.prompt === 'string' && req.body.prompt.trim()
        ? req.body.prompt.trim()
        : modelId === 'ltx-2-5'
          ? 'Futuristický kybernetický avatar LTX-2.5: zlatý cinematický AI režisér s optickým senzorem a HUD zaměřovačem'
          : 'Futuristický kybernetický avatar WAN-2.2: holografický android s neonově azurovým vizorem a kvantovými obvody';

    const result = await runMultiGenToolkit({
      type: 'image',
      modelId,
      prompt,
      aspectRatio: '1:1',
      threadId: req.body?.threadId || 'th-main-001',
      dryRun: Boolean(req.body?.dryRun),
    });

    return res.status(201).json({
      modelId,
      avatarUrl: result.artifact.previewSvgDataUri,
      artifact: result.artifact,
      asset: result.asset,
      healingEvents: result.healingEvents,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Generování futuristického avatara selhalo.' });
  }
});

app.get('/v1/mcp/manifest', (_req: Request, res: Response) => {
  return res.json({
    protocolVersion: '2025-03-26',
    serverInfo: { name: 'nexus-godmode-titancore-mcp', version: '2.5.0' },
    transports: ['stdio', 'streamable_http', 'sse'],
    capabilities: { tools: true, resources: true, prompts: true, selfHealing: true },
    tools: HUB_MCP_TOOLS,
    resources: HUB_MCP_RESOURCES,
    prompts: HUB_MCP_PROMPTS,
  });
});

app.post('/v1/mcp/rpc', async (req: Request, res: Response) => {
  if (!ensureSystemActive(res)) return;
  const rpcResponse = await handleMcpJsonRpc(req.body);
  return res.json(rpcResponse);
});

app.get('/v1/mcp/sse', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(
    `event: endpoint\ndata: ${JSON.stringify({
      rpcUrl: '/v1/mcp/rpc',
      manifestUrl: '/v1/mcp/manifest',
      protocolVersion: '2025-03-26',
      toolsCount: HUB_MCP_TOOLS.length,
    })}\n\n`
  );

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

app.get('/v1/mcp/endpoints', (_req: Request, res: Response) => {
  return res.json(db.mcpEndpoints);
});

app.post('/v1/mcp/endpoints/generate', (req: Request, res: Response) => {
  if (!ensureSystemActive(res)) return;
  try {
    const endpoint = generateAdaptableMcpEndpoint({
      name: req.body?.name,
      transport: req.body?.transport,
      targetUrlOrCommand: req.body?.targetUrlOrCommand,
      authMode: req.body?.authMode,
      timeoutMs: req.body?.timeoutMs ? Number(req.body.timeoutMs) : undefined,
      maxRetries: req.body?.maxRetries !== undefined ? Number(req.body.maxRetries) : undefined,
    });
    return res.status(201).json({ endpoint });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Neplatná konfigurace MCP endpointu.' });
  }
});

app.post('/v1/mcp/endpoints/:id/test', async (req: Request, res: Response) => {
  const endpoint = db.mcpEndpoints.find((ep) => ep.id === req.params.id);
  if (!endpoint) {
    return res.status(404).json({ error: 'MCP endpoint nenalezen.' });
  }
  const rpcCheck = await handleMcpJsonRpc({
    jsonrpc: '2.0',
    id: `probe-${Date.now()}`,
    method: 'tools/list',
  });
  endpoint.invocationsCount += 1;
  endpoint.status = 'active';
  endpoint.lastTestedAt = new Date().toISOString();
  return res.json({
    ok: true,
    endpoint,
    probeResult: {
      transport: endpoint.transport,
      toolsVerified: (rpcCheck.result as any)?.tools?.length || HUB_MCP_TOOLS.length,
      latencyMs: 14,
      checkedAt: endpoint.lastTestedAt,
    },
  });
});

app.get('/v1/mcp/audit', (_req: Request, res: Response) => {
  return res.json({
    auditLogs: db.mcpAuditLogs,
    selfHealingEvents: db.selfHealingEvents,
    endpoints: db.mcpEndpoints,
  });
});

// API 404 handler so unmatched /v1/* or /api/* routes return JSON instead of SPA HTML
app.use(['/v1', '/api'], (_req: Request, res: Response) => {
  return res.status(404).json({ error: 'Požadovaný API endpoint neexistuje.' });
});

// Structured JSON fallback for uncaught route errors
app.use((err: any, _req: Request, res: Response, _next: express.NextFunction) => {
  const statusCode = typeof err?.status === 'number' ? err.status : 500;
  return res.status(statusCode).json({
    error: err?.message || 'Interní chyba serveru.',
  });
});

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { maxAge: '1h' }));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NEXUS X OS] Server running on http://0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'})`);
    console.log(`[NEXUS X OS] OpenAPI 3.1: http://0.0.0.0:${PORT}/openapi.json`);
    console.log(`[NEXUS X OS] Interactive Docs: http://0.0.0.0:${PORT}/docs`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`[NEXUS X OS] Received ${signal}, flushing state and shutting down...`);
    db.persistSync();
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
}

if (!isTestMode) {
  startServer();
}

export { app };
