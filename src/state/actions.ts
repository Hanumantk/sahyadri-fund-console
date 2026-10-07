// Pure functions that move the runtime forward. The store calls these; so do the tests.

import {
  actorName,
  breakDifference,
  derive,
  deriveOrders,
  resolveHoldings,
  resolvedDecisionsFor,
  type Authority,
  type Escalation,
  type GrantedException,
  type TrimTo,
  type Runtime,
} from '../data/derive';
import { fmtCr, fmtInt, fmtLakh, fmtPct, fmtTime, plural } from '../data/format';
import { AGENTS, AGENT_ORDER, CR, CURRENT_USER, OVERRIDE_POLICY, PEOPLE, type AgentId, type RawEvent } from '../data/scenario';
import { ms } from '../data/clock';

export type ProposalChoice = 'take' | 'less' | 'decline';
export type VerdictChoice = 'bull' | 'halfway' | 'bear' | 'lapse';
export type BreakChoice = 'accept' | 'keep' | 'assign';
/** The person's own written instruction, when none of the listed options fits. */
export type OwnChoice = 'own';
export type Choice = ProposalChoice | VerdictChoice | BreakChoice | OwnChoice;

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
  // The instruction is the reason; it cannot be empty.
  own: true,
};

export function choiceNeedsReason(choice: Choice): boolean {
  return NEEDS_REASON[choice];
}

