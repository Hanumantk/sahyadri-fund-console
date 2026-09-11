import { fmtCr, MINUS } from './format';
import { HOLDINGS } from './portfolio';
import { CR, FUND } from './scenario';

export type RiskStance = 'conservative' | 'neutral' | 'aggressive';
export type RuleValue = number | [number, number];
export type LimitUnit = 'percent' | 'days';
export type AutonomyBand = 'front' | 'middle' | 'back';
export type AutonomyColumn = 'alone' | 'human' | 'never';
export type ExceptionExpiryAction = 'force-trim' | 're-alert' | 'auto-revert';

export interface MandateRule {
  id: string;
  kind: 'invest' | 'never' | 'ceiling';
  label: string;
  text: string;
}

export interface RehearsalRow {
  date: string;
  company: string;
  sizePct: number;
  result: string;
}

export interface RehearsalResult {
  summary: string;
  rows: RehearsalRow[];
}

export interface Limit {
  id: string;
  label: string;
  unit: LimitUnit;
  setTo: RuleValue;
  currentlyAt: number | null;
  currentPrefix?: string;
  source: 'mandate' | 'internal';
  changedBy: string;
  changedOn: string;
  requiresCosign: boolean;
  description: string;
  defaults: Record<RiskStance, RuleValue>;
  wideningWhen: 'higher' | 'lower' | 'range-expands';
  rehearsal: RehearsalResult;
}

export interface AgentAutonomy {
  agent: string;
  band: AutonomyBand;
  mayDoAlone: string[];
  needsHuman: { action: string; who: string }[];
  never: string[];
  sizeThresholdPctOfFund: number | null;
}

export interface OverrideRule {
  id: string;
  subject: string;
  rule: string;
  detail: string;
}

export interface ProhibitedEntry {
  id: string;
  source: 'mandate' | 'compliance' | 'internal';
  label: string;
  entries: string[];
  hiddenCount?: number;
  access: 'locked' | 'hidden' | 'editable';
}

export interface EscalationRoute {
  id: string;
  event: string;
  recipient: string;
  channel: string;
  timing: string;
}

export interface ActiveException {
  id: string;
  subject: string;
  waivedLimit: number;
  raisedTo: number;
  grantedBy: string;
  grantedOn: string;
  expiresOn: string;
  expiresLabel: string;
  reason: string;
  atExpiry: ExceptionExpiryAction;
}

export interface ChangeEntry {
  id: string;
  date: string;
  actor: string;
  rule: string;
  from?: string;
  to?: string;
  reason?: string;
  limitId?: string;
}

export interface Rulebook {
  version: number;
  liveSince: string;
  fund: { name: string; baseCurrency: string; size: number; inceptionDate: string };
  mandate: MandateRule[];
  riskStance: RiskStance;
  limits: Limit[];
  agents: AgentAutonomy[];
  overrides: OverrideRule[];
  prohibited: ProhibitedEntry[];
  escalation: EscalationRoute[];
  exceptions: ActiveException[];
  history: ChangeEntry[];
}

export interface AutonomyLock {
  agent: string;
  action: string;
  column: AutonomyColumn;
  reason: string;
}

export const SAMPLE_DATA_LABEL = 'Sample data';
export const RULEBOOK_OWNER = 'Priya Nair';
export const RULEBOOK_TODAY = '11 Sep';
export const RULEBOOK_LIVE_DATE = '4 Sep';
export const RULEBOOK_INITIAL_VERSION = 14;
export const RULEBOOK_SETUP_STORAGE_KEY = 'sahyadri-fund-setup-complete';
export const RULEBOOK_LAST_CHANGED = 'Last changed 3 days ago by A. Sharma · single-name ceiling 8% → 10%';
export const RULEBOOK_EXCEPTION_SUMMARY = '1 exception active · expires Fri 12 Sep';
export const SETUP_STEPS = ['The fund', 'The mandate', 'Risk and limits', 'Agent autonomy', 'Escalation', 'Review and launch'] as const;
export const BASE_CURRENCIES = ['INR', 'USD', 'GBP'] as const;
export const COSIGNERS = ['Risk Manager', 'Fund Manager', 'Compliance Officer', 'Operations Lead'] as const;
export const HUMAN_ROLES = ['Fund Manager', 'Risk Manager', 'Compliance Officer', 'Operations'] as const;
export const ESCALATION_CHANNELS = ['in app, badge', 'in app + push', 'push', 'worklist, no alert'] as const;
export const ESCALATION_TIMINGS = ['standard queue', 'immediately', 'same day', 'no alert'] as const;
export const THRESHOLD_AGENTS = ['Portfolio Agent', 'Execution Agent'] as const;

