import { MARKET_OPEN_MS } from '../../data/clock';
import { fmtAge, fmtTime, fmtTimeSec } from '../../data/format';
import { useStore } from '../../state/store';
import { RecordLink, Section } from '../ui/bits';

export function MonitorHome() {
  const { vm } = useStore();
  return (
    <>
      {/* One line per feed. The vendor is provenance for the audit trail and
          the agent's own panel, not something a glance at Home decides with. A
          live feed says so by its age; only a late one gets the word, in amber.

          There is no "Agents it watches" list any more. It showed the same six
          agents as the row directly above it, with the same status. The one
          thing it added — each agent's last action time — is in the top bar
          for the most recent and on every agent's panel for the rest. */}
      <Section title={`Feeds · ${vm.health.live} of ${vm.health.total} live · checked ${fmtTimeSec(vm.health.checkedMs)}`}>
        <div className="list feeds">
          {vm.feeds.map((f) => (
            <div className="list-row" key={f.id}>
              <span className="l">{f.name}</span>
              <span className="r">
                {f.late ? <span className="is-late">{Math.floor(f.ageSec / 60)} min late</span> : <span className="sub">{fmtAge(f.lastUpdatedMs, vm.nowMs)} ago</span>}
              </span>
            </div>
          ))}
        </div>
      </Section>
      <Section title={`Flagged since ${fmtTime(MARKET_OPEN_MS)}`}>
        {vm.monitorFlags.length === 0 ? (
          <div className="list">
            <div className="list-row">
              <span className="l">Nothing flagged. Every feed has stayed inside its cadence and no agent has gone quiet.</span>
            </div>
          </div>
        ) : (
          <div className="list">
            {vm.monitorFlags.map((fl) => (
              <div className="list-row" key={fl.id}>
                <span className="l">
                  {fl.text}
                  <br />
                  <span className="sub">
                    <RecordLink id={fl.id} />
                  </span>
                </span>
                <span className="r">
                  {fl.kind === 'late' && 'late'}
                  {fl.kind === 'recovered' && 'recovered'}
                  {fl.kind === 'paused' && 'paused agents'}
                  {fl.kind === 'limit' && 'over limit'}
                  {fl.kind === 'break' && 'mismatch'}
                  <br />
                  <span className="sub">{fmtTime(fl.atMs)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="Pipeline today, from the record">
        <div className="list">
          <div className="list-row">
            <span className="l">
              {vm.pipeline.found} ideas found − {vm.pipeline.dropped} dropped = {vm.pipeline.sized} sized · {vm.pipeline.sized} sized + {vm.pipeline.trims} trims = {vm.pipeline.checked} checked by Risk ·{' '}
              {vm.pipeline.checked} checked = {vm.pipeline.cleared} cleared + {vm.pipeline.sent} sent to you + {vm.pipeline.riskBlocked} blocked · Compliance blocked {vm.pipeline.complianceBlocked} ·{' '}
              {vm.pipeline.ordersPlaced} orders placed = {vm.pipeline.autoCleared} auto-cleared + {vm.pipeline.humanApproved} approved by you ·{' '}
              <RecordLink id="EVT-0001">see the record</RecordLink>
            </span>
          </div>
        </div>
      </Section>
    </>
  );
}
