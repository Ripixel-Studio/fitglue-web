import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StreakDayState } from '../../../../types/pb/models/activity/enrichments';

import HeartRateModule from '../HeartRateModule';
import HRZonesModule from '../HRZonesModule';
import PaceModule from '../PaceModule';
import SpeedModule from '../SpeedModule';
import CadenceModule from '../CadenceModule';
import PowerModule from '../PowerModule';
import ElevationModule from '../ElevationModule';
import EffortModule from '../EffortModule';
import CaloriesModule from '../CaloriesModule';
import TrainingLoadModule from '../TrainingLoadModule';
import RecoveryModule from '../RecoveryModule';
import StreakModule from '../StreakModule';
import WeatherModule from '../WeatherModule';
import TemperatureModule from '../TemperatureModule';
import IntervalsModule from '../IntervalsModule';
import RunningDynamicsModule from '../RunningDynamicsModule';
import ParkrunModule from '../ParkrunModule';
import SpotifyModule from '../SpotifyModule';
import GoalTrackerModule from '../GoalTrackerModule';
import MuscleHeatmapModule from '../MuscleHeatmapModule';
import SetListModule from '../SetListModule';
import PersonalRecordsCallout from '../PersonalRecordsCallout';
import PersonalRecordsModule from '../PersonalRecordsModule';
import MilestoneCallout from '../MilestoneCallout';
import BestEffortsModule from '../BestEffortsModule';
import HDropModule from '../HDropModule';

