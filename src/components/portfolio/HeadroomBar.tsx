import { PORTFOLIO_LIMITS, PORTFOLIO_PERCENT_SCALE } from '../../data/portfolio';
import { fmtPct } from '../../data/format';

export function HeadroomBar({ valuePct, limitPct }: { valuePct: number; limitPct: number }) {
  const scalePct = limitPct * 1.1;
  const fillPct = Math.min((valuePct / scalePct) * PORTFOLIO_PERCENT_SCALE, PORTFOLIO_PERCENT_SCALE);
  const tickPct = (limitPct / scalePct) * PORTFOLIO_PERCENT_SCALE;
  const usedPct = (valuePct / limitPct) * PORTFOLIO_PERCENT_SCALE;
  const tone = valuePct > limitPct ? 'over' : usedPct > PORTFOLIO_LIMITS.nearThresholdPct ? 'near' : 'ok';

  return (
    <span
      className={`headroom-bar ${tone}`}
      role="img"
      aria-label={`${fmtPct(valuePct)} against a ${fmtPct(limitPct, 0)} limit`}
    >
      <i className="headroom-fill" style={{ width: `${fillPct}%` }} />
      <i className="headroom-tick" style={{ left: `${tickPct}%` }} />
    </span>
  );
}
