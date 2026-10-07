/**
 * What an override may and may not do.
 *
 * These are not tests of the screen. They are the rules the screen is allowed to
 * offer, held in one place so a later change to a panel cannot quietly widen
 * them. The one that matters most is the first: there is no path through this
 * product by which the person at the console lifts a Compliance block — only a
 * request to the person who may, which stays on screen until it is answered.
 */

import { describe, expect, it } from 'vitest';
import { DEMO_START_MS, ms } from '../clock';
import { derive, initialRuntime, type Runtime } from '../derive';
import { INITIAL_RULEBOOK } from '../rulebook';
import {
  AUTHORITY,
  CURRENT_USER,
  LIMITS,
  OVERRIDE_LAPSES_AT,
  OVERRIDE_POLICY,
  REOPEN_EXTENSION_MIN,
  STATES,
  type StateName,
} from '../scenario';
import {
  applyAgentResume,
  applyCapOverride,
  applyChase,
  applyEscalate,
  applyExpiry,
  applyLimitException,
  applyOverride,
  applyReinstate,
  applyReopen,
  applyRestoreSpeed,
  applyStopOrder,
  applyTrim,
  applyWithdrawEscalation,
  applyWithdrawOverride,
} from '../../state/actions';

const CASH_TOL = 1; // rupees
const MIN = 60 * 1000;

function rt(state: StateName, at = DEMO_START_MS): Runtime {
  return initialRuntime(state, at);
}

function vm(r: Runtime) {
  return derive(r);
}

function riskBlock(state: StateName) {
  return vm(rt(state)).overrides.find((o) => o.kind === 'risk-block') ?? null;
}

function complianceBlock(state: StateName) {
  return vm(rt(state)).overrides.find((o) => o.kind === 'compliance-block') ?? null;
}

/** Whatever happens, the three ways an order is placed still add up. */
function pipelineAddsUp(r: Runtime) {
  const p = vm(r).pipeline;
  expect(p.ordersPlaced).toBe(p.autoCleared + p.humanApproved + p.onOverride);
}

describe('there is something to test', () => {
  // Several tests below step aside when a state has no case of that kind. This
  // asserts the fixtures exist, so the suite cannot quietly become hollow.
  it('a Risk block and a Compliance block exist to override', () => {
    expect(riskBlock('normal')).toBeTruthy();
    expect(complianceBlock('normal')).toBeTruthy();
    expect(riskBlock('normal')!.preview).toBeTruthy();
  });
  it('an order is part-placed, so there is something to stop', () => {
    const order = vm(rt('normal')).orders.find((o) => o.stoppable)!;
    expect(order.placedPieces).toBeGreaterThan(0);
    expect(order.unplacedPieces).toBeGreaterThan(0);
  });
  it('the bad state has an agent halted by another agent, a broken limit and a throttle', () => {
    const v = vm(rt('bad'));
    expect(Object.values(v.agents).some((a) => a.haltedByAgent)).toBe(true);
    expect(v.limitOverrides.length).toBeGreaterThan(0);
    expect(Object.values(v.agents).some((a) => a.throttledByPerson)).toBe(true);
  });
  it('the normal state has a capped proposal and dropped ideas', () => {
    const v = vm(rt('normal'));
    expect(v.open.some((i) => i.capOverride)).toBe(true);
    expect(v.agents.research.dropped.length).toBeGreaterThan(0);
  });
  it('an agent that put itself in Waiting has not been halted by anyone', () => {
    expect(Object.values(vm(rt('normal')).agents).some((a) => a.haltedByAgent)).toBe(false);
  });
});

describe('the Compliance door stays shut', () => {
  for (const state of STATES) {
    it(`${state}: the console refuses to lift a Compliance block`, () => {
      const block = complianceBlock(state);
      if (!block) return;
      expect(block.verdict).toBe('refused');
      expect(() => applyOverride(rt(state), block.key, 'any reason at all', 'Risk Manager')).toThrow();
    });

    it(`${state}: no co-signer unlocks it, because the rule is about the role`, () => {
      const block = complianceBlock(state);
      if (!block) return;
      for (const cosigner of ['Compliance Officer', 'Fund Manager', 'Risk Manager', null]) {
        expect(() => applyOverride(rt(state), block.key, 'reason', cosigner)).toThrow();
      }
    });

    it(`${state}: it can be sent to the person who may, by name`, () => {
      const block = complianceBlock(state);
      if (!block) return;
      expect(block.askInsteadName).toBe('Kavya Rao');
    });
  }

  it('the policy names a role the person at the console does not hold', () => {
    const policy = OVERRIDE_POLICY['compliance-block'];
    expect(policy.mayOverrule).not.toContain(AUTHORITY[CURRENT_USER]);
    expect(policy.mayOverrule.length).toBeGreaterThan(0);
  });
});

