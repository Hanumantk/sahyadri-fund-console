import { useState } from 'react';
import { proposalPreview, sourceById, type QueueItem } from '../../data/derive';
import { fmtCr, fmtDate, fmtPct, fmtTime } from '../../data/format';
import { AGENTS, LIMITS, type Proposal } from '../../data/scenario';
import { dateMs } from '../../data/format';
import { useStore } from '../../state/store';
import { Timer } from '../home/DecisionsColumn';
import { AuthorshipBadge, RecordLink, Section } from '../ui/bits';
import { Icon } from '../ui/Icon';
import { Decide } from './Decide';

export function ProposalView({ item }: { item: QueueItem }) {
  const { vm } = useStore();
  const d = item.decision as Proposal;
  const [trail, setTrail] = useState(false);
  const f = vm.fund;
  const holding = f.holdings.find((h) => h.ticker === d.ticker)!;
  const sector = f.sectors.find((s) => s.name === holding.sector)!;
  const take = item.previews.find((p) => p.key === 'take')!;
  const less = item.previews.find((p) => p.key === 'less')!;
  const decline = item.previews.find((p) => p.key === 'decline')!;
  const closed = item.status !== 'open';

  return (
    <>
      <div className="section">
        <div className="ask-line">{item.ask}</div>
        <div className="why-line">
          <strong style={{ fontWeight: 500, color: 'var(--text)' }}>Needs you:</strong> {d.whyYou}
        </div>
        <div className="why-line" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{item.byLine}</span>
          <Timer item={item} />
          <span className="faint">
            v{d.versions.length} · sent to you {fmtTime(dateMsSafe(d.createdAt))}
          </span>
        </div>
      </div>

      <div className="panel-cols">
        <Section title="The claim">
          <div className="card">
            <div style={{ fontSize: 'var(--fs-em)', fontWeight: 600, marginBottom: 6 }}>{d.claim}</div>
            <ol className="facts">
              {d.facts.map((fact, i) => (
                <li key={i}>
                  {fact.text} <span className="faint">· {sourceById(fact.sourceId)?.publisher}</span>
                </li>
              ))}
            </ol>
          </div>
        </Section>
        <Section title="Not checked">
          <div className="card">
            <ul className="plain-list">
              {d.notChecked.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        </Section>
      </div>

      <Section title={`Sources disagree on ${d.conflict.fact} · shown unresolved`}>
        <div className="two-sources">
          {d.conflict.sides.map((s) => (
            <div className="src-card" key={s.sourceId}>
              <div className="who">{s.label}</div>
              <div className="val">{s.value}</div>
              <div className="det">
                {s.detail} · <RecordLink id={s.sourceId} />
              </div>
            </div>
          ))}
        </div>
        <div className="agent-note">
          <Icon name="split" />
          {d.conflict.agentNote} {d.tradeUnderEachSide[0]} · {d.tradeUnderEachSide[1]}.
        </div>
      </Section>

      <div className="panel-cols">
        <Section title={closed ? 'The fund now' : 'Effect on the fund'}>
          <div className="card">
            <div className="list">
              <div className="list-row">
                <span className="l">{d.company} position</span>
                <span className="r">
                  {closed ? fmtPct(holding.pct) : `${d.isNewPosition ? 'new' : fmtPct(holding.pct)} → ${fmtPct(take.positionPct)}`} · limit {fmtPct(LIMITS.maxCompanyPct, 0)}
                </span>
              </div>
              <div className="list-row">
                <span className="l">{sector.name} sector</span>
                <span className="r">
                  {closed ? fmtPct(sector.pct) : `${fmtPct(sector.pct)} → ${fmtPct(take.sectorPct)}`} · limit {fmtPct(LIMITS.maxSectorPct, 0)}
                </span>
              </div>
              <div className="list-row">
                <span className="l">Cash</span>
                <span className="r">{closed ? fmtCr(f.cash) : `${fmtCr(f.cash)} → ${fmtCr(take.cashAfter)}`}</span>
              </div>
              <div className="list-row">
                <span className="l">Days to sell at normal volume</span>
                <span className="r">{holding.daysToSell < 1 ? 'under 1' : holding.daysToSell.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </Section>
        <Section title="What would prove it wrong">
          <div className="card" style={{ fontSize: 'var(--fs-12)', lineHeight: 1.5 }}>
            {d.wouldProveWrong}
            <div className="faint" style={{ marginTop: 6 }}>
              Becomes a watch item on the position if you take it.
            </div>
          </div>
        </Section>
      </div>

      <Decide
        item={item}
        options={[
          { key: 'take', label: 'Take it', preview: take, needsReason: false },
          { key: 'less', label: 'Take less', preview: less, needsReason: true },
          { key: 'decline', label: 'Decline', preview: decline, needsReason: true, note: `Nothing is bought. ${AGENTS[d.proposedBy].name} is told why, and the idea is tracked to see how it would have done.` },
        ]}
        slider={{ min: d.takeLessStep, max: d.amount - d.takeLessStep, step: d.takeLessStep, initial: d.takeLessDefault }}
        previewFor={(amount) => proposalPreview(f, d, amount, 'less', 'Take less', true)}
      />

      <div className="trail-toggle" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => setTrail((v) => !v)}>
          <Icon name={trail ? 'chevron-up' : 'chevron-down'} />
          {trail ? 'Hide full trail' : 'See full trail'}
        </button>
      </div>

      {trail && (
        <div className="trail">
          <Section title="Sources">
            <div className="card">
              <div className="list">
                {d.sourceIds.map((id) => {
                  const s = sourceById(id)!;
                  return (
                    <div className="list-row" key={id}>
                      <span className="l">
                        {s.title}
                        <br />
                        <span className="sub">
                          {s.publisher} · {fmtDate(dateMs(s.date))} · <RecordLink id={id} />
                        </span>
                      </span>
                      <span className="r">
                        <AuthorshipBadge authorship={s.authorship} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>
          <Section title={`${AGENTS[d.proposedBy].name}'s reasoning, step by step`}>
            <div className="card">
              <ol className="facts" style={{ color: 'var(--text-2)' }}>
                {d.reasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </div>
          </Section>
          <div className="panel-cols">
            <Section title={`${AGENTS[d.proposedBy].name}'s last ${d.pastSimilar.length} proposals with a source conflict`}>
              <div className="card">
                <div className="list">
                  {d.pastSimilar.map((p, i) => (
                    <div className="list-row" key={i}>
                      <span className="l">
                        {p.company} · {p.when}
                        <br />
                        <span className="sub">{p.decision}</span>
                      </span>
                      <span className="r">{p.outcome}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
            <Section title="Versions">
              <div className="card">
                <div className="list">
                  {[...d.versions].reverse().map((v) => (
                    <div className="list-row" key={v.v}>
                      <span className="l">
                        v{v.v} · {fmtCr(v.amount)} · {fmtPct((v.amount / f.fundValue) * 100)} of fund
                        <br />
                        <span className="sub">
                          {fmtTime(dateMsSafe(v.at))} · {AGENTS[v.by].name} · {v.note}
                        </span>
                      </span>
                      <span className="r">{v.v === d.versions.length ? 'current' : 'replaced'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          </div>
          <div style={{ fontSize: 'var(--fs-12)' }}>
            <RecordLink id={d.id}>
              <Icon name="link" style={{ width: 12, height: 12, verticalAlign: '-2px', marginRight: 4 }} />
              Open the Audit trail filtered to {d.id}
            </RecordLink>
          </div>
        </div>
      )}
    </>
  );
}

function dateMsSafe(iso: string): number {
  return Date.parse(iso);
}
