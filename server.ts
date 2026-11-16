/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db } from './src/server/db.ts';
import { generateOpenApi31Spec } from './src/server/openapi.ts';
import { AgentOrchestrator } from './src/server/runtime/orchestrator.ts';
import { BoardroomEngine } from './src/server/boardroom.ts';
import { MoviePyCompiler } from './src/server/runtime/moviepy.ts';
import { VideoDirectorEngine } from './src/server/runtime/videoDirector.ts';
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
import { RolePermission, UserRole, VideoSharingPlatform } from './src/types/nexus.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

app.use(express.json({ limit: '5mb' }));

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

// 2. Health & System Pause
app.get('/healthz', (req: Request, res: Response) => {
  res.json({
    status: db.isSystemPaused ? 'paused' : 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    agentsCount: db.agents.length,
    opportunitiesCount: db.opportunities.length,
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
  const { content, dryRun = false } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Obsah zprávy je povinný.' });
  }

  // Save user message
  const userMsg = {
    id: `msg-usr-${Date.now()}`,
    threadId,
    role: 'user' as const,
    content,
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
  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: 'Téma zasedání je povinné.' });

  try {
    const session = await BoardroomEngine.conveneSession(topic);
    res.status(201).json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Agents
app.get('/v1/agents', (req: Request, res: Response) => {
  res.json(db.agents);
});

app.patch('/v1/agents/:id', (req: Request, res: Response) => {
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
  const opp = db.opportunities.find((o) => o.id === req.params.id);
  if (!opp) return res.status(404).json({ error: 'Příležitost nenalezena.' });

  const { status } = req.body;
  if (status && ['new', 'active', 'won', 'paused', 'closed'].includes(status)) {
    opp.status = status;
    opp.updatedAt = new Date().toISOString();
  }
  res.json(opp);
});

// 7. Factory Assets, Media Vault & Video Generations (FFmpeg H.264/AAC + MoviePy)
async function resolveReadyVideoFile(assetId: string): Promise<
  | { status: 'not_found' }
  | { status: 'generating'; asset: (typeof db.factoryAssets)[number] }
  | { status: 'ready'; asset: (typeof db.factoryAssets)[number]; filePath: string; posterPath: string }
> {
  const asset = db.factoryAssets.find((a) => a.id === assetId);
  if (!asset || asset.line !== 'video') return { status: 'not_found' };

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
  const sorted = [...db.factoryAssets].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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

  res.json({
    assets: filtered,
    total: filtered.length,
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
  const {
    topic,
    title,
    threadId = 'th-main-001',
    format = '9:16',
    templateId,
    dryRun = false,
    durationSec = 6,
    async: isAsync = false,
  } = req.body;

  const resolvedTopic = (topic || title || '').trim();
  if (!resolvedTopic) {
    return res.status(400).json({ error: 'Parametr topic nebo title je povinný.' });
  }

  const template = templateId ? db.userTemplates.find((t) => t.id === templateId) : undefined;
  const aspectRatio: '9:16' | '16:9' = format === '16:9' ? '16:9' : '9:16';
  const analyzed = await VideoDirectorEngine.analyzePrompt({
    userMessage: `${resolvedTopic} ${aspectRatio}`,
    forceDefaults: true,
  });
  const brief = {
    ...analyzed.brief,
    aspectRatio,
    durationSec: durationSec || analyzed.brief.durationSec,
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
  const {
    line,
    topic,
    format = '9:16',
    templateId,
    threadId = 'th-main-001',
    dryRun = false,
    async: isAsync = false,
  } = req.body;
  if (!line || !topic) return res.status(400).json({ error: 'Line i topic jsou povinné.' });

  const template = templateId
    ? db.userTemplates.find((t) => t.id === templateId)
    : undefined;

  if (line === 'video') {
    const aspectRatio: '9:16' | '16:9' = format === '16:9' ? '16:9' : '9:16';
    const assetId = `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const analyzed = await VideoDirectorEngine.analyzePrompt({
      userMessage: `${topic} ${aspectRatio}`,
      forceDefaults: true,
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
        topic,
        dryRun: Boolean(dryRun),
      });
      res.setHeader('Retry-After', '1');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(202).json({
        status: 'accepted',
        statusCode: 202,
        retryAfterSeconds: 1,
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

      return res.json({
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
      });
    } catch (err: any) {
      return res.status(500).json({ error: `Chyba při renderu MP4: ${err.message}` });
    }
  } else if (line === 'ad') {
    const asset = {
      id: `asset-${Date.now().toString(36)}`,
      threadId,
      line: 'ad' as const,
      title: `Hook: Automatizujte bez programování | Headline: Od 0 k 50k za 30 dní | CTA: Zahájit bezplatný trial`,
      body: `Reklamní kreativa pro ${topic}. Zaměřeno na konkrétní návratnost bez planých slibů.`,
      meta: 'Meta Ads & YouTube In-Stream, 3 hook varianty',
      tags: ['Meta Ads', 'Konverze', 'PPC'],
      status: 'ready' as const,
      createdAt: new Date().toISOString(),
    };
    db.factoryAssets.unshift(asset);
    return res.json({
      items: [{ title: asset.title, body: asset.body, meta: asset.meta }],
      asset,
    });
  } else {
    const asset = {
      id: `asset-${Date.now().toString(36)}`,
      threadId,
      line: 'funnel' as const,
      title: `Funnel struktura: ${topic}`,
      body: `1. Opt-in Video Squeeze Page -> 2. VSL s interaktivní kalkulačkou -> 3. Okamžitý affiliate checkout.`,
      meta: 'Landing Page Architecture, odhadovaná konverze 26%',
      tags: ['Funnel', 'Landing Page', 'Lead Magnet'],
      status: 'ready' as const,
      createdAt: new Date().toISOString(),
    };
    db.factoryAssets.unshift(asset);
    return res.json({
      items: [{ title: asset.title, body: asset.body, meta: asset.meta }],
      asset,
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

app.post('/api/v1/opengen/prompt-enhance', async (req: Request, res: Response) => {
  const { prompt, modelId = 'veo-3-1', style = 'cinematic', camera = 'orbit_360' } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt je povinný řetězec.' });
  }

  const modelSpec = db.openGenModels.find((m) => m.id === modelId) || db.openGenModels[0];
  const cameraNotes =
    camera === 'orbit_360'
      ? 'dynamic 360-degree rotational arc orbit'
      : camera === 'zoom_in'
      ? 'slow dramatic cinematic push-in dolly zoom'
      : camera === 'pan_left'
      ? 'fluid horizontal leftward tracking pan shot'
      : camera === 'tilt_up'
      ? 'vertical cinematic tilt-up establishing hero shot'
      : camera === 'fpv_drone'
      ? 'high-speed low-altitude dynamic FPV drone glide'
      : 'locked-off tripod studio precision shot';

  const enhancedPrompt = `${prompt.trim()}, shot on 35mm anamorphic lens, Arri Alexa 65 format, photorealistic volumetric lighting, raytraced reflections, ${cameraNotes}, rich textures, pristine color grading in neutral film LUT, hyper-detailed, 8k resolution, optimized for ${modelSpec.name}.`;

  return res.json({
    originalPrompt: prompt,
    enhancedPrompt,
    modelId: modelSpec.id,
    camera,
    style,
    tips: [
      'Pro nejlepší výsledky specifikujte osvětlení (např. "golden hour" nebo "cyberpunk neon")',
      'Použijte negativní prompt pro vyřazení artefaktů (např. "blur, watermark, distorted hands")',
    ],
  });
});

app.post('/api/v1/opengen/generate', async (req: Request, res: Response) => {
  if (!checkActorPermission(req, res, 'create_edit_videos')) return;
  try {
    const {
      modelId = 'veo-3-1',
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
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt je povinný parametr.' });
    }

    const modelSpec = db.openGenModels.find((m) => m.id === modelId) || db.openGenModels[0];
    const cost = modelSpec.creditCost;

    if (db.openGenCredits.available < cost) {
      return res.status(402).json({
        error: `Nedostatek OpenGen kreditů. Požadováno ${cost} kreditů, máte k dispozici ${db.openGenCredits.available}.`,
        requiredCredits: cost,
        availableCredits: db.openGenCredits.available,
      });
    }

    db.openGenCredits.available -= cost;
    db.openGenCredits.usedThisPeriod += cost;

    const resolvedPrompt = promptMagic
      ? `${prompt.trim()}, ${cameraMotion} camera trajectory, photorealistic volumetric light, motion intensity ${motionIntensity}/10, rendered with ${modelSpec.name}`
      : prompt.trim();

    const template = templateId
      ? db.userTemplates.find((t) => t.id === templateId)
      : undefined;

    const analyzed = await VideoDirectorEngine.analyzePrompt({
      userMessage: `${resolvedPrompt} ${aspectRatio}`,
      forceDefaults: true,
    });

    const brief = {
      ...analyzed.brief,
      aspectRatio,
      durationSec: Math.min(modelSpec.maxDurationSec, Math.max(3, durationSec)),
    };

    const storyboard = MoviePyCompiler.createBriefDrivenStoryboard(brief, template);
    const moviePyScript = MoviePyCompiler.generatePythonScript(storyboard, template);
    const assetId = `asset-opengen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    const pendingAsset = createPendingVideoAsset({
      assetId,
      threadId,
      prompt: resolvedPrompt,
      aspectRatio,
      brief,
      storyboard,
      moviePyScript,
      template,
      dryRun: Boolean(dryRun),
    });

    pendingAsset.title = `[${modelSpec.name}] ${storyboard.title}`;
    pendingAsset.tags = [
      'OpenGen',
      modelSpec.name,
      mode,
      cameraMotion,
      qualityTier,
      `${fps}fps`,
      aspectRatio,
      '+faststart',
    ];
    pendingAsset.meta = `OpenGen: ${modelSpec.name} (${mode}, ${cameraMotion}), ${qualityTier} ${aspectRatio} · ${cost} kreditů`;

    db.factoryAssets.unshift(pendingAsset);

    db.activities.unshift({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `OpenGen: Spuštěn render přes ${modelSpec.name}`,
      description: `Prompt: "${prompt.slice(0, 50)}..." | ${qualityTier} (${aspectRatio}) | Odečteno: ${cost} kreditů.`,
      agent: 'Video Agent',
      timestamp: new Date().toISOString(),
      type: 'action',
    });

    if (isAsync) {
      enqueueBackgroundVideoRenderJob({
        asset: pendingAsset,
        threadId,
        aspectRatio,
        brief,
        storyboard,
        template,
        topic: resolvedPrompt,
        dryRun: Boolean(dryRun),
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
      });
    }

    const result = await executeVideoRenderJob({
      asset: pendingAsset,
      threadId,
      aspectRatio,
      brief,
      storyboard,
      template,
      topic: resolvedPrompt,
      dryRun: Boolean(dryRun),
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
    });
  } catch (err: any) {
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
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NEXUS X OS] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[NEXUS X OS] OpenAPI 3.1: http://0.0.0.0:${PORT}/openapi.json`);
    console.log(`[NEXUS X OS] Interactive Docs: http://0.0.0.0:${PORT}/docs`);
  });
}

const isTestMode =
  process.env.NODE_ENV === 'test' ||
  process.env.NEXUS_SKIP_LISTEN === '1' ||
  process.execArgv.some((arg) => arg.includes('test')) ||
  process.argv.some((arg) => arg === '--test');

if (!isTestMode) {
  startServer();
}

export { app };