export const RISK_STANCE_COPY: Record<RiskStance, { label: string; description: string }> = {
  conservative: { label: 'Conservative', description: 'Lower ceilings, tighter stops, more escalates to a human' },
  neutral: { label: 'Neutral', description: 'Balanced' },
  aggressive: { label: 'Aggressive', description: 'Higher ceilings, wider stops, more runs without asking' },
};

export const MANDATE_NOTICE = 'Once the fund launches, amending the mandate requires investor consent. It cannot be changed here.';
export const LIVE_MANDATE_NOTICE = 'Amending the mandate requires investor consent. Changes are not made in this product.';
export const ESCALATION_NOTE = 'You can change what reaches you later. A queue nobody reads is worse than no queue.';
export const LAUNCH_NOTE = 'Nothing is silently defaulted into a live fund.';
export const COMPLIANCE_OPACITY_NOTE = 'Compliance restrictions are not visible to the investment team.';

function holdingName(ticker: string): string {
  return HOLDINGS.find((holding) => holding.ticker === ticker)?.name ?? ticker;
}

const reliance = holdingName('RELIANCE');
const ultraTech = holdingName('ULTRACEMCO');
const hdfc = holdingName('HDFCBANK');
const icici = holdingName('ICICIBANK');
const dlf = holdingName('DLF');
const dixon = holdingName('DIXON');

