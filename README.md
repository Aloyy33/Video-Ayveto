# AYVETO Fire Evacuation – 3D Animation

**Video:** [`ayveto_evakuasi_kebakaran.mp4`](ayveto_evakuasi_kebakaran.mp4): 24 s, 1920×1080 (16:9), 30 fps, H.264, no audio.

A fire breaks out in the back corner of the AYVETO office. The alarm strobes flash, smoke rises, and everyone in the building evacuates. The visitor in the yellow shirt and about 45 other people walk from the office through the gate bank, across the lobby and out through the entrance doors to the assembly point (TITIK KUMPUL) outside.

- **Gates:** the gate system is switched off. All 7 lanes stand wide open (every flap released), the LED strips, indicators and status displays are dark, and people pass through every lane at the same time.
- **Crowd:** paths come from a deterministic crowd simulation (`crowd.mjs`). People keep their distance, queue at the doors, and walk only forward toward the exit. A few cover their mouths against the smoke.
- **Guidance:** green EXIT signs hang above the gates and the entrance. The lobby screen shows EVAKUASI. The security guard stands by the doors (held open by the alarm) and waves people out.
- **Camera:** one continuous shot. It starts in the office on the fire, follows the yellow-shirt visitor through the open gates and the lobby, and ends craning up over the facade to the assembly point.

The previous video of the access process (`ayveto_access_process.mp4`) is still in the repository. Its source is in the git history.

![Preview](contact_sheet.png)

## Re-rendering

```bash
npm install
npx playwright install chromium
node render.mjs                      # -> ayveto_evakuasi_kebakaran.mp4
node render.mjs --stills 5,14,20     # preview images in ./stills
node render.mjs --stills 2 --cam 3.2,2.2,-9.2,6.6,0.8,-9.8 # free debug camera: x,y,z,targetX,targetY,targetZ
```

The camera keys (`CAM_KEYS`) and the fire/alarm effects are in `scene.js`. Crowd start positions, routes and obstacles are in `crowd.mjs`.
