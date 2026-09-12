// Every text element, in every view: at least 14px, at least 4.5:1 against its background.
import { chromium } from 'playwright';
import { openPage } from './past-setup.mjs';

const MIN_PX = 14;
const MIN_CONTRAST = 4.5;

const lin = (c) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
const over = (fg, bg) => {
  const a = fg.length > 3 ? fg[3] : 1;
  return [0, 1, 2].map((i) => a * fg[i] + (1 - a) * bg[i]);
};
const ratio = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const VIEWS = [
  ['home normal', 'http://localhost:5173/?state=normal', null],
  ['home bad', 'http://localhost:5173/?state=bad', null],
  ['home calm', 'http://localhost:5173/?state=calm', null],
  ['proposal', 'http://localhost:5173/?state=normal', (p) => p.click('.dcard >> nth=0')],
  ['verdict', 'http://localhost:5173/?state=normal', (p) => p.click('.dcard >> nth=1')],
  ['mismatch', 'http://localhost:5173/?state=normal', (p) => p.click('.dcard >> nth=2')],
  ['late feed', 'http://localhost:5173/?state=bad', (p) => p.click('.dcard >> nth=3')],
  ['agent view', 'http://localhost:5173/?state=normal', (p) => p.click('.agent-card >> nth=4')],
  ['pause dialog', 'http://localhost:5173/?state=normal', (p) => p.click('.pause-slot .btn')],
  ['portfolio', 'http://localhost:5173/portfolio?state=bad', null],
  ['rules', 'http://localhost:5173/rules?state=bad', null],
  ['audit trail', 'http://localhost:5173/audit?record=DEC-0911-01', null],
  ['settings', 'http://localhost:5173/settings', null],
];

const collect = () => {
  /**
   * What a piece of text actually sits on. A tinted background is only partly
   * opaque, so what is beneath still shows through and has to be composited in.
   * Taking the first painted ancestor on its own reports an accent tint as if
   * it were the solid accent, which reads as 1:1 against accent-coloured text.
   */
  const bgUnder = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const m = getComputedStyle(e).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) continue;
      const a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (a === 0) continue;
      layers.push({ r: +m[1], g: +m[2], b: +m[3], a });
      if (a === 1) break;
    }
    let base = { r: 255, g: 255, b: 255 };
    if (layers.length && layers[layers.length - 1].a === 1) base = layers.pop();
    for (let k = layers.length - 1; k >= 0; k--) {
      const l = layers[k];
      base = { r: l.a * l.r + (1 - l.a) * base.r, g: l.a * l.g + (1 - l.a) * base.g, b: l.a * l.b + (1 - l.a) * base.b };
    }
    return `rgb(${Math.round(base.r)}, ${Math.round(base.g)}, ${Math.round(base.b)})`;
  };

  const out = [];
  const walk = (el) => {
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      const s = getComputedStyle(el);
      out.push({ cls: String(el.className || el.tagName), size: parseFloat(s.fontSize), color: s.color, bg: bgUnder(el), text: el.textContent.trim().slice(0, 34) });
    }
    for (const c of el.children) walk(c);
  };
  walk(document.body);
  for (const i of document.querySelectorAll('input')) {
    const s = getComputedStyle(i, '::placeholder');
    // The input itself is transparent, so resolve what shows through it.
    out.push({ cls: 'input::placeholder', size: parseFloat(s.fontSize), color: s.color, bg: bgUnder(i), text: i.placeholder.slice(0, 34) });
  }
  return out;
};

const browser = await chromium.launch();
const small = [];
const low = [];
let total = 0;
let min = Infinity;

for (const [name, url, act] of VIEWS) {
  const page = await openPage(browser, { viewport: { width: 1728, height: 1117 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  if (act) {
    await act(page);
    await page.waitForTimeout(300);
  }
  const rows = await page.evaluate(collect);
  total += rows.length;
  for (const r of rows) {
    min = Math.min(min, r.size);
    if (r.size < MIN_PX) small.push(`${name}: ${r.size}px  ${r.cls} :: ${r.text}`);
    const bg = parse(r.bg).length ? parse(r.bg) : [255, 255, 255];
    const cr = ratio(over(parse(r.color), bg), bg);
    if (cr < MIN_CONTRAST) low.push(`${name}: ${cr.toFixed(2)}:1  ${r.cls} (${r.color} on ${r.bg}) :: ${r.text}`);
  }
  await page.close();
}
await browser.close();

console.log(`checked ${total} text elements across ${VIEWS.length} views`);
console.log(`smallest text anywhere: ${min}px`);
console.log(`--- below ${MIN_PX}px ---`);
console.log(small.length ? [...new Set(small)].join('\n') : 'none');
console.log(`--- contrast below ${MIN_CONTRAST}:1 ---`);
console.log(low.length ? [...new Set(low)].join('\n') : 'none');
process.exit(small.length || low.length ? 1 : 0);