const initialLimits: Limit[] = [
  {
    id: 'single-position', label: 'Single position', unit: 'percent', setTo: 8, currentlyAt: 6.2,
    source: 'mandate', changedBy: 'Risk', changedOn: '12 Aug', requiresCosign: false,
    description: 'max in one company', defaults: { conservative: 6, neutral: 8, aggressive: 10 }, wideningWhen: 'higher',
    rehearsal: {
      summary: 'Over the last 30 days this would have allowed 3 proposals that were blocked, and changed nothing else.',
      rows: [
        { date: '18 Aug', company: reliance, sizePct: 8.7, result: 'Blocked at the single-position ceiling' },
        { date: '27 Aug', company: hdfc, sizePct: 9.2, result: 'Reduced before execution' },
        { date: '6 Sep', company: ultraTech, sizePct: 9.6, result: 'Held for a human decision' },
      ],
    },
  },
  {
    id: 'sector', label: 'Sector', unit: 'percent', setTo: 25, currentlyAt: 21,
    source: 'internal', changedBy: 'Risk', changedOn: '12 Aug', requiresCosign: false,
    description: 'max in one industry', defaults: { conservative: 20, neutral: 25, aggressive: 30 }, wideningWhen: 'higher',
    rehearsal: { summary: 'This would have changed 1 Banking proposal and no completed trades.', rows: [{ date: '27 Aug', company: icici, sizePct: 2.1, result: 'Would have reached the wider sector ceiling' }] },
  },
  {
    id: 'gross-exposure', label: 'Gross exposure', unit: 'percent', setTo: 200, currentlyAt: 140,
    source: 'internal', changedBy: 'Risk', changedOn: '4 Jul', requiresCosign: false,
    description: 'all positions summed; caps leverage at 2x', defaults: { conservative: 150, neutral: 200, aggressive: 250 }, wideningWhen: 'higher',
    rehearsal: { summary: 'This would have changed nothing over the last 30 days.', rows: [] },
  },
  {
    id: 'net-exposure', label: 'Net exposure', unit: 'percent', setTo: [-20, 80], currentlyAt: 55, currentPrefix: '+',
    source: 'internal', changedBy: 'Risk', changedOn: '4 Jul', requiresCosign: false,
    description: 'permitted directional exposure range', defaults: { conservative: [-10, 60], neutral: [-20, 80], aggressive: [-30, 100] }, wideningWhen: 'range-expands',
    rehearsal: { summary: 'This would have changed 1 proposed hedge and no long positions.', rows: [{ date: '2 Sep', company: 'Index hedge', sizePct: -22, result: 'Stopped at the lower net-exposure bound' }] },
  },
  {
    id: 'daily-var', label: 'Daily Value at Risk', unit: 'percent', setTo: 2, currentlyAt: 1.5,
    source: 'internal', changedBy: 'Risk', changedOn: '4 Jul', requiresCosign: false,
    description: 'one-day Value at Risk ceiling', defaults: { conservative: 1.5, neutral: 2, aggressive: 3 }, wideningWhen: 'higher',
    rehearsal: { summary: 'This would have changed 2 morning risk escalations and no orders.', rows: [{ date: '22 Aug', company: 'Fund', sizePct: 2.2, result: 'Would have escalated before market open' }, { date: '5 Sep', company: 'Fund', sizePct: 2.1, result: 'Would have escalated before market open' }] },
  },
  {
    id: 'drawdown-soft', label: 'Drawdown soft', unit: 'percent', setTo: -10, currentlyAt: -3.1,
    source: 'internal', changedBy: 'Risk', changedOn: '4 Jul', requiresCosign: false,
    description: 'alert everyone', defaults: { conservative: -8, neutral: -10, aggressive: -12 }, wideningWhen: 'lower',
    rehearsal: { summary: 'This would have changed nothing over the last 30 days.', rows: [] },
  },
  {
    id: 'drawdown-hard', label: 'Drawdown hard stop', unit: 'percent', setTo: -15, currentlyAt: null,
    source: 'internal', changedBy: 'Risk Manager + Fund Manager', changedOn: '', requiresCosign: true,
    description: 'fund stops trading', defaults: { conservative: -12, neutral: -15, aggressive: -18 }, wideningWhen: 'lower',
    rehearsal: { summary: 'This would have changed nothing over the last 30 days; the hard stop never fired.', rows: [] },
  },
  {
    id: 'exit-within', label: 'Exit within', unit: 'days', setTo: 5, currentlyAt: 3, currentPrefix: 'max ',
    source: 'internal', changedBy: 'Risk', changedOn: '12 Aug', requiresCosign: false,
    description: 'at normal volume', defaults: { conservative: 3, neutral: 5, aggressive: 7 }, wideningWhen: 'higher',
    rehearsal: { summary: 'This would have changed 2 position-sizing decisions.', rows: [{ date: '19 Aug', company: dlf, sizePct: 3.4, result: 'Size reduced to keep the exit inside the limit' }, { date: '7 Sep', company: dixon, sizePct: 1.4, result: 'Sent to the Fund Manager for review' }] },
  },
  {
    id: 'stop-loss', label: 'Stop loss per name', unit: 'percent', setTo: -8, currentlyAt: null,
    source: 'internal', changedBy: 'Risk', changedOn: '12 Aug', requiresCosign: false,
    description: 'loss from the recorded entry price', defaults: { conservative: -6, neutral: -8, aggressive: -10 }, wideningWhen: 'lower',
    rehearsal: { summary: 'This would have changed 2 trim instructions and no new positions.', rows: [{ date: '24 Aug', company: 'Tech Mahindra', sizePct: -8.4, result: 'Trim instruction issued' }, { date: '8 Sep', company: 'Asian Paints', sizePct: -9.1, result: 'Trim instruction issued' }] },
  },
];

export const AUTONOMY_LOCKS: AutonomyLock[] = [
  { agent: 'Risk Agent', action: 'Reduce a proposed size', column: 'alone', reason: 'Risk may always reduce exposure; another approval would weaken the control.' },
  { agent: 'Risk Agent', action: 'Increase a proposed size', column: 'never', reason: 'Risk cannot create more exposure than Portfolio proposed.' },
  { agent: 'Compliance Agent', action: 'Block an order', column: 'alone', reason: 'A compliance control must be able to stop an order immediately.' },
  { agent: 'Compliance Agent', action: 'Unblock an order', column: 'human', reason: 'Only the Compliance Officer may lift a compliance block.' },
  { agent: 'Assurance Agent', action: 'Halt any agent', column: 'alone', reason: 'Assurance must be able to stop unsafe behaviour immediately.' },
  { agent: 'Assurance Agent', action: 'Resume a halted agent', column: 'never', reason: 'The agent that detects a problem cannot clear its own halt.' },
  { agent: 'Operations Agent', action: 'Authorise cash to move', column: 'never', reason: 'Cash movement remains a human-controlled authority.' },
];

