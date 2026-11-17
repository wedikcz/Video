/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  MediaRenderStage,
  StructuredVideoPrompt,
  UserVideoTemplate,
  VideoCreativeBrief,
  VideoStoryboard,
} from '../../types/nexus.ts';
import {
  CAMERA_MOTION_LABELS,
  LIGHTING_LABELS,
  OPTICS_LABELS,
  TRANSITION_LABELS,
} from '../../utils/structuredVideoPrompt.ts';

const execFileAsync = promisify(execFile);

export const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'videos');
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT_MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf';
const DEFAULT_SIGNING_SECRET = process.env.NEXUS_MEDIA_SECRET || 'nexus-x-os-media-signing-key-2026';

export const DEFAULT_MAX_OPEN_RANGE_BYTES = 2 * 1024 * 1024; // 2 MB cap per open-ended Range response

export interface RenderedVideoArtifact {
  assetId: string;
  threadId: string;
  filePath: string;
  posterPath: string;
  sizeBytes: number;
  sha256: string;
  durationSec: number;
  resolution: string;
  mimeType: 'video/mp4';
  streamUrl: string;
  downloadUrl: string;
  renderedWithFfmpeg: boolean;
  faststartVerified: boolean;
  atoms: string[];
}

export interface PreviewSnippetArtifact {
  assetId: string;
  threadId: string;
  previewPath: string;
  sizeBytes: number;
  sha256: string;
  durationSec: number;
  mimeType: 'video/mp4';
  previewUrl: string;
  renderedWithFfmpeg: boolean;
  cached: boolean;
  faststartVerified: boolean;
  atoms: string[];
}

export interface Mp4AtomInspection {
  valid: boolean;
  atoms: string[];
  moovBeforeMdat: boolean;
}

/**
 * Scans top-level ISO BMFF / MP4 boxes to verify container structure and confirm
 * that the `moov` metadata atom precedes `mdat` (`-movflags +faststart`).
 */
export function inspectMp4Atoms(filePath: string): Mp4AtomInspection {
  if (!fs.existsSync(filePath)) {
    return { valid: false, atoms: [], moovBeforeMdat: false };
  }
  const stat = fs.statSync(filePath);
  if (stat.size < 16) {
    return { valid: false, atoms: [], moovBeforeMdat: false };
  }

  const fd = fs.openSync(filePath, 'r');
  const headerBuf = Buffer.alloc(16);
  const atoms: string[] = [];
  let offset = 0;

  try {
    while (offset + 8 <= stat.size && atoms.length < 64) {
      const bytesRead = fs.readSync(fd, headerBuf, 0, 16, offset);
      if (bytesRead < 8) break;

      const size32 = headerBuf.readUInt32BE(0);
      const boxType = headerBuf.toString('ascii', 4, 8);
      if (!/^[a-zA-Z0-9 _-]{4}$/.test(boxType)) break;

      atoms.push(boxType);
      let boxSize = size32;
      if (size32 === 1) {
        if (bytesRead < 16) break;
        const hi = headerBuf.readUInt32BE(8);
        const lo = headerBuf.readUInt32BE(12);
        boxSize = hi * 2 ** 32 + lo;
      } else if (size32 === 0) {
        boxSize = stat.size - offset;
      }

      if (boxSize < 8) break;
      offset += boxSize;
    }
  } finally {
    fs.closeSync(fd);
  }

  const ftypIdx = atoms.indexOf('ftyp');
  const moovIdx = atoms.indexOf('moov');
  const mdatIdx = atoms.indexOf('mdat');
  const moovBeforeMdat = moovIdx !== -1 && (mdatIdx === -1 || moovIdx < mdatIdx);

  return {
    valid: ftypIdx !== -1 && atoms.length >= 2,
    atoms,
    moovBeforeMdat,
  };
}

export interface ParsedHttpRange {
  start: number;
  end: number;
  valid: boolean;
}

/**
 * Parses a single HTTP Range header (`bytes=start-end`, `bytes=start-`, or `bytes=-suffix`)
 * against total file size. Open-ended `bytes=start-` chunks are capped at `maxOpenEndedBytes`
 * to prevent bandwidth spikes during rapid gallery scrolling.
 */
export function parseHttpRange(
  rangeHeader: string | undefined,
  totalSize: number,
  maxOpenEndedBytes: number = DEFAULT_MAX_OPEN_RANGE_BYTES
): ParsedHttpRange | null {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=') || totalSize <= 0) {
    return null;
  }

  const spec = rangeHeader.replace(/^bytes=/, '').split(',')[0].trim();
  const [rawStart, rawEnd] = spec.split('-');

  if (rawStart === '' && rawEnd !== '') {
    // Suffix byte range: bytes=-500
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) {
      return { start: 0, end: totalSize - 1, valid: false };
    }
    const clampedLength = Math.min(suffixLength, maxOpenEndedBytes);
    const start = Math.max(0, totalSize - clampedLength);
    return { start, end: totalSize - 1, valid: true };
  }

  const start = Number.parseInt(rawStart, 10);
  if (Number.isNaN(start) || start < 0 || start >= totalSize) {
    return { start: 0, end: totalSize - 1, valid: false };
  }

  let end: number;
  if (rawEnd === undefined || rawEnd === '') {
    // Open-ended byte range: cap chunk size to maxOpenEndedBytes
    end = Math.min(totalSize - 1, start + Math.max(1, maxOpenEndedBytes) - 1);
  } else {
    end = Number.parseInt(rawEnd, 10);
    if (Number.isNaN(end) || end < start || end >= totalSize) {
      return { start: 0, end: totalSize - 1, valid: false };
    }
  }

  return { start, end, valid: true };
}

