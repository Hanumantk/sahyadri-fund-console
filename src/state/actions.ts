// Pure functions that move the runtime forward. The store calls these; so do the tests.

import { breakDifference, deriveOrders, resolveHoldings, resolvedDecisionsFor, type Runtime } from '../data/derive';
import { fmtCr, fmtInt, fmtLakh, fmtTime } from '../data/format';
import { AGENTS, AGENT_ORDER, CR, CURRENT_USER, PEOPLE, type AgentId, type RawEvent } from '../data/scenario';
import { ms } from '../data/clock';

export type ProposalChoice = 'take' | 'less' | 'decline';
export type VerdictChoice = 'bull' | 'halfway' | 'bear' | 'lapse';
export type BreakChoice = 'accept' | 'keep' | 'assign';
export type Choice = ProposalChoice | VerdictChoice | BreakChoice;

function iso(t: number): string {
  // Produce an ISO string with the IST offset so the log reads consistently.
  const d = new Date(t + 330 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+05:30`;
}

function nextId(rt: Runtime, offset = 0): string {
  return `EVT-U${String(rt.extraEvents.length + offset + 1).padStart(3, '0')}`;
}

function mk(rt: Runtime, offset: number, partial: Omit<RawEvent, 'id' | 'at'> & { at?: number }): RawEvent {
  const { at, ...rest } = partial;
  return { id: nextId(rt, offset), at: iso(at ?? rt.nowMs), ...rest };
}

function pieces(amount: number): number {
  return Math.max(1, Math.round(amount / (0.36 * CR)));
}

const NEEDS_REASON: Record<Choice, boolean> = {
  take: false,
  less: true,
  decline: true,
  bull: true,
  halfway: true,
  bear: true,
  lapse: true,
  accept: true,
  keep: true,
  assign: true,
};

export function choiceNeedsReason(choice: Choice): boolean {
  return NEEDS_REASON[choice];
}

export function applyDecision(rt: Runtime, id: string, choice: Choice, amountIn: number, reason: string): Runtime {
  const d = resolvedDecisionsFor(rt).find((x) => x.id === id);
  if (!d) throw new Error(`Unknown decision ${id}`);
  if (rt.outcomes[id]) throw new Error(`${id} is already closed`);
  const cleanReason = reason.trim();
  if (NEEDS_REASON[choice] && !cleanReason) throw new Error('Add a one-line reason. It goes into the record.');
  const user = PEOPLE[CURRENT_USER].name;
  const events: RawEvent[] = [];
  let next: Runtime = { ...rt, outcomes: { ...rt.outcomes }, shareDelta: { ...rt.shareDelta }, agentOverrides: { ...rt.agentOverrides } };
  const price = resolveHoldings(rt, deriveOrders(rt)).find((h) => h.ticker === d.ticker)?.price ?? 0;
  const quoted = cleanReason ? ` · "${cleanReason}"` : '';

  if (d.kind === 'proposal') {
    let amount = 0;
    let status: Runtime['outcomes'][string]['status'];
    if (choice === 'take') {
      amount = d.amount;
      status = 'taken';
    } else if (choice === 'less') {
      amount = Math.min(d.amount - d.takeLessStep, Math.max(d.takeLessStep, amountIn));
      status = 'taken_less';
    } else if (choice === 'decline') {
      status = 'declined';
    } else throw new Error(`Bad choice ${choice} for a proposal`);
    next.outcomes[id] = { status, at: rt.nowMs, by: CURRENT_USER, amount, reason: cleanReason };
    events.push(
      mk(rt, events.length, {
        actor: CURRENT_USER,
        type: 'human_decision',
        company: d.company,
        amount,
        text:
          status === 'taken'
            ? `Took it · buy ${fmtCr(amount)} of ${d.company}${quoted}`
            : status === 'taken_less'
              ? `Took less · buy ${fmtCr(amount)} of ${d.company} instead of ${fmtCr(d.amount)}${quoted}`
              : `Declined · nothing bought · ${d.company}${quoted}`,
        related: [id],
      }),
    );
    if (amount > 0) {
      next = buy(next, d.ticker, d.company, amount, price, id, events);
    } else {
      events.push(
        mk(rt, events.length, {
          actor: 'research',
          type: 'status_change',
          company: d.company,
          text: `Recorded the decline · ${d.company} is tracked to see how it would have done`,
          related: [id],
          at: rt.nowMs,
        }),
      );
    }
  } else if (d.kind === 'verdict') {
    let amount = 0;
    let status: Runtime['outcomes'][string]['status'];
    let label: string;
    if (choice === 'bull') {
      amount = d.bull.amount;
      status = 'sided_bull';
      label = `Sided with Bull · buy ${fmtCr(amount)} of ${d.company}`;
    } else if (choice === 'halfway') {
      amount = d.halfwayAmount;
      status = 'halfway';
      label = `Went halfway · buy ${fmtCr(amount)} of ${d.company}`;
    } else if (choice === 'bear') {
      status = 'sided_bear';
      label = `Sided with Bear · nothing bought · ${d.company}`;
    } else if (choice === 'lapse') {
      status = 'lapsed';
      label = `Let it lapse · nothing bought · ${d.company}`;
    } else throw new Error(`Bad choice ${choice} for a verdict`);
    next.outcomes[id] = { status, at: rt.nowMs, by: CURRENT_USER, amount, reason: cleanReason };
    events.push(mk(rt, events.length, { actor: CURRENT_USER, type: 'human_decision', company: d.company, amount, text: `${label}${quoted}`, related: [id] }));
    next.agentOverrides.portfolio = {
      status: 'Running',
      liveLine: amount > 0 ? `Sizing the ${d.company} add at ${fmtCr(amount)} as decided by ${user}` : `Back to sizing · ${d.company} verdict closed, nothing bought`,
    };
    events.push(
      mk(rt, events.length, {
        actor: 'portfolio',
        type: 'status_change',
        company: d.company,
        text: `Status → Running · ${d.company} verdict decided by ${user}`,
        related: [id],
        at: rt.nowMs,
      }),
    );
    if (amount > 0) next = buy(next, d.ticker, d.company, amount, price, id, events);
  } else {
    const diff = breakDifference(d);
    let status: Runtime['outcomes'][string]['status'];
    let text: string;
    let live: string;
    if (choice === 'accept') {
      status = 'accepted_broker';
      next.shareDelta[d.ticker] = (next.shareDelta[d.ticker] ?? 0) + diff.shares;
      next = { ...next, cashDelta: next.cashDelta - diff.rupees };
      text = `Accepted the broker's record for ${d.tradeId} · our books corrected by ${fmtInt(diff.shares)} ${d.company} shares and ${fmtLakh(diff.rupees)}${quoted}`;
      live = `Matching the corrected ${d.company} record · 18 of 18 matched`;
    } else if (choice === 'keep') {
      status = 'kept_ours';
      text = `Kept our record for ${d.tradeId} · chasing Sagar Broking${quoted}`;
      live = `Chasing Sagar Broking for the ${d.company} contract note · ${d.tradeId}`;
    } else if (choice === 'assign') {
      status = 'assigned';
      text = `Assigned ${id} to Operations staff${quoted}`;
      live = `Handed ${id} to Operations staff · matching the rest`;
    } else throw new Error(`Bad choice ${choice} for a mismatch`);
    next.outcomes[id] = { status, at: rt.nowMs, by: CURRENT_USER, reason: cleanReason };
    events.push(mk(rt, events.length, { actor: CURRENT_USER, type: 'human_decision', company: d.company, text, related: [id, d.tradeId] }));
    next.agentOverrides.operations = { status: 'Running', liveLine: live };
    events.push(
      mk(rt, events.length, {
        actor: 'operations',
        type: 'break_resolved',
        company: d.company,
        text: `Status → Running · ${id} ${choice === 'accept' ? 'settled' : choice === 'keep' ? 'owned, broker chased' : 'handed over'}`,
        related: [id],
        at: rt.nowMs,
      }),
    );
  }
  return { ...next, extraEvents: [...rt.extraEvents, ...events] };
}

