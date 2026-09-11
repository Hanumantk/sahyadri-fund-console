import { useMemo, useState } from 'react';
import { DRIVERS, HOLDINGS, PORTFOLIO_CASH_PCT, PORTFOLIO_LIMITS, PORTFOLIO_SMALL_POSITION_PCT, PORTFOLIO_SUMMARY, type Holding } from '../../data/portfolio';
import { fmtPct } from '../../data/format';
import type { HoldingFilter } from './SummaryStrip';
import { GroupHeader } from './GroupHeader';
import { HoldingRow } from './HoldingRow';
import type { PortfolioView } from './ViewControl';

type SortKey = 'name' | 'price' | 'shares' | 'value' | 'weightPct' | 'unrealisedPnl' | 'daysToSell' | 'driver' | 'openedAt';
type SortDirection = 'ascending' | 'descending';

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean; title?: string }> = [
  { key: 'name', label: 'Holding' },
  { key: 'price', label: 'Price', numeric: true },
  { key: 'shares', label: 'Shares', numeric: true },
  { key: 'value', label: 'Value', numeric: true },
  { key: 'weightPct', label: '% of fund', numeric: true },
  { key: 'unrealisedPnl', label: 'Unrealised P&L', numeric: true },
  { key: 'daysToSell', label: 'Days to sell', numeric: true, title: 'Estimate assumes selling at normal daily volume' },
  { key: 'driver', label: 'Depends on' },
  { key: 'openedAt', label: 'Opened' },
];

interface HoldingGroup {
  id: string;
  name: string;
  holdings: Holding[];
}