export function slugifyFilename(input: string): string {
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return normalized || 'video';
}

export function signMediaStreamToken(assetId: string, ttlMs: number = 3600 * 1000): {
  expires: number;
  signature: string;
} {
  const expires = Date.now() + ttlMs;
  const signature = crypto
    .createHmac('sha256', DEFAULT_SIGNING_SECRET)
    .update(`${assetId}:${expires}`)
    .digest('hex')
    .slice(0, 32);
  return { expires, signature };
}

export function verifyMediaStreamToken(
  assetId: string,
  expiresRaw: string | undefined,
  signatureRaw: string | undefined
): { valid: boolean; reason?: string } {
  if (!expiresRaw || !signatureRaw) {
    return { valid: false, reason: 'Chybí parametry podpisu (expires nebo signature).' };
  }
  const expires = Number.parseInt(expiresRaw, 10);
  if (Number.isNaN(expires) || expires < Date.now()) {
    return { valid: false, reason: 'Platnost podepsaného odkazu vypršela.' };
  }
  const expected = crypto
    .createHmac('sha256', DEFAULT_SIGNING_SECRET)
    .update(`${assetId}:${expires}`)
    .digest('hex')
    .slice(0, 32);

  const sigBuf = Buffer.from(signatureRaw);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'Neplatný kryptografický podpis media streamu.' };
  }
  return { valid: true };
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
    .trim();
}