const initialAgents: AgentAutonomy[] = [
  { agent: 'Research Agent', band: 'front', mayDoAlone: ['Screen filings', 'Build a research case', 'Drop a weak idea'], needsHuman: [{ action: 'Add an unapproved data source', who: 'Fund Manager' }], never: ['Place an order'], sizeThresholdPctOfFund: null },
  { agent: 'Portfolio Agent', band: 'front', mayDoAlone: ['Size a position inside its threshold', 'Trim a position to a limit'], needsHuman: [{ action: 'Size above its threshold', who: 'Fund Manager' }, { action: 'Request a temporary exception', who: 'Fund Manager' }], never: ['Override Risk', 'Override Compliance'], sizeThresholdPctOfFund: 3 },
  { agent: 'Execution Agent', band: 'front', mayDoAlone: ['Slice an approved order', 'Cancel an unfilled order'], needsHuman: [{ action: 'Route an order above its threshold', who: 'Fund Manager' }], never: ['Originate an investment idea', 'Authorise cash to move'], sizeThresholdPctOfFund: 2 },
  { agent: 'Risk Agent', band: 'middle', mayDoAlone: ['Reduce a proposed size', 'Reject a limit breach'], needsHuman: [{ action: 'Approve an exception', who: 'Risk Manager' }], never: ['Increase a proposed size', 'Lift a compliance block'], sizeThresholdPctOfFund: null },
  { agent: 'Compliance Agent', band: 'middle', mayDoAlone: ['Block an order', 'Refresh restricted-list checks'], needsHuman: [{ action: 'Unblock an order', who: 'Compliance Officer' }], never: ['Reveal a hidden restriction'], sizeThresholdPctOfFund: null },
  { agent: 'Assurance Agent', band: 'middle', mayDoAlone: ['Halt any agent', 'Open an assurance review'], needsHuman: [{ action: 'Close an assurance review', who: 'Fund Manager' }], never: ['Resume a halted agent'], sizeThresholdPctOfFund: null },
  { agent: 'Operations Agent', band: 'back', mayDoAlone: ['Match settled trades', 'Open a reconciliation break'], needsHuman: [{ action: 'Accept a broker-side correction', who: 'Operations' }], never: ['Authorise cash to move'], sizeThresholdPctOfFund: null },
];

