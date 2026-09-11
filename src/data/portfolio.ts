import { CR } from './scenario';

export type PortfolioSector =
  | 'Cement'
  | 'Energy'
  | 'Banking'
  | 'Industrials'
  | 'IT'
  | 'Telecom'
  | 'Realty'
  | 'Consumer'
  | 'Autos'
  | 'Pharma'
  | 'Electronics';

export interface Driver {
  id: string;
  name: string;
  note?: string;
}

export interface SourceFact {
  text: string;
  source: string;
  date: string;
  sourceId: string;
}

export interface SourceConflictSide {
  label: string;
  value: number;
  unit: 'pct' | 'shares';
  qualifier?: string;
  detail: string;
  source: string;
  date: string;
  sourceId: string;
}

export interface SourceConflict {
  subject: string;
  sides: [SourceConflictSide, SourceConflictSide];
}

export interface Change {
  date: string;
  text: string;
  actor: string;
}

export interface ExitEstimate {
  value: number;
  days: number;
  costPct: number;
}

export type HoldingState =
  | { kind: 'over_limit'; limitPct: number; exceptionPct: number; exceptionExpires: string }
  | { kind: 'near_limit'; limitPct: number }
  | { kind: 'buying'; donePieces: number; totalPieces: number; filledValue: number; orderValue: number; targetPct: number }
  | { kind: 'unsettled'; soldValue: number; settlementDate: string }
  | { kind: 'stale_price'; updatedAt: string }
  | { kind: 'records_disagree'; ourShares: number; brokerShares: number; decisionId: string };

export interface HoldingDetail {
  claim: string;
  evidence: SourceFact[];
  conflict?: SourceConflict;
  notChecked: string[];
  wouldProveWrong: string;
  changes: Change[];
  relatedDecisionId?: string;
  relatedDecisionLabel?: string;
}

export interface Holding {
  ticker: string;
  name: string;
  sector: PortfolioSector;
  price: number;
  shares: number;
  brokerShares?: number;
  value: number;
  weightPct: number;
  unrealisedPnl: number;
  unrealisedPnlPct: number;
  realisedPnl: number;
  daysToSell: number;
  driverId: string;
  openedAt: string;
  openedBy: string;
  openedNote?: string;
  states: HoldingState[];
  detail: HoldingDetail;
  exit: ExitEstimate;
}

export const PORTFOLIO_LIMITS = {
  holdingPct: 10,
  sectorPct: 25,
  nearThresholdPct: 90,
} as const;

export const PORTFOLIO_PERCENT_SCALE = 100;
export const PORTFOLIO_SMALL_POSITION_PCT = 2.5;

export const DRIVERS: Driver[] = [
  { id: 'construction', name: 'Construction and housing' },
  { id: 'rates', name: 'Interest rates and credit growth' },
  { id: 'tech', name: 'US and European tech budgets' },
  { id: 'urban', name: 'Urban discretionary spending' },
  { id: 'rural', name: 'Rural demand and monsoon' },
  { id: 'independent', name: 'Independent', note: 'No material shared driver tagged' },
];

const OPENED_BY = 'Research Agent';