// Module/index imports the logger (which pulls in Sentry) and html-to-image.
// We never trigger the download path, but mock the logger to keep tests isolated.
vi.mock('../../../../shared/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

// Cast helper: build a minimal data object with only the fields a module reads.
const as = <T,>(v: unknown): T => v as T;

describe('HeartRateModule', () => {
  it('renders nothing without avgBpm', () => {
    const { container } = render(<HeartRateModule data={as({ avgBpm: 0 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders heart-rate stats', () => {
    const { getByText } = render(
      <HeartRateModule data={as({ minBpm: 60, avgBpm: 140, maxBpm: 180, driftBpm: 0 })} />,
    );
    expect(getByText('140')).toBeInTheDocument();
  });
});

describe('HRZonesModule', () => {
  it('renders zone bars', () => {
    const { getByText } = render(
      <HRZonesModule
        data={as({ zones: [{ zoneIndex: 1, name: 'Zone 1 (Recovery)', minutes: 10 }] })}
      />,
    );
    expect(getByText(/RECOVERY/)).toBeInTheDocument();
  });
});

describe('PaceModule', () => {
  it('renders pace and splits', () => {
    const { getAllByText } = render(
      <PaceModule
        data={as({
          avgPaceSecondsPerKm: 330,
          bestSplitSecondsPerKm: 300,
          paceDropPercent: 0,
          splits: [{ km: 1, seconds: 330 }],
        })}
      />,
    );
    expect(getAllByText(/5:30\/km/).length).toBeGreaterThan(0);
  });
});

describe('SpeedModule', () => {
  it('renders average and max speed', () => {
    const { getByText } = render(<SpeedModule data={as({ avgSpeedKmh: 30.5, maxSpeedKmh: 45 })} />);
    expect(getByText('30.5')).toBeInTheDocument();
  });

  it('renders per-km splits with genuine per-km speeds, not the average repeated', () => {
    // km 1: 5 m/s (18 km/h), km 2: 10 m/s (36 km/h) — distinct values
    const records = as<unknown[]>([
      { distance: 200, speed: 5 },
      { distance: 600, speed: 5 },
      { distance: 1200, speed: 10 },
      { distance: 1800, speed: 10 },
    ]);
    const { getByText } = render(
      <SpeedModule data={as({ avgSpeedKmh: 27, maxSpeedKmh: 36 })} records={records as never} />,
    );
    expect(getByText('18.0 km/h')).toBeInTheDocument();
    expect(getByText('36.0 km/h')).toBeInTheDocument();
  });
});

describe('CadenceModule', () => {
  it('renders cadence stats', () => {
    const { getByText } = render(<CadenceModule data={as({ avgRpm: 178, maxRpm: 190 })} />);
    expect(getByText('178')).toBeInTheDocument();
  });
});

describe('PowerModule', () => {
  it('renders power stats', () => {
    const { getByText } = render(
      <PowerModule
        data={as({ avgWatts: 220, maxWatts: 600, normalizedPower: 240, kilojoules: 800, intensityFactor: 0.85 })}
      />,
    );
    expect(getByText('220')).toBeInTheDocument();
  });
});

describe('ElevationModule', () => {
  it('renders elevation stats', () => {
    const { getByText } = render(
      <ElevationModule data={as({ totalGainM: 120, totalLossM: 80, maxAltitudeM: 300 })} />,
    );
    expect(getByText(/120m/)).toBeInTheDocument();
  });
});

describe('EffortModule', () => {
  it('renders score and factors', () => {
    const { getByText } = render(
      <EffortModule
        data={as({ score: 72, band: 'Hard', factors: [{ label: 'HR', ratioVsBaseline: 1.2 }] })}
      />,
    );
    expect(getByText('72/100')).toBeInTheDocument();
    expect(getByText('Hard')).toBeInTheDocument();
  });
});

describe('CaloriesModule', () => {
  it('renders kcal and comparison', () => {
    const { getByText } = render(
      <CaloriesModule data={as({ kcal: 540, comparisonText: '2 burgers' })} />,
    );
    expect(getByText('540')).toBeInTheDocument();
    expect(getByText('2 burgers')).toBeInTheDocument();
  });
});

describe('TrainingLoadModule', () => {
  it('renders trimp and bucket', () => {
    const { getByText } = render(
      <TrainingLoadModule data={as({ trimp: 320, bucket: 'Hard', hint: 'Recover well' })} />,
    );
    expect(getByText('320')).toBeInTheDocument();
  });
});

describe('RecoveryModule', () => {
  it('renders recovery stats', () => {
    const { getByText } = render(
      <RecoveryModule
        data={as({
          sessionLoad: 120,
          sevenDayLoad: 500,
          twentyEightDayAvgLoad: 60,
          acuteChronicRatio: 1.25,
          hoursToRecover: 24,
          alert: false,
          alertText: 'Healthy load',
        })}
      />,
    );
    expect(getByText('120')).toBeInTheDocument();
  });
});

describe('StreakModule', () => {
  it('renders streak counts and calendar', () => {
    const { container, getByText } = render(
      <StreakModule
        data={as({
          currentDays: 5,
          longestDays: 10,
          calendar: [{ date: '2026-01-01', state: StreakDayState.STREAK_DAY_STATE_ACTIVE }],
        })}
      />,
    );
    expect(getByText('5')).toBeInTheDocument();
    expect(container.querySelector('.streak-calendar')).toBeTruthy();
  });
});

describe('WeatherModule', () => {
  it('renders weather grid', () => {
    const { getByText } = render(
      <WeatherModule
        data={as({ tempC: 12, weatherDescription: 'Cloudy', windSpeedKph: 10, windDirection: 'NW' })}
      />,
    );
    expect(getByText('Cloudy')).toBeInTheDocument();
  });
});

describe('TemperatureModule', () => {
  it('renders temperature stats', () => {
    const { getByText } = render(
      <TemperatureModule data={as({ minC: 8, avgC: 12, maxC: 16 })} />,
    );
    expect(getByText('12°C')).toBeInTheDocument();
  });
});

describe('IntervalsModule', () => {
  it('renders interval rows', () => {
    const { getByText } = render(
      <IntervalsModule
        data={as({
          workoutName: '5x400m',
          segments: [
            { type: 'work', label: 'Run 1', durationSeconds: 90, distanceMeters: 400, avgHr: 165, avgSpeedMs: 4.5 },
          ],
        })}
      />,
    );
    expect(getByText('Run 1')).toBeInTheDocument();
  });
});

describe('RunningDynamicsModule', () => {
  it('renders dynamics stats', () => {
    const { getByText } = render(
      <RunningDynamicsModule
        data={as({ avgGroundContactMs: 240, avgVerticalOscillationCm: 8.5, avgStepLengthM: 1.2 })}
      />,
    );
    expect(getByText('240ms')).toBeInTheDocument();
  });
});

describe('ParkrunModule', () => {
  it('renders parkrun stats with PB stamps', () => {
    const { getByText } = render(
      <ParkrunModule
        data={as({
          eventName: 'Bushy Parkrun',
          isTimePb: true,
          isAgeGradePb: false,
          finishTime: '21:30',
          position: 12,
          ageGrade: '65%',
          totalParkruns: 50,
        })}
      />,
    );
    expect(getByText('21:30')).toBeInTheDocument();
    expect(getByText('TIME PB')).toBeInTheDocument();
    expect(getByText('50')).toBeInTheDocument();
    expect(getByText('TOTAL RUNS')).toBeInTheDocument();
  });

  it('omits the TOTAL RUNS tile for a manual entry with no run count', () => {
    const { queryByText, getByText } = render(
      <ParkrunModule
        data={as({
          eventName: 'Bushy Parkrun',
          finishTime: '21:30',
          position: 12,
          ageGrade: '65%',
          totalParkruns: 0,
        })}
      />,
    );
    // Position and time still render; the bogus "0 TOTAL RUNS" tile does not.
    expect(getByText('#12')).toBeInTheDocument();
    expect(queryByText('TOTAL RUNS')).not.toBeInTheDocument();
  });
});

describe('SpotifyModule', () => {
  it('renders track list', () => {
    const { getByText } = render(
      <SpotifyModule
        data={as({ tracks: [{ title: 'Song A', artist: 'Artist A' }], totalCount: 1 })}
      />,
    );
    expect(getByText('Song A')).toBeInTheDocument();
  });
});

describe('GoalTrackerModule', () => {
  it('renders goal entries', () => {
    const { getByText } = render(
      <GoalTrackerModule
        data={as({
          goals: [{ label: 'Weekly km', current: 30, target: 50, unit: 'km', daysRemaining: 3, onPace: true }],
        })}
      />,
    );
    expect(getByText('Weekly km')).toBeInTheDocument();
    expect(getByText('ON PACE ✓')).toBeInTheDocument();
  });

  it('rounds a noisy float progress value and pluralises days', () => {
    const { getByText } = render(
      <GoalTrackerModule
        data={as({
          goals: [
            { label: 'Weekly', current: 10.0102001953125, target: 20, unit: 'KM', daysRemaining: 1, onPace: false },
          ],
        })}
      />,
    );
    expect(getByText('10/20 KM')).toBeInTheDocument();
    expect(getByText('1 day left')).toBeInTheDocument();
  });
});

describe('MuscleHeatmapModule', () => {
  it('renders an image when imageUrl present', () => {
    const { container } = render(
      <MuscleHeatmapModule data={as({ imageUrl: 'http://x/y.png' })} imageUrl="http://x/y.png" />,
    );
    expect(container.querySelector('img.muscle-heatmap-image')).toBeTruthy();
  });

  it('renders muscle bars without an image', () => {
    const { getByText } = render(
      <MuscleHeatmapModule data={as({ primary: ['MUSCLE_GROUP_CHEST'], secondary: ['MUSCLE_GROUP_BACK'] })} />,
    );
    expect(getByText('CHEST')).toBeInTheDocument();
  });
});

describe('SetListModule', () => {
  it('renders exercise rows from sessions', () => {
    const { getByText } = render(
      <SetListModule
        sessions={as([
          { strengthSets: [{ exerciseName: 'Bench Press', reps: 10, weightKg: 60, durationSeconds: 0, distanceMeters: 0 }] },
        ])}
        prTypes={new Set(['Bench Press'])}
      />,
    );
    expect(getByText('Bench Press')).toBeInTheDocument();
  });
});

describe('PersonalRecordsCallout', () => {
  it('renders the top PR band', () => {
    const { container } = render(
      <PersonalRecordsCallout
        data={as({
          records: [{ recordType: 'BENCH_1RM', newValue: 100, previousValue: 95, unit: 'kg' }],
        })}
      />,
    );
    expect(container.querySelector('.pr-band')).toBeTruthy();
  });
});

describe('PersonalRecordsModule', () => {
  it('renders the PR wall', () => {
    const { container } = render(
      <PersonalRecordsModule
        data={as({
          records: [{ recordType: 'BENCH_1RM', newValue: 100, previousValue: 95, unit: 'kg' }],
        })}
      />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});

describe('MilestoneCallout', () => {
  it('renders nothing without lifetime distance', () => {
    const { container } = render(<MilestoneCallout data={as({ lifetimeDistanceKm: 0 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders lifetime distance and next-milestone progress', () => {
    const { getByText } = render(
      <MilestoneCallout
        data={as({
          milestoneKm: 0,
          lifetimeDistanceKm: 1094.1,
          nextMilestoneKm: 2500,
          activityTypeLabel: 'running',
        })}
      />,
    );
    expect(getByText(/Lifetime running/)).toBeInTheDocument();
    expect(getByText('1094.1 km')).toBeInTheDocument();
    expect(getByText(/Next milestone: 2500 km · 1405.9 km to go/)).toBeInTheDocument();
  });

  it('shows a reached-milestone line when one was crossed', () => {
    const { getByText } = render(
      <MilestoneCallout
        data={as({ milestoneKm: 1000, lifetimeDistanceKm: 1002.5, activityTypeLabel: 'running' })}
      />,
    );
    expect(getByText(/1000 km milestone reached/)).toBeInTheDocument();
  });
});

describe('BestEffortsModule', () => {
  it('renders best effort rows', () => {
    const { getByText } = render(
      <BestEffortsModule
        data={as({ efforts: [{ distanceKey: '1k', display: '1 km', timeSeconds: 200 }] })}
      />,
    );
    expect(getByText('1 km')).toBeInTheDocument();
  });
});

describe('HDropModule', () => {
  it('renders sweat-analysis stats', () => {
    const { getByText } = render(
      <HDropModule
        data={as({
          totalFluidLossL: 1.25,
          sweatRateLPerHr: 0.9,
          totalSodiumMg: 800,
          totalPotassiumMg: 200,
          avgHdropScore: 75,
          sodiumConcentrationMgPerL: 640,
          minTemperatureC: 30,
          maxTemperatureC: 34,
          timeseries: [],
        })}
      />,
    );
    expect(getByText(/1.25L/)).toBeInTheDocument();
  });
});
