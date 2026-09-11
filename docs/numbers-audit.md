# Numbers audit

Where every visible figure came from before this pass, whether it agreed with the
rest of the app, and what it comes from now. `docs/NUMBERS.md` is the reference;
this file is the record of the sweep.

---

## 1. Where each figure came from

**T** = typed into the Book · **D** = derived · **S** = typed into a sentence in
the log · **C** = typed into a component.

### Home, Layer 1

| Figure | Was | Agreed? | Now |
|---|---|---|---|
| Fund value ₹248.6 cr | D from holdings + cash | holdings and cash were both static | D — opening book + today's fills |
| NAV ₹126.10, official ₹125.04 | D / T | yes | unchanged |
| Day change +₹2.1 cr (+0.85%) | D | yes | unchanged |
| Nifty +1.20% | T | yes | unchanged |
| Drawdown −4.8%, pause ₹121.81, room 3.2 pts | D | yes | unchanged |
| Reliance 9.4% of 10% · ₹1.5 cr room | D | yes | unchanged |
| Banking 23.1% of 25% · ₹4.7 cr room | D | yes | unchanged |
| Banking reason "no agent bought anything" | T | **no** — agents bought ₹4.0 cr of banks on 10 Sep | D from `TRADES_0910` |
| Cash ₹14.9 cr (6.0%) | T | **no** — the morning's trades never touched it | D — opening cash ± fills |
| Minimum ₹7.5 cr, Spendable ₹7.4 cr | D | yes | unchanged |
| "uninvested 4 days · since 7 Sep" | T | **no** — undefined, and 18+17 trades had happened | T, with "idle" now defined (NUMBERS.md) and the claim tested |

### Home, agent row

| Figure | Was | Agreed? | Now |
|---|---|---|---|
| Research "6 ideas · 2 dropped · 48 sources" | D | yes | unchanged |
| Portfolio "4 sized · 1 cut down · 3 trims" | D | yes | unchanged |
| Risk "7 checked · 5 cleared · 1 sent · 1 blocked" | D | yes | unchanged |
| Compliance "7 checked · 1 blocked" | D | **no** — one of the seven was already blocked by Risk | D, now 6 |
| Execution "14 buys · 3 sells · ₹12.6 cr traded" | D | yes | unchanged |
| Operations "17 settled · 1 mismatch" | D | yes | unchanged |
| Research live line "Reading Infosys's Q1 FY27 filing" | T | **no** — it proposed Infosys from that filing at 09:31 | T, re-pointed at the 09:40 batch |
| Risk live line "Checking the HDFC Bank bull case" | T | **no** — Portfolio has not sized it | D: "Rechecking all 24 holdings against limits" |
| Compliance live line "Checking 2 open proposals" | T | **no** — Infosys is cleared, HDFC is not sized | D: "Checking this morning's 4 orders" |
| Execution live line "₹6.4 cr in 18 pieces · 14 done" | T | yes, in `normal` only | D from the order |
| Operations live line "10 Sep's 18 trades · 18 matched" | T | yes | D |
| Monitoring "Watching 7 feeds and 6 agents" | T | yes | D |

### Home, decisions

| Figure | Was | Agreed? | Now |
|---|---|---|---|
| "Buy ₹5.0 cr of Infosys, making it 2.0%" | T | **no** — ₹5.0 cr is 2.01%, over the 2% cap it was cut to meet | D = min(₹8.0 cr, 2% × fund) = ₹4.97 cr, renders ₹5.0 cr / 2.0% |
| "about 10% vs about 5%" | T | **no** — 10% FY27 against 3.1% in Q1 | T, rescaled to 6% / 3% |
| "Bull's size takes Banking to 24.7%" | D, with `'Banking'` hardcoded | yes, by luck | D from the verdict's own ticker |
| "broker shows 1,500 fewer shares sold" | D | yes | unchanged |
| "Difference about ₹17.6 lakh" | D | yes | unchanged |
| "sale on 10 Sep" | C | yes, by luck | D from the trade and `TRADE_DAY_0910` |
| Cash previews "₹14.9 cr → ₹9.9 cr" | D | **no** — ignored ₹1.42 cr already committed | D, in-flight netted off |

### Monitoring panel

| Figure | Was | Agreed? | Now |
|---|---|---|---|
| "Last check 10:05:00 · every 30 seconds" | D from the clock | yes | unchanged |
| Feed "updated 09:41 · 24 min ago" | D from `lagSec` | **no** — slid with the clock, so it was forever 24 min old | D from a fixed schedule |
| "Research notes feed 4 min late" | S | **no** — nothing to be late against | D from the feed's `dueAt` |
| "recovered · 4 min gap" | S | **no** | D: 8 min, the gap between due and arrival |
| Pipeline line | D | yes | unchanged |
| Agent "last action HH:MM" | D | yes | unchanged |

### Audit trail

