import { fmtCr, fmtDayMonth, fmtPct, fmtPoints, fmtSignedPct } from '../../data/format';
import { PORTFOLIO_SUMMARY } from '../../data/portfolio';
import { useStore } from '../../state/store';

export type HoldingFilter = 'buying' | 'unsettled' | 'stale_price' | 'records_disagree';

const FILTER_LABELS: Record<HoldingFilter, string> = {
  buying: 'Buying',
  unsettled: 'Unsettled',
  stale_price: 'Stale price',
  records_disagree: 'Records mismatch',
};

export function SummaryStrip({ filter, onFilter }: { filter: HoldingFilter | null; onFilter: (next: HoldingFilter | null) => void }) {
  const { vm } = useStore();
  const fund = vm.fund;
  const investedValue = (PORTFOLIO_SUMMARY.investedPct / 100) * fund.fundValue;
  const shortcuts: Array<{ key: HoldingFilter; count: number; label: string }> = [
    { key: 'buying', count: PORTFOLIO_SUMMARY.buyingCount, label: 'buying' },
    { key: 'unsettled', count: PORTFOLIO_SUMMARY.unsettledCount, label: 'unsettled' },
    { key: 'stale_price', count: PORTFOLIO_SUMMARY.staleCount, label: 'stale price' },
    { key: 'records_disagree', count: PORTFOLIO_SUMMARY.mismatchCount, label: 'records mismatch' },
  ];

  return (
    <section className="portfolio-summary" aria-label="Portfolio summary">
      <div className="summary-primary">
        <span className="summary-label">Fund value</span>
        <strong className="summary-hero-value">{fmtCr(fund.fundValue)}</strong>
        <span className="summary-day-change">{fmtSignedPct(fund.dayChangePct)} today</span>
        <div className="summary-benchmarks">
          <SummaryItem label="vs Nifty 50" value={fmtPoints(fund.gapPts)} sub={`Nifty ${fmtSignedPct(fund.benchmarkPct)}`} />
          <SummaryItem label="Drawdown" value={fmtPct(fund.drawdownPct)} sub={`from peak ${fmtDayMonth(fund.peak.dateMs)}`} />
        </div>
      </div>
      <div className="summary-capital">
        <div className="summary-capital-head">
          <span>
            <span className="summary-label">Capital deployed</span>
            <strong>{fmtPct(PORTFOLIO_SUMMARY.investedPct)}</strong>
          </span>
          <span className="summary-capital-note">{fmtCr(investedValue)} across {PORTFOLIO_SUMMARY.holdingsCount} holdings</span>
        </div>
        <div className="capital-split" role="img" aria-label={`${fmtPct(PORTFOLIO_SUMMARY.investedPct)} invested and ${fmtPct(fund.cashPct)} cash`}>
          <span className="capital-invested" style={{ width: `${PORTFOLIO_SUMMARY.investedPct}%` }} />
          <span className="capital-cash" style={{ width: `${fund.cashPct}%` }} />
        </div>
        <div className="capital-labels">
          <span><i className="capital-key invested" />Invested <strong>{fmtPct(PORTFOLIO_SUMMARY.investedPct)}</strong></span>
          <span><i className="capital-key cash" />Cash <strong>{fmtPct(fund.cashPct)}</strong> · {fmtCr(fund.spendableCash)} spendable</span>
        </div>
        <div className="limit-signal">
          <span className="limit-signal-count">{vm.limits.broken.length}</span>
          <span><strong>broken limits</strong><small>{vm.limits.near.length} near · {PORTFOLIO_SUMMARY.exceptionCount} on exception</small></span>
        </div>
      </div>
      <div className="summary-filters" aria-label="Filter holdings by data state">
        {shortcuts.map((item) => (
          <button key={item.key} className="summary-filter-link" onClick={() => onFilter(filter === item.key ? null : item.key)} aria-pressed={filter === item.key}>
            <strong>{item.count}</strong>
            <span>{item.label}</span>
          </button>
        ))}
        {filter && (
          <button className="showing-pill" onClick={() => onFilter(null)} aria-label={`Clear ${FILTER_LABELS[filter]} filter`}>
            Showing: {FILTER_LABELS[filter]} <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
    </section>
  );
}

function SummaryItem({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="summary-item">
      <span className="summary-label">{label}</span>
      <strong className="summary-value">{value}</strong>
      <span className="summary-sub">{sub}</span>
    </div>
  );
}
