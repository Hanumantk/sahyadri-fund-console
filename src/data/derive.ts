// Every figure the UI shows is computed here. Components never contain a typed number.

import {
  AGENTS,
  AGENT_ORDER,
  AUTHORITY,
  CANDIDATES,
  CR,
  CURRENT_USER,
  DECISIONS,
  EVENTS,
  FEEDS,
  FUND,
  HOLDINGS,
  HOLDING_PRICE_MULTIPLIERS,
  HOLDING_SHARE_OVERRIDES,
  LIMITS,
  MONITORING_PAUSE_AT,
  ORDERS_TODAY,
  BLOCK_KIND,
  ORDER_STOP_RULE,
  OVERRIDE_LAPSES_AT,
  OVERRIDE_POLICY,
  REOPEN_EXTENSION_MIN,
  SECTOR_TARGETS,
  PEOPLE,
  SOURCES,
  TRADES_0910,
  TRADE_DAY_0910,
  type OrderToday,
  type ActorId,
  type Agent,
  type AgentId,
  type AgentStatus,
  type Break,
  type Decision,
  type CosignRule,
  type ExpiryAction,
  type OverrideKind,
  type Feed,
  type FeedId,
  type Holding,
  type PersonId,
  type Proposal,
  type RawEvent,
  type Sector,
  type StateName,
  type Verdict,
} from './scenario';
import { MARKET_OPEN_MS, isMarketOpen, istParts, ms } from './clock';
import { dateMs, daysBetween, fmtAge, fmtCr, fmtDayMonth, fmtInt, fmtLakh, fmtPct, fmtPrice, fmtTime, plural } from './format';

// ---------------------------------------------------------------------------
// Runtime: what changes while the reviewer uses the app

export type DecisionStatus =
  | 'open'
  | 'taken'
  | 'taken_less'
  | 'declined'
  | 'expired'
  | 'sided_bull'
  | 'halfway'
  | 'sided_bear'
  | 'lapsed'
  | 'accepted_broker'
  | 'kept_ours'
  | 'assigned'
  // Proposal taken at the size the Portfolio Agent had before it applied a cap.
  | 'taken_over_cap'
  // A broken limit a person chose to hold until the close, with a co-signer.
  | 'on_exception';

export interface DecisionOutcome {
  status: DecisionStatus;
  at: number;
  by?: ActorId;
  amount?: number;
  reason?: string;
}

export interface AgentOverride {
  status?: AgentStatus;
  changedBy?: ActorId;
  changedAt?: number;
  why?: string;
  liveLine?: string;
}

/**
 * An override a person granted today: one agent decision suspended, for one
 * instance, until the close. It is not a rule change. The rule it suspends is
 * still the rule, which is why this carries an expiry and the rulebook does not.
 */
export interface GrantedException {
  id: string;
  kind: OverrideKind;
  /** The authoring key of the agent action that was overruled. */
  eventKey: string;
  /** The limit it holds open, for a limit exception: 'sector:Banking'. */
  limitKey: string | null;
  /** The agent that was overruled. */
  agent: AgentId;
  company: string;
  ticker: string;
  /** Rupees the override released. Zero for a halt that was lifted. */
  amount: number;
  reason: string;
  cosigner: string | null;
  grantedBy: PersonId;
  grantedAtMs: number;
  lapsesAtMs: number;
  atExpiry: ExpiryAction;
  /** Set when the person took it back before it lapsed. */
  withdrawnAtMs?: number;
}

export interface Runtime {
  state: StateName;
  nowMs: number;
  extraEvents: RawEvent[];
  shareDelta: Record<string, number>;
  cashDelta: number;
  cashIdleSinceMs: number | null;
  outcomes: Record<string, DecisionOutcome>;
  agentOverrides: Partial<Record<AgentId, AgentOverride>>;
  budgets: Partial<Record<AgentId, number>>;
  pausedAll: boolean;
  /** Agent overrides as they were before "Pause all agents", restored on resume. */
  prePause?: Partial<Record<AgentId, AgentOverride>>;
  /**
   * Orders a person stopped, by the last piece allowed to go. Pieces past it
   * never fill, whatever the clock says. Keyed by order id.
   */
  stopAfterPiece: Record<string, number>;
  /** Overrides granted today, in the order they were granted. */
  exceptions: GrantedException[];
  /** Requests sent to the person who may, when the person at the console may not. */
  escalations: Escalation[];
  /** Ideas a person sent back to research, by the authoring key of the drop. */
  reinstated: Record<string, { atMs: number; reason: string }>;
  /** Decisions a person reopened after they expired, by the new deadline. */
  extendedUntil: Record<string, number>;
}

/**
 * A request for an override the person at the console may not grant. It stays
 * open, and visible, until it is answered or withdrawn; nobody answering it is
 * itself something the screen says.
 */
export interface Escalation {
  id: string;
  kind: OverrideKind;
  /** The authoring key of what it is about. */
  subjectKey: string;
  to: PersonId;
  company: string;
  /** What is being asked, in a sentence. */
  ask: string;
  sentAtMs: number;
  chasedAtMs: number[];
  withdrawnAtMs?: number;
}

export function initialRuntime(state: StateName, nowMs: number): Runtime {
  return {
    state,
    nowMs,
    extraEvents: [],
    shareDelta: {},
    cashDelta: 0,
    cashIdleSinceMs: null,
    outcomes: {},
    agentOverrides: {},
    budgets: {},
    pausedAll: false,
    stopAfterPiece: {},
    exceptions: [],
    escalations: [],
    reinstated: {},
    extendedUntil: {},
  };
}

// ---------------------------------------------------------------------------
// Resolved scenario

export interface ResolvedHolding extends Holding {
  value: number;
  pct: number;
  limitPct: number;
  usedPct: number;
  headroom: number;
  status: 'ok' | 'near' | 'broken';
  /** Derived from the position and the day's traded value, never typed. */
  daysToSell: number;
}

/**
 * Sessions to sell a position without being more than `participationPct` of a
 * day's traded value. A large cap that trades hundreds of crore a day absorbs a
 * position this size inside one session.
 */
export function daysToSell(value: number, advRupees: number): number {
  if (advRupees <= 0) return 0;
  return value / ((LIMITS.participationPct / 100) * advRupees);
}

/** A ticker's price at NOW in a state, after that state's multiplier. */
export function priceOf(ticker: string, state: StateName): number {
  const h = [...HOLDINGS, ...CANDIDATES].find((x) => x.ticker === ticker);
  if (!h) return 0;
  const m = HOLDING_PRICE_MULTIPLIERS[state];
  return m ? h.price * (m.byTicker[h.ticker] ?? m.bySector[h.sector] ?? m.other) : h.price;
}

export function holdingSpec(ticker: string): Holding | undefined {
  return [...HOLDINGS, ...CANDIDATES].find((x) => x.ticker === ticker);
}

/** Shares at the 10 Sep close, before any of today's fills. */
export function openingShares(ticker: string, state: StateName): number {
  const override = HOLDING_SHARE_OVERRIDES[state]?.[ticker];
  return override ?? holdingSpec(ticker)?.shares ?? 0;
}

// ---------------------------------------------------------------------------
// The ledger: today's orders and the fills that have landed

export interface FillRecord {
  id: string;
  orderId: string;
  ticker: string;
  company: string;
  side: 'buy' | 'sell';
  /** 1-based, in time order. */
  piece: number;
  pieces: number;
  shares: number;
  price: number;
  /** Always shares x price. Never typed. */
  amount: number;
  atMs: number;
}

export interface OrderFigure extends OrderToday {
  /** Whole shares in each piece. */
  sharesPerPiece: number;
  /** What the order is worth at the price now. This is the size on screen. */
  sizeRupees: number;
  fills: FillRecord[];
  filledShares: number;
  filledRupees: number;
  remainingShares: number;
  /** Rupees still to be spent or raised. A buy commits cash the fund no longer has. */
  inFlightRupees: number;
  complete: boolean;
  completedAtMs: number | null;
  /** The last piece allowed to go, when a person stopped the order. */
  stoppedAfterPiece: number | null;
  stopped: boolean;
  /** Pieces that were placed, and pieces that now never will be. */
  placedPieces: number;
  unplacedPieces: number;
  /** True while there is something left to stop. */
  stoppable: boolean;
}

function fillTimes(o: OrderToday, state: StateName): string[] {
  return o.fillAt[state] ?? o.fillAt.default;
}

export function deriveOrders(rt: Runtime): OrderFigure[] {
  return ORDERS_TODAY.map((o) => {
    const price = priceOf(o.ticker, rt.state);
    const sharesPerPiece = o.shares / o.pieces;
    const times = fillTimes(o, rt.state);
    const all: FillRecord[] = times.map((at, i) => {
      // Paise are the smallest unit a price is quoted in.
      const p = Math.round(price * (1 + o.driftBps[i] / 10_000) * 100) / 100;
      return {
        id: `${o.id}-P${String(i + 1).padStart(2, '0')}`,
        orderId: o.id,
        ticker: o.ticker,
        company: o.company,
        side: o.side,
        piece: i + 1,
        pieces: o.pieces,
        shares: sharesPerPiece,
        price: p,
        amount: sharesPerPiece * p,
        atMs: ms(at),
      };
    });
    // A stopped order is the one case where the clock is not the only gate. A
    // piece past the stop never fills, however late the morning runs, which is
    // what makes the stop a real control rather than a label.
    const stoppedAfterPiece = rt.stopAfterPiece[o.id] ?? null;
    const stopped = stoppedAfterPiece !== null;
    const fills = all.filter((f) => f.atMs <= rt.nowMs && (stoppedAfterPiece === null || f.piece <= stoppedAfterPiece));
    const filledShares = fills.reduce((s, f) => s + f.shares, 0);
    const remainingShares = o.shares - filledShares;
    const complete = fills.length === o.pieces;
    return {
      ...o,
      sharesPerPiece,
      sizeRupees: o.shares * price,
      fills,
      filledShares,
      filledRupees: fills.reduce((s, f) => s + f.amount, 0),
      remainingShares,
      // Stopping an order releases the cash it had promised. Nothing else about
      // it changes: the pieces that filled are trades and they stand.
      inFlightRupees: stopped ? 0 : remainingShares * price,
      complete,
      completedAtMs: complete ? all[all.length - 1].atMs : null,
      stoppedAfterPiece,
      stopped,
      placedPieces: fills.length,
      unplacedPieces: o.pieces - fills.length,
      stoppable: !stopped && !complete && fills.length < o.pieces,
    };
  });
}

export function allFills(orders: OrderFigure[]): FillRecord[] {
  return orders.flatMap((o) => o.fills).sort((a, b) => a.atMs - b.atMs);
}

/** Cash the fund has already committed to orders that have not finished. */
export function inFlightCash(orders: OrderFigure[]): number {
  return orders.filter((o) => o.side === 'buy').reduce((s, o) => s + o.inFlightRupees, 0);
}

export function resolveHoldings(rt: Runtime, orders: OrderFigure[]): Holding[] {
  const net: Record<string, number> = {};
  for (const f of allFills(orders)) {
    net[f.ticker] = (net[f.ticker] ?? 0) + (f.side === 'buy' ? f.shares : -f.shares);
  }
  const mult = HOLDING_PRICE_MULTIPLIERS[rt.state];
  return [...HOLDINGS, ...CANDIDATES].map((h) => {
    const shares = openingShares(h.ticker, rt.state) + (net[h.ticker] ?? 0) + (rt.shareDelta[h.ticker] ?? 0);
    const price = mult ? h.price * (mult.byTicker[h.ticker] ?? mult.bySector[h.sector] ?? mult.other) : h.price;
    return { ...h, shares, price };
  });
}

/** Trade-date accounting: today's sale proceeds are cash, settled or not. */
export function deriveCash(rt: Runtime, orders: OrderFigure[]): number {
  let cash = FUND.openingCash + rt.cashDelta;
  for (const f of allFills(orders)) cash += f.side === 'sell' ? f.amount : -f.amount;
  return cash;
}

