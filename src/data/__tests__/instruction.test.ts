/**
 * A person's own instruction, written in the blank box beside a decision's
 * listed options.
 *
 * The rule these tests hold: words are recorded and passed on, never executed.
 * Nothing is bought and the books do not change on a written instruction, in any
 * state, on any kind of item. Anything that needs money comes back as something
 * the person can approve.
 */

import { describe, expect, it } from 'vitest';
import { DEMO_START_MS } from '../clock';
import { derive, initialRuntime, type Runtime } from '../derive';
import { STATES, type StateName } from '../scenario';
import { applyDecision, applyInstruction } from '../../state/actions';

function rt(state: StateName): Runtime {
  return initialRuntime(state, DEMO_START_MS);
}

const WORDS = 'Hold this until I have spoken to the analyst who covers it';

/** What a written instruction must never touch. */
function books(r: Runtime) {
  const v = derive(r);
  return {
    cash: v.fund.cash,
    fundValue: v.fund.fundValue,
    shares: v.fund.holdings.map((h) => `${h.ticker}:${h.shares}`).join(','),
    ordersPlaced: v.pipeline.ordersPlaced,
    humanApproved: v.pipeline.humanApproved,
  };
}

describe('every open item offers the blank box', () => {
  for (const state of STATES) {
    it(`${state}: each one names the agent it goes to and says what it will not do`, () => {
      const v = derive(rt(state));
      // The calm morning has nothing open; the other two must have something.
      if (state !== 'calm') expect(v.open.length).toBeGreaterThan(0);
      for (const item of v.open) {
        expect(v.agents[item.instructTo], item.id).toBeTruthy();
        expect(item.ownNote.length, item.id).toBeGreaterThan(40);
        expect(item.ownNote, item.id).toContain(v.agents[item.instructTo].name);
      }
    });
  }
});

describe('a written instruction on a decision', () => {
  for (const state of STATES) {
    const decisions = derive(rt(state)).open.filter((i) => i.kind === 'proposal' || i.kind === 'verdict' || i.kind === 'break');
    for (const item of decisions) {
      it(`${state} ${item.id}: needs words`, () => {
        expect(() => applyDecision(rt(state), item.id, 'own', 0, '   ')).toThrow(/instruction/i);
      });

      it(`${state} ${item.id}: closes it, word for word, and moves nothing`, () => {
        const before = books(rt(state));
        const r = applyDecision(rt(state), item.id, 'own', 0, WORDS);
        const v = derive(r);
        const closed = v.closed.find((i) => i.id === item.id)!;
        expect(closed.status).toBe('instructed');
        expect(closed.closedLabel).toMatch(/^Your instruction/);
        expect(closed.outcome?.reason).toBe(WORDS);
        expect(books(r)).toEqual(before);
      });

      it(`${state} ${item.id}: the agent that raised it records it, in the same words`, () => {
        const v = derive(applyDecision(rt(state), item.id, 'own', 0, WORDS));
        const got = v.events.find((e) => e.type === 'instruction_received' && e.actor === item.instructTo)!;
        expect(got.text).toContain(WORDS);
        expect(v.events.some((e) => e.type === 'human_decision' && e.text.includes(WORDS))).toBe(true);
      });

      it(`${state} ${item.id}: once closed, it cannot be decided again`, () => {
        const r = applyDecision(rt(state), item.id, 'own', 0, WORDS);
        expect(() => applyDecision(r, item.id, 'own', 0, 'again')).toThrow(/already closed/);
      });
    }
  }

  it('a verdict settled by instruction sends the Portfolio Agent back to Running', () => {
    const verdict = derive(rt('normal')).open.find((i) => i.kind === 'verdict')!;
    const v = derive(applyDecision(rt('normal'), verdict.id, 'own', 0, WORDS));
    expect(v.agents.portfolio.status).toBe('Running');
  });
});

describe('a written instruction on a late feed or a broken limit', () => {
  const items = derive(rt('bad')).open.filter((i) => i.kind === 'feed' || i.kind === 'limit');

  it('the bad state has both kinds to test', () => {
    expect(items.map((i) => i.kind).sort()).toEqual(['feed', 'limit']);
  });

  for (const item of items) {
    it(`${item.id}: is recorded and sent, and the item stays open`, () => {
      const before = books(rt('bad'));
      const r = applyInstruction(rt('bad'), item.id, WORDS);
      const v = derive(r);
      const still = v.open.find((i) => i.id === item.id)!;
      expect(still).toBeTruthy();
      expect(still.instructions.map((x) => x.text)).toEqual([WORDS]);
      expect(v.events.some((e) => e.type === 'instruction_sent' && e.text.includes(WORDS))).toBe(true);
      expect(v.events.some((e) => e.type === 'instruction_received' && e.actor === item.instructTo)).toBe(true);
      expect(books(r)).toEqual(before);
    });

    it(`${item.id}: a second instruction is listed after the first`, () => {
      const r = applyInstruction(applyInstruction(rt('bad'), item.id, 'first'), item.id, 'second');
      expect(derive(r).open.find((i) => i.id === item.id)!.instructions.map((x) => x.text)).toEqual(['first', 'second']);
    });

    it(`${item.id}: needs words`, () => {
      expect(() => applyInstruction(rt('bad'), item.id, '')).toThrow(/instruction/i);
    });
  }

  it('no count of what agents decided moves on an instruction', () => {
    const before = derive(rt('bad')).counts;
    const after = derive(applyInstruction(rt('bad'), items[0].id, WORDS)).counts;
    expect(after).toEqual(before);
  });
});