export const INITIAL_RULEBOOK: Rulebook = {
  version: RULEBOOK_INITIAL_VERSION,
  liveSince: RULEBOOK_LIVE_DATE,
  fund: { name: FUND.name, baseCurrency: 'INR', size: 248.6 * CR, inceptionDate: '2025-09-04' },
  mandate: [
    { id: 'invests-in', kind: 'invest', label: 'We invest in', text: 'Indian listed equities, mid and large cap' },
    { id: 'never-invests-in', kind: 'never', label: 'We never invest in', text: 'Tobacco, defence' },
    { id: 'company-ceiling', kind: 'ceiling', label: 'Hard ceilings', text: 'Max 8% in any single company' },
    { id: 'cash-floor', kind: 'ceiling', label: 'Hard ceilings', text: 'Minimum 10% held as cash' },
  ],
  riskStance: 'conservative',
  limits: initialLimits,
  agents: initialAgents,
  overrides: [
    { id: 'risk-rejection', subject: 'Risk Agent rejection', rule: 'Fund Manager may override with a written reason.', detail: 'Risk Manager notified always. Above 5% of fund, Risk Manager must co-sign.' },
    { id: 'compliance-block', subject: 'Compliance block', rule: 'Compliance Officer only.', detail: 'Not the Fund Manager, at any size.' },
    { id: 'assurance-halt', subject: 'Assurance halt', rule: 'Any human may resume.', detail: 'No agent. No timer.' },
    { id: 'audit-record', subject: 'The audit record', rule: 'Nobody.', detail: 'It cannot be edited or overruled.' },
  ],
  prohibited: [
    { id: 'mandate-prohibited', source: 'mandate', label: 'From the mandate', entries: ['Tobacco', 'Defence'], access: 'locked' },
    { id: 'compliance-prohibited', source: 'compliance', label: 'From Compliance', entries: [], hiddenCount: 3, access: 'hidden' },
    { id: 'internal-prohibited', source: 'internal', label: 'Our own choice', entries: ['Adani Ports', 'Vedanta'], access: 'editable' },
  ],
  escalation: [
    { id: 'decision-needed', event: 'Decision needed', recipient: 'Fund Manager', channel: 'in app, badge', timing: 'standard queue' },
    { id: 'limit-breached', event: 'Limit breached', recipient: 'Risk Manager', channel: 'in app + push', timing: 'immediately' },
    { id: 'compliance-blocked', event: 'Compliance block', recipient: 'Compliance Officer', channel: 'in app + push', timing: 'immediately' },
    { id: 'anything-halted', event: 'Anything halted', recipient: 'all four', channel: 'push', timing: 'immediately' },
    { id: 'overdue-breaks', event: 'Overdue breaks', recipient: 'Operations', channel: 'worklist, no alert', timing: 'no alert' },
  ],
  exceptions: [
    { id: 'EXC-0912-01', subject: ultraTech, waivedLimit: 8, raisedTo: 10, grantedBy: 'R. Mehta', grantedOn: '9 Sep', expiresOn: '2026-09-12T23:59:00+05:30', expiresLabel: 'Fri 12 Sep', reason: 'expensive to trim into weak volume, expect natural decay', atExpiry: 'force-trim' },
  ],
  history: [
    { id: 'CHG-0909-01', date: '9 Sep', actor: 'A. Sharma', rule: 'single-name ceiling', from: '8%', to: '10%', reason: 'new strategy', limitId: 'single-position' },
    { id: 'CHG-0904-01', date: '4 Sep', actor: 'R. Mehta', rule: 'escalation routing changed' },
    { id: 'CHG-0812-01', date: '12 Aug', actor: 'R. Mehta', rule: 'sector limit', from: '30%', to: '25%', reason: 'concentration drift', limitId: 'sector' },
  ],
};

export const NEVER_FIRED_LIMIT_IDS = ['gross-exposure', 'daily-var', 'drawdown-hard', 'exit-within', 'stop-loss'];

export function cloneRulebook(): Rulebook {
  return structuredClone(INITIAL_RULEBOOK);
}

export function formatRuleValue(value: RuleValue, unit: LimitUnit): string {
  if (Array.isArray(value)) return `${signed(value[0])}% to ${signed(value[1])}%`;
  const formatted = value < 0 ? `${MINUS}${compact(Math.abs(value))}` : compact(value);
  return unit === 'days' ? `${formatted} days` : `${formatted}%`;
}

export function formatCurrentValue(limit: Limit): string {
  if (limit.currentlyAt === null) return '—';
  const formatted = formatRuleValue(limit.currentlyAt, limit.unit);
  return `${limit.currentPrefix ?? ''}${limit.unit === 'days' ? formatted.replace(' days', '') : formatted}`;
}

export function formatRupeeEquivalent(value: RuleValue, unit: LimitUnit, fundSize: number): string {
  if (unit === 'days') return 'Time-based · no rupee equivalent';
  if (Array.isArray(value)) return `${fmtCr((value[0] / 100) * fundSize)} to ${fmtCr((value[1] / 100) * fundSize)}`;
  return fmtCr((value / 100) * fundSize);
}

export function formatFundSize(fundSize: number): string {
  return fmtCr(fundSize).replace(' cr', ' Cr');
}

export function stanceDefault(limit: Limit, stance: RiskStance): RuleValue {
  return limit.defaults[stance];
}

export function valuesEqual(a: RuleValue, b: RuleValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a[0] === b[0] && a[1] === b[1];
  return !Array.isArray(a) && !Array.isArray(b) && a === b;
}

