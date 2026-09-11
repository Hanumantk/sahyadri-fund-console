// The Book: raw facts only. Nothing in here is computed for display; derive.ts
// does that. Money is in rupees. Times are ISO strings with the IST offset.
// Research houses, news outlets and data vendors are invented. Listed companies
// are real.
//
// Only these things are hand-entered:
//   1. NOW, the demo clock's start (clock.ts).
//   2. The opening book at the 10 Sep close: shares per ticker, cash, units,
//      the official NAV per state and the peak.
//   3. Each ticker's price at NOW, per state, and the benchmark's move today.
//   4. Structured trades. Yesterday's are {ticker, side, shares, price};
//      today's orders are {ticker, side, whole shares, pieces} with each fill
//      priced a few basis points off that ticker's price at NOW.
//   5. Rules: LIMITS, feed cadences, agent budgets, sector targets.
//   6. Narrative events with structured fields. Their text is a template and
//      every number inside it is filled in from derived figures.
//
// Everything else — current holdings, cash, fund value, NAV, weights, limits,
// counts, and every figure inside an event's text — is derived. See
// docs/NUMBERS.md.

import { today, yesterday } from './clock';

export type StateName = 'normal' | 'calm' | 'bad';
export const STATES: StateName[] = ['normal', 'calm', 'bad'];

export const CR = 10_000_000;
export const LAKH = 100_000;

// ---------------------------------------------------------------------------
// The fund

export const FUND = {
  name: 'Sahyadri India Equity Fund',
  mandate: 'Long-only Indian equities · no short positions · no borrowing',
  benchmark: 'Nifty 50',
  units: 19_714_000,
  peak: { navPerUnit: 132.4, date: '2026-08-14' },
  official: {
    normal: { navPerUnit: 125.04, date: '2026-09-10' },
    calm: { navPerUnit: 125.04, date: '2026-09-10' },
    bad: { navPerUnit: 124.1, date: '2026-09-10' },
  } as Record<StateName, { navPerUnit: number; date: string }>,
  benchmarkChangeTodayPct: { normal: 1.2, calm: 1.2, bad: -1.1 } as Record<StateName, number>,
  /**
   * Cash at the 10 Sep close, after that day's 18 trades. Cash now is this plus
   * today's sale proceeds minus today's purchases (trade-date accounting), so it
   * is never typed. Back-solved to put cash now at ₹14.9 cr.
   */
  openingCash: 122_425_000,
  /**
   * The last date the closing cash balance was at or below the working level
   * (LIMITS.workingCashPct). Cash has sat above it since, which is what the Cash
   * tile means by "uninvested". See docs/NUMBERS.md.
   */
  cashIdleSince: '2026-09-07',
  administrator: 'Kaveri Fund Services',
};

export const LIMITS = {
  maxCompanyPct: 10,
  maxSectorPct: 25,
  maxOrderRupees: 10 * CR,
  minCashPct: 3,
  nearLimitPct: 90,
  drawdownPausePct: 8,
  /** A first position is capped at this share of the fund until the next results. */
  firstPositionPct: 2,
  /** Cash above this share of the fund counts as idle. Not displayed. */
  workingCashPct: 4,
  /** Share of a day's traded value the fund will take when it liquidates. */
  participationPct: 20,
};

/**
 * What each sector is aimed at, as a share of the fund. Used by the Portfolio
 * Agent to decide a trim. Not displayed anywhere.
 */
export const SECTOR_TARGETS: Record<Sector, number> = {
  Banking: 23,
  IT: 15,
  Energy: 9.5,
  Autos: 8.9,
  FMCG: 7,
  Pharma: 5.5,
  Materials: 5.5,
  Industrials: 4.5,
  Telecom: 7,
  'Financial services': 3.5,
  Consumer: 2.5,
  Transport: 3.5,
};

// ---------------------------------------------------------------------------
// People

export type PersonId = 'priya' | 'arjun' | 'kavya';
export const PEOPLE: Record<PersonId, { name: string; role: string }> = {
  priya: { name: 'Priya Nair', role: 'Portfolio Manager' },
  arjun: { name: 'Arjun Mehta', role: 'Risk Officer' },
  kavya: { name: 'Kavya Rao', role: 'Compliance' },
};
export const CURRENT_USER: PersonId = 'priya';

// ---------------------------------------------------------------------------
// Agents

export type AgentId =
  | 'research'
  | 'portfolio'
  | 'risk'
  | 'compliance'
  | 'execution'
  | 'operations'
  | 'monitoring';

export type AgentStatus = 'Running' | 'Idle' | 'Waiting' | 'Throttled' | 'Paused' | 'Needs you';

export type ActorId = AgentId | PersonId | 'system';

export interface AgentState {
  status: AgentStatus;
  /** Required whenever status is not Running. */
  changedBy?: ActorId;
  changedAt?: string;
  why?: string;
  liveLine: string;
  /** How familiar today's market is: share of the agent's past days that look like today. */
  familiarityPct: number;
}

export interface Agent {
  id: AgentId;
  name: string;
  job: string;
  judgedOn: string;
  icon: 'search' | 'scale' | 'shield' | 'book' | 'bolt' | 'ledger' | 'eye';
  feeds: FeedId[];
  /** Money the agent may commit on its own. Null for agents that move no money. */
  budgetRupees: number | null;
  budgetLabel?: string;
  states: Record<StateName, AgentState>;
}

export const AGENT_ORDER: AgentId[] = [
  'research',
  'portfolio',
  'risk',
  'compliance',
  'execution',
  'operations',
];

