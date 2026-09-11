# Sahyadri India Equity Fund — working rules

A prototype of a supervision console for a fund run by AI agents. React + TypeScript
+ Vite. `docs/NUMBERS.md` is the reference for anything to do with figures; this
file is the short version of what you must not break.

## The design is frozen

Do not change CSS, spacing, colour, font, icon or layout, and do not add, remove,
move or rename any element, unless a design change is asked for in so many words.
A wrong number never justifies a design change. If a figure can only be corrected
by changing the design, leave it and say so.

`src/__tests__/design-freeze.test.tsx` holds the shape of Home and the Audit trail
in all three states. If it fails, the change is wrong, not the fixture.

## Every number comes from derive()

- `src/data/scenario.ts` is the Book: hand-entered facts only, never a figure
  computed for display.
- `src/data/derive.ts` turns the Book into the view model. Every ₹, %, count and
  relative time on screen is computed there.
- Components hold no numeric literal in user-facing text. Enforced by
  `src/__tests__/no-hardcoded-numbers.test.ts`.

A new number is one of two things:

- **An anchor.** Add it to the Book with a one-line reason, and to the table in
  `docs/NUMBERS.md` §1.
- **Derived.** Add it to `derive.ts` *and* add a test in
  `src/data/__tests__/book.test.ts` tying it to what it comes from.

## Events are structured

An event carries fields; its `text` is a template whose `{tokens}` derive fills
in. Never type a rupee figure or a share count into an authored sentence — the
Book test fails on it. Event IDs in the Book are authoring keys; the screen shows
IDs renumbered per state, so link to a record with `recordId(vm, key)`.

## The clock

The demo clock starts at Fri 11 Sep 2026 10:05:00 IST and runs in real time. Do
not change that. Events dated after it are hidden until it reaches them, which is
how the rest of this morning's order arrives while the screen is open. Every
relative time is measured from the one `rt.nowMs`.

## Scenario states

`?state=normal|calm|bad`. Every rule holds in all three. A sentence that is only
true in one of them either takes its number from derive or carries a `states`
filter. The invariants run each state at NOW, NOW+5 and NOW+15.

## Before finishing any change

```bash
npm test        # 515 invariants, the two guard tests, and the design freeze
npm run build   # tsc --noEmit, then vite build
```

A failing invariant or design-freeze test means the change is wrong, not the
test. The exception is an approved change to the Book or the design, and then the
fixture is retaken on its own.

Other checks, which need a dev server on :5173:

```bash
npm run wireframe   # overflow, non-token colours, clipped and spilled text
npm run a11y        # 14px floor and WCAG AA contrast across 11 views
npm run capture     # rendered text and DOM shape of every view in every state
```

## Invented names

Research houses, news outlets and data vendors are invented. Real listed company
names are fine. Keep it that way.

## Stubs

Portfolio, Rules and Settings are one-line stubs. `docs/NUMBERS.md` §6 says what
each one has to satisfy when it is built. Do not build them out unasked.