function wrapTextLines(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

export interface GradientColorSet {
  c0: string;
  c1: string;
  c2: string;
  c3: string;
  hex: string;
  sec: string;
}

export function resolveGradientPalette(style?: string, fallbackHex = '#10b981', fallbackSec = '#38bdf8'): GradientColorSet {
  const s = (style || '').toLowerCase();
  if (s.includes('cyberpunk') || s.includes('neon') || s.includes('kyber')) {
    return { c0: '0x0d0221', c1: '0x260c38', c2: '0x051622', c3: '0x1b003a', hex: '0x06b6d4', sec: '0xec4899' };
  }
  if (s.includes('fintech') || s.includes('emerald') || s.includes('smaragd')) {
    return { c0: '0x041325', c1: '0x092635', c2: '0x051c24', c3: '0x0e3a43', hex: '0x10b981', sec: '0x34d399' };
  }
  if (s.includes('gold') || s.includes('zlat') || s.includes('luxury') || s.includes('luxus')) {
    return { c0: '0x1a120b', c1: '0x2b1e11', c2: '0x140d07', c3: '0x382813', hex: '0xf59e0b', sec: '0xfde047' };
  }
  if (s.includes('anime') || s.includes('manga')) {
    return { c0: '0x1e1035', c1: '0x3b0764', c2: '0x4c0519', c3: '0x172554', hex: '0xf472b6', sec: '0x818cf8' };
  }
  if (s.includes('retro') || s.includes('synth')) {
    return { c0: '0x180b2c', c1: '0x2e0854', c2: '0x0c1b33', c3: '0x43123b', hex: '0xec4899', sec: '0x06b6d4' };
  }
  if (s.includes('kawaii') || s.includes('pink') || s.includes('pastel')) {
    return { c0: '0x2e1065', c1: '0x4a044e', c2: '0x701a75', c3: '0x1e1b4b', hex: '0xf472b6', sec: '0x38bdf8' };
  }
  if (s.includes('tabule') || s.includes('board') || s.includes('blueprint') || s.includes('klasick') || s.includes('classic')) {
    return { c0: '0x0a192f', c1: '0x0c2744', c2: '0x081e36', c3: '0x041122', hex: '0x38bdf8', sec: '0x60a5fa' };
  }
  if (s.includes('starod') || s.includes('ancient') || s.includes('pergam')) {
    return { c0: '0x1f140e', c1: '0x2e1c12', c2: '0x160d09', c3: '0x3a2417', hex: '0xd97706', sec: '0xfef3c7' };
  }
  if (s.includes('vystrihov') || s.includes('cutout') || s.includes('paper')) {
    return { c0: '0x1c140d', c1: '0x3b2414', c2: '0x160f0a', c3: '0x4a2c16', hex: '0xf59e0b', sec: '0xfbbf24' };
  }
  if (s.includes('akvarel') || s.includes('watercolor')) {
    return { c0: '0x061e24', c1: '0x092b33', c2: '0x05171b', c3: '0x0e3a45', hex: '0x2dd4bf', sec: '0x38bdf8' };
  }
  if (s.includes('coral') || s.includes('energ')) {
    return { c0: '0x1f0814', c1: '0x350d24', c2: '0x1a0614', c3: '0x400e28', hex: '0xf43f5e', sec: '0xfb923c' };
  }
  const h = fallbackHex.startsWith('#') ? `0x${fallbackHex.slice(1)}` : '0x10b981';
  const sColor = fallbackSec.startsWith('#') ? `0x${fallbackSec.slice(1)}` : '0x38bdf8';
  return { c0: '0x0a192f', c1: '0x1e1b4b', c2: '0x311042', c3: '0x0f172a', hex: h, sec: sColor };
}

/**
 * Generates a real playable H.264/AAC MP4 file on disk atomically (.tmp -> rename)
 * using ffmpeg with `+faststart`, plus a lightweight JPEG poster frame.
 */
export class MediaRenderer {
  private static inFlightRenders = new Map<string, Promise<boolean>>();

  public static getAssetFilePath(threadId: string, assetId: string): string {
    const safeThread = threadId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeAsset = assetId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(STORAGE_ROOT, safeThread, `${safeAsset}.mp4`);
  }

  public static getPosterFilePath(threadId: string, assetId: string): string {
    const safeThread = threadId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeAsset = assetId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(STORAGE_ROOT, safeThread, `${safeAsset}.poster.jpg`);
  }

  public static getPreviewFilePath(threadId: string, assetId: string): string {
    const safeThread = threadId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeAsset = assetId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(STORAGE_ROOT, safeThread, `${safeAsset}.preview.mp4`);
  }

  public static computeFileChecksum(filePath: string): { sizeBytes: number; sha256: string } {
    const buffer = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    return { sizeBytes: buffer.byteLength, sha256 };
  }

  /**
   * Guarantees that an MP4 file has its `moov` atom placed at the beginning via FFmpeg
   * `-movflags +faststart` using atomic temporary file replacement.
   */
  public static async ensureFaststartMp4(
    inputPath: string,
    outputPath: string = inputPath,
    forceRemux: boolean = false
  ): Promise<{ faststartVerified: boolean; atoms: string[]; remuxed: boolean }> {
    const initial = inspectMp4Atoms(inputPath);
    if (initial.moovBeforeMdat && !forceRemux && inputPath === outputPath) {
      return { faststartVerified: true, atoms: initial.atoms, remuxed: false };
    }

    const tmpFaststart = `${outputPath}.${process.pid}.${Date.now()}.faststart.tmp.mp4`;
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-i',
          inputPath,
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          tmpFaststart,
        ],
        { timeout: 12000 }
      );
      if (fs.existsSync(tmpFaststart) && fs.statSync(tmpFaststart).size > 1024) {
        const check = inspectMp4Atoms(tmpFaststart);
        fs.renameSync(tmpFaststart, outputPath);
        return {
          faststartVerified: check.moovBeforeMdat,
          atoms: check.atoms,
          remuxed: true,
        };
      }
    } catch (err) {
      if (fs.existsSync(tmpFaststart)) fs.unlinkSync(tmpFaststart);
      console.warn('[MediaRenderer] faststart remux fallback:', err);
    }

    const finalCheck = inspectMp4Atoms(outputPath);
    return {
      faststartVerified: finalCheck.moovBeforeMdat,
      atoms: finalCheck.atoms,
      remuxed: false,
    };
  }

  public static async renderVideoMp4(params: {
    assetId: string;
    threadId?: string;
    title: string;
    prompt?: string;
    format?: '9:16' | '16:9';
    durationSec?: number;
    storyboard?: VideoStoryboard;
    template?: UserVideoTemplate;
    brief?: VideoCreativeBrief;
    structuredPrompt?: StructuredVideoPrompt;
    dryRun?: boolean;
    onStageProgress?: (stage: MediaRenderStage, percent: number, message: string) => void;
  }): Promise<RenderedVideoArtifact> {
    const sp = params.structuredPrompt || params.brief?.structuredPrompt || params.storyboard?.structuredPrompt;
    const threadId = params.threadId || 'th-main-001';
    const format = sp?.aspectRatio || params.brief?.aspectRatio || params.format || params.storyboard?.aspectRatio || '9:16';
    const durationSec = Math.max(
      3,
      Math.min(15, sp?.totalDurationSec || params.brief?.durationSec || params.durationSec || 6)
    );
    const resolution = format === '16:9' ? '1280x720' : '720x1280';
    const [width, height] = resolution.split('x').map(Number);

    const filePath = this.getAssetFilePath(threadId, params.assetId);
    const posterPath = this.getPosterFilePath(threadId, params.assetId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // In both live and dry-run, execute high-speed local procedural render with distinct titles, hooks, gradients & audio
    params.onStageProgress?.(
      'rendering_ffmpeg',
      40,
      sp
        ? `Lokální FFmpeg syntéza: ${sp.temporal.beats.length} časových fází (${sp.camera.primaryMotion}, ${sp.style.optics})...`
        : 'FFmpeg renderuje H.264/AAC scény a kinetické titulky...'
    );
    const renderedWithFfmpeg = await this.renderFfmpegClip({
      outputPath: filePath,
      posterPath,
      width,
      height,
      durationSec,
      title: params.brief?.title || params.title,
      hook:
        params.brief?.hook ||
        params.storyboard?.hook ||
        params.prompt ||
        'Autonomně vyrenderováno v NEXUS X OS Video Studio',
      cta:
        params.brief?.cta ||
        params.storyboard?.cta ||
        'Stáhněte si MP4 nebo publikujte přímo na sociální sítě.',
      highlightColor: sp?.style.accentColor || params.brief?.accentColor || params.template?.subtitleStyle?.highlightColor || '#10b981',
      secondaryColor: sp?.style.secondaryColor || params.brief?.secondaryColor || '#38bdf8',
      bgHex: sp?.style.bgHex || params.brief?.bgHex || '0x0a0f18',
      platformLabel: params.brief?.platform || params.storyboard?.targetPlatform || 'LOCAL DIRECTOR',
      styleTheme: params.brief?.notebookStyle || params.brief?.visualStyle || sp?.style.visualStyle,
      bpm: params.brief?.bpm || params.template?.musicPreset?.bpm || 128,
      scenes: params.brief?.scenes,
      structuredPrompt: sp,
      onStageProgress: params.onStageProgress,
    });

    params.onStageProgress?.('optimizing_faststart', 82, 'Optimalizace pro rychlý webový stream (-movflags +faststart)...');
    const faststart = renderedWithFfmpeg
      ? await this.ensureFaststartMp4(filePath)
      : { faststartVerified: false, atoms: inspectMp4Atoms(filePath).atoms, remuxed: false };

    params.onStageProgress?.('verifying_integrity', 94, 'Kontrola integrity souboru a SHA-256 kontrolní součet...');
    const { sizeBytes, sha256 } = this.computeFileChecksum(filePath);

    return {
      assetId: params.assetId,
      threadId,
      filePath,
      posterPath,
      sizeBytes,
      sha256,
      durationSec,
      resolution,
      mimeType: 'video/mp4',
      streamUrl: `/api/v1/assets/${params.assetId}/stream`,
      downloadUrl: `/api/v1/assets/${params.assetId}/download`,
      renderedWithFfmpeg,
      faststartVerified: faststart.faststartVerified,
      atoms: faststart.atoms,
    };
  }

  public static async ensureReferenceVideoFile(
    assetId: string,
    threadId = 'th-main-001',
    title = 'Jak jsem nechal AI vydělávat zatímco spím',
    format: '9:16' | '16:9' = '9:16'
  ): Promise<RenderedVideoArtifact> {
    const filePath = this.getAssetFilePath(threadId, assetId);
    const posterPath = this.getPosterFilePath(threadId, assetId);
    const resolution = format === '16:9' ? '1280x720' : '720x1280';

    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1024) {
      const faststart = await this.ensureFaststartMp4(filePath);
      await this.ensurePosterFile(filePath, posterPath);
      const { sizeBytes, sha256 } = this.computeFileChecksum(filePath);
      return {
        assetId,
        threadId,
        filePath,
        posterPath,
        sizeBytes,
        sha256,
        durationSec: 6,
        resolution,
        mimeType: 'video/mp4',
        streamUrl: `/api/v1/assets/${assetId}/stream`,
        downloadUrl: `/api/v1/assets/${assetId}/download`,
        renderedWithFfmpeg: true,
        faststartVerified: faststart.faststartVerified,
        atoms: faststart.atoms,
      };
    }

    return this.renderVideoMp4({
      assetId,
      threadId,
      title,
      format,
      durationSec: 6,
    });
  }

  public static async ensurePosterFile(videoPath: string, posterPath: string): Promise<string> {
    const videoReady = fs.existsSync(videoPath) && fs.statSync(videoPath).size > 1024;
    if (fs.existsSync(posterPath)) {
      const posterSize = fs.statSync(posterPath).size;
      // Only reuse cached poster if it's a real JPEG (>512 bytes) or if video isn't ready yet
      if (posterSize > 512 || !videoReady) {
        return posterPath;
      }
    }

    fs.mkdirSync(path.dirname(posterPath), { recursive: true });
    const tmpPoster = `${posterPath}.${process.pid}.${Date.now()}.tmp.jpg`;
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          '0.5',
          '-i',
          videoPath,
          '-vframes',
          '1',
          '-q:v',
          '4',
          tmpPoster,
        ],
        { timeout: 8000 }
      );
      if (fs.existsSync(tmpPoster) && fs.statSync(tmpPoster).size > 0) {
        fs.renameSync(tmpPoster, posterPath);
        return posterPath;
      }
    } catch {
      if (fs.existsSync(tmpPoster)) fs.unlinkSync(tmpPoster);
    }

    // Minimal valid 1x1 JPEG fallback if poster extraction isn't available
    const fallbackJpg = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      'base64'
    );
    fs.writeFileSync(tmpPoster, fallbackJpg);
    fs.renameSync(tmpPoster, posterPath);
    return posterPath;
  }

  public static async ensurePreviewSnippet(opts: {
    assetId: string;
    threadId?: string;
    sourcePath?: string;
    durationSec?: number;
    forceRegenerate?: boolean;
  }): Promise<PreviewSnippetArtifact> {
    const threadId = opts.threadId || 'th-main-001';
    const previewPath = this.getPreviewFilePath(threadId, opts.assetId);
    const videoPath = opts.sourcePath || this.getAssetFilePath(threadId, opts.assetId);
    const snippetDuration = Math.max(1.0, Math.min(6.0, opts.durationSec || 2.5));

    fs.mkdirSync(path.dirname(previewPath), { recursive: true });

    if (!opts.forceRegenerate && fs.existsSync(previewPath)) {
      const stat = fs.statSync(previewPath);
      if (stat.size > 512) {
        const { sha256 } = this.computeFileChecksum(previewPath);
        const atoms = inspectMp4Atoms(previewPath);
        return {
          assetId: opts.assetId,
          threadId,
          previewPath,
          sizeBytes: stat.size,
          sha256,
          durationSec: snippetDuration,
          mimeType: 'video/mp4',
          previewUrl: `/api/v1/assets/${opts.assetId}/preview`,
          renderedWithFfmpeg: true,
          cached: true,
          faststartVerified: atoms.moovBeforeMdat,
          atoms: atoms.atoms,
        };
      }
    }

    // Ensure source video file exists or generate reference video
    if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size <= 1024) {
      await this.ensureReferenceVideoFile(opts.assetId, threadId);
    }

    const tmpPreview = `${previewPath}.${process.pid}.${Date.now()}.tmp.mp4`;
    let renderedWithFfmpeg = false;

    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          '0.1',
          '-t',
          snippetDuration.toFixed(1),
          '-i',
          videoPath,
          '-vf',
          'scale=360:-2:force_original_aspect_ratio=decrease',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '28',
          '-an',
          '-movflags',
          '+faststart',
          tmpPreview,
        ],
        { timeout: 12000 }
      );

      if (fs.existsSync(tmpPreview) && fs.statSync(tmpPreview).size > 512) {
        fs.renameSync(tmpPreview, previewPath);
        renderedWithFfmpeg = true;
      }
    } catch (err) {
      if (fs.existsSync(tmpPreview)) fs.unlinkSync(tmpPreview);
      console.warn('[MediaRenderer] ensurePreviewSnippet ffmpeg generation fallback:', err);
    }

    if (!renderedWithFfmpeg) {
      if (fs.existsSync(videoPath)) {
        try {
          fs.copyFileSync(videoPath, previewPath);
        } catch {
          // ignore
        }
      }
      if (!fs.existsSync(previewPath) || fs.statSync(previewPath).size === 0) {
        const fallbackBytes = Buffer.from(
          '00000018667479706d703432000000006d70343269736f6d000000086d64617400000000',
          'hex'
        );
        fs.writeFileSync(previewPath, fallbackBytes);
      }
    }

    const atoms = inspectMp4Atoms(previewPath);
    const { sizeBytes, sha256 } = this.computeFileChecksum(previewPath);

    return {
      assetId: opts.assetId,
      threadId,
      previewPath,
      sizeBytes,
      sha256,
      durationSec: snippetDuration,
      mimeType: 'video/mp4',
      previewUrl: `/api/v1/assets/${opts.assetId}/preview`,
      renderedWithFfmpeg,
      cached: false,
      faststartVerified: atoms.moovBeforeMdat,
      atoms: atoms.atoms,
    };
  }

  private static async renderFfmpegClip(opts: {
    outputPath: string;
    posterPath: string;
    width: number;
    height: number;
    durationSec: number;
    title: string;
    hook: string;
    cta: string;
    highlightColor: string;
    secondaryColor: string;
    bgHex: string;
    platformLabel: string;
    styleTheme?: string;
    bpm: number;
    scenes?: VideoCreativeBrief['scenes'];
    structuredPrompt?: StructuredVideoPrompt;
    onStageProgress?: (stage: MediaRenderStage, percent: number, message: string) => void;
  }): Promise<boolean> {
    const existing = this.inFlightRenders.get(opts.outputPath);
    if (existing) {
      return existing;
    }

    const task = (async () => {
      fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
      const tmpOutputPath = `${opts.outputPath}.${process.pid}.${Date.now()}.tmp.mp4`;

      const hasBoldFont = fs.existsSync(FONT_BOLD);
      const hasMonoFont = fs.existsSync(FONT_MONO);
      const fontOpt = hasBoldFont ? `fontfile=${FONT_BOLD}:` : '';
      const monoFontOpt = hasMonoFont ? `fontfile=${FONT_MONO}:` : fontOpt;

      const sp = opts.structuredPrompt;
      const palette = resolveGradientPalette(
        opts.styleTheme || sp?.style.visualStyle || opts.platformLabel,
        opts.highlightColor,
        opts.secondaryColor
      );
      const hexColor = palette.hex;
      const secColor = palette.sec;

      const isWide = opts.width > opts.height;
      const shortEdge = Math.min(opts.width, opts.height);
      const renderFps = sp?.fps === 24 || sp?.fps === 60 ? Math.min(30, sp.fps) : 24;
      const ctaPillText = escapeDrawtext(
        (opts.cta && opts.cta.length <= 36 ? opts.cta : 'SLEDUJ PROFIL PRO DALŠÍ DÍL SÉRIE').toUpperCase()
      );

      const filters: string[] = [
        // 1. Perspective blueprint grid
        'drawgrid=w=64:h=64:color=white@0.045:t=1',
        // 2. Cinematic vignette for peripheral focus
        'vignette=PI/4',
        // 3. Top TikTok / Studio live creator bar (widened so YOUTUBE SHORTS fits untruncated)
        'drawbox=x=36:y=32:w=352:h=40:color=0x000000@0.68:t=fill',
        'drawbox=x=36:y=32:w=352:h=40:color=white@0.18:t=1',
        // Red live REC indicator
        'drawbox=x=50:y=46:w=12:h=12:color=0xef4444:t=fill',
        `drawtext=${monoFontOpt}text='@NEXUS · ${escapeDrawtext(opts.platformLabel.toUpperCase().slice(0, 18))}':fontcolor=0xffffff:fontsize=${Math.round(shortEdge * 0.022)}:x=72:y=44`,
        `drawtext=${monoFontOpt}text='REC 4K // ${opts.bpm} BPM':fontcolor=${secColor}:fontsize=${Math.round(shortEdge * 0.021)}:x=w-tw-42:y=44`,
        // 4. Central frosted glass card with glowing neon border
        `drawbox=x=36:y=ih*0.19:w=iw-72:h=ih*0.52:color=0x030712@0.78:t=fill`,
        `drawbox=x=36:y=ih*0.19:w=iw-72:h=ih*0.52:color=${hexColor}@0.45:t=2`,
        // Top accent line on card
        `drawbox=x=36:y=ih*0.19:w=iw-72:h=4:color=${hexColor}@0.95:t=fill`,
        // 5. Animated bottom progress bar synced to duration
        'drawbox=x=44:y=ih-46:w=iw-88:h=8:color=0x18181b@0.95:t=fill',
        `drawbox=x=44:y=ih-46:w='(iw-88)*t/${opts.durationSec}':h=8:color=${hexColor}@0.95:t=fill`,
        // 6. Bottom Safe-Zone CTA pill (Hormozi style)
        `drawbox=x=44:y=ih-104:w=iw-88:h=44:color=${hexColor}@0.95:t=fill`,
        `drawtext=${fontOpt}text='${ctaPillText}':fontcolor=0x000000:fontsize=${Math.round(shortEdge * 0.025)}:x=(w-text_w)/2:y=h-91`,
        // 7. Card bottom-right style badge aligned cleanly above equalizer baseline
        `drawtext=${monoFontOpt}text='${escapeDrawtext((opts.styleTheme || sp?.style.visualStyle || 'STUDIO').toUpperCase().replace(/_/g, ' '))}':fontcolor=0x94a3b8:fontsize=${Math.round(shortEdge * 0.019)}:x=w-tw-54:y=h*0.665`,
      ];

      // 12 animated audio-reactive equalizer bars growing cleanly UPWARD from baseline ih*0.680
      for (let b = 0; b < 12; b++) {
        const barX = 52 + b * (isWide ? 28 : 18);
        const speed = (2.2 + b * 0.4).toFixed(1);
        const barHExpr = `8+24*abs(sin(t*${speed}+${b}))`;
        filters.push(
          `drawbox=x=${barX}:y='ih*0.680-(${barHExpr})':w=${isWide ? 14 : 10}:h='${barHExpr}':color=${b % 2 === 0 ? hexColor : secColor}@0.88:t=fill`
        );
      }

      if (sp && sp.temporal.beats.length > 0) {
        const totalUnits = sp.temporal.beats.reduce((acc, b) => acc + Math.max(0.5, b.durationSec), 0);
        let tCursor = 0;

        sp.temporal.beats.forEach((beat, idx) => {
          const isLast = idx === sp.temporal.beats.length - 1;
          const segDuration = isLast
            ? Math.max(0.5, opts.durationSec - tCursor)
            : (Math.max(0.5, beat.durationSec) / totalUnits) * opts.durationSec;
          const startT = tCursor.toFixed(2);
          const endT = (tCursor + segDuration).toFixed(2);
          const flashEndT = (tCursor + Math.min(0.22, segDuration * 0.25)).toFixed(2);
          tCursor += segDuration;

          const enableExpr = isLast
            ? `gte(t,${startT})`
            : `gte(t,${startT})*lt(t,${endT})`;

          // 1. Temporal Transition Flash / Whip-Pan / Glitch Pulse at beat start
          if (idx > 0 || beat.transitionIn === 'glitch_flash' || beat.transitionIn === 'zoom_punch') {
            const flashColor =
              beat.transitionIn === 'glitch_flash'
                ? secColor
                : beat.transitionIn === 'zoom_punch'
                ? hexColor
                : '0xffffff';
            filters.push(
              `drawbox=x=0:y=0:w=iw:h=ih:color=${flashColor}@0.28:t=fill:enable='gte(t,${startT})*lt(t,${flashEndT})'`
            );
          }

          // 2. Animated Focal Camera Target Frame simulating zoomStart -> zoomEnd & panX/panY trajectory
          const zStart = Math.max(0.75, Math.min(1.5, beat.cameraZoomStart || 1.0));
          const zEnd = Math.max(0.75, Math.min(1.5, beat.cameraZoomEnd || 1.1));
          const zDelta = (zEnd - zStart).toFixed(3);
          const panXFactor = (beat.cameraPanX * 0.14).toFixed(3);
          const panYFactor = (beat.cameraPanY * 0.10).toFixed(3);
          const prog = `((t-${startT})/${segDuration.toFixed(2)})`;
          const orbitAmp = beat.cameraKeyframe === 'orbit_360' ? '+iw*0.09*sin(t*2.1)' : '';
          const fpvBounce = beat.cameraKeyframe === 'fpv_drone' ? '+ih*0.04*sin(t*4.2)' : '';

          const boxWExpr = `iw*0.66*(${zStart.toFixed(2)}+(${zDelta})*${prog})`;
          const boxHExpr = `ih*0.18*(${zStart.toFixed(2)}+(${zDelta})*${prog})`;
          const boxXExpr = `(iw-(${boxWExpr}))/2+iw*(${panXFactor})*${prog}${orbitAmp}`;
          const boxYExpr = `ih*0.405+ih*(${panYFactor})*${prog}${fpvBounce}`;

          filters.push(
            `drawbox=x='${boxXExpr}':y='${boxYExpr}':w='${boxWExpr}':h='${boxHExpr}':color=${idx % 2 === 0 ? hexColor : secColor}@0.35:t=2:enable='${enableExpr}'`
          );

          // 3. Beat Phase + Camera Keyframe badge
          const phaseText = escapeDrawtext(
            `FÁZE ${idx + 1}/${sp.temporal.beats.length} · ${CAMERA_MOTION_LABELS[beat.cameraKeyframe].split('(')[0].trim().toUpperCase()} (${zStart.toFixed(2)}x->${zEnd.toFixed(2)}x)`
          );
          filters.push(
            `drawtext=${monoFontOpt}text='${phaseText}':fontcolor=${secColor}:fontsize=${Math.round(shortEdge * 0.023)}:x=(w-text_w)/2:y=${Math.round(opts.height * 0.145)}:enable='${enableExpr}'`
          );

          // 4. Beat Title / Kinetic Headline (centered well above caption zone)
          const beatTitleLines = wrapTextLines(beat.beatTitle || opts.title, isWide ? 36 : 24);
          const titleFontSize = Math.round(shortEdge * 0.044);
          const titleStartY = Math.round(opts.height * 0.238);
          beatTitleLines.forEach((line, lIdx) => {
            filters.push(
              `drawtext=${fontOpt}text='${escapeDrawtext(line)}':fontcolor=0xffffff:fontsize=${titleFontSize}:x=(w-text_w)/2:y=${titleStartY + lIdx * Math.round(titleFontSize * 1.24)}:enable='${enableExpr}'`
            );
          });

          // 5. Scene Progression / Kinetic Caption Box (Hormozi Style framed inside camera target box)
          const capLines = wrapTextLines(beat.kineticCaption || beat.sceneDescription, isWide ? 44 : 28);
          const subFontSize = Math.round(shortEdge * 0.031);
          const subStartY = Math.round(opts.height * 0.445);
          capLines.forEach((line, lIdx) => {
            filters.push(
              `drawtext=${fontOpt}text='${escapeDrawtext(line)}':fontcolor=0xfef08a:fontsize=${subFontSize}:x=(w-text_w)/2:y=${subStartY + lIdx * Math.round(subFontSize * 1.32)}:box=1:boxcolor=0x09090b@0.88:boxborderw=8:enable='${enableExpr}'`
            );
          });

          // 6. Lighting Shift & Transition footer
          const footerCue = escapeDrawtext(
            `${TRANSITION_LABELS[beat.transitionIn].split('(')[0].trim()} · ${beat.lightingShift.slice(0, 48)}`
          );
          filters.push(
            `drawtext=${monoFontOpt}text='${footerCue}':fontcolor=0xcbd5e1:fontsize=${Math.round(shortEdge * 0.021)}:x=(w-text_w)/2:y=${Math.round(opts.height * 0.745)}:enable='${enableExpr}'`
          );
        });
      } else {
        const sceneList =
          opts.scenes && opts.scenes.length > 0
            ? opts.scenes
            : [
                {
                  title: opts.title,
                  subtitle: opts.hook,
                  visualCue: '3s Hook + Dynamický rám',
                  durationSec: Math.max(2, Math.round(opts.durationSec * 0.35)),
                  kineticTag: 'SCÉNA 1/3 · HOOK',
                },
                {
                  title: 'KLÍČOVÉ ŘEŠENÍ V PRAXI',
                  subtitle: opts.hook,
                  visualCue: 'Vizuální důkaz & postup',
                  durationSec: Math.max(2, Math.round(opts.durationSec * 0.35)),
                  kineticTag: 'SCÉNA 2/3 · DEMO',
                },
                {
                  title: 'DALŠÍ KROK & VÝSLEDEK',
                  subtitle: opts.cta,
                  visualCue: 'Výzva k akci + plynulá smyčka',
                  durationSec: Math.max(2, Math.round(opts.durationSec * 0.3)),
                  kineticTag: 'SCÉNA 3/3 · CTA',
                },
              ];

        const totalSceneUnits = sceneList.reduce((acc, s) => acc + Math.max(1, s.durationSec), 0);
        let tCursor = 0;

        sceneList.forEach((sc, idx) => {
          const segDuration =
            idx === sceneList.length - 1
              ? Math.max(0.5, opts.durationSec - tCursor)
              : (Math.max(1, sc.durationSec) / totalSceneUnits) * opts.durationSec;
          const startT = tCursor.toFixed(2);
          const endT = (tCursor + segDuration).toFixed(2);
          tCursor += segDuration;

          const enableExpr =
            idx === sceneList.length - 1
              ? `gte(t,${startT})`
              : `gte(t,${startT})*lt(t,${endT})`;

          filters.push(
            `drawtext=${monoFontOpt}text='${escapeDrawtext(sc.kineticTag)}':fontcolor=${secColor}:fontsize=${Math.round(shortEdge * 0.025)}:x=(w-text_w)/2:y=${Math.round(opts.height * 0.145)}:enable='${enableExpr}'`
          );

          const sceneTitleLines = wrapTextLines(sc.title, isWide ? 36 : 22);
          const titleFontSize = Math.round(shortEdge * 0.048);
          const titleStartY = Math.round(opts.height * 0.255);
          sceneTitleLines.forEach((line, lIdx) => {
            filters.push(
              `drawtext=${fontOpt}text='${escapeDrawtext(line)}':fontcolor=0xffffff:fontsize=${titleFontSize}:x=(w-text_w)/2:y=${titleStartY + lIdx * Math.round(titleFontSize * 1.26)}:enable='${enableExpr}'`
            );
          });

          const subLines = wrapTextLines(sc.subtitle, isWide ? 44 : 26);
          const subFontSize = Math.round(shortEdge * 0.033);
          const subStartY = Math.round(opts.height * 0.455);
          subLines.forEach((line, lIdx) => {
            filters.push(
              `drawtext=${fontOpt}text='${escapeDrawtext(line)}':fontcolor=0xfef08a:fontsize=${subFontSize}:x=(w-text_w)/2:y=${subStartY + lIdx * Math.round(subFontSize * 1.34)}:box=1:boxcolor=0x09090b@0.88:boxborderw=8:enable='${enableExpr}'`
            );
          });

          filters.push(
            `drawtext=${monoFontOpt}text='${escapeDrawtext(sc.visualCue.slice(0, 48))}':fontcolor=0xcbd5e1:fontsize=${Math.round(shortEdge * 0.022)}:x=(w-text_w)/2:y=${Math.round(opts.height * 0.745)}:enable='${enableExpr}'`
          );
        });
      }

      const freq = Math.max(130, Math.min(440, Math.round(opts.bpm * 1.8)));
      const beatHz = (opts.bpm / 60).toFixed(2);
      const audioExpr = `0.14*sin(2*PI*${freq}*t)*(0.6+0.4*sin(2*PI*${beatHz}*t))+0.07*sin(2*PI*${Math.round(freq * 1.5)}*t)+0.04*sin(2*PI*${Math.round(freq * 2.5)}*t)`;

      try {
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-f',
            'lavfi',
            '-i',
            `gradients=s=${opts.width}x${opts.height}:d=${opts.durationSec}:r=${renderFps}:n=4:c0=${palette.c0}:c1=${palette.c1}:c2=${palette.c2}:c3=${palette.c3}:x0=0:y0=0:x1=${opts.width}:y1=${opts.height}:speed=0.01`,
            '-f',
            'lavfi',
            '-i',
            `aevalsrc=${audioExpr}:s=44100:d=${opts.durationSec}`,
            '-vf',
            filters.join(','),
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '96k',
            '-shortest',
            '-movflags',
            '+faststart',
            tmpOutputPath,
          ],
          { timeout: 15000 }
        );

        if (fs.existsSync(tmpOutputPath) && fs.statSync(tmpOutputPath).size > 1024) {
          opts.onStageProgress?.('optimizing_faststart', 76, 'FFmpeg dokončil render, kontrola a atomické uložení +faststart...');
          fs.renameSync(tmpOutputPath, opts.outputPath);
          await this.ensurePosterFile(opts.outputPath, opts.posterPath);
          return true;
        }
      } catch (err) {
        if (fs.existsSync(tmpOutputPath)) fs.unlinkSync(tmpOutputPath);
        console.warn('[MediaRenderer] ffmpeg failed, writing atomic MP4 fallback:', err);
      }

      // Minimal valid ISO Base Media File (ftyp + free + mdat) written atomically
      const fallbackBytes = Buffer.from(
        '00000018667479706d703432000000006d70343269736f6d000000086d64617400000000',
        'hex'
      );
      fs.writeFileSync(tmpOutputPath, fallbackBytes);
      fs.renameSync(tmpOutputPath, opts.outputPath);
      await this.ensurePosterFile(opts.outputPath, opts.posterPath);
      return false;
    })();

    this.inFlightRenders.set(opts.outputPath, task);
    try {
      return await task;
    } finally {
      this.inFlightRenders.delete(opts.outputPath);
    }
  }
}
