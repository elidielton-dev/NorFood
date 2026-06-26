"""Gera logo NorFood com fundo transparente a partir do PNG original."""
from __future__ import annotations

import pathlib
from collections import deque

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
ORIGINAL = pathlib.Path(
    r"C:\Users\elidi\.cursor\projects\c-Users-elidi-Downloads-Norfood\assets"
    r"\c__Users_elidi_AppData_Roaming_Cursor_User_workspaceStorage_99fdaa1a280efea50664b79bf40d5ca5_images"
    r"_ChatGPT_Image_26_de_jun._de_2026__08_43_22-1301f420-20e5-4193-afb8-b3d504d7cf2d.png"
)
OUT_PATHS = [
    ROOT / "public" / "logo-norfood.png",
    ROOT / "src" / "assets" / "logo-norfood.png",
]
FAVICON = ROOT / "public" / "favicon.png"


def is_background(r: int, g: int, b: int) -> bool:
    """Fundo branco/cinza claro — preserva laranja, preto e tagline."""
    spread = max(r, g, b) - min(r, g, b)
    if spread > 40:
        return False
    if min(r, g, b) < 188:
        return False
    return True


def flood_transparent(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    pixels = rgba.load()
    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        r, g, b, a = pixels[x, y]
        if not is_background(r, g, b):
            continue
        pixels[x, y] = (r, g, b, 0)
        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    return rgba


def make_favicon(logo: Image.Image) -> Image.Image:
    size = 512
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    lw, lh = logo.size
    scale = 0.82
    ns_w = int(size * scale * lw / max(lw, lh))
    ns_h = int(size * scale * lh / max(lw, lh))
    resized = logo.resize((ns_w, ns_h), Image.Resampling.LANCZOS)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def main() -> None:
    source = ORIGINAL if ORIGINAL.exists() else OUT_PATHS[0]
    logo = flood_transparent(Image.open(source))

    opaque = sum(1 for y in range(logo.height) for x in range(logo.width) if logo.getpixel((x, y))[3] > 16)
    total = logo.width * logo.height
    print(f"opaque: {opaque}/{total} ({100 * opaque / total:.1f}%)")

    for path in OUT_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        logo.save(path, "PNG", optimize=True)
        print("saved", path)

    make_favicon(logo).save(FAVICON, "PNG", optimize=True)
    print("saved", FAVICON)


if __name__ == "__main__":
    main()
