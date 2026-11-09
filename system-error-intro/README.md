# AYVETO — SYSTEM ERROR (Intro 15 detik)

Video intro sinematik untuk pembukaan presentasi AYVETO (Advanced Yielding Verification & Entry Technology Organization).

| File | Keterangan |
|---|---|
| `AYVETO_System_Error_Intro_HD.mp4` | Kualitas tinggi (≈73 MB), untuk diputar saat presentasi |
| `AYVETO_System_Error_Intro_small.mp4` | Versi ringan (≈23 MB), untuk dibagikan |

1920×1080 (16:9) · 30 fps · tepat 15,00 detik · audio stereo 48 kHz.

## Timeline
- **0–3 s — The System:** UI keamanan, pemindaian kartu RFID, suara mesin & scan.
- **3–7 s — System Failure:** notifikasi error bertubi-tubi, kartu glitch, alarm makin cepat.
- **7–11 s — The Mystery:** sunyi total & layar hitam, lalu "Maybe the problem isn't the user." / "Maybe it's the system."
- **11–15 s — The Reveal:** cahaya biru, logo AYVETO dengan holographic reveal, *WALK IN. NO TAPPING.*, impact, cut to black.

## Render ulang
Semua visual dan audio dibuat dengan kode (tanpa aset berlisensi).

```bash
python3 -m venv .venv
.venv/bin/pip install numpy pillow imageio-ffmpeg
.venv/bin/python audio.py     # -> audio.wav
.venv/bin/python render.py    # -> AYVETO_System_Error_Intro.mp4 (~1 menit pada 8 core)
.venv/bin/python render.py 30 200 440   # preview frame tertentu ke previews/
```

Font: Orbitron, Rajdhani, Share Tech Mono (Google Fonts, SIL Open Font License).
