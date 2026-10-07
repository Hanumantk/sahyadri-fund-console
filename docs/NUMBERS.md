# Numbers

Every figure in this prototype comes from one place. This file says what that
place holds, what each word on screen means, and what you have to do to add a
number of your own.

---

## 1. The Book

The Book is the set of hand-entered facts. Everything else is a function of it.
It lives in `src/data/scenario.ts` and nothing outside that file is an anchor.

| Anchor | Where | Value | Why this value |
|---|---|---|---|
| NOW | `clock.ts` `DEMO_START_MS` | Fri 11 Sep 2026 10:05:00 IST | The morning the whole scenario is written to be true at. It ticks in real time. |
| Units | `FUND.units` | 1,97,14,000 | Fixed. Nothing issues or redeems units during the demo. |
| Opening cash | `FUND.openingCash` | ₹12,24,25,000 | Cash at the 10 Sep close. Back-solved so cash **now** lands on ₹14.9 cr after this morning's three sales and fourteen purchases. |
| Opening shares | `HOLDINGS[].shares` | 24 tickers | Shares at the 10 Sep close, after that day's 18 trades. Never what the screen shows. |
| Price at NOW | `HOLDINGS[].price` | per ticker | Before any per-state multiplier. |
| Official NAV | `FUND.official` | ₹125.04 (`normal`, `calm`), ₹124.10 (`bad`) | The last struck value per unit, 10 Sep. |
| Peak | `FUND.peak` | ₹132.40 on 14 Aug 2026 | What drawdown is measured from. |
| Benchmark today | `FUND.benchmarkChangeTodayPct` | +1.20% / +1.20% / −1.10% | The Nifty 50's move today, per state. |
| Yesterday's trades | `TRADES_0910` | 18 × {ticker, side, shares, price} | Settled history. State-independent. |
| Today's orders | `ORDERS_TODAY` | 4 × {ticker, side, whole shares, pieces, drift} | See §3. |
| Rules | `LIMITS` | see §4 | Company 10%, sector 25%, min cash 3%, near 90%, drawdown pause 8%, first position 2%, working cash 4%, participation 20%. |
| Sector targets | `SECTOR_TARGETS` | per sector | What the Portfolio Agent trims towards. Never displayed. |
| Traded value | `HOLDINGS[].advRupees` | per ticker | Average value traded in a day. Days to sell comes from it. |
| Idle-cash date | `FUND.cashIdleSince` | 7 Sep 2026 | See "idle cash" in the glossary. |
| Who may overrule | `OVERRIDE_POLICY` | per kind of override | The same policy the Rules page states in prose, in a form the console can evaluate. See §3a. |
| Authority | `AUTHORITY` | per person | The role the rules are written against. Priya Nair's job title on screen is Portfolio Manager; her authority is Fund Manager. |
| Override expiry | `OVERRIDE_LAPSES_AT` | 15:30 IST today | An override lasts the session. At the close it lapses and what it suspended is raised again. |
| Reopen extension | `REOPEN_EXTENSION_MIN` | 15 minutes | How long a reopened decision stays open. Long enough to decide, short enough that reopening is not a way to never decide. |
| Events | `EVENTS` | structured, templated | See §5. |

Everything below is derived and must never be typed:

current holdings · cash · fund value · NAV · day change · drawdown · every
weight, sector weight, limit use and headroom · minimum cash · spendable cash ·
days to sell · agent counts · pipeline counts · every "traded" total · every ₹
or % inside an event's text · every "x min ago" and "x min left".

---

## 2. How the fund value is built

```
shares now     = opening shares + today's fills          (buys add, sells subtract)
cash now       = opening cash   + sale proceeds − purchase costs
holdings value = Σ shares now × price at NOW
fund value     = holdings value + cash now
NAV per unit   = fund value / units
day change     = (NAV − official NAV) × units
drawdown       = NAV / peak − 1
buying pauses at = peak × (1 − 8%)
room left      = 8 + drawdown            (in points of NAV)
```

Trading barely moves the fund value, and that is the point: a sale turns shares
into cash at about what the shares were marked at. What trading moves is the
*shape* of the fund. The `normal` state at NOW:

| | |
|---|---|
| Opening holdings | ₹236.34 cr |
| Opening cash | ₹12.24 cr |
| Sold this morning | Tata Motors ₹2.4 cr · ITC ₹2.6 cr · Titan ₹2.6 cr |
| Bought this morning | Bharti Airtel, 14 of 18 pieces, ₹4.98 cr |
| Holdings now | ₹233.70 cr |
| Cash now | ₹14.88 cr |
| Fund value | ₹248.59 cr → **₹248.6 cr** |
| NAV | **₹126.10** |

---

## 3. Orders and fills

An order is **whole shares cut into equal pieces**. Nothing about it is stated
in rupees.

```
piece size   = shares / pieces          (a whole number)
fill price   = price at NOW × (1 + driftBps / 10,000), rounded to the paisa
fill amount  = piece size × fill price
order size   = shares × price at NOW    ← the "₹6.4 cr" on screen
in flight    = unfilled shares × price at NOW
```

A fill is priced off **that state's** price, not off a fixed rupee figure. The
three states are three different mornings; a fill struck at `normal`'s prices
would be seven percent away from the market in `bad`, which is why the drift is
stored in basis points rather than the price being typed.

Pieces still ahead of the clock are data like any other, and simply do not
appear until the clock reaches them. The Bharti order's last four pieces land at
10:07:30, 10:10:10, 10:12:50 and 10:15:30 while the screen is open.

The clock is the only gate on a fill, with one exception: a person can stop the
rest of an order. `rt.stopAfterPiece[orderId]` holds the last piece allowed to
go, and pieces past it never fill however far the clock runs.

```
fills        = pieces whose time has come AND whose number ≤ the stop
in flight    = 0 once stopped          ← the cash the stop releases
```

Everything downstream follows from `fills`, so a stop needs no other arithmetic:
holdings, cash, the in-flight commitment and the log all move on their own. The
pieces that already filled are trades and stay in all four.

---

## 3a. Overrides

An override is **one agent decision suspended, for one instance, until the
close**. It is not a rule change: the rule it suspends is still the rule, which
is why an override carries an expiry and the rulebook does not.

### What can be overruled, and where

| Kind (`OverrideKind`) | The agent decision | Where the control is | May | Second signature | Lapses |
| --- | --- | --- | --- | --- | --- |
| `risk-block` | Risk refused a trade at a limit | Home → Closed today → the block | Fund Manager | Risk Manager, above 5% in one company or if it breaks another limit | 15:30 |
| `compliance-block` | Compliance refused a trade on the mandate | Same | Compliance Officer **only** | — | 15:30 |
| `limit-exception` | Risk holds a broken limit shut | Home → the broken limit | Fund Manager | Risk Manager, always | 15:30 |
| `size-cap` | Portfolio cut a size to a cap | The proposal | Fund Manager | Risk Manager, above 5% in one company or if it breaks another limit | 15:30 |
| `dropped-idea` | Research dropped an idea | Research Agent panel | Fund Manager | — | never: no money moves |
| `agent-halt` | Monitoring halted an agent | The agent's panel, and the late-feed panel | Any human | — | never |
| `expired-decision` | The clock closed a decision | The closed decision | Fund Manager | — | the extension, `REOPEN_EXTENSION_MIN` |

And restraint, which needs no permission because it cannot cost the fund
anything it had not already committed: **stop the rest of an order** (Execution
Agent panel), **trim a broken limit** back to the limit or to its sector target
(the broken limit), **pause** or **restore full speed** (any agent panel).

Every one of these is also reachable from wherever its record turns up: an
**act link** on the Audit trail row (`vm.actOn`) and a **What you can still do**
list on the Portfolio holding (`vm.actOnTicker`).

### The policy is in the Book, once

`OVERRIDE_POLICY` in `scenario.ts` holds who may, the co-sign rule, who is
told, who to ask instead, and what happens at the close. The running console
checks it before offering anything, and the Rules page's *Who can overrule whom*
is generated from it — a test fails if the two ever say different things.

```
permitted     = AUTHORITY[current user] ∈ mayOverrule
needs cosign  = the cosign rule fires, OR the override breaks a second limit
```

The co-sign threshold is read against the position the override leaves
behind, not the size of the one trade: on a ₹248.6 cr fund a 5% threshold on the
trade would be ₹12.4 cr, above every override this fund could make.

**A second limit always needs the Risk Manager.** Overriding one limit must not
quietly break another. `limitBreaches()` names every limit a preview breaks;
anything beyond the one being overruled is printed on the panel and turns the
override into one that needs a co-signer. Taking the pre-cap ₹8.0 cr of Infosys,
for instance, takes cash to ₹5.5 cr, below its ₹7.5 cr minimum.

