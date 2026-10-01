"""Build the static fonts the resume PDF engine embeds for non-Latin scripts.

Downloads the variable Noto fonts from the official google/fonts repository
(SIL Open Font License), cuts static Regular (400) and Bold (700) instances,
and trims the CJK fonts to the standard national character sets so the
browser download stays small. Output goes to src/assets/fonts/ (the Edge
function copy is synced by the same script).

Usage:  python scripts/build-pdf-fonts.py
Needs:  pip install fonttools brotli
"""
from __future__ import annotations

import io
import shutil
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "assets" / "fonts"
EDGE_OUT = ROOT / "supabase" / "functions" / "auto-apply-run" / "assets"
CACHE = ROOT / "node_modules" / ".cache" / "noto-src"
BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl"

FAMILIES = {
    # name: (directory, variable file, weights, CJK charset or None)
    "NotoSansGeorgian": ("notosansgeorgian", "NotoSansGeorgian[wdth,wght].ttf", (400, 700), None),
    "NotoSansArabic": ("notosansarabic", "NotoSansArabic[wdth,wght].ttf", (400, 700), None),
    "NotoSansDevanagari": ("notosansdevanagari", "NotoSansDevanagari[wdth,wght].ttf", (400, 700), None),
    "NotoSansBengali": ("notosansbengali", "NotoSansBengali[wdth,wght].ttf", (400, 700), None),
    "NotoSansSC": ("notosanssc", "NotoSansSC[wght].ttf", (400,), "gb2312"),
    "NotoSansJP": ("notosansjp", "NotoSansJP[wght].ttf", (400,), "jis0208"),
    "NotoSansKR": ("notosanskr", "NotoSansKR[wght].ttf", (400,), "ksx1001"),
}

# Shared ranges every CJK subset keeps: ASCII, Latin-1, general punctuation,
# CJK symbols/punctuation, fullwidth forms and the kana/hangul blocks.
COMMON = [(0x20, 0x7E), (0xA0, 0x17F), (0x2000, 0x206F), (0x2100, 0x218F), (0x2190, 0x21FF),
          (0x2460, 0x24FF), (0x25A0, 0x25FF), (0x3000, 0x303F), (0xFF00, 0xFFEF)]
EXTRA = {
    "gb2312": [],
    "jis0208": [(0x3040, 0x309F), (0x30A0, 0x30FF), (0x31F0, 0x31FF)],
    # Every modern Hangul syllable plus compatibility jamo, not only KS X 1001's 2,350.
    "ksx1001": [(0x1100, 0x11FF), (0x3130, 0x318F), (0xAC00, 0xD7A3)],
}
CODECS = {"gb2312": "gb2312", "jis0208": "euc_jp", "ksx1001": "euc_kr"}


def charset_codepoints(name: str) -> set[int]:
    """Every character encodable in the national double-byte charset."""
    codec = CODECS[name]
    points: set[int] = set()
    for lead in range(0xA1, 0xFF):
        for trail in range(0xA1, 0xFF):
            try:
                points.update(ord(char) for char in bytes([lead, trail]).decode(codec))
            except UnicodeDecodeError:
                continue
    for start, end in COMMON + EXTRA[name]:
        points.update(range(start, end + 1))
    return points


def fetch(directory: str, filename: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / filename
    if not target.exists():
        url = f"{BASE}/{directory}/{urllib.request.quote(filename)}"
        print(f"downloading {url}")
        with urllib.request.urlopen(url) as response:
            target.write_bytes(response.read())
    license_target = CACHE / f"{directory}-OFL.txt"
    if not license_target.exists():
        with urllib.request.urlopen(f"{BASE}/{directory}/OFL.txt") as response:
            license_target.write_bytes(response.read())
    return target


def build(name: str, directory: str, filename: str, weights: tuple[int, ...], charset: str | None) -> list[Path]:
    source = fetch(directory, filename)
    written = []
    for weight in weights:
        font = TTFont(source)
        axes = {axis.axisTag for axis in font["fvar"].axes}
        location = {"wght": weight}
        if "wdth" in axes:
            location["wdth"] = 100
        static = instancer.instantiateVariableFont(font, location, updateFontNames=False)
        if charset:
            options = subset.Options()
            options.layout_features = ["*"]
            options.name_IDs = ["*"]
            options.notdef_outline = True
            options.glyph_names = False
            subsetter = subset.Subsetter(options)
            subsetter.populate(unicodes=charset_codepoints(charset))
            subsetter.subset(static)
        style = "Regular" if weight == 400 else "Bold"
        # Name the static instance after its real weight (the variable font's
        # default names describe its default instance, e.g. "Thin").
        names = static["name"]
        family = " ".join(part for part in [name[:4], name[4:8], name[8:]] if part)
        for record_id, value in ((1, family), (2, style), (4, f"{family} {style}"), (6, f"{name}-{style}"), (16, family), (17, style)):
            names.setName(value, record_id, 3, 1, 0x409)
        target = OUT / f"{name}-{style}.ttf"
        buffer = io.BytesIO()
        static.save(buffer)
        target.write_bytes(buffer.getvalue())
        written.append(target)
        print(f"wrote {target.relative_to(ROOT)} ({target.stat().st_size / 1024:.0f} KB)")
    return written


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (directory, filename, weights, charset) in FAMILIES.items():
        build(name, directory, filename, weights, charset)
    # One license file covers every Noto family (all SIL OFL 1.1).
    shutil.copyfile(CACHE / "notosansgeorgian-OFL.txt", OUT / "LICENSE-Noto.txt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
