import { useState } from 'react';
import { AutonomyGrid } from '../components/rules/AutonomyGrid';
import { EscalationTable } from '../components/rules/EscalationTable';
import { LimitChangeDialog } from '../components/rules/LimitChangeDialog';
import {
  COMPLIANCE_OPACITY_NOTE,
  ESCALATION_CHANNELS,
  ESCALATION_TIMINGS,
  HUMAN_ROLES,
  LIVE_MANDATE_NOTICE,
  NEVER_FIRED_LIMIT_IDS,
  RISK_STANCE_COPY,
  RULEBOOK_EXCEPTION_SUMMARY,
  RULEBOOK_INITIAL_VERSION,
  RULEBOOK_LAST_CHANGED,
  SAMPLE_DATA_LABEL,
  autonomyColumnLabel,
  expiryActionLabel,
  formatCurrentValue,
  formatExceptionCountdown,
  formatFundSize,
  formatRupeeEquivalent,
  formatRuleValue,
  type ActiveException,
  type AgentAutonomy,
  type AutonomyColumn,
  type EscalationRoute,
  type Limit,
  type ProhibitedEntry,
} from '../data/rulebook';
import { useRulebook } from '../state/rulebook';
import { useStore } from '../state/store';

interface AutonomyEdit {
  agent: AgentAutonomy;
  action: string;
  from: AutonomyColumn;
}

