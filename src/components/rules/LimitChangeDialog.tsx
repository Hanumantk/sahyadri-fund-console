import { useMemo, useState } from 'react';
import {
  COSIGNERS,
  formatRupeeEquivalent,
  formatRuleValue,
  isWidening,
  valuesEqual,
  type Limit,
  type RuleValue,
} from '../../data/rulebook';

export function LimitChangeDialog({ limit, fundSize, onClose, onSave }: { limit: Limit; fundSize: number; onClose: () => void; onSave: (value: RuleValue, reason: string) => void }) {
  const range = Array.isArray(limit.setTo);
  const [first, setFirst] = useState(String(Array.isArray(limit.setTo) ? limit.setTo[0] : limit.setTo));
  const [second, setSecond] = useState(String(Array.isArray(limit.setTo) ? limit.setTo[1] : ''));
  const [stage, setStage] = useState<'edit' | 'confirm'>('edit');
  const [reason, setReason] = useState('');
  const [cosigner, setCosigner] = useState('');
  const [showRows, setShowRows] = useState(false);

  const next = useMemo<RuleValue | null>(() => {
    if (first.trim() === '' || (range && second.trim() === '')) return null;
    const a = Number(first);
    const b = Number(second);
    if (!Number.isFinite(a) || (range && !Number.isFinite(b))) return null;
    if (range && a >= b) return null;
    return range ? [a, b] : a;
  }, [first, second, range]);
  const widening = next ? isWidening(limit, next) : false;
  const changed = next ? !valuesEqual(limit.setTo, next) : false;
  const canSave = Boolean(reason.trim()) && (!widening || Boolean(cosigner));

  return (
    <div className="overlay rule-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dialog rule-dialog" role="dialog" aria-modal="true" aria-labelledby="limit-dialog-title">
        <div className="rule-dialog-head">
          <div>
            <span className="rule-eyebrow">{stage === 'edit' ? 'Rehearsal before commit' : 'Confirm the diff'}</span>
            <h2 id="limit-dialog-title">{limit.label}</h2>
          </div>
          <button className="btn small" onClick={onClose}>Close</button>
        </div>

        {stage === 'edit' ? (
          <>
            <p className="rule-dialog-copy">Test a new boundary against the last month before it becomes a live rule.</p>
            <div className="limit-edit-fields">
              <label>
                <span>{range ? 'Lower bound' : 'New limit'}</span>
                <input autoFocus type="number" step="0.1" value={first} onChange={(event) => setFirst(event.target.value)} />
              </label>
              {range && (
                <label>
                  <span>Upper bound</span>
                  <input type="number" step="0.1" value={second} onChange={(event) => setSecond(event.target.value)} />
                </label>
              )}
              {next && <div className="limit-live-equivalent"><span>Capital equivalent</span><strong>{formatRupeeEquivalent(next, limit.unit, fundSize)}</strong></div>}
            </div>
            <Rehearsal limit={limit} showRows={showRows} onToggle={() => setShowRows((value) => !value)} />
            <div className="rule-dialog-actions">
              <button className="btn small" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={!changed} onClick={() => setStage('confirm')}>Review change</button>
            </div>
          </>
        ) : next ? (
          <>
            <div className="rule-diff" aria-label="Rule change">
              <div><span>Current</span><strong>{formatRuleValue(limit.setTo, limit.unit)}</strong><small>{formatRupeeEquivalent(limit.setTo, limit.unit, fundSize)}</small></div>
              <div><span>Proposed</span><strong>{formatRuleValue(next, limit.unit)}</strong><small>{formatRupeeEquivalent(next, limit.unit, fundSize)}</small></div>
            </div>
            <Rehearsal limit={limit} showRows={showRows} onToggle={() => setShowRows((value) => !value)} />
            {widening && (
              <div className="loosen-warning">
                <strong>This loosens a control. It needs a second person.</strong>
                <label>
                  <span>Co-signer</span>
                  <select value={cosigner} onChange={(event) => setCosigner(event.target.value)}>
                    <option value="">Select a co-signer</option>
                    {COSIGNERS.map((person) => <option key={person}>{person}</option>)}
                  </select>
                </label>
              </div>
            )}
            <label className="rule-reason-field">
              <span>Reason for the record</span>
              <textarea autoFocus rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required before this rule can change" />
            </label>
            <div className="rule-dialog-actions">
              <button className="btn small" onClick={() => setStage('edit')}>Back</button>
              <button className="btn primary" disabled={!canSave} onClick={() => onSave(next, reason.trim())}>Save rule change</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Rehearsal({ limit, showRows, onToggle }: { limit: Limit; showRows: boolean; onToggle: () => void }) {
  return (
    <div className="rehearsal-result">
      <span className="rule-eyebrow">What this would have done</span>
      <p>{limit.rehearsal.summary}</p>
      {limit.rehearsal.rows.length > 0 && <button className="btn link" onClick={onToggle}>{showRows ? 'Hide proposals' : 'See them'}</button>}
      {showRows && (
        <div className="rehearsal-rows">
          {limit.rehearsal.rows.map((row) => (
            <div key={`${row.date}-${row.company}`}>
              <span>{row.date}</span><strong>{row.company}</strong><span>{formatRuleValue(row.sizePct, 'percent')}</span><span>{row.result}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
