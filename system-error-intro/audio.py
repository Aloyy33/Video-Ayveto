"""Synthesised 15 s soundtrack for the AYVETO intro (48 kHz stereo WAV).

0-3 s   low machine hum, data ticks, soft RFID scan sweeps + read beep
3-7 s   error blips + distorted alarm that speeds up and gets louder
7.0 s   hard cut to complete silence
7.5-11  mysterious ambient pad (detuned, filtered) with a low sub swell
11-13   rising riser into the logo
13.0 s  cinematic digital impact (sub drop + noise burst + metallic ring) with tail
"""
import os
import wave

import numpy as np

SR = 48000
DUR = 15.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(3)
L = np.zeros(N)
R = np.zeros(N)


def env_ar(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def add(sig, start, pan=0.0, gain=1.0):
    s = int(start * SR)
    e = min(N, s + len(sig))
    if e <= s:
        return
    seg = sig[:e - s] * gain
    L[s:e] += seg * np.sqrt(0.5 * (1 - pan))
    R[s:e] += seg * np.sqrt(0.5 * (1 + pan))


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lp_fast(x, cutoff, order=2):
    # FFT brick-ish lowpass (fast for long signals)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** (2 * order))
    return np.fft.irfft(X, len(x))


def hp_fast(x, cutoff, order=2):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 - 1 / (1 + (f / cutoff) ** (2 * order))
    return np.fft.irfft(X, len(x))


def bp_fast(x, lo, hi):
    return hp_fast(lp_fast(x, hi), lo)


def tone(freq, dur, wave_="sine"):
    tt = np.arange(int(dur * SR)) / SR
    ph = 2 * np.pi * np.cumsum(np.broadcast_to(freq, tt.shape)) / SR if np.ndim(freq) else 2 * np.pi * freq * tt
    if wave_ == "sine":
        return np.sin(ph)
    if wave_ == "square":
        return np.sign(np.sin(ph))
    if wave_ == "saw":
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    raise ValueError


# ---------------------------------------------------------------- scene 1 (0-3)
d = 7.0
hum = (np.sin(2 * np.pi * 50 * t[:int(d * SR)]) * 0.5 + np.sin(2 * np.pi * 100 * t[:int(d * SR)]) * 0.25
       + np.sin(2 * np.pi * 150.5 * t[:int(d * SR)]) * 0.12)
hum *= env_ar(len(hum), 0.6, 0.0)
add(hum, 0.0, 0, 0.10)
# servers/air noise
air = lp_fast(rng.normal(0, 1, int(d * SR)), 900) * env_ar(int(d * SR), 0.8, 0.0)
add(air, 0.0, 0, 0.05)
# data ticks
for k in range(40):
    st = 0.4 + k * 0.165 + rng.uniform(-0.03, 0.03)
    if st > 2.95:
        break
    f = rng.choice([2400, 3200, 4100])
    blip = tone(f, 0.018) * env_ar(int(0.018 * SR), 0.001, 0.015)
    add(blip, st, rng.uniform(-0.7, 0.7), 0.035)
# RFID scan sweeps (follow the visual scan line period of 0.7 s from 1.2 s)
for k in range(3):
    st = 1.2 + k * 0.7
    dur = 0.55
    n = int(dur * SR)
    fr = np.linspace(700, 1900, n)
    sw = tone(fr, dur) * np.sin(np.linspace(0, np.pi, n)) ** 2
    sw += bp_fast(rng.normal(0, 1, n), 2000, 6000) * np.sin(np.linspace(0, np.pi, n)) ** 2 * 0.3
    add(sw, st, -0.3 + 0.3 * k, 0.07)
# read beep (flash at 2.6 s)
beep = (tone(1760, 0.09) + 0.4 * tone(3520, 0.09)) * env_ar(int(0.09 * SR), 0.003, 0.04)
add(beep, 2.6, 0, 0.12)

# ---------------------------------------------------------------- scene 2 (3-7)
# match popups timing from render.py
pop_t, tt0, gap = [], 3.05, 0.42
while tt0 < 6.97:
    pop_t.append(tt0)
    tt0 += gap
    gap = max(0.045, gap * 0.84)
for j, st in enumerate(pop_t):
    k = (st - 3.0) / 4.0
    f = [880, 660, 990, 587, 740][j % 5]
    b = tone(f, 0.11, "square") * env_ar(int(0.11 * SR), 0.002, 0.06)
    b = lp_fast(b, 5000)
    add(b, st, ((j * 0.37) % 1.4) - 0.7, 0.045 + 0.03 * k)
# denied buzzer at 3.0
buzz = tone(110, 0.45, "saw") + tone(113, 0.45, "saw")
buzz = lp_fast(buzz, 1200) * env_ar(len(buzz), 0.005, 0.1)
add(buzz, 3.0, 0, 0.16)
# distorted alarm: two-tone siren, accelerating, rising amplitude
seg = int(4.0 * SR)
ts = np.arange(seg) / SR
rate = 2 + ts * 2.5  # matches the visual edge pulse
phase = np.cumsum(rate) / SR
sq = (np.sin(2 * np.pi * phase) > 0).astype(float)
freq = 620 + 260 * sq + ts * 40
alarm = tone(freq, 4.0, "saw")
alarm = np.tanh(alarm * (2 + ts * 3))  # distortion grows
alarm = lp_fast(alarm, 3500)
alarm *= (0.25 + 0.75 * (ts / 4.0) ** 1.3)
alarm[:int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
add(alarm, 3.0, 0, 0.14)
# glitch noise bursts / stutters
for k in range(60):
    st = 3.0 + (k / 60) ** 0.7 * 3.95
    dur = rng.uniform(0.01, 0.06)
    nb = rng.normal(0, 1, int(dur * SR))
    nb = np.round(nb * 3) / 3  # bitcrush
    add(nb, st, rng.uniform(-1, 1), 0.02 + 0.06 * (st - 3) / 4)
# low rumble building
rum = lp_fast(rng.normal(0, 1, seg), 120) * (ts / 4.0) ** 2
add(rum, 3.0, 0, 0.6)

# ---------------------------------------------------------------- hard cut at 7.0
cut = int(7.0 * SR)
fade = int(0.004 * SR)
for ch in (L, R):
    ch[cut - fade:cut] *= np.linspace(1, 0, fade)
    ch[cut:] = 0.0

# ---------------------------------------------------------------- scene 3 ambient (7.5-11)
s3, e3 = 7.5, 11.0
n3 = int((e3 - s3) * SR)
t3 = np.arange(n3) / SR
pad = np.zeros(n3)
for f, a in [(55, 0.5), (82.4, 0.32), (110.3, 0.25), (130.8, 0.16), (164.6, 0.08)]:
    for det in (-0.4, 0.4):
        pad += a * np.sin(2 * np.pi * (f + det) * t3 + rng.uniform(0, 6))
pad *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.35 * t3)
pad_env = np.clip(t3 / 1.6, 0, 1) ** 2
pad *= pad_env
air3 = bp_fast(rng.normal(0, 1, n3), 300, 1800) * pad_env * (0.6 + 0.4 * np.sin(2 * np.pi * 0.2 * t3))
add(pad, s3, -0.15, 0.09)
add(np.roll(pad, 900), s3, 0.15, 0.09)  # slight delay on the right = wide stereo
add(air3, s3, 0, 0.025)
# soft high "ping" on each line
for st in (7.5, 9.1):
    p = tone(1318.5, 2.0) * np.exp(-np.arange(int(2.0 * SR)) / SR / 0.6)
    add(p, st, -0.4 if st < 8 else 0.4, 0.03)
# tiny glitch tick on "the system" (visual glitch at 10.30)
add(np.round(rng.normal(0, 1, int(0.05 * SR)) * 2) / 2, 10.30, 0.2, 0.05)

# ---------------------------------------------------------------- scene 4
# continue ambient bed under the reveal, fading after the impact
n4 = int(4.0 * SR)
t4 = np.arange(n4) / SR
bed = np.zeros(n4)
for f, a in [(55, 0.5), (82.4, 0.3), (110.3, 0.22)]:
    bed += a * np.sin(2 * np.pi * f * t4 + 0.3)
bed *= np.where(t4 < 2.0, 1.0, np.exp(-(t4 - 2.0) / 0.9))
add(bed, 11.0, 0, 0.09)
# light swell at 11.0
sw_n = int(0.9 * SR)
swl = bp_fast(rng.normal(0, 1, sw_n), 400, 4000) * np.sin(np.linspace(0, np.pi, sw_n)) ** 2
add(swl, 11.0, 0, 0.05)
# riser 11.2 -> 13.0
rn = int(1.8 * SR)
tr = np.arange(rn) / SR
rf = 180 * (2 ** (tr / 1.8 * 2.5))
riser = 0.5 * tone(rf, 1.8, "saw") + bp_fast(rng.normal(0, 1, rn), 1500, 9000) * 0.8
riser = lp_fast(riser, 6000) * (tr / 1.8) ** 2.2
riser[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))
add(riser, 11.2, 0, 0.07)
# reverse whoosh into impact
wn = int(0.5 * SR)
wh = bp_fast(rng.normal(0, 1, wn), 800, 7000) * np.linspace(0, 1, wn) ** 3
add(wh, 12.5, 0, 0.1)
# IMPACT at 13.0
imp_n = int(2.0 * SR)
ti = np.arange(imp_n) / SR
sub_f = 38 + 120 * np.exp(-ti / 0.06)
sub = np.sin(2 * np.pi * np.cumsum(sub_f) / SR) * np.exp(-ti / 0.9)
crack = bp_fast(rng.normal(0, 1, imp_n), 200, 9000) * np.exp(-ti / 0.05)
ring = sum(np.sin(2 * np.pi * f * ti) * a for f, a in [(220, 0.5), (331, 0.3), (587, 0.18), (1244, 0.1)])
ring *= np.exp(-ti / 0.7)
digi = np.round(tone(880, 2.0, "square") * 2) / 2 * np.exp(-ti / 0.12) * 0.3
impact = np.tanh((sub * 1.2 + crack * 0.6 + ring * 0.35 + digi) * 1.4)
add(impact, 13.0, 0, 0.55)
# stereo tail (simple multi-tap echo)
for k, (dl, g) in enumerate([(0.11, 0.25), (0.23, 0.17), (0.37, 0.11), (0.55, 0.07)]):
    add(lp_fast(impact, 2500), 13.0 + dl, -0.6 if k % 2 == 0 else 0.6, 0.55 * g)
# glitch blips matching visual glitches
for st in (12.25, 14.05):
    add(np.round(rng.normal(0, 1, int(0.06 * SR)) * 2) / 2, st, 0, 0.03)

# hard cut to black at 14.9 -> short fade to silence
c2 = int(14.9 * SR)
f2 = int(0.03 * SR)
for ch in (L, R):
    ch[c2:c2 + f2] *= np.linspace(1, 0, f2)
    ch[c2 + f2:] = 0.0

# ---------------------------------------------------------------- master
mix = np.stack([L, R], 1)
peak = np.max(np.abs(mix))
mix = mix / peak * 0.89
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix[int(7.0 * SR):int(7.5 * SR)] = 0.0  # guarantee true silence
pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio.wav")
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out, "peak", peak)
