// The first visit is gated by the Fund setup flow, which redirects every route
// until it is complete. The checking scripts are looking at the operating
// screens behind it, so they mark setup done before the app boots.
//
// The key is the one src/data/rulebook.ts exports as RULEBOOK_SETUP_STORAGE_KEY.
// If that name changes, these scripts start timing out on a locator that never
// appears, so it is asserted against the source rather than copied by hand.

import { readFileSync } from 'node:fs';

const SOURCE = 'src/data/rulebook.ts';
const match = readFileSync(SOURCE, 'utf8').match(/RULEBOOK_SETUP_STORAGE_KEY\s*=\s*'([^']+)'/);
if (!match) {
  throw new Error(`Could not find RULEBOOK_SETUP_STORAGE_KEY in ${SOURCE}. The setup gate's storage key moved.`);
}
export const SETUP_KEY = match[1];

/** A page that opens past the setup gate, otherwise identical to newPage(). */
export async function openPage(browser, options = {}) {
  const context = await browser.newContext(options);
  await context.addInitScript(
    (key) => {
      try {
        window.localStorage.setItem(key, 'complete');
      } catch {
        /* a browser with site data blocked still renders the gate; nothing to do */
      }
    },
    SETUP_KEY,
  );
  return context.newPage();
}
