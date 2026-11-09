"""AYVETO — SYSTEM ERROR intro (15 s, 1920x1080, 30 fps).

Renders every frame procedurally (PIL + numpy), pipes them to ffmpeg,
and muxes with the soundtrack produced by audio.py.
Run:  .venv/bin/python ayveto-intro/render.py
"""
import math
import os
import subprocess
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS, DUR = 1920, 1080, 30, 15
N = FPS * DUR

# ---------------------------------------------------------------- palette
BLACK = (0, 0, 0)
NAVY = (6, 18, 42)
NAVY2 = (10, 30, 70)
EBLUE = (40, 120, 255)
EBLUE_L = (120, 180, 255)
ICE = (205, 228, 255)
WHITE = (255, 255, 255)
DIM = (70, 110, 170)


def font(name, size, variation=None):
    f = ImageFont.truetype(os.path.join(HERE, "fonts", name), size)
    if variation:
        try:
            f.set_variation_by_name(variation)
        except Exception:
            pass
    return f


F_MONO_S = font("ShareTechMono.ttf", 22)
F_MONO = font("ShareTechMono.ttf", 25)
F_MONO_L = font("ShareTechMono.ttf", 34)
F_ORB_S = font("Orbitron.ttf", 22, "SemiBold")
F_ORB = font("Orbitron.ttf", 30, "Bold")
F_ORB_POP = font("Orbitron.ttf", 38, "Bold")
F_ORB_XL = font("Orbitron.ttf", 88, "Black")
F_WORD = font("Orbitron.ttf", 104, "Bold")
F_LINE = font("Rajdhani-SemiBold.ttf", 76)
F_TAG = font("Rajdhani-SemiBold.ttf", 40)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_io(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


# ---------------------------------------------------------------- static assets
def make_background():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    g = np.clip(1 - d * 0.75, 0, 1)[..., None]
    bg = np.array([2, 6, 14], np.float32) + g * np.array([8, 22, 52], np.float32)
    # grid
    grid = ((xx % 64) < 1) | ((yy % 64) < 1)
    bg[grid] += np.array([8, 22, 46], np.float32)
    # vignette
    vig = np.clip(1.15 - d * 0.55, 0, 1)[..., None]
    return bg * vig


BG = make_background()
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
RADIAL = np.sqrt((XX - W / 2) ** 2 + (YY - H / 2) ** 2)
SCAN = np.ones((H, 1, 1), np.float32)
SCAN[::3] = 0.86
_rng = np.random.default_rng(7)
GRAIN = [_rng.normal(0, 1, (H, W, 1)).astype(np.float32) for _ in range(6)]

CARD_W, CARD_H = 600, 378


def make_card():
    img = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((2, 2, CARD_W - 3, CARD_H - 3), 28, fill=(8, 22, 50, 240), outline=EBLUE, width=3)
    d.rounded_rectangle((14, 14, CARD_W - 15, CARD_H - 15), 20, outline=(30, 70, 140, 200), width=1)
    d.text((48, 44), "ACCESS CARD", font=F_ORB, fill=ICE)
    d.text((CARD_W - 48, 50), "RFID", font=F_MONO, fill=EBLUE_L, anchor="ra")
    # chip
    cx, cy = 48, 118
    d.rounded_rectangle((cx, cy, cx + 96, cy + 74), 10, outline=(170, 205, 255), width=3)
    for k in (1, 2):
        d.line((cx, cy + 74 * k / 3, cx + 96, cy + 74 * k / 3), fill=(170, 205, 255), width=2)
    d.line((cx + 48, cy, cx + 48, cy + 74), fill=(170, 205, 255), width=2)
    # contactless arcs
    for r in (16, 30, 44):
        d.arc((150 - r, 155 - r, 150 + r, 155 + r), -45, 45, fill=EBLUE_L, width=3)
    # circuit decoration
    for k in range(7):
        x = 380 + k * 26
        d.line((x, 120, x, 120 + 30 + (k * 37) % 70), fill=(30, 80, 160), width=2)
        d.ellipse((x - 4, 150 + (k * 37) % 70 - 4, x + 4, 150 + (k * 37) % 70 + 4), outline=(60, 120, 220), width=2)
    d.text((48, 248), "ID  4471-A", font=F_MONO_L, fill=WHITE)
    d.text((48, 300), "LEVEL 3  //  STAFF", font=F_MONO, fill=DIM)
    return np.asarray(img).astype(np.float32) / 255.0


CARD = make_card()


# ---------------------------------------------------------------- helpers
def comp(base, layer_img, x=0, y=0, alpha=1.0):
    """Alpha-composite an RGBA PIL image / float array onto base (float 0..255)."""
    arr = layer_img if isinstance(layer_img, np.ndarray) else np.asarray(layer_img).astype(np.float32) / 255.0
    h, w = arr.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    sub = arr[y0 - y:y1 - y, x0 - x:x1 - x]
    a = sub[..., 3:4] * alpha
    base[y0:y1, x0:x1] = base[y0:y1, x0:x1] * (1 - a) + sub[..., :3] * 255 * a


def bloom(base, strength=0.6, radius=10, tint=None):
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    small = img.resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(radius / 4 * 2))
    big = np.asarray(small.resize((W, H), Image.BILINEAR)).astype(np.float32)
    if tint is not None:
        big = big * np.array(tint, np.float32)
    return base + big * strength


