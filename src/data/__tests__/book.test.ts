/**
 * The Book's invariants.
 *
 * Everything here asserts a relationship, not a value: fund value is the sum of
 * what the fund holds, cash is the opening balance plus what today's fills did
 * to it, and every number inside a sentence in the log is the same number the
 * rest of the screen shows. A figure can be changed in scenario.ts and these
 * still pass; a figure that stops agreeing with the ones around it does not.
 *
 * Every state is checked at the demo clock's start and twice after it, because
 * the clock keeps running and the world has to keep up with it.
 */

import { describe, expect, it } from 'vitest';
import { DEMO_START_MS, MARKET_OPEN_MS, ms } from '../clock';
import {
  SILENCE_WARN_MS,
  allFills,
  breakDifference,
  buildTokens,
  cappedAmount,
  contextFor,
  daysToSell,
  derive,
  deriveOrders,
  holdingSpec,
  initialRuntime,
  openingShares,
  priceOf,
  resolvedDecisionsFor,
  type QueueItem,
  type Runtime,
  type ViewModel,
} from '../derive';
import {
  CR,
  DECISIONS,
  EVENTS,
  FEEDS,
  FUND,
  HOLDINGS,
  LIMITS,
  ORDERS_TODAY,
  SOURCES,
  STATES,
  TRADES_0910,
  type StateName,
} from '../scenario';

const MINUTE = 60_000;
const CLOCKS: [string, number][] = [
  ['at NOW', DEMO_START_MS],
  ['at NOW+5', DEMO_START_MS + 5 * MINUTE],
  ['at NOW+15', DEMO_START_MS + 15 * MINUTE],
];

/** Close enough for money: one rupee in a fund of hundreds of crore. */
const RUPEE = 1;

function run(state: StateName, nowMs: number): { rt: Runtime; vm: ViewModel } {
  const rt = initialRuntime(state, nowMs);
  return { rt, vm: derive(rt) };
}

const eachCase = (fn: (state: StateName, nowMs: number, label: string) => void) => {
  for (const state of STATES) {
    for (const [label, nowMs] of CLOCKS) {
      describe(`${state} ${label}`, () => fn(state, nowMs, `${state} ${label}`));
    }
  }
};

// ---------------------------------------------------------------------------