export const AGENTS: Record<AgentId, Agent> = {
  research: {
    id: 'research',
    name: 'Research Agent',
    job: 'Finds ideas, reads filings, news and research. Two sub-agents, Bull and Bear, write the case for and against each idea.',
    judgedOn: 'Did its picks beat the Nifty 50?',
    icon: 'search',
    feeds: ['prices', 'filings', 'news', 'notes'],
    budgetRupees: 5 * CR,
    budgetLabel: 'Largest idea it may propose',
    states: {
      normal: {
        status: 'Running',
        liveLine: "Reading this morning's autos and cement filings · 12 of 30",
        familiarityPct: 84,
      },
      calm: {
        status: 'Running',
        liveLine: "Reading TCS's Q1 FY27 results filing · 8 of 22",
        familiarityPct: 91,
      },
      bad: {
        status: 'Paused',
        changedBy: 'monitoring',
        changedAt: today('10:03'),
        why: 'price feed {pricesLateAtPause} late',
        liveLine: 'Paused until the NSE prices feed recovers',
        familiarityPct: 12,
      },
    },
  },
  portfolio: {
    id: 'portfolio',
    name: 'Portfolio Agent',
    job: 'Decides how much money each idea gets, and trims positions.',
    judgedOn: 'Did its sizing beat equal-sized positions?',
    icon: 'scale',
    feeds: ['prices', 'orders'],
    budgetRupees: 10 * CR,
    budgetLabel: 'Largest size it may give one idea',
    states: {
      normal: {
        status: 'Waiting',
        changedBy: 'portfolio',
        changedAt: today('09:47:30'),
        why: 'Bull and Bear unresolved on HDFC Bank',
        liveLine: 'Waiting to size the HDFC Bank add',
        familiarityPct: 84,
      },
      calm: {
        status: 'Running',
        liveLine: "Rechecking sector weights after this morning's {trimCount} trims",
        familiarityPct: 91,
      },
      bad: {
        status: 'Waiting',
        changedBy: 'portfolio',
        changedAt: today('09:47:30'),
        why: 'Bull and Bear unresolved on HDFC Bank',
        liveLine: 'Waiting to size the HDFC Bank add',
        familiarityPct: 12,
      },
    },
  },
  risk: {
    id: 'risk',
    name: 'Risk Agent',
    job: "Checks each proposal against limits and decides whether it's within the agents' autonomy or goes to a person.",
    judgedOn: 'Not judged on profit',
    icon: 'shield',
    feeds: ['prices', 'orders'],
    budgetRupees: null,
    states: {
      normal: {
        status: 'Running',
        liveLine: 'Rechecking all {holdingsCount} holdings against limits',
        familiarityPct: 84,
      },
      calm: {
        status: 'Running',
        liveLine: 'Rechecking all {holdingsCount} holdings against limits',
        familiarityPct: 91,
      },
      bad: {
        status: 'Paused',
        changedBy: 'monitoring',
        changedAt: today('10:03'),
        why: 'price feed {pricesLateAtPause} late',
        liveLine: 'Paused until the NSE prices feed recovers',
        familiarityPct: 12,
      },
    },
  },
  compliance: {
    id: 'compliance',
    name: 'Compliance Agent',
    job: 'Checks the mandate and the banned list.',
    judgedOn: 'Not judged on profit',
    icon: 'book',
    feeds: ['orders', 'filings'],
    budgetRupees: null,
    states: {
      normal: {
        status: 'Running',
        liveLine: "Checking this morning's {ordersPlaced} orders against the mandate",
        familiarityPct: 84,
      },
      calm: {
        status: 'Running',
        liveLine: "Checking this morning's {trimCount} trims against the mandate",
        familiarityPct: 91,
      },
      bad: {
        status: 'Running',
        liveLine: "Checking this morning's {ordersPlaced} orders against the mandate",
        familiarityPct: 12,
      },
    },
  },
  execution: {
    id: 'execution',
    name: 'Execution Agent',
    job: 'Places orders in small pieces.',
    judgedOn: "Trading cost versus the day's average price",
    icon: 'bolt',
    feeds: ['prices', 'orders'],
    budgetRupees: 10 * CR,
    budgetLabel: 'Largest single order',
    states: {
      normal: {
        status: 'Running',
        liveLine: 'Buying Bharti Airtel · {airtelSize} in {airtelPieces} pieces · {airtelDone} done',
        familiarityPct: 84,
      },
      calm: {
        status: 'Running',
        liveLine: 'Buying Bharti Airtel · {airtelSize} in {airtelPieces} pieces · {airtelDone} done',
        familiarityPct: 91,
      },
      bad: {
        status: 'Throttled',
        changedBy: 'priya',
        changedAt: today('09:42'),
        why: 'thin volumes at open',
        liveLine: 'Buying Bharti Airtel at half speed · {airtelDone} of {airtelPieces} done',
        familiarityPct: 12,
      },
    },
  },
  operations: {
    id: 'operations',
    name: 'Operations Agent',
    job: 'Matches our records against the broker, custodian and bank.',
    judgedOn: 'Not judged on profit',
    icon: 'ledger',
    feeds: ['orders', 'custodian', 'bank'],
    budgetRupees: null,
    states: {
      normal: {
        status: 'Needs you',
        changedBy: 'operations',
        changedAt: today('09:43:10'),
        why: 'Axis Bank sale mismatch',
        liveLine: 'Holding the Axis Bank settlement',
        familiarityPct: 84,
      },
      calm: {
        status: 'Running',
        liveLine: "Matching {trades0910Date}'s {trades0910Count} trades · {settledCount} matched",
        familiarityPct: 91,
      },
      bad: {
        status: 'Needs you',
        changedBy: 'operations',
        changedAt: today('09:43:10'),
        why: 'Axis Bank sale mismatch',
        liveLine: 'Holding the Axis Bank settlement',
        familiarityPct: 12,
      },
    },
  },
  monitoring: {
    id: 'monitoring',
    name: 'Monitoring Agent',
    job: 'Watches {feedCount} data feeds and the {otherAgentCount} other agents, and powers this panel.',
    judgedOn: 'Not judged on profit',
    icon: 'eye',
    feeds: ['prices', 'orders', 'filings', 'news', 'notes', 'custodian', 'bank'],
    budgetRupees: null,
    states: {
      normal: { status: 'Running', liveLine: 'Watching {feedCount} feeds and {otherAgentCount} agents', familiarityPct: 84 },
      calm: { status: 'Running', liveLine: 'Watching {feedCount} feeds and {otherAgentCount} agents', familiarityPct: 91 },
      bad: {
        status: 'Running',
        liveLine: 'NSE prices feed late · paused Research Agent and Risk Agent',
        familiarityPct: 12,
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Data feeds

export type FeedId = 'prices' | 'orders' | 'filings' | 'news' | 'notes' | 'custodian' | 'bank';

export interface Feed {
  id: FeedId;
  name: string;
  vendor: string;
  /**
   * A streaming feed is this many seconds behind the clock. Only the two feeds
   * that really do tick continuously carry it; the rest land on a schedule, so
   * their timestamps stay where they are instead of sliding with the clock and
   * never ageing.
   */
  lagSec?: number;
  /** Late when older than this, and the step of a scheduled feed. */
  expectedEverySec: number;
  /** When set for a state, the feed stopped updating at this time. */
  stuckAt: Partial<Record<StateName, string>>;
  /**
   * A scheduled feed's most recent landing at or before NOW. Later landings are
   * this plus whole multiples of the cadence.
   */
  scheduledFrom?: string;
  /**
   * When the last landing was due, if the feed missed its slot. The late and
   * recovered events are measured from here.
   */
  dueAt?: string;
}

export const FEEDS: Feed[] = [
  { id: 'prices', name: 'NSE prices', vendor: 'Meridian Market Data', lagSec: 2, expectedEverySec: 120, stuckAt: { bad: today('09:53') } },
  { id: 'orders', name: 'Orders and fills', vendor: 'Sagar Broking', lagSec: 8, expectedEverySec: 600, stuckAt: {} },
  { id: 'filings', name: 'Company filings', vendor: 'FilingsDesk (NSE and BSE)', expectedEverySec: 3600, stuckAt: {}, scheduledFrom: today('09:58') },
  { id: 'news', name: 'News', vendor: 'Dalal Street Wire', expectedEverySec: 1800, stuckAt: {}, scheduledFrom: today('10:03') },
  // Due at 09:31, two hours after the 07:31 landing. It arrived at 09:39, which
  // is what the 09:35 late flag and the 09:39 recovery are measured against.
  { id: 'notes', name: 'Research notes', vendor: 'NoteStream (12 research houses)', expectedEverySec: 7200, stuckAt: {}, scheduledFrom: today('09:39'), dueAt: today('09:31') },
  { id: 'custodian', name: 'Custodian positions', vendor: 'Trident Custody', expectedEverySec: 86400, stuckAt: {}, scheduledFrom: today('09:20') },
  { id: 'bank', name: 'Bank balances', vendor: 'Settlement account', expectedEverySec: 86400, stuckAt: {}, scheduledFrom: today('09:18') },
];

/** When the Monitoring Agent paused Research and Risk in the `bad` state. */
export const MONITORING_PAUSE_AT = today('10:03');

// ---------------------------------------------------------------------------
// Holdings

export type Sector =
  | 'Banking'
  | 'IT'
  | 'Energy'
  | 'Autos'
  | 'FMCG'
  | 'Pharma'
  | 'Materials'
  | 'Industrials'
  | 'Telecom'
  | 'Financial services'
  | 'Consumer'
  | 'Transport';

export type Cluster =
  | 'Crude oil price'
  | 'Domestic interest rates'
  | 'US tech spending'
  | 'Rupee vs dollar'
  | 'Rural demand'
  | 'Government capex'
  | 'US generic drug pricing'
  | 'Urban discretionary spend';

export interface Holding {
  ticker: string;
  company: string;
  sector: Sector;
  /** Price at NOW, before any per-state multiplier. */
  price: number;
  /**
   * Shares at the 10 Sep close, after that day's 18 trades. Shares now are this
   * plus today's fills, so the number on screen is never this number.
   */
  shares: number;
  boughtBy: AgentId;
  /** When the fund first bought it. A later proposal is an add, not a first position. */
  boughtOn: string;
  /** Average value traded in a day. Days to sell is derived from it. */
  advRupees: number;
  clusters: Cluster[];
}

export const HOLDINGS: Holding[] = [
  { ticker: 'HDFCBANK', company: 'HDFC Bank', sector: 'Banking', price: 1940, shares: 93_814, boughtBy: 'execution', boughtOn: '2025-11-04', advRupees: 1200 * CR, clusters: ['Domestic interest rates'] },
  { ticker: 'ICICIBANK', company: 'ICICI Bank', sector: 'Banking', price: 1480, shares: 105_405, boughtBy: 'execution', boughtOn: '2025-11-04', advRupees: 950 * CR, clusters: ['Domestic interest rates'] },
  { ticker: 'AXISBANK', company: 'Axis Bank', sector: 'Banking', price: 1180, shares: 83_051, boughtBy: 'execution', boughtOn: '2026-01-20', advRupees: 600 * CR, clusters: ['Domestic interest rates'] },
  { ticker: 'KOTAKBANK', company: 'Kotak Mahindra Bank', sector: 'Banking', price: 2150, shares: 34_419, boughtBy: 'execution', boughtOn: '2026-02-11', advRupees: 380 * CR, clusters: ['Domestic interest rates'] },
  { ticker: 'SBIN', company: 'State Bank of India', sector: 'Banking', price: 890, shares: 72_247, boughtBy: 'execution', boughtOn: '2026-03-03', advRupees: 820 * CR, clusters: ['Domestic interest rates', 'Government capex'] },
  { ticker: 'TCS', company: 'TCS', sector: 'IT', price: 3650, shares: 38_630, boughtBy: 'execution', boughtOn: '2025-11-04', advRupees: 640 * CR, clusters: ['US tech spending', 'Rupee vs dollar'] },
  { ticker: 'HCLTECH', company: 'HCLTech', sector: 'IT', price: 1720, shares: 55_814, boughtBy: 'execution', boughtOn: '2025-12-16', advRupees: 300 * CR, clusters: ['US tech spending', 'Rupee vs dollar'] },
  { ticker: 'WIPRO', company: 'Wipro', sector: 'IT', price: 285, shares: 252_632, boughtBy: 'execution', boughtOn: '2026-06-09', advRupees: 210 * CR, clusters: ['US tech spending', 'Rupee vs dollar'] },
  { ticker: 'TECHM', company: 'Tech Mahindra', sector: 'IT', price: 1610, shares: 39_752, boughtBy: 'execution', boughtOn: '2026-01-14', advRupees: 190 * CR, clusters: ['US tech spending', 'Rupee vs dollar'] },
  { ticker: 'RELIANCE', company: 'Reliance Industries', sector: 'Energy', price: 1520, shares: 153_750, boughtBy: 'execution', boughtOn: '2025-11-04', advRupees: 1400 * CR, clusters: ['Crude oil price', 'Rupee vs dollar'] },
  { ticker: 'MARUTI', company: 'Maruti Suzuki', sector: 'Autos', price: 13_900, shares: 6_763, boughtBy: 'execution', boughtOn: '2026-05-06', advRupees: 330 * CR, clusters: ['Domestic interest rates', 'Rural demand'] },
  { ticker: 'TATAMOTORS', company: 'Tata Motors', sector: 'Autos', price: 780, shares: 88_000, boughtBy: 'execution', boughtOn: '2026-02-25', advRupees: 680 * CR, clusters: ['Urban discretionary spend'] },
  { ticker: 'M&M', company: 'Mahindra & Mahindra', sector: 'Autos', price: 3250, shares: 25_231, boughtBy: 'execution', boughtOn: '2025-12-10', advRupees: 420 * CR, clusters: ['Domestic interest rates', 'Rural demand'] },
  { ticker: 'HINDUNILVR', company: 'Hindustan Unilever', sector: 'FMCG', price: 2610, shares: 37_548, boughtBy: 'execution', boughtOn: '2025-11-18', advRupees: 310 * CR, clusters: ['Rural demand'] },
  { ticker: 'ITC', company: 'ITC', sector: 'FMCG', price: 460, shares: 205_000, boughtBy: 'execution', boughtOn: '2025-11-18', advRupees: 470 * CR, clusters: ['Rural demand'] },
  { ticker: 'SUNPHARMA', company: 'Sun Pharma', sector: 'Pharma', price: 1790, shares: 49_721, boughtBy: 'execution', boughtOn: '2026-03-17', advRupees: 360 * CR, clusters: ['US generic drug pricing', 'Rupee vs dollar'] },
  { ticker: 'CIPLA', company: 'Cipla', sector: 'Pharma', price: 1560, shares: 29_487, boughtBy: 'execution', boughtOn: '2026-06-24', advRupees: 190 * CR, clusters: ['US generic drug pricing', 'Rupee vs dollar'] },
  { ticker: 'ULTRACEMCO', company: 'UltraTech Cement', sector: 'Materials', price: 12_400, shares: 6_290, boughtBy: 'execution', boughtOn: '2026-04-08', advRupees: 180 * CR, clusters: ['Government capex', 'Crude oil price', 'Domestic interest rates'] },
  { ticker: 'ASIANPAINT', company: 'Asian Paints', sector: 'Materials', price: 2480, shares: 20_968, boughtBy: 'execution', boughtOn: '2026-07-02', advRupees: 240 * CR, clusters: ['Crude oil price', 'Urban discretionary spend'] },
  { ticker: 'LT', company: 'Larsen & Toubro', sector: 'Industrials', price: 3880, shares: 29_381, boughtBy: 'execution', boughtOn: '2025-12-02', advRupees: 520 * CR, clusters: ['Government capex', 'Domestic interest rates'] },
  { ticker: 'BHARTIARTL', company: 'Bharti Airtel', sector: 'Telecom', price: 2020, shares: 59_901, boughtBy: 'execution', boughtOn: '2026-01-07', advRupees: 560 * CR, clusters: ['Urban discretionary spend'] },
  { ticker: 'BAJFINANCE', company: 'Bajaj Finance', sector: 'Financial services', price: 985, shares: 84_264, boughtBy: 'execution', boughtOn: '2026-05-20', advRupees: 480 * CR, clusters: ['Domestic interest rates', 'Urban discretionary spend'] },
  { ticker: 'TITAN', company: 'Titan', sector: 'Consumer', price: 3620, shares: 21_950, boughtBy: 'execution', boughtOn: '2026-03-31', advRupees: 290 * CR, clusters: ['Urban discretionary spend'] },
  { ticker: 'INDIGO', company: 'InterGlobe Aviation', sector: 'Transport', price: 5400, shares: 15_370, boughtBy: 'execution', boughtOn: '2026-07-15', advRupees: 230 * CR, clusters: ['Crude oil price', 'Urban discretionary spend'] },
];

/** Companies that are not held but can be bought by an open decision. */
export const CANDIDATES: Holding[] = [
  { ticker: 'INFY', company: 'Infosys', sector: 'IT', price: 1650, shares: 0, boughtBy: 'execution', boughtOn: '', advRupees: 780 * CR, clusters: ['US tech spending', 'Rupee vs dollar'] },
];

/** Calm state: Reliance and the banks are smaller, the difference sits in six other holdings. */
export const HOLDING_SHARE_OVERRIDES: Partial<Record<StateName, Record<string, number>>> = {
  calm: {
    RELIANCE: 122_664,
    HDFCBANK: 81_443,
    ICICIBANK: 91_216,
    AXISBANK: 70_339,
    KOTAKBANK: 29_767,
    SBIN: 64_270,
    LT: 37_113,
    HINDUNILVR: 47_126,
    SUNPHARMA: 60_894,
    ULTRACEMCO: 7_903,
    BHARTIARTL: 67_327,
    MARUTI: 7_795,
  },
};

/** Bad state: banks up 10% and everything else down, without a trade. */
export const HOLDING_PRICE_MULTIPLIERS: Partial<Record<StateName, { bySector: Partial<Record<Sector, number>>; byTicker: Record<string, number>; other: number }>> = {
  bad: { bySector: { Banking: 1.1 }, byTicker: { RELIANCE: 0.967 }, other: 0.931 },
};

// ---------------------------------------------------------------------------
// Sources

export type Authorship = 'Human-written' | 'AI-written';

export interface Source {
  id: string;
  title: string;
  publisher: string;
  date: string;
  authorship: Authorship;
  kind: 'filing' | 'call' | 'note' | 'news' | 'data' | 'contract note' | 'record';
}

export const SOURCES: Source[] = [
  { id: 'SRC-INF-01', title: 'Q1 FY27 results call transcript', publisher: 'Infosys management', date: '2026-07-16', authorship: 'Human-written', kind: 'call' },
  { id: 'SRC-INF-02', title: 'IT services: the slow lane (sector note)', publisher: 'Tarang Research', date: '2026-09-02', authorship: 'Human-written', kind: 'note' },
  { id: 'SRC-INF-03', title: 'Q1 FY27 results filing', publisher: 'Infosys, filed with NSE', date: '2026-07-16', authorship: 'Human-written', kind: 'filing' },
  { id: 'SRC-INF-04', title: 'Infosys signs five-year deal with a European insurer', publisher: 'Dalal Street Wire', date: '2026-09-05', authorship: 'AI-written', kind: 'news' },
  { id: 'SRC-HDB-01', title: 'Q1 FY27 results filing', publisher: 'HDFC Bank, filed with NSE', date: '2026-07-19', authorship: 'Human-written', kind: 'filing' },
  { id: 'SRC-HDB-02', title: 'Banking system deposit data, August 2026', publisher: 'Meridian Market Data', date: '2026-09-08', authorship: 'Human-written', kind: 'data' },
  { id: 'SRC-HDB-03', title: 'Deposit wars: who pays for growth', publisher: 'Tarang Research', date: '2026-08-28', authorship: 'Human-written', kind: 'note' },
  { id: 'SRC-HDB-04', title: 'HDFC Bank raises deposit rates again', publisher: 'Dalal Street Wire', date: '2026-09-09', authorship: 'AI-written', kind: 'news' },
  { id: 'SRC-HDB-05', title: 'Q1 FY27 results call transcript', publisher: 'HDFC Bank management', date: '2026-07-19', authorship: 'Human-written', kind: 'call' },
  { id: 'SRC-AXS-01', title: 'Contract note for 10 Sep 2026', publisher: 'Sagar Broking', date: '2026-09-10', authorship: 'Human-written', kind: 'contract note' },
  { id: 'SRC-AXS-02', title: 'Our trade record TRD-0910-12', publisher: 'Execution Agent', date: '2026-09-10', authorship: 'AI-written', kind: 'record' },
];

// ---------------------------------------------------------------------------
// Yesterday's trades (settle today, T+1)

export interface Trade {
  id: string;
  company: string;
  ticker: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
}

/** The day TRADES_0910 were struck. They settle today, T+1. */
export const TRADE_DAY_0910 = '2026-09-10';

export const TRADES_0910: Trade[] = [
  { id: 'TRD-0910-01', company: 'Reliance Industries', ticker: 'RELIANCE', side: 'buy', shares: 6580, price: 1519.8 },
  { id: 'TRD-0910-02', company: 'Reliance Industries', ticker: 'RELIANCE', side: 'buy', shares: 6580, price: 1521.0 },
  { id: 'TRD-0910-03', company: 'Reliance Industries', ticker: 'RELIANCE', side: 'buy', shares: 6580, price: 1520.4 },
  { id: 'TRD-0910-04', company: 'Reliance Industries', ticker: 'RELIANCE', side: 'buy', shares: 6580, price: 1522.6 },
  { id: 'TRD-0910-05', company: 'Tata Motors', ticker: 'TATAMOTORS', side: 'sell', shares: 10_000, price: 784.2 },
  { id: 'TRD-0910-06', company: 'ICICI Bank', ticker: 'ICICIBANK', side: 'buy', shares: 6700, price: 1476.5 },
  { id: 'TRD-0910-07', company: 'ICICI Bank', ticker: 'ICICIBANK', side: 'buy', shares: 6700, price: 1478.0 },
  { id: 'TRD-0910-08', company: 'Wipro', ticker: 'WIPRO', side: 'sell', shares: 40_000, price: 286.1 },
  { id: 'TRD-0910-09', company: 'Sun Pharma', ticker: 'SUNPHARMA', side: 'buy', shares: 5600, price: 1788.0 },
  { id: 'TRD-0910-10', company: 'Sun Pharma', ticker: 'SUNPHARMA', side: 'buy', shares: 5600, price: 1791.5 },
  { id: 'TRD-0910-11', company: 'Cipla', ticker: 'CIPLA', side: 'sell', shares: 6400, price: 1558.0 },
  { id: 'TRD-0910-12', company: 'Axis Bank', ticker: 'AXISBANK', side: 'sell', shares: 12_000, price: 1173.3 },
  { id: 'TRD-0910-13', company: 'Larsen & Toubro', ticker: 'LT', side: 'buy', shares: 2600, price: 3876.0 },
  { id: 'TRD-0910-14', company: 'Larsen & Toubro', ticker: 'LT', side: 'buy', shares: 2600, price: 3879.5 },
  // Not Titan: Titan is trimmed the next morning, and the fund does not buy a
  // position one afternoon and sell a third of it before lunch the next day.
  { id: 'TRD-0910-15', company: 'Asian Paints', ticker: 'ASIANPAINT', side: 'buy', shares: 4080, price: 2475.0 },
  { id: 'TRD-0910-16', company: 'ITC', ticker: 'ITC', side: 'sell', shares: 20_000, price: 461.2 },
  { id: 'TRD-0910-17', company: 'Kotak Mahindra Bank', ticker: 'KOTAKBANK', side: 'buy', shares: 4600, price: 2148.0 },
  { id: 'TRD-0910-18', company: 'HDFC Bank', ticker: 'HDFCBANK', side: 'buy', shares: 5100, price: 1938.0 },
];

// ---------------------------------------------------------------------------
// Today's orders
//
// An order is whole shares cut into equal pieces. Each piece fills a few basis
// points off that ticker's price at NOW in the state being shown, so a fill is
// never priced against a market the scenario does not have. The rupee size of
// an order, the rupee price of a fill and the amount it moved are all derived.

export interface OrderToday {
  id: string;
  ticker: string;
  company: string;
  side: 'buy' | 'sell';
  /** Whole shares. Divides exactly by `pieces`. */
  shares: number;
  pieces: number;
  placedBy: AgentId;
  placedAt: string;
  /** Basis points off the ticker's price at NOW, one per piece. */
  driftBps: number[];
  /** When each piece fills. `bad` throttles Execution to half speed. */
  fillAt: { default: string[] } & Partial<Record<StateName, string[]>>;
  /** Template for a fill's line in the log. Its numbers come from the fill. */
  fillText: string;
}

export const ORDERS_TODAY: OrderToday[] = [
  {
    id: 'ORD-0911-01',
    ticker: 'TATAMOTORS',
    company: 'Tata Motors',
    side: 'sell',
    shares: 30_600,
    pieces: 1,
    placedBy: 'execution',
    placedAt: today('09:20:10'),
    driftBps: [55.13],
    fillText: 'Sold {fillShares} Tata Motors at {fillPrice} · {fillAmount}',
    fillAt: { default: [today('09:24:10')] },
  },
  {
    id: 'ORD-0911-02',
    ticker: 'ITC',
    company: 'ITC',
    side: 'sell',
    shares: 56_400,
    pieces: 1,
    placedBy: 'execution',
    placedAt: today('09:22:10'),
    driftBps: [21.74],
    fillText: 'Sold {fillShares} ITC at {fillPrice} · {fillAmount}',
    fillAt: { default: [today('09:26:30')] },
  },
  {
    id: 'ORD-0911-03',
    ticker: 'TITAN',
    company: 'Titan',
    side: 'sell',
    shares: 7_240,
    pieces: 1,
    placedBy: 'execution',
    placedAt: today('09:24:00'),
    driftBps: [-5.52],
    fillText: 'Sold {fillShares} Titan at {fillPrice} · {fillAmount}',
    fillAt: { default: [today('09:28:00')] },
  },
  {
    id: 'ORD-0911-04',
    ticker: 'BHARTIARTL',
    company: 'Bharti Airtel',
    side: 'buy',
    shares: 31_680, // 18 pieces of 1,760
    pieces: 18,
    placedBy: 'execution',
    placedAt: today('09:27:00'),
    driftBps: [6, 10, 14, 18, 22, 24, 20, 16, 12, 8, 4, 2, 6, 10, 14, 18, 22, 24],
    fillText: 'Bought piece {piece} of {orderPieces} · Bharti Airtel · {fillLakh}',
    fillAt: {
      // A piece every 2 min 40 s. Pieces 15-18 are still ahead of the demo
      // clock at 10:05 and arrive while the screen is open.
      default: [
        today('09:29:30'), today('09:32:10'), today('09:34:50'), today('09:37:30'),
        today('09:40:10'), today('09:42:50'), today('09:45:30'), today('09:48:10'),
        today('09:50:50'), today('09:53:30'), today('09:56:10'), today('09:58:50'),
        today('10:01:30'), today('10:04:52'), today('10:07:30'), today('10:10:10'),
        today('10:12:50'), today('10:15:30'),
      ],
      // Priya throttles Execution to half speed at 09:42, so from piece 6 on a
      // piece lands every 5 min 20 s. Nine are done at 10:05 and the tenth is
      // less than two minutes away.
      bad: [
        today('09:29:30'), today('09:32:10'), today('09:34:50'), today('09:37:30'),
        today('09:40:10'), today('09:45:30'), today('09:50:50'), today('09:56:10'),
        today('10:01:30'), today('10:06:50'), today('10:12:10'), today('10:17:30'),
        today('10:22:50'), today('10:28:10'), today('10:33:30'), today('10:38:50'),
        today('10:44:10'), today('10:49:30'),
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Today's decisions

export interface Fact {
  text: string;
  sourceId: string;
}

export interface ConflictSide {
  label: string;
  value: string;
  detail: string;
  sourceId: string;
}

export interface PastProposal {
  company: string;
  when: string;
  decision: string;
  outcome: string;
}

export interface Version {
  v: number;
  at: string;
  amount: number;
  by: AgentId;
  note: string;
}

export interface Proposal {
  kind: 'proposal';
  id: string;
  company: string;
  ticker: string;
  /**
   * The size after the cap rule. Derived: decisionsFor() fills it in from
   * `sizedAmount`, `capRule` and the fund value, and so does version 2 below.
   * The raw value is never read.
   */
  amount: number;
  /** What the Portfolio Agent sized it at before any cap. */
  sizedAmount: number;
  /** The rule that cut the size down, if any. */
  capRule: 'firstPosition' | null;
  isNewPosition: boolean;
  proposedBy: AgentId;
  sizedBy: AgentId;
  clearedBy: AgentId;
  objections: string[];
  whyYou: string;
  createdAt: string;
  expiresAt: string;
  claim: string;
  facts: Fact[];
  conflict: { fact: string; sides: [ConflictSide, ConflictSide]; agentNote: string };
  tradeUnderEachSide: [string, string];
  wouldProveWrong: string;
  notChecked: string[];
  takeLessDefault: number;
  takeLessStep: number;
  reasoning: string[];
  versions: Version[];
  pastSimilar: PastProposal[];
  sourceIds: string[];
  states: StateName[];
}

export interface VerdictSide {
  name: 'Bull' | 'Bear';
  position: string;
  amount: number;
  wouldChangeMind: string;
  sourceIds: string[];
  reasoning: string[];
}

export interface Verdict {
  kind: 'verdict';
  id: string;
  company: string;
  ticker: string;
  proposedBy: AgentId;
  createdAt: string;
  expiresAt: string;
  splitOn: string;
  agreedOn: string[];
  bull: VerdictSide;
  bear: VerdictSide;
  halfwayAmount: number;
  knockOn: string;
  pastDisputes: PastProposal[];
  states: StateName[];
}

export interface Break {
  kind: 'break';
  id: string;
  company: string;
  ticker: string;
  tradeId: string;
  ourShares: number;
  brokerShares: number;
  price: number;
  raisedBy: AgentId;
  raisedAt: string;
  dueAt: string;
  dueWhy: string;
  sourceIds: string[];
  states: StateName[];
}

export type Decision = Proposal | Verdict | Break;

export const DECISIONS: Decision[] = [
  {
    kind: 'proposal',
    id: 'DEC-0911-01',
    company: 'Infosys',
    ticker: 'INFY',
    amount: 0, // derived from sizedAmount and capRule
    sizedAmount: 8 * CR,
    capRule: 'firstPosition',
    isNewPosition: true,
    proposedBy: 'research',
    sizedBy: 'portfolio',
    clearedBy: 'risk',
    objections: [],
    whyYou: 'The case depends on a fact where the sources disagree, and the autonomy rules send any such proposal to a person.',
    // The Risk Agent routes it to a person before Compliance runs its own check.
    createdAt: today('09:50'),
    expiresAt: today('10:17'),
    claim: 'Infosys is priced for the lower growth case while its deal wins say otherwise',
    facts: [
      { text: 'Q1 FY27 large-deal wins of $3.8 bn, the highest in six quarters', sourceId: 'SRC-INF-03' },
      { text: 'Price is 14% below the average of TCS, HCLTech and Wipro on forward earnings (NSE prices, 09:30)', sourceId: 'SRC-INF-03' },
      { text: 'A five-year contract with a European insurer, announced 5 Sep', sourceId: 'SRC-INF-04' },
    ],
    conflict: {
      fact: 'FY27 revenue growth',
      sides: [
        { label: 'Infosys management guidance', value: 'about 6%', detail: 'Q1 FY27 results call · 16 Jul 2026', sourceId: 'SRC-INF-01' },
        { label: 'Tarang Research (independent)', value: 'about 3%', detail: 'Sector note · 2 Sep 2026', sourceId: 'SRC-INF-02' },
      ],
      agentNote: 'The Research Agent has not picked one and has not averaged them.',
    },
    tradeUnderEachSide: ['If {growthHighBare} holds: about +16% upside', 'If {growthLowBare} holds: about +2% upside'],
    wouldProveWrong: 'Q2 FY27 results in mid-October showing quarter-on-quarter growth below 1% in constant currency.',
    notChecked: [
      "Did not model the rupee's effect on revenue.",
      'Did not read the client-level detail in the 2 Sep note.',
      'Did not compare Q1 deal wins with TCS and HCLTech.',
    ],
    takeLessDefault: 2.5 * CR,
    takeLessStep: 0.5 * CR,
    reasoning: [
      'Read the Q1 FY27 filing: deal wins of $3.8 bn and constant-currency growth of 3.1% year on year.',
      'Compared the price with TCS, HCLTech and Wipro: 14% below on forward earnings.',
      'Found two forecasts for FY27 growth that disagree: management {growthHigh}, Tarang Research {growthLow}.',
      'Did not pick one and did not average them. Flagged the disagreement.',
      'Bull and Bear sub-agents both accepted the idea at a first-position size, so no verdict was needed.',
      'Portfolio Agent sized it at {infySized}, then cut it to {infyAmount} under the first-position rule.',
      'Risk Agent found it within every limit and routed it to a person because of the disagreement.',
    ],
    versions: [
      { v: 1, at: today('09:44'), amount: 8 * CR, by: 'portfolio', note: "Portfolio Agent's first size" },
      { v: 2, at: today('09:49'), amount: 0, by: 'portfolio', note: 'Cut: a first position is capped at {firstPositionPct} of the fund until the next results' },
    ],
    pastSimilar: [
      { company: 'Wipro', when: 'Jun 2026', decision: 'You took less', outcome: '+4% vs Nifty 50' },
      { company: 'HCLTech', when: 'Apr 2026', decision: 'You declined', outcome: '+7% vs Nifty 50, missed' },
      { company: 'TCS', when: 'Feb 2026', decision: 'You took it', outcome: '−3% vs Nifty 50' },
      { company: 'Tech Mahindra', when: 'Jan 2026', decision: 'You took it', outcome: '+2% vs Nifty 50' },
      { company: 'LTIMindtree', when: 'Nov 2025', decision: 'Expired', outcome: '+1% vs Nifty 50, missed' },
    ],
    sourceIds: ['SRC-INF-01', 'SRC-INF-02', 'SRC-INF-03', 'SRC-INF-04'],
    states: ['normal', 'bad'],
  },
  {
    kind: 'verdict',
    id: 'DEC-0911-02',
    company: 'HDFC Bank',
    ticker: 'HDFCBANK',
    proposedBy: 'research',
    createdAt: today('09:47'),
    expiresAt: today('10:23'),
    splitOn: 'Deposit growth recovers in the second half of the year.',
    agreedOn: [
      'Q1 FY27 loan growth of 8% year on year (results filing)',
      'The bank is paying more for deposits than a year ago',
      'The price is close to its five-year average on book value',
    ],
    bull: {
      name: 'Bull',
      position: 'Buy ₹4.0 cr of HDFC Bank',
      amount: 4 * CR,
      wouldChangeMind: 'Q2 FY27 results show deposit growth below 12% year on year.',
      sourceIds: ['SRC-HDB-01', 'SRC-HDB-02', 'SRC-HDB-05'],
      reasoning: [
        'System deposit growth turned up in August for the first time in five months.',
        'Management said on the Q1 call that the deposit rate increases were front-loaded.',
        'If deposits recover, loan growth follows and the price catches up with peers.',
      ],
    },
    bear: {
      name: 'Bear',
      position: 'Buy nothing',
      amount: 0,
      wouldChangeMind: 'Two consecutive months of system deposit growth above 13%.',
      sourceIds: ['SRC-HDB-01', 'SRC-HDB-03', 'SRC-HDB-04'],
      reasoning: [
        'The bank raised deposit rates again on 9 Sep, which says deposits are still hard to win.',
        'Tarang Research expects the deposit fight to last into next year and margins to fall.',
        'Banking already uses {bankingUsedPct} of its sector limit, so a wrong call is hard to unwind.',
      ],
    },
    halfwayAmount: 2 * CR,
    knockOn: "Portfolio Agent is Waiting: it can't size the add until Bull and Bear are resolved.",
    pastDisputes: [
      { company: 'ICICI Bank', when: 'May 2026', decision: 'You sided with Bull', outcome: '+5% vs Nifty 50' },
      { company: 'Kotak Mahindra Bank', when: 'Feb 2026', decision: 'You went halfway', outcome: '+1% vs Nifty 50' },
      { company: 'State Bank of India', when: 'Dec 2025', decision: 'You sided with Bear', outcome: '−4% vs Nifty 50, avoided' },
    ],
    states: ['normal', 'bad'],
  },
  {
    kind: 'break',
    id: 'BRK-0910-01',
    company: 'Axis Bank',
    ticker: 'AXISBANK',
    tradeId: 'TRD-0910-12',
    ourShares: 12_000,
    brokerShares: 10_500,
    price: 1173.3,
    raisedBy: 'operations',
    raisedAt: today('09:43:05'),
    dueAt: today('18:00'),
    dueWhy: "Must be settled before today's official fund value is struck",
    sourceIds: ['SRC-AXS-01', 'SRC-AXS-02'],
    states: ['normal', 'bad'],
  },
];

// ---------------------------------------------------------------------------
// The event log (append-only). Every counter on screen is computed from it.

export type EventType =
  | 'feed_check'
  | 'feed_late'
  | 'feed_recovered'
  | 'recon_started'
  | 'sources_read'
  | 'idea_found'
  | 'idea_dropped'
  | 'case_written'
  | 'sized'
  | 'cut_down'
  | 'trim'
  | 'risk_cleared'
  | 'risk_blocked'
  | 'sent_to_person'
  | 'compliance_cleared'
  | 'compliance_blocked'
  | 'order_placed'
  | 'fill'
  | 'order_complete'
  | 'settled'
  | 'break_raised'
  | 'break_resolved'
  | 'status_change'
  | 'limit_broken'
  | 'human_decision'
  | 'expired'
  | 'agent_paused'
  | 'agent_resumed'
  | 'budget_changed'
  | 'chat';

export interface RawEvent {
  /**
   * The authoring key. It is NOT what the screen shows: eventsFor() assigns
   * display IDs contiguously within each state, because a state that skipped an
   * event must not show a gap in a log that claims each entry is locked to the
   * one before it.
   */
  id: string;
  at: string;
  actor: ActorId;
  type: EventType;
  company?: string;
  /** A template. Every {token} in it is filled in from derived figures. */
  text: string;
  related?: string[];
  /** For batched reads. */
  count?: number;
  /** Rupees, for the few amounts that have no order or trade behind them. */
  amount?: number;
  side?: 'buy' | 'sell';
  /** States this event belongs to. Missing means all three. */
  states?: StateName[];

  // Structured fields. Nothing here is displayed directly; they are what the
  // numbers inside `text` are computed from.
  /** The order this event is about, for order_placed, trim, sized and fill. */
  orderId?: string;
  /** 1-based piece number, for fills. */
  piece?: number;
  /** Trades whose total the text quotes. */
  tradeIds?: string[];
  /** The feed this event is about, for feed_late and feed_recovered. */
  feedId?: FeedId;
  /** The decision this event is about. */
  decisionId?: string;
  /** A ticker whose weight the text quotes. */
  ticker?: string;
  /** Set by eventsFor: the authoring key this display ID came from. */
  key?: string;
}

const NB: StateName[] = ['normal', 'bad'];
const C: StateName[] = ['calm'];
const B: StateName[] = ['bad'];

const settledEvent = (n: number, tradeIndex: number, at: string, states?: StateName[]): RawEvent => {
  const t = TRADES_0910[tradeIndex];
  return {
    id: `EVT-${String(n).padStart(4, '0')}`,
    at,
    actor: 'operations',
    type: 'settled',
    company: t.company,
    text: `Settled ${t.id} · ${t.company} ${t.side} · ${t.shares.toLocaleString('en-IN')} shares · matched broker, custodian and bank`,
    related: [t.id],
    ...(states ? { states } : {}),
  };
};

export const EVENTS: RawEvent[] = [
  // Yesterday
  { id: 'EVT-0910-01', at: yesterday('09:58'), actor: 'priya', type: 'human_decision', company: 'Reliance Industries', text: 'Took the Reliance Industries proposal in full · {relatedTradesTotal} · "Refining margins support the case"', related: ['TRD-0910-01', 'TRD-0910-02', 'TRD-0910-03', 'TRD-0910-04'], tradeIds: ['TRD-0910-01', 'TRD-0910-02', 'TRD-0910-03', 'TRD-0910-04'] },
  { id: 'EVT-0910-02', at: yesterday('10:02'), actor: 'execution', type: 'order_placed', company: 'Reliance Industries', text: 'Placed order: buy {relatedTradesTotal} of Reliance Industries in 4 pieces', related: ['EVT-0910-01'], tradeIds: ['TRD-0910-01', 'TRD-0910-02', 'TRD-0910-03', 'TRD-0910-04'] },
  { id: 'EVT-0910-03', at: yesterday('15:28'), actor: 'execution', type: 'order_complete', text: "Finished the day's {trades0910Count} trades · {relatedTradesTotal} traded", related: TRADES_0910.map((t) => t.id), tradeIds: TRADES_0910.map((t) => t.id) },
  { id: 'EVT-0910-04', at: yesterday('17:20'), actor: 'research', type: 'idea_found', company: 'HDFC Bank', text: 'Found idea: add to HDFC Bank if deposit growth recovers', related: ['DEC-0911-02'], states: NB },
  { id: 'EVT-0910-05', at: yesterday('18:05'), actor: 'research', type: 'case_written', company: 'HDFC Bank', decisionId: 'DEC-0911-02', text: 'Bull sub-agent wrote the case for buying {bullAmount} of HDFC Bank', related: ['DEC-0911-02', 'SRC-HDB-01', 'SRC-HDB-02', 'SRC-HDB-05'], states: NB },
  { id: 'EVT-0910-06', at: yesterday('18:40'), actor: 'research', type: 'case_written', company: 'HDFC Bank', text: 'Bear sub-agent wrote the case against: buy nothing', related: ['DEC-0911-02', 'SRC-HDB-01', 'SRC-HDB-03', 'SRC-HDB-04'], states: NB },

  // Today
  { id: 'EVT-0001', at: today('09:15:00'), actor: 'monitoring', type: 'feed_check', text: 'Market open · checked {feedCount} feeds · all live' },
  { id: 'EVT-0002', at: today('09:16:00'), actor: 'operations', type: 'recon_started', text: "Started matching {trades0910Date}'s {trades0910Count} trades against the broker, custodian and bank", related: TRADES_0910.map((t) => t.id) },
  { id: 'EVT-0003', at: today('09:17:30'), actor: 'research', type: 'sources_read', count: 14, text: 'Read {count} results filings and news items on IT services and telecom' },
  settledEvent(4, 0, today('09:18:00')),
  { id: 'EVT-0005', at: today('09:19:00'), actor: 'portfolio', type: 'trim', company: 'Tata Motors', orderId: 'ORD-0911-01', text: 'Proposed trim: sell {orderSize} of Tata Motors to bring Autos back to its target weight' },
  settledEvent(6, 1, today('09:19:20')),
  { id: 'EVT-0007', at: today('09:19:40'), actor: 'risk', type: 'risk_cleared', company: 'Tata Motors', text: 'Cleared the Tata Motors trim · within every limit and inside autonomy', related: ['EVT-0005'] },
  { id: 'EVT-0008', at: today('09:19:50'), actor: 'compliance', type: 'compliance_cleared', company: 'Tata Motors', text: 'Cleared the Tata Motors trim against the mandate', related: ['EVT-0005'] },
  { id: 'EVT-0009', at: today('09:20:10'), actor: 'execution', type: 'order_placed', company: 'Tata Motors', orderId: 'ORD-0911-01', text: 'Placed order: sell {orderSize} of Tata Motors in {orderPieces} {orderPieceWord}', related: ['EVT-0005'] },
  settledEvent(10, 2, today('09:20:40')),
  { id: 'EVT-0011', at: today('09:21:00'), actor: 'portfolio', type: 'trim', company: 'ITC', orderId: 'ORD-0911-02', text: 'Proposed trim: sell {orderSize} of ITC after its 9% rise this month' },
  { id: 'EVT-0012', at: today('09:21:30'), actor: 'risk', type: 'risk_cleared', company: 'ITC', text: 'Cleared the ITC trim · within every limit and inside autonomy', related: ['EVT-0011'] },
  { id: 'EVT-0013', at: today('09:21:40'), actor: 'compliance', type: 'compliance_cleared', company: 'ITC', text: 'Cleared the ITC trim against the mandate', related: ['EVT-0011'] },
  settledEvent(14, 3, today('09:22:00')),
  { id: 'EVT-0015', at: today('09:22:10'), actor: 'execution', type: 'order_placed', company: 'ITC', orderId: 'ORD-0911-02', text: 'Placed order: sell {orderSize} of ITC in {orderPieces} {orderPieceWord}', related: ['EVT-0011'] },
  { id: 'EVT-0016', at: today('09:22:30'), actor: 'research', type: 'idea_found', company: 'Bharti Airtel', text: 'Found idea: add to Bharti Airtel after the tariff increase', related: ['EVT-0003'] },
  { id: 'EVT-0017', at: today('09:23:00'), actor: 'portfolio', type: 'trim', company: 'Titan', orderId: 'ORD-0911-03', text: "Proposed trim: sell {orderSize} of Titan to fund this morning's buys" },
  settledEvent(18, 4, today('09:23:20')),
  { id: 'EVT-0019', at: today('09:23:30'), actor: 'risk', type: 'risk_cleared', company: 'Titan', text: 'Cleared the Titan trim · within every limit and inside autonomy', related: ['EVT-0017'] },
  { id: 'EVT-0020', at: today('09:23:40'), actor: 'compliance', type: 'compliance_cleared', company: 'Titan', text: 'Cleared the Titan trim against the mandate', related: ['EVT-0017'] },
  { id: 'EVT-0021', at: today('09:24:00'), actor: 'execution', type: 'order_placed', company: 'Titan', orderId: 'ORD-0911-03', text: 'Placed order: sell {orderSize} of Titan in {orderPieces} {orderPieceWord}', related: ['EVT-0017'] },
  settledEvent(23, 5, today('09:24:40')),
  { id: 'EVT-0024', at: today('09:25:00'), actor: 'portfolio', type: 'sized', company: 'Bharti Airtel', orderId: 'ORD-0911-04', text: 'Sized the Bharti Airtel add at {orderSize} · Telecom would be {sectorAfterPct} of the fund', related: ['EVT-0016'] },
  { id: 'EVT-0025', at: today('09:25:30'), actor: 'research', type: 'idea_found', company: 'Vardhan Distilleries', text: 'Found idea: Vardhan Distilleries on a volume recovery', related: ['EVT-0003'] },
  settledEvent(26, 6, today('09:26:00')),
  { id: 'EVT-0027', at: today('09:26:10'), actor: 'risk', type: 'risk_cleared', company: 'Bharti Airtel', orderId: 'ORD-0911-04', text: 'Cleared the Bharti Airtel add · would be {tickerAfterPct} of the fund, limit {companyLimitPct} · inside autonomy', related: ['EVT-0024'] },
  { id: 'EVT-0028', at: today('09:26:20'), actor: 'compliance', type: 'compliance_cleared', company: 'Bharti Airtel', text: 'Cleared the Bharti Airtel add against the mandate and banned list', related: ['EVT-0024'] },
  { id: 'EVT-0030', at: today('09:26:40'), actor: 'research', type: 'sources_read', count: 9, text: 'Read {count} broker notes and news items on consumer companies' },
  { id: 'EVT-0031', at: today('09:27:00'), actor: 'execution', type: 'order_placed', company: 'Bharti Airtel', orderId: 'ORD-0911-04', text: 'Placed order: buy {orderSize} of Bharti Airtel in {orderPieces} {orderPieceWord}', related: ['EVT-0024'] },
  settledEvent(32, 7, today('09:27:20')),
  { id: 'EVT-0033', at: today('09:27:30'), actor: 'portfolio', type: 'sized', company: 'Vardhan Distilleries', amount: 1.5 * CR, text: 'Sized Vardhan Distilleries at {amount} · a first position', related: ['EVT-0025'] },
  // Reliance sits at 7.5% in calm, where an add of this size breaks nothing.
  // The idea, its size and the block belong only to the states it is true in.
  { id: 'EVT-0035', at: today('09:28:20'), actor: 'research', type: 'idea_found', company: 'Reliance Industries', text: 'Found idea: add to Reliance Industries on refining margins', related: ['EVT-0003'], states: NB },
  settledEvent(36, 8, today('09:28:40')),
  { id: 'EVT-0037', at: today('09:28:50'), actor: 'risk', type: 'risk_cleared', company: 'Vardhan Distilleries', amount: 1.5 * CR, text: 'Cleared Vardhan Distilleries on limits · would be {amountPctOfFund} of the fund', related: ['EVT-0033'] },
  { id: 'EVT-0038', at: today('09:29:00'), actor: 'compliance', type: 'compliance_blocked', company: 'Vardhan Distilleries', text: 'Blocked: Vardhan Distilleries is on the banned list · the mandate excludes alcohol producers', related: ['EVT-0033'] },
  settledEvent(40, 9, today('09:30:00')),
  { id: 'EVT-0041', at: today('09:30:20'), actor: 'portfolio', type: 'sized', company: 'Reliance Industries', amount: 2 * CR, text: 'Sized the Reliance Industries add at {amount}', related: ['EVT-0035'], states: NB },
  { id: 'EVT-0042', at: today('09:31:00'), actor: 'research', type: 'idea_found', company: 'Infosys', text: 'Found idea: buy Infosys, priced for the lower growth case', related: ['EVT-0003', 'SRC-INF-01', 'SRC-INF-02', 'SRC-INF-03', 'SRC-INF-04'] },
  settledEvent(43, 10, today('09:31:20')),
  // Risk blocks Reliance. Nothing runs after a block, so Compliance never sees it.
  { id: 'EVT-0044', at: today('09:31:30'), actor: 'risk', type: 'risk_blocked', company: 'Reliance Industries', amount: 2 * CR, ticker: 'RELIANCE', text: 'Blocked: {amount} more would take Reliance Industries to {tickerPlusAmountPct} of the fund, above the {companyLimitPct} limit', related: ['EVT-0041'], states: NB },
  { id: 'EVT-0047', at: today('09:33:00'), actor: 'research', type: 'idea_found', company: 'Nestlé India', text: 'Found idea: Nestlé India on a margin recovery', related: ['EVT-0030'] },
  settledEvent(48, 12, today('09:33:20')),
  { id: 'EVT-0049', at: today('09:34:00'), actor: 'research', type: 'sources_read', count: 16, text: 'Read {count} filings, notes and news items on banks and pharma' },
  { id: 'EVT-0051', at: today('09:35:00'), actor: 'monitoring', type: 'feed_late', feedId: 'notes', text: 'Research notes feed {feedLate} late · Research Agent told to hold ideas that rest on notes' },
  settledEvent(52, 13, today('09:35:20')),
  { id: 'EVT-0053', at: today('09:36:00'), actor: 'research', type: 'idea_dropped', company: 'Nestlé India', text: 'Dropped Nestlé India: the price already moved 4% on the news it rested on', related: ['EVT-0047'] },
  settledEvent(54, 14, today('09:37:20')),
  { id: 'EVT-0056', at: today('09:38:00'), actor: 'research', type: 'idea_found', company: "Dr. Reddy's", text: "Found idea: Dr. Reddy's on a US launch", related: ['EVT-0049'] },
  { id: 'EVT-0057', at: today('09:39:00'), actor: 'monitoring', type: 'feed_recovered', feedId: 'notes', text: 'Research notes feed recovered · {feedGap} gap' },
  settledEvent(58, 15, today('09:39:20')),
  { id: 'EVT-0059', at: today('09:40:00'), actor: 'research', type: 'sources_read', count: 9, text: 'Read {count} filings and news items on autos and cement' },
  { id: 'EVT-0061', at: today('09:41:00'), actor: 'research', type: 'idea_dropped', company: "Dr. Reddy's", text: "Dropped Dr. Reddy's: the only source was an AI-written summary with no filing behind it", related: ['EVT-0056'] },
  settledEvent(62, 16, today('09:41:20')),
  { id: 'EVT-0063', at: today('09:42:00'), actor: 'priya', type: 'status_change', text: 'Throttled Execution Agent to half speed · "thin volumes at open"', states: B },
  settledEvent(65, 17, today('09:43:00')),
  { id: 'EVT-0066', at: today('09:43:05'), actor: 'operations', type: 'break_raised', company: 'Axis Bank', decisionId: 'BRK-0910-01', text: 'Records mismatch on {breakTradeId} · our record: {breakOurShares} Axis Bank shares sold · broker: {breakBrokerShares} · difference {breakDiff} at {breakPrice}', related: ['BRK-0910-01', 'TRD-0910-12', 'SRC-AXS-01', 'SRC-AXS-02'], states: NB },
  settledEvent(67, 11, today('09:43:05'), C),
  { id: 'EVT-0068', at: today('09:43:10'), actor: 'operations', type: 'status_change', text: "Status → Needs you · 1 trade doesn't match the broker's record", related: ['BRK-0910-01'], states: NB },
  { id: 'EVT-0069', at: today('09:44:00'), actor: 'portfolio', type: 'sized', company: 'Infosys', decisionId: 'DEC-0911-01', text: 'Sized Infosys at {decisionSized} · version 1', related: ['DEC-0911-01', 'EVT-0042'], states: NB },
  { id: 'EVT-0070', at: today('09:45:00'), actor: 'monitoring', type: 'feed_check', text: 'Checked {feedCount} feeds · all live' },
  { id: 'EVT-0072', at: today('09:47:00'), actor: 'research', type: 'sent_to_person', company: 'HDFC Bank', decisionId: 'DEC-0911-02', text: 'Bull and Bear split on one assumption · sent DEC-0911-02 to Priya Nair · expires {decisionExpires}', related: ['DEC-0911-02'], states: NB },
  { id: 'EVT-0073', at: today('09:47:30'), actor: 'portfolio', type: 'status_change', text: "Status → Waiting · can't size HDFC Bank until Bull and Bear are resolved", related: ['DEC-0911-02'], states: NB },
  { id: 'EVT-0075', at: today('09:49:00'), actor: 'portfolio', type: 'cut_down', company: 'Infosys', decisionId: 'DEC-0911-01', text: 'Cut Infosys from {decisionSized} to {decisionAmount} · version 2 · a first position is capped at {firstPositionPct} of the fund until the next results', related: ['DEC-0911-01', 'EVT-0069'], states: NB },
  { id: 'EVT-0076', at: today('09:49:00'), actor: 'research', type: 'idea_dropped', company: 'Infosys', text: 'Dropped Infosys: Bull and Bear could not agree a size · parked until the Q2 FY27 results', related: ['EVT-0042'], states: C },
  // Risk rules before Compliance runs its own check, and routing to a person is
  // Risk's verdict, so it comes first.
  { id: 'EVT-0080', at: today('09:50:00'), actor: 'risk', type: 'sent_to_person', company: 'Infosys', decisionId: 'DEC-0911-01', text: 'Within every limit · sources disagree on FY27 growth, so autonomy rules send DEC-0911-01 to Priya Nair · expires {decisionExpires}', related: ['DEC-0911-01'], states: NB },
  { id: 'EVT-0077', at: today('09:50:00'), actor: 'risk', type: 'limit_broken', text: "Banking sector is at {bankingPct} of the fund, above its {sectorLimitPct} limit, after bank prices rose this month · no agent traded today · agents can't add to Banking", states: B },
  { id: 'EVT-0079', at: today('09:51:00'), actor: 'compliance', type: 'compliance_cleared', company: 'Infosys', text: 'Cleared Infosys against the mandate and banned list', related: ['DEC-0911-01'], states: NB },
  { id: 'EVT-0081', at: today('09:55:00'), actor: 'monitoring', type: 'feed_late', feedId: 'prices', text: 'NSE prices feed {feedLate} late · last update {feedLastUpdate}', states: B },
  { id: 'EVT-0086', at: today('10:03:00'), actor: 'monitoring', type: 'status_change', feedId: 'prices', text: 'NSE prices feed {feedLate} late · paused Research Agent and Risk Agent until it recovers', states: B },
];

/** Every record ID that can be linked to. */
export function recordExists(id: string): boolean {
  return (
    EVENTS.some((e) => e.id === id) ||
    TRADES_0910.some((t) => t.id === id) ||
    DECISIONS.some((d) => d.id === id) ||
    SOURCES.some((s) => s.id === id)
  );
}