describe('escalation', () => {
  const block = complianceBlock('normal')!;

  it('records the refusal and the request, and only once', () => {
    const before = vm(rt('normal')).events.length;
    const once = applyEscalate(rt('normal'), block.key);
    const v = vm(once);
    expect(v.events.length).toBe(before + 2);
    expect(v.events.some((e) => e.type === 'override_refused')).toBe(true);
    expect(v.events.some((e) => e.type === 'escalated' && /Kavya Rao/.test(e.text))).toBe(true);
    expect(vm(applyEscalate(once, block.key)).events.length).toBe(before + 2);
  });

  it('stays on screen, pointing back at what it is about, until withdrawn', () => {
    const sent = applyEscalate(rt('normal'), block.key);
    const x = vm(sent).escalations[0];
    expect(x.toName).toBe('Kavya Rao');
    expect(x.selection).toEqual({ kind: 'blocked', id: block.key });
    // Ten minutes on, it is still there and says how long it has waited.
    const later = vm({ ...sent, nowMs: sent.nowMs + 10 * MIN });
    expect(later.escalations).toHaveLength(1);
    expect(later.escalations[0].waitingLine).toMatch(/without an answer/);
    const gone = vm(applyWithdrawEscalation(sent, x.id, 'sorted it on the phone'));
    expect(gone.escalations).toHaveLength(0);
    expect(gone.events.some((e) => e.type === 'escalation_withdrawn')).toBe(true);
  });

  it('a chase is recorded and counted, and does nothing else', () => {
    const sent = applyEscalate(rt('normal'), block.key);
    const x = vm(sent).escalations[0];
    // Measured at the same moment, because the clock moving fills order pieces.
    const later = { ...sent, nowMs: sent.nowMs + 5 * MIN };
    const v = vm(applyChase(later, x.id));
    expect(v.escalations[0].chasedAtMs).toHaveLength(1);
    expect(v.escalations[0].waitingLine).toMatch(/chased once/);
    expect(v.fund.cash).toBe(vm(later).fund.cash);
  });

  it('it refuses to escalate what you may do yourself', () => {
    expect(() => applyEscalate(rt('normal'), riskBlock('normal')!.key)).toThrow(/yourself/);
  });

  it('it does not change the fund, and it does not change the block', () => {
    const before = vm(rt('normal'));
    const after = vm(applyEscalate(rt('normal'), block.key));
    expect(after.fund.fundValue).toBe(before.fund.fundValue);
    expect(after.counts.complianceBlocked).toBe(before.counts.complianceBlocked);
    expect(after.overrides.find((o) => o.key === block.key)!.exception).toBeNull();
  });
});