describe('valuation', () => {
  eachCase((state, nowMs) => {
    const { vm } = run(state, nowMs);
    const f = vm.fund;

    it('fund value is what it holds plus its cash', () => {
      const held = f.holdings.reduce((s, h) => s + h.shares * h.price, 0);
      expect(held + f.cash).toBeCloseTo(f.fundValue, 0);
      expect(f.holdingsValue).toBeCloseTo(held, 0);
    });

    it('value per unit is the fund divided by its units', () => {
      expect(f.navPerUnit).toBeCloseTo(f.fundValue / FUND.units, 8);
      expect(f.units).toBe(FUND.units);
    });

    it("today's change is the move in value per unit across every unit", () => {
      expect(f.dayChange).toBeCloseTo((f.navPerUnit - f.official.navPerUnit) * FUND.units, 0);
      expect(f.dayChangePct).toBeCloseTo((f.dayChange / f.official.fundValue) * 100, 8);
      expect(f.gapPts).toBeCloseTo(f.dayChangePct - f.benchmarkPct, 8);
    });

    it('drawdown is measured from the peak, and buying pauses a fixed way below it', () => {
      expect(f.drawdownPct).toBeCloseTo((f.navPerUnit / FUND.peak.navPerUnit - 1) * 100, 8);
      expect(f.pauseNavPerUnit).toBeCloseTo(FUND.peak.navPerUnit * (1 - LIMITS.drawdownPausePct / 100), 8);
      expect(f.roomPts).toBeCloseTo(LIMITS.drawdownPausePct + f.drawdownPct, 8);
      expect(f.pausePct).toBe(-LIMITS.drawdownPausePct);
    });

    it('every weight is a share of the fund, and a sector is the sum of its holdings', () => {
      for (const h of f.holdings) {
        expect(h.value).toBeCloseTo(h.shares * h.price, 6);
        expect(h.pct).toBeCloseTo((h.value / f.fundValue) * 100, 8);
      }
      for (const s of f.sectors) {
        const parts = f.holdings.filter((h) => h.sector === s.name).reduce((sum, h) => sum + h.value, 0);
        expect(s.value).toBeCloseTo(parts, 0);
        expect(s.pct).toBeCloseTo((s.value / f.fundValue) * 100, 8);
      }
      // Holdings plus cash account for the whole fund and nothing else.
      expect(f.sectors.reduce((s, x) => s + x.value, 0) + f.cash).toBeCloseTo(f.fundValue, 0);
    });

    it('near means at or above 90% of a limit, broken means past it', () => {
      for (const r of vm.limits.all) {
        expect(r.usedPct).toBeCloseTo((r.pct / r.limitPct) * 100, 8);
        const want = r.usedPct > 100 ? 'broken' : r.usedPct >= LIMITS.nearLimitPct ? 'near' : 'ok';
        expect(r.status, `${r.name} at ${r.usedPct}`).toBe(want);
        expect(r.headroom).toBeCloseTo((r.limitPct / 100) * f.fundValue - r.pct / 100 * f.fundValue, 0);
      }
      expect(vm.limits.broken.every((r) => r.pct > r.limitPct)).toBe(true);
      expect(vm.limits.near.every((r) => r.pct <= r.limitPct)).toBe(true);
    });

    it('the cash floor and what is spendable both follow the rule', () => {
      expect(f.minCashRupees).toBeCloseTo((LIMITS.minCashPct / 100) * f.fundValue, 0);
      expect(f.spendableCash).toBeCloseTo(f.cash - f.minCashRupees, 0);
      expect(f.cashPct).toBeCloseTo((f.cash / f.fundValue) * 100, 8);
    });

    it('cash has been above the working level since the date the tile names', () => {
      // What "uninvested" means: cash above the working level. The claim is only
      // true if cash is above it now.
      expect(f.cashPct).toBeGreaterThan(LIMITS.workingCashPct);
      expect(f.cashIdleSinceMs).toBeLessThan(nowMs);
    });

    it('a cash preview counts the order pieces that have not landed yet', () => {
      for (const item of vm.open) {
        for (const p of item.previews) {
          expect(p.cashAfter, `${item.id} ${p.key}`).toBeCloseTo(f.cash - vm.inFlightCash - p.amount, 0);
        }
      }
    });

    it('days to sell comes from the day’s traded value, not from a typed number', () => {
      for (const h of f.holdings) {
        expect(h.daysToSell).toBeCloseTo(daysToSell(h.value, h.advRupees), 8);
        expect(h.daysToSell).toBeLessThan(5);
      }
    });
  });
});

// ---------------------------------------------------------------------------

