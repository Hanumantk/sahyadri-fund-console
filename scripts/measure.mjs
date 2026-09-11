// Measures the Home screen against the wireframe grid at 1728 x 1117.
import { chromium } from 'playwright';
import { openPage } from './past-setup.mjs';

const url = process.env.URL ?? 'http://localhost:5173/?state=normal';
const out = process.env.OUT ?? 'screenshots/wireframe-1728.png';

const browser = await chromium.launch();
const page = await openPage(browser, { viewport: { width: 1728, height: 1117 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const box = async (sel, i = 0) => {
  const el = page.locator(sel).nth(i);
  if ((await el.count()) === 0) return null;
  const b = await el.boundingBox();
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
};

const report = {
  'topbar rule (h)': await box('.topbar'),
  'sidebar': await box('.sidebar'),
  'Data group': await box('.tb-data'),
  'Last agent action': await box('.tb-last'),
  'date/time group': await box('.tb-right .topbar-item'),
  'Pause all': await box('.pause-slot .btn'),
  'KPI 1 Fund value': await box('.block', 0),
  'KPI 2 Drawdown': await box('.block', 1),
  'KPI 3 Limits': await box('.block', 2),
  'KPI 4 Cash': await box('.block', 3),
  'agent card 1': await box('.agent-card', 0),
  'agent card 6': await box('.agent-card', 5),
  'Decisions heading': await box('.queue-head'),
  'Monitoring heading': await box('.panel-head'),
  'decision card 1': await box('.dcard', 0),
  'decision card 2': await box('.dcard', 1),
  'chat input': await box('.chat-input'),
  'queue (divider = x+w)': await box('.queue'),
};

const overflow = await page.evaluate(() => ({
  docScrollW: document.documentElement.scrollWidth,
  docClientW: document.documentElement.clientWidth,
  bodyScrollH: document.body.scrollHeight,
}));

// Any element painted in a colour that is not in the monochrome token set.
const colours = await page.evaluate(() => {
  // Allowed colours are whatever the theme tokens resolve to, so this holds in
  // either palette.
  const probe = document.createElement('span');
  document.body.appendChild(probe);
  const allowed = new Set(['rgba(0, 0, 0, 0)']);
  for (const name of ['--bg','--surface','--sidebar-bg','--ink','--text-2','--text-3','--placeholder','--chip','--chip-soft','--chip-hover','--inset','--inset-soft','--track','--fill','--line-strong','--line','--glass','--ink-50','--scrim']) {
    probe.style.color = 'var(' + name + ')';
    allowed.add(getComputedStyle(probe).color);
  }
  probe.remove();
  const bad = [];
  for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
    const s = getComputedStyle(el);
    for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'outlineColor']) {
      const v = s[prop];
      if (!allowed.has(v) && !v.startsWith('rgba(0, 0, 0, 0')) {
        bad.push(`${el.className || el.tagName} ${prop}=${v}`);
      }
    }
  }
  return [...new Set(bad)].slice(0, 20);
});

// Anything whose text is cut off by its own box.
const clipped = await page.evaluate(() => {
  const out = [];
  const sel = '.topbar-item span, .block, .row span, .bar-caption span, .kpi-chip, .headline, .queue-head span, .panel-head h2, .dcard span, .list-row span';
  for (const el of document.querySelectorAll(sel)) {
    if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.className || el.tagName} :: ${el.textContent.trim().slice(0, 44)}`);
  }
  return out;
});

console.log('--- clipped text ---');
console.log(clipped.length ? clipped.join('\n') : 'none');

console.log('--- boxes (x, y, w, h) ---');
for (const [k, v] of Object.entries(report)) console.log(k.padEnd(26), v ? `x=${v.x} y=${v.y} w=${v.w} h=${v.h}` : 'MISSING');
console.log('--- overflow ---', JSON.stringify(overflow));
console.log('--- non-token colours ---');
console.log(colours.length ? colours.join('\n') : 'none');

await page.screenshot({ path: out });
await browser.close();