export function decisionsFor(state: StateName): Decision[] {
  return DECISIONS.filter((d) => d.states.includes(state));
}

// ---------------------------------------------------------------------------
// The log
//
// Fills are not authored. They are generated from the orders, so a fill can
// never disagree with the order it belongs to. Nothing dated after the clock is
// included, which is how the pieces still to come stay out of sight until they
// land.

function isoOf(msValue: number): string {
  // Same shape as the authored timestamps: IST wall clock with its offset.
  const p = istParts(msValue);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${two(p.month + 1)}-${two(p.day)}T${two(p.hour)}:${two(p.minute)}:${two(p.second)}+05:30`;
}

function placedEventIdFor(orderId: string): string | undefined {
  return EVENTS.find((e) => e.type === 'order_placed' && e.orderId === orderId)?.id;
}

function orderEvents(orders: OrderFigure[]): RawEvent[] {
  const out: RawEvent[] = [];
  for (const o of orders) {
    const placed = placedEventIdFor(o.id);
    for (const f of o.fills) {
      out.push({
        id: f.id,
        at: isoOf(f.atMs),
        actor: o.placedBy,
        type: 'fill',
        company: o.company,
        side: o.side,
        amount: f.amount,
        orderId: o.id,
        piece: f.piece,
        text: o.fillText,
        ...(placed ? { related: [placed] } : {}),
      });
    }
    // A one-piece order is finished by its own fill; saying so twice is noise.
    if (o.pieces > 1 && o.complete && o.completedAtMs !== null) {
      out.push({
        id: `${o.id}-DONE`,
        at: isoOf(o.completedAtMs + 1000),
        actor: o.placedBy,
        type: 'order_complete',
        company: o.company,
        orderId: o.id,
        text: `Finished the ${o.company} order · {orderPieces} {orderPieceWord} · {orderFilled} ${o.side === 'buy' ? 'bought' : 'sold'}`,
        ...(placed ? { related: [placed] } : {}),
      });
    }
  }
  return out;
}

/**
 * Events for a state, in time order, with display IDs numbered from 1 with no
 * gaps. The Audit trail says every entry is locked to the one before it, so a
 * state that never had an event must not leave a hole where it would have been.
 * Authoring keys stay stable; only what is shown is renumbered.
 */
export function eventsFor(rt: Runtime, orders: OrderFigure[]): RawEvent[] {
  const base = EVENTS.filter((e) => !e.states || e.states.includes(rt.state));
  const all = [...base, ...orderEvents(orders), ...rt.extraEvents]
    .filter((e) => ms(e.at) <= rt.nowMs)
    .sort((a, b) => ms(a.at) - ms(b.at));

  const idMap = new Map<string, string>();
  let n = 0;
  for (const e of all) {
    if (ms(e.at) >= MARKET_OPEN_MS) {
      n += 1;
      idMap.set(e.id, `EVT-${String(n).padStart(4, '0')}`);
    } else {
      idMap.set(e.id, e.id);
    }
  }
  return all.map((e) => ({
    ...e,
    key: e.id,
    id: idMap.get(e.id)!,
    ...(e.related ? { related: e.related.map((r) => idMap.get(r) ?? r) } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Event text
//
// Every number inside an event's text is filled in here from the same figures
// the rest of the screen uses, so the log can never quote a number the fund
// does not have.

export type Tokens = Record<string, string>;

export function fillTemplate(text: string, tokens: Tokens): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in tokens ? tokens[key] : whole));
}

function fmtLakhPlain(rupees: number): string {
  return `${(rupees / 100_000).toFixed(1)} lakh`;
}

export interface TokenContext {
  state: StateName;
  nowMs: number;
  fund: FundFigures;
  limits: LimitsSummary;
  feeds: FeedFigure[];
  orders: OrderFigure[];
  counts: AgentCounts;
  /**
   * Shares a person's own decisions have added since, by ticker. A log entry
   * quotes the position the agent measured, so anything bought on the strength
   * of that entry has to come back out before the figure is restated.
   */
  boughtSinceByTicker: Record<string, number>;
}

/** The figures every template can reach, whatever event it belongs to. */
export function buildTokens(ctx: TokenContext): Tokens {
  const { fund, limits, counts, orders } = ctx;
  const banking = fund.sectors.find((s) => s.name === 'Banking');
  const airtel = orders.find((o) => o.ticker === 'BHARTIARTL');
  const infy = DECISIONS.find((d) => d.id === 'DEC-0911-01') as Proposal | undefined;
  const hdfc = DECISIONS.find((d) => d.id === 'DEC-0911-02') as Verdict | undefined;
  const infyAmount = infy ? cappedAmount(infy, fund.fundValue) : 0;
  return {
    feedCount: String(ctx.feeds.length),
    otherAgentCount: String(AGENT_ORDER.length),
    holdingsCount: String(fund.holdings.filter((h) => h.shares > 0).length),
    ordersPlaced: String(counts.ordersPlaced),
    trimCount: String(counts.trims),
    settledCount: String(counts.settled),
    trades0910Count: String(TRADES_0910.length),
    trades0910Date: fmtDayMonth(dateMs(TRADE_DAY_0910)),
    companyLimitPct: fmtPct(LIMITS.maxCompanyPct, 0),
    sectorLimitPct: fmtPct(LIMITS.maxSectorPct, 0),
    firstPositionPct: fmtPct(LIMITS.firstPositionPct, 0),
    bankingPct: banking ? fmtPct(banking.pct) : '',
    bankingUsedPct: banking ? fmtPct(banking.usedPct, 0) : '',
    nearLimitPct: fmtPct(LIMITS.nearLimitPct, 0),
    airtelSize: airtel ? fmtCr(airtel.sizeRupees) : '',
    airtelPieces: airtel ? String(airtel.pieces) : '',
    airtelDone: airtel ? String(airtel.fills.length) : '',
    growthHigh: infy?.conflict.sides[0].value ?? '',
    growthLow: infy?.conflict.sides[1].value ?? '',
    // The same two figures without the hedge, for sentences that already carry it.
    growthHighBare: (infy?.conflict.sides[0].value ?? '').replace(/^about /, ''),
    growthLowBare: (infy?.conflict.sides[1].value ?? '').replace(/^about /, ''),
    infySized: infy ? fmtCr(infy.sizedAmount) : '',
    infyAmount: fmtCr(infyAmount),
    bullAmount: hdfc ? fmtCr(hdfc.bull.amount) : '',
    pricesLateAtPause: fmtAge(feedLastUpdated(FEEDS.find((f) => f.id === 'prices')!, ctx.state, ctx.nowMs), ms(MONITORING_PAUSE_AT)),
    brokenLimitCount: String(limits.broken.length),
    relianceBought0910: fmtCr(tradedOn0910((t) => t.ticker === 'RELIANCE' && t.side === 'buy')),
    banksBought0910: fmtCr(
      tradedOn0910((t) => holdingSpec(t.ticker)?.sector === 'Banking' && t.side === 'buy') -
        tradedOn0910((t) => holdingSpec(t.ticker)?.sector === 'Banking' && t.side === 'sell'),
    ),
  };
}

/** Rupees traded on 10 Sep by whatever slice of that day's trades you ask for. */
export function tradedOn0910(where: (t: (typeof TRADES_0910)[number]) => boolean): number {
  return TRADES_0910.filter(where).reduce((sum, t) => sum + t.shares * t.price, 0);
}

/** The figures that depend on which event is being rendered. */
export function eventTokens(e: RawEvent, ctx: TokenContext): Tokens {
  const t: Tokens = {};
  const atMs = ms(e.at);
  if (e.count !== undefined) t.count = String(e.count);
  if (e.amount !== undefined) {
    t.amount = fmtCr(e.amount);
    t.amountPctOfFund = fmtPct((e.amount / ctx.fund.fundValue) * 100);
    t.fillAmount = fmtCr(e.amount);
    t.fillLakh = fmtLakhPlain(e.amount);
  }
  if (e.piece !== undefined) t.piece = String(e.piece);

  if (e.tradeIds) {
    const total = e.tradeIds.reduce((s, id) => {
      const tr = TRADES_0910.find((x) => x.id === id);
      return s + (tr ? tr.shares * tr.price : 0);
    }, 0);
    t.relatedTradesTotal = fmtCr(total);
  }

  const order = e.orderId ? ctx.orders.find((o) => o.id === e.orderId) : undefined;
  if (order) {
    t.orderSize = fmtCr(order.sizeRupees);
    t.orderPieces = String(order.pieces);
    t.orderPieceWord = plural(order.pieces, 'piece');
    t.orderFilled = fmtCr(order.filledRupees);
    t.company = order.company;
    const spec = holdingSpec(order.ticker);
    const signed = order.side === 'buy' ? order.sizeRupees : -order.sizeRupees;
    const holding = ctx.fund.holdings.find((h) => h.ticker === order.ticker);
    // The weight the order was sized against: the book before it was placed.
    const before = (holding?.value ?? 0) - signed * (order.filledShares / order.shares);
    t.tickerAfterPct = fmtPct(((before + signed) / ctx.fund.fundValue) * 100);
    if (spec) {
      const sector = ctx.fund.sectors.find((s) => s.name === spec.sector);
      const sectorBefore = (sector?.value ?? 0) - signed * (order.filledShares / order.shares);
      t.sectorAfterPct = fmtPct(((sectorBefore + signed) / ctx.fund.fundValue) * 100);
      t.sectorName = spec.sector;
    }
    const f = order.fills.find((x) => x.piece === e.piece);
    if (f) {
      t.fillShares = fmtInt(f.shares);
      t.fillPrice = fmtPrice(f.price);
      t.fillAmount = fmtCr(f.amount);
      t.fillLakh = fmtLakhPlain(f.amount);
    }
  }

  if (e.ticker && e.amount !== undefined) {
    const h = ctx.fund.holdings.find((x) => x.ticker === e.ticker);
    // What the position would have become, measured from the position the agent
    // was looking at. Shares bought since — on an override of this very block —
    // are taken back out, or the entry would restate its own figure after the
    // fact and the log would stop agreeing with what was decided.
    const sinceShares = ctx.boughtSinceByTicker[e.ticker] ?? 0;
    const asMeasured = (h?.value ?? 0) - sinceShares * (h?.price ?? 0);
    t.tickerPlusAmountPct = fmtPct(((asMeasured + e.amount) / ctx.fund.fundValue) * 100);
  }

  if (e.feedId) {
    const feed = FEEDS.find((x) => x.id === e.feedId);
    if (feed) {
      const last = feedLastUpdated(feed, ctx.state, ctx.nowMs);
      const due = feed.dueAt ? ms(feed.dueAt) : feed.stuckAt[ctx.state] ? ms(feed.stuckAt[ctx.state]!) : last;
      t.feedLate = fmtAge(due, atMs);
      t.feedGap = fmtAge(due, feed.scheduledFrom ? ms(feed.scheduledFrom) : atMs);
      t.feedLastUpdate = fmtTime(due);
    }
  }

  if (e.decisionId) {
    const d = DECISIONS.find((x) => x.id === e.decisionId);
    if (d && d.kind === 'proposal') {
      t.decisionSized = fmtCr(d.sizedAmount);
      t.decisionAmount = fmtCr(cappedAmount(d, ctx.fund.fundValue));
      t.decisionExpires = fmtTime(ms(d.expiresAt));
    } else if (d && d.kind === 'verdict') {
      t.decisionExpires = fmtTime(ms(d.expiresAt));
      t.bullAmount = fmtCr(d.bull.amount);
    } else if (d && d.kind === 'break') {
      const diff = breakDifference(d);
      t.breakTradeId = d.tradeId;
      t.breakOurShares = fmtInt(d.ourShares);
      t.breakBrokerShares = fmtInt(d.brokerShares);
      t.breakDiff = fmtLakh(diff.rupees);
      t.breakPrice = fmtPrice(d.price);
    }
  }
  return t;
}

/**
 * A first position is capped at a share of the fund, so the size on screen is a
 * consequence of the rule rather than a number that happens to sit beside it.
 */
export function cappedAmount(p: Proposal, fundValue: number): number {
  if (p.capRule !== 'firstPosition') return p.sizedAmount;
  return Math.min(p.sizedAmount, (LIMITS.firstPositionPct / 100) * fundValue);
}

/** The token context for a runtime, for callers outside derive(). */
export function contextFor(rt: Runtime): { ctx: TokenContext; tokens: Tokens; orders: OrderFigure[] } {
  const orders = deriveOrders(rt);
  const feeds = deriveFeeds(rt);
  const fund = deriveFund(rt, feeds, orders);
  const limits = deriveLimits(fund, rt.state);
  const counts = deriveCounts(eventsFor(rt, orders));
  const ctx: TokenContext = { state: rt.state, nowMs: rt.nowMs, fund, limits, feeds, orders, counts, boughtSinceByTicker: rt.shareDelta };
  return { ctx, tokens: buildTokens(ctx), orders };
}

/** Decisions for a runtime, resolved. Anything that acts on one must use this. */
export function resolvedDecisionsFor(rt: Runtime): Decision[] {
  const { ctx, tokens } = contextFor(rt);
  return resolveDecisions(rt.state, ctx, tokens);
}

/** Decisions for a state with every derived figure filled in. */
export function resolveDecisions(state: StateName, ctx: TokenContext, tokens: Tokens): Decision[] {
  return decisionsFor(state).map((d) => {
    if (d.kind === 'proposal') {
      const amount = cappedAmount(d, ctx.fund.fundValue);
      return {
        ...d,
        amount,
        tradeUnderEachSide: d.tradeUnderEachSide.map((s) => fillTemplate(s, tokens)) as [string, string],
        reasoning: d.reasoning.map((s) => fillTemplate(s, tokens)),
        versions: d.versions.map((v) => ({
          ...v,
          amount: v.v === d.versions.length ? amount : v.amount,
          note: fillTemplate(v.note, tokens),
        })),
      };
    }
    if (d.kind === 'verdict') {
      return {
        ...d,
        bear: { ...d.bear, reasoning: d.bear.reasoning.map((s) => fillTemplate(s, tokens)) },
        bull: { ...d.bull, reasoning: d.bull.reasoning.map((s) => fillTemplate(s, tokens)) },
      };
    }
    return d;
  });
}

// ---------------------------------------------------------------------------
// Fund figures

export interface SectorFigure {
  name: Sector;
  value: number;
  pct: number;
  limitPct: number;
  usedPct: number;
  headroom: number;
  status: 'ok' | 'near' | 'broken';
}

export interface FundFigures {
  holdingsValue: number;
  cash: number;
  cashPct: number;
  cashIdleSinceMs: number;
  cashIdleDays: number;
  minCashRupees: number;
  spendableCash: number;
  fundValue: number;
  units: number;
  navPerUnit: number;
  official: { navPerUnit: number; dateMs: number; fundValue: number };
  dayChange: number;
  dayChangePct: number;
  benchmarkPct: number;
  gapPts: number;
  peak: { navPerUnit: number; dateMs: number };
  drawdownPct: number;
  pausePct: number;
  roomPts: number;
  drawdownProgress: number;
  pauseNavPerUnit: number;
  deployedPct: number;
  holdings: ResolvedHolding[];
  sectors: SectorFigure[];
  measuredAtMs: number;
  stale: boolean;
}

function status(usedPct: number): 'ok' | 'near' | 'broken' {
  if (usedPct > 100) return 'broken';
  if (usedPct >= LIMITS.nearLimitPct) return 'near';
  return 'ok';
}

export function deriveFund(rt: Runtime, feeds: FeedFigure[] | undefined, orders: OrderFigure[]): FundFigures {
  const raw = resolveHoldings(rt, orders);
  const holdingsValue = raw.reduce((s, h) => s + h.shares * h.price, 0);
  const cash = deriveCash(rt, orders);
  const fundValue = holdingsValue + cash;
  const units = FUND.units;
  const navPerUnit = fundValue / units;

  const holdings: ResolvedHolding[] = raw
    .map((h) => {
      const value = h.shares * h.price;
      const pct = (value / fundValue) * 100;
      const usedPct = (pct / LIMITS.maxCompanyPct) * 100;
      return {
        ...h,
        value,
        pct,
        limitPct: LIMITS.maxCompanyPct,
        usedPct,
        headroom: (LIMITS.maxCompanyPct / 100) * fundValue - value,
        status: status(usedPct),
        daysToSell: daysToSell(value, h.advRupees),
      };
    })
    .sort((a, b) => b.value - a.value);

  const bySector = new Map<Sector, number>();
  for (const h of holdings) bySector.set(h.sector, (bySector.get(h.sector) ?? 0) + h.value);
  const sectors: SectorFigure[] = [...bySector.entries()]
    .map(([name, value]) => {
      const pct = (value / fundValue) * 100;
      const usedPct = (pct / LIMITS.maxSectorPct) * 100;
      return {
        name,
        value,
        pct,
        limitPct: LIMITS.maxSectorPct,
        usedPct,
        headroom: (LIMITS.maxSectorPct / 100) * fundValue - value,
        status: status(usedPct),
      };
    })
    .sort((a, b) => b.value - a.value);

  const official = FUND.official[rt.state];
  const officialFundValue = official.navPerUnit * units;
  const dayChange = fundValue - officialFundValue;
  const dayChangePct = (dayChange / officialFundValue) * 100;
  const benchmarkPct = FUND.benchmarkChangeTodayPct[rt.state];

  const drawdownPct = (navPerUnit / FUND.peak.navPerUnit - 1) * 100;
  const pausePct = -LIMITS.drawdownPausePct;
  const roomPts = LIMITS.drawdownPausePct + drawdownPct;

  const cashIdleSinceMs = rt.cashIdleSinceMs ?? dateMs(FUND.cashIdleSince);
  const priceFeed = feeds?.find((f) => f.id === 'prices');
  const measuredAtMs = priceFeed?.lastUpdatedMs ?? rt.nowMs;
  const stale = priceFeed?.late ?? false;

  return {
    holdingsValue,
    cash,
    cashPct: (cash / fundValue) * 100,
    cashIdleSinceMs,
    cashIdleDays: daysBetween(cashIdleSinceMs, rt.nowMs),
    minCashRupees: (LIMITS.minCashPct / 100) * fundValue,
    spendableCash: cash - (LIMITS.minCashPct / 100) * fundValue,
    fundValue,
    units,
    navPerUnit,
    official: { navPerUnit: official.navPerUnit, dateMs: dateMs(official.date), fundValue: officialFundValue },
    dayChange,
    dayChangePct,
    benchmarkPct,
    gapPts: dayChangePct - benchmarkPct,
    peak: { navPerUnit: FUND.peak.navPerUnit, dateMs: dateMs(FUND.peak.date) },
    drawdownPct,
    pausePct,
    roomPts,
    drawdownProgress: Math.min(1, Math.max(0, -drawdownPct / LIMITS.drawdownPausePct)),
    pauseNavPerUnit: FUND.peak.navPerUnit * (1 - LIMITS.drawdownPausePct / 100),
    deployedPct: (holdingsValue / fundValue) * 100,
    holdings,
    sectors,
    measuredAtMs,
    stale,
  };
}

// ---------------------------------------------------------------------------
// Limits

export interface LimitRow {
  key: string;
  name: string;
  kind: 'company' | 'sector';
  pct: number;
  limitPct: number;
  usedPct: number;
  headroom: number;
  status: 'ok' | 'near' | 'broken';
  why: string;
}

export interface LimitsSummary {
  broken: LimitRow[];
  near: LimitRow[];
  nearest: LimitRow[];
  all: LimitRow[];
}

const LIMIT_WHY: Record<string, Partial<Record<StateName, string>>> = {
  'company:RELIANCE': { normal: 'Execution Agent bought {relianceBought0910} on {trades0910Date} on an approved proposal', bad: 'Execution Agent bought {relianceBought0910} on {trades0910Date} on an approved proposal' },
  // Agents did buy banks on 10 Sep, so the reason names what they added instead
  // of denying it. The rise is a month's, not a day's: the day is down 1.1%.
  'sector:Banking': { normal: 'Bank shares rose 6% this month · agents added {banksBought0910} net on {trades0910Date}', bad: 'Over limit due to price rise · bank shares rose this month · no agent traded today' },
};

export function deriveLimits(f: FundFigures, state: StateName, tokens: Tokens = {}): LimitsSummary {

  const rows: LimitRow[] = [
    ...f.holdings
      .filter((h) => h.shares > 0)
      .map((h) => ({
        key: `company:${h.ticker}`,
        name: h.company,
        kind: 'company' as const,
        pct: h.pct,
        limitPct: h.limitPct,
        usedPct: h.usedPct,
        headroom: h.headroom,
        status: h.status,
        why: fillTemplate(LIMIT_WHY[`company:${h.ticker}`]?.[state] ?? '', tokens),
      })),
    ...f.sectors.map((s) => ({
      key: `sector:${s.name}`,
      name: `${s.name} sector`,
      kind: 'sector' as const,
      pct: s.pct,
      limitPct: s.limitPct,
      usedPct: s.usedPct,
      headroom: s.headroom,
      status: s.status,
      why: fillTemplate(LIMIT_WHY[`sector:${s.name}`]?.[state] ?? '', tokens),
    })),
  ].sort((a, b) => b.usedPct - a.usedPct);
  return {
    broken: rows.filter((r) => r.status === 'broken'),
    near: rows.filter((r) => r.status === 'near'),
    nearest: rows.slice(0, 2),
    all: rows,
  };
}

// ---------------------------------------------------------------------------
// Feeds

export interface FeedFigure extends Feed {
  lastUpdatedMs: number;
  ageSec: number;
  late: boolean;
  dependents: AgentId[];
}

/**
 * When a feed last landed. A streaming feed is a fixed lag behind the clock. A
 * scheduled feed lands on its cadence from a fixed anchor, so its timestamp
 * stays put instead of sliding forward and staying forever the same age.
 */
export function feedLastUpdated(f: Feed, state: StateName, nowMs: number): number {
  const stuck = f.stuckAt[state];
  if (stuck) return ms(stuck);
  if (f.scheduledFrom) {
    const from = ms(f.scheduledFrom);
    if (nowMs <= from) return from;
    const step = f.expectedEverySec * 1000;
    return from + Math.floor((nowMs - from) / step) * step;
  }
  return nowMs - (f.lagSec ?? 0) * 1000;
}

export function deriveFeeds(rt: Runtime): FeedFigure[] {
  return FEEDS.map((f) => {
    const lastUpdatedMs = feedLastUpdated(f, rt.state, rt.nowMs);
    const ageSec = Math.max(0, (rt.nowMs - lastUpdatedMs) / 1000);
    const dependents = AGENT_ORDER.filter((a) => AGENTS[a].feeds.includes(f.id));
    return { ...f, lastUpdatedMs, ageSec, late: ageSec > f.expectedEverySec, dependents };
  });
}

export interface DataHealth {
  total: number;
  live: number;
  lateFeeds: FeedFigure[];
  allLive: boolean;
  checkedMs: number;
  label: string;
}

export function deriveDataHealth(feeds: FeedFigure[], nowMs: number): DataHealth {
  const lateFeeds = feeds.filter((f) => f.late);
  const checkedMs = Math.floor(nowMs / 30_000) * 30_000;
  const label = lateFeeds.length
    ? `${lateFeeds.length} of ${feeds.length} feeds late · ${lateFeeds.map((f) => `${f.name} ${Math.floor(f.ageSec / 60)} min`).join(', ')}`
    : `All ${feeds.length} feeds live · checked ${fmtTime(checkedMs)}`;
  return { total: feeds.length, live: feeds.length - lateFeeds.length, lateFeeds, allLive: lateFeeds.length === 0, checkedMs, label };
}

// ---------------------------------------------------------------------------
// Counts from the log

export interface AgentCounts {
  ideasFound: number;
  ideasDropped: number;
  sourcesRead: number;
  sized: number;
  cutDown: number;
  trims: number;
  riskChecked: number;
  riskCleared: number;
  riskSent: number;
  riskBlocked: number;
  complianceChecked: number;
  complianceBlocked: number;
  ordersPlaced: number;
  /** Orders placed because a person overruled an agent. */
  ordersOnOverride: number;
  buys: number;
  sells: number;
  traded: number;
  settled: number;
  mismatches: number;
  feedDelays: number;
  feedRecovered: number;
  agentsPaused: number;
  humanApproved: number;
}

export function todayEvents(events: RawEvent[]): RawEvent[] {
  return events.filter((e) => ms(e.at) >= MARKET_OPEN_MS);
}

export function deriveCounts(events: RawEvent[]): AgentCounts {
  const t = todayEvents(events);
  const n = (type: string, actor?: ActorId) => t.filter((e) => e.type === type && (!actor || e.actor === actor)).length;
  const fills = t.filter((e) => e.type === 'fill');
  return {
    ideasFound: n('idea_found', 'research'),
    ideasDropped: n('idea_dropped', 'research'),
    sourcesRead: t.filter((e) => e.type === 'sources_read').reduce((s, e) => s + (e.count ?? 0), 0),
    sized: n('sized', 'portfolio'),
    cutDown: n('cut_down', 'portfolio'),
    trims: n('trim', 'portfolio'),
    riskChecked: n('risk_cleared', 'risk') + n('risk_blocked', 'risk') + n('sent_to_person', 'risk'),
    riskCleared: n('risk_cleared', 'risk'),
    riskSent: n('sent_to_person', 'risk'),
    riskBlocked: n('risk_blocked', 'risk'),
    complianceChecked: n('compliance_cleared', 'compliance') + n('compliance_blocked', 'compliance'),
    complianceBlocked: n('compliance_blocked', 'compliance'),
    ordersPlaced: n('order_placed', 'execution'),
    ordersOnOverride: t.filter((e) => e.type === 'order_placed' && e.actor === 'execution' && e.onOverride).length,
    buys: fills.filter((e) => e.side === 'buy').length,
    sells: fills.filter((e) => e.side === 'sell').length,
    traded: fills.reduce((s, e) => s + (e.amount ?? 0), 0),
    settled: n('settled', 'operations'),
    mismatches: n('break_raised', 'operations'),
    feedDelays: n('feed_late', 'monitoring'),
    feedRecovered: n('feed_recovered', 'monitoring'),
    agentsPaused: t.filter((e) => e.type === 'status_change' && e.actor === 'monitoring').length,
    humanApproved: t.filter((e) => e.type === 'human_decision' && (e.amount ?? 0) > 0).length,
  };
}

export function countsLine(id: AgentId, c: AgentCounts): string {
  switch (id) {
    case 'research':
      return `${c.ideasFound} ${plural(c.ideasFound, 'idea')} · ${c.ideasDropped} dropped · ${c.sourcesRead} sources`;
    case 'portfolio':
      return `${c.sized} sized · ${c.cutDown} cut down · ${c.trims} ${plural(c.trims, 'trim')}`;
    case 'risk':
      // No "checked" total here: it is exactly the three that follow it added up.
      return `${c.riskCleared} cleared · ${c.riskSent} sent to you · ${c.riskBlocked} blocked`;
    case 'compliance':
      return `${c.complianceChecked} checked · ${c.complianceBlocked} blocked`;
    case 'execution':
      return `${c.buys} ${plural(c.buys, 'buy')} · ${c.sells} ${plural(c.sells, 'sell')} · ${fmtCr(c.traded)} traded`;
    case 'operations':
      return `${c.settled} settled · ${c.mismatches} ${plural(c.mismatches, 'mismatch', 'mismatches')}`;
    case 'monitoring':
      return `${c.feedDelays} feed ${plural(c.feedDelays, 'delay')} · ${c.feedRecovered} recovered · ${c.agentsPaused} pause ${plural(c.agentsPaused, 'action')}`;
  }
}

// ---------------------------------------------------------------------------
// Agents

export interface AgentFigure {
  id: AgentId;
  name: string;
  job: string;
  judgedOn: string;
  icon: Agent['icon'];
  status: AgentStatus;
  changedBy?: string;
  changedAtMs?: number;
  why?: string;
  statusLine: string;
  liveLine: string;
  countsLine: string;
  feeds: FeedFigure[];
  familiarityPct: number;
  budget: number | null;
  budgetMax: number | null;
  budgetLabel?: string;
  recent: RawEvent[];
  lastActionMs: number | null;
  coloured: boolean;
  /**
   * True when another agent stopped this one, not a person. Resuming it is then
   * an override of that agent's judgement rather than undoing your own pause,
   * and the rules treat the two differently.
   */
  haltedByAgent: boolean;
  /** The agent that halted it, when one did. */
  haltedBy: AgentId | null;
  /** What the rulebook says about lifting that halt. */
  haltRule: string | null;
  /** Orders a person can still stop, for the agent that is placing them. */
  stoppable: StoppableOrder[];
  /** Slowed by a person. Undoing your own throttle is housekeeping, not an override. */
  throttledByPerson: boolean;
  /** Ideas this agent dropped today, each with its own way back. Research only. */
  dropped: DroppedIdea[];
  /** Overrides in force against this agent's decisions. */
  overruled: GrantedException[];
}

export function actorName(id: ActorId): string {
  if (id === 'system') return 'System';
  if (id in PEOPLE) return PEOPLE[id as keyof typeof PEOPLE].name;
  return AGENTS[id as AgentId].name;
}

export function actorKind(id: ActorId): 'agent' | 'person' | 'system' {
  if (id === 'system') return 'system';
  if (id in PEOPLE) return 'person';
  return 'agent';
}

export function deriveAgents(
  rt: Runtime,
  events: RawEvent[],
  feeds: FeedFigure[],
  counts: AgentCounts,
  tokens: Tokens = {},
  orders: OrderFigure[] = [],
): Record<AgentId, AgentFigure> {
  const out = {} as Record<AgentId, AgentFigure>;
  const stoppable = deriveStoppable(orders);
  const ids: AgentId[] = [...AGENT_ORDER, 'monitoring'];
  for (const id of ids) {
    const a = AGENTS[id];
    const base = a.states[rt.state];
    const ov = rt.agentOverrides[id] ?? {};
    const st = ov.status ?? base.status;
    const changedBy = ov.status ? ov.changedBy : base.changedBy;
    const changedAtMs = ov.status ? ov.changedAt : base.changedAt ? ms(base.changedAt) : undefined;
    const why = fillTemplate((ov.status ? ov.why : base.why) ?? '', tokens) || undefined;
    const liveLine = fillTemplate(ov.liveLine ?? base.liveLine, tokens);
    const statusLine =
      st === 'Running'
        ? 'Running'
        : `${st}${changedBy ? ` by ${actorName(changedBy)}` : ''}${changedAtMs ? ` · ${fmtTime(changedAtMs)}` : ''}${why ? ` · '${why}'` : ''}`;
    const mine = events.filter((e) => e.actor === id);
    const lastAction = mine.length ? ms(mine[mine.length - 1].at) : null;
    const haltedBy = st === 'Paused' && changedBy && changedBy !== id && actorKind(changedBy) === 'agent' ? (changedBy as AgentId) : null;
    out[id] = {
      id,
      name: a.name,
      job: fillTemplate(a.job, tokens),
      judgedOn: a.judgedOn,
      icon: a.icon,
      status: st,
      changedBy: changedBy ? actorName(changedBy) : undefined,
      changedAtMs,
      why,
      statusLine,
      liveLine,
      countsLine: countsLine(id, counts),
      feeds: feeds.filter((f) => a.feeds.includes(f.id)),
      familiarityPct: base.familiarityPct,
      budget: a.budgetRupees === null ? null : rt.budgets[id] ?? a.budgetRupees,
      budgetMax: a.budgetRupees,
      budgetLabel: a.budgetLabel,
      recent: mine.slice(-6).reverse(),
      lastActionMs: lastAction,
      coloured: st !== 'Running' && st !== 'Idle' && st !== 'Waiting',
      // Halted by another agent. An agent that put itself into Waiting or Needs
      // you has not been halted by anyone, and there is nothing to overrule: it
      // is telling you it is stuck, not being held.
      haltedByAgent: haltedBy !== null,
      haltedBy,
      haltRule: haltedBy ? authorityFor('agent-halt').rule : null,
      stoppable: stoppable.filter((o) => ORDERS_TODAY.find((x) => x.id === o.id)?.placedBy === id),
      throttledByPerson: st === 'Throttled' && Boolean(changedBy && actorKind(changedBy) === 'person'),
      dropped: id === 'research' ? deriveDropped(rt, events) : [],
      overruled: rt.exceptions.filter((x) => x.agent === id && !x.withdrawnAtMs),
    };
  }
  return out;
}

export interface LastAction {
  atMs: number;
  agent: string;
  text: string;
  silentMs: number;
  warn: boolean;
}

export const SILENCE_WARN_MS = 10 * 60 * 1000;

export function deriveLastAgentAction(events: RawEvent[], nowMs: number): LastAction {
  const agentEvents = events.filter((e) => actorKind(e.actor) === 'agent' && ms(e.at) <= nowMs);
  const last = agentEvents[agentEvents.length - 1];
  const atMs = ms(last.at);
  const silentMs = nowMs - atMs;
  return { atMs, agent: actorName(last.actor), text: last.text, silentMs, warn: isMarketOpen(nowMs) && silentMs >= SILENCE_WARN_MS };
}

// ---------------------------------------------------------------------------
// Queue items and previews

export interface Flag {
  kind: 'disagree' | 'objection' | 'near' | 'late' | 'broken' | 'waiting';
  text: string;
}

export interface Preview {
  key: string;
  label: string;
  amount: number;
  positionPct: number;
  sectorName: Sector;
  sectorPct: number;
  sectorUsedPct: number;
  cashAfter: number;
  cashAfterPct: number;
  needsReason: boolean;
  summary: string;
}

export interface QueueItem {
  id: string;
  kind: 'proposal' | 'verdict' | 'break' | 'feed' | 'limit';
  company: string;
  title: string;
  ask: string;
  byLine: string;
  flags: Flag[];
  deadlineMs: number | null;
  deadlineKind: 'expires' | 'due' | 'none';
  msLeft: number | null;
  urgent: boolean;
  status: DecisionStatus;
  outcome?: DecisionOutcome;
  closedLabel?: string;
  decision?: Decision;
  previews: Preview[];
  raisedBy: string;
  /** The size the Portfolio Agent cut, and what taking it anyway would need. */
  capOverride?: CapOverride | null;
  /** How to reopen it, when it expired before anyone decided. */
  reopen?: ReopenOption | null;
}

function pctOfFund(f: FundFigures, rupees: number): number {
  return (rupees / f.fundValue) * 100;
}

/** The sector a ticker belongs to, read off the ticker rather than assumed. */
function sectorFor(f: FundFigures, ticker: string): { name: Sector; value: number } {
  const spec = holdingSpec(ticker);
  const found = spec ? f.sectors.find((s) => s.name === spec.sector) : undefined;
  return found ?? { name: (spec?.sector ?? 'IT') as Sector, value: 0 };
}

export function proposalPreview(f: FundFigures, p: Proposal, amount: number, key: string, label: string, needsReason: boolean, inFlight = 0): Preview {
  const holding = f.holdings.find((h) => h.ticker === p.ticker);
  const sector = sectorFor(f, p.ticker);
  const positionPct = pctOfFund(f, (holding?.value ?? 0) + amount);
  const sectorPct = pctOfFund(f, sector.value + amount);
  // Cash the fund still has to spend: what is left after the pieces of today's
  // orders that have not landed yet.
  const cashAfter = f.cash - inFlight - amount;
  const summary =
    amount > 0
      ? `${p.company} becomes ${fmtPct(positionPct)} of the fund · ${sector.name} ${fmtPct(sectorPct)} of its ${fmtPct(LIMITS.maxSectorPct, 0)} limit · cash ${fmtCr(cashAfter)}`
      : `Nothing is bought · ${sector.name} stays ${fmtPct(pctOfFund(f, sector.value))} · cash stays ${fmtCr(f.cash)}`;
  return {
    key,
    label,
    amount,
    positionPct,
    sectorName: sector.name,
    sectorPct,
    sectorUsedPct: (sectorPct / LIMITS.maxSectorPct) * 100,
    cashAfter,
    cashAfterPct: pctOfFund(f, cashAfter),
    needsReason,
    summary,
  };
}

export function verdictPreview(f: FundFigures, v: Verdict, amount: number, key: string, label: string, inFlight = 0): Preview {
  const holding = f.holdings.find((h) => h.ticker === v.ticker);
  const sector = sectorFor(f, v.ticker);
  const positionPct = pctOfFund(f, (holding?.value ?? 0) + amount);
  const sectorPct = pctOfFund(f, sector.value + amount);
  const cashAfter = f.cash - inFlight - amount;
  const summary =
    amount > 0
      ? `${v.company} becomes ${fmtPct(positionPct)} of the fund · ${sector.name} ${fmtPct(sectorPct)} of its ${fmtPct(LIMITS.maxSectorPct, 0)} limit · cash ${fmtCr(cashAfter)}`
      : `Nothing is bought · ${sector.name} stays ${fmtPct(pctOfFund(f, sector.value))} · cash stays ${fmtCr(f.cash)}`;
  return {
    key,
    label,
    amount,
    positionPct,
    sectorName: sector.name,
    sectorPct,
    sectorUsedPct: (sectorPct / LIMITS.maxSectorPct) * 100,
    cashAfter,
    cashAfterPct: pctOfFund(f, cashAfter),
    needsReason: true,
    summary,
  };
}

export function breakDifference(b: Break): { shares: number; rupees: number } {
  const shares = b.ourShares - b.brokerShares;
  return { shares, rupees: shares * b.price };
}

const URGENT_MS = 5 * 60 * 1000;

function closedLabel(d: Decision, o: DecisionOutcome): string {
  switch (o.status) {
    case 'taken':
      return `Taken · ${fmtCr(o.amount ?? 0)} · buying`;
    case 'taken_less':
      return `Taken less · ${fmtCr(o.amount ?? 0)} · buying`;
    case 'declined':
      return 'Declined · nothing bought';
    case 'expired':
      return 'Expired · nothing bought';
    case 'sided_bull':
      return `Sided with Bull · ${fmtCr(o.amount ?? 0)} · buying`;
    case 'halfway':
      return `Went halfway · ${fmtCr(o.amount ?? 0)} · buying`;
    case 'sided_bear':
      return 'Sided with Bear · nothing bought';
    case 'lapsed':
      return 'Let lapse · nothing bought';
    case 'accepted_broker':
      return "Accepted broker's record · our books corrected";
    case 'kept_ours':
      return 'Kept our record · chasing the broker';
    case 'assigned':
      return 'Assigned to Operations staff';
    case 'taken_over_cap':
      return `Overrode the cap · ${fmtCr(o.amount ?? 0)} · buying`;
    default:
      return d.id;
  }
}

export function deriveQueue(
  rt: Runtime,
  f: FundFigures,
  feeds: FeedFigure[],
  limits: LimitsSummary,
  decisions: Decision[],
  inFlight = 0,
  events: RawEvent[] = [],
): { open: QueueItem[]; closed: QueueItem[] } {
  const items: QueueItem[] = [];
  for (const d of decisions) {
    const outcome = rt.outcomes[d.id];
    let deadlineMs: number | null = null;
    let deadlineKind: QueueItem['deadlineKind'] = 'none';
    let ask = '';
    let byLine = '';
    let raisedBy = '';
    const flags: Flag[] = [];
    let previews: Preview[] = [];
    if (d.kind === 'proposal') {
      deadlineMs = rt.extendedUntil[d.id] ?? ms(d.expiresAt);
      deadlineKind = 'expires';
      const pct = pctOfFund(f, d.amount);
      ask = `Buy ${fmtCr(d.amount)} of ${d.company}, making it ${fmtPct(pct)} of the fund`;
      byLine = `Proposed by ${AGENTS[d.proposedBy].name} · sized by ${AGENTS[d.sizedBy].name} · cleared by ${AGENTS[d.clearedBy].name}${d.objections.length ? '' : ' · no objections'}`;
      raisedBy = AGENTS[d.proposedBy].name;
      flags.push({ kind: 'disagree', text: `Sources disagree on ${d.conflict.fact}: ${d.conflict.sides[0].value} vs ${d.conflict.sides[1].value}` });
      for (const o of d.objections) flags.push({ kind: 'objection', text: o });
      previews = [
        proposalPreview(f, d, d.amount, 'take', 'Take it', false, inFlight),
        proposalPreview(f, d, d.takeLessDefault, 'less', 'Take less', true, inFlight),
        proposalPreview(f, d, 0, 'decline', 'Decline', true, inFlight),
      ];
    } else if (d.kind === 'verdict') {
      deadlineMs = rt.extendedUntil[d.id] ?? ms(d.expiresAt);
      deadlineKind = 'expires';
      ask = `${d.company}: Bull says buy ${fmtCr(d.bull.amount)}, Bear says buy nothing`;
      byLine = `Raised by ${AGENTS[d.proposedBy].name} · Bull and Bear split on one assumption`;
      raisedBy = AGENTS[d.proposedBy].name;
      flags.push({ kind: 'disagree', text: `Bull and Bear split on: ${d.splitOn}` });
      const sector = sectorFor(f, d.ticker);
      {
        const after = pctOfFund(f, sector.value + d.bull.amount);
        flags.push({ kind: 'near', text: `Bull's size takes ${sector.name} to ${fmtPct(after)} of its ${fmtPct(LIMITS.maxSectorPct, 0)} limit` });
      }
      flags.push({ kind: 'waiting', text: 'Portfolio Agent is waiting on this' });
      previews = [
        verdictPreview(f, d, d.bull.amount, 'bull', 'Side with Bull', inFlight),
        verdictPreview(f, d, d.halfwayAmount, 'halfway', 'Go halfway', inFlight),
        verdictPreview(f, d, 0, 'bear', 'Side with Bear', inFlight),
        verdictPreview(f, d, 0, 'lapse', 'Let it lapse', inFlight),
      ];
    } else {
      deadlineMs = ms(d.dueAt);
      deadlineKind = 'due';
      const diff = breakDifference(d);
      const trade = TRADES_0910.find((t) => t.id === d.tradeId);
      const sold = trade?.side !== 'buy';
      ask = `Records mismatch: ${d.company} ${sold ? 'sale' : 'purchase'} on ${fmtDayMonth(dateMs(TRADE_DAY_0910))} · broker shows ${fmtInt(diff.shares)} fewer shares ${sold ? 'sold' : 'bought'}`;
      byLine = `Raised by ${AGENTS[d.raisedBy].name} · ${d.dueWhy.toLowerCase()}`;
      raisedBy = AGENTS[d.raisedBy].name;
      flags.push({ kind: 'objection', text: `Difference about ${fmtLakhLike(diff.rupees)} at that day's price` });
    }
    const msLeft = deadlineMs === null ? null : deadlineMs - rt.nowMs;
    const status: DecisionStatus = outcome?.status ?? (deadlineKind === 'expires' && msLeft !== null && msLeft <= 0 ? 'expired' : 'open');
    const finalOutcome: DecisionOutcome | undefined = outcome ?? (status === 'expired' ? { status: 'expired', at: deadlineMs! , by: 'system' } : undefined);
    items.push({
      id: d.id,
      kind: d.kind,
      company: d.company,
      title: d.kind === 'proposal' ? `Proposal · ${d.company}` : d.kind === 'verdict' ? `Bull vs bear · ${d.company}` : `Records mismatch · ${d.company}`,
      ask,
      byLine,
      flags,
      deadlineMs,
      deadlineKind,
      msLeft: status === 'open' ? msLeft : null,
      urgent: status === 'open' && deadlineKind === 'expires' && msLeft !== null && msLeft < URGENT_MS,
      status,
      outcome: finalOutcome,
      closedLabel: finalOutcome ? closedLabel(d, finalOutcome) : undefined,
      decision: d,
      previews,
      raisedBy,
      capOverride: d.kind === 'proposal' && status === 'open' ? capOverrideFor(rt, f, d, events, inFlight) : null,
      // Only an expiry can be reopened. A decision someone made is theirs to
      // live with; it is not an agent's to overrule.
      reopen: d.kind !== 'break' && status === 'expired' ? reopenFor(rt, d.id, events) : null,
    });
  }

  // Attention items with no deadline: late feeds and broken limits.
  for (const feed of feeds.filter((x) => x.late)) {
    items.push({
      id: `FEED-${feed.id.toUpperCase()}`,
      kind: 'feed',
      company: feed.name,
      title: `Data late · ${feed.name}`,
      ask: `${feed.name} feed is ${Math.floor(feed.ageSec / 60)} min late · last update ${fmtTime(feed.lastUpdatedMs)}`,
      byLine: `Raised by Monitoring Agent · ${feed.dependents.map((a) => AGENTS[a].name).join(', ')} depend on it`,
      flags: [{ kind: 'late', text: 'Numbers built on this feed are shown grey with their age' }],
      deadlineMs: null,
      deadlineKind: 'none',
      msLeft: null,
      urgent: false,
      status: 'open',
      previews: [],
      raisedBy: 'Monitoring Agent',
    });
  }
  for (const row of limits.broken) {
    // A broken limit held on exception is settled until the close. It leaves the
    // open list for Closed today, still a broken limit, saying who holds it open.
    const ex = coveringException(rt, row);
    items.push({
      id: limitItemId(row.key),
      kind: 'limit',
      company: row.name,
      title: `Over limit · ${row.name}`,
      ask: `${row.name} is ${fmtPct(row.pct)} of the fund, above its ${fmtPct(row.limitPct, 0)} limit`,
      byLine: `Raised by Risk Agent · ${row.why}`,
      flags: [{ kind: 'broken', text: "Agents can't add to a broken limit · nothing is forced to sell" }],
      deadlineMs: null,
      deadlineKind: 'none',
      msLeft: null,
      urgent: false,
      status: ex ? 'on_exception' : 'open',
      outcome: ex ? { status: 'on_exception', at: ex.grantedAtMs, by: ex.grantedBy, reason: ex.reason } : undefined,
      closedLabel: ex ? `On exception until ${fmtTime(ex.lapsesAtMs)} · ${ex.id}` : undefined,
      previews: [],
      raisedBy: 'Risk Agent',
    });
  }

  const open = items
    .filter((i) => i.status === 'open')
    .sort((a, b) => (a.deadlineMs ?? Infinity) - (b.deadlineMs ?? Infinity));
  const closed = items
    .filter((i) => i.status !== 'open')
    .sort((a, b) => (b.outcome?.at ?? 0) - (a.outcome?.at ?? 0));
  return { open, closed };
}