function standardDetail(
  ticker: string,
  name: string,
  sector: PortfolioSector,
  driver: string,
  openedLabel: string,
  price: number,
): HoldingDetail {
  return {
    claim: `${name} gives the fund selective exposure to ${sector.toLowerCase()} earnings. The position remains tied to ${driver.toLowerCase()}, rather than to a short-term price move.`,
    evidence: [
      { text: 'Position shares reconciled against the fund book', source: 'Portfolio Agent', date: '2026-09-11', sourceId: `SRC-${ticker}-01` },
      { text: `Latest close used for the fund book · ₹${price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, source: 'NSE prices feed', date: '2026-09-11', sourceId: `SRC-${ticker}-02` },
      { text: `Shared driver tagged as ${driver}`, source: 'Research Agent', date: '2026-09-01', sourceId: `SRC-${ticker}-03` },
    ],
    notChecked: ['Did not refresh management commentary after the latest market close.', 'Did not test the position against an abrupt change in its shared driver.'],
    wouldProveWrong: `A material deterioration in the operating evidence behind the ${driver.toLowerCase()} thesis.`,
    changes: [{ date: openedLabel, text: 'opened at the recorded position size', actor: OPENED_BY }],
  };
}

function holding(
  base: Omit<Holding, 'detail' | 'exit'> & { detail?: Partial<HoldingDetail>; exitCostPct?: number },
): Holding {
  const driver = DRIVERS.find((item) => item.id === base.driverId)?.name ?? 'Independent';
  const openedLabel = formatOpenedLabel(base.openedAt);
  const generic = standardDetail(base.ticker, base.name, base.sector, driver, openedLabel, base.price);
  return {
    ...base,
    detail: { ...generic, ...base.detail },
    exit: { value: base.value, days: base.daysToSell, costPct: base.exitCostPct ?? 0.3 },
  };
}

function formatOpenedLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[month - 1]}${year === 2026 ? '' : ` ${year}`}`;
}

export const HOLDINGS: Holding[] = [
  holding({
    ticker: 'ULTRACEMCO', name: 'UltraTech Cement', sector: 'Cement', price: 12_480, shares: 20_500, value: 25.6 * CR,
    weightPct: 10.3, unrealisedPnl: 4.51 * CR, unrealisedPnlPct: 21.4, realisedPnl: 0.62 * CR, daysToSell: 0.7,
    driverId: 'construction', openedAt: '2026-01-14', openedBy: OPENED_BY,
    states: [{ kind: 'over_limit', limitPct: 10, exceptionPct: 11, exceptionExpires: '2026-09-16' }], exitCostPct: 0.4,
    detail: {
      claim: 'Cement prices held up through the monsoon while input costs fell. UltraTech adds capacity faster than peers, so it gains share when construction picks up.',
      evidence: [
        { text: 'Q1 FY27 volumes +11% year on year', source: 'UltraTech, filed with NSE', date: '2026-07-23', sourceId: 'SRC-ULT-01' },
        { text: 'Pet coke cost down 14% since March', source: 'Dalal Street Wire', date: '2026-09-02', sourceId: 'SRC-ULT-02' },
        { text: 'Capacity to 200 mtpa by FY28', source: 'UltraTech investor presentation', date: '2026-07-23', sourceId: 'SRC-ULT-03' },
      ],
      conflict: {
        subject: 'FY27 cement demand growth',
        sides: [
          { label: "Cement Manufacturers' Association", value: 8, unit: 'pct', qualifier: 'about', detail: 'Annual outlook', source: "Cement Manufacturers' Association", date: '2026-06-12', sourceId: 'SRC-ULT-04' },
          { label: 'Tarang Research · independent', value: 4, unit: 'pct', qualifier: 'about', detail: 'Sector note', source: 'Tarang Research', date: '2026-09-02', sourceId: 'SRC-ULT-05' },
        ],
      },
      notChecked: ['Did not check how much of the recent price rise is the acquisition premium.', 'Did not compare dealer inventory with Shree Cement and Ambuja.'],
      wouldProveWrong: 'Two quarters of volume growth below 5%.',
      changes: [
        { date: '14 Jan', text: 'opened at 6.0%', actor: 'Research Agent, cleared by Risk Agent' },
        { date: '12 Aug', text: 'trimmed 1.2% · sector drift', actor: 'Risk Agent' },
        { date: '4 Sep', text: 'went over 10% on price rise · no trade', actor: 'Portfolio Agent' },
        { date: '8 Sep', text: 'exception to 11% until 16 Sep', actor: 'approved by Priya Nair' },
      ],
    },
  }),
  holding({
    ticker: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy', price: 1_412, shares: 165_500, value: 23.4 * CR,
    weightPct: 9.4, unrealisedPnl: 1.36 * CR, unrealisedPnlPct: 6.2, realisedPnl: 0, daysToSell: 0.5,
    driverId: 'independent', openedAt: '2025-11-03', openedBy: OPENED_BY, states: [{ kind: 'near_limit', limitPct: 10 }],
  }),
  holding({
    ticker: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking', price: 1_968, shares: 103_600, value: 20.4 * CR,
    weightPct: 8.2, unrealisedPnl: 0.93 * CR, unrealisedPnlPct: 4.8, realisedPnl: 0, daysToSell: 0.4,
    driverId: 'rates', openedAt: '2025-10-09', openedBy: OPENED_BY, openedNote: 'approved by Priya Nair', states: [],
    detail: {
      claim: 'Deposit growth can support loan growth without giving up too much margin. The open question is whether funding costs remain high for longer than the market expects.',
      evidence: [
        { text: 'Loan growth remained ahead of system growth', source: 'HDFC Bank, filed with NSE', date: '2026-07-19', sourceId: 'SRC-HDB-01' },
        { text: 'August system deposit data remained firm', source: 'Meridian Market Data', date: '2026-09-08', sourceId: 'SRC-HDB-02' },
        { text: 'Deposit pricing remains the contested assumption', source: 'Tarang Research', date: '2026-08-28', sourceId: 'SRC-HDB-03' },
      ],
      notChecked: ['Did not resolve the Bull and Bear split on deposit costs.', 'Did not update the downside case for another deposit-rate increase.'],
      wouldProveWrong: 'Two quarters of weaker deposit growth with no recovery in margins.',
      changes: [{ date: '9 Oct 2025', text: 'opened after the bank basket review', actor: 'Research Agent · approved by Priya Nair' }],
      relatedDecisionId: 'DEC-0911-02',
      relatedDecisionLabel: 'Open Bull and Bear decision on Home',
    },
  }),
  holding({
    ticker: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking', price: 1_426, shares: 122_000, value: 17.4 * CR,
    weightPct: 7.0, unrealisedPnl: 1.85 * CR, unrealisedPnlPct: 11.9, realisedPnl: 0.18 * CR, daysToSell: 0.4,
    driverId: 'rates', openedAt: '2025-10-09', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'LT', name: 'Larsen & Toubro', sector: 'Industrials', price: 3_745, shares: 41_200, value: 15.4 * CR,
    weightPct: 6.2, unrealisedPnl: 1.29 * CR, unrealisedPnlPct: 9.1, realisedPnl: 0, daysToSell: 0.6,
    driverId: 'construction', openedAt: '2026-02-02', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'TCS', name: 'TCS', sector: 'IT', price: 3_310, shares: 45_800, value: 15.2 * CR,
    weightPct: 6.1, unrealisedPnl: -1.28 * CR, unrealisedPnlPct: -7.8, realisedPnl: 0.24 * CR, daysToSell: 0.5,
    driverId: 'tech', openedAt: '2025-11-20', openedBy: OPENED_BY,
    states: [{ kind: 'unsettled', soldValue: 3.2 * CR, settlementDate: '2026-09-14' }],
  }),
  holding({
    ticker: 'HCLTECH', name: 'HCLTech', sector: 'IT', price: 1_612, shares: 67_900, value: 10.9 * CR,
    weightPct: 4.4, unrealisedPnl: 0.37 * CR, unrealisedPnlPct: 3.5, realisedPnl: 0, daysToSell: 0.6,
    driverId: 'tech', openedAt: '2025-11-20', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', price: 1_894, shares: 52_500, value: 9.9 * CR,
    weightPct: 4.0, unrealisedPnl: 0.12 * CR, unrealisedPnlPct: 1.2, realisedPnl: 0, daysToSell: 0.5,
    driverId: 'independent', openedAt: '2026-05-15', openedBy: OPENED_BY, openedNote: 'adding today',
    states: [{ kind: 'buying', donePieces: 14, totalPieces: 18, filledValue: 5 * CR, orderValue: 6.4 * CR, targetPct: 4.6 }],
    detail: {
      claim: 'Tariff repair is lifting cash generation while subscriber quality remains stable. The add increases a position that does not share the fund’s main macro drivers.',
      evidence: [
        { text: 'Order is 14 of 18 pieces complete', source: 'Execution Agent', date: '2026-09-11', sourceId: 'SRC-BHA-01' },
        { text: '₹5.0 cr of the ₹6.4 cr order is filled', source: 'Execution Agent', date: '2026-09-11', sourceId: 'SRC-BHA-02' },
        { text: 'Target weight is 4.6% when the order completes', source: 'Portfolio Agent', date: '2026-09-11', sourceId: 'SRC-BHA-03' },
      ],
      notChecked: ['Did not assume the remaining pieces fill at the same price.', 'Did not refresh competitor tariff actions after the order began.'],
      wouldProveWrong: 'Subscriber losses offset the benefit of the tariff increase for two quarters.',
      changes: [
        { date: '15 May', text: 'opened as an independent position', actor: 'Research Agent' },
        { date: '11 Sep', text: 'adding in 18 pieces · 14 complete', actor: 'Execution Agent' },
      ],
    },
  }),
  holding({
    ticker: 'DLF', name: 'DLF', sector: 'Realty', price: 842.3, shares: 106_300, value: 8.9 * CR,
    weightPct: 3.6, unrealisedPnl: -0.36 * CR, unrealisedPnlPct: -3.9, realisedPnl: 0, daysToSell: 2,
    driverId: 'construction', openedAt: '2026-03-18', openedBy: OPENED_BY, openedNote: 'approved by Priya Nair',
    states: [{ kind: 'stale_price', updatedAt: '2026-09-11T09:31:00+05:30' }],
    detail: {
      claim: 'Premium housing demand and a strong launch pipeline support cash collection. The position also adds the most direct real-estate exposure to the construction and housing driver.',
      evidence: [
        { text: 'Last NSE trade was ₹842.30 at 09:31', source: 'NSE prices feed', date: '2026-09-11', sourceId: 'SRC-DLF-01' },
        { text: 'Position value is estimated from that stale trade', source: 'Portfolio Agent', date: '2026-09-11', sourceId: 'SRC-DLF-02' },
        { text: 'Construction and housing driver tag reconfirmed', source: 'Risk Agent', date: '2026-09-01', sourceId: 'SRC-DLF-03' },
      ],
      notChecked: ['No NSE trade has printed since 09:31.', 'Did not verify whether the exchange feed or the security itself is inactive.'],
      wouldProveWrong: 'Two consecutive launches with materially weaker collections.',
      changes: [
        { date: '18 Mar', text: 'opened after the housing-demand review', actor: 'Research Agent · approved by Priya Nair' },
        { date: '11 Sep', text: 'value marked estimated after the price became stale', actor: 'Monitoring Agent' },
      ],
    },
  }),
  holding({
    ticker: 'AXISBANK', name: 'Axis Bank', sector: 'Banking', price: 1_173.3, shares: 72_000, brokerShares: 73_500, value: 8.5 * CR,
    weightPct: 3.4, unrealisedPnl: 0.21 * CR, unrealisedPnlPct: 2.6, realisedPnl: 0.11 * CR, daysToSell: 0.5,
    driverId: 'rates', openedAt: '2025-10-09', openedBy: OPENED_BY,
    states: [{ kind: 'records_disagree', ourShares: 72_000, brokerShares: 73_500, decisionId: 'BRK-0910-01' }],
    detail: {
      claim: 'Improving asset quality and credit growth support the bank basket. The position size remains unresolved until the broker record and our trade record agree.',
      evidence: [
        { text: 'Our record carries 72,000 shares', source: 'Our trade record', date: '2026-09-10', sourceId: 'SRC-AXS-02' },
        { text: 'The broker record carries 73,500 shares', source: 'Sagar Broking', date: '2026-09-10', sourceId: 'SRC-AXS-01' },
        { text: 'The difference traces to the 10 Sep sale', source: 'Operations Agent', date: '2026-09-11', sourceId: 'TRD-0910-12' },
      ],
      conflict: {
        subject: 'Axis Bank shares held',
        sides: [
          { label: 'Our record', value: 72_000, unit: 'shares', detail: 'After 12,000 shares sold on 10 Sep', source: 'Execution Agent', date: '2026-09-10', sourceId: 'SRC-AXS-02' },
          { label: 'Sagar Broking', value: 73_500, unit: 'shares', detail: 'After 10,500 shares sold on 10 Sep', source: 'Sagar Broking', date: '2026-09-10', sourceId: 'SRC-AXS-01' },
        ],
      },
      notChecked: ['Did not choose either share count while the records disagree.', 'Did not release the held settlement.'],
      wouldProveWrong: 'A lasting deterioration in asset quality or deposit growth after the records reconcile.',
      changes: [
        { date: '9 Oct 2025', text: 'opened with the bank basket', actor: 'Research Agent' },
        { date: '10 Sep', text: 'sale recorded differently by us and the broker', actor: 'Operations Agent' },
      ],
      relatedDecisionId: 'BRK-0910-01',
      relatedDecisionLabel: 'Review mismatch on Home',
    },
  }),
  holding({
    ticker: 'AMBUJACEM', name: 'Ambuja Cements', sector: 'Cement', price: 588, shares: 131_100, value: 7.7 * CR,
    weightPct: 3.1, unrealisedPnl: 0.39 * CR, unrealisedPnlPct: 5.4, realisedPnl: 0, daysToSell: 1,
    driverId: 'construction', openedAt: '2026-01-14', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'ASIANPAINT', name: 'Asian Paints', sector: 'Consumer', price: 2_466, shares: 30_200, value: 7.5 * CR,
    weightPct: 3.0, unrealisedPnl: -0.79 * CR, unrealisedPnlPct: -9.6, realisedPnl: -0.08 * CR, daysToSell: 1,
    driverId: 'construction', openedAt: '2025-12-06', openedBy: OPENED_BY,
    states: [{ kind: 'unsettled', soldValue: 2.6 * CR, settlementDate: '2026-09-14' }],
  }),
  holding({
    ticker: 'TATAMOTORS', name: 'Tata Motors', sector: 'Autos', price: 742, shares: 93_800, value: 7 * CR,
    weightPct: 2.8, unrealisedPnl: 0.02 * CR, unrealisedPnlPct: 0.3, realisedPnl: 0, daysToSell: 0.7,
    driverId: 'urban', openedAt: '2026-08-28', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'LTIM', name: 'LTIMindtree', sector: 'IT', price: 5_580, shares: 12_000, value: 6.7 * CR,
    weightPct: 2.7, unrealisedPnl: -0.29 * CR, unrealisedPnlPct: -4.1, realisedPnl: 0, daysToSell: 2,
    driverId: 'tech', openedAt: '2025-11-20', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking', price: 2_112, shares: 30_600, value: 6.5 * CR,
    weightPct: 2.6, unrealisedPnl: 0.21 * CR, unrealisedPnlPct: 3.3, realisedPnl: 0, daysToSell: 0.6,
    driverId: 'rates', openedAt: '2026-04-04', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'M&M', name: 'Mahindra & Mahindra', sector: 'Autos', price: 3_290, shares: 18_100, value: 6 * CR,
    weightPct: 2.4, unrealisedPnl: 0.76 * CR, unrealisedPnlPct: 14.7, realisedPnl: 0.09 * CR, daysToSell: 0.6,
    driverId: 'rural', openedAt: '2026-02-12', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'TITAN', name: 'Titan', sector: 'Consumer', price: 3_620, shares: 16_500, value: 6 * CR,
    weightPct: 2.4, unrealisedPnl: 0.44 * CR, unrealisedPnlPct: 7.9, realisedPnl: 0, daysToSell: 0.7,
    driverId: 'urban', openedAt: '2025-12-06', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma', price: 1_788, shares: 32_000, value: 5.7 * CR,
    weightPct: 2.3, unrealisedPnl: 0.54 * CR, unrealisedPnlPct: 10.4, realisedPnl: 0, daysToSell: 0.5,
    driverId: 'independent', openedAt: '2026-05-15', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'SBIN', name: 'State Bank of India', sector: 'Banking', price: 842, shares: 56_100, value: 4.7 * CR,
    weightPct: 1.9, unrealisedPnl: -0.09 * CR, unrealisedPnlPct: -1.8, realisedPnl: 0, daysToSell: 0.5,
    driverId: 'rates', openedAt: '2026-04-04', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'Consumer', price: 2_540, shares: 18_600, value: 4.7 * CR,
    weightPct: 1.9, unrealisedPnl: -0.11 * CR, unrealisedPnlPct: -2.2, realisedPnl: 0, daysToSell: 0.5,
    driverId: 'rural', openedAt: '2026-02-12', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'TECHM', name: 'Tech Mahindra', sector: 'IT', price: 1_560, shares: 28_700, value: 4.5 * CR,
    weightPct: 1.8, unrealisedPnl: -0.25 * CR, unrealisedPnlPct: -5.3, realisedPnl: -0.04 * CR, daysToSell: 1,
    driverId: 'tech', openedAt: '2026-06-22', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'DMART', name: 'Avenue Supermarts', sector: 'Consumer', price: 4_410, shares: 10_100, value: 4.5 * CR,
    weightPct: 1.8, unrealisedPnl: 0.28 * CR, unrealisedPnlPct: 6.8, realisedPnl: 0, daysToSell: 3,
    driverId: 'urban', openedAt: '2026-07-30', openedBy: OPENED_BY, states: [],
  }),
  holding({
    ticker: 'MARUTI', name: 'Maruti Suzuki', sector: 'Autos', price: 12_950, shares: 2_900, value: 3.7 * CR,
    weightPct: 1.5, unrealisedPnl: 0.41 * CR, unrealisedPnlPct: 12.5, realisedPnl: 0.07 * CR, daysToSell: 0.4,
    driverId: 'rural', openedAt: '2026-02-12', openedBy: OPENED_BY,
    states: [{ kind: 'unsettled', soldValue: 1.8 * CR, settlementDate: '2026-09-14' }],
  }),
  holding({
    ticker: 'DIXON', name: 'Dixon Technologies', sector: 'Electronics', price: 17_240, shares: 1_700, value: 3 * CR,
    weightPct: 1.2, unrealisedPnl: 0.46 * CR, unrealisedPnlPct: 18.3, realisedPnl: 0, daysToSell: 4,
    driverId: 'urban', openedAt: '2026-06-22', openedBy: OPENED_BY, states: [], exitCostPct: 0.6,
  }),
];

export const EXPECTED_SECTOR_TOTALS_PCT: Record<PortfolioSector, number> = {
  Banking: 23.1,
  IT: 15,
  Cement: 13.4,
  Energy: 9.4,
  Consumer: 9.1,
  Autos: 6.7,
  Industrials: 6.2,
  Telecom: 4,
  Realty: 3.6,
  Pharma: 2.3,
  Electronics: 1.2,
};

export const EXPECTED_DRIVER_TOTALS_PCT: Record<string, number> = {
  construction: 26.2,
  rates: 23.1,
  tech: 15,
  urban: 8.2,
  rural: 5.8,
  independent: 15.7,
};

export const PORTFOLIO_TOTAL_PCT = HOLDINGS.reduce((sum, item) => sum + item.weightPct, 0);
export const PORTFOLIO_CASH_PCT = PORTFOLIO_PERCENT_SCALE - PORTFOLIO_TOTAL_PCT;

export const PORTFOLIO_SUMMARY = {
  holdingsCount: HOLDINGS.length,
  investedPct: PORTFOLIO_TOTAL_PCT,
  exceptionCount: HOLDINGS.filter((item) => item.states.some((state) => state.kind === 'over_limit')).length,
  buyingCount: HOLDINGS.filter((item) => item.states.some((state) => state.kind === 'buying')).length,
  unsettledCount: HOLDINGS.filter((item) => item.states.some((state) => state.kind === 'unsettled')).length,
  staleCount: HOLDINGS.filter((item) => item.states.some((state) => state.kind === 'stale_price')).length,
  mismatchCount: HOLDINGS.filter((item) => item.states.some((state) => state.kind === 'records_disagree')).length,
} as const;

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.001) throw new Error(`Portfolio data mismatch: ${label} is ${actual}, expected ${expected}`);
}

export function assertPortfolioData(): void {
  assertClose(PORTFOLIO_TOTAL_PCT, 94, 'holdings total');
  if (HOLDINGS.length !== 24) throw new Error(`Portfolio data mismatch: ${HOLDINGS.length} holdings, expected 24`);

  for (const [sector, expected] of Object.entries(EXPECTED_SECTOR_TOTALS_PCT)) {
    const actual = HOLDINGS.filter((item) => item.sector === sector).reduce((sum, item) => sum + item.weightPct, 0);
    assertClose(actual, expected, `${sector} sector`);
  }

  for (const [driver, expected] of Object.entries(EXPECTED_DRIVER_TOTALS_PCT)) {
    const actual = HOLDINGS.filter((item) => item.driverId === driver).reduce((sum, item) => sum + item.weightPct, 0);
    assertClose(actual, expected, `${driver} driver`);
  }

  const unsettled = HOLDINGS.flatMap((item) => item.states).filter((state): state is Extract<HoldingState, { kind: 'unsettled' }> => state.kind === 'unsettled');
  assertClose(unsettled.reduce((sum, state) => sum + state.soldValue, 0), 7.6 * CR, 'unsettled sales');
}

assertPortfolioData();
