import { useState } from 'react';
import { breakDifference, sourceById, type QueueItem } from '../../data/derive';
import { dateMs, fmtDate, fmtInt, fmtLakh, fmtPrice, fmtTime } from '../../data/format';
import { AGENTS, TRADES_0910, type Break } from '../../data/scenario';
import { useStore } from '../../state/store';
import { Timer } from '../home/DecisionsColumn';
import { AuthorshipBadge, RecordLink, Section } from '../ui/bits';
import { Icon } from '../ui/Icon';
import { Decide } from './Decide';

export function BreakView({ item }: { item: QueueItem }) {
  const { vm } = useStore();
  const d = item.decision as Break;
  const [trail, setTrail] = useState(false);
  const diff = breakDifference(d);
  const trade = TRADES_0910.find((t) => t.id === d.tradeId)!;
  const related = vm.events.filter((e) => e.related?.includes(d.id) || e.related?.includes(d.tradeId));

  return (
    <>
      <div className="section">
        <div className="ask-line">{item.ask}</div>
        <div className="why-line">
          <strong style={{ fontWeight: 500, color: 'var(--text)' }}>Needs you:</strong> {d.dueWhy}. There is no expiry, only a due time.
        </div>
        <div className="why-line" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>
            Raised by {AGENTS[d.raisedBy].name} · {fmtTime(Date.parse(d.raisedAt))}
          </span>
          <Timer item={item} />
        </div>
      </div>

      <div className="panel-cols">
        <Section title="What does not match">
          <div className="card">
            <div className="list">
              <div className="list-row">
                <span className="l">Our record · {d.tradeId}</span>
                <span className="r">{fmtInt(d.ourShares)} shares sold</span>
              </div>
              <div className="list-row">
                <span className="l">Broker's contract note · Sagar Broking</span>
                <span className="r">{fmtInt(d.brokerShares)} shares sold</span>
              </div>
              <div className="list-row">
                <span className="l">Difference</span>
                <span className="r" style={{ color: 'var(--text)' }}>
                  {fmtInt(diff.shares)} shares · {fmtLakh(diff.rupees)}
                </span>
              </div>
              <div className="list-row">
                <span className="l">Price that day</span>
                <span className="r">{fmtPrice(trade.price)}</span>
              </div>
            </div>
          </div>
        </Section>
        <Section title="What each action does">
          <div className="card" style={{ fontSize: 'var(--fs-12)', lineHeight: 1.5, color: 'var(--text-2)' }}>
            <div>
              <strong style={{ fontWeight: 500, color: 'var(--text)' }}>Accept broker's record</strong> · our books show {fmtInt(diff.shares)} more {d.company} shares held and {fmtLakh(diff.rupees)} less cash.
            </div>
            <div style={{ marginTop: 4 }}>
              <strong style={{ fontWeight: 500, color: 'var(--text)' }}>Keep ours and chase the broker</strong> · books unchanged, the Operations Agent owns the chase.
            </div>
            <div style={{ marginTop: 4 }}>
              <strong style={{ fontWeight: 500, color: 'var(--text)' }}>Assign to Operations staff</strong> · a person takes it before {fmtTime(item.deadlineMs!)}.
            </div>
          </div>
        </Section>
      </div>

      <Decide
        item={item}
        options={[
          { key: 'accept', label: "Accept broker's record", needsReason: true, note: `Our books are corrected by ${fmtInt(diff.shares)} ${d.company} shares and ${fmtLakh(diff.rupees)}. The fund value barely moves.` },
          { key: 'keep', label: 'Keep ours and chase the broker', needsReason: true, note: 'Nothing changes in the books. The Operations Agent chases Sagar Broking and the break stays owned until they answer.' },
          { key: 'assign', label: 'Assign to Operations staff', needsReason: true, note: 'The break leaves your queue and is owned by Operations staff, who must settle it before the official value is struck.' },
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
          <Section title="Records compared">
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
          <Section title="Related entries in the record">
            <div className="card">
              <div className="list">
                {related.map((e) => (
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
          <div style={{ fontSize: 'var(--fs-12)' }}>
            <RecordLink id={d.id}>Open the Audit trail filtered to {d.id}</RecordLink>
          </div>
        </div>
      )}
    </>
  );
}