export function Rules() {
  const { vm } = useStore();
  const {
    rulebook,
    saveLimit,
    moveAutonomy,
    setAgentThreshold,
    updateEscalation,
    updateProhibited,
    updateException,
    endException,
  } = useRulebook();
  const [editingLimit, setEditingLimit] = useState<Limit | null>(null);
  const [editingAutonomy, setEditingAutonomy] = useState<AutonomyEdit | null>(null);
  const [editingThreshold, setEditingThreshold] = useState<AgentAutonomy | null>(null);
  const [editingEscalation, setEditingEscalation] = useState<EscalationRoute | null>(null);
  const [editingProhibited, setEditingProhibited] = useState<ProhibitedEntry | null>(null);
  const [editingException, setEditingException] = useState<{ exception: ActiveException; mode: 'change' | 'end' } | null>(null);
  const [neverFiredOnly, setNeverFiredOnly] = useState(false);
  const latest = rulebook.history[0];
  const lastChanged = rulebook.version === RULEBOOK_INITIAL_VERSION
    ? RULEBOOK_LAST_CHANGED
    : `Last changed ${latest.date} by ${latest.actor} · ${latest.rule}`;
  const exceptionSummary = rulebook.exceptions.length === 1
    ? RULEBOOK_EXCEPTION_SUMMARY
    : `${rulebook.exceptions.length} active exceptions`;

  return (
    <div className="page rules-page">
      <header className="rules-header">
        <div className="rules-title-line">
          <h1>Rulebook · v{rulebook.version} · live since {rulebook.liveSince}</h1>
          <strong className="rules-fund-size">{formatFundSize(rulebook.fund.size)}</strong>
          <span className="sample-label">{SAMPLE_DATA_LABEL}</span>
        </div>
        <div className="rules-header-grid">
          <div className="rules-stance">
            <span>Risk stance</span>
            <div className="stance-display" aria-label={`Risk stance: ${RISK_STANCE_COPY[rulebook.riskStance].label}`}>
              {(Object.keys(RISK_STANCE_COPY) as Array<keyof typeof RISK_STANCE_COPY>).map((stance) => (
                <span key={stance} className={rulebook.riskStance === stance ? 'selected' : ''}>{RISK_STANCE_COPY[stance].label}</span>
              ))}
            </div>
          </div>
          <p>{lastChanged}</p>
          <p>{exceptionSummary}</p>
        </div>
      </header>

      <div className="rules-scroll">
        <section className="rule-section mandate-live">
          <SectionHeading number="01" title="The mandate" detail="Binding · read only" />
          <div className="mandate-glass">
            <div className="mandate-rule-grid">
              {rulebook.mandate.map((rule) => <div key={rule.id}><span>{rule.label}</span><strong>{rule.text}</strong></div>)}
            </div>
            <p>{LIVE_MANDATE_NOTICE}</p>
          </div>
        </section>

        <section className="rule-section">
          <SectionHeading number="02" title="Risk limits" detail="Set to and current exposure are kept side by side" />
          <div className="rules-table-wrap">
            <table className="rules-table limits-table">
              <thead><tr><th>Limit</th><th>Set to</th><th>Now at</th><th>Changed by</th><th><span className="sr-only">Edit</span></th></tr></thead>
              <tbody>
                {rulebook.limits.map((limit) => (
                  <tr key={limit.id}>
                    <td className="rule-table-key"><strong>{limit.label}</strong><span>{limit.description}</span></td>
                    <td><strong>{formatRuleValue(limit.setTo, limit.unit)}</strong><span className="rule-cell-note">{formatRupeeEquivalent(limit.setTo, limit.unit, rulebook.fund.size)}</span>{limit.source === 'mandate' && <span className="rule-lock-label">From the mandate</span>}</td>
                    <td className="limit-current">{formatCurrentValue(limit)}</td>
                    <td>{limit.changedBy}{limit.changedOn && <span className="rule-cell-note">{limit.changedOn}</span>}</td>
                    <td className="rule-table-action"><button className="btn small" disabled={limit.source === 'mandate'} onClick={() => setEditingLimit(limit)}>{limit.source === 'mandate' ? 'Locked' : 'Edit'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rule-section">
          <SectionHeading number="03" title="Agent autonomy" detail="Select a movable rule to propose a different boundary" />
          <AutonomyGrid agents={rulebook.agents} mode="live" onMove={(agent, action, from) => setEditingAutonomy({ agent, action, from })} onThresholdEdit={setEditingThreshold} />
        </section>

        <section className="rule-section">
          <SectionHeading number="04" title="Who can overrule whom" detail="Authority does not flow upward automatically" />
          <div className="override-list">
            {rulebook.overrides.map((override) => <div key={override.id}><h3>{override.subject}</h3><p>{override.rule}</p><span>{override.detail}</span></div>)}
          </div>
        </section>

        <section className="rule-section">
          <SectionHeading number="05" title="Prohibited" detail="Three sources · three access levels" />
          <div className="prohibited-list">
            {rulebook.prohibited.map((entry) => (
              <div key={entry.id}>
                <div><strong>{entry.label}</strong><span className="rule-lock-label">{entry.access}</span></div>
                <p>{entry.access === 'hidden' ? `${entry.hiddenCount} companies` : entry.entries.join(' · ')}</p>
                {entry.access === 'editable' && <button className="btn small" onClick={() => setEditingProhibited(entry)}>Edit</button>}
              </div>
            ))}
          </div>
          <p className="rule-note">{COMPLIANCE_OPACITY_NOTE}</p>
        </section>

        <section className="rule-section">
          <SectionHeading number="06" title="Escalation" detail="Who is told what, and how fast" />
          <EscalationTable routes={rulebook.escalation} mode="live" onEdit={setEditingEscalation} />
        </section>

        <section className="rule-section">
          <SectionHeading number="07" title="Active exceptions" detail="Every expiry has a defined consequence" />
          {rulebook.exceptions.length ? rulebook.exceptions.map((exception) => (
            <article className="exception-card" key={exception.id}>
              <div className="exception-main">
                <span className="rule-eyebrow">{formatExceptionCountdown(exception.expiresOn, vm.nowMs)}</span>
                <h3>{exception.subject} may exceed {formatRuleValue(exception.waivedLimit, 'percent')}, ceiling raised to {formatRuleValue(exception.raisedTo, 'percent')}</h3>
                <p>Granted by {exception.grantedBy} · {exception.grantedOn} · expires {exception.expiresLabel}</p>
                <blockquote>Reason: “{exception.reason}”</blockquote>
              </div>
              <div className="exception-expiry">
                <span>At expiry</span>
                <strong>{expiryActionLabel(exception.atExpiry)}</strong>
                <div><button className="btn small" onClick={() => setEditingException({ exception, mode: 'change' })}>Change</button><button className="btn small" onClick={() => setEditingException({ exception, mode: 'end' })}>End now</button></div>
              </div>
            </article>
          )) : <p className="empty-rule-state">No active exceptions.</p>}
        </section>

        <section className="rule-section">
          <SectionHeading number="08" title="Change history" detail="A rule that never fires may be too loose to matter" />
          <button className={`history-filter${neverFiredOnly ? ' selected' : ''}`} aria-pressed={neverFiredOnly} onClick={() => setNeverFiredOnly((value) => !value)}>
            <span className="toggle-box" aria-hidden="true">{neverFiredOnly ? '✓' : ''}</span>
            Rules that have never fired
          </button>
          {neverFiredOnly ? (
            <div className="never-fired-list">
              {rulebook.limits.filter((limit) => NEVER_FIRED_LIMIT_IDS.includes(limit.id)).map((limit) => <div key={limit.id}><strong>{limit.label}</strong><span>Never fired in the available history</span></div>)}
            </div>
          ) : (
            <div className="history-list">
              {rulebook.history.map((entry) => <div key={entry.id}><span>{entry.date}</span><strong>{entry.actor}</strong><span>{entry.rule}</span><span>{entry.from && entry.to ? `${entry.from} → ${entry.to}` : '—'}</span><q>{entry.reason ?? 'No reason recorded'}</q></div>)}
            </div>
          )}
        </section>
      </div>

      {editingLimit && <LimitChangeDialog limit={editingLimit} fundSize={rulebook.fund.size} onClose={() => setEditingLimit(null)} onSave={(value, reason) => { saveLimit(editingLimit.id, value, vm.user.name, reason); setEditingLimit(null); }} />}
      {editingAutonomy && <AutonomyDialog edit={editingAutonomy} onClose={() => setEditingAutonomy(null)} onSave={(to, who, reason) => { moveAutonomy(editingAutonomy.agent.agent, editingAutonomy.action, editingAutonomy.from, to, who, reason, vm.user.name); setEditingAutonomy(null); }} />}
      {editingThreshold && <ThresholdDialog agent={editingThreshold} fundSize={rulebook.fund.size} onClose={() => setEditingThreshold(null)} onSave={(value, reason) => { setAgentThreshold(editingThreshold.agent, value, reason, vm.user.name); setEditingThreshold(null); }} />}
      {editingEscalation && <EscalationDialog route={editingEscalation} onClose={() => setEditingEscalation(null)} onSave={(patch, reason) => { updateEscalation(editingEscalation.id, patch, reason, vm.user.name); setEditingEscalation(null); }} />}
      {editingProhibited && <ProhibitedDialog entry={editingProhibited} onClose={() => setEditingProhibited(null)} onSave={(entries, reason) => { updateProhibited(editingProhibited.id, entries, reason, vm.user.name); setEditingProhibited(null); }} />}
      {editingException && <ExceptionDialog edit={editingException} onClose={() => setEditingException(null)} onSave={(patch, reason) => { if (editingException.mode === 'end') endException(editingException.exception.id, reason, vm.user.name); else updateException(editingException.exception.id, patch, reason, vm.user.name); setEditingException(null); }} />}
    </div>
  );
}

function ThresholdDialog({ agent, fundSize, onClose, onSave }: { agent: AgentAutonomy; fundSize: number; onClose: () => void; onSave: (value: number, reason: string) => void }) {
  const [value, setValue] = useState(agent.sizeThresholdPctOfFund === null ? '' : String(agent.sizeThresholdPctOfFund));
  const [reason, setReason] = useState('');
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed !== agent.sizeThresholdPctOfFund;
  return <SimpleDialog title={`${agent.agent} size threshold`} eyebrow="Agent autonomy" onClose={onClose}>
    <div className="rule-diff"><div><span>Current</span><strong>{agent.sizeThresholdPctOfFund === null ? 'Not set' : formatRuleValue(agent.sizeThresholdPctOfFund, 'percent')}</strong></div><div><span>Proposed</span><label className="threshold-dialog-input"><input autoFocus type="number" step="0.1" value={value} onChange={(event) => setValue(event.target.value)} /><span>% of fund</span></label></div></div>
    {valid && <div className="limit-live-equivalent"><span>Capital equivalent</span><strong>{formatRupeeEquivalent(parsed, 'percent', fundSize)}</strong></div>}
    <ReasonField value={reason} onChange={setReason} />
    <DialogActions onCancel={onClose} disabled={!valid || !reason.trim()} onSave={() => onSave(parsed, reason.trim())} label="Save threshold change" />
  </SimpleDialog>;
}

function SectionHeading({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="rule-section-heading"><span>{number}</span><h2>{title}</h2><p>{detail}</p></div>;
}

function AutonomyDialog({ edit, onClose, onSave }: { edit: AutonomyEdit; onClose: () => void; onSave: (to: AutonomyColumn, who: string, reason: string) => void }) {
  const options: AutonomyColumn[] = ['alone', 'human', 'never'];
  const [to, setTo] = useState<AutonomyColumn>(edit.from);
  const [who, setWho] = useState('Fund Manager');
  const [reason, setReason] = useState('');
  return <SimpleDialog title={edit.action} eyebrow={`${edit.agent.agent} autonomy`} onClose={onClose}>
    <div className="rule-diff"><div><span>Current</span><strong>{autonomyColumnLabel(edit.from)}</strong></div><div><span>Proposed</span><select value={to} onChange={(event) => setTo(event.target.value as AutonomyColumn)}>{options.map((option) => <option value={option} key={option}>{autonomyColumnLabel(option)}</option>)}</select></div></div>
    {to === 'human' && <label className="rule-reason-field"><span>Who</span><select value={who} onChange={(event) => setWho(event.target.value)}>{HUMAN_ROLES.map((role) => <option key={role}>{role}</option>)}</select></label>}
    <ReasonField value={reason} onChange={setReason} />
    <DialogActions onCancel={onClose} disabled={to === edit.from || !reason.trim()} onSave={() => onSave(to, who, reason.trim())} label="Save autonomy change" />
  </SimpleDialog>;
}

function EscalationDialog({ route, onClose, onSave }: { route: EscalationRoute; onClose: () => void; onSave: (patch: Partial<EscalationRoute>, reason: string) => void }) {
  const [recipient, setRecipient] = useState(route.recipient);
  const [channel, setChannel] = useState(route.channel);
  const [timing, setTiming] = useState(route.timing);
  const [reason, setReason] = useState('');
  const changed = recipient !== route.recipient || channel !== route.channel || timing !== route.timing;
  return <SimpleDialog title={route.event} eyebrow="Escalation route" onClose={onClose}>
    <div className="dialog-form-grid">
      <label><span>Who is told</span><select value={recipient} onChange={(event) => setRecipient(event.target.value)}>{[...HUMAN_ROLES, 'all four'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>Channel</span><select value={channel} onChange={(event) => setChannel(event.target.value)}>{ESCALATION_CHANNELS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>Timing</span><select value={timing} onChange={(event) => setTiming(event.target.value)}>{ESCALATION_TIMINGS.map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    <ReasonField value={reason} onChange={setReason} />
    <DialogActions onCancel={onClose} disabled={!changed || !reason.trim()} onSave={() => onSave({ recipient, channel, timing }, reason.trim())} label="Save route change" />
  </SimpleDialog>;
}

function ProhibitedDialog({ entry, onClose, onSave }: { entry: ProhibitedEntry; onClose: () => void; onSave: (entries: string[], reason: string) => void }) {
  const [value, setValue] = useState(entry.entries.join(', '));
  const [reason, setReason] = useState('');
  const entries = value.split(',').map((item) => item.trim()).filter(Boolean);
  return <SimpleDialog title={entry.label} eyebrow="Prohibited list" onClose={onClose}>
    <label className="rule-reason-field"><span>Companies, separated by commas</span><textarea rows={3} value={value} onChange={(event) => setValue(event.target.value)} /></label>
    <ReasonField value={reason} onChange={setReason} />
    <DialogActions onCancel={onClose} disabled={!entries.length || !reason.trim()} onSave={() => onSave(entries, reason.trim())} label="Save list change" />
  </SimpleDialog>;
}

function ExceptionDialog({ edit, onClose, onSave }: { edit: { exception: ActiveException; mode: 'change' | 'end' }; onClose: () => void; onSave: (patch: Partial<ActiveException>, reason: string) => void }) {
  const [expiresOn, setExpiresOn] = useState(edit.exception.expiresOn.slice(0, 10));
  const [atExpiry, setAtExpiry] = useState(edit.exception.atExpiry);
  const [reason, setReason] = useState('');
  const ending = edit.mode === 'end';
  return <SimpleDialog title={ending ? `End ${edit.exception.subject} exception` : `Change ${edit.exception.subject} exception`} eyebrow="Active exception" onClose={onClose}>
    {!ending && <div className="dialog-form-grid"><label><span>Expires on</span><input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label><label><span>At expiry</span><select value={atExpiry} onChange={(event) => setAtExpiry(event.target.value as ActiveException['atExpiry'])}><option value="force-trim">Force trim</option><option value="re-alert">Re-alert</option><option value="auto-revert">Auto-revert</option></select></label></div>}
    {ending && <p className="rule-dialog-copy">The waived ceiling ends immediately and the normal limit applies again.</p>}
    <ReasonField value={reason} onChange={setReason} />
    <DialogActions onCancel={onClose} disabled={!reason.trim()} onSave={() => onSave(ending ? {} : { expiresOn: `${expiresOn}T23:59:00+05:30`, atExpiry }, reason.trim())} label={ending ? 'End exception now' : 'Save exception change'} />
  </SimpleDialog>;
}

function SimpleDialog({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="overlay rule-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="dialog rule-dialog" role="dialog" aria-modal="true"><div className="rule-dialog-head"><div><span className="rule-eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="btn small" onClick={onClose}>Close</button></div>{children}</div></div>;
}

function ReasonField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="rule-reason-field"><span>Reason for the record</span><textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Required before this rule can change" /></label>;
}

function DialogActions({ onCancel, disabled, onSave, label }: { onCancel: () => void; disabled: boolean; onSave: () => void; label: string }) {
  return <div className="rule-dialog-actions"><button className="btn small" onClick={onCancel}>Cancel</button><button className="btn primary" disabled={disabled} onClick={onSave}>{label}</button></div>;
}
