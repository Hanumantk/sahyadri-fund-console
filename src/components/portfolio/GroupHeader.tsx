import { fmtCr, fmtPct } from '../../data/format';
import { PORTFOLIO_LIMITS, type Holding } from '../../data/portfolio';
import { HeadroomBar } from './HeadroomBar';
import type { PortfolioView } from './ViewControl';

export function GroupHeader({
  name,
  holdings,
  view,
  collapsed,
  fundValue,
  onToggle,
}: {
  name: string;
  holdings: Holding[];
  view: PortfolioView;
  collapsed: boolean;
  fundValue: number;
  onToggle: () => void;
}) {
  const weight = holdings.reduce((sum, item) => sum + item.weightPct, 0);
  const value = (weight / 100) * fundValue;
  const room = ((PORTFOLIO_LIMITS.sectorPct - weight) / 100) * fundValue;
  const countLabel = holdings.length === 1 ? 'holding' : 'holdings';
  const isIndependent = view === 'driver' && name === 'Independent';

  return (
    <div className={`group-row${isIndependent ? ' independent' : ''}`}>
      <button className="group-toggle" onClick={onToggle} aria-expanded={!collapsed}>
        <span className="group-chevron" aria-hidden="true">{collapsed ? '›' : '⌄'}</span>
        <span className="group-name">{name.toUpperCase()}</span>
        <span className="group-meta">
          {holdings.length} {countLabel} · {fmtCr(value)} · {fmtPct(weight)}
          {view === 'sector' && ` of ${fmtPct(PORTFOLIO_LIMITS.sectorPct, 0)} · ${fmtCr(Math.max(0, room))} room`}
        </span>
        {view === 'sector' && <HeadroomBar valuePct={weight} limitPct={PORTFOLIO_LIMITS.sectorPct} />}
      </button>
    </div>
  );
}
