# Plan: Sahyadri India Equity Fund · app shell and Home page

Inputs read: `AI fund.png` (wireframe), the Figma frame `MacBook Pro 16" - 1` (1728×1117, read through the Figma desktop MCP), `files/project-context.md`, `files/dshaw-fund-app/.../CLAUDE.md` and the three HTML mockups. The two other markdown files under `files/` are about an unrelated internship-coordinator role and were skipped.

## Where the app lives

The Vite project is built at the root of this folder (`AI D shaw/`), next to the wireframe and `files/`. `npm run dev` serves it, `npm test` runs the invariants, `vercel` deploys it (there is a `vercel.json` with the SPA rewrite).

## Layout, scaled from the Figma frame

The Figma frame is 1728 wide. The build target is 1440×900 (minimum 1280), so every dimension is scaled by about 0.83 and rounded to the 4px grid.

| Region | Figma | Build |
|---|---|---|
| Sidebar | 240 wide | 200 wide |
| Top bar | 57 high | 48 high |
| Content left padding | 32 | 24 |
| Layer 1 blocks | 3 columns, 350 wide, headline 28px | 4 columns (value, drawdown, limits, cash), headline 24px |
| Agent cards | 6 × 224×123, gap 16 | 6 equal columns, gap 12, about 104 high |
| Decisions column | 432 wide, divider at 736 | 400 wide (380 at 1280), 1px divider |
| Monitoring panel | from x=768, chat docked at bottom | fills the rest, chat docked at bottom |
| Page background | #FCFCFB | #FAFAFA (prompt colour system) |

Type: DM Sans from Google Fonts, weights 400 and 500, 600 only on the four headline numbers. `font-feature-settings: "tnum"` on `body`, so every number is tabular.

## Component list

```
src/
  main.tsx, App.tsx                 router, providers
  styles/tokens.css, base.css       colour system, type, spacing
  data/scenario.ts                  raw facts only (fund, limits, people, agents, feeds, holdings, sources, decisions, event log)
  data/derive.ts                    every figure the UI shows
  data/format.ts                    ₹ cr / lakh, %, signed, IST times, relative times
  data/clock.ts                     demo clock (starts Fri 11 Sep 2026 10:05:00 IST, ticks in real time)
  data/invariants.test.ts           Vitest, runs against normal, calm and bad
  state/store.tsx                   runtime state + reducer (decisions, appended events, holdings, agent status, selection, chat)
  state/chat.ts                     scripted answers per selection
  components/shell/  Sidebar, TopBar, PauseAllDialog, DevToggle
  components/home/   NeedsYouLine, Layer1Strip (FundValueBlock, DrawdownBlock, LimitsBlock, CashBlock),
                     AgentRow, AgentCard, DecisionsColumn, DecisionCard, ClosedToday
  components/panel/  MonitorPanel, MonitorHome, ProposalView, VerdictView, BreakView, AttentionView,
                     FullTrail, AgentView, Chat
  components/ui/     Badge, Chip, LimitBar, Button, ReasonField, RecordLink
  pages/             Home, Portfolio (stub), Rules (stub), AuditTrail (filtered list), Settings (stub)
```

## Data model

- `scenario.ts` holds only raw facts. Money is stored in rupees as plain numbers. Holdings carry price, share count, sector, the agent and date that bought them, days to sell, and dependency clusters. Per-state overrides change only share counts (calm) or prices (bad).
- The event log is one literal array. Each event has `id`, `at` (ISO with +05:30), `actor`, `actorKind` (agent | person | system), `type`, `company`, `text`, `related[]`, an optional `count` (for batched source reads) and `amount`, and an optional `states[]` that limits it to some scenario states (default: all three).
- `derive.ts` exposes pure functions: `resolveScenario(state)`, `deriveFund(...)` (values, per-unit value, day change, gap to Nifty, drawdown, room to pause, cash and its age, sector and company usage, headroom in rupees, limits summary), `deriveAgentCounts(...)` (every counter from the log), `derivePipeline(...)`, `deriveDecisions(...)` (percent of fund, post-trade sector percentages, previews per button), `deriveNeedsYou(...)`, `deriveTimers(...)`, `lastAgentAction(...)`.
- Components never contain a typed number. The store holds runtime changes (a decision, an expiry, a pause) and `derive` is re-run on every render.

## Counts, and how the pipeline adds up (normal state)

