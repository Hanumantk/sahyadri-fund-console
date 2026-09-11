import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AgentFigure } from '../../data/derive';
import { fmtAge, fmtCr, fmtTime } from '../../data/format';
import { CR } from '../../data/scenario';
import { useStore } from '../../state/store';
import { Badge, RecordLink, Section } from '../ui/bits';
import { Icon } from '../ui/Icon';

export function AgentView({ agent: a }: { agent: AgentFigure }) {
  const { vm, setBudget, pauseAgent, resumeAgent } = useStore();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
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
          <div className="confirm-row" style={{ marginTop: 10 }}>
            {a.status === 'Paused' ? (
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
          <div className="faint" style={{ fontSize: 'var(--fs-11)', marginTop: 6 }}>
            Every change here is a logged rule change with your name on it.
          </div>
        </div>
      </Section>

      <div style={{ fontSize: 'var(--fs-12)' }}>
        <Link to={`/audit?agent=${a.id}`}>View full history in the Audit trail</Link>
      </div>
    </>
  );
}
