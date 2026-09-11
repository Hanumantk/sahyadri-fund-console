import { chromium } from 'playwright';

const browser = await chromium.launch();

async function shot(name, { w = 1728, h = 1117, url = 'http://localhost:5173/?state=normal', before } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if (before) await before(page);
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const bad = [];
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
    for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
      const s = getComputedStyle(el);
      for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor']) {
        const v = s[prop];
        if (!allowed.has(v) && !v.startsWith('rgba(0, 0, 0, 0')) bad.push(`${el.className || el.tagName} ${prop}=${v}`);
      }
    }
    const clip = [];
    for (const el of document.querySelectorAll('.topbar-item span, .row span, .bar-caption span, .kpi-chip, .headline, .queue-head span, .dcard span:not(.live), .list-row span, .btn, .chip-btn, .timer')) {
      if (el.scrollWidth > el.clientWidth + 1) clip.push(`${el.className || el.tagName} :: ${el.textContent.trim().slice(0, 40)}`);
    }
    // Text that runs past the box it lives in and into its neighbour. A nowrap
    // line does not report as clipped, so this is the check that catches it.
    const spill = [];
    const HOSTS = '.tb-data, .tb-last, .tb-right, .block, .agent-card, .dcard, .queue, .panel';
    for (const el of document.querySelectorAll('.topbar-item, .block .row, .block .headline, .block .block-sub, .block .block-label, .agent-card > *, .dcard > *')) {
      const host = el.parentElement && el.parentElement.closest(HOSTS);
      if (!host) continue;
      const a = el.getBoundingClientRect();
      const b = host.getBoundingClientRect();
      if (a.right > b.right + 1.5) {
        spill.push(`${String(el.className || el.tagName).split(' ')[0]} by ${Math.round(a.right - b.right)}px :: ${el.textContent.trim().slice(0, 30)}`);
      }
    }
    return {
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      colours: [...new Set(bad)].slice(0, 8),
      clipped: [...new Set(clip)].slice(0, 8),
      spill: [...new Set(spill)].slice(0, 6),
    };
  });
  await page.screenshot({ path: `screenshots/wf-${name}.png` });
  console.log(`${name.padEnd(20)} overflowX=${info.overflowX} colours=${info.colours.length ? info.colours.join(' | ') : 'ok'} clipped=${info.clipped.length ? info.clipped.join(' | ') : 'ok'} spill=${info.spill.length ? info.spill.join(' | ') : 'ok'}`);
  await page.close();
}

await shot('normal-1728');
await shot('calm-1728', { url: 'http://localhost:5173/?state=calm' });
await shot('bad-1728', { url: 'http://localhost:5173/?state=bad' });
await shot('proposal-1728', { before: (p) => p.click('.dcard >> nth=0') });
await shot('agent-1728', { before: (p) => p.click('.agent-card >> nth=4') });
await shot('paused-1728', {
  before: async (p) => {
    await p.click('.pause-slot .btn');
    await p.fill('.dialog input', 'Checking the wireframe pass');
    await p.click('.dialog .btn.primary');
  },
});
await shot('audit-1728', { url: 'http://localhost:5173/audit?record=DEC-0911-01' });
await shot('normal-1440', { w: 1440, h: 900 });
await shot('normal-1280', { w: 1280, h: 800 });

await browser.close();
