import { dateMs, fmtAge, fmtCr, fmtDate, fmtDayMonth, fmtInt, fmtPct, fmtPriceCompact, fmtSignedCr, fmtSignedPct, fmtTime } from '../../data/format';
import { DRIVERS, PORTFOLIO_LIMITS, PORTFOLIO_PERCENT_SCALE, type Holding } from '../../data/portfolio';
import { istParts, ms } from '../../data/clock';
import { StatePill } from './StatePill';

export function HoldingRow({
  holding,
  fundValue,
  nowMs,
  selected,
  onSelect,
}: {
  holding: Holding;
  fundValue: number;
  nowMs: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const stale = holding.states.find((state) => state.kind === 'stale_price');
  const buying = holding.states.find((state) => state.kind === 'buying');
  const mismatch = holding.states.find((state) => state.kind === 'records_disagree');
  const driver = DRIVERS.find((item) => item.id === holding.driverId)?.name ?? 'Independent';
  const openedMs = dateMs(holding.openedAt);
  const openedDate = istParts(openedMs).year === istParts(nowMs).year ? fmtDayMonth(openedMs) : fmtDate(openedMs);
  const limitRatio = Math.min(holding.weightPct / PORTFOLIO_LIMITS.holdingPct, 1);
  const gaugeViewBox = `0 0 ${PORTFOLIO_PERCENT_SCALE} ${PORTFOLIO_PERCENT_SCALE}`;
  const gaugeCircumference = 2 * Math.PI * 38;
  const pnlWidth = Math.min(Math.abs(holding.unrealisedPnlPct) / 25, 1) * 50;
  const pnlLeft = holding.unrealisedPnlPct >= 0 ? 50 : 50 - pnlWidth;
  const liquidityWidth = Math.max(4, Math.min(holding.daysToSell / 4, 1) * 100);
  const daysLabel = holding.daysToSell < 1 ? 'Under 1 day' : `${Number.isInteger(holding.daysToSell) ? holding.daysToSell : holding.daysToSell.toFixed(1)} days`;

  return (
    <article
      className={`holding-card${selected ? ' selected' : ''}`}
      tabIndex={0}
      role="button"
      aria-label={`Open ${holding.name} holding details`}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const cards = [...(event.currentTarget.closest('.holdings-wrap')?.querySelectorAll<HTMLElement>('.holding-card') ?? [])];
          const index = cards.indexOf(event.currentTarget);
          const next = event.key === 'ArrowDown' ? Math.min(cards.length - 1, index + 1) : Math.max(0, index - 1);
          cards[next]?.focus();
        }
      }}
    >
      <header className="holding-card-head">
        <span>
          <span className="holding-ticker">{holding.ticker} · {holding.sector}</span>
          <span className="holding-name">{holding.name}</span>
        </span>
        <span className="holding-card-value">
          <strong>{fmtCr(holding.value)}{stale ? ' est.' : ''}</strong>
          <span>{fmtPct(holding.weightPct)} of fund</span>
        </span>
      </header>
      {holding.states.length > 0 && (
        <span className="holding-states">
          {holding.states.map((state, index) => (
            <StatePill key={`${state.kind}-${index}`} state={state} holding={holding} fundValue={fundValue} />
          ))}
        </span>
      )}
      <div className="holding-signal-plane">
        <span className={`weight-gauge${holding.weightPct > PORTFOLIO_LIMITS.holdingPct ? ' over' : ''}`} role="img" aria-label={`${fmtPct(holding.weightPct)} portfolio weight against a ${fmtPct(PORTFOLIO_LIMITS.holdingPct, 0)} limit`}>
          <svg viewBox={gaugeViewBox} aria-hidden="true">
            <circle className="weight-gauge-track" cx="50" cy="50" r="38" />
            <circle
              className="weight-gauge-fill"
              cx="50"
              cy="50"
              r="38"
              strokeDasharray={gaugeCircumference}
              strokeDashoffset={gaugeCircumference * (1 - limitRatio)}
            />
          </svg>
          <span className="weight-gauge-value"><strong>{fmtPct(holding.weightPct)}</strong><small>of {fmtPct(PORTFOLIO_LIMITS.holdingPct, 0)}</small></span>
        </span>
        <span className="signal-bars">
          <span className="signal-block">
            <span className="signal-label"><span>P&amp;L since open</span><strong>{fmtSignedPct(holding.unrealisedPnlPct, 1)}</strong></span>
            <span className="pnl-track" role="img" aria-label={`${fmtSignedPct(holding.unrealisedPnlPct, 1)} unrealised return`}>
              <i className={holding.unrealisedPnlPct >= 0 ? 'positive' : 'negative'} style={{ left: `${pnlLeft}%`, width: `${pnlWidth}%` }} />
              <b aria-hidden="true" />
            </span>
            <span className="signal-detail">{fmtSignedCr(holding.unrealisedPnl, 2)} unrealised · {fmtSignedCr(holding.realisedPnl, 2)} realised</span>
          </span>
          <span className="signal-block">
            <span className="signal-label"><span>Exit estimate</span><strong>{daysLabel}</strong></span>
            <span className="liquidity-track" role="img" aria-label={`${daysLabel} to sell on a four day scale`}>
              <i style={{ width: `${liquidityWidth}%` }} />
              <b className="day-one" aria-hidden="true" />
              <b className="day-three" aria-hidden="true" />
            </span>
            <span className="liquidity-axis"><span>same day</span><span>4+ days</span></span>
          </span>
        </span>
      </div>
      <div className="holding-card-metrics">
        <span className="holding-metric price-cell">
          <small>Price</small>
          <strong>{fmtPriceCompact(holding.price)}{stale ? ` · ${fmtAge(ms(stale.updatedAt), nowMs)} old` : ''}</strong>
          {stale && <span className="cell-sub">No NSE trade since {fmtTime(ms(stale.updatedAt))}</span>}
        </span>
        <span className="holding-metric shares-cell">
          <small>Shares</small>
          <strong>{mismatch ? `${fmtInt(mismatch.ourShares)} ours · ${fmtInt(mismatch.brokerShares)} broker` : fmtInt(holding.shares)}</strong>
        </span>
      </div>
      {buying && <span className="buying-progress">Target weight when complete: <strong>{fmtPct(buying.targetPct)}</strong></span>}
      <footer className="holding-card-foot">
        <span><small>Depends on</small>{driver}</span>
        <span><small>Opened</small>{openedDate} · {holding.openedBy}{holding.openedNote ? ` · ${holding.openedNote}` : ''}</span>
      </footer>
    </article>
  );
}
