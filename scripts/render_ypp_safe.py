#!/usr/bin/env python3
"""
NEXUS X OS - MoviePy 2.x Anti-Fingerprint & YPP-Safe Render Pipeline
====================================================================
Využívá výhradně MoviePy 2.x API (`from moviepy import ...`, `subclipped`,
`with_effects`, `with_start`, `with_end`, `with_position`).
Podporuje --mock / chybějící vstupní video i bez externích souborů (CI/CD).
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

TARGET_WIDTH = 1080
TARGET_HEIGHT = 1920
SAFE_ZONE_Y = 1320


def find_czech_font() -> Optional[str]:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def escape_drawtext(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
        .replace("\n", " ")
    )


def render_with_moviepy_v2(
    manifest: Dict[str, Any],
    output_path: str,
    raw_video_path: Optional[str],
    dub_audio_path: Optional[str],
    mock_mode: bool,
) -> Dict[str, Any]:
    from moviepy import (
        AudioFileClip,
        ColorClip,
        CompositeVideoClip,
        TextClip,
        VideoFileClip,
        concatenate_videoclips,
        vfx,
    )

    duration = float(manifest.get("target_duration_sec", 15.0))
    fps = int(manifest.get("delivery", {}).get("fps", 30))
    blocks: List[Dict[str, Any]] = manifest.get("blocks", [])
    safe_zone_y = int(manifest.get("delivery", {}).get("safe_zone_y", SAFE_ZONE_Y))
    lum_contrast = float(
        manifest.get("delivery", {})
        .get("anti_fingerprint", {})
        .get("lum_contrast", 0.08)
    )
    font_path = find_czech_font() or "DejaVu-Sans-Bold"

    use_synthetic = mock_mode or not raw_video_path or not os.path.isfile(raw_video_path)

    if use_synthetic:
        base_clip = ColorClip(
            size=(TARGET_WIDTH, TARGET_HEIGHT),
            color=(18, 22, 34),
            duration=duration,
        )
    else:
        src = VideoFileClip(raw_video_path)
        src_duration = min(duration, float(src.duration or duration))
        src = src.subclipped(0, src_duration)
        src = src.without_audio()
        base_clip = src.with_effects([vfx.Resize(height=TARGET_HEIGHT)])
        if base_clip.w < TARGET_WIDTH:
            base_clip = base_clip.with_effects([vfx.Resize(width=TARGET_WIDTH)])
        x_center = max(0, int((base_clip.w - TARGET_WIDTH) / 2))
        y_center = max(0, int((base_clip.h - TARGET_HEIGHT) / 2))
        base_clip = base_clip.with_effects(
            [
                vfx.Crop(
                    x1=x_center,
                    y1=y_center,
                    x2=x_center + TARGET_WIDTH,
                    y2=y_center + TARGET_HEIGHT,
                )
            ]
        )

    base_clip = base_clip.with_effects(
        [vfx.LumContrast(lum=lum_contrast * 10.0, contrast=lum_contrast)]
    )

    segment_clips = []
    for blk in blocks:
        start_sec = max(0.0, float(blk.get("start_sec", 0.0)))
        end_sec = min(float(base_clip.duration or duration), float(blk.get("end_sec", duration)))
        if end_sec <= start_sec:
            continue

        seg = base_clip.subclipped(start_sec, end_sec)
        if blk.get("role") == "punchline_loop":
            zoom_w = int(TARGET_WIDTH * 1.08)
            zoom_h = int(TARGET_HEIGHT * 1.08)
            seg = seg.with_effects(
                [
                    vfx.Resize((zoom_w, zoom_h)),
                    vfx.Crop(
                        x1=int((zoom_w - TARGET_WIDTH) / 2),
                        y1=int((zoom_h - TARGET_HEIGHT) / 2),
                        x2=int((zoom_w - TARGET_WIDTH) / 2) + TARGET_WIDTH,
                        y2=int((zoom_h - TARGET_HEIGHT) / 2) + TARGET_HEIGHT,
                    ),
                ]
            )
        segment_clips.append(seg)

    video_track = (
        concatenate_videoclips(segment_clips, method="compose")
        if segment_clips
        else base_clip
    )

    subtitle_layers = []
    for blk in blocks:
        start_sec = max(0.0, float(blk.get("start_sec", 0.0)))
        end_sec = min(float(video_track.duration or duration), float(blk.get("end_sec", duration)))
        subtitle_text = str(blk.get("subtitle_text", "")).strip()
        if not subtitle_text or end_sec <= start_sec:
            continue

        txt_clip = (
            TextClip(
                text=subtitle_text,
                font=font_path,
                font_size=52,
                color="#facc15" if blk.get("role") == "punchline_loop" else "#ffffff",
                stroke_color="#000000",
                stroke_width=3,
                method="caption",
                size=(960, None),
            )
            .with_start(start_sec)
            .with_end(end_sec)
            .with_position(("center", safe_zone_y))
        )
        subtitle_layers.append(txt_clip)

    final_video = CompositeVideoClip(
        [video_track, *subtitle_layers], size=(TARGET_WIDTH, TARGET_HEIGHT)
    )

    final_video = final_video.without_audio()
    dub_clip = None
    if dub_audio_path and os.path.isfile(dub_audio_path):
        dub_source = AudioFileClip(dub_audio_path)
        dub_duration = min(float(final_video.duration), float(dub_source.duration or final_video.duration))
        dub_clip = dub_source.subclipped(0, dub_duration)
        final_video = final_video.with_audio(dub_clip)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    final_video.write_videofile(
        output_path,
        fps=fps,
        codec="libx264",
        audio_codec="aac",
        ffmpeg_params=["-movflags", "+faststart", "-pix_fmt", "yuv420p"],
        logger=None,
    )
    if dub_clip is not None:
        dub_clip.close()
    final_video.close()

    return {
        "engine": "moviepy-2.x",
        "mock": use_synthetic,
        "output_path": output_path,
        "resolution": f"{TARGET_WIDTH}x{TARGET_HEIGHT}",
        "safe_zone_y": safe_zone_y,
    }


def render_with_ffmpeg_fallback(
    manifest: Dict[str, Any],
    output_path: str,
    raw_video_path: Optional[str],
    dub_audio_path: Optional[str],
    mock_mode: bool,
) -> Dict[str, Any]:
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise RuntimeError("Neither moviepy 2.x nor ffmpeg binary is available.")

    duration = float(manifest.get("target_duration_sec", 15.0))
    fps = int(manifest.get("delivery", {}).get("fps", 30))
    blocks: List[Dict[str, Any]] = manifest.get("blocks", [])
    safe_zone_y = int(manifest.get("delivery", {}).get("safe_zone_y", SAFE_ZONE_Y))
    font_path = find_czech_font()

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    use_synthetic = mock_mode or not raw_video_path or not os.path.isfile(raw_video_path)

    vf_parts = [
        f"scale={TARGET_WIDTH}:{TARGET_HEIGHT}:force_original_aspect_ratio=increase",
        f"crop={TARGET_WIDTH}:{TARGET_HEIGHT}",
        "eq=brightness=0.03:contrast=1.08",
    ]

    if font_path:
        series_title = escape_drawtext(str(manifest.get("series_name", "MadLipz CZ")))
        vf_parts.append(
            f"drawtext=fontfile='{font_path}':text='{series_title}':fontcolor=0x10b981:fontsize=34:x=(w-text_w)/2:y=110:box=1:boxcolor=black@0.55:boxborderw=10"
        )
        for blk in blocks:
            start_s = float(blk.get("start_sec", 0.0))
            end_s = float(blk.get("end_sec", duration))
            sub = escape_drawtext(str(blk.get("subtitle_text", ""))[:72])
            if not sub or end_s <= start_s:
                continue
            color = "0xfacc15" if blk.get("role") == "punchline_loop" else "white"
            vf_parts.append(
                f"drawtext=fontfile='{font_path}':text='{sub}':fontcolor={color}:fontsize=44:x=(w-text_w)/2:y={safe_zone_y}:box=1:boxcolor=black@0.65:boxborderw=12:enable='between(t,{start_s:.2f},{end_s:.2f})'"
            )

    vf_filter = ",".join(vf_parts)

    cmd = [ffmpeg_bin, "-y"]
    if use_synthetic:
        cmd.extend(["-f", "lavfi", "-i", f"color=c=0x121622:s={TARGET_WIDTH}x{TARGET_HEIGHT}:r={fps}:d={duration}"])
    else:
        cmd.extend(["-t", str(duration), "-i", str(raw_video_path)])

    if dub_audio_path and os.path.isfile(dub_audio_path):
        cmd.extend(["-t", str(duration), "-i", str(dub_audio_path)])
    else:
        cmd.extend(["-f", "lavfi", "-t", str(duration), "-i", "anullsrc=r=44100:cl=stereo"])

    cmd.extend(
        [
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-vf",
            vf_filter,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-shortest",
            "-movflags",
            "+faststart",
            output_path,
        ]
    )

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg render failed: {proc.stderr[-400:]}")

    return {
        "engine": "ffmpeg-ypp-fallback",
        "mock": use_synthetic,
        "output_path": output_path,
        "resolution": f"{TARGET_WIDTH}x{TARGET_HEIGHT}",
        "safe_zone_y": safe_zone_y,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="NEXUS X OS MoviePy 2.x Anti-Fingerprint & YPP-Safe Renderer"
    )
    parser.add_argument("--manifest", required=True, help="Path to TitanCore JSON manifest")
    parser.add_argument("--output", required=True, help="Output MP4 file path")
    parser.add_argument("--raw-video", default=None, help="Optional source video path")
    parser.add_argument("--dub-audio", default=None, help="Optional Czech dub audio path")
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Dry-run / synthetic color clip mode for CI/CD without source media",
    )
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.is_file():
        print(json.dumps({"error": f"Manifest not found: {args.manifest}"}), file=sys.stderr)
        return 1

    with manifest_path.open("r", encoding="utf-8") as fh:
        manifest = json.load(fh)

    raw_video = args.raw_video or manifest.get("delivery", {}).get("raw_video_path")
    dub_audio = args.dub_audio or manifest.get("delivery", {}).get("dub_audio_path")

    try:
        result = render_with_moviepy_v2(
            manifest=manifest,
            output_path=args.output,
            raw_video_path=raw_video,
            dub_audio_path=dub_audio,
            mock_mode=args.mock,
        )
    except ImportError:
        result = render_with_ffmpeg_fallback(
            manifest=manifest,
            output_path=args.output,
            raw_video_path=raw_video,
            dub_audio_path=dub_audio,
            mock_mode=args.mock,
        )

    print(json.dumps({"status": "ready", **result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