export function applyDecision(rt: Runtime, id: string, choice: Choice, amountIn: number, reason: string): Runtime {
  const d = resolvedDecisionsFor(rt).find((x) => x.id === id);
  if (!d) throw new Error(`Unknown decision ${id}`);
  if (rt.outcomes[id]) throw new Error(`${id} is already closed`);
  const cleanReason = reason.trim();
  if (choice === 'own') {
    if (!cleanReason) throw new Error('Write the instruction. It goes into the record word for word.');
    return applyOwnDecision(rt, d, cleanReason);
  }
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

/**
 * Close a decision with the person's own words instead of a listed option.
 *
 * Words cannot be executed, so they are not: nothing is bought and the books do
 * not change. The instruction is recorded verbatim, the agent that raised the
 * item writes down that it has it, and anything that needs money has to come
 * back as something the person can approve.
 */
function applyOwnDecision(rt: Runtime, d: ReturnType<typeof resolvedDecisionsFor>[number], text: string): Runtime {
  const to = d.kind === 'break' ? d.raisedBy : d.proposedBy;
  const user = PEOPLE[CURRENT_USER].name;
  const events: RawEvent[] = [
    mk(rt, 0, {
      actor: CURRENT_USER,
      type: 'human_decision',
      company: d.company,
      amount: 0,
      text: `Your own instruction instead of the options · ${d.kind === 'break' ? 'books unchanged' : 'nothing bought'} · "${text}"`,
      related: [d.id],
    }),
    mk(rt, 1, {
      actor: to,
      type: 'instruction_received',
      company: d.company,
      text: `Instruction from ${user} on ${d.id} recorded · "${text}" · ${d.kind === 'break' ? 'the mismatch still has to be settled before the official value is struck' : 'anything that needs money comes back as a new proposal'}`,
      related: [d.id],
    }),
  ];
  const overrides = { ...rt.agentOverrides };
  if (d.kind === 'verdict') {
    overrides.portfolio = { status: 'Running', liveLine: `Back to sizing · ${d.company} verdict settled by ${user}'s own instruction` };
    events.push(mk(rt, 2, { actor: 'portfolio', type: 'status_change', company: d.company, text: `Status → Running · ${d.company} verdict settled by instruction`, related: [d.id] }));
  }
  return {
    ...rt,
    outcomes: { ...rt.outcomes, [d.id]: { status: 'instructed', at: rt.nowMs, by: CURRENT_USER, amount: 0, reason: text } },
    instructions: { ...rt.instructions, [d.id]: [...(rt.instructions[d.id] ?? []), { atMs: rt.nowMs, text }] },
    agentOverrides: overrides,
    extraEvents: [...rt.extraEvents, ...events],
  };
}

/**
 * Send your own instruction on an item that words cannot settle — a late feed,
 * a broken limit. It is recorded and passed on; the item stays open, because
 * the fact behind it has not changed.
 */
export function applyInstruction(rt: Runtime, itemId: string, text: string): Runtime {
  const words = text.trim();
  if (!words) throw new Error('Write the instruction. It goes into the record word for word.');
  const item = derive(rt).open.find((i) => i.id === itemId);
  if (!item) throw new Error(`${itemId} is not open`);
  const events: RawEvent[] = [
    mk(rt, 0, {
      actor: CURRENT_USER,
      type: 'instruction_sent',
      company: item.company,
      text: `Instruction to ${AGENTS[item.instructTo].name} on ${item.title} · "${words}"`,
      related: [itemId],
    }),
    mk(rt, 1, {
      actor: item.instructTo,
      type: 'instruction_received',
      company: item.company,
      text: `Instruction from ${PEOPLE[CURRENT_USER].name} recorded · "${words}" · the item stays open until the condition behind it clears`,
      related: [itemId],
    }),
  ];
  return {
    ...rt,
    instructions: { ...rt.instructions, [itemId]: [...(rt.instructions[itemId] ?? []), { atMs: rt.nowMs, text: words }] },
    extraEvents: [...rt.extraEvents, ...events],
  };
}

function buy(rt: Runtime, ticker: string, company: string, amount: number, price: number, decisionId: string, events: RawEvent[], onOverride = false): Runtime {
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
      text: `Placed order: buy ${fmtCr(amount)} of ${company} in ${n} pieces · ${onOverride ? `on ${PEOPLE[CURRENT_USER].name}'s override` : `approved by ${PEOPLE[CURRENT_USER].name}`}`,
      related: [decisionId],
      side: 'buy',
      ...(onOverride ? { onOverride: true } : {}),
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

/** A sale a person instructed. It always counts as placed on an override. */
function sell(rt: Runtime, ticker: string, company: string, amount: number, price: number, events: RawEvent[]): Runtime {
  const shares = amount / price;
  events.push(
    mk(rt, events.length, {
      actor: 'execution',
      type: 'order_placed',
      company,
      amount,
      side: 'sell',
      onOverride: true,
      text: `Placed order: sell ${fmtCr(amount)} of ${company} in ${pieces(amount)} pieces · on ${PEOPLE[CURRENT_USER].name}'s instruction`,
      related: [],
      at: rt.nowMs,
    }),
  );
  return {
    ...rt,
    shareDelta: { ...rt.shareDelta, [ticker]: (rt.shareDelta[ticker] ?? 0) - shares },
    cashDelta: rt.cashDelta + amount,
  };
}

export function applyExpiry(rt: Runtime, id: string): Runtime {
  const d = resolvedDecisionsFor(rt).find((x) => x.id === id);
  if (!d || d.kind === 'break' || rt.outcomes[id]) return rt;
  // A reopened decision expires at its new deadline, not the one it first had.
  const at = rt.extendedUntil[id] ?? ms(d.expiresAt);
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

/**
 * Resume an agent. Undoing your own pause is housekeeping. Lifting a halt
 * another agent imposed is an override: it needs a reason, and it is logged as
 * one, because the agent that halted it still thinks it should be halted.
 */
export function applyAgentResume(rt: Runtime, id: AgentId, reason = ''): Runtime {
  const a = derive(rt).agents[id];
  const why = reason.trim();
  if (a.haltedByAgent && !why) throw new Error(REASON);

  const overrides = { ...rt.agentOverrides };
  const events: RawEvent[] = [];
  if (a.haltedByAgent && a.haltedBy) {
    // Resuming does not fix what caused the halt, so the live line says so
    // rather than falling back to the paused sentence it was showing.
    overrides[id] = {
      status: 'Running',
      liveLine: `Running again on ${userName()}'s instruction · what ${AGENTS[a.haltedBy].name} halted it for has not cleared`,
    };
    events.push(
      mk(rt, 0, {
        actor: CURRENT_USER,
        type: 'override_granted',
        text: `Resumed ${AGENTS[id].name} over ${AGENTS[a.haltedBy].name}'s halt · "${why}"`,
        related: [],
      }),
      mk(rt, 1, {
        actor: a.haltedBy,
        type: 'override_acknowledged',
        text: `${AGENTS[id].name} resumed by ${userName()} · the condition that caused the halt has not changed · still watching`,
        related: [],
      }),
    );
  } else {
    overrides[id] = { status: 'Running' };
    events.push(mk(rt, 0, { actor: CURRENT_USER, type: 'agent_resumed', text: `Resumed ${AGENTS[id].name}`, related: [] }));
  }
  return { ...rt, agentOverrides: overrides, extraEvents: [...rt.extraEvents, ...events] };
}

/**
 * Put an agent you slowed back to full speed. Your own throttle, so no reason is
 * required, the same as resuming your own pause.
 */
export function applyRestoreSpeed(rt: Runtime, id: AgentId): Runtime {
  const a = derive(rt).agents[id];
  if (!a.throttledByPerson) throw new Error(`${AGENTS[id].name} is not throttled`);
  const current = rt.agentOverrides[id];
  return {
    ...rt,
    agentOverrides: {
      ...rt.agentOverrides,
      // Keep a line someone else wrote about a stopped order; otherwise it is
      // the same work it was doing, at the speed it does it on a normal day.
      [id]: { status: 'Running', liveLine: current?.liveLine ?? AGENTS[id].states.normal.liveLine },
    },
    extraEvents: [...rt.extraEvents, mk(rt, 0, { actor: CURRENT_USER, type: 'agent_resumed', text: `Restored ${AGENTS[id].name} to full speed`, related: [] })],
  };
}

// ---------------------------------------------------------------------------
// Overrides
//
// A person overruling an agent. Three rules hold across all of them:
//
//  - Nothing an agent did is deleted. An override adds a record on top of the
//    agent's record; the block stays in the log and in the count.
//  - Permission is checked against the Book, never assumed from the fact that a
//    button was pressed. What the rules refuse can be sent to someone they allow.
//  - Loosening a control expires. Tightening one does not, because it cannot
//    cost the fund anything that was not already committed.

const REASON = 'Add a one-line reason. It goes into the record.';

function userName(): string {
  return PEOPLE[CURRENT_USER].name;
}

/** Throws unless the Book allows the person at the console to do this, with this co-signer. */
function checkAuthority(a: Authority, cosigner: string | null): void {
  if (a.verdict === 'refused') throw new Error(a.refusalLine ?? 'The rules do not allow this override.');
  if (a.verdict === 'needs-cosign' && !cosigner) throw new Error(`This needs ${a.cosignWho ?? 'a second person'} to sign it.`);
}

function exceptionId(rt: Runtime): string {
  return `EXC-U${String(rt.exceptions.length + 1).padStart(2, '0')}`;
}

/** The person the rules say must hear of it, told in the record. */
function notifyEvent(rt: Runtime, offset: number, kind: GrantedException['kind'], company: string, exId: string): RawEvent | null {
  const who = OVERRIDE_POLICY[kind].notify;
  if (!who) return null;
  return mk(rt, offset, {
    actor: 'system',
    type: 'override_granted',
    company,
    text: `${PEOPLE[who].name} told of ${exId} · ${PEOPLE[who].role}`,
    related: [exId],
  });
}

/** Stop the pieces of an order that have not been placed. */
export function applyStopOrder(rt: Runtime, orderId: string, reason: string): Runtime {
  const why = reason.trim();
  if (!why) throw new Error(REASON);
  const order = deriveOrders(rt).find((o) => o.id === orderId);
  if (!order) throw new Error(`Unknown order ${orderId}`);
  if (order.stopped) throw new Error(`${orderId} is already stopped`);
  if (!order.stoppable) throw new Error(`${orderId} has nothing left to stop`);

  const placed = order.placedPieces;
  const unplaced = order.pieces - placed;
  const released = order.side === 'buy' ? order.inFlightRupees : 0;
  const events: RawEvent[] = [
    mk(rt, 0, {
      actor: CURRENT_USER,
      type: 'order_stopped',
      company: order.company,
      orderId,
      text:
        `Stopped the ${order.company} order · ${fmtInt(unplaced)} of ${fmtInt(order.pieces)} ${plural(order.pieces, 'piece')} not placed` +
        `${released > 0 ? ` · ${fmtCr(released)} of committed cash released` : ''} · "${why}"`,
      related: [orderId],
    }),
    // The agent answers for the part it had already done. An override cannot
    // reach back: the pieces that filled are trades and they stand.
    mk(rt, 1, {
      actor: order.placedBy,
      type: 'override_acknowledged',
      company: order.company,
      orderId,
      text: `Stopped placing ${order.company} on ${userName()}'s instruction · ${fmtInt(placed)} ${plural(placed, 'piece')} already filled stand`,
      related: [orderId],
    }),
  ];

  const overrides = { ...rt.agentOverrides };
  overrides[order.placedBy] = {
    ...overrides[order.placedBy],
    liveLine: `Stopped the ${order.company} order on ${userName()}'s instruction · ${fmtInt(placed)} of ${fmtInt(order.pieces)} ${plural(order.pieces, 'piece')} filled`,
  };

  return {
    ...rt,
    stopAfterPiece: { ...rt.stopAfterPiece, [orderId]: placed },
    agentOverrides: overrides,
    extraEvents: [...rt.extraEvents, ...events],
  };
}

/** Overrule a Risk or Compliance block. The Book decides whether the console may. */
export function applyOverride(rt: Runtime, eventKey: string, reason: string, cosigner: string | null): Runtime {
  const why = reason.trim();
  if (!why) throw new Error(REASON);
  const option = derive(rt).overrides.find((o) => o.key === eventKey);
  if (!option) throw new Error(`Nothing to override at ${eventKey}`);
  if (option.exception) throw new Error(`${eventKey} is already overridden`);
  checkAuthority(option, cosigner);

  const id = exceptionId(rt);
  const exception: GrantedException = {
    id,
    kind: option.kind,
    eventKey,
    limitKey: null,
    agent: option.agent,
    company: option.company,
    ticker: option.ticker,
    amount: option.amount,
    reason: why,
    cosigner: cosigner ?? null,
    grantedBy: CURRENT_USER,
    grantedAtMs: rt.nowMs,
    lapsesAtMs: option.lapsesAtMs ?? rt.nowMs,
    atExpiry: option.atExpiry ?? 're-alert',
  };

  const events: RawEvent[] = [
    mk(rt, 0, {
      actor: CURRENT_USER,
      type: 'override_granted',
      company: option.company,
      amount: option.amount,
      text:
        `Overrode ${option.agentName} · ${option.breachLine} · holds until ${fmtTime(exception.lapsesAtMs)}` +
        `${cosigner ? ` · co-signed by ${cosigner}` : ''} · "${why}"`,
      related: [eventKey],
    }),
    // The overruled agent does not change its mind. It records that it was
    // overruled and goes on measuring the breach it objected to.
    mk(rt, 1, {
      actor: option.agent,
      type: 'override_acknowledged',
      company: option.company,
      text: `Overruled by ${userName()} · ${id} · still counting ${option.company} against its limit, and will raise it again at ${fmtTime(exception.lapsesAtMs)}`,
      related: [eventKey, id],
    }),
  ];
  const told = notifyEvent(rt, 2, option.kind, option.company, id);
  if (told) events.push(told);

  let next: Runtime = { ...rt, exceptions: [...rt.exceptions, exception] };
  if (option.amount > 0 && option.ticker) {
    const price = resolveHoldings(rt, deriveOrders(rt)).find((h) => h.ticker === option.ticker)?.price ?? 0;
    if (price > 0) next = buy(next, option.ticker, option.company, option.amount, price, id, events, true);
  }
  return { ...next, extraEvents: [...rt.extraEvents, ...events] };
}

/**
 * Hold a broken limit open until the close. Permission, not restraint: a reason,
 * the Risk Manager's signature, and a lapse. The limit stays broken on the
 * record; what changes is that it stops asking for you until it lapses.
 */
export function applyLimitException(rt: Runtime, limitKey: string, reason: string, cosigner: string | null): Runtime {
  const why = reason.trim();
  if (!why) throw new Error(REASON);
  const lo = derive(rt).limitOverrides.find((l) => l.key === limitKey);
  if (!lo) throw new Error(`${limitKey} is not a broken limit`);
  if (lo.exception) throw new Error(`${lo.name} is already held on exception as ${lo.exception.id}`);
  checkAuthority(lo, cosigner);

  const id = exceptionId(rt);
  const exception: GrantedException = {
    id,
    kind: 'limit-exception',
    eventKey: limitKey,
    limitKey,
    agent: 'risk',
    company: lo.name,
    ticker: '',
    amount: 0,
    reason: why,
    cosigner: cosigner ?? null,
    grantedBy: CURRENT_USER,
    grantedAtMs: rt.nowMs,
    lapsesAtMs: lo.lapsesAtMs ?? rt.nowMs,
    atExpiry: lo.atExpiry ?? 're-alert',
  };
  const events: RawEvent[] = [
    mk(rt, 0, {
      actor: CURRENT_USER,
      type: 'override_granted',
      company: lo.name,
      text:
        `Held ${lo.name} on exception until ${fmtTime(exception.lapsesAtMs)} · ${fmtPct(lo.pct)} of the fund against a ${fmtPct(lo.limitPct, 0)} limit` +
        `${cosigner ? ` · co-signed by ${cosigner}` : ''} · "${why}"`,
      related: [id],
    }),
    mk(rt, 1, {
      actor: 'risk',
      type: 'override_acknowledged',
      company: lo.name,
      text: `Overruled by ${userName()} · ${id} · ${lo.name} stays broken on the record, agents still may not add to it, and it comes back to you at ${fmtTime(exception.lapsesAtMs)}`,
      related: [id],
    }),
  ];
  const told = notifyEvent(rt, 2, 'limit-exception', lo.name, id);
  if (told) events.push(told);
  return { ...rt, exceptions: [...rt.exceptions, exception], extraEvents: [...rt.extraEvents, ...events] };
}

/**
 * Trim a broken limit back inside. Restraint: a reason and nothing else. The
 * Portfolio Agent may already trim to a limit on its own; this is a person
 * telling it to, now, rather than leaving the breach to be carried.
 */
export function applyTrim(rt: Runtime, limitKey: string, reason: string, to: TrimTo = 'limit'): Runtime {
  const why = reason.trim();
  if (!why) throw new Error(REASON);
  const lo = derive(rt).limitOverrides.find((l) => l.key === limitKey);
  if (!lo) throw new Error(`${limitKey} is not a broken limit`);
  const plan = lo.trims.find((x) => x.to === to);
  if (!plan) throw new Error(`No trim ${to === 'target' ? 'to a target weight' : 'to the limit'} for ${lo.name}`);
  const price = resolveHoldings(rt, deriveOrders(rt)).find((h) => h.ticker === plan.ticker)?.price ?? 0;
  if (price <= 0) throw new Error(`No price for ${plan.company}`);

  const events: RawEvent[] = [
    mk(rt, 0, {
      actor: CURRENT_USER,
      type: 'trim_instructed',
      company: plan.company,
      amount: plan.amount,
      side: 'sell',
      text: `Instructed a trim · sell ${fmtCr(plan.amount)} of ${plan.company} · ${lo.name} ${fmtPct(lo.pct)} → ${fmtPct(plan.afterPct)}, ${plan.to === 'target' ? 'its target weight' : `inside its ${fmtPct(lo.limitPct, 0)} limit`} · "${why}"`,
      related: [],
      decisionId: lo.itemId,
    }),
    mk(rt, 1, {
      actor: 'portfolio',
      type: 'override_acknowledged',
      company: plan.company,
      text: `Trimming ${plan.company} on ${userName()}'s instruction · ${lo.name} goes from ${fmtPct(lo.pct)} to ${fmtPct(plan.afterPct)} of the fund`,
      related: [],
    }),
  ];
  let next = sell(rt, plan.ticker, plan.company, plan.amount, price, events);
  // An exception holding this limit open has nothing left to hold. It closes,
  // in the record, rather than lingering in the ledger past its reason.
  if (lo.exception && lo.exception.kind === 'limit-exception') {
    const exId = lo.exception.id;
    next = { ...next, exceptions: next.exceptions.map((x) => (x.id === exId ? { ...x, withdrawnAtMs: rt.nowMs } : x)) };
    events.push(
      mk(rt, events.length, {
        actor: 'system',
        type: 'override_withdrawn',
        company: lo.name,
        text: `${exId} closed · ${lo.name} trimmed back inside its limit, so there is nothing left to hold open`,
        related: [exId],
      }),
    );
  }
  return { ...next, extraEvents: [...rt.extraEvents, ...events] };
}

/**
 * Take a proposal at the size the Portfolio Agent had before it applied a cap.
 * This is your decision on the proposal as well as an override of the cap, so
 * the proposal closes and the order counts as one you approved.
 */
export function applyCapOverride(rt: Runtime, decisionId: string, reason: string, cosigner: string | null): Runtime {
  const why = reason.trim();
  if (!why) throw new Error(REASON);
  const item = derive(rt).open.find((i) => i.id === decisionId);
  const cap = item?.capOverride;
  if (!item || !cap || item.decision?.kind !== 'proposal') throw new Error(`${decisionId} has no cap to override`);
  checkAuthority(cap, cosigner);
  const d = item.decision;

  const id = exceptionId(rt);
  const exception: GrantedException = {
    id,
    kind: 'size-cap',
    eventKey: decisionId,
    limitKey: null,
    agent: 'portfolio',
    company: d.company,
    ticker: d.ticker,
    amount: cap.sizedAmount,
    reason: why,
    cosigner: cosigner ?? null,
    grantedBy: CURRENT_USER,
    grantedAtMs: rt.nowMs,
    lapsesAtMs: cap.lapsesAtMs ?? rt.nowMs,
    atExpiry: cap.atExpiry ?? 're-alert',
  };
  const events: RawEvent[] = [
    mk(rt, 0, {
      actor: CURRENT_USER,
      type: 'human_decision',
      company: d.company,
      amount: cap.sizedAmount,
      text:
        `Overrode the cap · buy ${fmtCr(cap.sizedAmount)} of ${d.company} instead of ${fmtCr(cap.cappedAmount)} · ${fmtPct(cap.preview.positionPct)} of the fund` +
        `${cosigner ? ` · co-signed by ${cosigner}` : ''} · "${why}"`,
      related: [decisionId],
    }),
    mk(rt, 1, {
      actor: 'portfolio',
      type: 'override_acknowledged',
      company: d.company,
      text: `Overruled by ${userName()} · ${id} · the cap is still the rule, and ${d.company} comes back to you at ${fmtTime(exception.lapsesAtMs)}`,
      related: [decisionId, id],
    }),
  ];
  const told = notifyEvent(rt, 2, 'size-cap', d.company, id);
  if (told) events.push(told);

  const price = resolveHoldings(rt, deriveOrders(rt)).find((h) => h.ticker === d.ticker)?.price ?? 0;
  let next: Runtime = {
    ...rt,
    exceptions: [...rt.exceptions, exception],
    outcomes: { ...rt.outcomes, [decisionId]: { status: 'taken_over_cap', at: rt.nowMs, by: CURRENT_USER, amount: cap.sizedAmount, reason: why } },
  };
  if (price > 0) next = buy(next, d.ticker, d.company, cap.sizedAmount, price, decisionId, events);
  return { ...next, extraEvents: [...rt.extraEvents, ...events] };
}

/**
 * Send a dropped idea back to research. It commits no money: the idea still has
 * to be sized, cleared by Risk and Compliance, and come back to you.
 */
export function applyReinstate(rt: Runtime, dropKey: string, reason: string): Runtime {
  const why = reason.trim();
  if (!why) throw new Error(REASON);
  const v = derive(rt);
  const idea = v.agents.research.dropped.find((x) => x.key === dropKey);
  if (!idea) throw new Error(`${dropKey} is not a dropped idea`);
  if (idea.reinstated) throw new Error(`${idea.company} is already back in research`);
  checkAuthority(idea, null);
  const running = v.agents.research.status === 'Running';

  const events: RawEvent[] = [
    mk(rt, 0, {
      actor: CURRENT_USER,
      type: 'idea_reinstated',
      company: idea.company,
      text: `Sent ${idea.company} back to research · overruling "${idea.reason}" · "${why}"`,
      related: [dropKey],
    }),
    mk(rt, 1, {
      actor: 'research',
      type: 'override_acknowledged',
      company: idea.company,
      text: running
        ? `Back on ${idea.company} on ${userName()}'s instruction · it will be sized, checked by Risk and Compliance, and come back to you`
        : `${idea.company} queued on ${userName()}'s instruction · picked up when Research Agent runs again`,
      related: [dropKey],
    }),
  ];
  const overrides = { ...rt.agentOverrides };
  if (running) overrides.research = { ...overrides.research, liveLine: `Back on ${idea.company} on ${userName()}'s instruction · the drop is overruled, not forgotten` };
  return {
    ...rt,
    reinstated: { ...rt.reinstated, [dropKey]: { atMs: rt.nowMs, reason: why } },
    agentOverrides: overrides,
    extraEvents: [...rt.extraEvents, ...events],
  };
}

/** Reopen a decision that expired before anyone decided it. */
export function applyReopen(rt: Runtime, decisionId: string, reason: string): Runtime {
  const why = reason.trim();
  if (!why) throw new Error(REASON);
  const item = derive(rt).closed.find((i) => i.id === decisionId);
  if (!item || !item.reopen) throw new Error(`${decisionId} did not expire, so there is nothing to reopen`);
  checkAuthority(item.reopen, null);
  const until = rt.nowMs + item.reopen.extensionMin * 60 * 1000;
  const outcomes = { ...rt.outcomes };
  delete outcomes[decisionId];
  const events: RawEvent[] = [
    mk(rt, 0, {
      actor: CURRENT_USER,
      type: 'decision_reopened',
      company: item.company,
      decisionId,
      text: `Reopened ${decisionId} until ${fmtTime(until)} · it expired at ${fmtTime(item.outcome?.at ?? rt.nowMs)} with nothing bought · "${why}"`,
      related: [decisionId],
    }),
  ];
  const overrides = { ...rt.agentOverrides };
  if (item.kind === 'verdict') {
    // The Portfolio Agent went back to sizing when the verdict expired. With it
    // open again, it is waiting on you again.
    overrides.portfolio = { status: 'Waiting', changedBy: CURRENT_USER, changedAt: rt.nowMs, why: `${decisionId} reopened`, liveLine: `Waiting to size the ${item.company} add · ${decisionId} reopened by ${userName()}` };
    events.push(mk(rt, 1, { actor: 'portfolio', type: 'status_change', company: item.company, text: `Status → Waiting · ${decisionId} reopened`, related: [decisionId] }));
  }
  return { ...rt, outcomes, agentOverrides: overrides, extendedUntil: { ...rt.extendedUntil, [decisionId]: until }, extraEvents: [...rt.extraEvents, ...events] };
}

// ---------------------------------------------------------------------------
// Escalation
//
// Where the rules say the person at the console may not, the console does not
// pretend they can and does not leave them with nothing. It sends the request
// to the person the rules name, and keeps it on screen until it is answered.

interface EscalationSubject {
  kind: GrantedException['kind'];
  company: string;
  ask: string;
  authority: Authority;
}

function escalationSubject(rt: Runtime, key: string): EscalationSubject | null {
  const v = derive(rt);
  const o = v.overrides.find((x) => x.key === key);
  if (o) return { kind: o.kind, company: o.company, ask: `lift ${o.agentName}'s block on ${o.company}`, authority: o };
  const l = v.limitOverrides.find((x) => x.key === key);
  if (l) return { kind: 'limit-exception', company: l.name, ask: `hold ${l.name} on exception until the close`, authority: l };
  const c = v.open.find((i) => i.capOverride?.decisionId === key)?.capOverride;
  if (c) return { kind: 'size-cap', company: v.open.find((i) => i.id === key)!.company, ask: `take ${fmtCr(c.sizedAmount)}, the size before the cap`, authority: c };
  return null;
}

export function applyEscalate(rt: Runtime, subjectKey: string): Runtime {
  if (rt.escalations.some((x) => x.subjectKey === subjectKey && !x.withdrawnAtMs)) return rt;
  const subject = escalationSubject(rt, subjectKey);
  if (!subject) throw new Error(`Nothing to escalate at ${subjectKey}`);
  if (subject.authority.verdict !== 'refused') throw new Error('You may do this yourself. There is nothing to send.');
  const to = subject.authority.askInstead;
  if (!to) throw new Error('The rules name nobody who may.');

  const id = `ESC-U${String(rt.escalations.length + 1).padStart(2, '0')}`;
  const escalation: Escalation = {
    id,
    kind: subject.kind,
    subjectKey,
    to,
    company: subject.company,
    ask: `${subject.ask[0].toUpperCase()}${subject.ask.slice(1)}`,
    sentAtMs: rt.nowMs,
    chasedAtMs: [],
  };
  const events: RawEvent[] = [
    // Asking and being told no is part of the record, before the request goes on.
    mk(rt, 0, {
      actor: 'system',
      type: 'override_refused',
      company: subject.company,
      text: `${userName()} asked to ${subject.ask} · refused · ${subject.authority.rule}`,
      related: [subjectKey],
    }),
    mk(rt, 1, {
      actor: CURRENT_USER,
      type: 'escalated',
      company: subject.company,
      text: `Sent to ${PEOPLE[to].name}, ${PEOPLE[to].role} · ${escalation.ask} · ${id}`,
      related: [subjectKey, id],
    }),
  ];
  return { ...rt, escalations: [...rt.escalations, escalation], extraEvents: [...rt.extraEvents, ...events] };
}

export function applyChase(rt: Runtime, escalationId: string): Runtime {
  const x = rt.escalations.find((e) => e.id === escalationId && !e.withdrawnAtMs);
  if (!x) throw new Error(`No open request ${escalationId}`);
  const ev = mk(rt, 0, {
    actor: CURRENT_USER,
    type: 'escalation_chased',
    company: x.company,
    text: `Chased ${PEOPLE[x.to].name} on ${escalationId} · sent ${fmtTime(x.sentAtMs)}, no answer yet`,
    related: [escalationId],
  });
  return {
    ...rt,
    escalations: rt.escalations.map((e) => (e.id === escalationId ? { ...e, chasedAtMs: [...e.chasedAtMs, rt.nowMs] } : e)),
    extraEvents: [...rt.extraEvents, ev],
  };
}

export function applyWithdrawEscalation(rt: Runtime, escalationId: string, reason = ''): Runtime {
  const x = rt.escalations.find((e) => e.id === escalationId && !e.withdrawnAtMs);
  if (!x) throw new Error(`No open request ${escalationId}`);
  const why = reason.trim();
  const ev = mk(rt, 0, {
    actor: CURRENT_USER,
    type: 'escalation_withdrawn',
    company: x.company,
    text: `Withdrew ${escalationId} before ${PEOPLE[x.to].name} answered${why ? ` · "${why}"` : ''}`,
    related: [escalationId],
  });
  return {
    ...rt,
    escalations: rt.escalations.map((e) => (e.id === escalationId ? { ...e, withdrawnAtMs: rt.nowMs } : e)),
    extraEvents: [...rt.extraEvents, ev],
  };
}

const WITHDRAWN_COPY: Record<GrantedException['kind'], (x: GrantedException) => string> = {
  'risk-block': (x) => `${actorName(x.agent)}'s block on ${x.company} stands again · what it bought stays bought`,
  'compliance-block': (x) => `${actorName(x.agent)}'s block on ${x.company} stands again · what it bought stays bought`,
  'size-cap': (x) => `the cap on ${x.company} stands again · what it bought stays bought`,
  'limit-exception': (x) => `${x.company} is back on your list as a broken limit`,
  'dropped-idea': (x) => `${x.company} is dropped again`,
  'agent-halt': (x) => `${x.company} halt stands again`,
  'expired-decision': (x) => `${x.company} is closed again`,
};

/** Take an override back before it lapses. Whatever it bought stays bought. */
export function applyWithdrawOverride(rt: Runtime, exceptionId: string, reason: string): Runtime {
  const why = reason.trim();
  if (!why) throw new Error(REASON);
  const ex = rt.exceptions.find((x) => x.id === exceptionId && !x.withdrawnAtMs);
  if (!ex) throw new Error(`Unknown or already withdrawn exception ${exceptionId}`);
  const ev = mk(rt, 0, {
    actor: CURRENT_USER,
    type: 'override_withdrawn',
    company: ex.company,
    text: `Withdrew ${exceptionId} · ${WITHDRAWN_COPY[ex.kind](ex)} · "${why}"`,
    related: [exceptionId, ex.eventKey],
  });
  return {
    ...rt,
    exceptions: rt.exceptions.map((x) => (x.id === exceptionId ? { ...x, withdrawnAtMs: rt.nowMs } : x)),
    extraEvents: [...rt.extraEvents, ev],
  };
}

export function applyBudget(rt: Runtime, id: AgentId, rupees: number): Runtime {
  const a = AGENTS[id];
  if (a.budgetRupees === null) return rt;
  const clamped = Math.max(0, Math.min(a.budgetRupees, rupees));
  const ev = mk(rt, 0, { actor: CURRENT_USER, type: 'budget_changed', text: `Set ${a.name}'s ${(a.budgetLabel ?? 'budget').toLowerCase()} to ${fmtCr(clamped)} (was ${fmtCr(rt.budgets[id] ?? a.budgetRupees)})`, related: [] });
  return { ...rt, budgets: { ...rt.budgets, [id]: clamped }, extraEvents: [...rt.extraEvents, ev] };
}