def tracked(draw, cx, cy, text, fnt, fill_fn, tracking):
    widths = [fnt.getlength(c) for c in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for i, (c, w) in enumerate(zip(text, widths)):
        fill = fill_fn(i)
        if fill is not None and fill[3] > 0:
            draw.text((x, cy), c, font=fnt, fill=fill, anchor="lm")
        x += w + tracking
    return total


def camera(frame, scale, dx=0.0, dy=0.0):
    if scale <= 1.0001 and abs(dx) < 0.5 and abs(dy) < 0.5:
        return frame
    img = Image.fromarray(np.clip(frame, 0, 255).astype(np.uint8))
    cw, ch = W / scale, H / scale
    x0 = (W - cw) / 2 + dx
    y0 = (H - ch) / 2 + dy
    img = img.transform((W, H), Image.EXTENT, (x0, y0, x0 + cw, y0 + ch), Image.BILINEAR)
    return np.asarray(img).astype(np.float32)


def glitch(frame, k, rng, slices=True):
    out = frame.copy()
    if k <= 0:
        return out
    if slices:
        for _ in range(int(1 + k * 8)):
            if rng.random() < 0.15 + 0.85 * k:
                y = int(rng.integers(0, H - 4))
                h = int(rng.integers(3, int(8 + k * 110)))
                dx = int(rng.normal(0, 1) * k * 180)
                out[y:y + h] = np.roll(out[y:y + h], dx, axis=1)
        for _ in range(int(k * 4)):
            bw, bh = int(rng.integers(40, 340)), int(rng.integers(8, 90))
            x, y = int(rng.integers(0, W - bw)), int(rng.integers(0, H - bh))
            sx, sy = int(rng.integers(0, W - bw)), int(rng.integers(0, H - bh))
            blk = out[sy:sy + bh, sx:sx + bw].copy()
            if rng.random() < 0.35:
                blk = blk * 0.4 + np.array([20, 70, 200], np.float32) * 0.6
            out[y:y + bh, x:x + bw] = blk
        if rng.random() < k * 0.45:  # tearing / split screen
            y = int(rng.integers(H // 5, 4 * H // 5))
            out[y:] = np.roll(out[y:], int(rng.normal(0, 1) * 120 * k), axis=1)
            out[y:] = np.roll(out[y:], int(rng.integers(-40, 40) * k), axis=0)
    # monochrome-blue ghost instead of RGB split (keeps the palette blue/white)
    dx = int(k * rng.uniform(4, 18)) + 1
    lum = out.mean(axis=2, keepdims=True)
    ghost = np.roll(lum, dx, axis=1) * np.array([0.15, 0.45, 1.0], np.float32)
    return np.maximum(out, ghost * (0.35 + 0.4 * k))


def finish(frame, i, grain=5.0, scan=True):
    if scan:
        frame = frame * SCAN
    frame = frame + GRAIN[i % len(GRAIN)] * grain
    return np.clip(frame, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- scene 1 + 2 data
LOG_OK = [
    "08:40:51  ID-2291  GATE 03  GRANTED",
    "08:40:53  ID-1187  GATE 01  GRANTED",
    "08:40:56  ID-3302  GATE 03  GRANTED",
    "08:40:58  ID-0954  GATE 02  GRANTED",
    "08:41:00  ID-2716  GATE 03  GRANTED",
    "08:41:01  ID-4471  GATE 03  READING",
]
LOG_ERR = [
    "ERR 0x7F3A  AUTH TIMEOUT",
    "ERR 0x0042  TAG NOT FOUND",
    "ERR 0xC0DE  HANDSHAKE FAIL",
    "ERR 0x9B10  DB UNREACHABLE",
    "ERR 0x7F3A  AUTH TIMEOUT",
    "ERR 0x00FF  READER OFFLINE",
    "ERR 0xDEAD  SESSION LOST",
    "ERR 0x4471  ID MISMATCH",
]
MESSAGES = ["ACCESS DENIED", "SYSTEM FAILURE", "CARD NOT DETECTED", "AUTHENTICATION ERROR", "CONNECTION LOST"]


def make_popups():
    rng = np.random.default_rng(42)
    pops = []
    # fixed, balanced slots so the chaos stays readable and composed
    slots = [(230, 180), (1110, 240), (170, 660), (1050, 690), (620, 430),
             (1130, 470), (140, 420), (640, 760), (700, 140), (1100, 840)]
    times = [3.05, 3.55, 3.95, 4.3, 4.6, 5.0, 5.35, 5.7, 6.05, 6.4]
    for n, t in enumerate(times):
        msg = MESSAGES[n % 5]
        w = int(max(560, F_ORB_POP.getlength(msg) + 90))
        x, y = slots[n]
        x = min(x, W - w - 40)
        pops.append(dict(t=t, msg=msg, x=x, y=y, w=w, h=172, code=int(rng.integers(0, 0xFFFF)), n=n))
    return pops


MAX_VISIBLE_POPUPS = 5


POPUPS = make_popups()


def err_k(t):
    """Glitch intensity for scene 2 (3..7 s)."""
    if t < 3.0:
        return 0.0
    x = clamp((t - 3.0) / 4.0)
    return 0.12 + 0.88 * x ** 1.6


def draw_triangle(d, x, y, s, fill):
    d.polygon([(x, y + s), (x + s / 2, y), (x + s, y + s)], outline=fill, width=2)
    d.line((x + s / 2, y + s * 0.35, x + s / 2, y + s * 0.7), fill=fill, width=2)
    d.point((x + s / 2, y + s * 0.85), fill=fill)


def hud_layer(t, k, rng):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    err = t >= 3.0
    sec = 1 + int(t)
    # top bar
    d.line((60, 92, W - 60, 92), fill=(40, 90, 180, 200), width=1)
    d.text((60, 52), "SECURE ACCESS CONTROL SYSTEM  //  v4.2.1", font=F_ORB_S, fill=(150, 190, 255, 230))
    d.text((W - 60, 52), f"08:41:{sec:02d}", font=F_MONO, fill=(150, 190, 255, 230), anchor="ra")
    status = "STATUS: CRITICAL" if err else "STATUS: ONLINE"
    blink = (int(t * 4) % 2 == 0)
    sc = (255, 255, 255, 255) if err else (120, 190, 255, 230)
    d.text((W - 240, 52), status, font=F_MONO, fill=sc, anchor="ra")
    if blink or not err:
        d.ellipse((W - 600, 58, W - 586, 72), fill=sc if (blink or err) else (60, 120, 220, 255))
    # corner brackets
    for (x, y, sx, sy) in [(40, 110, 1, 1), (W - 40, 110, -1, 1), (40, H - 40, 1, -1), (W - 40, H - 40, -1, -1)]:
        d.line((x, y, x + 50 * sx, y), fill=(60, 130, 255, 220), width=2)
        d.line((x, y, x, y + 50 * sy), fill=(60, 130, 255, 220), width=2)

    # left panel: access log
    lx, ly = 80, 170
    d.text((lx, ly), "ACCESS LOG", font=F_ORB_S, fill=(150, 190, 255, 230))
    d.line((lx, ly + 36, lx + 430, ly + 36), fill=(40, 90, 180, 200))
    lines = []
    n_ok = min(len(LOG_OK), 3 + int(t / 0.5))
    lines += [(s, False) for s in LOG_OK[:n_ok]]
    if err:
        n_err = int((t - 3.0) * (3 + (t - 3.0) * 4))
        lines += [(LOG_ERR[j % len(LOG_ERR)], True) for j in range(n_err)]
    lines = lines[-22:]
    for j, (s, e) in enumerate(lines):
        col = (255, 255, 255, 240) if e else (90, 140, 210, 220)
        d.text((lx, ly + 56 + j * 30), s, font=F_MONO_S, fill=col)

    # right panel: scan module
    rx, ry = W - 500, 170
    d.text((rx, ry), "SCAN MODULE  RFID-07", font=F_ORB_S, fill=(150, 190, 255, 230))
    d.line((rx, ry + 36, rx + 430, ry + 36), fill=(40, 90, 180, 200))
    info = [("FREQ", "13.56 MHz"), ("PROTOCOL", "ISO/IEC 14443-A"), ("GATE", "03  //  LOBBY"),
            ("SIGNAL", "---" if err else f"-{42 + int(t * 7) % 5} dBm"),
            ("LATENCY", "TIMEOUT" if err else f"{11 + int(t * 9) % 4} ms")]
    for j, (a, b) in enumerate(info):
        d.text((rx, ry + 60 + j * 34), a, font=F_MONO_S, fill=(80, 130, 200, 230))
        d.text((rx + 430, ry + 60 + j * 34), b, font=F_MONO_S,
               fill=(255, 255, 255, 240) if (err and a in ("SIGNAL", "LATENCY")) else (170, 205, 255, 240), anchor="ra")
    # oscilloscope
    oy = ry + 300
    d.rectangle((rx, oy, rx + 430, oy + 120), outline=(40, 90, 180, 200))
    pts = []
    for s in range(0, 431, 3):
        u = s / 430
        v = math.sin(u * 18 + t * 9) * 0.5 + math.sin(u * 47 - t * 5) * 0.2
        if err:
            v = v * (1 - k) + rng.normal(0, 1) * k * 0.9
        pts.append((rx + s, oy + 60 - v * 40))
    d.line(pts, fill=(90, 170, 255, 240), width=2)
    # progress bar
    by = oy + 160
    if t < 3.0:
        p = clamp((t - 1.3) / 1.4)
        label = "READING CARD" if t < 2.7 else "VERIFYING"
    else:
        p = clamp(0.97 - (t - 3.0) * 0.1 + rng.normal(0, 0.06) * k)
        label = "VERIFICATION FAILED"
    d.text((rx, by), label, font=F_MONO_S, fill=(170, 205, 255, 240) if not err else (255, 255, 255, 255))
    d.text((rx + 430, by), f"{int(p * 100):3d}%", font=F_MONO_S, fill=(170, 205, 255, 240), anchor="ra")
    d.rectangle((rx, by + 34, rx + 430, by + 48), outline=(40, 90, 180, 220))
    d.rectangle((rx + 2, by + 36, rx + 2 + int(426 * p), by + 46), fill=(60, 140, 255, 230))

    # bottom bar
    d.line((60, H - 92, W - 60, H - 92), fill=(40, 90, 180, 200), width=1)
    conn = "CONNECTION: LOST" if (err and t > 4.2) else ("CONNECTION: UNSTABLE" if err else "CONNECTION: SECURE")
    d.text((60, H - 72), conn, font=F_MONO, fill=(255, 255, 255, 240) if err else (120, 170, 240, 230))
    bars = 0 if (err and t > 4.2) else (2 if err else 4)
    for b in range(4):
        x = 360 + b * 14
        hh = 6 + b * 5
        d.rectangle((x, H - 50 - hh, x + 8, H - 50), fill=(90, 160, 255, 230) if b < bars else (30, 50, 90, 200))
    d.text((W - 60, H - 72), "NODE 07  //  ENCRYPTED CHANNEL", font=F_MONO, fill=(80, 130, 200, 220), anchor="ra")
    return img


def card_pos(t):
    rise = ease_out(t / 1.6)
    y = 600 - 70 * (1 - rise) + 4 * math.sin(t * 2.2)
    return 960, y


def scene_system(t, i):
    rng = np.random.default_rng(1000 + i)
    k = err_k(t)
    frame = BG.copy()
    cx, cy = card_pos(t)

    # pulse rings behind the card
    rings = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rings)
    if t < 3.0:
        for j in range(3):
            ph = ((t * 0.8 + j / 3) % 1.0)
            r = 260 + ph * 300
            a = int(170 * (1 - ph) * clamp(t / 0.8))
            rd.ellipse((cx - r, cy - r * 0.62, cx + r, cy + r * 0.62), outline=(50, 130, 255, a), width=2)
    # target brackets around card
    bx0, by0, bx1, by1 = cx - 340, cy - 230, cx + 340, cy + 230
    bc = (255, 255, 255, 230) if t >= 3.0 else (70, 150, 255, 220)
    for (x, y, sx, sy) in [(bx0, by0, 1, 1), (bx1, by0, -1, 1), (bx0, by1, 1, -1), (bx1, by1, -1, -1)]:
        rd.line((x, y, x + 40 * sx, y), fill=bc, width=3)
        rd.line((x, y, x, y + 40 * sy), fill=bc, width=3)
    # status text under the card
    if t < 1.3:
        s = "PLACE CARD ON READER"
    elif t < 2.7:
        s = "SCANNING" + "." * (1 + int(t * 6) % 3)
    elif t < 3.0:
        s = "VERIFYING..."
    else:
        s = ""
    if s:
        rd.text((960, by1 + 50), s, font=F_ORB_S, fill=(170, 210, 255, 235), anchor="mm")
    comp(frame, rings)

    # card with scan line
    card = CARD.copy()
    if 1.2 < t < 3.0:
        ph = ((t - 1.2) / 0.7) % 1.0
        sy = ph * (CARD_H + 60) - 30
        rows = np.arange(CARD_H, dtype=np.float32)[:, None]
        band = np.exp(-((rows - sy) / 6) ** 2) + 0.35 * np.exp(-((rows - sy + 25) / 25) ** 2) * (rows < sy)
        card[..., :3] = np.clip(card[..., :3] + band[..., None] * np.array([0.3, 0.6, 1.0]), 0, 1)
        card[..., 3] = np.clip(card[..., 3] + band * 0.6 * (card[..., 3] > 0), 0, 1)
    card_alpha = clamp(t / 0.6)
    if t >= 3.0:  # card glitch & distortion
        rows = np.arange(CARD_H)
        shift = (np.sin(rows / 9 + t * 40) * 30 * k + (rng.random(CARD_H) < 0.08 * k) * rng.normal(0, 90 * k, CARD_H)).astype(int)
        for r0 in range(0, CARD_H, 6):
            card[r0:r0 + 6] = np.roll(card[r0:r0 + 6], shift[r0], axis=1)
        if rng.random() < 0.35 * k:
            card_alpha *= rng.uniform(0.0, 0.4)  # card "not detected"
    comp(frame, card, int(cx - CARD_W / 2), int(cy - CARD_H / 2), card_alpha)

    comp(frame, hud_layer(t, k, rng))

    # RFID read flash (beep) at 2.65s
    if 2.6 < t < 2.9:
        fl = 1 - (t - 2.6) / 0.3
        frame += np.exp(-((RADIAL / 420) ** 2))[..., None] * np.array([20, 60, 140], np.float32) * fl

    # error popups
    if t >= 3.0:
        pop = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        pd = ImageDraw.Draw(pop)
        shown = [p for p in POPUPS if p["t"] <= t][-MAX_VISIBLE_POPUPS:]
        for p in shown:
            age = t - p["t"]
            x, y, w, h = p["x"], p["y"], p["w"], p["h"]
            if rng.random() < 0.12 * k:
                continue  # flicker out
            inv = age < 1.0 / FPS + 1e-6
            bgc = (235, 242, 255, 250) if inv else (2, 8, 22, 238)
            fg = NAVY + (255,) if inv else (255, 255, 255, 255)
            pd.rectangle((x, y, x + w, y + h), fill=bgc, outline=(255, 255, 255, 255), width=2)
            pd.rectangle((x, y, x + w, y + 36), fill=(30, 105, 255, 255))
            draw_triangle(pd, x + 14, y + 7, 22, (255, 255, 255, 255))
            pd.text((x + 48, y + 18), f"SYSTEM ALERT  //  ERR 0x{p['code']:04X}", font=F_MONO_S, fill=(255, 255, 255, 255), anchor="lm")
            pd.text((x + w - 16, y + 18), "X", font=F_MONO_S, fill=(255, 255, 255, 255), anchor="rm")
            pd.text((x + 28, y + 92), p["msg"], font=F_ORB_POP, fill=fg, anchor="lm")
            pd.text((x + 28, y + 142), f"NODE 07  //  GATE 03  //  RETRY {p['n'] % 9 + 1:02d}", font=F_MONO_S,
                    fill=(90, 150, 230, 255) if not inv else NAVY + (255,), anchor="lm")
        comp(frame, pop)
        # big ACCESS DENIED flashes
        for (t0, t1) in [(3.0, 3.45), (4.9, 5.15), (6.35, 6.55), (6.85, 7.0)]:
            if t0 <= t < t1 and (int((t - t0) * 30) % 3 != 2):
                band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                bd = ImageDraw.Draw(band)
                bd.rectangle((0, 470, W, 610), fill=(25, 95, 255, 235))
                bd.text((960, 540), "ACCESS DENIED", font=F_ORB_XL, fill=(255, 255, 255, 255), anchor="mm")
                comp(frame, band)
        # alarm edge pulse
        rate = 2 + (t - 3.0) * 2.5
        pulse = max(0.0, math.sin(2 * math.pi * rate * (t - 3.0))) ** 2
        edge = np.clip((RADIAL - 600) / 600, 0, 1)[..., None]
        frame += edge * np.array([30, 80, 200], np.float32) * pulse * (0.4 + 0.6 * k)

    frame = bloom(frame, 0.55 + 0.4 * k, 12)

    # camera: slow digital push-in, shake in scene 2
    scale = 1.0 + 0.06 * ease_io(t / 7.0)
    sh = 8 * k * k
    if t >= 3.0 and rng.random() < 0.12:  # occasional zoom punch
        scale += 0.025 * k
    frame = camera(frame, scale, rng.normal(0, 1) * sh, rng.normal(0, 1) * sh)

    if t >= 3.0:
        frame = glitch(frame, 0.6 * k, rng)  # restrained, keeps text readable
        if rng.random() < 0.15 * k:
            frame *= rng.uniform(0.25, 0.6)  # flicker

        if rng.random() < 0.18 * k:  # split screen
            off = int(rng.integers(30, 160))
            frame = np.maximum(frame * 0.7, np.roll(frame, off, axis=0) * 0.6)
    else:
        frame *= clamp(t / 0.45)  # fade up from black
    return finish(frame, i, grain=4 + 10 * k)


# ---------------------------------------------------------------- scene 3
L1, L2 = "Maybe the problem isn't the user.", "Maybe it's the system."


def char_alpha(t, t0, idx, stagger, dur=0.45):
    return ease_io((t - t0 - idx * stagger) / dur)


def scene_mystery(t, i):
    frame = np.zeros((H, W, 3), np.float32)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    fade_out = 1 - ease_io((t - 10.75) / 0.25)
    dim1 = 1 - 0.45 * ease_io((t - 9.1) / 0.6)
    tr1 = 4 + 2.5 * clamp((t - 7.5) / 3.5)
    tracked(d, 960, 490, L1, F_LINE,
            lambda j: (255, 255, 255, int(255 * char_alpha(t, 7.5, j, 0.022) * dim1 * fade_out)), tr1)
    tr2 = 4 + 2.5 * clamp((t - 9.1) / 2.0)
    tracked(d, 960, 600, L2, F_LINE,
            lambda j: (255, 255, 255, int(255 * char_alpha(t, 9.1, j, 0.03) * fade_out)), tr2)
    comp(frame, img)
    frame = bloom(frame, 0.35, 14, tint=(0.55, 0.75, 1.0))
    rng = np.random.default_rng(5000 + i)
    if 10.30 <= t < 10.37:  # one subtle glitch on "the system"
        band = frame[560:640].copy()
        frame[560:640] = np.roll(band, int(rng.integers(12, 28)), axis=1)
        frame = glitch(frame, 0.15, rng, slices=False)
    return finish(frame, i, grain=2.5, scan=False)


# ---------------------------------------------------------------- scene 4: logo
def logo_paths():
    def cubic(p0, p1, p2, p3, n=60):
        out = []
        for s in range(n + 1):
            u = s / n
            a = (1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3
            out.append((a[0] * p0[0] + a[1] * p1[0] + a[2] * p2[0] + a[3] * p3[0],
                        a[0] * p0[1] + a[1] * p1[1] + a[2] * p2[1] + a[3] * p3[1]))
        return out

    circ_r = [(math.sin(a), -math.cos(a)) for a in np.linspace(0, math.pi, 120)]
    circ_l = [(-math.sin(a), -math.cos(a)) for a in np.linspace(0, math.pi, 120)]
    sx = 0.52
    sy = -math.sqrt(1 - sx * sx)
    ang = math.atan2(0.807, 0.591)
    bx, by = math.cos(ang), math.sin(ang)
    return [  # (points, start, end)
        (circ_r, 11.35, 12.25),
        (circ_l, 11.35, 12.25),
        ([(0, -1), (0, 0.115)], 11.55, 12.05),
        ([(-1, 0), (1, 0)], 11.65, 12.25),
        ([(0, -1), (-bx, by)], 11.75, 12.45),
        ([(0, -1), (bx, by)], 11.75, 12.45),
        ([(-sx, sy), (-sx, 0)], 11.95, 12.4),
        ([(sx, sy), (sx, 0)], 11.95, 12.4),
        (cubic((0, 0.115), (-0.23, 0.23), (-0.52, 0.45), (-bx, by)), 12.05, 12.7),
        (cubic((0, 0.115), (0.23, 0.23), (0.52, 0.45), (bx, by)), 12.05, 12.7),
    ]


LOGO = logo_paths()
LOGO_CX, LOGO_CY, LOGO_R = 960, 410, 225
SS = 2
LBOX = int((LOGO_R + 40) * 2)


def partial(pts, f):
    if f <= 0:
        return []
    if f >= 1:
        return pts
    seg = [math.dist(pts[j], pts[j + 1]) for j in range(len(pts) - 1)]
    target = sum(seg) * f
    out, acc = [pts[0]], 0.0
    for j, L in enumerate(seg):
        if acc + L >= target:
            u = (target - acc) / L if L else 0
            out.append((pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u))
            return out
        out.append(pts[j + 1])
        acc += L
    return out


def logo_layer(t, rng):
    size = LBOX * SS
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = size / 2
    R = LOGO_R * SS

    def P(p):
        return (c + p[0] * R, c + p[1] * R)

    fill_a = ease_io((t - 12.4) / 0.6)
    if fill_a > 0:
        d.ellipse((c - R, c - R, c + R, c + R), fill=(20, 50, 130, int(18 * fill_a)))
    tips = []
    for pts, t0, t1 in LOGO:
        f = ease_io((t - t0) / (t1 - t0))
        seg = partial(pts, f)
        if len(seg) >= 2:
            d.line([P(p) for p in seg], fill=(215, 232, 255, 255), width=5 * SS, joint="curve")
            if f < 1:
                tips.append(P(seg[-1]))
    for (x, y) in tips:  # bright drawing tips
        d.ellipse((x - 9 * SS, y - 9 * SS, x + 9 * SS, y + 9 * SS), fill=(255, 255, 255, 255))
    img = img.resize((LBOX, LBOX), Image.LANCZOS)
    arr = np.asarray(img).astype(np.float32) / 255.0
    # hologram: interlace + moving scan band + flicker while forming
    rows = np.arange(LBOX, dtype=np.float32)[:, None]
    inter = np.where((rows % 4) < 2, 1.0, 0.72)
    band_y = ((t - 11.3) * 260) % (LBOX + 200) - 100
    band = 1 + 0.6 * np.exp(-((rows - band_y) / 18) ** 2)
    flick = 1.0 if t > 13.0 else rng.uniform(0.82, 1.0)
    arr[..., 3] = np.clip(arr[..., 3] * inter * flick, 0, 1)
    arr[..., :3] = np.clip(arr[..., :3] * band[..., None], 0, 1)
    return arr


def scene_reveal(t, i):
    rng = np.random.default_rng(9000 + i)
    frame = np.zeros((H, W, 3), np.float32)
    # blue light from the centre
    lt = t - 11.0
    grow = ease_out(lt / 0.9)
    level = (0.25 + 0.75 * grow) * (1 - 0.45 * ease_io((t - 12.2) / 1.0))
    rad = 80 + 520 * grow
    glow = np.exp(-((RADIAL - 0) / rad) ** 2)[..., None]
    lc = (LOGO_CY - H / 2)
    glow2 = np.exp(-(((XX - W / 2) / 900) ** 2 + ((YY - H / 2 - lc) / 330) ** 2))[..., None]
    frame += glow * np.array([4, 18, 62], np.float32) * level + glow2 * np.array([1, 3, 10], np.float32) * grow
    # anamorphic streak
    st = clamp(1 - abs(lt - 0.35) / 0.45)
    if st > 0:
        sw = 200 + 1600 * ease_out(lt / 0.6)
        streak = np.exp(-((YY - H / 2) / 3) ** 2 - ((XX - W / 2) / (sw / 2)) ** 2)[..., None]
        frame += streak * np.array([90, 150, 230], np.float32) * st * 1.1

    # logo (holographic draw-on)
    logo = logo_layer(t, rng)
    lx, ly = LOGO_CX - LBOX // 2, LOGO_CY - LBOX // 2
    comp(frame, logo, lx, ly)

    # wordmark + tagline
    txt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(txt)
    wa = ease_io((t - 13.0) / 0.5)  # emerges from the dark instead of popping
    if wa > 0:
        trk = 26 + 30 * (1 - ease_out((t - 13.0) / 1.2))
        tracked(d, 960, 745, "AYVETO", F_WORD, lambda j: (235, 242, 255, int(240 * wa)), trk)
    ta = ease_io((t - 13.45) / 0.55)
    if ta > 0:
        tw = tracked(d, 960, 832, "WALK IN. NO TAPPING.", F_TAG, lambda j: (175, 205, 255, int(255 * ta)), 12)
        ll = 120 * ease_out((t - 13.45) / 0.8)
        for sgn in (-1, 1):
            x0 = 960 + sgn * (tw / 2 + 30)
            d.line((x0, 834, x0 + sgn * ll, 834), fill=(60, 130, 255, int(200 * ta)), width=2)
    comp(frame, txt)

    # impact: no bright flash, only a faint cold pulse around the logo
    if t >= 13.0:
        fl = math.exp(-(t - 13.0) / 0.35)
        frame += np.exp(-((RADIAL) / 500) ** 2)[..., None] * np.array([4, 14, 45], np.float32) * fl

    frame = bloom(frame, 0.32, 16, tint=(0.6, 0.8, 1.0))

    # camera: slow push into the logo, tiny kick on impact
    scale = 1.06 - 0.06 * ease_out((t - 11.0) / 2.5)
    if t >= 13.0:
        scale += 0.008 * math.exp(-(t - 13.0) / 0.2)
    frame = camera(frame, scale)

    # elegant glitches
    for (g0, g1, gk) in [(12.25, 12.32, 0.18), (13.0, 13.2, 0.22), (14.05, 14.1, 0.1)]:
        if g0 <= t < g1:
            k = gk * (1 - (t - g0) / (g1 - g0) * 0.6)
            out = frame.copy()
            for _ in range(4):
                y = int(rng.integers(ly, ly + LBOX + 300))
                h = int(rng.integers(3, 18))
                out[y:y + h] = np.roll(out[y:y + h], int(rng.normal(0, 30)), axis=1)
            frame = glitch(out, k, rng, slices=False)
    if t >= 14.9:
        frame[:] = 0  # cut to black
    return finish(frame, i, grain=3.0)


# ---------------------------------------------------------------- dispatcher
def render(i):
    t = i / FPS
    if t < 7.0:
        f = scene_system(t, i)
    elif t < 7.45:
        f = finish(np.zeros((H, W, 3), np.float32), i, grain=2.0, scan=False)  # silence/black
    elif t < 11.0:
        f = scene_mystery(t, i)
    else:
        f = scene_reveal(t, i)
    return f.tobytes()


def main():
    out = os.path.join(HERE, "AYVETO_System_Error_Intro.mp4")
    wav = os.path.join(HERE, "audio.wav")
    if not os.path.exists(wav):
        subprocess.check_call([sys.executable, os.path.join(HERE, "audio.py")])
    only = [int(a) for a in sys.argv[1:]]
    if only:  # preview stills: render.py 30 120 ...
        for i in only:
            Image.frombytes("RGB", (W, H), render(i)).save(os.path.join(HERE, "previews", f"f{i:03d}.jpg"), quality=88)
        return
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ff, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "256k", "-t", str(DUR), "-movflags", "+faststart", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(os.cpu_count()) as pool:
        for n, buf in enumerate(pool.imap(render, range(N), chunksize=2)):
            p.stdin.write(buf)
            if n % 30 == 0:
                print(f"frame {n}/{N}", flush=True)
    p.stdin.close()
    p.wait()
    print("wrote", out)


if __name__ == "__main__":
    main()
