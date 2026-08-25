import {
  DEFAULT_STALENESS_THRESHOLDS,
  type StalenessThresholds,
} from '@job-harvester/shared';

export function getStalenessThresholds(): StalenessThresholds {
  const defaultDays = Number(
    process.env.STALENESS_DEFAULT_DAYS ??
      DEFAULT_STALENESS_THRESHOLDS.defaultDays,
  );
  const afterInterviewDays = Number(
    process.env.STALENESS_AFTER_INTERVIEW_DAYS ??
      DEFAULT_STALENESS_THRESHOLDS.afterInterviewDays,
  );

  return {
    defaultDays: Number.isFinite(defaultDays)
      ? defaultDays
      : DEFAULT_STALENESS_THRESHOLDS.defaultDays,
    afterInterviewDays: Number.isFinite(afterInterviewDays)
      ? afterInterviewDays
      : DEFAULT_STALENESS_THRESHOLDS.afterInterviewDays,
  };
}