function fmtLakhLike(rupees: number): string {
  return Math.abs(rupees) >= CR ? fmtCr(rupees) : `₹${(rupees / 100_000).toFixed(1)} lakh`;
}

// ---------------------------------------------------------------------------
// Blocked trades today, shown in grey under "Closed today"

export interface BlockedItem {
  id: string;
  /** The authoring key. Display ids are renumbered per state; this is not. */
  key: string;
  company: string;
  label: string;
  text: string;
  atMs: number;
  by: string;
  /** Set once a person overruled it, so the list can say so without losing it. */
  overriddenAtMs: number | null;
}

export function deriveBlocked(events: RawEvent[], exceptions: GrantedException[] = []): BlockedItem[] {
  return todayEvents(events)
    .filter((e) => e.type === 'risk_blocked' || e.type === 'compliance_blocked')
    .map((e) => {
      const key = e.key ?? e.id;
      // An overridden block is still a block. It keeps its place in the list and
      // its place in the count; what changes is that it now says who overruled
      // it. Nothing a person does removes an agent's decision from the record.
      const live = exceptions.find((x) => x.eventKey === key && !x.withdrawnAtMs);
      return {
        id: e.id,
        key,
        company: e.company ?? '',
        label: live ? `Overridden · blocked by ${actorName(e.actor)}` : `Blocked by ${actorName(e.actor)}`,
        text: e.text.replace(/^Blocked: /, ''),
        atMs: ms(e.at),
        by: actorName(e.actor),
        overriddenAtMs: live ? live.grantedAtMs : null,
      };
    })
    .reverse();
}

