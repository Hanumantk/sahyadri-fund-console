import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { actorKind, actorName } from '../data/derive';
import { fmtDateTimeSec } from '../data/format';
import { AGENTS, type AgentId, type RawEvent } from '../data/scenario';
import { useStore } from '../state/store';
import { Badge } from '../components/ui/bits';
import { Icon } from '../components/ui/Icon';

export function AuditTrail() {
  const { vm } = useStore();
  const [params, setParams] = useSearchParams();
  const record = params.get('record') ?? '';
  const agent = params.get('agent') ?? '';
  const company = params.get('company') ?? '';
  const [q, setQ] = useState(record || company || '');

  const rows = useMemo(() => {
    let list: RawEvent[] = [...vm.events].reverse();
    if (record) list = list.filter((e) => e.id === record || e.related?.includes(record));
    if (agent) list = list.filter((e) => e.actor === agent);
    if (company) list = list.filter((e) => e.company?.toLowerCase() === company.toLowerCase());
    if (q && !record && !company) {
      const s = q.toLowerCase();
      list = list.filter((e) => e.id.toLowerCase().includes(s) || e.text.toLowerCase().includes(s) || e.company?.toLowerCase().includes(s) || e.related?.some((r) => r.toLowerCase().includes(s)));
    }
    return list;
  }, [vm.events, record, agent, company, q]);

  const filterLabel = record ? `record ${record}` : agent ? AGENTS[agent as AgentId]?.name ?? agent : company ? company : '';

  return (
    <div className="page">
      <h1 className="page-title">Audit trail</h1>
      <p className="page-sub">
        Record complete · {vm.events.length} entries · each entry locked to the one before it · nothing edited
      </p>
      <div className="audit-filter">
        <div className="audit-search">
          <Icon name="search" />
          <input
            value={q}
            placeholder="Search by record ID, company or text"
            onChange={(e) => {
              setQ(e.target.value);
              if (record || company) setParams({});
            }}
          />
        </div>
        {filterLabel && (
          <>
            <Badge tone="blue">filtered to {filterLabel}</Badge>
            <Link
              to="/audit"
              onClick={() => {
                setQ('');
              }}
            >
              Clear filter
            </Link>
          </>
        )}
        <span className="muted" style={{ marginLeft: 'auto' }}>
          {rows.length} of {vm.events.length} entries
        </span>
      </div>
      <table className="audit">
          <thead>
            <tr>
              <th>Time (IST)</th>
              <th>Who</th>
              <th>Type</th>
              <th>Company</th>
              <th>What happened</th>
              <th>Related</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className={record && e.id === record ? 'hit' : ''}>
                <td className="t">
                  <span className="when">{fmtDateTimeSec(Date.parse(e.at))}</span>
                  <br />
                  {e.id}
                </td>
                <td>
                  <span className="actor-tag">
                    {actorName(e.actor)}
                    <span className="ai">{actorKind(e.actor) === 'agent' ? 'AI' : actorKind(e.actor) === 'person' ? 'Human' : 'System'}</span>
                  </span>
                </td>
                <td className="type">{e.type.replace(/_/g, ' ')}</td>
                <td className="co">{e.company ?? '—'}</td>
                <td className="what">{e.text}</td>
                <td className="rel">
                  {(e.related ?? []).map((r) => (
                    <span key={r}>
                      <Link to={`/audit?record=${encodeURIComponent(r)}`}>{r}</Link>
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No entries match. Every record ID linked from Home exists in the log; check the ID.</td>
              </tr>
            )}
          </tbody>
      </table>
    </div>
  );
}