describe('ledger', () => {
  eachCase((state, nowMs) => {
    const { rt, vm } = run(state, nowMs);
    const orders = deriveOrders(rt);
    const fills = allFills(orders);

    it('shares now are the opening book plus what today filled', () => {
      for (const h of vm.fund.holdings) {
        const net = fills
          .filter((x) => x.ticker === h.ticker)
          .reduce((s, x) => s + (x.side === 'buy' ? x.shares : -x.shares), 0);
        expect(h.shares, h.ticker).toBeCloseTo(openingShares(h.ticker, state) + net, 6);
      }
    });

    it('a share count is whole and never negative', () => {
      for (const h of vm.fund.holdings) {
        expect(Number.isInteger(h.shares), `${h.ticker} ${h.shares}`).toBe(true);
        expect(h.shares, h.ticker).toBeGreaterThanOrEqual(0);
      }
      for (const f of fills) expect(Number.isInteger(f.shares), f.id).toBe(true);
    });

    it('cash is the opening balance plus what was sold less what was bought', () => {
      const sold = fills.filter((f) => f.side === 'sell').reduce((s, f) => s + f.amount, 0);
      const bought = fills.filter((f) => f.side === 'buy').reduce((s, f) => s + f.amount, 0);
      expect(vm.fund.cash).toBeCloseTo(FUND.openingCash + sold - bought, 0);
    });

    it('a fill is worth its shares at its price', () => {
      for (const f of fills) {
        expect(Math.abs(f.amount - f.shares * f.price)).toBeLessThan(Math.abs(f.amount) * 0.001 + RUPEE);
      }
    });

    it('a fill is priced within 2% of that ticker’s price now', () => {
      for (const f of fills) {
        const now = priceOf(f.ticker, state);
        expect(Math.abs(f.price / now - 1), `${f.id} at ${f.price} vs ${now}`).toBeLessThanOrEqual(0.02);
      }
    });

    it('the pieces of an order add up to the order, and are numbered in time order', () => {
      for (const o of orders) {
        expect(o.sharesPerPiece * o.pieces).toBe(o.shares);
        expect(Number.isInteger(o.sharesPerPiece), o.id).toBe(true);
        expect(o.filledShares + o.remainingShares).toBe(o.shares);
        expect(o.driftBps.length).toBe(o.pieces);
        const times = o.fills.map((f) => f.atMs);
        expect([...times].sort((a, b) => a - b)).toEqual(times);
        expect(o.fills.map((f) => f.piece)).toEqual(o.fills.map((_, i) => i + 1));
        expect(o.inFlightRupees).toBeCloseTo(o.remainingShares * priceOf(o.ticker, state), 0);
      }
    });

    it('every traded total is the sum of its fills', () => {
      expect(vm.counts.traded).toBeCloseTo(fills.reduce((s, f) => s + f.amount, 0), 0);
      expect(vm.counts.buys).toBe(fills.filter((f) => f.side === 'buy').length);
      expect(vm.counts.sells).toBe(fills.filter((f) => f.side === 'sell').length);
      for (const o of orders) {
        expect(o.filledRupees).toBeCloseTo(o.fills.reduce((s, f) => s + f.amount, 0), 0);
      }
    });

    it("the 10 Sep total is the sum of that day's trades", () => {
      const total = TRADES_0910.reduce((s, t) => s + t.shares * t.price, 0);
      const line = vm.events.find((e) => e.key === 'EVT-0910-03')!;
      expect(line.text).toContain(`${(total / CR).toFixed(1)} cr`);
      expect(line.text).toContain(`${TRADES_0910.length} trades`);
    });

    it('a ticker is never both bought and sold today', () => {
      const sides = new Map<string, Set<string>>();
      for (const o of ORDERS_TODAY) {
        if (!sides.has(o.ticker)) sides.set(o.ticker, new Set());
        sides.get(o.ticker)!.add(o.side);
      }
      for (const [ticker, s] of sides) expect(s.size, ticker).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------

describe('log', () => {
  eachCase((state, nowMs) => {
    const { vm } = run(state, nowMs);
    const today = vm.events.filter((e) => ms(e.at) >= MARKET_OPEN_MS);

    it('the pipeline balances', () => {
      const p = vm.pipeline;
      expect(p.found - p.dropped).toBe(p.sized);
      expect(p.sized + p.trims).toBe(p.checked);
      expect(p.checked).toBe(p.cleared + p.sent + p.riskBlocked);
      expect(p.ordersPlaced).toBe(p.cleared - p.complianceBlocked + p.humanApproved);
      expect(p.ordersPlaced).toBe(p.autoCleared + p.humanApproved);
    });

    it('counts come from the log and nowhere else', () => {
      const n = (type: string) => today.filter((e) => e.type === type).length;
      expect(vm.counts.ideasFound).toBe(n('idea_found'));
      expect(vm.counts.ideasDropped).toBe(n('idea_dropped'));
      expect(vm.counts.trims).toBe(n('trim'));
      expect(vm.counts.settled).toBe(n('settled'));
      expect(vm.counts.ordersPlaced).toBe(n('order_placed'));
      expect(vm.counts.sourcesRead).toBe(
        today.filter((e) => e.type === 'sources_read').reduce((s, e) => s + (e.count ?? 0), 0),
      );
    });

    it('each idea moves through the pipeline in order', () => {
      const ORDER = ['idea_found', 'sized', 'cut_down', 'risk_cleared', 'risk_blocked', 'sent_to_person', 'compliance_cleared', 'compliance_blocked', 'order_placed', 'fill'];
      const byCompany = new Map<string, typeof today>();
      for (const e of today) {
        if (!e.company || !ORDER.includes(e.type)) continue;
        if (!byCompany.has(e.company)) byCompany.set(e.company, []);
        byCompany.get(e.company)!.push(e);
      }
      for (const [company, list] of byCompany) {
        const risk = list.find((e) => e.type.startsWith('risk_') || e.type === 'sent_to_person');
        const compliance = list.find((e) => e.type.startsWith('compliance_'));
        // Risk rules on an idea before Compliance checks the mandate.
        if (risk && compliance) {
          expect(ms(risk.at), `${company}: risk before compliance`).toBeLessThan(ms(compliance.at));
        }
        const sized = list.find((e) => e.type === 'sized');
        if (sized && risk) expect(ms(sized.at), `${company}: sized before risk`).toBeLessThan(ms(risk.at));
        const placed = list.find((e) => e.type === 'order_placed');
        const firstFill = list.find((e) => e.type === 'fill');
        if (placed && firstFill) {
          expect(ms(placed.at), `${company}: placed before filled`).toBeLessThanOrEqual(ms(firstFill.at));
        }
      }
    });

    it('nothing happens to an idea after it is blocked', () => {
      const AFTER = ['compliance_cleared', 'compliance_blocked', 'order_placed', 'fill', 'risk_cleared'];
      for (const block of today.filter((e) => e.type === 'risk_blocked' || e.type === 'compliance_blocked')) {
        const later = today.filter(
          (e) => e.company === block.company && ms(e.at) > ms(block.at) && AFTER.includes(e.type),
        );
        expect(later.map((e) => `${e.id} ${e.type}`), `after ${block.id}`).toEqual([]);
      }
    });

    it('a decision exists before it expires, and nothing expires before it was made', () => {
      for (const d of resolvedDecisionsFor(initialRuntime(state, nowMs))) {
        const created = ms(d.kind === 'break' ? d.raisedAt : d.createdAt);
        const deadline = ms(d.kind === 'break' ? d.dueAt : d.expiresAt);
        expect(created, d.id).toBeLessThan(deadline);
        expect(created, d.id).toBeGreaterThanOrEqual(MARKET_OPEN_MS - 24 * 3600_000);
      }
    });

    it('settled and mismatch entries name trades that exist', () => {
      for (const e of today.filter((x) => x.type === 'settled' || x.type === 'break_raised')) {
        const named = (e.related ?? []).filter((r) => r.startsWith('TRD-'));
        expect(named.length, e.id).toBeGreaterThan(0);
        for (const id of named) expect(TRADES_0910.some((t) => t.id === id), `${e.id} → ${id}`).toBe(true);
      }
      // A trade is settled at most once, and the one in dispute is not settled.
      const settledIds = today.filter((e) => e.type === 'settled').flatMap((e) => e.related ?? []);
      expect(new Set(settledIds).size).toBe(settledIds.length);
      const broken = vm.open.find((i) => i.kind === 'break');
      if (broken && broken.decision?.kind === 'break') {
        expect(settledIds).not.toContain(broken.decision.tradeId);
      }
    });

    it('no event text is left holding a template it could not fill', () => {
      for (const e of vm.events) expect(e.text, e.id).not.toMatch(/\{\w+\}/);
      for (const a of vm.agentRow) {
        expect(a.liveLine, a.id).not.toMatch(/\{\w+\}/);
        expect(a.job, a.id).not.toMatch(/\{\w+\}/);
        expect(a.statusLine, a.id).not.toMatch(/\{\w+\}/);
      }
      for (const r of vm.limits.all) expect(r.why, r.key).not.toMatch(/\{\w+\}/);
    });

    it('event IDs are unique and numbered without a gap', () => {
      const ids = vm.events.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      const todayIds = vm.events.filter((e) => ms(e.at) >= MARKET_OPEN_MS).map((e) => e.id);
      expect(todayIds).toEqual(todayIds.map((_, i) => `EVT-${String(i + 1).padStart(4, '0')}`));
    });

    it('every related ID resolves to a record', () => {
      const exists = (id: string) =>
        vm.events.some((e) => e.id === id) ||
        TRADES_0910.some((t) => t.id === id) ||
        DECISIONS.some((d) => d.id === id) ||
        SOURCES.some((s) => s.id === id);
      for (const e of vm.events) {
        for (const id of e.related ?? []) expect(exists(id), `${e.id} → ${id}`).toBe(true);
      }
    });

    it("an agent's last action is its latest event at or before now", () => {
      for (const a of vm.agentRow) {
        const mine = vm.events.filter((e) => e.actor === a.id && ms(e.at) <= nowMs);
        const want = mine.length ? Math.max(...mine.map((e) => ms(e.at))) : null;
        expect(a.lastActionMs, a.id).toBe(want);
      }
      expect(vm.lastAction.atMs).toBeLessThanOrEqual(nowMs);
    });

    it('no event is dated after the clock', () => {
      for (const e of vm.events) expect(ms(e.at), e.id).toBeLessThanOrEqual(nowMs);
    });

    it('every relative time is measured from the one shared now', () => {
      expect(vm.nowMs).toBe(nowMs);
      expect(vm.lastAction.silentMs).toBe(nowMs - vm.lastAction.atMs);
      for (const f of vm.feeds) expect(f.ageSec).toBeCloseTo(Math.max(0, (nowMs - f.lastUpdatedMs) / 1000), 6);
      for (const i of vm.open) {
        if (i.msLeft !== null && i.deadlineMs !== null) expect(i.msLeft).toBe(i.deadlineMs - nowMs);
      }
    });
  });
});

// ---------------------------------------------------------------------------

describe('feeds and the clock', () => {
  eachCase((state, nowMs) => {
    const { vm } = run(state, nowMs);

    it('a feed is late exactly when it is older than its cadence', () => {
      for (const f of vm.feeds) {
        expect(f.late, `${f.name} ${f.ageSec}s / ${f.expectedEverySec}s`).toBe(f.ageSec > f.expectedEverySec);
      }
      expect(vm.health.live).toBe(vm.feeds.length - vm.feeds.filter((f) => f.late).length);
      expect(vm.health.allLive).toBe(vm.feeds.every((f) => !f.late));
    });

    it('a late or recovered entry agrees with that feed’s own timestamps', () => {
      for (const e of vm.events) {
        if (e.type !== 'feed_late' && e.type !== 'feed_recovered') continue;
        const feed = FEEDS.find((f) => f.id === e.feedId);
        expect(feed, `${e.id} names a feed`).toBeTruthy();
        const due = feed!.dueAt ? ms(feed!.dueAt) : feed!.stuckAt[state] ? ms(feed!.stuckAt[state]!) : null;
        expect(due, `${e.id} has something to be late against`).not.toBeNull();
        if (e.type === 'feed_late') {
          // It cannot be reported late before it was due.
          expect(ms(e.at), e.id).toBeGreaterThan(due!);
          const mins = Math.floor((ms(e.at) - due!) / MINUTE);
          expect(e.text, e.id).toContain(`${mins} min`);
        } else {
          expect(feed!.scheduledFrom, `${e.id} has a landing to recover to`).toBeTruthy();
          const gap = Math.floor((ms(feed!.scheduledFrom!) - due!) / MINUTE);
          expect(e.text, e.id).toContain(`${gap} min`);
        }
      }
    });

    it('the silence warning does not fire while agents are still acting', () => {
      const quiet = nowMs - vm.lastAction.atMs;
      expect(vm.lastAction.warn).toBe(quiet >= SILENCE_WARN_MS && nowMs >= MARKET_OPEN_MS);
      // Nothing in this scenario should go ten minutes silent inside the window
      // the tests cover.
      expect(vm.lastAction.warn, `${state}: silent ${Math.round(quiet / MINUTE)} min`).toBe(false);
    });

    it('the Monitoring Agent has checked within the last 30 seconds', () => {
      expect(nowMs - vm.health.checkedMs).toBeLessThan(30_000);
      expect(vm.health.checkedMs).toBeLessThanOrEqual(nowMs);
    });

    it('pieces of an order keep arriving as the clock moves', () => {
      const airtel = vm.orders.find((o) => o.ticker === 'BHARTIARTL')!;
      const later = derive(initialRuntime(state, nowMs + 20 * MINUTE)).orders.find((o) => o.ticker === 'BHARTIARTL')!;
      expect(later.fills.length).toBeLessThanOrEqual(airtel.pieces);
      if (airtel.complete) expect(later.fills.length).toBe(airtel.pieces);
      else expect(later.fills.length).toBeGreaterThan(airtel.fills.length);
      // The world is not frozen: at the demo clock's start there is still work
      // ahead of it.
      if (nowMs === DEMO_START_MS) expect(airtel.complete).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------

describe('story against data', () => {
  eachCase((state, nowMs) => {
    const { rt, vm } = run(state, nowMs);

    /**
     * Percentages that are narrative rather than a figure the fund holds. Each
     * one is a claim about a price move we keep no history for, so there is
     * nothing in the model to check it against.
     */
    const NARRATIVE_PCT: Record<string, string> = {
      'EVT-0011': 'ITC rose 9% this month — a price history the Book does not keep',
      'EVT-0053': 'Nestlé moved 4% on the news — same reason',
      'EVT-0077': 'bank shares rose 6% this month — same reason',
    };

    it('a percentage in the log is a percentage the fund actually has', () => {
      const known = new Set<string>();
      const add = (n: number) => known.add(n.toFixed(1));
      for (const h of vm.fund.holdings) add(h.pct);
      for (const s of vm.fund.sectors) add(s.pct);
      for (const i of vm.open) for (const p of i.previews) { add(p.positionPct); add(p.sectorPct); }
      add(vm.fund.cashPct);
      // A sizing quotes what its own amount would be as a share of the fund,
      // even where the company is not held.
      for (const e of vm.events) {
        if (e.amount === undefined) continue;
        add((e.amount / vm.fund.fundValue) * 100);
        // A block quotes where the position would land if the amount went through.
        const h = e.ticker ? vm.fund.holdings.find((x) => x.ticker === e.ticker) : undefined;
        if (h) add(((h.value + e.amount) / vm.fund.fundValue) * 100);
      }
      add(LIMITS.maxCompanyPct);
      add(LIMITS.maxSectorPct);
      add(LIMITS.firstPositionPct);
      add(LIMITS.nearLimitPct);
      add(LIMITS.minCashPct);
      // The weight an order was sized against, before its own fills moved it.
      for (const o of vm.orders) {
        const h = vm.fund.holdings.find((x) => x.ticker === o.ticker)!;
        const signed = (o.side === 'buy' ? 1 : -1) * o.sizeRupees;
        const before = h.value - signed * (o.filledShares / o.shares);
        add(((before + signed) / vm.fund.fundValue) * 100);
        const sector = vm.fund.sectors.find((s) => s.name === h.sector)!;
        const sBefore = sector.value - signed * (o.filledShares / o.shares);
        add(((sBefore + signed) / vm.fund.fundValue) * 100);
      }
      for (const e of vm.events) {
        if (e.key && NARRATIVE_PCT[e.key]) continue;
        for (const m of e.text.matchAll(/(\d+(?:\.\d)?)%/g)) {
          const v = Number(m[1]);
          expect(known.has(v.toFixed(1)), `${e.id} claims ${m[0]}: ${e.text}`).toBe(true);
        }
      }
    });

    it('a blocked entry names a figure that really is over its limit', () => {
      for (const e of vm.events.filter((x) => x.type === 'risk_blocked' || x.type === 'limit_broken')) {
        const pcts = [...e.text.matchAll(/(\d+(?:\.\d)?)%/g)].map((m) => Number(m[1]));
        expect(pcts.length, e.id).toBeGreaterThanOrEqual(2);
        const [claimed, limit] = pcts;
        expect(claimed, `${e.id}: ${e.text}`).toBeGreaterThan(limit);
      }
    });

    it('a cleared entry names a figure that really is inside its limit', () => {
      for (const e of vm.events.filter((x) => x.type === 'risk_cleared')) {
        const pcts = [...e.text.matchAll(/(\d+(?:\.\d)?)%/g)].map((m) => Number(m[1]));
        if (pcts.length < 2) continue;
        const [claimed, limit] = pcts;
        expect(claimed, `${e.id}: ${e.text}`).toBeLessThanOrEqual(limit);
      }
    });

    it('a limit reason that names a trade names one that happened', () => {
      for (const r of vm.limits.all) {
        if (!r.why) continue;
        expect(r.why, r.key).not.toMatch(/no agent (bought|traded) anything/);
        for (const m of r.why.matchAll(/₹(\d+\.\d) cr/g)) {
          expect(Number(m[1]), `${r.key}: ${r.why}`).toBeGreaterThan(0);
        }
      }
    });

    it('a first position is capped by the rule, not by a typed number', () => {
      for (const d of resolvedDecisionsFor(rt)) {
        if (d.kind !== 'proposal') continue;
        expect(d.amount).toBeCloseTo(cappedAmount(d, vm.fund.fundValue), 6);
        if (d.capRule === 'firstPosition') {
          const pct = (d.amount / vm.fund.fundValue) * 100;
          expect(pct, `${d.id} at ${pct}%`).toBeLessThanOrEqual(LIMITS.firstPositionPct + 1e-9);
          expect(d.versions[d.versions.length - 1].amount).toBeCloseTo(d.amount, 6);
          expect(d.versions[0].amount).toBe(d.sizedAmount);
        }
        // The ask on the card quotes the same size and the same share of the fund.
        const item = [...vm.open, ...vm.closed].find((i) => i.id === d.id) as QueueItem | undefined;
        if (item) {
          expect(item.ask).toContain((d.amount / CR).toFixed(1));
        }
      }
    });

    it('an agent live line never claims work the log does not show', () => {
      const research = vm.agents.research;
      // Research cannot still be reading a filing it has already proposed from.
      const proposedFrom = vm.events
        .filter((e) => e.type === 'idea_found' && e.actor === 'research')
        .map((e) => e.company ?? '');
      if (research.status === 'Running') {
        for (const company of proposedFrom) {
          expect(research.liveLine, `still reading ${company}`).not.toContain(`${company}'s`);
        }
      }
      // Compliance cannot be checking proposals that are not open.
      const openProposals = vm.open.filter((i) => i.kind === 'proposal' && i.raisedBy !== '').length;
      if (vm.agents.compliance.liveLine.includes('open proposals')) {
        const claimed = Number(vm.agents.compliance.liveLine.match(/(\d+) open proposals/)?.[1] ?? -1);
        expect(claimed).toBe(openProposals);
      }
      // Risk cannot be working a size the Portfolio Agent has not made.
      if (vm.agents.portfolio.status === 'Waiting') {
        expect(vm.agents.risk.liveLine).not.toMatch(/bull case/i);
      }
    });

    it('a past decision agrees with whether the fund holds the company', () => {
      const parseWhen = (s: string) => Date.parse(`1 ${s}`);
      for (const d of DECISIONS) {
        const past = d.kind === 'proposal' ? d.pastSimilar : d.kind === 'verdict' ? d.pastDisputes : [];
        for (const p of past) {
          const holding = HOLDINGS.find((h) => h.company === p.company);
          const declined = /declined|Expired|sided with Bear/i.test(p.decision) || /missed|avoided/i.test(p.outcome);
          if (!declined) continue;
          if (!holding) continue;
          // We can hold a company we declined to add to, but not one we first
          // bought because of the decision we declined.
          // Holding a company we declined to add to is fine; the fund owned it
          // before. Buying it in the very month we declined it is not.
          const when = new Date(parseWhen(p.when));
          const bought = new Date(holding.boughtOn);
          const sameMonth = bought.getUTCFullYear() === when.getUTCFullYear() && bought.getUTCMonth() === when.getUTCMonth();
          expect(
            sameMonth,
            `${p.company}: ${p.decision} in ${p.when} but first bought ${holding.boughtOn}`,
          ).toBe(false);
        }
      }
    });

    it('the growth figures in the Infosys case are consistent with its own filing', () => {
      const d = DECISIONS.find((x) => x.id === 'DEC-0911-01');
      if (!d || d.kind !== 'proposal') return;
      const [high, low] = d.conflict.sides.map((s) => Number(s.value.match(/(\d+(?:\.\d)?)/)?.[1]));
      const q1 = Number(d.reasoning.join(' ').match(/growth of (\d+\.\d)%/)?.[1]);
      expect(q1).toBeGreaterThan(0);
      expect(high).toBeGreaterThan(low);
      // A full-year figure the rest of the year has to reach. More than double
      // the run rate is a forecast nobody would print.
      const impliedRest = (high * 4 - q1) / 3;
      expect(impliedRest, `Q1 ${q1}%, FY ${high}% implies ${impliedRest.toFixed(1)}%`).toBeLessThan(q1 * 3);
      expect(low).toBeLessThanOrEqual(q1 + 1);
    });
  });
});

// ---------------------------------------------------------------------------

describe('the Book itself', () => {
  it('nothing in the Book is quietly a display figure', () => {
    // A holding carries an opening share count and a traded value, and no
    // computed figure at all.
    for (const h of HOLDINGS) {
      expect(Number.isInteger(h.shares), h.ticker).toBe(true);
      expect(h.advRupees, h.ticker).toBeGreaterThan(0);
      expect(h).not.toHaveProperty('value');
      expect(h).not.toHaveProperty('pct');
    }
    expect(HOLDINGS.length).toBe(24);
    expect(new Set(HOLDINGS.map((h) => h.ticker)).size).toBe(HOLDINGS.length);
  });

  it("the opening book is the 10 Sep close, not what today's screen shows", () => {
    const { vm } = run('normal', DEMO_START_MS);
    const traded = new Set(ORDERS_TODAY.map((o) => o.ticker));
    for (const ticker of traded) {
      const now = vm.fund.holdings.find((h) => h.ticker === ticker)!.shares;
      expect(now, ticker).not.toBe(openingShares(ticker, 'normal'));
    }
  });

  it('an authored event carries structure, not a number typed into a sentence', () => {
    for (const e of EVENTS) {
      // A rupee figure inside an authored template would be a number nothing can
      // check. The only ones allowed are the tokens.
      expect(e.text, e.id).not.toMatch(/₹\d/);
      expect(e.text, e.id).not.toMatch(/\d+ lakh/);
    }
  });

  it('every sector has a target, and a trim moves its sector towards it', () => {
    const { vm } = run('normal', DEMO_START_MS);
    const { ctx } = contextFor(initialRuntime('normal', DEMO_START_MS));
    expect(Object.keys(buildTokens(ctx)).length).toBeGreaterThan(0);
    const trim = vm.events.find((e) => e.type === 'trim' && e.text.includes('target weight'));
    expect(trim, 'a trim that names a target').toBeTruthy();
    const order = vm.orders.find((o) => o.id === trim!.orderId)!;
    const spec = holdingSpec(order.ticker)!;
    const sector = vm.fund.sectors.find((s) => s.name === spec.sector)!;
    const before = sector.value + order.sizeRupees;
    const target = (SECTOR_TARGETS_PCT[spec.sector] / 100) * vm.fund.fundValue;
    expect(Math.abs(sector.value - target)).toBeLessThan(Math.abs(before - target));
  });

  it('the Axis Bank difference is the one the mismatch claims', () => {
    const d = DECISIONS.find((x) => x.kind === 'break');
    if (!d || d.kind !== 'break') return;
    const trade = TRADES_0910.find((t) => t.id === d.tradeId)!;
    expect(d.price).toBe(trade.price);
    expect(d.ourShares).toBe(trade.shares);
    const diff = breakDifference(d);
    expect(diff.shares).toBe(1500);
    expect(diff.rupees / 100_000).toBeCloseTo(17.6, 1);
  });
});

import { SECTOR_TARGETS } from '../scenario';
const SECTOR_TARGETS_PCT = SECTOR_TARGETS;