// ---------------------------------------------------------------------------
// Overrides
//
// What a person may do about an agent's decision, worked out from the policy in
// the Book and the state of the fund — never from the component that shows it.
// Three answers are possible and all three are useful: you may, you may only
// with a second person, and you may not and here is who to send it to.

export type OverrideVerdict = 'permitted' | 'needs-cosign' | 'refused';

/** The Book's answer for one kind of override, at one position size. */
export interface Authority {
  kind: OverrideKind;
  verdict: OverrideVerdict;
  /** The rule as the Rules page states it. */
  rule: string;
  /** Why the console will not do it, when it will not. */
  refusalLine: string | null;
  /** Who it can be sent to instead. */
  askInstead: PersonId | null;
  askInsteadName: string | null;
  /** Who is told whatever happens. */
  notifyLine: string | null;
  /** Who must co-sign, and why, when someone must. */
  cosignWho: string | null;
  cosignLine: string | null;
  /** When it lapses. null when nothing loosened and so nothing can lapse. */
  lapsesAtMs: number | null;
  expiryLine: string;
  atExpiry: ExpiryAction | null;
}

const EXPIRY_COPY: Record<ExpiryAction, string> = {
  're-alert': 'it is raised again and comes back to you',
  'force-trim': 'the Portfolio Agent trims the position back inside the limit',
  'auto-revert': 'it reverts on its own',
};

