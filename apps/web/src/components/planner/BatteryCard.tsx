import type { BatteryAssessment, ChargePlan } from '@evcp/models';
import { Card, Notice, Stat } from '@/components/ui';
import { renderAdvisory, type Dict } from '@/i18n';
import { formatNumber } from '@/lib/format';

/** Stress is a relative signal, so the bar is coloured by band rather than by value. */
function stressColor(score: number): string {
  if (score >= 60) return 'var(--danger)';
  if (score >= 30) return 'var(--warn)';
  return 'var(--ok)';
}

export function BatteryCard({
  assessment,
  rangeKm,
  plan,
  t,
}: {
  assessment: BatteryAssessment;
  rangeKm: number;
  plan: ChargePlan | null;
  t: Dict;
}) {
  const { calibration } = assessment;

  return (
    <Card title={t.planner.battery}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label={t.planner.recommendedRange}
            value={`${assessment.dailyRange.min}–${assessment.dailyRange.max}%`}
          />
          <Stat label={t.planner.storageSoc} value={`${assessment.storageSoc}%`} />
          <Stat
            label={t.planner.estimatedRange}
            value={`${formatNumber(rangeKm, 0)} ${t.units.km}`}
            sub={plan ? `@ ${plan.endSoc}%` : undefined}
          />
          <Stat
            label={t.planner.calibration}
            value={
              calibration.daysSinceFullCharge === null
                ? '—'
                : `${calibration.daysSinceFullCharge} ${t.common.days}`
            }
            sub={
              calibration.due
                ? t.planner.calibrationDue
                : calibration.daysSinceFullCharge === null
                  ? t.planner.calibrationUnknown
                  : t.planner.calibrationOk({ days: calibration.daysSinceFullCharge })
            }
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="stat-label">{t.planner.stressScore}</span>
            <span className="tnum text-sm font-semibold" style={{ color: stressColor(assessment.stressScore) }}>
              {assessment.stressScore.toFixed(0)} / 100
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-line"
            role="meter"
            aria-valuenow={assessment.stressScore}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t.planner.stressScore}
          >
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${Math.max(2, assessment.stressScore)}%`,
                background: stressColor(assessment.stressScore),
              }}
            />
          </div>
        </div>

        {assessment.advices.length > 0 && (
          <div className="space-y-2">
            {assessment.advices.map((advice, index) => (
              <Notice key={`${advice.code}-${index}`} severity={advice.severity}>
                {renderAdvisory(t.advice, advice.code, advice.params)}
              </Notice>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
