import { useEffect, useMemo, useState } from 'react';
import { HoldingDetailPanel } from '../components/portfolio/HoldingDetailPanel';
import { HoldingsTable } from '../components/portfolio/HoldingsTable';
import { SummaryStrip, type HoldingFilter } from '../components/portfolio/SummaryStrip';
import { ViewControl, type PortfolioView } from '../components/portfolio/ViewControl';
import { HOLDINGS } from '../data/portfolio';
import { useStore } from '../state/store';

const SUBTITLE = 'See where capital is concentrated, what can move together, and which positions need attention.';

export function Portfolio() {
  const { vm } = useStore();
  const [view, setView] = useState<PortfolioView>('sector');
  const [ungrouped, setUngrouped] = useState(false);
  const [filter, setFilter] = useState<HoldingFilter | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const selected = useMemo(() => HOLDINGS.find((item) => item.ticker === selectedTicker) ?? null, [selectedTicker]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedTicker) setSelectedTicker(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedTicker]);

  return (
    <div className="page portfolio-page">
      <div className="portfolio-title-row">
        <h1 className="page-title">Portfolio</h1>
        <span className="sample-label">Sample data</span>
      </div>
      <div className="portfolio-scroll">
        <p className="page-sub">{SUBTITLE}</p>
        <SummaryStrip
          filter={filter}
          onFilter={(next) => {
            setFilter(next);
            setSelectedTicker(null);
          }}
        />
        <ViewControl view={view} ungrouped={ungrouped} onView={setView} onUngrouped={setUngrouped} />
        <div className={`portfolio-workspace${selected ? ' detail-open' : ''}`}>
          <HoldingsTable
            view={view}
            ungrouped={ungrouped}
            filter={filter}
            selectedTicker={selectedTicker}
            fundValue={vm.fund.fundValue}
            nowMs={vm.nowMs}
            onSelect={(holding) => setSelectedTicker((current) => current === holding.ticker ? null : holding.ticker)}
          />
          {selected && <HoldingDetailPanel holding={selected} onClose={() => setSelectedTicker(null)} />}
        </div>
      </div>
    </div>
  );
}