function cosignNeeded(rule: CosignRule, positionPct: number | null): { who: string; line: string } | null {
  if (rule.when === 'never') return null;
  if (rule.when === 'always') return { who: rule.who, line: `Every exception to a limit needs ${rule.who} to sign it` };
  // Read against the position the override leaves behind, not the one trade. A
  // threshold measured on the trade would sit above every override this fund
  // could make, and a control that can never fire is not a control.
  if (positionPct === null || positionPct <= rule.pct) return null;
  return {
    who: rule.who,
    line: `It leaves ${fmtPct(positionPct)} of the fund in one company, above the ${fmtPct(rule.pct, 0)} co-sign threshold`,
  };
}

export function authorityFor(kind: OverrideKind, positionPct: number | null = null): Authority {
  const policy = OVERRIDE_POLICY[kind];
  const user = AUTHORITY[CURRENT_USER];
  const may = policy.mayOverrule.includes(user);
  const cosign = may ? cosignNeeded(policy.cosign, positionPct) : null;
  const lapsesAtMs = policy.atExpiry ? ms(OVERRIDE_LAPSES_AT) : null;
  return {
    kind,
    verdict: !may ? 'refused' : cosign ? 'needs-cosign' : 'permitted',
    rule: `${policy.rule} ${policy.detail}`,
    refusalLine: may
      ? null
      : `Only ${policy.mayOverrule.join(' or ')} may lift this. Your authority is ${user}, and the console will not do it for you.`,
    askInstead: may ? null : policy.askInstead,
    askInsteadName: !may && policy.askInstead ? PEOPLE[policy.askInstead].name : null,
    notifyLine: policy.notify ? `${PEOPLE[policy.notify].name} is told either way` : null,
    cosignWho: cosign?.who ?? null,
    cosignLine: cosign?.line ?? null,
    lapsesAtMs,
    expiryLine:
      lapsesAtMs !== null && policy.atExpiry
        ? `Holds until ${fmtTime(lapsesAtMs)}, then ${EXPIRY_COPY[policy.atExpiry]}`
        : 'Nothing lapses, because nothing was loosened',
    atExpiry: policy.atExpiry,
  };
}

