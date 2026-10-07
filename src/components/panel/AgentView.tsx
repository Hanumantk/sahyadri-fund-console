import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AgentFigure, GrantedException } from '../../data/derive';
import { ORDER_STOP_NOTE, limitItemId } from '../../data/derive';
import type { Selection } from '../../state/store';
import { fmtAge, fmtCr, fmtTime } from '../../data/format';
import { CR } from '../../data/scenario';
import { useStore } from '../../state/store';
import { Badge, RecordLink, Section } from '../ui/bits';
import { Icon } from '../ui/Icon';
import { ReasonAction } from './OverrideControls';

export function AgentView({ agent: a }: { agent: AgentFigure }) {
  const { vm, setBudget, pauseAgent, resumeAgent, stopOrder, restoreSpeed, reinstate, select } = useStore();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [stopReason, setStopReason] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [stopErr, setStopErr] = useState('');
  const unusual = a.familiarityPct < 30;

  return (
    <>
      <div className="section">
        <div className="ask-line">{a.liveLine}</div>
        <div className="why-line">
          {a.job} Judged on: {a.judgedOn}.
        </div>
        <div className="why-line">
          Status: {a.statusLine}
          {a.lastActionMs ? ` · last action ${fmtTime(a.lastActionMs)}, ${fmtAge(a.lastActionMs, vm.nowMs)} ago` : ''}
        </div>
      </div>

      <div className="panel-cols">
        <Section title="Today since 09:15, from the record">
          <div className="card">
            <div style={{ fontSize: 'var(--fs-em)', fontWeight: 600, marginBottom: 6 }}>{a.countsLine}</div>
            <div className="list">
              {a.recent.length === 0 && <div className="faint">No entries yet today.</div>}
              {a.recent.map((e) => (
                <div className="list-row" key={e.id}>
                  <span className="l">
                    {e.text}
                    <br />
                    <span className="sub">
                      <RecordLink id={e.id} />
                    </span>
                  </span>
                  <span className="r">{fmtTime(Date.parse(e.at))}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
        <div>
          <Section title="Data it depends on">
            <div className="card">
              <div className="list">
                {a.feeds.map((f) => (
                  <div className="list-row" key={f.id}>
                    <span className="l">
                      {f.name}
                      <br />
                      <span className="sub">{f.vendor}</span>
                    </span>
                    <span className="r">
                      {f.late ? (
                        <Badge tone="amber" icon="clock">
                          {Math.floor(f.ageSec / 60)} min late
                        </Badge>
                      ) : (
                        <Badge tone="green" icon="check">
                          live
                        </Badge>
                      )}
                      <br />
                      <span className="sub">{fmtAge(f.lastUpdatedMs, vm.nowMs)} ago</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
          <Section title="How unusual today is">
            <div className={`card${unusual ? ' amber-edge' : ''}`} style={{ fontSize: 'var(--fs-12)', lineHeight: 1.5 }}>
              {unusual ? (
                <>
                  <Badge tone="amber" icon="alert">
                    unlike {100 - a.familiarityPct}% of its history
                  </Badge>
                  <div style={{ marginTop: 6, color: 'var(--text-2)' }}>
                    Today's volumes and price moves fall outside {100 - a.familiarityPct}% of the days this agent has run. That is the cue to turn its dial down, not a verdict on its output.
                  </div>
                </>
              ) : (
                <>
                  <Badge tone="outline">like {a.familiarityPct}% of its history</Badge>
                  <div style={{ marginTop: 6, color: 'var(--text-2)' }}>Today's volumes and price moves look like {a.familiarityPct}% of the days this agent has run.</div>
                </>
              )}
            </div>
          </Section>
        </div>
      </div>

      <Section title="Reduce what it controls">
        <div className="card">
          {a.budget !== null && a.budgetMax !== null ? (
            <div className="dial">
              <span className="muted">{a.budgetLabel}</span>
              <input
                type="range"
                min={0}
                max={a.budgetMax}
                step={0.5 * CR}
                value={a.budget}
                onChange={(e) => setBudget(a.id, Number(e.target.value))}
                aria-label={a.budgetLabel}
              />
              <span className="val">{fmtCr(a.budget)}</span>
              <span className="faint">of {fmtCr(a.budgetMax)}</span>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 'var(--fs-12)' }}>
              This agent moves no money, so there is no budget to turn down. It can only be paused.
            </div>
          )}
          {/* Your own throttle comes off the way your own pause does: no reason,
              because undoing what you did is not overruling anyone. */}
          {a.throttledByPerson && (
            <div className="confirm-row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => restoreSpeed(a.id)}>
                <Icon name="play" />
                Restore full speed
              </button>
              <span className="muted" style={{ fontSize: 'var(--fs-12)' }}>
                {a.statusLine}
              </span>
            </div>
          )}
          <div className="confirm-row" style={{ marginTop: 10 }}>
            {a.status === 'Paused' && a.haltedByAgent ? (
              // Lifting another agent's halt is an override, not housekeeping.
              // The agent that imposed it has not changed its mind, so this
              // takes a reason and goes into the record as an overrule.
              <>
                <input
                  className="inline-input"
                  style={{ flex: 1 }}
                  placeholder={`Reason to overrule ${a.changedBy ?? 'the halt'}, for the record`}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setErr('');
                  }}
                />
                <button
                  className="btn primary"
                  onClick={() => {
                    if (!reason.trim()) {
                      setErr('Add a one-line reason. It goes into the record.');
                      return;
                    }
                    try {
                      resumeAgent(a.id, reason);
                      setReason('');
                    } catch (e) {
                      setErr((e as Error).message);
                    }
                  }}
                >
                  <Icon name="play" />
                  Resume over {a.changedBy ?? 'the halt'}
                </button>
              </>
            ) : a.status === 'Paused' ? (
              <button className="btn" onClick={() => resumeAgent(a.id)}>
                <Icon name="play" />
                Resume {a.name}
              </button>
            ) : (
              <>
                <input
                  className="inline-input"
                  style={{ flex: 1 }}
                  placeholder="Reason to pause, for the record"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setErr('');
                  }}
                />
                <button
                  className="btn danger-hover"
                  onClick={() => {
                    if (!reason.trim()) {
                      setErr('Add a one-line reason. It goes into the record.');
                      return;
                    }
                    pauseAgent(a.id, reason);
                    setReason('');
                  }}
                >
                  <Icon name="pause" />
                  Pause {a.name}
                </button>
              </>
            )}
          </div>
          {err && <div className="err" style={{ color: 'var(--red)', fontSize: 'var(--fs-12)', marginTop: 4 }}>{err}</div>}
          {a.haltRule && a.status === 'Paused' && (
            <div className="faint" style={{ fontSize: 'var(--fs-11)', marginTop: 6 }}>
              {a.haltRule} The condition that caused the halt will not have changed because you resumed it.
            </div>
          )}
          <div className="faint" style={{ fontSize: 'var(--fs-11)', marginTop: 6 }}>
            Every change here is a logged rule change with your name on it.
          </div>
        </div>
      </Section>

      {/* Stopping an order is the one control that reaches something already in
          flight. It needs no co-signer and carries no expiry, because it can
          only reduce what the fund has at risk — the mirror of an override that
          loosens a limit, which needs both. */}
      {a.stoppable.length > 0 && (
        <Section title="Orders you can still stop">
          <div className="card">
            <div className="list">
              {a.stoppable.map((o) => (
                <div className="list-row" key={o.id}>
                  <span className="l">
                    {o.company}
                    <br />
                    <span className="sub">
                      {o.placedLine} · {o.remainingLine}
                    </span>
                  </span>
                  <span className="r">
                    {o.stopped ? (
                      <Badge tone="amber" icon="x">
                        stopped
                      </Badge>
                    ) : (
                      <button
                        className="btn small danger-hover"
                        onClick={() => {
                          if (!stopReason.trim()) {
                            setStopErr('Add a one-line reason. It goes into the record.');
                            return;
                          }
                          try {
                            stopOrder(o.id, stopReason);
                            setStopReason('');
                            setStopErr('');
                          } catch (e) {
                            setStopErr((e as Error).message);
                          }
                        }}
                      >
                        <Icon name="pause" />
                        Stop the rest
                      </button>
                    )}
                    <br />
                    <span className="sub">{o.freesLine ?? ''}</span>
                  </span>
                </div>
              ))}
            </div>
            {a.stoppable.some((o) => !o.stopped) && (
              <div className="confirm-row" style={{ marginTop: 10 }}>
                <input
                  className="inline-input"
                  style={{ flex: 1 }}
                  placeholder="Reason to stop, for the record"
                  value={stopReason}
                  onChange={(e) => {
                    setStopReason(e.target.value);
                    setStopErr('');
                  }}
                />
              </div>
            )}
            {stopErr && <div className="err" style={{ color: 'var(--red)', fontSize: 'var(--fs-12)', marginTop: 4 }}>{stopErr}</div>}
            <div className="faint" style={{ fontSize: 'var(--fs-11)', marginTop: 6 }}>
              {ORDER_STOP_NOTE}
            </div>
          </div>
        </Section>
      )}

      {/* An agent dropping an idea is a judgement, and a person can disagree with
          it. Sending it back commits no money: it still has to be sized, cleared
          and come back as a proposal. */}
      {a.dropped.length > 0 && (
        <Section title="Ideas it dropped today">
          <div className="card">
            <div className="list">
              {a.dropped.map((idea) => (
                <div className="list-row" key={idea.key}>
                  <span className="l">
                    {idea.company}
                    <br />
                    <span className="sub">
                      {idea.reason} · {fmtTime(idea.atMs)} · <RecordLink id={idea.id} />
                    </span>
                  </span>
                  <span className="r">
                    {idea.reinstated ? (
                      <Badge tone="blue">back in research · {fmtTime(idea.reinstated.atMs)}</Badge>
                    ) : (
                      <button className={`btn small${dropTarget === idea.key ? ' selected' : ''}`} onClick={() => setDropTarget(idea.key)}>
                        Send back
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {dropTarget && a.dropped.some((x) => x.key === dropTarget && !x.reinstated) && (
              <div style={{ marginTop: 10 }}>
                <ReasonAction
                  placeholder={`Reason to send ${a.dropped.find((x) => x.key === dropTarget)!.company} back, for the record`}
                  label="Send it back to research"
                  icon="play"
                  onConfirm={(r) => {
                    reinstate(dropTarget, r);
                    setDropTarget(null);
                  }}
                />
              </div>
            )}
            <div className="faint override-note">{a.dropped[0].rule}</div>
          </div>
        </Section>
      )}

      {/* Overrides in force against this agent. Each one is a place where a
          person went against it today, and each lapses at the close. */}
      {a.overruled.length > 0 && (
        <Section title="Overruled today">
          <div className="card">
            <div className="list">
              {a.overruled.map((x) => {
                const where = overrideHome(x);
                return (
                  <div className="list-row" key={x.id}>
                    <span className="l">
                      {x.company}
                      <br />
                      <span className="sub">
                        {x.id} · by {vm.user.name} at {fmtTime(x.grantedAtMs)}
                        {x.cosigner ? ` · co-signed by ${x.cosigner}` : ''}
                      </span>
                    </span>
                    <span className="r">
                      {where ? (
                        <button className="btn small" onClick={() => select(where)}>
                          Lapses {fmtTime(x.lapsesAtMs)}
                        </button>
                      ) : (
                        <>Lapses {fmtTime(x.lapsesAtMs)}</>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      <div style={{ fontSize: 'var(--fs-12)' }}>
        <Link to={`/audit?agent=${a.id}`}>View full history in the Audit trail</Link>
      </div>
    </>
  );
}

/** Where an override is managed, so the agent panel can open it. */
function overrideHome(x: GrantedException): Selection {
  if (x.kind === 'risk-block' || x.kind === 'compliance-block') return { kind: 'blocked', id: x.eventKey };
  if (x.kind === 'size-cap') return { kind: 'decision', id: x.eventKey };
  if (x.kind === 'limit-exception' && x.limitKey) return { kind: 'decision', id: limitItemId(x.limitKey) };
  return null;
}
