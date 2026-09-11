import {
  autonomyColumnLabel,
  autonomyLock,
  bandLabel,
  formatRuleValue,
  THRESHOLD_AGENTS,
  type AgentAutonomy,
  type AutonomyBand,
  type AutonomyColumn,
} from '../../data/rulebook';
import { Icon } from '../ui/Icon';

interface Props {
  agents: AgentAutonomy[];
  mode: 'setup' | 'live';
  reviewedAgents?: string[];
  onMove: (agent: AgentAutonomy, action: string, from: AutonomyColumn) => void;
  onThreshold?: (agent: AgentAutonomy, value: number | null) => void;
  onThresholdEdit?: (agent: AgentAutonomy) => void;
  onReview?: (agent: string, reviewed: boolean) => void;
}

const BANDS: AutonomyBand[] = ['front', 'middle', 'back'];
const COLUMNS: AutonomyColumn[] = ['alone', 'human', 'never'];

/** A rulebook-specific composition built from the existing chip, button and card tokens. */
export function AutonomyGrid({ agents, mode, reviewedAgents = [], onMove, onThreshold, onThresholdEdit, onReview }: Props) {
  return (
    <div className="autonomy-bands">
      {BANDS.map((band) => (
        <section className="autonomy-band" key={band}>
          <div className="rule-eyebrow">{bandLabel(band)}</div>
          <div className="autonomy-agent-list">
            {agents.filter((agent) => agent.band === band).map((agent) => {
              const reviewed = reviewedAgents.includes(agent.agent);
              return (
                <article className="autonomy-agent" key={agent.agent}>
                  <div className="autonomy-agent-head">
                    <h3>{agent.agent}</h3>
                    {mode === 'setup' && onReview && (
                      <button className={`btn small${reviewed ? ' selected' : ''}`} onClick={() => onReview(agent.agent, !reviewed)}>
                        <Icon name="check" />
                        {reviewed ? 'Autonomy reviewed' : 'Mark autonomy reviewed'}
                      </button>
                    )}
                  </div>
                  {THRESHOLD_AGENTS.includes(agent.agent as (typeof THRESHOLD_AGENTS)[number]) && (
                    <label className="threshold-field">
                      <span>May size positions alone up to</span>
                      {mode === 'setup' && onThreshold ? (
                        <input
                          type="number"
                          value={agent.sizeThresholdPctOfFund ?? ''}
                          onChange={(event) => onThreshold(agent, event.target.value === '' ? null : Number(event.target.value))}
                        />
                      ) : <><strong>{agent.sizeThresholdPctOfFund === null ? 'Not set' : formatRuleValue(agent.sizeThresholdPctOfFund, 'percent')}</strong>{onThresholdEdit && <button className="btn small" onClick={() => onThresholdEdit(agent)}>Edit threshold</button>}</>}
                      <span>of fund</span>
                    </label>
                  )}
                  <div className="autonomy-columns">
                    {COLUMNS.map((column) => (
                      <div className="autonomy-column" key={column}>
                        <h4>{autonomyColumnLabel(column)}</h4>
                        <div className="autonomy-items">
                          {itemsFor(agent, column).map(({ action, who }) => {
                            const fixed = autonomyLock(agent.agent, action);
                            return (
                              <span
                                className="autonomy-chip-shell"
                                key={action}
                                tabIndex={fixed ? 0 : undefined}
                                aria-label={fixed ? `${action}. Locked: ${fixed.reason}` : undefined}
                                data-tooltip={fixed?.reason}
                              >
                                <button
                                  className={`autonomy-chip${fixed ? ' locked' : ''}`}
                                  disabled={Boolean(fixed)}
                                  title={fixed ? undefined : `Move ${action}`}
                                  onClick={() => onMove(agent, action, column)}
                                >
                                  {fixed && <Icon name="shield" />}
                                  <span>{action}</span>
                                  {who && <small>{who}</small>}
                                  {fixed && <small>Locked</small>}
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function itemsFor(agent: AgentAutonomy, column: AutonomyColumn): Array<{ action: string; who?: string }> {
  if (column === 'alone') return agent.mayDoAlone.map((action) => ({ action }));
  if (column === 'human') return agent.needsHuman.map((item) => ({ action: item.action, who: item.who }));
  return agent.never.map((action) => ({ action }));
}