/**
 * Every limit an override would break, in each limit's own words. An override
 * of one limit must not quietly break another: whatever else it breaks is
 * named on the screen and makes a second signature necessary.
 */
export function limitBreaches(f: FundFigures, p: Preview, company: string): { kind: 'company' | 'sector' | 'cash'; line: string }[] {
  const out: { kind: 'company' | 'sector' | 'cash'; line: string }[] = [];
  if (p.positionPct > LIMITS.maxCompanyPct) {
    out.push({ kind: 'company', line: `${company} would be ${fmtPct(p.positionPct)} of the fund, above the ${fmtPct(LIMITS.maxCompanyPct, 0)} ceiling` });
  }
  if (p.sectorUsedPct > 100) {
    out.push({ kind: 'sector', line: `${p.sectorName} would be ${fmtPct(p.sectorPct)} of the fund, above its ${fmtPct(LIMITS.maxSectorPct, 0)} limit` });
  }
  if (p.cashAfterPct < LIMITS.minCashPct) {
    out.push({ kind: 'cash', line: `cash would fall to ${fmtCr(p.cashAfter)}, below its ${fmtPct(LIMITS.minCashPct, 0)} minimum of ${fmtCr(f.minCashRupees)}` });
  }
  return out;
}

/** Turn a permitted override into one that needs the Risk Manager, when it breaks a limit besides its own. */
function withSecondBreach(a: Authority, extra: string[]): Authority {
  if (extra.length === 0 || a.verdict === 'refused') return a;
  const who = 'Risk Manager';
  const line = `It also breaks a limit: ${extra.join('; ')}`;
  return {
    ...a,
    verdict: 'needs-cosign',
    cosignWho: a.cosignWho ?? who,
    cosignLine: a.cosignLine ? `${a.cosignLine}. ${line}` : line,
  };
}

/** The live exception for a subject, if one has been granted and not withdrawn. */
function liveException(rt: Runtime, key: string): GrantedException | null {
  return rt.exceptions.find((x) => x.eventKey === key && !x.withdrawnAtMs) ?? null;
}

/** The open escalation for a subject, if one has been sent and not withdrawn. */
function openEscalation(rt: Runtime, key: string): Escalation | null {
  return rt.escalations.find((x) => x.subjectKey === key && !x.withdrawnAtMs) ?? null;
}

// --- Blocks ---------------------------------------------------------------

export interface OverrideOption extends Authority {
  /** The blocked event's display id, for the record link. */
  id: string;
  /** Its authoring key, which is what the action and the selection refer to. */
  key: string;
  agent: AgentId;
  agentName: string;
  company: string;
  ticker: string;
  amount: number;
  /** The agent's own sentence, from the record, so its case is put first. */
  agentReason: string;
  atMs: number;
  /** What the agent did, named in its own terms: a measurement or a check. */
  measuredTitle: string;
  /** Why no size and no argument changes it. Different for a limit and a ban. */
  natureLine: string;
  /** What the override would do, in the same three figures a proposal shows. */
  preview: Preview | null;
  /** The limit it breaks, in the limit's own words. */
  breachLine: string;
  /** Limits it would break besides the one it overrides. */
  extraBreaches: string[];
  exception: GrantedException | null;
  escalation: Escalation | null;
}

export function deriveOverrides(rt: Runtime, f: FundFigures, events: RawEvent[], inFlight = 0): OverrideOption[] {
  return todayEvents(events)
    .filter((e) => e.type === 'risk_blocked' || e.type === 'compliance_blocked')
    .map((e) => {
      const key = e.key ?? e.id;
      const agent = e.actor as AgentId;
      const kind = BLOCK_KIND[agent] ?? 'risk-block';
      const amount = e.amount ?? 0;
      const ticker = e.ticker ?? '';
      const spec = ticker ? holdingSpec(ticker) : undefined;
      const preview = spec && amount > 0 ? overridePreview(f, spec, amount, inFlight) : null;
      // The block being overridden is the company ceiling. Anything else the
      // trade breaks — sector, minimum cash — is a second exception.
      const extra = preview ? limitBreaches(f, preview, e.company ?? '').filter((b) => b.kind !== 'company').map((b) => b.line) : [];
      return {
        ...withSecondBreach(authorityFor(kind, preview ? preview.positionPct : null), extra),
        extraBreaches: extra,
        id: e.id,
        key,
        agent,
        agentName: actorName(agent),
        company: e.company ?? '',
        ticker,
        amount,
        agentReason: e.text.replace(/^Blocked: /, ''),
        atMs: ms(e.at),
        // A limit is arithmetic and an override suspends the arithmetic for one
        // trade. A mandate exclusion is not arithmetic at all, and saying it is
        // would invite the reader to think a smaller size would get past it.
        measuredTitle: e.type === 'risk_blocked' ? `What ${actorName(agent)} measured` : `What ${actorName(agent)} checked`,
        natureLine:
          e.type === 'risk_blocked'
            ? 'It is not a judgement about the company. The limit is arithmetic, and the agent cannot waive it.'
            : 'This is the mandate, not a limit. No size makes it allowed, and trimming the order changes nothing.',
        preview,
        breachLine: preview && spec ? overrideBreachLine(preview, spec) : '',
        exception: liveException(rt, key),
        escalation: openEscalation(rt, key),
      };
    })
    .reverse();
}

/** The same three figures a proposal shows, for an amount an agent refused. */
function overridePreview(f: FundFigures, spec: Holding, amount: number, inFlight: number): Preview {
  const held = f.holdings.find((h) => h.ticker === spec.ticker);
  const positionValue = (held?.value ?? 0) + amount;
  const sector = sectorFor(f, spec.ticker);
  const sectorValue = sector.value + amount;
  const cashAfter = f.cash - amount - inFlight;
  return {
    key: 'override',
    label: 'Override',
    amount,
    positionPct: pctOfFund(f, positionValue),
    sectorName: sector.name,
    sectorPct: pctOfFund(f, sectorValue),
    sectorUsedPct: (pctOfFund(f, sectorValue) / LIMITS.maxSectorPct) * 100,
    cashAfter,
    cashAfterPct: (cashAfter / f.fundValue) * 100,
    needsReason: true,
    summary: `Buys ${fmtCr(amount)} the agent refused to buy`,
  };
}

/** The breach stated in the limit's own terms, not softened. */
function overrideBreachLine(p: Preview, spec: Holding): string {
  const over = p.positionPct - LIMITS.maxCompanyPct;
  if (over > 0) {
    return `${spec.company} would be ${fmtPct(p.positionPct)} of the fund, ${fmtPct(over)} above the ${fmtPct(LIMITS.maxCompanyPct, 0)} ceiling`;
  }
  if (p.sectorUsedPct > 100) {
    return `${p.sectorName} would be ${fmtPct(p.sectorPct)} of the fund, above its ${fmtPct(LIMITS.maxSectorPct, 0)} limit`;
  }
  return `No limit is breached by the size. The block was on the mandate, not the arithmetic.`;
}

// --- Broken limits --------------------------------------------------------
//
// A broken limit has two answers and they are not symmetrical. Trimming back
// inside it is restraint: a reason, no second person, no expiry. Holding it on
// exception is permission: a reason, the Risk Manager's signature, and a lapse
// at the close.

export type TrimTo = 'limit' | 'target';

export interface TrimPlan {
  to: TrimTo;
  /** "Back to the limit", "Back to its target weight" */
  label: string;
  ticker: string;
  company: string;
  /** Rupees to sell, rounded up so the limit is left with room, not at the line. */
  amount: number;
  /** Where the limit lands after. */
  afterPct: number;
  line: string;
}

export interface LimitOverride extends Authority {
  /** The queue item id: 'LIMIT-SECTOR-BANKING'. */
  itemId: string;
  /** The limit key: 'sector:Banking'. */
  key: string;
  name: string;
  pct: number;
  limitPct: number;
  overBy: number;
  /** The first is the least that ends the breach. */
  trims: TrimPlan[];
  exception: GrantedException | null;
  escalation: Escalation | null;
}

