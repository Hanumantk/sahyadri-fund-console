export type PortfolioView = 'sector' | 'driver';

export function ViewControl({ view, ungrouped, onView, onUngrouped }: { view: PortfolioView; ungrouped: boolean; onView: (view: PortfolioView) => void; onUngrouped: (value: boolean) => void }) {
  return (
    <div className="portfolio-controls">
      <div className="segmented" aria-label="Group holdings" role="group">
        <button className={view === 'sector' ? 'selected' : ''} aria-pressed={view === 'sector'} onClick={() => onView('sector')}>
          By sector
        </button>
        <button className={view === 'driver' ? 'selected' : ''} aria-pressed={view === 'driver'} onClick={() => onView('driver')}>
          By what it depends on
        </button>
      </div>
      <button className="ungrouped-toggle" aria-pressed={ungrouped} onClick={() => onUngrouped(!ungrouped)}>
        <span className="toggle-box" aria-hidden="true">{ungrouped ? '✓' : ''}</span>
        Show all holdings, ungrouped
      </button>
    </div>
  );
}