| Agent | Counter line | From the log |
|---|---|---|
| Research | 6 ideas · 2 dropped · 48 sources | 6 `idea_found`, 2 `idea_dropped`, Σ`count` of `sources_read` = 48 |
| Portfolio | 4 sized · 1 cut down · 3 trims | 4 `sized`, 1 `cut_down`, 3 `trim` |
| Risk | 7 checked · 5 cleared · 1 sent to you · 1 blocked | 7 = 4 sized + 3 trims; 5 + 1 + 1 = 7 |
| Compliance | 7 checked · 1 blocked | Vardhan Distilleries (invented) on the banned list |
| Execution | 14 buys · 3 sells · ₹12.6 cr traded | 17 `fill` events; 4 orders placed = 4 auto-cleared + 0 approved |
| Operations | 17 settled · 1 mismatch | 17 `settled` (10 Sep trades, T+1), 1 `break_raised` (BRK-0910-03) |

Auto-cleared = 7 checked − 1 sent to you (Infosys) − 1 Risk block (a Reliance add that would reach 10.2%) − 1 Compliance block = 4 (a Bharti Airtel add plus 3 trims). After the reviewer takes the Infosys proposal, Execution places a 5th order and the sum becomes 4 + 1.

The HDFC Bank item is escalated by the Research Agent because its Bull and Bear sub-agents split, not by the Risk Agent, so it does not appear in Risk's "sent to you". The idea was found after yesterday's close, so it is outside today's "ideas found" count and the sum "found − dropped = sized" holds exactly.

Needs-you count = open proposals and verdicts + open mismatches + broken limits + late feeds. Normal: 2 + 1 + 0 + 0 = 3. Calm: 0. Bad: 2 + 1 + 1 + 1 = 5.

## Conflicts found between the inputs

Content and behaviour: the prompt wins. Visual layout: wireframe and Figma win.

