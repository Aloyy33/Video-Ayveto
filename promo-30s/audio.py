"""Original soundtrack + sound design for the AYVETO 30s spot, synthesized from scratch (no samples)."""
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 48000
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
T = np.arange(N) / SR


def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'highpass', fs=SR, output='sos'), x)


def place(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N: return
    s = sig[: N - i] * gain
    L[i:i + len(s)] += s * np.sqrt(0.5 * (1 - pan)) * 1.414 / 1.414
    R[i:i + len(s)] += s * np.sqrt(0.5 * (1 + pan)) * 1.414 / 1.414


def env(n, a, d, curve=4.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-curve * np.maximum(0, t - a) / d)
    return e


# ---------- elements ----------
def boom(dur=2.4, f0=62, f1=28, dist=2.2):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 5)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env(n, 0.004, dur, 3.0)
    s = np.tanh(s * dist) / np.tanh(dist)
    click = hp(rng.standard_normal(n), 1500) * env(n, 0.0005, 0.03, 6) * 0.35
    body = lp(rng.standard_normal(n), 400) * env(n, 0.002, 0.25, 5) * 0.6
    return s + click + body


def kick(f0=150, f1=45, dur=0.45):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 32)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, dur, 5)
    return np.tanh(s * 1.8) * 0.9 + hp(rng.standard_normal(n), 3000) * env(n, 0.0003, 0.012, 6) * 0.25


def snare():
    n = int(0.35 * SR)
    no = bp(rng.standard_normal(n), 1200, 9000) * env(n, 0.001, 0.18, 5)
    tone = np.sin(2 * np.pi * 190 * np.arange(n) / SR) * env(n, 0.001, 0.08, 5) * 0.5
    return (no + tone) * 0.7


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    return hp(rng.standard_normal(n), 8000, 4) * env(n, 0.0005, 0.12 if open_ else 0.025, 5) * 0.5


def whoosh(dur=0.6, rev=False, lo=300, hi=6000):
    n = int(dur * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n); seg = 512
    for k in range(0, n, seg):
        u = k / n; c = lo * (hi / lo) ** (u if not rev else 1 - u)
        out[k:k + seg] = bp(x[max(0, k - 2048):k + seg], c * 0.7, min(c * 1.4, 20000))[-len(out[k:k + seg]):]
    sh = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** (1.5 if not rev else 0.8)
    if rev: sh = (t / dur) ** 2.5
    return out * sh * 1.6


def riser(dur, f0=200, f1=2400):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    s = sum(np.sin(2 * np.pi * np.cumsum(f * m) / SR) / m for m in (1, 1.5, 2.01))
    no = hp(rng.standard_normal(n), 2000) * 0.5
    return (s * 0.25 + no * 0.4) * (t / dur) ** 2.2


def scan(dur=0.8, f=2400):
    n = int(dur * SR); t = np.arange(n) / SR
    sweep = np.sin(2 * np.pi * np.cumsum(f * (0.6 + 0.8 * t / dur)) / SR)
    gate = (np.sin(2 * np.pi * 28 * t) > 0.3).astype(float)
    return sweep * gate * np.sin(np.pi * t / dur) * 0.22 + hp(rng.standard_normal(n), 6000) * gate * 0.05


def beep(f=2000, dur=0.08, n_=1, gap=0.08):
    one = np.sin(2 * np.pi * f * np.arange(int(dur * SR)) / SR) * env(int(dur * SR), 0.002, dur, 1.5)
    out = np.zeros(int((dur + gap) * n_ * SR) + 10)
    for k in range(n_): i = int(k * (dur + gap) * SR); out[i:i + len(one)] += one
    return out * 0.3


def ui_tick():
    n = int(0.09 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 3200 * t) * 0.5 + np.sin(2 * np.pi * 1600 * t)) * env(n, 0.0005, 0.03, 6) * 0.25


def metal_gate(dur=0.9):
    n = int(dur * SR); t = np.arange(n) / SR
    servo_f = 180 + 120 * np.sin(np.pi * np.clip(t / 0.5, 0, 1))
    servo = np.sign(np.sin(2 * np.pi * np.cumsum(servo_f) / SR)) * 0.08 * (t < 0.5) * np.sin(np.pi * np.clip(t / 0.5, 0, 1))
    servo = lp(servo, 2500)
    clank = np.zeros(n); i = int(0.48 * SR)
    m = n - i; tt = np.arange(m) / SR
    for fr, a, d in [(523, 1, .5), (1187, .6, .35), (1871, .45, .25), (2734, .3, .18), (3911, .2, .1)]:
        clank[i:] += a * np.sin(2 * np.pi * fr * tt) * np.exp(-tt / d * 3)
    clank[i:] += hp(rng.standard_normal(m), 1500) * np.exp(-tt * 60) * 0.6
    return servo + clank * 0.32 + whoosh(0.5, lo=200, hi=1800)[:n] * 0.25 if n <= len(whoosh(0.5)) else servo + clank * 0.32


