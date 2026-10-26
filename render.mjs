// Renders the animation frame-by-frame in headless Chromium and encodes an MP4.
//   node render.mjs                         -> ayveto_evakuasi_kebakaran.mp4 (1920x1080, 30 fps)
//   node render.mjs --stills 0,5,14,20      -> PNG stills in ./stills (for quick review)
//   node render.mjs --w 1280 --h 720 --fps 24 --out preview.mp4
//   node render.mjs --scene scene_gempa     -> earthquake version (video only; add sound with audio_gempa.mjs)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const W = +(args.w || 1920), H = +(args.h || 1080), FPS = +(args.fps || 30);
const SCENE = args.scene || 'scene';
const OUT = args.out || (SCENE === 'scene_gempa' ? 'ayveto_evakuasi_gempa_video.mp4' : 'ayveto_evakuasi_kebakaran.mp4');
const root = path.dirname(new URL(import.meta.url).pathname);

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
if (args.scene && !/^[a-z_]+$/.test(args.scene)) throw new Error('bad --scene');
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', e => console.error('[page error]', e.message));
await page.goto(`http://localhost:${port}/index.html?render&scene=${SCENE}&w=${W}&h=${H}${args.closeup?'&closeup'+(args.closeup===true?'':args.closeup):''}${args.cam?'&cam='+args.cam:''}`);
await page.waitForFunction(() => window.sceneReady === true, null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);

const grab = async t => {
  const dataUrl = await page.evaluate(tt => { window.renderAt(tt); return document.querySelector('canvas').toDataURL('image/png'); }, t);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

if (args.stills) {
  fs.mkdirSync(path.join(root, 'stills'), { recursive: true });
  for (const t of String(args.stills).split(',').map(Number)) {
    fs.writeFileSync(path.join(root, 'stills', `t${t.toFixed(1).padStart(5, '0')}.png`), await grab(t));
    console.log('still', t);
  }
} else {
  const duration = await page.evaluate(() => window.DURATION);
  const frames = Math.round(duration * FPS);
  const ff = spawn(ffmpegPath, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(root, OUT)],
  { stdio: ['pipe', 'ignore', 'inherit'] });
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    const buf = await grab(i / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 30 === 0) console.log(`frame ${i}/${frames}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('wrote', OUT);
}
await browser.close();
server.close();
