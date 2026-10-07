import { useState } from 'react';
import type { QueueItem, TrimTo } from '../../data/derive';
import { fmtAge, fmtCr, fmtPct, fmtTime } from '../../data/format';
import type { AgentId } from '../../data/scenario';
import { useStore } from '../../state/store';
import { Badge, RecordLink, Section } from '../ui/bits';
import { Icon } from '../ui/Icon';
import { ExceptionInForce, OverrideForm, OwnInstructionBox, ReasonAction } from './OverrideControls';

/** Late feed or broken limit: a fixed layout with the facts and the record, no decision buttons. */
export function AttentionView({ item }: { item: QueueItem }) {
  const { vm, limitException, trim } = useStore();
  const [trimTo, setTrimTo] = useState<TrimTo>('limit');
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
        <ResumeHalted ids={feed.dependents.filter((a) => vm.agents[a].haltedByAgent)} />
        <OwnInstructionBox item={item} />
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
  const lo = vm.limitOverrides.find((l) => l.itemId === item.id) ?? null;
  const plan = lo ? lo.trims.find((t) => t.to === trimTo) ?? lo.trims[0] ?? null : null;
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
            Agents can't add to {row.name.replace(' sector', '')} until it is back inside the limit. Nothing is forced to sell. You can trim it back now, or hold it on exception until the close. Raising the limit itself is a rule change on Rules.
          </div>
        </Section>
      </div>
      {lo && lo.exception ? (
        <ExceptionInForce
          ex={lo.exception}
          subject={`${row.name} stays broken on the record and agents still may not add to it. ${lo.expiryLine}.`}
        />
      ) : (
        lo && (
          <>
            {/* Restraint first: it needs only a reason, and it is the answer that
                makes the breach go away rather than carrying it. */}
            {plan && (
              <div className="decide override-form">
                <div className="section-title">Trim it back inside · needs only a reason</div>
                {lo.trims.length > 1 && (
                  <div className="buttons">
                    {lo.trims.map((t) => (
                      <button key={t.to} className={`btn${plan.to === t.to ? ' selected' : ''}`} onClick={() => setTrimTo(t.to)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="override-copy">{plan.line}.</div>
                <ReasonAction
                  placeholder="Reason to trim, for the record"
                  label={`Sell ${fmtCr(plan.amount)} of ${plan.company}`}
                  icon="minus"
                  onConfirm={(reason) => trim(lo.key, reason, plan.to)}
                  note="The Portfolio Agent may trim to a limit on its own. This tells it to, now. Nothing lapses."
                />
              </div>
            )}
            <OverrideForm
              authority={lo}
              subjectKey={lo.key}
              title="Or hold it on exception · until the close"
              confirmLabel={`Hold ${row.name} on exception`}
              onConfirm={(reason, cosigner) => limitException(lo.key, reason, cosigner)}
            />
          </>
        )
      )}
      {item.status === 'open' && <OwnInstructionBox item={item} />}
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

/**
 * The agents a late feed halted, resumable from the panel that explains why they
 * stopped. Each resume is an overrule of the Monitoring Agent and is logged as one.
 */
function ResumeHalted({ ids }: { ids: AgentId[] }) {
  const { vm, resumeAgent } = useStore();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  if (ids.length === 0) return null;
  const go = (list: AgentId[]) => {
    if (!reason.trim()) return setErr('Add a one-line reason. It goes into the record.');
    try {
      for (const id of list) resumeAgent(id, reason);
      setReason('');
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="decide override-form">
      <div className="section-title">Resume them anyway · overrules the Monitoring Agent</div>
      <div className="override-copy">{vm.agents[ids[0]].haltRule} The feed will still be late after you do.</div>
      <div className="reason">
        <input
          placeholder="One-line reason, required. It goes into the record."
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setErr('');
          }}
        />
        {err && <div className="err">{err}</div>}
      </div>
      <div className="confirm-row">
        {ids.map((id) => (
          <button key={id} className="btn" onClick={() => go([id])}>
            <Icon name="play" />
            Resume {vm.agents[id].name}
          </button>
        ))}
        {ids.length > 1 && (
          <button className="btn primary" onClick={() => go(ids)}>
            <Icon name="play" />
            Resume all {ids.length}
          </button>
        )}
      </div>
    </div>
  );
}