function buy(rt: Runtime, ticker: string, company: string, amount: number, price: number, decisionId: string, events: RawEvent[]): Runtime {
  const shares = amount / price;
  const next: Runtime = {
    ...rt,
    shareDelta: { ...rt.shareDelta, [ticker]: (rt.shareDelta[ticker] ?? 0) + shares },
    cashDelta: rt.cashDelta - amount,
    cashIdleSinceMs: rt.nowMs,
    agentOverrides: { ...rt.agentOverrides },
  };
  const n = pieces(amount);
  events.push(
    mk(rt, events.length, {
      actor: 'execution',
      type: 'order_placed',
      company,
      amount,
      text: `Placed order: buy ${fmtCr(amount)} of ${company} in ${n} pieces · approved by ${PEOPLE[CURRENT_USER].name}`,
      related: [decisionId],
      at: rt.nowMs,
    }),
  );
  const exec = rt.agentOverrides.execution;
  if (!exec || exec.status === undefined || exec.status === 'Running') {
    next.agentOverrides.execution = { ...exec, liveLine: `Buying ${company} · ${fmtCr(amount)} in small orders · 0% done` };
  } else if (exec.status === 'Throttled' || AGENTS.execution.states[rt.state].status === 'Throttled') {
    next.agentOverrides.execution = { ...exec, liveLine: `Buying ${company} at half speed · ${fmtCr(amount)} · 0% done` };
  }
  return next;
}

