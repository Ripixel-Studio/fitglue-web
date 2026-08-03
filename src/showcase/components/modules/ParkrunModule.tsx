import React from 'react';
import type { ParkrunSummary } from '../../../types/pb/models/activity/enrichments';
import { Module } from './index';

interface Props {
  data?: ParkrunSummary;
}

export default function ParkrunModule({ data }: Props): React.ReactElement | null {
  if (!data || !data.eventName) return null;

  const pbStamps = (
    <>
      {data.isTimePb && <span className="stamp stamp--pb">TIME PB</span>}
      {data.isAgeGradePb && <span className="stamp stamp--pb">AG PB</span>}
    </>
  );

  return (
    <Module title={`🎽 ${data.eventName}`} span={12}>
      {(data.isTimePb || data.isAgeGradePb) && (
        <div>{pbStamps}</div>
      )}
      <div className="parkrun-band">
        <div className="mini">
          <span className="mini__value mini__value--aurora">{data.finishTime}</span>
          <span className="mini__label">FINISH TIME</span>
        </div>
        <div className="mini">
          <span className="mini__value">#{data.position}</span>
          <span className="mini__label">POSITION</span>
        </div>
        <div className="mini">
          <span className="mini__value">{data.ageGrade}</span>
          <span className="mini__label">AGE GRADE</span>
        </div>
        {/* Total run count is unknown for manual entries (the fetch never resolved),
            where it arrives as 0/undefined — omit the tile rather than show "0". */}
        {(data.totalParkruns ?? 0) > 0 && (
          <div className="mini">
            <span className="mini__value">{data.totalParkruns}</span>
            <span className="mini__label">TOTAL RUNS</span>
          </div>
        )}
      </div>
    </Module>
  );
}
