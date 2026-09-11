import type { QueueItem } from '../../data/derive';
import { fmtAge, fmtCr, fmtPct, fmtTime } from '../../data/format';
import { useStore } from '../../state/store';
import { Badge, RecordLink, Section } from '../ui/bits';

/** Late feed or broken limit: a fixed layout with the facts and the record, no decision buttons. */
export function AttentionView({ item }: { item: QueueItem }) {
  const { vm } = useStore();
  if (item.kind === 'feed') {
    const feed = vm.feeds.find((f) => `FEED-${f.id.toUpperCase()}` === item.id)!;
    const flag = vm.monitorFlags.find((f) => f.kind === 'paused') ?? vm.monitorFlags.find((f) => f.kind === 'late');
    return (
      <>
        <div className="section">
          <div className="ask-line">{item.ask}</div>
          <div className="why-line">{item.byLine}</div>
        </div>
        <div className="panel-cols">
          <Section title="The feed">
            <div className="card">
              <div className="list">
                <div className="list-row">
                  <span className="l">Vendor</span>
                  <span className="r">{feed.vendor}</span>
                </div>
                <div className="list-row">
                  <span className="l">Last update</span>
                  <span className="r">
                    {fmtTime(feed.lastUpdatedMs)} · {fmtAge(feed.lastUpdatedMs, vm.nowMs)} ago
                  </span>
                </div>
                <div className="list-row">
                  <span className="l">Expected every</span>
                  <span className="r">{Math.round(feed.expectedEverySec / 60)} min</span>
                </div>
              </div>
            </div>
          </Section>
          <Section title="What the Monitoring Agent did">
            <div className="card" style={{ fontSize: 'var(--fs-12)', lineHeight: 1.5 }}>
              {feed.dependents.map((a) => (
                <div key={a} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
                  <span>{vm.agents[a].name}</span>
                  <Badge tone={vm.agents[a].status === 'Paused' ? 'red' : vm.agents[a].status === 'Throttled' ? 'amber' : 'outline'}>{vm.agents[a].status}</Badge>
                </div>
              ))}
              <div className="faint" style={{ marginTop: 6 }}>
                Standing rule: agents that depend on a feed stale for 10 min are paused until it recovers. The Monitoring Agent cannot trade, change a rule or undo a decision.
              </div>
            </div>
          </Section>
        </div>
        <Section title="Numbers built on this feed">
          <div className="card" style={{ fontSize: 'var(--fs-12)', color: 'var(--text-2)' }}>
            Fund value {fmtCr(vm.fund.fundValue)}, value per unit, drawdown {fmtPct(vm.fund.drawdownPct)} and every limit are shown grey with their measured time ({fmtTime(vm.fund.measuredAtMs)}). Cash and order counts come from the orders feed, which is live.
          </div>
        </Section>
        {flag && (
          <div style={{ fontSize: 'var(--fs-12)' }}>
            <RecordLink id={flag.id}>Open the Audit trail at {flag.id}</RecordLink>
          </div>
        )}
      </>
    );
  }

  const row = vm.limits.broken.find((r) => `LIMIT-${r.key.replace(':', '-').toUpperCase()}` === item.id)!;
  const ev = vm.monitorFlags.find((f) => f.kind === 'limit');
  const members = row.kind === 'sector' ? vm.fund.holdings.filter((h) => `${h.sector} sector` === row.name && h.shares > 0) : [];
  return (
    <>
      <div className="section">
        <div className="ask-line">{item.ask}</div>
        <div className="why-line">{item.byLine}</div>
      </div>
      <div className="panel-cols">
        <Section title="The limit">
          <div className="card">
            <div className="list">
              <div className="list-row">
                <span className="l">Now</span>
                <span className="r" style={{ color: 'var(--red)' }}>
                  {fmtPct(row.pct)} of fund
                </span>
              </div>
              <div className="list-row">
                <span className="l">Limit</span>
                <span className="r">{fmtPct(row.limitPct, 0)}</span>
              </div>
              <div className="list-row">
                <span className="l">Over by</span>
                <span className="r">{fmtCr(-row.headroom)}</span>
              </div>
              <div className="list-row">
                <span className="l">Cause</span>
                <span className="r">price rise, not a trade</span>
              </div>
            </div>
          </div>
        </Section>
        <Section title="What it means">
          <div className="card" style={{ fontSize: 'var(--fs-12)', lineHeight: 1.5, color: 'var(--text-2)' }}>
            Agents can't add to {row.name.replace(' sector', '')} until it is back inside the limit. Nothing is forced to sell. Your options are to leave it, ask the Portfolio Agent for a trim, or raise the limit on Rules, which is a logged rule change.
          </div>
        </Section>
      </div>
      {members.length > 0 && (
        <Section title="Holdings in this sector">
          <div className="card">
            <div className="list">
              {members.map((h) => (
                <div className="list-row" key={h.ticker}>
                  <span className="l">{h.company}</span>
                  <span className="r">
                    {fmtCr(h.value)} · {fmtPct(h.pct)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}
      {ev && (
        <div style={{ fontSize: 'var(--fs-12)' }}>
          <RecordLink id={ev.id}>Open the Audit trail at {ev.id}</RecordLink>
        </div>
      )}
    </>
  );
}