| Figure | Was | Agreed? | Now |
|---|---|---|---|
| "87 entries · each locked to the one before it" | D | **no** — `normal` skipped six IDs | D, renumbered per state with no gaps |
| "Finished the day's 18 trades · ₹19.4 cr" | S | **no** — the trades sum to ₹18.25 cr | D |
| "Bought piece 14 of 18 · 35.6 lakh" | S | **no** — no share count; ₹35.56 lakh at ₹2,020 is 1,760.4 shares | D from 1,760 shares × a derived price |
| "Sold 30,600 Tata Motors at ₹784.30 · ₹2.4 cr" | S | yes | D from the order |
| "would take Reliance to 10.2%" | S | **no** in `calm`, where it is 8.3% and breaks nothing | D, and the idea is scoped to the states it is true in |
| "Telecom would be 7.4% of the fund" | S | **no** in `calm` (8.0%) | D |
| "Sized Infosys at ₹8.0 cr" / "Cut … to ₹5.0 cr" | S | see the cap above | D |
| "Settled TRD-0910-15 · Titan buy · 2,800" | D | **no** — bought 10 Sep, trimmed 11 Sep | D; the 10 Sep trade is now Asian Paints |
| Compliance cleared Reliance after Risk blocked it | S | **no** — nothing runs after a block | removed |
| Compliance cleared Infosys before Risk ruled | S | **no** — Risk checks first | reordered: Risk 09:50, Compliance 09:51 |
| `BRK-0910-03` | T | **no** — the only break, numbered as the third | `BRK-0910-01` |

### Proposal panel

| Figure | Was | Agreed? | Now |
|---|---|---|---|
| "Days to sell" | T per holding | **no** — 0.5 days for ₹23 cr of Reliance is far too slow | D from traded value × 20% participation |
| "v1 · ₹8.0 cr · 3.2% of fund" | D | yes | unchanged |
| "v2 · ₹5.0 cr" | T | see the cap | D |
| "If 10% holds: +24% upside" | T | **no** — rests on the implausible 10% | T, rescaled to the 6% / 3% pair |
| pastSimilar "HCLTech · Apr 2026 · You declined · missed" | T | **no** — HCLTech `boughtOn` was 22 Apr 2026 | `boughtOn` moved to 16 Dec 2025, so the Apr decision was an add we passed on |
| "Banking already uses 92% of its sector limit" | S | yes, by luck | D |

---

## 2. What the invariants caught

The suite was written before the fixes. `npm test` then reported, across the
three states at NOW, NOW+5 and NOW+15:

| Failing invariant | What it found |
|---|---|
| shares now = opening + today's fills | Holdings were static: the 30,600 Tata Motors, 56,400 ITC and 7,240 Titan sold this morning, and the fourteen Bharti pieces bought, moved nothing. Bharti read 4.9% when it should have read 6.9%. |
| cash = opening + sells − buys | Cash was a typed ₹14.9 cr in all three states, unmoved by ₹7.6 cr of sales and ₹5.0 cr of purchases. |
| a fill is worth its shares at its price | The Bharti pieces had a rupee amount and no share count. |
| a fill is priced within 2% of the price now | Fills priced at `normal`'s ₹2,020 were 7.4% away from Bharti's price in `bad`. |
| every traded total is the sum of its fills | The 10 Sep line claimed ₹19.4 cr against ₹18.25 cr of trades. |
| Risk rules before Compliance | Compliance cleared Infosys at 09:51, a minute before Risk ruled at 09:52. |
| nothing happens to an idea after it is blocked | Compliance cleared Reliance ten seconds after Risk blocked it. |
| event IDs are numbered without a gap | `normal` skipped EVT-0063, 0067, 0076, 0077, 0081 and 0086. |
| a percentage in the log is one the fund has | `calm` claimed Reliance would reach 10.2% when it would reach 8.3%, and that Telecom would be 7.4% when it would be 8.0%. |
| a limit reason names a trade that happened | "no agent bought anything" against 13,400 ICICI, 4,600 Kotak and 5,100 HDFC Bank shares on 10 Sep. |
| a first position is capped by the rule | ₹5.0 cr is 2.01% of ₹248.6 cr, over the 2% cap the cut was made to meet. |
| a late entry agrees with the feed's timestamps | Nothing in the feed data for "4 min late" to be late against; the feed's own timestamp slid with the clock. |
| pieces keep arriving as the clock moves | No Bharti fill after 10:04:52 though pieces came every 2 min 40 s. |
| a cash preview counts pieces not yet landed | Previews spent the ₹1.42 cr of Bharti still to be bought. |
| a past decision agrees with the holdings | HCLTech declined in Apr 2026 and first bought 22 Apr 2026. |
| the growth figures are consistent with the filing | 10% for FY27 on 3.1% in Q1 implies 12.3% for the rest of the year. |
| days to sell comes from traded value | Typed, and far too slow for large caps. |
| a ticker is never both bought and sold today | Titan bought 10 Sep, trimmed 11 Sep. |

Two more surfaced while the tests were being written rather than from a
failure: `BRK-0910-03` was the only break, and the Tata Motors trim cited a
target weight that did not exist.

---

## 3. What is still approximate

Named here so it is not mistaken for rigour.

- **Intraday percentages in the log** are computed at NOW's prices, because the
  Book keeps no intraday history. The Reliance block reads 10.2% at 10:05 and
  10.1% at 10:20. Both are above the 10% limit, which is the claim the sentence
  makes; the tolerance is 0.1 of a point.
- **Three narrative percentages** are claims about price moves the Book has no
  history for: ITC's 9% rise this month, Nestlé's 4% move on the news, and the
  6% rise in bank shares. They are whitelisted in the test with that reason.
- **"12 of 30"** in the Research live line is a progress counter with nothing
  behind it. It is an anchor.
- **Prices** are a set of plausible levels, not a snapshot of a real day. See the
  plausibility notes in the report.