describe('overruling a Risk block', () => {
  for (const state of STATES) {
    const block = riskBlock(state);
    if (!block) continue;

    it(`${state}: it needs a reason`, () => {
      expect(() => applyOverride(rt(state), block.key, '   ', 'Risk Manager')).toThrow(/reason/i);
    });

    it(`${state}: above the threshold it needs a second person`, () => {
      if (block.verdict !== 'needs-cosign') return;
      expect(() => applyOverride(rt(state), block.key, 'a reason', null)).toThrow(/sign/i);
      expect(() => applyOverride(rt(state), block.key, 'a reason', 'Risk Manager')).not.toThrow();
    });

    it(`${state}: the co-sign threshold is read against the resulting position`, () => {
      const rule = OVERRIDE_POLICY['risk-block'].cosign;
      if (rule.when !== 'above-position') throw new Error('expected a position threshold');
      expect(block.verdict === 'needs-cosign').toBe(block.preview!.positionPct > rule.pct);
    });

    it(`${state}: it lapses the same day, and says what happens then`, () => {
      const ex = vm(applyOverride(rt(state), block.key, 'a reason', 'Risk Manager')).exceptions[0];
      expect(ex.lapsesAtMs).toBe(ms(OVERRIDE_LAPSES_AT));
      expect(ex.lapsesAtMs).toBeGreaterThan(ex.grantedAtMs);
      expect(ex.kind).toBe('risk-block');
    });

    it(`${state}: it cannot be granted twice`, () => {
      const next = applyOverride(rt(state), block.key, 'a reason', 'Risk Manager');
      expect(() => applyOverride(next, block.key, 'again', 'Risk Manager')).toThrow(/already/i);
    });

    it(`${state}: the block keeps its place in the log and in the count`, () => {
      const before = vm(rt(state));
      const after = vm(applyOverride(rt(state), block.key, 'a reason', 'Risk Manager'));
      expect(after.events.some((e) => e.key === block.key && e.type === 'risk_blocked')).toBe(true);
      expect(after.counts.riskBlocked).toBe(before.counts.riskBlocked);
      const row = after.blocked.find((b) => b.key === block.key)!;
      expect(row.overriddenAtMs).not.toBeNull();
      expect(row.label).toMatch(/Overridden/);
    });

    it(`${state}: it buys exactly the amount the agent refused, and no more`, () => {
      const before = vm(rt(state));
      const after = vm(applyOverride(rt(state), block.key, 'a reason', 'Risk Manager'));
      const held = (v: ReturnType<typeof vm>) => v.fund.holdings.find((h) => h.ticker === block.ticker)!.value;
      expect(held(after) - held(before)).toBeCloseTo(block.amount, -2);
      expect(Math.abs(before.fund.cash - after.fund.cash - block.amount)).toBeLessThan(CASH_TOL);
    });

    it(`${state}: the order counts as placed on your override, and the pipeline still adds up`, () => {
      const r = applyOverride(rt(state), block.key, 'a reason', 'Risk Manager');
      expect(vm(r).pipeline.onOverride).toBe(1);
      pipelineAddsUp(r);
    });

    it(`${state}: the agent acknowledges without moving any count of what agents decided`, () => {
      const before = vm(rt(state));
      const after = vm(applyOverride(rt(state), block.key, 'a reason', 'Risk Manager'));
      const ack = after.events.find((e) => e.actor === block.agent && e.type === 'override_acknowledged')!;
      expect(ack.text).toMatch(/still counting/);
      expect(after.counts.riskChecked).toBe(before.counts.riskChecked);
      expect(after.counts.agentsPaused).toBe(before.counts.agentsPaused);
    });

    it(`${state}: whoever the rules say must be told, is told`, () => {
      const after = vm(applyOverride(rt(state), block.key, 'a reason', 'Risk Manager'));
      expect(after.events.some((e) => /Arjun Mehta told of/.test(e.text))).toBe(true);
    });

    it(`${state}: the blocked entry still quotes the figure the agent measured`, () => {
      const before = vm(rt(state)).events.find((e) => e.key === block.key)!.text;
      const after = vm(applyOverride(rt(state), block.key, 'a reason', 'Risk Manager')).events.find((e) => e.key === block.key)!.text;
      expect(after).toBe(before);
    });

    it(`${state}: the breach it causes shows on the front page, held on its exception`, () => {
      const after = vm(applyOverride(rt(state), block.key, 'a reason', 'Risk Manager'));
      const row = after.limits.all.find((l) => l.key === `company:${block.ticker}`)!;
      expect(row.pct).toBeGreaterThan(LIMITS.maxCompanyPct);
      expect(after.limits.broken.map((l) => l.key)).toContain(row.key);
      // Held open by the override, so it does not also ask for you.
      const lo = after.limitOverrides.find((l) => l.key === row.key)!;
      expect(lo.exception?.kind).toBe('risk-block');
      expect(after.open.some((i) => i.kind === 'limit' && i.id === lo.itemId)).toBe(false);
      expect(after.closed.find((i) => i.id === lo.itemId)!.closedLabel).toMatch(/On exception until/);
    });

    it(`${state}: withdrawing puts the block back but leaves the trade alone`, () => {
      const granted = applyOverride(rt(state), block.key, 'a reason', 'Risk Manager');
      const ex = vm(granted).exceptions[0];
      const v = vm(applyWithdrawOverride(granted, ex.id, 'changed my mind'));
      expect(v.exceptions).toHaveLength(0);
      expect(v.overrides.find((o) => o.key === block.key)!.exception).toBeNull();
      const held = (x: ReturnType<typeof vm>) => x.fund.holdings.find((h) => h.ticker === block.ticker)!.shares;
      expect(held(v)).toBeCloseTo(held(vm(granted)), 6);
      expect(() => applyWithdrawOverride(granted, ex.id, '')).toThrow(/reason/i);
    });
  }
});

