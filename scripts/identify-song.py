#!/usr/bin/env python3
"""Identify music in a video/audio file via Shazam (shazamio).

Usage: /Users/abhijeet/.songid-venv/bin/python scripts/identify-song.py <file> [<file>...]
Extracts audio with the repo's ffmpeg-static binary, fingerprints a middle
segment, and prints the matched track (title / artist / album) or NO MATCH.
"""
import asyncio
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from shazamio import Shazam

REPO = Path(__file__).resolve().parent.parent
FFMPEG = REPO / "node_modules" / "ffmpeg-static" / "ffmpeg"


def extract_audio(src: str, dst: str, offset: float = 0.0, dur: float = 12.0) -> None:
    subprocess.run(
        [str(FFMPEG), "-y", "-v", "error", "-ss", str(offset), "-t", str(dur),
         "-i", src, "-vn", "-ac", "1", "-ar", "44100", "-b:a", "128k", dst],
        check=True,
    )


async def identify(path: str) -> None:
    shazam = Shazam()
    # Try a few offsets — music often only plays in parts of an ad.
    for offset in (5, 20, 40, 60):
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            try:
                extract_audio(path, tmp.name, offset=offset)
            except subprocess.CalledProcessError:
                continue  # offset past end of file
            result = await shazam.recognize(tmp.name)
        track = result.get("track")
        if track:
            print(f"{Path(path).name}  [@{offset}s]")
            print(f"  Title:  {track.get('title')}")
            print(f"  Artist: {track.get('subtitle')}")
            meta = {s.get("title"): s.get("text") for s in
                    (track.get("sections", [{}])[0].get("metadata") or [])}
            if meta:
                print(f"  Meta:   {json.dumps(meta)}")
            return
    print(f"{Path(path).name}  NO MATCH (checked offsets 5/20/40/60s)")


async def main() -> None:
    for f in sys.argv[1:]:
        await identify(f)


if __name__ == "__main__":
    asyncio.run(main())
