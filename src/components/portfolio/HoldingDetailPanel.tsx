import { Link } from 'react-router-dom';
import { dateMs, daysBetween, fmtCr, fmtDate, fmtInt, fmtPct, fmtSignedCr, fmtSignedPct } from '../../data/format';
import { PORTFOLIO_LIMITS, type Holding, type SourceConflictSide, type SourceFact } from '../../data/portfolio';
import { useStore } from '../../state/store';
import { RecordLink, Section } from '../ui/bits';
import { HeadroomBar } from './HeadroomBar';
import { StatePill } from './StatePill';

export function HoldingDetailPanel({ holding, onClose }: { holding: Holding; onClose: () => void }) {
  const { vm, select } = useStore();
  const mismatch = holding.states.find((state) => state.kind === 'records_disagree');
  const days = holding.exit.days < 1 ? 'under 1 day' : `${holding.exit.days} ${holding.exit.days === 1 ? 'day' : 'days'}`;

  return (
    <aside className="holding-detail-panel" aria-label={`${holding.name} holding detail`}>
      <div className="panel-head">
        <div>
          <h2>{holding.name}</h2>
          <div className="detail-sector">{holding.sector}</div>
        </div>
        <span className="spacer" />
        <button className="btn small" onClick={onClose} title="Escape also closes this panel">Back to holdings</button>
      </div>
      {holding.states.length > 0 && (
        <div className="detail-states">
          {holding.states.map((state, index) => (
            <StatePill key={`${state.kind}-${index}`} state={state} holding={holding} fundValue={vm.fund.fundValue} />
          ))}
        </div>
      )}
      <div className="panel-body">
        <Section title="Position">
          <div className="card">
            <div className="list">
              <DetailRow label="Value" value={fmtCr(holding.value)} />
              <div className="list-row detail-weight-row">
                <span className="l">Share of fund</span>
                <span className="r">{fmtPct(holding.weightPct)} of {fmtPct(PORTFOLIO_LIMITS.holdingPct, 0)}</span>
              </div>
              <HeadroomBar valuePct={holding.weightPct} limitPct={PORTFOLIO_LIMITS.holdingPct} />
              <DetailRow
                label="Shares"
                value={mismatch ? `${fmtInt(mismatch.ourShares)} ours · ${fmtInt(mismatch.brokerShares)} broker` : fmtInt(holding.shares)}
              />
              <DetailRow label="Unrealised P&L" value={`${fmtSignedCr(holding.unrealisedPnl, 2)} (${fmtSignedPct(holding.unrealisedPnlPct, 1)})`} />
              <DetailRow label="Realised P&L" value={fmtSignedCr(holding.realisedPnl, 2)} />
            </div>
          </div>
        </Section>

        <Section title="Why we hold this">
          <div className="card detail-copy">{holding.detail.claim}</div>
        </Section>

        <Section title="Evidence">
          <div className="card evidence-list">
            {holding.detail.evidence.map((fact) => <EvidenceFact key={fact.sourceId} fact={fact} nowMs={vm.nowMs} />)}
          </div>
        </Section>

        {holding.detail.conflict && (
          <Section title={`Sources disagree on ${holding.detail.conflict.subject} · shown unresolved`}>
            <div className="two-sources">
              {holding.detail.conflict.sides.map((side) => <ConflictSide key={side.sourceId} side={side} />)}
            </div>
          </Section>
        )}

        <Section title="Not checked">
          <div className="card">
            <ul className="plain-list">
              {holding.detail.notChecked.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </Section>

        <Section title="What would prove it wrong">
          <div className="card detail-copy">{holding.detail.wouldProveWrong}</div>
        </Section>

        <Section title="Changes since opened">
          <div className="card">
            <div className="list change-list">
              {holding.detail.changes.map((change, index) => (
                <div className="list-row" key={`${change.date}-${index}`}>
                  <span className="l">{change.date} · {change.text}</span>
                  <span className="r">{change.actor}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Selling it">
          <div className="card detail-copy">{fmtCr(holding.exit.value)} · {days} at normal volume · est. cost {fmtPct(holding.exit.costPct)}</div>
        </Section>

        {holding.detail.relatedDecisionId && (
          <div className="related-decision">
            <Link
              to="/"
              onClick={() => select({ kind: 'decision', id: holding.detail.relatedDecisionId! })}
            >
              {holding.detail.relatedDecisionLabel}
            </Link>
          </div>
        )}

        <div className="trail-link">
          <Link to={`/audit?holding=${encodeURIComponent(holding.name)}`}>See full trail · {holding.name}</Link>
        </div>
      </div>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="list-row"><span className="l">{label}</span><span className="r">{value}</span></div>;
}

function EvidenceFact({ fact, nowMs }: { fact: SourceFact; nowMs: number }) {
  const age = daysBetween(dateMs(fact.date), nowMs);
  return (
    <div className="evidence-fact">
      <div>{fact.text}</div>
      <div className="evidence-meta">
        {fact.source} · {fmtDate(dateMs(fact.date))} · {age} {age === 1 ? 'day' : 'days'} old · <RecordLink id={fact.sourceId} />
      </div>
    </div>
  );
}

function ConflictSide({ side }: { side: SourceConflictSide }) {
  const value = side.unit === 'shares' ? `${fmtInt(side.value)} shares` : `${side.qualifier ? `${side.qualifier} ` : ''}${fmtPct(side.value, 0)}`;
  return (
    <div className="src-card">
      <div className="who">{side.label}</div>
      <div className="val">{value}</div>
      <div className="det">{side.detail} · {side.source} · {fmtDate(dateMs(side.date))} · <RecordLink id={side.sourceId} /></div>
    </div>
  );
}