describe('a broken limit', () => {
  const lo = vm(rt('bad')).limitOverrides[0];

  it('offers both answers: trim it, or hold it', () => {
    expect(lo.trims.map((x) => x.to)).toEqual(['limit', 'target']);
    // Back to the target is the larger sale, and lands lower.
    expect(lo.trims[1].amount).toBeGreaterThan(lo.trims[0].amount);
    expect(lo.trims[1].afterPct).toBeLessThan(lo.trims[0].afterPct);
    expect(lo.kind).toBe('limit-exception');
    expect(lo.verdict).toBe('needs-cosign');
  });

  it('holding it on exception always needs the Risk Manager', () => {
    expect(() => applyLimitException(rt('bad'), lo.key, 'a reason', null)).toThrow(/Risk Manager/);
    expect(() => applyLimitException(rt('bad'), lo.key, '', 'Risk Manager')).toThrow(/reason/i);
  });

  it('held on exception, it stays broken on the record but stops asking for you', () => {
    const before = vm(rt('bad'));
    const after = vm(applyLimitException(rt('bad'), lo.key, 'banks are where the earnings are', 'Risk Manager'));
    expect(after.limits.broken.map((l) => l.key)).toContain(lo.key);
    expect(after.needsYou.brokenLimits).toBe(before.needsYou.brokenLimits - 1);
    expect(after.closed.find((i) => i.id === lo.itemId)!.status).toBe('on_exception');
    expect(after.exceptions[0].lapsesAtMs).toBe(ms(OVERRIDE_LAPSES_AT));
    expect(after.fund.cash).toBe(before.fund.cash);
  });

  it('trimming needs only a reason, and lands it back inside the limit', () => {
    expect(() => applyTrim(rt('bad'), lo.key, '')).toThrow(/reason/i);
    const r = applyTrim(rt('bad'), lo.key, 'not carrying a breach into results season');
    const v = vm(r);
    expect(v.limits.broken.map((l) => l.key)).not.toContain(lo.key);
    expect(v.open.some((i) => i.id === lo.itemId)).toBe(false);
    // A sale: cash rises by what was sold, the fund value does not move.
    expect(v.fund.cash - vm(rt('bad')).fund.cash).toBeCloseTo(lo.trims[0].amount, -2);
    expect(v.fund.fundValue).toBeCloseTo(vm(rt('bad')).fund.fundValue, -2);
    expect(v.exceptions).toHaveLength(0);
    pipelineAddsUp(r);
  });

  it('trimming a limit that was held on exception closes the exception in the record', () => {
    const held = applyLimitException(rt('bad'), lo.key, 'a reason', 'Risk Manager');
    const v = vm(applyTrim(held, lo.key, 'trim it after all'));
    expect(v.exceptions).toHaveLength(0);
    expect(v.events.some((e) => e.type === 'override_withdrawn' && /nothing left to hold open/.test(e.text))).toBe(true);
  });

  it('trimming to the target weight lands at the target, with room under the limit', () => {
    const v = vm(applyTrim(rt('bad'), lo.key, 'back to where we want it', 'target'));
    const row = v.limits.all.find((l) => l.key === lo.key)!;
    expect(row.pct).toBeCloseTo(lo.trims[1].afterPct, 1);
    expect(row.headroom).toBeGreaterThan(0);
  });

  it('there is no target trim for a company, because a company has no target weight', () => {
    const block = riskBlock('normal')!;
    const r = applyOverride(rt('normal'), block.key, 'a reason', 'Risk Manager');
    const company = vm(r).limitOverrides.find((l) => l.key === `company:${block.ticker}`)!;
    expect(company.trims.map((x) => x.to)).toEqual(['limit']);
    expect(() => applyTrim(r, company.key, 'a reason', 'target')).toThrow(/target/);
  });

  it("a trim instructed by a person is not counted as the Portfolio Agent's own trim", () => {
    const before = vm(rt('bad')).counts.trims;
    expect(vm(applyTrim(rt('bad'), lo.key, 'a reason')).counts.trims).toBe(before);
  });
});

