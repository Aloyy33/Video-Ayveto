// Builds the AYVETO app screens (recreated 1:1 from the supplied prototype) and exports PNG textures.
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

const icon = n => fs.readFileSync(`node_modules/lucide-static/icons/${n}.svg`, 'utf8')
  .replace(/<!--.*?-->/s, '').replace(/\s(width|height)="24"/g, '').trim();

const status = `<div class="status"><span class="time">9:41</span><span class="icons">
<span class="bars"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8.5px"></i><i style="height:11px"></i></span>
<span class="wifi">${icon('wifi')}</span><span class="batt"><b></b></span></span></div>`;

const navItems = [['house', 'Home'], ['credit-card', 'Card'], ['history', 'History'], ['user', 'Profile']];
const nav = a => `<div class="nav">${navItems.map(([i, l], k) =>
  `<div class="it${k === a ? ' on' : ''}">${icon(i)}<span>${l}</span></div>`).join('')}</div><div class="homebar"></div>`;

let html = fs.readFileSync('ui/app.template.html', 'utf8')
  .replaceAll('{{status}}', status)
  .replace(/\{\{nav:(\d)\}\}/g, (_, a) => nav(+a))
  .replace(/\{\{icon:([a-z-]+)\}\}/g, (_, n) => icon(n));
fs.writeFileSync('ui/app.html', html);

const srv = await startServer(8124);
const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 3, viewport: { width: 420, height: 900 } });
await p.goto('http://localhost:8124/ui/app.html');
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(300);
fs.mkdirSync('assets/ui', { recursive: true });
for (const id of ['home', 'card', 'block', 'report', 'reportmodal', 'history', 'profile'])
  await p.locator('#' + id).screenshot({ path: `assets/ui/${id}.png` });
for (const id of ['el-tapless', 'el-vcard', 'el-row1', 'el-notif', 'el-sec', 'el-modal', 'el-live', 'el-tiles'])
  await p.locator('#' + id).screenshot({ path: `assets/ui/${id}.png`, omitBackground: true });
const rects = await p.evaluate(() => {
  const o = {};
  for (const el of document.querySelectorAll('[id^=el-]')) {
    const s = el.closest('.screen').getBoundingClientRect(), r = el.getBoundingClientRect();
    o[el.id] = { screen: el.closest('.screen').id, x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  }
  return o;
});
fs.writeFileSync('assets/ui/rects.json', JSON.stringify(rects, null, 1));
await b.close(); srv.close();
console.log('UI exported');
