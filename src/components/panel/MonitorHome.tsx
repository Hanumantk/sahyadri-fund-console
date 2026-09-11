import { MARKET_OPEN_MS } from '../../data/clock';
import { fmtAge, fmtTime, fmtTimeSec } from '../../data/format';
import { useStore } from '../../state/store';
import { RecordLink, Section } from '../ui/bits';

export function MonitorHome() {
  const { vm, select } = useStore();
  return (
    <>
      {/* What the agent watches is the two headings below, so saying it here as
          well cost two lines at the top of the panel. What is left is the part
          that cannot be seen anywhere else: when it last ran, and what catches
          it if it stops. */}
      <div className="panel-desc">
        Last check {fmtTimeSec(vm.health.checkedMs)} · checks every 30 seconds · a plain heartbeat outside the agent raises "Monitor not responding" if a check is missed.
      </div>
      <div className="panel-cols">
        <Section title={`Feeds · ${vm.health.live} of ${vm.health.total} live`}>
          <div className="list">
            {vm.feeds.map((f) => (
              <div className="list-row" key={f.id}>
                <span className="l">
                  {f.name}
                  <br />
                  <span className="sub">{f.vendor}</span>
                </span>
                <span className="r">
                  {f.late ? `${Math.floor(f.ageSec / 60)} min late` : 'live'}
                  <br />
                  <span className="sub">
                    updated {fmtTime(f.lastUpdatedMs)} · {fmtAge(f.lastUpdatedMs, vm.nowMs)} ago
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Agents it watches">
          <div className="list">
            {vm.agentRow.map((a) => (
              <div className="list-row" key={a.id} style={{ cursor: 'pointer' }} onClick={() => select({ kind: 'agent', id: a.id })}>
                <span className="l">
                  {a.name}
                  <br />
                  <span className="sub">{a.lastActionMs ? `last action ${fmtTime(a.lastActionMs)} · ${fmtAge(a.lastActionMs, vm.nowMs)} ago` : 'no action yet today'}</span>
                </span>
                <span className="r">{a.status}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
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