describe('the Portfolio Agent size cap', () => {
  const item = vm(rt('normal')).open.find((i) => i.capOverride)!;
  const cap = item.capOverride!;

  it('quotes the agent and offers the size it had before the cap', () => {
    expect(cap.sizedAmount).toBeGreaterThan(cap.cappedAmount);
    expect(cap.agentReason).toMatch(/capped/);
  });

  it('names every limit the larger size breaks, and makes a second signature necessary', () => {
    // Taking the pre-cap size spends cash the fund needs to keep. That is a
    // second exception, and it cannot be left for the reader to work out.
    if (cap.preview.cashAfterPct < LIMITS.minCashPct) {
      expect(cap.breaches.some((b) => /below its .* minimum/.test(b))).toBe(true);
      expect(cap.verdict).toBe('needs-cosign');
      expect(cap.cosignLine).toMatch(/also breaks a limit/);
      expect(() => applyCapOverride(rt('normal'), item.id, 'a reason', null)).toThrow(/Risk Manager/);
    }
    expect(cap.breaches.length > 0).toBe(cap.verdict === 'needs-cosign' || cap.preview.positionPct > 5);
  });

  it('every override names any limit it breaks besides its own', () => {
    for (const state of STATES) {
      for (const o of vm(rt(state)).overrides) {
        if (!o.preview) continue;
        if (o.preview.cashAfterPct < LIMITS.minCashPct) expect(o.extraBreaches.join(' ')).toMatch(/minimum/);
        if (o.extraBreaches.length && o.verdict !== 'refused') expect(o.verdict).toBe('needs-cosign');
      }
    }
  });

  it('taking it closes the proposal as your decision, at the larger size', () => {
    const r = applyCapOverride(rt('normal'), item.id, 'the 2% cap is too cautious here', 'Risk Manager');
    const v = vm(r);
    const closed = v.closed.find((i) => i.id === item.id)!;
    expect(closed.status).toBe('taken_over_cap');
    expect(closed.closedLabel).toMatch(/Overrode the cap/);
    expect(vm(rt('normal')).fund.cash - v.fund.cash).toBeCloseTo(cap.sizedAmount, -2);
    expect(v.exceptions[0].kind).toBe('size-cap');
    // It is your approval of the proposal, so it counts as approved by you.
    expect(v.pipeline.humanApproved).toBe(vm(rt('normal')).pipeline.humanApproved + 1);
    pipelineAddsUp(r);
  });

  it('needs a reason, and cannot be taken after the proposal is closed', () => {
    expect(() => applyCapOverride(rt('normal'), item.id, '', null)).toThrow(/reason/i);
    const once = applyCapOverride(rt('normal'), item.id, 'a reason', 'Risk Manager');
    expect(() => applyCapOverride(once, item.id, 'again', 'Risk Manager')).toThrow();
  });
});

describe('an idea Research dropped', () => {
  const idea = vm(rt('normal')).agents.research.dropped[0];

  it('can be sent back with a reason, and commits no money', () => {
    expect(() => applyReinstate(rt('normal'), idea.key, '')).toThrow(/reason/i);
    const v = vm(applyReinstate(rt('normal'), idea.key, 'the move was on old news'));
    expect(v.agents.research.dropped.find((x) => x.key === idea.key)!.reinstated).toBeTruthy();
    expect(v.fund.cash).toBe(vm(rt('normal')).fund.cash);
    expect(v.exceptions).toHaveLength(0);
  });

  it('the drop stays dropped in the record and in the pipeline', () => {
    const before = vm(rt('normal'));
    const after = vm(applyReinstate(rt('normal'), idea.key, 'a reason'));
    expect(after.counts.ideasDropped).toBe(before.counts.ideasDropped);
    expect(after.events.some((e) => e.key === idea.key && e.type === 'idea_dropped')).toBe(true);
  });

  it('cannot be sent back twice', () => {
    const once = applyReinstate(rt('normal'), idea.key, 'a reason');
    expect(() => applyReinstate(once, idea.key, 'again')).toThrow(/already/);
  });
});