def chime(f=880):
    n = int(3.0 * SR); t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * k) for m, a, k in [(1, 1, 1.4), (2, .4, 2.2), (3, .25, 3.0), (4.2, .12, 4)])
    s += sum(a * np.sin(2 * np.pi * f * 1.5 * m * t) * np.exp(-t * k) for m, a, k in [(1, .5, 1.6), (2, .2, 2.4)]) * (t > 0.12)
    return s * 0.18


def pad(dur, freqs, amp=0.08, cutoff=1200):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            s += 2 * ((ff * t + rng.random()) % 1) - 1
    s = lp(s / (len(freqs) * 3), cutoff)
    return s * amp


# ---------- music (A minor, 120 BPM: 0.5s/beat) ----------
BEAT = 0.5
A1, C2, D2, E2, F2, G2 = 55.0, 65.41, 73.42, 82.41, 87.31, 98.0
# sub drone 0-4
d = int(4 * SR); place(lp(np.sin(2 * np.pi * 36.7 * T[:d]) * np.minimum(1, T[:d] / 0.5), 200) * 0.18, 0.35)
place(pad(3.6, [110, 164.8, 220], 0.07, 700) * np.linspace(0, 1, int(3.6 * SR)) ** 0.5, 0.4)

# bassline 4-22 : pulsing 16th saw bass
prog = [(A1, 4), (F2 / 2 * 2, 4), (C2, 4), (G2 / 2 * 2, 4)]
def bass_note(f, dur, cutoff):
    n = int(dur * SR); t = np.arange(n) / SR
    s = 2 * ((f * t) % 1) - 1 + 0.5 * np.sin(2 * np.pi * f / 2 * t)
    return lp(s, cutoff) * env(n, 0.003, dur, 3)
t = 4.0; k = 0
seq = [A1, A1, F2, F2, C2, C2, G2, E2]
while t < 21.9:
    bar = int((t - 4) / 2) % len(seq); f = seq[bar]
    cutoff = 300 if t < 8 else (600 if t < 15 else 900)
    gain = 0.22 if t < 8 else 0.28
    if not (14.85 < t < 15.05):
        place(bass_note(f, 0.115, cutoff), t, gain)
    t += BEAT / 4

# drums
def drums(a, b, density):
    t = a
    while t < b - 1e-6:
        beat = round((t - 4) / BEAT)
        if density >= 1 and beat % 2 == 0: place(kick(), t, 0.9)
        if density >= 2 and beat % 2 == 1: place(kick(), t, 0.75)
        if density >= 2 and beat % 4 == 2: place(snare(), t, 0.5, 0.1)
        if density >= 1: place(hat(), t + BEAT / 2, 0.22, 0.3)
        if density >= 3: place(hat(), t + BEAT / 4, 0.12, -0.3); place(hat(), t + 3 * BEAT / 4, 0.12, -0.3)
        t += BEAT
drums(4.0, 8.0, 1)
drums(8.5, 14.75, 3)
drums(15.5, 21.75, 2)
for x in (19.0, 19.25, 19.5, 21.0, 21.25, 21.5): place(snare(), x, 0.35)

# arp (scene 3/4 lift)
arpN = [440, 523.25, 659.25, 880, 659.25, 523.25]
t = 8.5; i = 0
while t < 21.8:
    f = arpN[i % len(arpN)] * (0.8909 if int((t - 8) / 2) % 4 == 1 else 1)
    n = int(0.12 * SR); tt = np.arange(n) / SR
    s = lp(2 * ((f * tt) % 1) - 1, 2500 + 1500 * np.sin(t)) * env(n, 0.002, 0.12, 4) * 0.06
    if not (14.75 < t < 15.1): place(s, t, 1.0, 0.4 * np.sin(i * 1.3))
    t += BEAT / 4; i += 1
place(pad(7.0, [220, 261.6, 329.6], 0.06, 1500), 8.2)
place(pad(7.0, [174.6, 220, 261.6, 349.2], 0.06, 1800), 15.0)

# finale: riser into big hit, then sustained pad + chime
place(riser(2.2, 150, 3000), 22.0, 0.5)
place(pad(5.8, [110, 164.8, 220, 329.6], 0.11, 1400) * np.exp(-np.arange(int(5.8 * SR)) / SR * 0.35), 24.2)
place(lp(np.sin(2 * np.pi * 55 * T[:int(5.5 * SR)]) * np.exp(-T[:int(5.5 * SR)] * 0.6), 150) * 0.3, 24.2)

