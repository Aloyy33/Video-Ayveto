# AYVETO Access Process – 3D Animation

**Video:** [`ayveto_access_process.mp4`](ayveto_access_process.mp4) — 24 s, 1920×1080 (16:9), 30 fps, H.264, no audio.

The video shows the AYVETO company access flow: the visitor arrives with their own ID card → the security guard inspects their bag → the visitor walks toward the AYVETO gate → the RFID card is detected automatically from a distance (no tap) → a green indicator shows success and the gate opens **before the visitor arrives** → the visitor walks straight through without stopping, into the company, and the gate closes behind them.

![Preview](contact_sheet.png)

## Re-rendering

```bash
npm install
npx playwright install chromium
node render.mjs                      # -> ayveto_access_process.mp4
node render.mjs --stills 5,14,20     # preview images in ./stills
```

The timeline and camera positions are at the bottom of `scene.js` (`SPEED_KEYS`, `T`, `CAM_KEYS`).
