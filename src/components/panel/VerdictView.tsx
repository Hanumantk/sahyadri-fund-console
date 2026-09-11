import { useState } from 'react';
import { sourceById, type QueueItem } from '../../data/derive';
import { dateMs, fmtCr, fmtDate, fmtPct } from '../../data/format';
import { LIMITS, type Verdict, type VerdictSide } from '../../data/scenario';
import { useStore } from '../../state/store';
import { Timer } from '../home/DecisionsColumn';
import { AuthorshipBadge, Badge, RecordLink, Section } from '../ui/bits';
import { Icon } from '../ui/Icon';
import { Decide } from './Decide';

export function VerdictView({ item }: { item: QueueItem }) {
  const { vm } = useStore();
  const d = item.decision as Verdict;
  const [trail, setTrail] = useState(false);
  const f = vm.fund;
  const holding = f.holdings.find((h) => h.ticker === d.ticker)!;
  const sector = f.sectors.find((s) => s.name === holding.sector)!;
  const shared = d.bull.sourceIds.filter((id) => d.bear.sourceIds.includes(id));
  const bull = item.previews.find((p) => p.key === 'bull')!;
  const half = item.previews.find((p) => p.key === 'halfway')!;
  const bear = item.previews.find((p) => p.key === 'bear')!;
  const lapse = item.previews.find((p) => p.key === 'lapse')!;
  const closed = item.status !== 'open';

  return (
    <>
      <div className="section">
        <div className="ask-line">{item.ask}</div>
        <div className="why-line">
          <strong style={{ fontWeight: 500, color: 'var(--text)' }}>Needs you:</strong> the two sub-agents split on one assumption, and agents never settle a disagreement themselves.
        </div>
        <div className="why-line" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{item.byLine}</span>
          <Timer item={item} />
        </div>
      </div>

      <Section title="Where they split · one assumption">
        <div className="card amber-edge">
          <div style={{ fontSize: 'var(--fs-em)', fontWeight: 600 }}>{d.splitOn}</div>
          <div className="card-sub" style={{ marginTop: 4 }}>
            They agree on: {d.agreedOn.join(' · ')}
          </div>
        </div>
      </Section>

      <div className="panel-cols">
        <SideCard side={d.bull} preview={bull.sectorPct} sectorName={sector.name} />
        <SideCard side={d.bear} preview={sector.pct} sectorName={sector.name} />
      </div>

      <div className="panel-cols">
        <Section title={closed ? 'The fund now' : 'Effect on the fund'}>
          <div className="card">
            <div className="list">
              <div className="list-row">
                <span className="l">{sector.name} sector now</span>
                <span className="r">
                  {fmtPct(sector.pct)} of fund · {sector.headroom >= 0 ? `${fmtCr(sector.headroom)} room under` : `${fmtCr(-sector.headroom)} over`} {fmtPct(LIMITS.maxSectorPct, 0)}
                </span>
              </div>
              {!closed && (
                <>
                  <div className="list-row">
                    <span className="l">With Bull's {fmtCr(d.bull.amount)}</span>
                    <span className="r">
                      {sector.name} {fmtPct(bull.sectorPct)} · {fmtPct(bull.sectorUsedPct, 0)} of limit
                    </span>
                  </div>
                  <div className="list-row">
                    <span className="l">With halfway {fmtCr(d.halfwayAmount)}</span>
                    <span className="r">
                      {sector.name} {fmtPct(half.sectorPct)} · {fmtPct(half.sectorUsedPct, 0)} of limit
                    </span>
                  </div>
                </>
              )}
              <div className="list-row">
                <span className="l">{d.company} position</span>
                <span className="r">{closed ? `${fmtPct(holding.pct)} of fund` : `${fmtPct(holding.pct)} → ${fmtPct(bull.positionPct)} with Bull`}</span>
              </div>
            </div>
          </div>
        </Section>
        <Section title="Knock-on">
          <div className="card" style={{ fontSize: 'var(--fs-12)', lineHeight: 1.5 }}>
            <Badge tone="grey" icon="wait">
              Portfolio Agent · Waiting
            </Badge>
            <div style={{ marginTop: 6 }}>{d.knockOn}</div>
          </div>
        </Section>
      </div>

      <Decide
        item={item}
        options={[
          { key: 'bull', label: 'Side with Bull', preview: bull, needsReason: true },
          { key: 'halfway', label: 'Go halfway', preview: half, needsReason: true },
          { key: 'bear', label: 'Side with Bear', preview: bear, needsReason: true, note: 'Nothing is bought. Both cases are kept and tracked, and the Portfolio Agent goes back to Running.' },
          { key: 'lapse', label: 'Let it lapse', preview: lapse, needsReason: true, note: 'Closes the verdict now with nothing bought, instead of waiting for the timer. The Portfolio Agent goes back to Running.' },
        ]}
      />

      <div className="trail-toggle" style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => setTrail((v) => !v)}>
          <Icon name={trail ? 'chevron-up' : 'chevron-down'} />
          {trail ? 'Hide full trail' : 'See full trail'}
        </button>
      </div>

      {trail && (
        <div className="trail">
          <Section title="Sources · shared ones marked, because a shared bad source makes both sides wrong">
            <div className="card">
              <div className="list">
                {[...new Set([...d.bull.sourceIds, ...d.bear.sourceIds])].map((id) => {
                  const s = sourceById(id)!;
                  const who = d.bull.sourceIds.includes(id) && d.bear.sourceIds.includes(id) ? 'Bull and Bear' : d.bull.sourceIds.includes(id) ? 'Bull' : 'Bear';
                  return (
                    <div className="list-row" key={id}>
                      <span className="l">
                        {s.title}
                        <br />
                        <span className="sub">
                          {s.publisher} · {fmtDate(dateMs(s.date))} · used by {who} · <RecordLink id={id} />
                        </span>
                      </span>
                      <span className="r" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {shared.includes(id) && <Badge tone="blue">shared</Badge>}
                        <AuthorshipBadge authorship={s.authorship} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>
          <div className="panel-cols">
            <Section title="Bull's reasoning">
              <div className="card">
                <ol className="facts" style={{ color: 'var(--text-2)' }}>
                  {d.bull.reasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ol>
              </div>
            </Section>
            <Section title="Bear's reasoning">
              <div className="card">
                <ol className="facts" style={{ color: 'var(--text-2)' }}>
                  {d.bear.reasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ol>
              </div>
            </Section>
          </div>
          <Section title="Last time Bull and Bear disagreed on a bank">
            <div className="card">
              <div className="list">
                {d.pastDisputes.map((p, i) => (
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
          <div style={{ fontSize: 'var(--fs-12)' }}>
            <RecordLink id={d.id}>Open the Audit trail filtered to {d.id}</RecordLink>
          </div>
        </div>
      )}
    </>
  );
}

function SideCard({ side, preview, sectorName }: { side: VerdictSide; preview: number; sectorName: string }) {
  return (
    <Section title={`${side.name}'s position`}>
      <div className="card" style={{ height: 'calc(100% - 20px)' }}>
        <div style={{ fontSize: 'var(--fs-em)', fontWeight: 600 }}>{side.position}</div>
        <div className="card-sub" style={{ marginBottom: 6 }}>
          {sectorName} would be {fmtPct(preview)} of the fund
        </div>
        <div className="section-title" style={{ marginTop: 8 }}>
          Would change {side.name}'s mind
        </div>
        <div style={{ fontSize: 'var(--fs-12)' }}>{side.wouldChangeMind}</div>
        <div className="section-title" style={{ marginTop: 8 }}>
          Rests on
        </div>
        <div style={{ fontSize: 'var(--fs-11)', color: 'var(--text-2)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {side.sourceIds.map((id) => (
            <RecordLink key={id} id={id}>
              {sourceById(id)?.publisher}
            </RecordLink>
          ))}
        </div>
      </div>
    </Section>
  );
}
