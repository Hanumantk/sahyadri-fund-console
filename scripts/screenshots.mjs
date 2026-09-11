// Walks the prototype at 1440×900 and saves screenshots for the deck and for visual checks.
// Usage: npm run dev (in another terminal), then: node scripts/screenshots.mjs [outDir]

import { chromium } from 'playwright';
import { openPage } from './past-setup.mjs';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5173';
const out = process.argv[2] ?? 'screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await openPage(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const ctx = page.context();
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.error('CONSOLE', m.text());
});

async function open(path) {
  await page.goto(`${base}${path}`);
  await page.waitForSelector('.shell');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}
async function shot(name) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', name);
}
async function scrollPanelTo(selector) {
  await page.evaluate((sel) => {
    const b = document.querySelector('.panel-body');
    const d = document.querySelector(sel);
    if (b && d) b.scrollTop = d.offsetTop - b.offsetTop - 8;
  }, selector);
}

// 1. The three states, nothing selected.
for (const state of ['normal', 'calm', 'bad']) {
  await open(`/?state=${state}`);
  await shot(`01-home-${state}`);
}

// 1b. Bad state with the Infosys proposal open, then the late feed and the broken limit.
await page.click('.dcard >> nth=0');
await shot('01-bad-proposal-open');
await page.click('.dcard >> nth=3');
await shot('01-bad-feed-late');
await page.click('.dcard >> nth=4');
await shot('01-bad-limit-over');

// 1c. Keyboard: arrows move through the queue, Enter opens, Escape clears.
await open('/?state=normal');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
const kbTitle = await page.textContent('.panel-head h2');
if (kbTitle !== 'Bull vs bear · HDFC Bank') throw new Error(`Keyboard open failed: ${kbTitle}`);
await page.keyboard.press('Escape');
const escTitle = await page.textContent('.panel-head h2');
if (escTitle !== 'Monitoring Agent') throw new Error(`Escape clear failed: ${escTitle}`);
console.log('keyboard ok');

// 2. Normal state, Infosys proposal: Layer 2, take less, full trail.
await open('/?state=normal');
await page.click('.dcard >> nth=0');
await shot('02-proposal-top');
await scrollPanelTo('.decide');
await page.click('.decide .buttons button:has-text("Take less")');
await shot('03-proposal-take-less-preview');
await page.fill('.decide .reason input', 'Growth disputed until the Q2 results; holding half.');
await page.click('.decide .btn.primary');
await shot('04-proposal-taken-less');
await page.click('button:has-text("See full trail")');
await scrollPanelTo('.trail');
await shot('05-proposal-full-trail');

// 3. HDFC Bank verdict: go halfway.
await page.click('.dcard >> nth=0');
await shot('06-verdict-top');
await scrollPanelTo('.decide');
await page.click('.decide .buttons button:has-text("Go halfway")');
await page.fill('.decide .reason input', 'Both wait on the same deposit data; halfway until then.');
await shot('07-verdict-halfway-preview');
await page.click('.decide .btn.primary');
await shot('08-verdict-decided');

// 4. Axis Bank mismatch: accept the broker's record.
await page.click('.dcard >> nth=0');
await shot('09-break-top');
await scrollPanelTo('.decide');
await page.click(".decide .buttons button:has-text(\"Accept broker's record\")");
await page.fill('.decide .reason input', 'Contract note is the primary record; our fill count was stale.');
await page.click('.decide .btn.primary');
await shot('10-break-accepted-nothing-needs-you');

// 5. An agent's Layer 2, then its dial.
await page.click('.agent-card >> nth=4');
await shot('11-agent-execution');
await scrollPanelTo('.dial');
await shot('11b-agent-execution-dial');

// 6. Chat on a decision.
await open('/?state=normal');
await page.click('.dcard >> nth=0');
await page.click('.chat-input .tips');
await page.click('.chat-tips button >> nth=1');
await shot('12-chat-disputed-question');

// 7. Pause all agents.
await page.click('.topbar button:has-text("Pause all agents")');
await shot('13-pause-all-dialog');
await page.fill('.dialog input', 'Checking a data problem before the afternoon session.');
await page.click('.dialog button:has-text("Pause")');
await shot('14-all-paused');
const docW = await page.evaluate(() => document.documentElement.scrollWidth);
if (docW > 1440) throw new Error(`Horizontal overflow after pause: ${docW}`);

// 8. Expiry: fast-forward the clock 13 minutes so the Infosys proposal expires.
await page.clock.install();
await open('/?state=normal');
await page.clock.fastForward('13:00');
await page.waitForTimeout(1500);
await shot('15-infosys-expired');

// 9. Audit trail filtered to a record.
await open('/audit?record=DEC-0911-01');
await shot('16-audit-filtered');

// 10. Minimum width.
await page.setViewportSize({ width: 1280, height: 900 });
await open('/?state=normal');
await page.click('.dcard >> nth=0');
await shot('17-home-1280');
const docW2 = await page.evaluate(() => document.documentElement.scrollWidth);
if (docW2 > 1280) throw new Error(`Horizontal overflow at 1280: ${docW2}`);
await open('/?state=bad');
await shot('18-home-bad-1280');

await browser.close();