export function isWidening(limit: Limit, next: RuleValue): boolean {
  const current = limit.setTo;
  if (Array.isArray(current) && Array.isArray(next)) return next[0] < current[0] || next[1] > current[1];
  if (Array.isArray(current) || Array.isArray(next)) return true;
  return limit.wideningWhen === 'higher' ? next > current : next < current;
}

export function expiryActionLabel(action: ExceptionExpiryAction): string {
  if (action === 'force-trim') return 'position is force-trimmed to the normal ceiling';
  if (action === 're-alert') return 'the exception is re-alerted to the Fund Manager';
  return 'the waived limit automatically reverts';
}

export function formatExceptionCountdown(expiresOn: string, nowMs: number): string {
  const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(nowMs));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(dateParts.find((item) => item.type === type)?.value ?? 0);
  const today = Date.UTC(part('year'), part('month') - 1, part('day'));
  const [year, month, day] = expiresOn.slice(0, 10).split('-').map(Number);
  const expiry = Date.UTC(year, month - 1, day);
  const dayMs = 86_400_000;
  const days = Math.max(0, Math.round((expiry - today) / dayMs));
  return days === 0 ? 'expires today' : `${days} ${days === 1 ? 'day' : 'days'} left`;
}

export function reviewSentences(rulebook: Rulebook): Array<{ heading: string; sentences: string[] }> {
  const invest = rulebook.mandate.find((rule) => rule.kind === 'invest')?.text ?? '';
  const never = rulebook.mandate.find((rule) => rule.kind === 'never')?.text ?? '';
  const single = rulebook.limits.find((limit) => limit.id === 'single-position');
  const portfolio = rulebook.agents.find((agent) => agent.agent === 'Portfolio Agent');
  const risk = rulebook.agents.find((agent) => agent.agent === 'Risk Agent');
  const compliance = rulebook.agents.find((agent) => agent.agent === 'Compliance Agent');
  const limitSentence = single
    ? `No more than ${formatRuleValue(single.setTo, single.unit)} of the fund (${formatRupeeEquivalent(single.setTo, single.unit, rulebook.fund.size)}) may sit in one company.`
    : '';
  const threshold = portfolio?.sizeThresholdPctOfFund;
  const portfolioSentence = threshold === null || threshold === undefined
    ? 'The Portfolio Agent has no autonomous size threshold yet.'
    : `The Portfolio Agent may size positions up to ${formatRuleValue(threshold, 'percent')} (${formatRupeeEquivalent(threshold, 'percent', rulebook.fund.size)}) on its own.`;
  return [
    { heading: 'The fund and its promise', sentences: [`This fund invests in ${invest}.`, `It will never hold ${never}.`, limitSentence].filter(Boolean) },
    { heading: 'Risk and sizing', sentences: [portfolioSentence, 'Anything larger comes to the Fund Manager.', `The fund runs with a ${rulebook.riskStance} risk stance.`] },
    { heading: 'Agent authority', sentences: [
      risk?.mayDoAlone.includes('Reduce a proposed size') ? 'The Risk Agent can reduce any proposed size to zero and can never increase one.' : 'The Risk Agent authority still needs review.',
      compliance?.needsHuman.some((item) => item.action === 'Unblock an order') ? 'A compliance block can only be lifted by the Compliance Officer.' : 'The compliance unblock route still needs review.',
      'The audit record cannot be overruled by anyone.',
    ] },
    { heading: 'Escalation', sentences: rulebook.escalation.map((route) => `${route.event} goes to ${route.recipient} through ${route.channel}, ${route.timing}.`) },
  ];
}

export function autonomyLock(agent: string, action: string): AutonomyLock | undefined {
  return AUTONOMY_LOCKS.find((item) => item.agent === agent && item.action === action);
}

export function autonomyColumnLabel(column: AutonomyColumn): string {
  return column === 'alone' ? 'May do alone' : column === 'human' ? 'Needs a human' : 'Never';
}

export function bandLabel(band: AutonomyBand): string {
  return band === 'front' ? 'Front office' : band === 'middle' ? 'Middle office' : 'Back office';
}

export function signed(value: number): string {
  const absolute = compact(Math.abs(value));
  return value < 0 ? `${MINUS}${absolute}` : value > 0 ? `+${absolute}` : absolute;
}

function compact(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
