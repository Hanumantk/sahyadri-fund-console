// Every text element, in every view: at least 14px, at least 4.5:1 against its background.
import { chromium } from 'playwright';

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
  ['audit trail', 'http://localhost:5173/audit?record=DEC-0911-01', null],
  ['stub page', 'http://localhost:5173/rules', null],
];

const collect = () => {
  const out = [];
  const walk = (el) => {
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      const s = getComputedStyle(el);
      let e = el;
      let bg = 'rgb(255, 255, 255)';
      while (e) {
        const c = getComputedStyle(e).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
          bg = c;
          break;
        }
        e = e.parentElement;
      }
      out.push({ cls: String(el.className || el.tagName), size: parseFloat(s.fontSize), color: s.color, bg, text: el.textContent.trim().slice(0, 34) });
    }
    for (const c of el.children) walk(c);
  };
  walk(document.body);
  for (const i of document.querySelectorAll('input')) {
    const s = getComputedStyle(i, '::placeholder');
    // The input itself is transparent, so find the first painted ancestor.
    let e = i;
    let bg = 'rgb(255, 255, 255)';
    while (e) {
      const c = getComputedStyle(e).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
        bg = c;
        break;
      }
      e = e.parentElement;
    }
    out.push({ cls: 'input::placeholder', size: parseFloat(s.fontSize), color: s.color, bg, text: i.placeholder.slice(0, 34) });
  }
  return out;
};

const browser = await chromium.launch();
const small = [];
const low = [];
let total = 0;
let min = Infinity;

for (const [name, url, act] of VIEWS) {
  const page = await browser.newPage({ viewport: { width: 1728, height: 1117 } });
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
