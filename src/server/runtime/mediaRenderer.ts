/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MediaRenderStage, UserVideoTemplate, VideoCreativeBrief, VideoStoryboard } from '../../types/nexus.ts';

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
    dryRun?: boolean;
    onStageProgress?: (stage: MediaRenderStage, percent: number, message: string) => void;
  }): Promise<RenderedVideoArtifact> {
    const threadId = params.threadId || 'th-main-001';
    const format = params.brief?.aspectRatio || params.format || params.storyboard?.aspectRatio || '9:16';
    const durationSec = Math.max(3, Math.min(15, params.brief?.durationSec || params.durationSec || 6));
    const resolution = format === '16:9' ? '1280x720' : '720x1280';
    const [width, height] = resolution.split('x').map(Number);

    const filePath = this.getAssetFilePath(threadId, params.assetId);
    const posterPath = this.getPosterFilePath(threadId, params.assetId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // In DRY-RUN, copy/reuse verified reference video atomically if present, or render reference clip once
    if (params.dryRun) {
      params.onStageProgress?.('rendering_ffmpeg', 45, 'Příprava referenčního H.264/AAC MP4 proudu...');
      const refPath = this.getAssetFilePath('th-main-001', 'asset-001');
      if (!fs.existsSync(refPath) || fs.statSync(refPath).size <= 1024) {
        await this.renderFfmpegClip({
          outputPath: refPath,
          posterPath: this.getPosterFilePath('th-main-001', 'asset-001'),
          width,
          height,
          durationSec,
          title: params.title,
          hook: params.brief?.hook || params.storyboard?.hook || params.prompt || 'NEXUS X OS Referenční Video Asset',
          cta: params.brief?.cta || params.storyboard?.cta || 'Stáhněte si kompletní workflow v Media Vaultu.',
          highlightColor: params.brief?.accentColor || params.template?.subtitleStyle?.highlightColor || '#10b981',
          secondaryColor: params.brief?.secondaryColor || '#38bdf8',
          bgHex: params.brief?.bgHex || '0x0a0f18',
          platformLabel: params.brief?.platform || params.storyboard?.targetPlatform || 'AI VIDEO STUDIO',
          bpm: params.brief?.bpm || params.template?.musicPreset?.bpm || 128,
          scenes: params.brief?.scenes,
          onStageProgress: params.onStageProgress,
        });
      }
      if (filePath !== refPath) {
        const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp.mp4`;
        fs.copyFileSync(refPath, tmpFile);
        fs.renameSync(tmpFile, filePath);
      }
      params.onStageProgress?.('optimizing_faststart', 80, 'Ověřuji MP4 atomy (-movflags +faststart)...');
      const faststart = await this.ensureFaststartMp4(filePath);
      params.onStageProgress?.('verifying_integrity', 94, 'Extrakce náhledu a výpočet SHA-256 kontrolního součtu...');
      await this.ensurePosterFile(filePath, posterPath);
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
        renderedWithFfmpeg: sizeBytes > 1024,
        faststartVerified: faststart.faststartVerified,
        atoms: faststart.atoms,
      };
    }

    params.onStageProgress?.('rendering_ffmpeg', 40, 'FFmpeg renderuje H.264/AAC scény a kinetické titulky...');
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
      highlightColor: params.brief?.accentColor || params.template?.subtitleStyle?.highlightColor || '#10b981',
      secondaryColor: params.brief?.secondaryColor || '#38bdf8',
      bgHex: params.brief?.bgHex || '0x0a0f18',
      platformLabel: params.brief?.platform || params.storyboard?.targetPlatform || 'VIDEO FACTORY',
      bpm: params.brief?.bpm || params.template?.musicPreset?.bpm || 128,
      scenes: params.brief?.scenes,
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
    bpm: number;
    scenes?: VideoCreativeBrief['scenes'];
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

      const hexColor = opts.highlightColor.startsWith('#')
        ? `0x${opts.highlightColor.slice(1)}`
        : '0x10b981';
      const secColor = opts.secondaryColor.startsWith('#')
        ? `0x${opts.secondaryColor.slice(1)}`
        : '0x38bdf8';

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

      const isWide = opts.width > opts.height;
      const filters: string[] = [
        // Top dual-tone accent bar & animated kinetic scanner beam
        `drawbox=x=0:y=0:w=iw:h=10:color=${hexColor}@0.95:t=fill`,
        `drawbox=x=0:y=10:w='iw*(0.25+0.75*abs(sin(t*1.4)))':h=4:color=${secColor}@0.85:t=fill`,
        `drawbox=x=32:y=32:w=iw-64:h=ih-64:color=${hexColor}@0.35:t=2`,
        // Subtle animated atmospheric band behind main headline
        `drawbox=x=44:y=ih*0.21:w=iw-88:h=ih*0.44:color=0x111827@0.55:t=fill`,
        // Animated bottom progress bar synced to clip duration
        `drawbox=x=48:y=ih-68:w=iw-96:h=10:color=0x18181b@0.95:t=fill`,
        `drawbox=x=48:y=ih-68:w='(iw-96)*t/${opts.durationSec}':h=10:color=${hexColor}@0.95:t=fill`,
        // Persistent studio header
        `drawtext=${monoFontOpt}text='NEXUS X OS // ${escapeDrawtext(opts.platformLabel.toUpperCase())}':fontcolor=${hexColor}:fontsize=${Math.round(opts.width * 0.03)}:x=56:y=66`,
        `drawtext=${monoFontOpt}text='${opts.bpm} BPM · AI DIRECTOR':fontcolor=0xa1a1aa:fontsize=${Math.round(opts.width * 0.022)}:x=w-tw-56:y=70`,
      ];

      // 6 animated audio-reactive style equalizer bars above progress bar (comma-free math!)
      for (let b = 0; b < 6; b++) {
        const barX = 56 + b * 22;
        const speed = (2.4 + b * 0.7).toFixed(1);
        filters.push(
          `drawbox=x=${barX}:y=ih-108:w=12:h='8+24*abs(sin(t*${speed}+${b}))':color=${b % 2 === 0 ? hexColor : secColor}@0.85:t=fill`
        );
      }

      // Compute normalized time windows for each scene across opts.durationSec
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

        // Comma-free enable expression so FFmpeg never splits inside drawtext
        const enableExpr =
          idx === sceneList.length - 1
            ? `gte(t,${startT})`
            : `gte(t,${startT})*lt(t,${endT})`;

        // Scene tag pill
        filters.push(
          `drawtext=${monoFontOpt}text='${escapeDrawtext(sc.kineticTag)}':fontcolor=${secColor}:fontsize=${Math.round(opts.width * 0.028)}:x=(w-text_w)/2:y=${Math.round(opts.height * 0.16)}:enable='${enableExpr}'`
        );

        // Scene headline
        const sceneTitleLines = wrapTextLines(sc.title, isWide ? 40 : 22);
        const titleFontSize = Math.round(opts.width * 0.052);
        const titleStartY = Math.round(opts.height * 0.27);
        sceneTitleLines.forEach((line, lIdx) => {
          filters.push(
            `drawtext=${fontOpt}text='${escapeDrawtext(line)}':fontcolor=0xffffff:fontsize=${titleFontSize}:x=(w-text_w)/2:y=${titleStartY + lIdx * Math.round(titleFontSize * 1.28)}:enable='${enableExpr}'`
          );
        });

        // Scene subtitle / caption box
        const subLines = wrapTextLines(sc.subtitle, isWide ? 50 : 28);
        const subFontSize = Math.round(opts.width * 0.036);
        const subStartY = Math.round(opts.height * 0.52);
        subLines.forEach((line, lIdx) => {
          filters.push(
            `drawtext=${fontOpt}text='${escapeDrawtext(line)}':fontcolor=0xfef08a:fontsize=${subFontSize}:x=(w-text_w)/2:y=${subStartY + lIdx * Math.round(subFontSize * 1.32)}:box=1:boxcolor=0x09090b@0.82:boxborderw=10:enable='${enableExpr}'`
          );
        });

        // Visual cue footer
        filters.push(
          `drawtext=${monoFontOpt}text='${escapeDrawtext(sc.visualCue.slice(0, 48))}':fontcolor=0xa1a1aa:fontsize=${Math.round(opts.width * 0.023)}:x=(w-text_w)/2:y=${Math.round(opts.height * 0.78)}:enable='${enableExpr}'`
        );
      });

      const freq = Math.max(130, Math.min(440, Math.round(opts.bpm * 1.8)));
      const beatHz = (opts.bpm / 60).toFixed(2);
      const audioExpr = `0.13*sin(2*PI*${freq}*t)*(0.5+0.5*sin(2*PI*${beatHz}*t))+0.06*sin(2*PI*${Math.round(freq * 1.5)}*t)+0.04*sin(2*PI*${Math.round(freq * 2)}*t)`;

      try {
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-f',
            'lavfi',
            '-i',
            `color=c=${opts.bgHex}:s=${opts.width}x${opts.height}:r=24:d=${opts.durationSec}`,
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
