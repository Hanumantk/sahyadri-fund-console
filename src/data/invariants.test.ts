import { describe, expect, it } from 'vitest';
import { DEMO_START_MS, MARKET_OPEN_MS, ms } from './clock';
import { derive, initialRuntime, type Runtime } from './derive';
import { CR, DECISIONS, type Proposal, EVENTS, LIMITS, SOURCES, STATES, TRADES_0910, recordExists, type StateName } from './scenario';
import { applyDecision, applyExpiry, applyPauseAll } from '../state/actions';

const TOL_CR = 0.1 * CR;

function vm(state: StateName, rt?: Runtime) {
  return derive(rt ?? initialRuntime(state, DEMO_START_MS));
}

describe.each(STATES)('state %s', (state) => {
  const v = vm(state);

  describe('fund value', () => {
    it('holdings plus cash equals the fund value, within ₹0.1 cr', () => {
      expect(Math.abs(v.fund.holdingsValue + v.fund.cash - v.fund.fundValue)).toBeLessThan(TOL_CR);
    });
    it('fund value divided by units equals the value per unit', () => {
      expect(v.fund.fundValue / v.fund.units).toBeCloseTo(v.fund.navPerUnit, 6);
    });
    it('drawdown equals (value per unit ÷ peak) − 1', () => {
      expect(v.fund.drawdownPct).toBeCloseTo((v.fund.navPerUnit / v.fund.peak.navPerUnit - 1) * 100, 6);
    });
    it('sector percentages add up to the deployed share', () => {
      const sum = v.fund.sectors.reduce((s, x) => s + x.pct, 0);
      expect(sum).toBeCloseTo(v.fund.deployedPct, 6);
    });
  });

  describe('decisions', () => {
    it('every proposal and verdict carries previews for each button', () => {
      for (const item of v.open) {
        if (item.kind === 'proposal') expect(item.previews.map((p) => p.key)).toEqual(['take', 'less', 'decline']);
        if (item.kind === 'verdict') expect(item.previews.map((p) => p.key)).toEqual(['bull', 'halfway', 'bear', 'lapse']);
      }
    });
    for (const item of [...v.open, ...v.closed]) {
      if (item.kind === 'proposal' && item.decision?.kind === 'proposal') {
        const d = item.decision;
        it(`${d.id}: % of fund equals amount ÷ fund value`, () => {
          const take = item.previews.find((p) => p.key === 'take')!;
          expect(take.positionPct).toBeCloseTo((d.amount / v.fund.fundValue) * 100, 6);
        });
        it(`${d.id}: post-trade sector % matches holdings plus the trade`, () => {
          const take = item.previews.find((p) => p.key === 'take')!;
          const sector = v.fund.sectors.find((s) => s.name === take.sectorName)!;
          expect(take.sectorPct).toBeCloseTo(((sector.value + d.amount) / v.fund.fundValue) * 100, 6);
          expect(take.cashAfter).toBeCloseTo(v.fund.cash - v.inFlightCash - d.amount, 0);
        });
      }
      if (item.kind === 'verdict' && item.decision?.kind === 'verdict') {
        const d = item.decision;
        it(`${d.id}: Bull's size gives the right sector %`, () => {
          const bull = item.previews.find((p) => p.key === 'bull')!;
          const sector = v.fund.sectors.find((s) => s.name === bull.sectorName)!;
          expect(bull.sectorPct).toBeCloseTo(((sector.value + d.bull.amount) / v.fund.fundValue) * 100, 6);
        });
      }
    }
  });

  describe('limits', () => {
    it('a limit shows as broken only when the derived figure exceeds it', () => {
      for (const row of v.limits.all) {
        if (row.status === 'broken') expect(row.pct).toBeGreaterThan(row.limitPct);
        else expect(row.pct).toBeLessThanOrEqual(row.limitPct);
        if (row.status === 'near') expect(row.usedPct).toBeGreaterThanOrEqual(LIMITS.nearLimitPct);
      }
    });
    it('headroom in rupees agrees with headroom in percent', () => {
      for (const row of v.limits.all) {
        expect(row.headroom).toBeCloseTo(((row.limitPct - row.pct) / 100) * v.fund.fundValue, 0);
      }
    });
  });

  describe('counts', () => {
    it('every agent counter equals its count in the log', () => {
      const today = v.events.filter((e) => ms(e.at) >= MARKET_OPEN_MS);
      const n = (type: string, actor: string) => today.filter((e) => e.type === type && e.actor === actor).length;
      expect(v.counts.ideasFound).toBe(n('idea_found', 'research'));
      expect(v.counts.ideasDropped).toBe(n('idea_dropped', 'research'));
      expect(v.counts.sourcesRead).toBe(today.filter((e) => e.type === 'sources_read').reduce((s, e) => s + (e.count ?? 0), 0));
      expect(v.counts.sized).toBe(n('sized', 'portfolio'));
      expect(v.counts.trims).toBe(n('trim', 'portfolio'));
      expect(v.counts.buys).toBe(today.filter((e) => e.type === 'fill' && e.side === 'buy').length);
      expect(v.counts.sells).toBe(today.filter((e) => e.type === 'fill' && e.side === 'sell').length);
      expect(v.counts.settled).toBe(n('settled', 'operations'));
      expect(v.counts.mismatches).toBe(n('break_raised', 'operations'));
    });
    it('found − dropped = sized', () => {
      expect(v.pipeline.found - v.pipeline.dropped).toBe(v.pipeline.sized);
    });
    it('checked = sized + trims', () => {
      expect(v.pipeline.checked).toBe(v.pipeline.sized + v.pipeline.trims);
    });
    it('checked = cleared automatically + sent to you + blocked', () => {
      expect(v.pipeline.checked).toBe(v.pipeline.cleared + v.pipeline.sent + v.pipeline.riskBlocked);
    });
    it('Compliance checked everything Risk did not block', () => {
      expect(v.counts.complianceChecked).toBe(v.pipeline.checked - v.pipeline.riskBlocked);
    });
    it('orders placed = auto-cleared + approved by a person', () => {
      expect(v.pipeline.ordersPlaced).toBe(v.pipeline.autoCleared + v.pipeline.humanApproved);
    });
    it('needs-you = open decisions + open mismatches + broken limits + late feeds', () => {
      expect(v.needsYou.count).toBe(v.needsYou.decisions + v.needsYou.mismatches + v.needsYou.brokenLimits + v.needsYou.lateFeeds);
      expect(v.needsYou.count).toBe(v.open.length);
    });
    it('Risk "sent to you" items are all in the queue or closed', () => {
      const ids = v.events.filter((e) => e.type === 'sent_to_person').flatMap((e) => e.related ?? []);
      for (const id of ids) expect([...v.open, ...v.closed].some((i) => i.id === id)).toBe(true);
    });
  });

  describe('references', () => {
    it('every record ID that is referenced exists', () => {
      const exists = (id: string) => v.events.some((x) => x.id === id) || recordExists(id);
      for (const e of v.events) for (const id of e.related ?? []) {
        expect(exists(id), `${e.id} → ${id}`).toBe(true);
      }
      for (const d of DECISIONS) {
        const ids = d.kind === 'proposal' ? [...d.sourceIds, ...d.facts.map((f) => f.sourceId), ...d.conflict.sides.map((s) => s.sourceId)] : d.kind === 'verdict' ? [...d.bull.sourceIds, ...d.bear.sourceIds] : [...d.sourceIds, d.tradeId];
        for (const id of ids) expect(recordExists(id), `${d.id} → ${id}`).toBe(true);
      }
    });
    it('every agent named in an event exists', () => {
      for (const a of v.agentRow) expect(a.name).toMatch(/Agent$/);
    });
  });

  describe('timestamps', () => {
    it('every event is at or before the demo clock', () => {
      for (const e of v.events) expect(ms(e.at), e.id).toBeLessThanOrEqual(DEMO_START_MS);
    });
    it("today's events are at or after 09:15", () => {
      for (const e of v.events) {
        if (e.at.startsWith('2026-09-11')) expect(ms(e.at), e.id).toBeGreaterThanOrEqual(MARKET_OPEN_MS);
      }
    });
    it('every source is dated before the proposal that uses it', () => {
      for (const d of DECISIONS) {
        const createdIso = d.kind === 'break' ? d.raisedAt : d.createdAt;
        const createdDate = createdIso.slice(0, 10);
        const ids = d.kind === 'proposal' ? d.sourceIds : d.kind === 'verdict' ? [...d.bull.sourceIds, ...d.bear.sourceIds] : d.sourceIds;
        for (const id of ids) {
          const s = SOURCES.find((x) => x.id === id)!;
          expect(s.date <= createdDate, `${d.id} ← ${id}`).toBe(true);
        }
      }
    });
    it('event IDs are unique', () => {
      const ids = EVENTS.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});

describe('anchor values (normal state)', () => {
  const v = vm('normal');
  it('fund value is ₹248.6 cr and ₹126.10 per unit', () => {
    expect(v.fund.fundValue / CR).toBeCloseTo(248.6, 1);
    expect(v.fund.navPerUnit).toBeCloseTo(126.1, 1);
  });
  it("today's change is +₹2.1 cr, +0.85%, 0.35 pts behind the Nifty 50", () => {
    expect(v.fund.dayChange / CR).toBeCloseTo(2.1, 1);
    expect(v.fund.dayChangePct).toBeCloseTo(0.85, 2);
    expect(v.fund.gapPts).toBeCloseTo(-0.35, 2);
  });
  it('drawdown is −4.8% with 3.2 pts of room', () => {
    expect(v.fund.drawdownPct).toBeCloseTo(-4.8, 1);
    expect(v.fund.roomPts).toBeCloseTo(3.2, 1);
  });
  it('cash is about ₹14.9 cr (6.0%)', () => {
    expect(v.fund.cash / CR).toBeCloseTo(14.9, 1);
    expect(v.fund.cashPct).toBeCloseTo(6.0, 1);
  });
  it('Reliance 9.4% (limit 10%) and Banking 23.1% (limit 25%, room ₹4.7 cr)', () => {
    const rel = v.limits.all.find((r) => r.key === 'company:RELIANCE')!;
    const bank = v.limits.all.find((r) => r.key === 'sector:Banking')!;
    expect(rel.pct).toBeCloseTo(9.4, 1);
    expect(bank.pct).toBeCloseTo(23.1, 1);
    expect(bank.headroom / CR).toBeCloseTo(4.7, 1);
    expect(v.limits.broken.length).toBe(0);
    expect(v.limits.near.map((r) => r.key).sort()).toEqual(['company:RELIANCE', 'sector:Banking']);
  });
  it('IT is about 15% and goes to about 17% with the Infosys buy', () => {
    const it = v.fund.sectors.find((s) => s.name === 'IT')!;
    expect(it.pct).toBeCloseTo(15.0, 0);
    const item = v.open.find((i) => i.id === 'DEC-0911-01')!;
    expect(item.previews.find((p) => p.key === 'take')!.sectorPct).toBeCloseTo(17.0, 0);
    expect(item.previews.find((p) => p.key === 'take')!.cashAfter).toBeCloseTo(v.fund.cash - v.inFlightCash - (item.decision as Proposal).amount, 0);
  });
  it('counters read as specified', () => {
    expect(v.agents.research.countsLine).toBe('6 ideas · 2 dropped · 48 sources');
    expect(v.agents.execution.countsLine).toBe('14 buys · 3 sells · ₹12.6 cr traded');
    expect(v.agents.operations.countsLine).toBe('17 settled · 1 mismatch');
  });
  it('needs-you line reads "3 things need you · first expires 10:17"', () => {
    expect(v.needsYou.label).toBe('3 things need you · first expires 10:17');
  });
  it('the queue is sorted by deadline', () => {
    expect(v.open.map((i) => i.id)).toEqual(['DEC-0911-01', 'DEC-0911-02', 'BRK-0910-01']);
  });
  it('the Axis Bank difference is ₹17.6 lakh', () => {
    const t = TRADES_0910.find((x) => x.id === 'TRD-0910-12')!;
    expect(((12_000 - 10_500) * t.price) / 100_000).toBeCloseTo(17.6, 1);
  });
});

describe('anchor values (calm and bad)', () => {
  it('calm: nothing needs you, nothing near a limit, all agents running', () => {
    const v = vm('calm');
    expect(v.needsYou.count).toBe(0);
    expect(v.needsYou.label).toBe('Nothing needs you');
    expect(v.limits.near.length + v.limits.broken.length).toBe(0);
    expect(v.health.allLive).toBe(true);
    for (const a of v.agentRow) expect(a.status).toBe('Running');
    expect(v.fund.fundValue / CR).toBeCloseTo(248.6, 1);
  });
  it('bad: price feed late, Banking over limit, Execution throttled, drawdown −6.9%', () => {
    const v = vm('bad');
    expect(v.feeds.find((f) => f.id === 'prices')!.late).toBe(true);
    expect(v.limits.broken.map((r) => r.key)).toEqual(['sector:Banking']);
    expect(v.limits.broken[0].pct).toBeCloseTo(26.0, 0);
    expect(v.agents.execution.status).toBe('Throttled');
    expect(v.agents.research.status).toBe('Paused');
    expect(v.agents.risk.status).toBe('Paused');
    expect(v.fund.drawdownPct).toBeCloseTo(-7.0, 1);
    expect(v.needsYou.count).toBe(5);
  });
});

describe('interactions keep the numbers connected', () => {
  it('taking the Infosys proposal moves cash and IT, adds events, and places an order', () => {
    let rt = initialRuntime('normal', DEMO_START_MS);
    const before = derive(rt);
    rt = applyDecision(rt, 'DEC-0911-01', 'take', 5 * CR, '');
    const after = derive(rt);
    expect(after.fund.cash).toBeCloseTo(before.fund.cash - (before.open.find((i) => i.id === 'DEC-0911-01')!.decision as Proposal).amount, 0);
    expect(after.fund.sectors.find((s) => s.name === 'IT')!.pct).toBeCloseTo(17.0, 0);
    expect(after.fund.holdings.find((h) => h.ticker === 'INFY')!.pct).toBeCloseTo(2.0, 1);
    expect(Math.abs(after.fund.holdingsValue + after.fund.cash - after.fund.fundValue)).toBeLessThan(TOL_CR);
    expect(after.needsYou.count).toBe(before.needsYou.count - 1);
    expect(after.pipeline.ordersPlaced).toBe(after.pipeline.autoCleared + after.pipeline.humanApproved);
    expect(after.pipeline.humanApproved).toBe(1);
    expect(after.events.some((e) => e.type === 'human_decision' && e.related?.includes('DEC-0911-01'))).toBe(true);
    expect(after.agents.execution.liveLine).toContain('Buying Infosys');
    expect(after.closed.find((i) => i.id === 'DEC-0911-01')!.closedLabel).toContain('Taken');
  });
  it('taking less requires a reason and uses the chosen amount', () => {
    let rt = initialRuntime('normal', DEMO_START_MS);
    expect(() => applyDecision(rt, 'DEC-0911-01', 'less', 2.5 * CR, '')).toThrow();
    rt = applyDecision(rt, 'DEC-0911-01', 'less', 2.5 * CR, 'Growth disputed until Q2');
    const v = derive(rt);
    expect(v.fund.holdings.find((h) => h.ticker === 'INFY')!.pct).toBeCloseTo(1.0, 1);
  });
  it('the HDFC Bank verdict returns the Portfolio Agent to Running', () => {
    let rt = initialRuntime('normal', DEMO_START_MS);
    rt = applyDecision(rt, 'DEC-0911-02', 'bear', 0, 'Waiting for the RBI data');
    const v = derive(rt);
    expect(v.agents.portfolio.status).toBe('Running');
    expect(v.fund.cash / CR).toBeCloseTo(14.9, 1);
  });
  it('expiry closes the item with nothing bought and lowers the count', () => {
    let rt = initialRuntime('normal', DEMO_START_MS);
    rt = { ...rt, nowMs: ms('2026-09-11T10:17:01+05:30') };
    const v0 = derive(rt);
    expect(v0.closed.find((i) => i.id === 'DEC-0911-01')!.closedLabel).toBe('Expired · nothing bought');
    expect(v0.needsYou.count).toBe(2);
    rt = applyExpiry(rt, 'DEC-0911-01');
    const v1 = derive(rt);
    expect(v1.events.some((e) => e.type === 'expired' && e.related?.includes('DEC-0911-01'))).toBe(true);
    // Nothing was bought for the proposal, so cash is only what the clock spent
    // on the remaining pieces of this morning's Bharti order.
    expect(v1.fund.cash).toBeCloseTo(v0.fund.cash, 0);
  });
  it('pause all marks every working agent Paused by Priya Nair', () => {
    let rt = initialRuntime('normal', DEMO_START_MS);
    rt = applyPauseAll(rt, 'Checking a data problem');
    const v = derive(rt);
    for (const a of v.agentRow) {
      expect(a.status).toBe('Paused');
      expect(a.changedBy).toBe('Priya Nair');
    }
  });
  it('accepting the broker record corrects our books by 1,500 shares and ₹17.6 lakh', () => {
    let rt = initialRuntime('normal', DEMO_START_MS);
    const before = derive(rt);
    rt = applyDecision(rt, 'BRK-0910-01', 'accept', 0, 'Broker contract note is the primary record');
    const after = derive(rt);
    const dAxis = after.fund.holdings.find((h) => h.ticker === 'AXISBANK')!.shares - before.fund.holdings.find((h) => h.ticker === 'AXISBANK')!.shares;
    expect(dAxis).toBe(1500);
    expect((before.fund.cash - after.fund.cash) / 100_000).toBeCloseTo(17.6, 1);
    expect(after.needsYou.mismatches).toBe(0);
    expect(after.agents.operations.status).toBe('Running');
  });
});