/** The queue id a broken limit is shown under. */
export function limitItemId(key: string): string {
  return `LIMIT-${key.replace(':', '-').toUpperCase()}`;
}

/** An exception that holds a limit open: granted on the limit itself, or on a trade that broke it. */
function coveringException(rt: Runtime, row: LimitRow): GrantedException | null {
  const ticker = row.kind === 'company' ? row.key.split(':')[1] : null;
  return (
    rt.exceptions.find(
      (x) =>
        !x.withdrawnAtMs &&
        (x.limitKey === row.key || (ticker !== null && x.ticker === ticker && (x.kind === 'risk-block' || x.kind === 'size-cap'))),
    ) ?? null
  );
}

/** Rupees, rounded up to the next tenth of a crore. A trim lands inside the limit, not on it. */
function roundUpTenthCr(rupees: number): number {
  return Math.ceil(rupees / (0.1 * CR)) * 0.1 * CR;
}

/**
 * The trims a person can choose between. Back to the limit is the least that
 * ends the breach; back to the target weight is where the Portfolio Agent would
 * trim to on its own. A company has a ceiling but no target, so it has only the
 * first.
 */
function trimPlans(f: FundFigures, row: LimitRow): TrimPlan[] {
  const toLimit = trimPlan(f, row, -row.headroom, 'limit', 'Back to the limit');
  if (!toLimit) return [];
  const sector = row.kind === 'sector' ? (row.key.split(':')[1] as Sector) : null;
  const target = sector ? SECTOR_TARGETS[sector] : undefined;
  if (target === undefined || target >= row.limitPct) return [toLimit];
  const toTarget = trimPlan(f, row, ((row.pct - target) / 100) * f.fundValue, 'target', 'Back to its target weight');
  return toTarget && toTarget.amount > toLimit.amount ? [toLimit, toTarget] : [toLimit];
}

function trimPlan(f: FundFigures, row: LimitRow, over: number, to: TrimTo, label: string): TrimPlan | null {
  if (over <= 0) return null;
  // A company limit trims that company. A sector limit trims its largest name,
  // which is the least disruptive single sale that brings the sector back.
  const target =
    row.kind === 'company'
      ? f.holdings.find((h) => `company:${h.ticker}` === row.key)
      : [...f.holdings].filter((h) => `sector:${h.sector}` === row.key && h.shares > 0).sort((a, b) => b.value - a.value)[0];
  if (!target) return null;
  const amount = Math.min(roundUpTenthCr(over), target.value);
  const afterPct = row.pct - pctOfFund(f, amount);
  return {
    to,
    label,
    ticker: target.ticker,
    company: target.company,
    amount,
    afterPct,
    line: `Sell ${fmtCr(amount)} of ${target.company} · ${row.name} goes from ${fmtPct(row.pct)} to ${fmtPct(afterPct)} of the fund`,
  };
}

export function deriveLimitOverrides(rt: Runtime, f: FundFigures, limits: LimitsSummary): LimitOverride[] {
  return limits.broken.map((row) => {
    const key = row.key;
    return {
      ...authorityFor('limit-exception'),
      itemId: limitItemId(key),
      key,
      name: row.name,
      pct: row.pct,
      limitPct: row.limitPct,
      overBy: -row.headroom,
      trims: trimPlans(f, row),
      exception: coveringException(rt, row),
      escalation: openEscalation(rt, key),
    };
  });
}

// --- A size the Portfolio Agent cut ---------------------------------------

export interface CapOverride extends Authority {
  decisionId: string;
  /** What the agent sized it at before the cap, and what the cap left. */
  sizedAmount: number;
  cappedAmount: number;
  /** The agent's own sentence for the cut, from the record. */
  agentReason: string;
  preview: Preview;
  /** Every limit the larger size would break. The cap itself is not a limit. */
  breaches: string[];
  exception: GrantedException | null;
  escalation: Escalation | null;
}

function capOverrideFor(rt: Runtime, f: FundFigures, d: Proposal, events: RawEvent[], inFlight: number): CapOverride | null {
  if (d.sizedAmount <= d.amount) return null;
  const cut = events.find((e) => e.type === 'cut_down' && e.decisionId === d.id);
  if (!cut) return null;
  const preview = proposalPreview(f, d, d.sizedAmount, 'cap', 'Take the size before the cap', true, inFlight);
  const breaches = limitBreaches(f, preview, d.company).map((b) => b.line);
  return {
    ...withSecondBreach(authorityFor('size-cap', preview.positionPct), breaches),
    breaches,
    decisionId: d.id,
    sizedAmount: d.sizedAmount,
    cappedAmount: d.amount,
    agentReason: cut.text,
    preview,
    exception: liveException(rt, d.id),
    escalation: openEscalation(rt, d.id),
  };
}

// --- A decision that expired ----------------------------------------------

export interface ReopenOption extends Authority {
  decisionId: string;
  extensionMin: number;
  /** "Reopens it until 10:32" */
  line: string;
  /** How many times it has been reopened already, so a second time says so. */
  timesReopened: number;
}

function reopenFor(rt: Runtime, id: string, events: RawEvent[]): ReopenOption {
  const until = rt.nowMs + REOPEN_EXTENSION_MIN * 60 * 1000;
  return {
    ...authorityFor('expired-decision'),
    decisionId: id,
    extensionMin: REOPEN_EXTENSION_MIN,
    line: `Reopens it for ${REOPEN_EXTENSION_MIN} minutes, until ${fmtTime(until)}. Nothing was bought while it was closed.`,
    timesReopened: events.filter((e) => e.type === 'decision_reopened' && e.decisionId === id).length,
  };
}

// --- Ideas Research dropped -----------------------------------------------

export interface DroppedIdea extends Authority {
  /** Display id and authoring key of the drop. */
  id: string;
  key: string;
  company: string;
  /** The agent's own sentence. */
  reason: string;
  atMs: number;
  reinstated: { atMs: number; reason: string } | null;
}

export function deriveDropped(rt: Runtime, events: RawEvent[]): DroppedIdea[] {
  return todayEvents(events)
    .filter((e) => e.type === 'idea_dropped' && e.actor === 'research')
    .map((e) => {
      const key = e.key ?? e.id;
      return {
        ...authorityFor('dropped-idea'),
        id: e.id,
        key,
        company: e.company ?? '',
        reason: e.text.replace(/^Dropped [^:]+: /, ''),
        atMs: ms(e.at),
        reinstated: rt.reinstated[key] ?? null,
      };
    })
    .reverse();
}

// --- Escalations ----------------------------------------------------------

export interface EscalationFigure extends Escalation {
  toName: string;
  toRole: string;
  /** "sent 10:07 · 4 min ago · chased once" */
  waitingLine: string;
  /** Where the request was made, so the row can reopen it. */
  selection: ActOn['selection'];
}

export function deriveEscalations(rt: Runtime, targets: Record<string, ActOn['selection']>): EscalationFigure[] {
  return rt.escalations
    .filter((x) => !x.withdrawnAtMs)
    .map((x) => {
      const chased = x.chasedAtMs.length;
      return {
        ...x,
        toName: PEOPLE[x.to].name,
        toRole: PEOPLE[x.to].role,
        waitingLine: [
          `sent ${fmtTime(x.sentAtMs)}`,
          `${fmtAge(x.sentAtMs, rt.nowMs)} without an answer`,
          chased === 0 ? '' : chased === 1 ? 'chased once' : `chased ${fmtInt(chased)} times`,
        ]
          .filter(Boolean)
          .join(' · '),
        selection: targets[x.subjectKey] ?? null,
      };
    });
}

// --- What a person settled by acting -------------------------------------
//
// A trim ends a breach, and the breach leaves the open list with it. It goes to
// Closed today saying what was done, so a problem that disappears from the
// screen is never one that disappeared without a trace.

export interface SettledByYou {
  id: string;
  label: string;
  title: string;
  atMs: number;
  selection: ActOn['selection'];
}

export function deriveSettledByYou(events: RawEvent[]): SettledByYou[] {
  return todayEvents(events)
    .filter((e) => e.type === 'trim_instructed' && actorKind(e.actor) === 'person')
    .map((e) => ({
      id: e.id,
      label: 'Trimmed on your instruction',
      title: e.text.replace(/^Instructed a trim · /, '').replace(/ · "[^"]*"$/, ''),
      atMs: ms(e.at),
      selection: { kind: 'agent' as const, id: 'portfolio' as AgentId },
    }));
}

// --- Where to act on a record ---------------------------------------------
//
// Every record a person can still do something about, mapped to the place that
// does it. The Audit trail and the Portfolio page use this to put the control
// one click from wherever the record is found.

export interface ActOn {
  selection: { kind: 'blocked'; id: string } | { kind: 'agent'; id: AgentId } | { kind: 'decision'; id: string } | null;
  label: string;
}

export function deriveActOn(
  rt: Runtime,
  events: RawEvent[],
  orders: OrderFigure[],
  open: QueueItem[],
  closed: QueueItem[],
  overrides: OverrideOption[],
  agents: Record<AgentId, AgentFigure>,
  limitOverrides: LimitOverride[] = [],
): { byEvent: Record<string, ActOn>; byKey: Record<string, ActOn['selection']>; byTicker: Record<string, ActOn[]> } {
  const byEvent: Record<string, ActOn> = {};
  const byKey: Record<string, ActOn['selection']> = {};
  const byTicker: Record<string, ActOn[]> = {};
  const all = [...open, ...closed];
  const addTicker = (ticker: string | undefined, a: ActOn) => {
    if (!ticker) return;
    (byTicker[ticker] ??= []).some((x) => x.label === a.label) || byTicker[ticker].push(a);
  };

  for (const o of overrides) {
    const a: ActOn = {
      selection: { kind: 'blocked', id: o.key },
      label: o.exception
        ? 'See the override'
        : o.escalation
          ? `Waiting on ${PEOPLE[o.escalation.to].name}`
          : o.verdict === 'refused'
            ? `Send to ${o.askInsteadName ?? 'the person who may'}`
            : `Overrule ${o.agentName}`,
    };
    byEvent[o.id] = a;
    byKey[o.key] = a.selection;
    addTicker(o.ticker, a);
  }

  for (const e of todayEvents(events)) {
    const key = e.key ?? e.id;
    if (byEvent[e.id]) continue;
    if (e.type === 'idea_dropped' && e.actor === 'research') {
      const done = Boolean(rt.reinstated[key]);
      byEvent[e.id] = { selection: { kind: 'agent', id: 'research' }, label: done ? 'Back in research' : 'Send back to research' };
      byKey[key] = byEvent[e.id].selection;
    } else if ((e.type === 'order_placed' || e.type === 'fill') && e.orderId) {
      const o = orders.find((x) => x.id === e.orderId);
      if (o && (o.stoppable || o.stopped)) {
        byEvent[e.id] = { selection: { kind: 'agent', id: o.placedBy }, label: o.stopped ? 'Order stopped' : 'Stop the rest' };
        addTicker(o.ticker, byEvent[e.id]);
      }
    } else if ((e.type === 'cut_down' || e.type === 'expired' || e.type === 'sent_to_person') && (e.decisionId || e.related?.length)) {
      const id = e.decisionId ?? e.related!.find((r) => all.some((i) => i.id === r));
      const item = all.find((i) => i.id === id);
      if (!item) continue;
      if (e.type === 'cut_down' && item.capOverride) {
        byEvent[e.id] = { selection: { kind: 'decision', id: item.id }, label: 'Take the size before the cap' };
        addTicker(item.decision && 'ticker' in item.decision ? item.decision.ticker : undefined, byEvent[e.id]);
      } else if (e.type === 'expired' && item.reopen) {
        byEvent[e.id] = { selection: { kind: 'decision', id: item.id }, label: 'Reopen' };
      }
      byKey[item.id] = { kind: 'decision', id: item.id };
    } else if (e.type === 'limit_broken') {
      const item = all.find((i) => i.kind === 'limit');
      if (item) byEvent[e.id] = { selection: { kind: 'decision', id: item.id }, label: 'Trim it or hold it' };
    } else if (e.type === 'status_change' && e.actor === 'monitoring' && e.feedId) {
      const halted = Object.values(agents).filter((a) => a.haltedByAgent);
      if (halted.length) byEvent[e.id] = { selection: { kind: 'agent', id: halted[0].id }, label: 'Resume over the halt' };
    } else if (e.type === 'status_change' && actorKind(e.actor) === 'person' && /^Throttled/.test(e.text)) {
      const throttled = Object.values(agents).find((a) => a.throttledByPerson);
      if (throttled) byEvent[e.id] = { selection: { kind: 'agent', id: throttled.id }, label: 'Restore full speed' };
    }
  }

  // Broken limits, by their own key, so an escalation about one finds its way back.
  for (const l of limitOverrides) {
    byKey[l.key] = { kind: 'decision', id: l.itemId };
    if (l.trims[0]) addTicker(l.trims[0].ticker, { selection: { kind: 'decision', id: l.itemId }, label: l.exception ? 'On exception' : 'Trim it or hold it' });
  }
  for (const item of open.filter((i) => i.kind === 'limit')) byKey[item.id] = { kind: 'decision', id: item.id };
  for (const item of closed.filter((i) => i.kind === 'limit')) byKey[item.id] = { kind: 'decision', id: item.id };
  for (const item of all) {
    if (item.kind === 'proposal' && item.capOverride && item.status === 'open' && item.decision && 'ticker' in item.decision) {
      addTicker(item.decision.ticker, { selection: { kind: 'decision', id: item.id }, label: 'Take the size before the cap' });
    }
    if (item.reopen && item.decision && 'ticker' in item.decision) {
      addTicker(item.decision.ticker, { selection: { kind: 'decision', id: item.id }, label: 'Reopen the expired decision' });
    }
  }
  return { byEvent, byKey, byTicker };
}