export function applyExpiry(rt: Runtime, id: string): Runtime {
  const d = resolvedDecisionsFor(rt).find((x) => x.id === id);
  if (!d || d.kind === 'break' || rt.outcomes[id]) return rt;
  const at = ms(d.expiresAt);
  const events: RawEvent[] = [
    mk(rt, 0, { actor: 'system', type: 'expired', company: d.company, text: `${id} expired at ${fmtTime(at)} · nothing bought`, related: [id], at }),
  ];
  const next: Runtime = { ...rt, outcomes: { ...rt.outcomes, [id]: { status: 'expired', at, by: 'system' } }, agentOverrides: { ...rt.agentOverrides } };
  if (d.kind === 'verdict') {
    next.agentOverrides.portfolio = { status: 'Running', liveLine: `Back to sizing · ${d.company} verdict expired, nothing bought` };
    events.push(mk(rt, 1, { actor: 'portfolio', type: 'status_change', company: d.company, text: `Status → Running · ${d.company} verdict expired`, related: [id], at: at + 1000 }));
  }
  return { ...next, extraEvents: [...rt.extraEvents, ...events] };
}

export function applyPauseAll(rt: Runtime, reason: string): Runtime {
  const why = reason.trim();
  if (!why) throw new Error('Add a one-line reason. It goes into the record.');
  const overrides = { ...rt.agentOverrides };
  const events: RawEvent[] = [];
  AGENT_ORDER.forEach((id, i) => {
    overrides[id] = { status: 'Paused', changedBy: CURRENT_USER, changedAt: rt.nowMs, why, liveLine: 'Paused · not acting until resumed' };
    events.push(mk(rt, i, { actor: CURRENT_USER, type: 'agent_paused', text: `Paused ${AGENTS[id].name} · "${why}"`, related: [] }));
  });
  return { ...rt, pausedAll: true, prePause: rt.agentOverrides, agentOverrides: overrides, extraEvents: [...rt.extraEvents, ...events] };
}

export function applyResumeAll(rt: Runtime): Runtime {
  const events: RawEvent[] = AGENT_ORDER.map((id, i) =>
    mk(rt, i, { actor: CURRENT_USER, type: 'agent_resumed', text: `Resumed ${AGENTS[id].name}`, related: [] }),
  );
  return { ...rt, pausedAll: false, agentOverrides: rt.prePause ?? {}, prePause: undefined, extraEvents: [...rt.extraEvents, ...events] };
}

export function applyAgentPause(rt: Runtime, id: AgentId, reason: string): Runtime {
  const why = reason.trim();
  if (!why) throw new Error('Add a one-line reason. It goes into the record.');
  const ev = mk(rt, 0, { actor: CURRENT_USER, type: 'agent_paused', text: `Paused ${AGENTS[id].name} · "${why}"`, related: [] });
  return {
    ...rt,
    agentOverrides: { ...rt.agentOverrides, [id]: { status: 'Paused', changedBy: CURRENT_USER, changedAt: rt.nowMs, why, liveLine: 'Paused · not acting until resumed' } },
    extraEvents: [...rt.extraEvents, ev],
  };
}

export function applyAgentResume(rt: Runtime, id: AgentId): Runtime {
  const ev = mk(rt, 0, { actor: CURRENT_USER, type: 'agent_resumed', text: `Resumed ${AGENTS[id].name}`, related: [] });
  const overrides = { ...rt.agentOverrides };
  overrides[id] = { status: 'Running' };
  return { ...rt, agentOverrides: overrides, extraEvents: [...rt.extraEvents, ev] };
}

export function applyBudget(rt: Runtime, id: AgentId, rupees: number): Runtime {
  const a = AGENTS[id];
  if (a.budgetRupees === null) return rt;
  const clamped = Math.max(0, Math.min(a.budgetRupees, rupees));
  const ev = mk(rt, 0, { actor: CURRENT_USER, type: 'budget_changed', text: `Set ${a.name}'s ${(a.budgetLabel ?? 'budget').toLowerCase()} to ${fmtCr(clamped)} (was ${fmtCr(rt.budgets[id] ?? a.budgetRupees)})`, related: [] });
  return { ...rt, budgets: { ...rt.budgets, [id]: clamped }, extraEvents: [...rt.extraEvents, ev] };
}
