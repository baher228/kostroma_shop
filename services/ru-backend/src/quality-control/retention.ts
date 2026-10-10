import type { DialogAnalysis } from './analysis';
import type { QualityClass, QcRetentionClass } from './types';

export type RetentionPolicy = {
  retentionClass: Exclude<QcRetentionClass, 'pinned'>;
  retentionReason: string;
  retentionMs: number;
};

export type RetentionDurations = { standardMs: number; badMs: number; interestingMs: number };

export function retentionForAnalysis(
  analysis: DialogAnalysis,
  qualityClass: QualityClass,
  durations: RetentionDurations,
): RetentionPolicy {
  if (qualityClass === 'good' && (analysis.dialog.upsellDetected || analysis.dialog.crossSellDetected)) {
    return {
      retentionClass: 'interesting',
      retentionReason: analysis.dialog.upsellDetected
        ? 'Strong dialog with a detected upsell.'
        : 'Strong dialog with a detected cross-sell.',
      retentionMs: durations.interestingMs,
    };
  }
  const critical = [...analysis.problems, ...analysis.violations].some(item => item.severity === 'critical');
  if (qualityClass === 'bad' || analysis.dialog.hasConflict || analysis.dialog.hasComplaint || critical) {
    return {
      retentionClass: 'bad',
      retentionReason: critical
        ? 'Critical issue retained for manager review.'
        : analysis.dialog.hasComplaint || analysis.dialog.hasConflict
          ? 'Complaint or conflict retained for manager review.'
          : 'Poor-quality dialog retained for coaching.',
      retentionMs: durations.badMs,
    };
  }
  return { retentionClass: 'standard', retentionReason: 'Routine dialog.', retentionMs: durations.standardMs };
}
