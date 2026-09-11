# Sahyadri India Equity Fund · supervision console

Clickable prototype for the D. E. Shaw design take-home. A desktop web app where AI agents research and trade a long-only Indian equity fund, and people keep the final say on anything outside the agents' limits.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. The layout is drawn for 1728×1117, the size of the Figma frame, and holds down to 1280 (the sidebar collapses to an icon rail below 1440).

- `npm test` runs the invariant tests against all three scenario states.
- `npm run build` type-checks and builds to `dist/`.
- `npm run shots` walks every flow with Playwright at 1440×900 and saves PNGs to `screenshots/` (run `npm run dev` first; needs `npx playwright install chromium` once).
- `npm run measure` prints every key box at 1728×1117 against the wireframe grid, and flags clipped text or any colour outside the token set.
- `npm run wireframe` does the same across the three states, the open proposal, an agent view, the paused top bar, Audit trail and Portfolio, at 1728, 1440 and 1280.

## Deploy

### GitHub Pages

`.github/workflows/deploy.yml` builds and publishes on every push to `main`. It runs
`npm test` first, so a broken invariant or a moved element never reaches the site.

To turn it on once: **Settings → Pages → Source → GitHub Actions**. Nothing else to
configure — the workflow reads the repo name for the base path, so renaming the repo
doesn't break it.

Pages serves static files, so the workflow copies `index.html` to `404.html`. That is
what makes a deep link like `/audit?record=DEC-0911-01` resolve: Pages falls back to
`404.html`, the app loads, and the router picks up the path.

### Vercel

```bash
npx vercel
```

`vercel.json` rewrites every path to `index.html` for the same reason. Build command
`npm run build`, output `dist`.

### Anywhere else

`npm run build` writes a static `dist/`. Set `VITE_BASE=/sub-path/` if it is served
from anywhere other than a domain root, and point unknown paths at `index.html`.

## Scenario states

Add `?state=normal`, `?state=calm` or `?state=bad` to the URL. Add `?dev=1` (or press Ctrl+Shift+D) to show the small state switcher; it stays hidden otherwise so screenshots are clean.

The demo clock starts at Fri 11 Sep 2026 10:05:00 IST on every load and runs in real time. The Infosys proposal expires at 10:17, the HDFC Bank verdict at 10:23.

## Where things live

| File | What it holds |
|---|---|
| `src/data/scenario.ts` | Raw facts only: fund, limits, people, agents, feeds, holdings, sources, decisions, the event log |
| `src/data/derive.ts` | Every figure the UI shows, computed from the facts and the log |
| `src/data/invariants.test.ts` | The checks that keep the numbers consistent in all three states |
| `src/state/actions.ts` | Deciding, expiring, pausing: pure functions on the runtime |
| `src/state/store.tsx` | React store, demo clock tick, selection |
| `src/state/chat.ts` | Scripted Monitoring Agent answers, per selection |
| `src/components/` | Shell, Home sections, the Monitoring Agent panel views |
| `src/pages/` | Home, Audit trail, and the Portfolio, Rules and Settings stubs |
| `PLAN.md` | Component list, data model, every conflict found between the inputs, assumptions |

Components never contain a typed number. Research houses, news outlets and data vendors are invented; listed companies are real.