# ---------- sound design hits ----------
place(boom(3.2, 70, 26, 2.6), 0.35, 1.0)
place(whoosh(0.9, rev=True, lo=200, hi=5000), 0.0, 0.5)
for i, t0 in enumerate([0.35, 0.5, 0.6, 0.72]): place(whoosh(0.7, lo=500, hi=9000), t0, 0.35, [-0.6, 0.6, -0.3, 0.4][i])
place(scan(0.85, 2200), 1.55, 0.9)
place(whoosh(0.35, rev=True), 2.2, 0.55)
place(boom(1.8, 90, 32, 2.0), 2.55, 0.85); place(kick(180, 40, 0.5), 2.55, 0.6)
place(boom(1.6, 80, 30, 2.0), 2.8, 0.6)
place(whoosh(0.6, lo=300, hi=8000), 3.75, 0.5)
place(boom(1.2, 70, 35, 1.5), 4.0, 0.4)
# scene 2: tap reader beeps (denied-denied then OK), queue tension
place(beep(1100, 0.09, 2, 0.06), 5.45, 0.8, 0.3)
place(beep(2000, 0.14, 1), 5.95, 0.8, 0.3)
place(metal_gate(0.9) * 0.6, 6.05, 0.7, 0.2)
place(boom(1.4, 80, 30, 1.8), 6.15, 0.75)
place(whoosh(0.5, rev=True, lo=400, hi=9000), 7.55, 0.6)
place(whoosh(0.7, lo=300, hi=10000), 7.85, 0.8)
# scene 3
place(boom(2.0, 85, 28, 2.4), 8.05, 0.95)
place(boom(1.4, 90, 32, 2.0), 9.5, 0.8)
place(scan(0.9, 2800), 10.2, 0.9, -0.2)
for k in range(5): place(beep(3200 + 300 * k, 0.03), 10.25 + k * 0.07, 0.35, 0.2)
place(beep(2600, 0.06, 2, 0.04), 10.95, 0.6)
place(boom(1.4, 90, 32, 2.0), 11.0, 0.8)
place(metal_gate(0.95), 11.05, 0.95, -0.1)
place(boom(1.4, 90, 32, 2.0), 12.9, 0.8)
place(metal_gate(0.9) * 0.5, 13.45, 0.5, 0.2)
place(riser(0.45, 400, 5000), 14.55, 0.5); place(whoosh(0.5, rev=True, lo=500, hi=10000), 14.55, 0.6)
# scene 4
place(boom(1.8, 80, 30, 2.2), 15.0, 0.9)
place(whoosh(0.6, lo=300, hi=7000), 15.0, 0.5)
place(boom(1.1, 95, 35, 1.8), 15.5, 0.55)
for x in (16.95, 18.2, 18.75, 19.5, 21.0): place(ui_tick(), x, 0.8, 0.2); place(whoosh(0.3, lo=1500, hi=9000), x - 0.05, 0.22)
for x in (15.4, 16.25, 17.25, 18.95, 19.85, 21.2): place(beep(2600, 0.035), x, 0.25, -0.2)
place(boom(1.1, 95, 35, 1.8), 19.65, 0.6)
place(whoosh(0.6, rev=True, lo=300, hi=9000), 21.45, 0.6)
# scene 5
place(boom(1.8, 80, 30, 2.0), 22.0, 0.75); place(whoosh(0.8, lo=200, hi=6000), 22.0, 0.5)
place(scan(1.1, 1800), 22.3, 0.45)
place(boom(4.5, 75, 24, 3.0), 24.2, 1.15); place(kick(200, 38, 0.8), 24.2, 0.7)
place(whoosh(1.2, lo=150, hi=4000), 24.2, 0.5)
place(chime(880), 24.35, 1.0)
place(chime(1318.5), 25.5, 0.55, 0.15)
place(chime(1760), 26.5, 0.4, -0.15)
place(ui_tick(), 28.9, 0.6)

# ---------- master ----------
mix = np.stack([L, R], 1)
mix = hp(mix.T, 22).T
fade = np.ones(N); fs_ = int(29.2 * SR); fade[fs_:] = np.linspace(1, 0, N - fs_) ** 2
mix *= fade[:, None]
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix *= 0.89 / np.max(np.abs(mix))
wavfile.write('soundtrack.wav', SR, (mix * 32767).astype(np.int16))
print('peak', np.max(np.abs(mix)), 'rms dB', 20 * np.log10(np.sqrt(np.mean(mix ** 2))))