// ---------------------------------------------------------------------------
// Orders a person can still stop

export interface StoppableOrder {
  id: string;
  company: string;
  side: 'buy' | 'sell';
  /** "14 of 18 pieces placed · ₹2.1 cr bought" */
  placedLine: string;
  /** "4 pieces left, ₹61 lakh" — what a stop would actually prevent. */
  remainingLine: string;
  /** What stopping releases, which for a buy is cash. */
  freesLine: string | null;
  stopAfterPiece: number;
  stopped: boolean;
  stoppedPieces: number;
}

export function deriveStoppable(orders: OrderFigure[]): StoppableOrder[] {
  return orders
    .filter((o) => o.stoppable || o.stopped)
    .map((o) => ({
      id: o.id,
      company: o.company,
      side: o.side,
      placedLine: `${fmtInt(o.placedPieces)} of ${fmtInt(o.pieces)} ${plural(o.pieces, 'piece')} placed · ${fmtCr(o.filledRupees)} ${o.side === 'buy' ? 'bought' : 'sold'}`,
      remainingLine: o.stopped
        ? `${fmtInt(o.unplacedPieces)} ${plural(o.unplacedPieces, 'piece')} stopped · ${fmtCr(o.remainingShares * priceOf(o.ticker, 'normal'))} never placed`
        : `${fmtInt(o.unplacedPieces)} ${plural(o.unplacedPieces, 'piece')} left · ${fmtCr(o.inFlightRupees)}`,
      freesLine: o.stopped || o.side !== 'buy' ? null : `Stopping it releases ${fmtCr(o.inFlightRupees)} of committed cash`,
      stopAfterPiece: o.placedPieces,
      stopped: o.stopped,
      stoppedPieces: o.stopped ? o.unplacedPieces : 0,
    }));
}

export const ORDER_STOP_NOTE = ORDER_STOP_RULE;

// ---------------------------------------------------------------------------
// Needs you

export interface NeedsYou {
  count: number;
  decisions: number;
  mismatches: number;
  brokenLimits: number;
  lateFeeds: number;
  firstExpiresMs: number | null;
  label: string;
}

export function deriveNeedsYou(open: QueueItem[], limits: LimitsSummary, feeds: FeedFigure[]): NeedsYou {
  const decisions = open.filter((i) => i.kind === 'proposal' || i.kind === 'verdict').length;
  const mismatches = open.filter((i) => i.kind === 'break').length;
  // A broken limit held on exception has left the open list: it no longer needs
  // you until the close, when the exception lapses and it comes back.
  const brokenLimits = open.filter((i) => i.kind === 'limit').length;
  void limits;
  const lateFeeds = feeds.filter((f) => f.late).length;
  const count = decisions + mismatches + brokenLimits + lateFeeds;
  const expiring = open.filter((i) => i.deadlineKind === 'expires' && i.deadlineMs !== null);
  const firstExpiresMs = expiring.length ? expiring[0].deadlineMs : null;
  let label: string;
  if (count === 0) label = 'Nothing needs you';
  else {
    const head = `${count} ${count === 1 ? 'thing needs' : 'things need'} you`;
    if (firstExpiresMs !== null) label = `${head} · first expires ${fmtTime(firstExpiresMs)}`;
    else {
      const due = open.find((i) => i.deadlineKind === 'due');
      label = due ? `${head} · first due ${fmtTime(due.deadlineMs!)}` : head;
    }
  }
  return { count, decisions, mismatches, brokenLimits, lateFeeds, firstExpiresMs, label };
}

// ---------------------------------------------------------------------------
// Pipeline sums

export interface Pipeline {
  found: number;
  dropped: number;
  sized: number;
  trims: number;
  checked: number;
  cleared: number;
  sent: number;
  riskBlocked: number;
  complianceBlocked: number;
  autoCleared: number;
  humanApproved: number;
  /** Orders placed on a person's override, the third way an order gets placed. */
  onOverride: number;
  ordersPlaced: number;
}

export function derivePipeline(c: AgentCounts): Pipeline {
  const autoCleared = c.riskChecked - c.riskSent - c.riskBlocked - c.complianceBlocked;
  return {
    found: c.ideasFound,
    dropped: c.ideasDropped,
    sized: c.sized,
    trims: c.trims,
    checked: c.riskChecked,
    cleared: c.riskCleared,
    sent: c.riskSent,
    riskBlocked: c.riskBlocked,
    complianceBlocked: c.complianceBlocked,
    autoCleared,
    humanApproved: c.humanApproved,
    onOverride: c.ordersOnOverride,
    ordersPlaced: c.ordersPlaced,
  };
}

// ---------------------------------------------------------------------------
// Monitoring flags since open

export interface MonitorFlag {
  id: string;
  atMs: number;
  text: string;
  kind: 'late' | 'recovered' | 'paused' | 'check' | 'break' | 'limit';
}

export function deriveMonitorFlags(events: RawEvent[]): MonitorFlag[] {
  return todayEvents(events)
    .filter((e) => ['feed_late', 'feed_recovered', 'limit_broken', 'break_raised'].includes(e.type) || (e.type === 'status_change' && e.actor === 'monitoring'))
    .map((e): MonitorFlag => ({
      id: e.id,
      atMs: ms(e.at),
      text: e.text,
      kind:
        e.type === 'feed_late' ? 'late' : e.type === 'feed_recovered' ? 'recovered' : e.type === 'limit_broken' ? 'limit' : e.type === 'break_raised' ? 'break' : 'paused',
    }))
    .reverse();
}

// ---------------------------------------------------------------------------
// The whole view model

export interface ViewModel {
  state: StateName;
  nowMs: number;
  marketOpen: boolean;
  user: { name: string; role: string };
  fund: FundFigures;
  limits: LimitsSummary;
  feeds: FeedFigure[];
  health: DataHealth;
  counts: AgentCounts;
  agents: Record<AgentId, AgentFigure>;
  agentRow: AgentFigure[];
  lastAction: LastAction;
  open: QueueItem[];
  closed: QueueItem[];
  blocked: BlockedItem[];
  /** What a person may do about each blocked item, and what it would cost. */
  overrides: OverrideOption[];
  /** What can be done about each broken limit: trim it, or hold it on exception. */
  limitOverrides: LimitOverride[];
  /** Overrides in force now, with the time each one lapses. */
  exceptions: GrantedException[];
  /** Requests sent to someone with the authority this console lacks, until answered. */
  escalations: EscalationFigure[];
  /** Problems a person ended by acting on them, for Closed today. */
  settledByYou: SettledByYou[];
  /** For a record in the log, where to act on it. Keyed by display id. */
  actOn: Record<string, ActOn>;
  /** For a holding, everything that can still be done about it. */
  actOnTicker: Record<string, ActOn[]>;
  needsYou: NeedsYou;
  pipeline: Pipeline;
  events: RawEvent[];
  orders: OrderFigure[];
  /** Cash already promised to order pieces that have not landed yet. */
  inFlightCash: number;
  monitorFlags: MonitorFlag[];
  sources: typeof SOURCES;
}

export function derive(rt: Runtime): ViewModel {
  // The ledger first: today's fills decide the holdings and the cash, so nothing
  // above them can be computed until they are known.
  const orders = deriveOrders(rt);
  const feeds = deriveFeeds(rt);
  const fund = deriveFund(rt, feeds, orders);
  // Counts come off the log's shape, not its wording, so they can be had before
  // any text is filled in — which is what lets the text quote them.
  const rawEvents = eventsFor(rt, orders);
  const counts = deriveCounts(rawEvents);
  const limitsRaw = deriveLimits(fund, rt.state);
  const ctx: TokenContext = { state: rt.state, nowMs: rt.nowMs, fund, limits: limitsRaw, feeds, orders, counts, boughtSinceByTicker: rt.shareDelta };
  const tokens = buildTokens(ctx);
  const limits = deriveLimits(fund, rt.state, tokens);
  const events = rawEvents.map((e) => ({ ...e, text: fillTemplate(e.text, { ...tokens, ...eventTokens(e, ctx) }) }));
  const decisions = resolveDecisions(rt.state, ctx, tokens);
  const health = deriveDataHealth(feeds, rt.nowMs);
  const agents = deriveAgents(rt, events, feeds, counts, tokens, orders);
  const lastAction = deriveLastAgentAction(events, rt.nowMs);
  const { open, closed } = deriveQueue(rt, fund, feeds, limits, decisions, inFlightCash(orders), events);
  const needsYou = deriveNeedsYou(open, limits, feeds);
  const overrides = deriveOverrides(rt, fund, events, inFlightCash(orders));
  const limitOverrides = deriveLimitOverrides(rt, fund, limits);
  const actOn = deriveActOn(rt, events, orders, open, closed, overrides, agents, limitOverrides);
  return {
    state: rt.state,
    nowMs: rt.nowMs,
    marketOpen: isMarketOpen(rt.nowMs),
    user: PEOPLE[CURRENT_USER],
    fund,
    limits,
    feeds,
    health,
    counts,
    agents,
    agentRow: AGENT_ORDER.map((id) => agents[id]),
    lastAction,
    open,
    closed,
    blocked: deriveBlocked(events, rt.exceptions),
    overrides,
    limitOverrides,
    exceptions: rt.exceptions.filter((x) => !x.withdrawnAtMs),
    escalations: deriveEscalations(rt, actOn.byKey),
    settledByYou: deriveSettledByYou(events),
    actOn: actOn.byEvent,
    actOnTicker: actOn.byTicker,
    needsYou,
    pipeline: derivePipeline(counts),
    events,
    orders,
    inFlightCash: inFlightCash(orders),
    monitorFlags: deriveMonitorFlags(events),
    sources: SOURCES,
  };
}

/**
 * The display ID an authoring key ended up with in this state. Anything that
 * links to a record by its authoring key has to go through here, because the
 * log is renumbered per state.
 */
export function recordId(vm: ViewModel, key: string): string {
  return vm.events.find((e) => e.key === key)?.id ?? key;
}

export function sourceById(id: string) {
  return SOURCES.find((s) => s.id === id);
}

export function feedName(id: FeedId): string {
  return FEEDS.find((f) => f.id === id)?.name ?? id;
}
