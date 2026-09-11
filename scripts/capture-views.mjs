// Capture every view in every state, twice: once as rendered text (what a reader
// sees) and once as a DOM skeleton with text masked (what the design is). Run it
// before and after a data change and diff the two directories.
//
//   node scripts/capture-views.mjs baseline
//   node scripts/capture-views.mjs after
//
// The clock ticks, so anything derived from "now" is masked out of the text dump
// before it is written. That keeps the diff to real changes.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const tag = process.argv[2] ?? 'baseline';
const out = join('captures', tag);
mkdirSync(out, { recursive: true });

const STATES = ['normal', 'calm', 'bad'];
const base = 'http://localhost:5173';

// Relative times and live clocks move on their own. Replace them so the diff
// shows only numbers that actually changed.
function stripVolatile(s) {
  return s
    .replace(/\d+ sec ago/g, '<ago>')
    .replace(/\d+ min ago/g, '<ago>')
    .replace(/\d+ h \d+ min ago/g, '<ago>')
    .replace(/\d+ sec left/g, '<left>')
    .replace(/\d+ min left/g, '<left>')
    .replace(/\d+ h \d+ min left/g, '<left>')
    .replace(/\b\d{2}:\d{2}:\d{2}\b(?= IST)/g, '<clock>')
    .replace(/checked \d{2}:\d{2}/g, 'checked <clock>')
    .replace(/\b\d+ sec\b/g, '<age>')
    .replace(/\b\d+ min\b(?! late)/g, '<age>');
}

const browser = await chromium.launch();

async function capture(page, name) {
  await page.waitForTimeout(250);
  const text = await page.evaluate(() => {
    const root = document.querySelector('#root') ?? document.body;
    return root.innerText;
  });
  // DOM skeleton: tag + class only, no text, no attributes that carry data.
  const skeleton = await page.evaluate(() => {
    const walk = (el, depth) => {
      const cls = typeof el.className === 'string' ? el.className.trim() : '';
      const line = `${'  '.repeat(depth)}${el.tagName.toLowerCase()}${cls ? '.' + cls.split(/\s+/).join('.') : ''}`;
      const kids = [...el.children].map((c) => walk(c, depth + 1));
      return [line, ...kids].join('\n');
    };
    return walk(document.querySelector('#root') ?? document.body, 0);
  });
  writeFileSync(join(out, `${name}.txt`), stripVolatile(text), 'utf8');
  writeFileSync(join(out, `${name}.dom.txt`), skeleton, 'utf8');
  process.stdout.write(`  ${name}\n`);
}

for (const state of STATES) {
  console.log(state);
  const page = await browser.newPage({ viewport: { width: 1728, height: 1117 } });
  await page.goto(`${base}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  await capture(page, `${state}-home`);

  // Every agent card in the row.
  const agentCount = await page.locator('.agent-card').count();
  for (let i = 0; i < agentCount; i++) {
    await page.locator('.agent-card').nth(i).click();
    const title = (await page.locator('.panel-head h2').innerText()).replace(/\W+/g, '-').toLowerCase();
    await capture(page, `${state}-agent-${i}-${title}`);
    await page.keyboard.press('Escape');
  }

  // Every open decision.
  const decCount = await page.locator('.dcard').count();
  for (let i = 0; i < decCount; i++) {
    await page.locator('.dcard').nth(i).click();
    const title = (await page.locator('.panel-head h2').innerText()).replace(/\W+/g, '-').toLowerCase();
    await capture(page, `${state}-decision-${i}-${title}`);
    await page.keyboard.press('Escape');
  }

  // Audit trail.
  await page.goto(`${base}/audit?state=${state}`, { waitUntil: 'networkidle' });
  await capture(page, `${state}-audit`);
  await page.goto(`${base}/audit?state=${state}&record=DEC-0911-01`, { waitUntil: 'networkidle' });
  await capture(page, `${state}-audit-filtered`);

  await page.close();
}

await browser.close();
console.log(`\nwrote ${out}`);
