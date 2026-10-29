// Usage: node render.mjs --dpr 1 --out frames --from 0 --to 720 --workers 4   |  --list 12,48,96 (stills)
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DPR = +arg('dpr', 1), OUT = arg('out', 'frames'), WORKERS = +arg('workers', 4);
let frames = arg('list') ? arg('list').split(',').map(Number) : null;
if (!frames) { const a = +arg('from', 0), b = +arg('to', 720); frames = []; for (let f = a; f < b; f++) frames.push(f); }
frames = frames.filter(f => !fs.existsSync(`${OUT}/f_${String(f).padStart(5, '0')}.png`) || arg('list'));
fs.mkdirSync(OUT, { recursive: true });

const srv = await startServer(8125);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });
let next = 0, done = 0; const t0 = Date.now();
async function worker(id) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DPR });
  page.on('console', m => { if (m.type() === 'error') console.log(`[w${id}]`, m.text()); });
  page.on('crash', () => console.log('CRASH', id)); page.on('pageerror', e => console.log(`[w${id}] pageerror`, e.message));
  await page.goto(`http://localhost:8125/scene/index.html?dpr=${DPR}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 0, polling: 500 });
  while (next < frames.length) {
    const f = frames[next++];
    await page.evaluate(f => window.renderFrame(f), f);
    await page.locator('#wrap').screenshot({ path: `${OUT}/f_${String(f).padStart(5, '0')}.png`, animations: 'disabled' });
    done++;
    if (done % 10 === 0 || done === frames.length) {
      const el = (Date.now() - t0) / 1000; console.log(`${done}/${frames.length}  ${(el / done).toFixed(2)}s/frame  eta ${((frames.length - done) * el / done / 60).toFixed(1)}min`);
    }
  }
  await page.close();
}
await Promise.all(Array.from({ length: Math.min(WORKERS, frames.length) }, (_, i) => worker(i)));
await browser.close(); srv.close();
console.log('done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
