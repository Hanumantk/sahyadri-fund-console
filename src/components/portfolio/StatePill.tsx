import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { fmtCr, fmtInt, fmtPct, fmtWeekdayDayMonth, dateMs } from '../../data/format';
import type { Holding, HoldingState } from '../../data/portfolio';
import { useStore } from '../../state/store';
import { Icon } from '../ui/Icon';

export function StatePill({ state, holding, fundValue }: { state: HoldingState; holding: Holding; fundValue: number }) {
  const { select } = useStore();
  const pill = (text: string, tone: 'muted' | 'over' = 'muted') => (
    <span className={`state-pill ${tone} ${state.kind}`}>
      {tone === 'over' && <Icon name="warning" />}
      {text}
    </span>
  );

  switch (state.kind) {
    case 'over_limit':
      return (
        <Fragment>
          {pill(`${fmtPct(holding.weightPct)} · over ${fmtPct(state.limitPct, 0)} limit`, 'over')}
          {pill(`Exception to ${fmtPct(state.exceptionPct, 0)} · expires ${fmtWeekdayDayMonth(dateMs(state.exceptionExpires))}`)}
        </Fragment>
      );
    case 'near_limit': {
      const room = ((state.limitPct - holding.weightPct) / 100) * fundValue;
      return pill(`${fmtPct(holding.weightPct)} of ${fmtPct(state.limitPct, 0)} · ${fmtCr(room)} room`);
    }
    case 'buying':
      return pill(`Buying · ${state.donePieces} of ${state.totalPieces} pieces · ${fmtCr(state.filledValue)} of ${fmtCr(state.orderValue)}`);
    case 'unsettled':
      return pill(`Sold ${fmtCr(state.soldValue)} today · settles ${fmtWeekdayDayMonth(dateMs(state.settlementDate))}`);
    case 'stale_price':
      return pill('Price stale');
    case 'records_disagree': {
      const content = pill(`Records disagree · ${fmtInt(Math.abs(state.brokerShares - state.ourShares))} shares`);
      return (
        <Link
          className="state-pill-link"
          to="/"
          onClick={(event) => {
            event.stopPropagation();
            select({ kind: 'decision', id: state.decisionId });
          }}
          title="Open the matching decision on Home"
        >
          {content}
        </Link>
      );
    }
  }
}
