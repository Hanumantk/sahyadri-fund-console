import {
  ESCALATION_CHANNELS,
  ESCALATION_TIMINGS,
  HUMAN_ROLES,
  type EscalationRoute,
} from '../../data/rulebook';

interface Props {
  routes: EscalationRoute[];
  mode: 'setup' | 'live';
  onChange?: (id: string, patch: Partial<EscalationRoute>) => void;
  onEdit?: (route: EscalationRoute) => void;
}

export function EscalationTable({ routes, mode, onChange, onEdit }: Props) {
  return (
    <div className="rules-table-wrap">
      <table className="rules-table escalation-table">
        <thead>
          <tr>
            <th>What happened</th>
            <th>Who is told</th>
            <th>Channel</th>
            <th>Timing</th>
            {mode === 'live' && <th><span className="sr-only">Edit</span></th>}
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr key={route.id}>
              <td className="rule-table-key">{route.event}</td>
              <td>{mode === 'setup' ? (
                <select value={route.recipient} onChange={(event) => onChange?.(route.id, { recipient: event.target.value })}>
                  {[...HUMAN_ROLES, 'all four'].map((value) => <option key={value}>{value}</option>)}
                </select>
              ) : route.recipient}</td>
              <td>{mode === 'setup' ? (
                <select value={route.channel} onChange={(event) => onChange?.(route.id, { channel: event.target.value })}>
                  {ESCALATION_CHANNELS.map((value) => <option key={value}>{value}</option>)}
                </select>
              ) : route.channel}</td>
              <td>{mode === 'setup' ? (
                <select value={route.timing} onChange={(event) => onChange?.(route.id, { timing: event.target.value })}>
                  {ESCALATION_TIMINGS.map((value) => <option key={value}>{value}</option>)}
                </select>
              ) : route.timing}</td>
              {mode === 'live' && <td className="rule-table-action"><button className="btn small" onClick={() => onEdit?.(route)}>Edit</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