describe('a decision that expired', () => {
  const at = ms('2026-09-11T10:17:01+05:30');
  const expired = () => applyExpiry(rt('normal', at), 'DEC-0911-01');

  it('offers a reopen, and only once it has expired', () => {
    expect(vm(rt('normal')).open.find((i) => i.id === 'DEC-0911-01')!.reopen ?? null).toBeNull();
    expect(vm(expired()).closed.find((i) => i.id === 'DEC-0911-01')!.reopen).toBeTruthy();
  });

  it('reopening puts it back in the queue for the fixed extension, with a reason', () => {
    expect(() => applyReopen(expired(), 'DEC-0911-01', '')).toThrow(/reason/i);
    const r = applyReopen(expired(), 'DEC-0911-01', 'was in a meeting');
    const item = vm(r).open.find((i) => i.id === 'DEC-0911-01')!;
    expect(item.status).toBe('open');
    expect(item.deadlineMs).toBe(at + REOPEN_EXTENSION_MIN * MIN);
    expect(vm(r).events.some((e) => e.type === 'decision_reopened')).toBe(true);
  });

  it('a reopened decision expires again at its new deadline, not its first one', () => {
    const r = applyReopen(expired(), 'DEC-0911-01', 'was in a meeting');
    const late = { ...r, nowMs: at + (REOPEN_EXTENSION_MIN + 1) * MIN };
    expect(vm(late).closed.find((i) => i.id === 'DEC-0911-01')!.status).toBe('expired');
    const again = applyExpiry(late, 'DEC-0911-01');
    expect(vm(again).closed.find((i) => i.id === 'DEC-0911-01')!.outcome!.at).toBe(at + REOPEN_EXTENSION_MIN * MIN);
  });

  it('a decision someone made cannot be reopened', () => {
    const decided = { ...rt('normal'), outcomes: { 'DEC-0911-01': { status: 'declined' as const, at: DEMO_START_MS, by: 'priya' as const } } };
    expect(vm(decided).closed.find((i) => i.id === 'DEC-0911-01')!.reopen ?? null).toBeNull();
    expect(() => applyReopen(decided, 'DEC-0911-01', 'a reason')).toThrow();
  });
});

describe('stopping an order', () => {
  for (const state of STATES) {
    const order = vm(rt(state)).orders.find((o) => o.stoppable);
    if (!order) continue;

    it(`${state}: it needs a reason, and nothing else`, () => {
      expect(() => applyStopOrder(rt(state), order.id, '  ')).toThrow(/reason/i);
      expect(vm(applyStopOrder(rt(state), order.id, 'spread widened')).exceptions).toHaveLength(0);
    });

    it(`${state}: the pieces already filled stand, and nothing further fills`, () => {
      const before = vm(rt(state)).orders.find((o) => o.id === order.id)!;
      const stopped = applyStopOrder(rt(state), order.id, 'spread widened');
      const later = vm({ ...stopped, nowMs: stopped.nowMs + 6 * 60 * MIN }).orders.find((o) => o.id === order.id)!;
      expect(later.fills.map((f) => f.id)).toEqual(before.fills.map((f) => f.id));
      expect(later.complete).toBe(false);
    });

    it(`${state}: it releases the cash it had committed`, () => {
      const before = vm(rt(state));
      const after = vm(applyStopOrder(rt(state), order.id, 'spread widened'));
      const committed = before.orders.find((o) => o.id === order.id)!.inFlightRupees;
      expect(after.orders.find((o) => o.id === order.id)!.inFlightRupees).toBe(0);
      if (order.side === 'buy') expect(before.inFlightCash - after.inFlightCash).toBeCloseTo(committed, -2);
    });

    it(`${state}: it cannot be stopped twice`, () => {
      const once = applyStopOrder(rt(state), order.id, 'spread widened');
      expect(() => applyStopOrder(once, order.id, 'again')).toThrow(/already stopped/i);
    });
  }
});