export function HoldingsTable({
  view,
  ungrouped,
  filter,
  selectedTicker,
  fundValue,
  nowMs,
  onSelect,
}: {
  view: PortfolioView;
  ungrouped: boolean;
  filter: HoldingFilter | null;
  selectedTicker: string | null;
  fundValue: number;
  nowMs: number;
  onSelect: (holding: Holding) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('weightPct');
  const [sortDirection, setSortDirection] = useState<SortDirection>('descending');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const visible = useMemo(() => HOLDINGS.filter((item) => !filter || item.states.some((state) => state.kind === filter)), [filter]);
  const sorted = useMemo(() => sortHoldings(visible, sortKey, sortDirection), [visible, sortKey, sortDirection]);
  const groups = useMemo(() => makeGroups(sorted, view, ungrouped), [sorted, view, ungrouped]);
  const construction = HOLDINGS.filter((item) => item.driverId === 'construction');
  const constructionWeight = construction.reduce((sum, item) => sum + item.weightPct, 0);
  const constructionSectors = [...new Set(construction.map((item) => item.sector))].join(', ');

  const changeSort = (key: SortKey) => {
    if (key === sortKey) setSortDirection((current) => current === 'ascending' ? 'descending' : 'ascending');
    else {
      setSortKey(key);
      setSortDirection(key === 'name' || key === 'driver' || key === 'openedAt' ? 'ascending' : 'descending');
    }
  };

  return (
    <div className="holdings-wrap">
      <div className="holdings-sortbar">
        <label htmlFor="portfolio-sort">Sort cards by</label>
        <select id="portfolio-sort" value={sortKey} onChange={(event) => changeSort(event.target.value as SortKey)}>
          {COLUMNS.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
        </select>
        <button
          className="sort-direction"
          type="button"
          onClick={() => setSortDirection((current) => current === 'ascending' ? 'descending' : 'ascending')}
          aria-label={`Sort ${sortDirection === 'ascending' ? 'descending' : 'ascending'}`}
          title={`Currently sorted ${sortDirection}`}
        >
          <span aria-hidden="true">{sortDirection === 'ascending' ? '↑' : '↓'}</span>
          {sortDirection === 'ascending' ? 'Ascending' : 'Descending'}
        </button>
      </div>
      <ExposureMap view={view} ungrouped={ungrouped} filter={filter} />
      <div className="holdings-groups" aria-label="Current portfolio holdings">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.id);
          const showConstructionNote = !ungrouped && view === 'driver' && group.id === 'construction' && !isCollapsed;
          return (
            <section className="holding-group" key={group.id} aria-label={group.name}>
              {!ungrouped && (
                <GroupHeader
                  name={group.name}
                  holdings={group.holdings}
                  view={view}
                  collapsed={isCollapsed}
                  fundValue={fundValue}
                  onToggle={() => setCollapsed((current) => toggleSet(current, group.id))}
                />
              )}
              {showConstructionNote && (
                <aside className="driver-note-row">
                  <p>
                    Sector limits see these {construction.length} holdings as four different sectors ({constructionSectors}), each well within {fmtPct(PORTFOLIO_LIMITS.sectorPct, 0)}. All {construction.length} depend on construction and housing demand. Together they are {fmtPct(constructionWeight)} of the fund. If they were one sector, they would be {(constructionWeight - PORTFOLIO_LIMITS.sectorPct).toFixed(1)} points over the {fmtPct(PORTFOLIO_LIMITS.sectorPct, 0)} limit. No current rule watches a shared driver.
                  </p>
                  <span>Drivers tagged by Research Agent when each holding was bought · last reviewed by Risk Agent 1 Sep</span>
                </aside>
              )}
              {!isCollapsed && (
                <div className="holding-card-grid">
                  {group.holdings.map((item) => (
                    <HoldingRow
                      key={item.ticker}
                      holding={item}
                      fundValue={fundValue}
                      nowMs={nowMs}
                      selected={selectedTicker === item.ticker}
                      onSelect={() => onSelect(item)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ExposureMap({ view, ungrouped, filter }: { view: PortfolioView; ungrouped: boolean; filter: HoldingFilter | null }) {
  const source = filter ? HOLDINGS.filter((holding) => holding.states.some((state) => state.kind === filter)) : HOLDINGS;
  const ordered = sortHoldings(source, 'weightPct', 'descending');
  const exposures = ungrouped
    ? ordered.map((holding) => ({
        id: holding.ticker,
        label: holding.ticker,
        weight: holding.weightPct,
      }))
    : makeGroups(ordered, view, false).map((group) => ({
        id: group.id,
        label: group.name,
        weight: groupWeight(group),
      }));
  const legend = ungrouped ? exposures.filter((item) => item.weight >= PORTFOLIO_SMALL_POSITION_PCT) : exposures;
  const shownWeight = exposures.reduce((sum, item) => sum + item.weight, 0);
  const ariaText = exposures.map((item) => `${item.label} ${fmtPct(item.weight)}`).join(', ');

  return (
    <section className="exposure-map" aria-labelledby="exposure-map-title">
      <div className="exposure-map-head">
        <span>
          <h2 id="exposure-map-title">Capital map</h2>
          <p>{ungrouped ? 'Each block is a holding' : `Blocks are grouped by ${view === 'sector' ? 'sector' : 'shared driver'}`} · width is share of the fund</p>
        </span>
        <strong>{filter ? `${fmtPct(shownWeight)} shown` : `${fmtPct(PORTFOLIO_SUMMARY.investedPct, 0)} invested`}</strong>
      </div>
      <div className="exposure-track" role="img" aria-label={`${ariaText}${filter ? '' : `, Cash ${fmtPct(PORTFOLIO_CASH_PCT)}`}`}>
        {exposures.map((item, index) => (
          <span
            key={item.id}
            className={`exposure-segment tone-${index % 5}`}
            style={{ width: `${item.weight}%` }}
            title={`${item.label} · ${fmtPct(item.weight)}`}
          >
            {item.weight >= 5 && <span>{item.label}<strong>{fmtPct(item.weight)}</strong></span>}
          </span>
        ))}
        {!filter && <span className="exposure-segment cash" style={{ width: `${PORTFOLIO_CASH_PCT}%` }} title={`Cash · ${fmtPct(PORTFOLIO_CASH_PCT)}`} />}
      </div>
      <div className="exposure-legend" aria-hidden="true">
        {legend.map((item, index) => (
          <span key={item.id}>
            <i className={`tone-${index % 5}`} />{item.label} <strong>{fmtPct(item.weight)}</strong>
          </span>
        ))}
        {ungrouped && <span className="minor-positions">Plus {exposures.length - legend.length} positions below {fmtPct(PORTFOLIO_SMALL_POSITION_PCT)}</span>}
        {!filter && <span><i className="cash" />Cash <strong>{fmtPct(PORTFOLIO_CASH_PCT)}</strong></span>}
      </div>
    </section>
  );
}

function toggleSet(current: Set<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function makeGroups(holdings: Holding[], view: PortfolioView, ungrouped: boolean): HoldingGroup[] {
  if (ungrouped) return [{ id: 'all', name: 'All holdings', holdings }];
  const grouped = new Map<string, Holding[]>();
  for (const item of holdings) {
    const key = view === 'sector' ? item.sector : item.driverId;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return [...grouped.entries()]
    .map(([id, items]) => ({
      id,
      name: view === 'sector' ? id : DRIVERS.find((driver) => driver.id === id)?.name ?? id,
      holdings: items,
    }))
    .sort((a, b) => {
      if (view === 'driver' && a.id === 'independent') return 1;
      if (view === 'driver' && b.id === 'independent') return -1;
      return groupWeight(b) - groupWeight(a);
    });
}

function groupWeight(group: HoldingGroup): number {
  return group.holdings.reduce((sum, item) => sum + item.weightPct, 0);
}

function sortHoldings(holdings: Holding[], key: SortKey, direction: SortDirection): Holding[] {
  const multiplier = direction === 'ascending' ? 1 : -1;
  return [...holdings].sort((a, b) => {
    const left = sortValue(a, key);
    const right = sortValue(b, key);
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * multiplier;
    return String(left).localeCompare(String(right)) * multiplier;
  });
}

function sortValue(item: Holding, key: SortKey): string | number {
  if (key === 'driver') return DRIVERS.find((driver) => driver.id === item.driverId)?.name ?? item.driverId;
  return item[key];
}