### When the rules say no

The person at this console may not lift a Compliance block. The console does not
pretend otherwise and does not leave them with nothing: it records the refusal,
sends the request to the person the Book names (`askInstead`), and keeps it in a
*Waiting on others* group on Home until it is answered or withdrawn. It can be
chased, and each chase is recorded. Nobody answers it in this prototype, because
there is no Compliance Officer at the console — and the screen says so by how long
it has waited.

### Three rules, enforced by `src/data/__tests__/override.test.ts`

- **Nothing an agent did is deleted.** The blocked event keeps its place in the
  log, its figure, and its place in the agent's tally. An agent's acknowledgement
  has its own type, `override_acknowledged`, so no count of what agents decided
  today moves because a person decided otherwise.
- **Permission is checked against the Book**, never inferred from a button.
- **Loosening expires; tightening does not.**

### Something else: your own instruction

Every item in the Decisions column has a blank box beside its listed options for
anything they do not cover. **Words are recorded and passed on, never executed.**
Nothing is bought and the books do not change on a written instruction; the
instruction is quoted word for word in the record and goes to the agent that
raised the item, which writes down that it has it.

| Item | What the instruction does |
| --- | --- |
| Proposal, verdict | Closes it: "Your instruction · nothing bought". Anything that needs money comes back as a new proposal. |
| Mismatch | Closes it in your queue; the books are unchanged and Operations must still settle it before the value is struck. |
| Late feed, broken limit | Stays open, because words cannot make a feed arrive or a limit unbreak. Every instruction sent is listed on the item. |

`src/data/__tests__/instruction.test.ts` holds that no instruction, on any item
in any state, moves cash, shares, the fund value or the order count.

### Counting

An order can now be placed three ways, and the pipeline line says so once the
third has happened:

```
orders placed = auto-cleared + approved by you + on your override
```

An order placed on an override carries `onOverride: true`. Taking the pre-cap
size is your decision on the proposal, so it counts as approved by you.

A blocked entry quotes the position the agent measured, so anything bought on the
strength of that entry is taken back out before the figure is restated —
otherwise the log would silently change its own number after the override.

---

## 4. Glossary

**Trade-date accounting.** A sale counts as cash the moment it is struck, not
when it settles two days later. So this morning's ₹7.6 cr of sales is already in
the ₹14.9 cr of cash, even though Operations is still matching 10 Sep's trades.
This is the convention the whole prototype uses; it is never shown on screen.

**Minimum cash.** 3% of fund value. A hard floor: agents may not spend below it.

**Spendable cash.** Cash minus the minimum. What an agent could commit today.
It does **not** subtract orders already in flight — but every "cash after" figure
on a decision card does, which is why the previews start lower than Spendable.

**In-flight cash.** Rupees already promised to pieces of today's orders that have
not landed. ₹1.42 cr at NOW, the four Bharti pieces still to come.

**Working cash / idle cash.** The fund's working cash level is 4% of fund value
(`LIMITS.workingCashPct`). Cash above it is idle — it is earning nothing and is
not doing the job the fund is paid for. `cashIdleSince` is the last date the
**closing** cash balance was at or below the working level. The Cash tile's
"uninvested 4 days · since 7 Sep" means cash has closed above 4% every day since
7 Sep, which it has: ₹12.24 cr on 4.9% at the 10 Sep close, ₹14.88 cr on 6.0%
now. Neither the threshold nor the phrase "idle" appears on screen.

**Near limit.** At or above 90% of a limit (`LIMITS.nearLimitPct`). **Broken**
means past the limit itself. Both are computed from the weight, never set.

**The Axis Bank mismatch.** Our record says 12,000 shares were sold on 10 Sep;
the broker's contract note says 10,500. Until it is settled, **the holdings
follow our record**: the opening book has the full 12,000 out, so Axis Bank
reads 83,051 shares and the fund value carries the ₹17.6 lakh of proceeds we
believe we received. Accepting the broker's record adds 1,500 shares back and
takes the cash out; keeping ours changes nothing and chases the broker. The
screen does not say which side it has taken, because at 10:05 nobody has
decided — but every figure on it is our record, not the broker's.

**Fills vs orders vs buys.** These count different things on purpose:

- An **order** is one instruction to the market. The pipeline's "4 orders" counts
  `order_placed` events: Tata Motors, ITC, Titan, Bharti Airtel.
- A **fill** is one piece of an order coming back done. The Execution card's
  "14 buys · 3 sells" counts `fill` events, so the Bharti order alone accounts
  for fourteen of them.
- **Traded** is the sum of what those fills moved: ₹12.6 cr.

So four orders and seventeen fills are the same morning counted two ways. The
labels say which.

**Days to sell.** `position value / (20% × average value traded in a day)`. The
fund will not be more than a fifth of a day's turnover. For a ₹250 cr fund in
Indian large caps every position clears inside one session, which is why the
column reads "under 1".

**Rounding.** Money is held in rupees and rounded only when it is formatted:
crore to one decimal, lakh to one decimal, prices to the paisa, percentages to
one decimal. Two figures that round to the same string may differ underneath; a
test compares the numbers, never the strings.

**Intraday percentages in the log.** An event that quotes a weight computes it at
NOW's prices, not at the prices when the event happened. The scenario keeps no
intraday price history, so this is a deliberate approximation with a tolerance of
0.1 of a point. It is why the Reliance block reads 10.2% at 10:05 and 10.1% a
quarter of an hour later: the fund value underneath it moved.

---

## 5. Events

An event is structured. Its `text` is a template, and every `{token}` in it is
filled in by `derive()` from the same figures the rest of the screen uses.

```ts
{ id: 'EVT-0044', actor: 'risk', type: 'risk_blocked', ticker: 'RELIANCE',
  amount: 2 * CR,
  text: 'Blocked: {amount} more would take Reliance Industries to ' +
        '{tickerPlusAmountPct} of the fund, above the {companyLimitPct} limit' }
```

No rupee figure and no share count may be typed into an authored template. A test
enforces it.

**IDs are assigned per state.** `EVENTS[].id` is an authoring key, not what the
screen shows. Each state includes a different subset, so `eventsFor()` sorts what
survives and numbers it `EVT-0001` upward with no gaps — otherwise the Audit
trail's claim that each entry is locked to the one before it would be false the
moment you looked at the numbering. Anything linking to a record by its authoring
key goes through `recordId(vm, key)`.

**Nothing dated after the clock is included.** That is what lets future fills sit
in the data and arrive on time.

---

## 6. Rules for adding a number

1. **The design is frozen** unless it is asked for in so many words. A number
   fix never justifies a design change. If a figure can only be corrected by
   moving, adding or renaming something on screen, leave it and raise it.
2. **Every number on screen comes from `derive()`.** Components hold no numeric
   literal in user-facing text. `src/__tests__/no-hardcoded-numbers.test.ts`
   fails the build otherwise.
3. **A new number is either an anchor or derived.**
   - An anchor goes in the Book with a one-line reason, and into §1 above.
   - A derived number goes in `derive.ts` **with a test in
     `src/data/__tests__/book.test.ts`** that ties it to what it is derived from.
4. **A new event is structured**, and its text is a template. Put the figure in a
   field and a token in the sentence.
5. **Run `npm test` before finishing.** A failing invariant or design-freeze test
   means the change is wrong, not the test. The one exception is a change to the
   Book or the design that was explicitly approved, and then the fixture is
   retaken on its own.

### When the Portfolio page is built

Its table is `derive().fund.holdings` — not `HOLDINGS`, which is the opening
book. Its totals, weights and cash must equal Home's to the rupee. Add a test
asserting that the page's total equals `vm.fund.fundValue` and that each row's
percentage equals the same holding's on Home.

### When the Rules page is built

Its 30-day rehearsal needs history the Book does not yet hold. Generate it so it:

- ends exactly at the opening book (10 Sep close), not at today's holdings;
- peaks on 14 Aug at ₹132.40 per unit;
- never holds a company before its `boughtOn`;
- contains the past decisions already listed in `DECISIONS`.

Add it as an anchor series in the Book, not as a random walk computed at render.

The implemented rulebook brief explicitly fixes a different rehearsal contract:
each limit carries its own authored 30-day result and optional proposal rows in
`src/data/rulebook.ts`. Those results are mock evidence, not a reconstruction of
the portfolio ledger. Capital equivalents are still derived at render from the
shared fund size, and `src/data/__tests__/rulebook.test.ts` keeps those
relationships connected.

### When the Settings page is built

People and roles come from `PEOPLE` only. No name is typed into a component.