describe('lifting an agent halt', () => {
  const halted = Object.values(vm(rt('bad')).agents).find((a) => a.haltedByAgent)!;

  it('takes a reason, because another agent imposed it', () => {
    expect(() => applyAgentResume(rt('bad'), halted.id)).toThrow(/reason/i);
  });

  it('is logged as an overrule, and does not register as another halt', () => {
    const before = vm(rt('bad'));
    const after = vm(applyAgentResume(rt('bad'), halted.id, 'I am watching it myself'));
    expect(after.events.some((e) => e.type === 'override_granted' && /over .*halt/.test(e.text))).toBe(true);
    // The Monitoring Agent's acknowledgement is not a new pause.
    expect(after.counts.agentsPaused).toBe(before.counts.agentsPaused);
    expect(after.monitorFlags.length).toBe(before.monitorFlags.length);
  });

  it('does not go on claiming to be paused', () => {
    const a = vm(applyAgentResume(rt('bad'), halted.id, 'I am watching it myself')).agents[halted.id];
    expect(a.status).toBe('Running');
    expect(a.liveLine).toMatch(/has not cleared/);
  });
});

describe('restoring an agent you throttled', () => {
  const throttled = Object.values(vm(rt('bad')).agents).find((a) => a.throttledByPerson)!;

  it('needs no reason, because it undoes your own act', () => {
    const v = vm(applyRestoreSpeed(rt('bad'), throttled.id));
    expect(v.agents[throttled.id].status).toBe('Running');
    expect(v.agents[throttled.id].liveLine).not.toMatch(/half speed/);
  });

  it('refuses an agent nobody throttled', () => {
    expect(() => applyRestoreSpeed(rt('normal'), 'research')).toThrow(/not throttled/);
  });
});

describe('where to act on a record', () => {
  it('every block, drop and part-placed order in the log carries a way to act on it', () => {
    const v = vm(rt('normal'));
    for (const e of v.events.filter((x) => x.type === 'risk_blocked' || x.type === 'compliance_blocked' || x.type === 'idea_dropped')) {
      expect(v.actOn[e.id], `${e.id} ${e.type}`).toBeTruthy();
    }
    expect(Object.values(v.actOn).some((a) => a.label === 'Stop the rest')).toBe(true);
  });

  it('a Compliance block offers to send it, not to overrule it', () => {
    const v = vm(rt('normal'));
    const block = complianceBlock('normal')!;
    expect(v.actOn[block.id].label).toMatch(/Send to Kavya Rao/);
  });

  it('a holding with something open on Home can reach it from the Portfolio page', () => {
    const v = vm(rt('normal'));
    expect(v.actOnTicker[riskBlock('normal')!.ticker]?.length).toBeGreaterThan(0);
  });
});

describe('the policy itself', () => {
  it('every kind names the roles that may, a rule, and a subject', () => {
    for (const [kind, p] of Object.entries(OVERRIDE_POLICY)) {
      expect(p.rule.length, kind).toBeGreaterThan(10);
      expect(p.subject.length, kind).toBeGreaterThan(5);
      for (const role of p.mayOverrule) expect(['Fund Manager', 'Risk Manager', 'Compliance Officer', 'Operations']).toContain(role);
    }
  });

  it('only what loosens a control lapses', () => {
    expect(OVERRIDE_POLICY['risk-block'].atExpiry).not.toBeNull();
    expect(OVERRIDE_POLICY['limit-exception'].atExpiry).not.toBeNull();
    expect(OVERRIDE_POLICY['size-cap'].atExpiry).not.toBeNull();
    expect(OVERRIDE_POLICY['dropped-idea'].atExpiry).toBeNull();
    expect(OVERRIDE_POLICY['agent-halt'].atExpiry).toBeNull();
  });

  it('the Rules page states exactly the policy the console enforces', () => {
    for (const [kind, p] of Object.entries(OVERRIDE_POLICY)) {
      const row = INITIAL_RULEBOOK.overrides.find((o) => o.id === kind);
      expect(row, kind).toBeTruthy();
      expect(row!.rule).toBe(p.rule);
      expect(row!.detail).toBe(p.detail);
    }
  });

  it('every override offered on screen carries its rule and how it ends', () => {
    for (const state of STATES) {
      const v = vm(rt(state));
      for (const o of [...v.overrides, ...v.limitOverrides]) {
        expect(o.rule.length).toBeGreaterThan(20);
        expect(o.expiryLine.length).toBeGreaterThan(10);
        if (o.verdict === 'refused') expect(o.refusalLine).toBeTruthy();
        else expect(o.refusalLine).toBeNull();
      }
    }
  });
});