1. Decision cards in the wireframe say "Scout" and "Allocator" → Research Agent and Portfolio Agent.
2. Wireframe uses ET and "Market opened at 09:30" → IST, NSE 09:15–15:30.
3. "Fund value (NAV)" → "Fund value · live estimate", with "Official ₹125.04/unit · 10 Sep" as a second line.
4. "+126.10" → "₹126.10". "7 Checker" → "7 checked". "12.6 cr" → "₹12.6 cr". "Operation Agent" → "Operations Agent". "2 above 90% of this limit" → "of their limit".
5. Timer "12:30 left" styled like the Review button → plain text "12 min left", not a button, amber under 5 min.
6. Four identical Infosys cards → three distinct items (proposal, bull vs bear, records mismatch), sorted by deadline.
7. Wireframe has no needs-you sentence, no cash block, no Rules nav item, no Pause all agents control, no Home badge → all added per the prompt.
8. "Now running · Market opened at 09:30" can never become a warning → relative time since the last agent action, amber after 10 min of silence in market hours.
9. Figma type uses Bold and SemiBold for labels and titles → prompt restricts weights to 400/500 (+600 for the largest numbers). Labels are 500.
10. Figma nav is Helvetica Neue Light 20px → DM Sans 400, 15px at the 1440 scale.
11. Figma colours (#FCFCFB page, #4E4E4E text, #DDD borders) → the prompt's colour system (#FAFAFA, #1A1A1A, #5F6368, #E3E3E3).
12. Wireframe Research "6 ideas · 2 dropped" and Portfolio "6 buys" cannot both hold under "found − dropped = sized" → Portfolio shows "4 sized". Wireframe Risk "9 proposals · 7 cleared · 2 sent to you" → "7 checked · 5 cleared · 1 sent to you · 1 blocked" (see the pipeline above; the prompt requires a Risk block).
13. Context doc's Infosys story (v1 ₹8 cr = 3.2%, IT 22% → 24%) → prompt's IT about 15% → 17%. Kept the v1 ₹8.0 cr → v2 ₹5.0 cr version history; the cut is a Portfolio Agent sizing rule, not a view on the disputed growth number.
14. Context doc: Monitoring Agent watches 12 feeds → 7.
15. Context doc: the Operations mismatch is ₹20 lakh on an HDFC Bank sale → ₹17.6 lakh on Axis Bank (1,500 shares at ₹1,173.30, the 10 Sep price).
16. Context doc: every decision needs a reason → prompt: only Take less and Decline on the Infosys proposal. Followed the prompt there.
17. Figma frame is 1728×1117 → built for 1440×900, minimum 1280, proportions kept.
18. Context doc labels sources "Original / AI-generated" → prompt: "Human-written / AI-written".

## Assumptions made where the prompt is silent (say if any should change)

- **Bad state numbers.** Drawdown −6.9% means ₹123.26 per unit, so the fund value is ₹243.0 cr, not ₹248.6 cr. Yesterday's official value in the bad state is ₹124.10/unit (the fall came over several days), today is −0.7% against Nifty 50 −1.10%, so the chip reads "0.42 pts ahead of market". Bank prices are up 10% and the rest down about 7% versus the normal state, which is what puts Banking at 26.0% without a trade.
- **Calm state holdings.** Reliance is trimmed to 7.5% and Banking to 20.0%, with the difference spread over L&T, HUL, Sun Pharma, UltraTech, Bharti Airtel and Maruti, so nothing is near a limit and the fund value is still ₹248.6 cr. The Infosys idea is dropped by the Research Agent ("Bull and Bear could not agree a size; parked until Q2 results"), the HDFC Bank debate never happens, and there is no mismatch.
- **Reasons.** The HDFC Bank choices and the mismatch actions each require a one-line reason (they change the books or bind someone). Take it on Infosys does not.
- **Closed today** also lists the two agent blocks (Risk and Compliance) in grey, so the blocked counts are visible somewhere and the section is not empty on first load.
- **Bad-state extras in the queue.** The late price feed and the broken Banking limit appear as two grey cards at the end of the queue (no deadline), each with a fixed Layer 2 and no decision buttons, so the "5 things need you" count matches what is on screen.
- **Pause all agents** pauses the six working agents and logs one event each. The Monitoring Agent keeps watching (the confirmation says so) and a "Resume all agents" control appears afterwards so a reviewer can continue.
- **Chat.** Free text is matched by keyword against the scripted answers for the current selection; anything else gets a short "I can answer from the record for this item" reply with the three suggested questions.
- **Dev toggle** is visible when the URL has `?state=` or `?dev=1`.
- **Settings** in the sidebar opens a one-line stub page, so there is no dead link.
- **Feed "checked" time** in the top bar comes from the demo clock (the Monitoring Agent checks every 30 seconds). Every other counter comes from the log.
- **Demo clock** starts at 10:05:00 IST and runs at real speed; the Infosys timer shows 12 min at load, HDFC Bank 18 min. Nothing is simulated beyond the timers, so "Last agent action" will drift and turn amber after 10 minutes if nobody acts, which is the design working.

## Status (end of session, 11 Sep 2026)

Built and verified: app shell, Home page (Layer 1 strip, agent row, decisions queue, Monitoring Agent panel with all Layer 2 views, full trail, scripted chat), the three scenario states, timers and expiry, deciding all three items, pause all agents, the agent dial, keyboard navigation, and the Audit trail filtered by `?record=`, `?agent=` or `?company=`. Portfolio, Rules and Settings are one-line stubs.

Checks: `npm test` (87 invariant tests, all three states), `npm run build`, and `npm run shots` (Playwright walkthrough at 1440×900 and 1280×900 with keyboard and overflow assertions). Screenshots of every step are in `screenshots/`.

Not done: nothing from the prompt was skipped. The session ran unattended, so the plan checkpoint and the open questions above were resolved with the stated assumptions rather than a reply. Say which to change.

## Wireframe restyle (second pass)

The layout, grid, spacing and visual language were rebuilt against Figma node `1:3`
(`MacBook Pro 16" - 1`, 1728 × 1117). Data, state, clocks, handlers, routes and agent
logic are unchanged: `npm test` still runs the same 87 invariants, and `npm run shots`
still walks every flow.

**What the restyle changed**

- One monochrome palette in `src/styles/tokens.css`. The old red, amber, blue and green
  names still exist but every one of them now resolves to ink, a grey text, or a flat
  grey fill, so no hue can leak back in from an older rule.
- A 12-column grid with 16px gutters and 32px margins inside the main content. At 1728
  that is a 104px column on a 120px pitch. KPI blocks span 4 columns each, agent cards 2,
  the decisions panel 1–4 and the Monitoring panel 5–12 with the divider on the right
  edge of column 4.
- Sidebar 240px (84px icon rail below 1440, toggled from the top bar), top bar 57px
  spanning the full window width.
- The chat sits across the full width of the Monitoring panel, 52px tall, with its bottom
  edge on the page's bottom margin line rather than floating above it.
- Cards are outline only: 1px ink, 10px radius, page-coloured fill, no shadow or tint.
- Type is DM Sans throughout with the wireframe's weights, except sidebar nav labels,
  which are Helvetica Neue Light with a Helvetica/Arial fallback.

**Checks**

- `npm run measure` prints every key box at 1728 × 1117 and fails loudly if text is
  clipped or a non-token colour is painted.
- `npm run wireframe` walks the three states plus the open proposal, agent view, paused
  top bar, Audit trail and Portfolio at 1728, 1440 and 1280, asserting the same two things.

**Every figure and line of copy is the one the previous version showed.** The first
restyle pass trimmed a few to make the top bar and the KPI blocks fit. They are all back:
the day-change percentage beside the rupee change, the official value on its own sub-line,
the full "set on Rules" and "nothing is forced to sell" limit lines, seconds on the
top-bar clock, the market-hours tail, the name of whoever paused the agents, who stopped
an agent and when, the "updated" word on each feed, and the "12 min old" stamp with the
greyed headline when a feed is late. What the restyle brief asked to remove is still
removed: the routine as-of stamp, the Cash block on Home, the needs-you headline row, the
agent-row labels, the inline limit bars.

**Vertical spacing, tightened once the fourth block went back in**

The wireframe's rhythm was measured with three KPI blocks and one sub-line. Carrying the
previous version's copy and a fourth block made the strip taller, so the gaps that carry
no information were trimmed and the space went to the split. Nothing inside a line of text
moved: the 8px detail-row rhythm, the 4px label-to-value and value-to-sub gaps, and the
agent and decision card anatomy are untouched.

| Gap | Wireframe | Now |
|---|---|---|
| Page top to the KPI row | 24 | 12 |
| Sub-line to the rule | 26 | 12 |
| Rule to the detail rows | 15 | 10 |
| Between detail rows | 8 | 6 |
| Detail rows to the extra | 19 | 10 |
| Drawdown bar to its scale | 10 | 8 |
| KPI row to the agent row | 36 | 12 |
| Agent card padding | 16/20/17 | 12/14 |
| Agent row to the split | 32 | 14 |
| Decision card padding | 17/20/20 | 10/12 |
| Between decision cards | 16 | 10 |
| Panel section margin | 24 | 16 |
| Footer band | 36 | 28 |

At 1728 that moves the section headings from 513 to 422 and gives the split 667px instead
of the original 568, even though the 14px floor made every card taller. Decisions and the
Monitoring Agent are now the two dominant areas of the screen.

## Type scale

14px is the floor for the whole interface. Nothing is smaller anywhere: no captions,
timestamps, chips, badges, provenance lines, table headers or placeholders. Every
small-step token in `tokens.css` resolves to it, so the rule holds for the inline styles in
the panel views too.

Above the floor, size carries priority. How much a thing matters decides how big it is.

| Size | Token | Role | Where |
|---|---|---|---|
| 28 | `--fs-hero` | The fund's state | The four KPI values |
| 24 | `--fs-head` | Where you are | Decisions, Monitoring Agent, page titles |
| 20 | `--fs-ask` | What needs you | The decision itself, on the card and in the review panel |
| 18 | `--fs-title` | Named subjects and consequences | Agent names, block labels, preview values, source values |
| 16 | `--fs-em` | Urgency and emphasis | Warnings, deadlines, the open count, section titles, nav |
| 14 | `--fs-body` | Body and metadata | Everything else |

The 16px tier is the one that carries alarm, since the palette has no colour to spend on
it: a warning chip, a countdown and "3 open · first expires 10:17" all sit a step above the
body text around them. The 20px tier is deliberately larger than an agent name, because the
thing waiting on a person outranks the thing running by itself.

The same tiers run through every screen and flow, not just Home:

| View | 20 | 18 | 16 |
|---|---|---|---|
| Proposal | the ask | the amounts each source implies | why it needs you, the claim, the deadline, section titles |
| Bull vs bear | the ask | preview outcomes | the disputed assumption, each side's position |
| Records mismatch | the ask | — | why it needs you, the difference |
| Agent | what it is doing now | the money dial's value | why it stopped, its counters |
| Pause all dialog | the heading | — | the control that commits it |
| Audit trail | the search box (18) | — | column headers, what happened, company |

On the Audit trail the search box is the exception to the shared input shape. It is the one
control on that page you are meant to reach for, so it is 480x52 instead of 320x36, set at
18px, given a magnifier and a full pill radius so it reads as a search field on sight, and
filled with the sidebar's `--sidebar-bg` rather than `--surface` so it reads as a well cut
into the page rather than another card. Down each row the record itself carries the weight:
what happened is 16px at `--ink` with 42% of the table width, the company is 16px 600, and
the time, type, record ID and related links stay at 14px in `--text-3`. Row padding went
from 10px to 15px, so entries sit 1.5x further apart and each one reads as its own record.

Applying it exposed two overlaps at 1440 that the old checks missed, because a nowrap line
does not report as clipped: the top bar's middle group ran into the date, and the Limits
values ran into the Cash block. The top bar now gives the middle group back the columns the
market-hours tail was using below 1728, and a detail value that will not fit beside its
label drops under it rather than into the neighbouring block. `npm run wireframe` now
checks for that spill directly.

Within a size, weight and grey level separate tiers:

| Tier | Colour | Contrast on the page | Weight | Used for |
|---|---|---|---|---|
| Primary | `--ink` #000000 | 20.6:1 | 600-700 | Values, card titles, section headings |
| Secondary | `--text-2` #4E4E4E | 8.1:1 | 500-700 | Block labels, detail values, status |
| Tertiary | `--text-3` rgba(94,94,94,0.93) | 5.3:1 | 400-500 | Row labels, sub-lines, agent meta |
| Quaternary | `--placeholder` #6E6E6E | 5.0:1 | 400 | Provenance, feed sub-lines, footer, placeholders |

The wireframe's `--placeholder` #9E9E9E is 2.6:1 on the page and fails AA, so it was
darkened to #6E6E6E. Two hover states put page-white on `--fill` at 3.4:1; they now darken
the chip and keep ink text. Opacity below about 0.9 on these greys drops under 4.5:1, so
the tertiary tier uses weight rather than transparency, and the palette stays monochrome
as the restyle brief requires, so no accent hue was introduced.

`npm run a11y` walks eleven views, measures every text element's computed size and its
contrast against the first painted ancestor, and exits non-zero on any failure. It last
checked 1,648 text elements with no size or contrast failure.

## Dark mode

Dark is the default palette, built on Claude's: a warm near-black canvas rather than a
blue-grey one, a card surface one step up from it, a sidebar one step down, warm off-white
text, and hairlines quiet enough to separate without drawing the eye. The screen stays
monochrome.

| Role | Dark | Light |
|---|---|---|
| Canvas | #262624 | #FCFCFB |
| Card surface | #2F2F2C | #FCFCFB |
| Sidebar | #1F1F1D | #FCFCFB |
| Primary text | #FAF9F5, 14.4:1 | #000000, 20.6:1 |
| Secondary | #C9C7BC, 9.0:1 | #4E4E4E, 8.1:1 |
| Tertiary | #A3A099, 5.9:1 | rgba(94,94,94,0.93), 5.3:1 |
| Quaternary | #9D9B95, 5.5:1 | #6E6E6E, 5.0:1 |
| Primary chip | #3E3D39 | #DDDDDD |
| Secondary chip | #34332F | #EDEDED |
| Outlines | white 22% | black 26% |
| Rules | white 10% | black 13% |

The light palette is kept under a `data-theme="light"` attribute on the `html` element, so
switching back is one attribute. `color-scheme` follows the theme, so form controls,
scrollbars and the overscroll area render dark too. Hover now lifts a chip rather than
darkening it, which works in both palettes. Every colour check reads the live token values
instead of a hard-coded list, so both palettes pass the same sweep.

Two inputs were inheriting the browser's own dark styling: the pause-reason field in the
agent view had a class the stylesheet never matched, and the budget slider had no
background of its own. Both are on the theme now.

## Lines, nav and the footer

- **Lines are no longer ink.** Two tokens carry them: `--line-strong` rgba(0,0,0,0.26) for
  card, dialog and input outlines, and `--line` rgba(0,0,0,0.13) for section rules, the
  block rules, the split divider, the top-bar rule and table hairlines. Nothing on screen
  is a full-strength black line any more. Selection still uses an ink ring, so a chosen
  card reads clearly against the softer resting state. These are below the 3:1 that WCAG
  1.4.11 asks of essential non-text boundaries; that is the trade for the quieter look, and
  no text contrast is affected.
- **The sidebar nav is back to its original compact form**: DM Sans 15px medium instead of
  Helvetica Neue Light 20px, 18px icons instead of 20px, 8/12 padding on a 2px gap instead
  of a 62px pitch. The brand and the user line get hairline rules again. The count badge
  stays a plain number, since the palette has no room for a coloured pill.
- **The four KPI blocks are capped at 318px inside their 344px cells**, so about 42px of
  air separates them instead of the 16px gutter. Their left edges stay on the column lines.
- **The KPI blocks lost their fourth row.** The market-gap chip and the drawdown bar sat
  in a grid row that all four blocks reserved, so it cost every block height. The gap now
  rides on the Fund detail row, the drawdown bar sits inline inside the pause row between
  its label and value, and the room left moved onto the sub-line, which was already two
  lines in the tallest block. Nothing was dropped and the strip is 44px shorter, 166 rather
  than 210.
- **Decision cards carry the ask, its warnings and the two controls, nothing else.** The
  kind eyebrow with its needs-you line and the proposed-by provenance now appear only when
  the item is opened for review, where they already were. The card has no minimum height
  any more, so it fits its content; all three open items plus Closed today fit at 1117.
- **The collapse control is a stroke icon.** The 24px drawn rectangle from the Figma was
  bigger and heavier than every other glyph, so it is now an 18px panel icon at 1.5 stroke,
  matching the nav and the top-bar chevrons.
- **The chat floats.** It is positioned over the foot of the Monitoring panel rather than
  sitting in a reserved band, so the panel body scrolls the full height behind it. Its
  ground is the page colour at 82 per cent with a 12px backdrop blur, so it reads as
  floating without the text behind it colliding with the placeholder. A fully transparent
  box was tried first and was unreadable over scrolled content.
- **Suggested questions moved behind an icon.** The three chips no longer sit above the
  input. A bulb button inside the box opens them as a small menu; picking one asks it and
  closes the menu, and a click elsewhere or Escape closes it without clearing the
  selection.
- **The footer disclaimer is removed.** The original brief asked for an "Illustrative data"
  note in the footer; there is now nowhere on screen that says the research houses, news
  outlets and data vendors are invented. Worth putting back somewhere before this is shown.

**Deviations from the wireframe spec, and why**

1. **The KPI row is 241px tall, not 220, so everything below it sits 19px lower than the
   wireframe rhythm**: agents at 358 not 339, headings at 513 not 494, first card at 549
   not 530. The fund block needs two sub-lines to carry both the day change and the
   official value, and a shared minimum height on the block heads keeps the three rules on
   one line in every state. Horizontal positions, card sizes and the chat input are
   unaffected.
2. **Decision cards are 161px tall, not 155.** Line heights in the browser do not match
   the absolute boxes in Figma. The anatomy and all the gaps are as specified.
3. **Cards with more than one flag grow past 155px.** The bull-vs-bear item carries three
   warning chips. Hiding a risk flag on a supervision screen would be worse than a taller
   card, so every flag is shown and the card stacks them.
4. **"NSE open until 15:30" is hidden below 1728px wide, and while all agents are paused.**
   The date group starts at column 9 and the pause control is pinned to the column 12 edge;
   at 1728 those two leave exactly enough room for the tail and no more. It sits in the
   group's tooltip wherever it is hidden.
5. **The chat placeholder is still scoped to the selection** ("Ask about the Infosys
   proposal…") rather than "Write a message……". The original brief requires a placeholder
   that says what the panel can answer. One line in `Chat.tsx` if you want the Figma text.
6. **The agent status line truncates with an ellipsis**, against the original brief's
   "no truncation" rule. The restyle spec asks for one line with the full text in a
   `title`, and that is what it does. A stopped agent leads with why, then who and when,
   so the words that matter survive the ellipsis.
7. **Cash is back on Home as a fourth KPI block beside Limits**, so the strip is four
   blocks of three columns rather than three of four. Portfolio went back to being a
   one-line stub. The four blocks share the parent grid's rows through CSS subgrid, so the
   rule, the detail rows and the extra line up across all four whatever their copy says.
   Below about 1560px wide the three-column cell is too narrow for "0 broken · 2 near
   limit" on one line, so the Limits value takes two lines and the whole strip grows.
   At 1728 everything sits on one line and the rhythm is unchanged.
8. **Below about 1000px of viewport height the Monitoring panel body gets short**, because
   the chat is pinned near the viewport bottom. The footer and chat padding tighten under
   that height to give some of it back.
