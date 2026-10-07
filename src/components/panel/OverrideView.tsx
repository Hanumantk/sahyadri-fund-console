import type { OverrideOption } from '../../data/derive';
import { fmtCr, fmtPct, fmtTime } from '../../data/format';
import { LIMITS } from '../../data/scenario';
import { useStore } from '../../state/store';
import { RecordLink, Section } from '../ui/bits';
import { ExceptionInForce, OverrideForm } from './OverrideControls';

/**
 * Overruling one agent block.
 *
 * The order of this panel is the argument it makes. The agent's own sentence
 * comes first, before any control, because an override screen that opens with
 * the button has already decided. Then what it would do to the fund, in the same
 * three figures a proposal shows. Then who is allowed to — and when the answer is
 * no, the same place sends it to the person who may and keeps it in view.
 *
 * What the panel will not do: make the block go away. The record keeps it, the
 * agent keeps counting against it, and the override lapses at the close.
 */
export function OverrideView({ option }: { option: OverrideOption }) {
  const { override } = useStore();
  const ex = option.exception;

  return (
    <>
      <div className="section">
        <div className="ask-line">{option.agentReason}</div>
        <div className="why-line">
          Blocked by {option.agentName} at {fmtTime(option.atMs)} · <RecordLink id={option.id} />
        </div>
      </div>

      <div className="panel-cols">
        <Section title={option.measuredTitle}>
          <div className="card override-copy">
            {option.breachLine || option.agentReason}
            <div className="faint override-note">{option.natureLine}</div>
          </div>
        </Section>
        <Section title="The rule on overruling it">
          <div className="card override-copy">{option.rule}</div>
        </Section>
      </div>

      {option.preview && !ex && (
        <Section title="What overriding would do">
          <div className="preview">
            <div>
              <div className="pv-k">{option.company} position</div>
              <div className={`pv-v${option.preview.positionPct > LIMITS.maxCompanyPct ? ' red' : ''}`}>{fmtPct(option.preview.positionPct)}</div>
              <div className="pv-s">of fund · limit {fmtPct(LIMITS.maxCompanyPct, 0)}</div>
            </div>
            <div>
              <div className="pv-k">{option.preview.sectorName} sector</div>
              <div className={`pv-v${option.preview.sectorUsedPct > 100 ? ' red' : option.preview.sectorUsedPct >= LIMITS.nearLimitPct ? ' amber' : ''}`}>
                {fmtPct(option.preview.sectorPct)}
              </div>
              <div className="pv-s">
                of fund · {fmtPct(option.preview.sectorUsedPct, 0)} of its {fmtPct(LIMITS.maxSectorPct, 0)} limit
              </div>
            </div>
            <div>
              <div className="pv-k">Cash after</div>
              <div className={`pv-v${option.preview.cashAfterPct < LIMITS.minCashPct ? ' red' : ''}`}>{fmtCr(option.preview.cashAfter)}</div>
              <div className="pv-s">
                {fmtPct(option.preview.cashAfterPct)} of fund · minimum {fmtPct(LIMITS.minCashPct, 0)}
              </div>
            </div>
            <div className="preview-note">
              {option.breachLine}
              {option.extraBreaches.map((b) => ` · and ${b}`).join('')}
            </div>
          </div>
        </Section>
      )}

      {ex ? (
        <ExceptionInForce
          ex={ex}
          subject={`${option.agentName} has not changed its mind and still counts ${option.company} against the limit. ${option.expiryLine}.`}
        />
      ) : (
        <OverrideForm
          authority={option}
          subjectKey={option.key}
          title="Your override · it suspends one block for one trade, until the close"
          confirmLabel={`Override ${option.agentName}${option.amount > 0 ? ` and buy ${fmtCr(option.amount)}` : ''}`}
          onConfirm={(reason, cosigner) => override(option.key, reason, cosigner)}
        />
      )}

      <div className="faint override-note">
        The block stays in the log and in {option.agentName}'s count whatever you decide here. Nothing a person does removes an agent's decision from the record.
      </div>
    </>
  );
}
