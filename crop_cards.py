"""Cắt sheet 52 lá bài (nền nỉ xanh) thành 52 file PNG riêng biệt.

Sheet: 4 hàng x 13 cột
  hàng 0 = Rô (D), hàng 1 = Chuồn (C), hàng 2 = Cơ (H), hàng 3 = Bích (S)
  cột 0..12 = A,2,3,4,5,6,7,8,9,10,J,Q,K

Chạy:  python crop_cards.py
"""
from PIL import Image, ImageDraw
import numpy as np
import os

SRC = "assets/cards_new_sheet.png"
OUT = "assets/cards"
os.makedirs(OUT, exist_ok=True)

RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
SUITS = ['D', 'C', 'H', 'S']   # row 0 = Rô, 1 = Chuồn, 2 = Cơ, 3 = Bích
CARD_W, CARD_H = 180, 272      # kích thước xuất (CSS hiển thị 94x142)

img = Image.open(SRC).convert("RGB")
arr = np.asarray(img).astype(np.int16)
# vùng trắng của lá bài (viền + thân) để tự tìm lưới
white = (arr[:, :, 0] > 205) & (arr[:, :, 1] > 205) & (arr[:, :, 2] > 205)

def runs(values, threshold):
    out, start = [], None
    for i, v in enumerate(values):
        if v > threshold and start is None:
            start = i
        elif v <= threshold and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(values) - 1))
    return out

cols = runs(white.sum(axis=0), 20)
rows = runs(white.sum(axis=1), 20)
if len(cols) != 13 or len(rows) != 4:
    raise SystemExit(f"Không tìm thấy lưới 13x4 (cols={len(cols)}, rows={len(rows)})")

def green_to_alpha(im):
    """Xóa nền nỉ xanh còn sót ở mép lá bài."""
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if g > 55 and g > r * 1.18 and g > b * 1.18:
                px[x, y] = (r, g, b, 0)
    return im

def rounded_alpha(im, radius=10.5):
    """Bo góc trong suốt để lá bài không bị viền xanh ở 4 góc."""
    w, h = im.size
    scale = 4
    mask = Image.new("L", (w * scale, h * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (0, 0, w * scale - 1, h * scale - 1),
        radius=int(radius * scale), fill=255
    )
    mask = mask.resize((w, h), Image.LANCZOS)
    im.putalpha(mask)
    return im

made = []
for ri, (y0, y1) in enumerate(rows):
    for ci, (x0, x1) in enumerate(cols):
        cell = img.crop((x0, y0, x1 + 1, y1 + 1))
        cell = green_to_alpha(cell)
        cell = rounded_alpha(cell)
        cell = cell.resize((CARD_W, CARD_H), Image.LANCZOS)
        name = f"{RANKS[ci]}{SUITS[ri]}.png"
        cell.save(os.path.join(OUT, name), "PNG", optimize=True)
        made.append((name, cell.size))

print("Created", len(made), "cards")
for n, s in made[:6]:
    print(" ", n, s)
print("  ...")
for n, s in made[-4:]:
    print(" ", n, s)
