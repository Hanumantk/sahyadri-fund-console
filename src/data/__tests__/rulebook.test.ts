import { describe, expect, it } from 'vitest';
import { CR } from '../scenario';
import {
  AUTONOMY_LOCKS,
  INITIAL_RULEBOOK,
  cloneRulebook,
  formatFundSize,
  formatRupeeEquivalent,
  isWidening,
  reviewSentences,
} from '../rulebook';

describe('shared rulebook model', () => {
  it('starts with the requested fund, limits, agents, and bands', () => {
    expect(formatFundSize(INITIAL_RULEBOOK.fund.size)).toBe('₹248.6 Cr');
    expect(INITIAL_RULEBOOK.fund.size).toBe(248.6 * CR);
    expect(INITIAL_RULEBOOK.limits).toHaveLength(9);
    expect(INITIAL_RULEBOOK.agents).toHaveLength(7);
    expect(new Set(INITIAL_RULEBOOK.agents.map((agent) => agent.band))).toEqual(new Set(['front', 'middle', 'back']));
  });

  it('keeps mock rehearsal evidence beside every limit', () => {
    for (const limit of INITIAL_RULEBOOK.limits) {
      expect(limit.rehearsal.summary.trim(), limit.label).not.toBe('');
      for (const row of limit.rehearsal.rows) {
        expect(row.date.trim()).not.toBe('');
        expect(row.company.trim()).not.toBe('');
        expect(row.result.trim()).not.toBe('');
      }
    }
  });

  it('computes capital equivalents from the shared fund size', () => {
    expect(formatRupeeEquivalent(8, 'percent', INITIAL_RULEBOOK.fund.size)).toBe('₹19.9 cr');
    expect(formatRupeeEquivalent(3, 'percent', INITIAL_RULEBOOK.fund.size)).toBe('₹7.5 cr');
  });

  it('distinguishes tightening from widening in both directions and for ranges', () => {
    const gross = INITIAL_RULEBOOK.limits.find((limit) => limit.id === 'gross-exposure')!;
    const stop = INITIAL_RULEBOOK.limits.find((limit) => limit.id === 'stop-loss')!;
    const net = INITIAL_RULEBOOK.limits.find((limit) => limit.id === 'net-exposure')!;
    expect(isWidening(gross, 220)).toBe(true);
    expect(isWidening(gross, 180)).toBe(false);
    expect(isWidening(stop, -10)).toBe(true);
    expect(isWidening(stop, -6)).toBe(false);
    expect(isWidening(net, [-30, 80])).toBe(true);
    expect(isWidening(net, [-10, 70])).toBe(false);
  });

  it('contains each architectural lock in the agent column it protects', () => {
    expect(AUTONOMY_LOCKS).toHaveLength(7);
    for (const lock of AUTONOMY_LOCKS) {
      const agent = INITIAL_RULEBOOK.agents.find((item) => item.agent === lock.agent)!;
      const actions = lock.column === 'alone'
        ? agent.mayDoAlone
        : lock.column === 'human'
          ? agent.needsHuman.map((item) => item.action)
          : agent.never;
      expect(actions, `${lock.agent}: ${lock.action}`).toContain(lock.action);
    }
  });

  it('reads the review back as sentences derived from the object', () => {
    const copy = reviewSentences(INITIAL_RULEBOOK).flatMap((group) => group.sentences).join(' ');
    expect(copy).toContain('No more than 8% of the fund (₹19.9 cr)');
    expect(copy).toContain('Portfolio Agent may size positions up to 3% (₹7.5 cr)');
    expect(copy).toContain('compliance block can only be lifted by the Compliance Officer');
  });

  it('clones the seed so setup and live edits never mutate mock anchors', () => {
    const copy = cloneRulebook();
    copy.fund.name = 'Changed in memory';
    copy.limits[0].setTo = 99;
    expect(INITIAL_RULEBOOK.fund.name).not.toBe(copy.fund.name);
    expect(INITIAL_RULEBOOK.limits[0].setTo).not.toBe(copy.limits[0].setTo);
  });
});
