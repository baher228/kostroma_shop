import { z } from 'zod';
import { QcError, type DialogTranscript, type QualityClass } from './types';

export const ANALYSIS_SCHEMA_VERSION = '1.0';
export const SCORECARD_VERSION = '1.0';
export const criterionKeys = ['greeting', 'politeness', 'needsDiscovery', 'productKnowledge', 'objectionHandling', 'closing', 'scriptCompliance'] as const;

const text = z.string().trim().min(1).max(4000);
const criterionSchema = z.strictObject({
  score: z.number().min(0).max(10),
  maxScore: z.literal(10),
  status: z.enum(['good', 'neutral', 'needs_improvement', 'not_applicable']),
  comment: text,
});
const findingSchema = z.strictObject({
  type: z.string().trim().min(1).max(100),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: text,
  evidence: text.nullable(),
});

// The same schema drives provider JSON constraints and server-side validation.
export const dialogAnalysisSchema = z.strictObject({
  schemaVersion: z.literal(ANALYSIS_SCHEMA_VERSION),
  summary: z.strictObject({ short: z.string().trim().min(1).max(1500), customerIntent: text, outcome: text }),
  quality: z.strictObject({
    overallScore: z.number().min(0).max(100),
    criteria: z.strictObject({
      greeting: criterionSchema,
      politeness: criterionSchema,
      needsDiscovery: criterionSchema,
      productKnowledge: criterionSchema,
      objectionHandling: criterionSchema,
      closing: criterionSchema,
      scriptCompliance: criterionSchema,
    }),
  }),
  customer: z.strictObject({
    sentiment: z.enum(['positive', 'neutral', 'negative', 'unknown']),
    satisfaction: z.enum(['satisfied', 'neutral', 'dissatisfied', 'unknown']),
  }),
  dialog: z.strictObject({ hasConflict: z.boolean(), hasComplaint: z.boolean(), hasObjection: z.boolean(), saleIntentDetected: z.boolean() }),
  strengths: z.array(text).max(30),
  problems: z.array(findingSchema).max(30),
  violations: z.array(findingSchema).max(30),
  recommendations: z.array(text).max(30),
});

export type DialogAnalysis = z.infer<typeof dialogAnalysisSchema>;
export const dialogAnalysisJsonSchema = z.toJSONSchema(dialogAnalysisSchema, { target: 'draft-7' });
export const DEFAULT_QUALITY_THRESHOLDS: Readonly<{ good: number; neutral: number }> = Object.freeze({ good: 80, neutral: 60 });

export function classifyQuality(score: number, thresholds = DEFAULT_QUALITY_THRESHOLDS): QualityClass {
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new QcError('INVALID_SCORE', 'Quality score must be between 0 and 100.');
  if (!Number.isFinite(thresholds.good) || !Number.isFinite(thresholds.neutral) || thresholds.neutral < 0 || thresholds.good > 100 || thresholds.neutral >= thresholds.good) {
    throw new QcError('INVALID_THRESHOLDS', 'Quality thresholds must satisfy 0 <= neutral < good <= 100.');
  }
  return score >= thresholds.good ? 'good' : score >= thresholds.neutral ? 'neutral' : 'bad';
}

export function calculateOverallScore(criteria: DialogAnalysis['quality']['criteria']): number {
  let sum = 0;
  let maximum = 0;
  for (const key of criterionKeys) {
    const parsed = criterionSchema.safeParse(criteria[key]);
    if (!parsed.success) throw new QcError('INVALID_SCORE', 'A criterion score is invalid.');
    if (parsed.data.status === 'not_applicable') {
      if (parsed.data.score !== 0) throw new QcError('INVALID_SCORE', 'An inapplicable criterion must have score zero.');
      continue;
    }
    const expected = parsed.data.score >= 8 ? 'good' : parsed.data.score >= 6 ? 'neutral' : 'needs_improvement';
    if (parsed.data.status !== expected) throw new QcError('INVALID_SCORE', 'Criterion status does not match its score.');
    sum += parsed.data.score;
    maximum += parsed.data.maxScore;
  }
  if (!maximum) throw new QcError('INVALID_SCORE', 'At least one criterion must be applicable.');
  return Math.round((sum / maximum) * 10000) / 100;
}

function normalizeEvidence(value: string): string { return value.normalize('NFC').replace(/\s+/gu, ' ').trim(); }

export function validateAnalysis(value: unknown, transcript?: DialogTranscript): DialogAnalysis {
  const parsed = dialogAnalysisSchema.safeParse(value);
  if (!parsed.success) throw new QcError('ANALYSIS_SCHEMA_INVALID', 'The analysis did not match the required response schema.', 502, true);
  const analysis = parsed.data;
  if (transcript) {
    const source = normalizeEvidence(transcript.segments.map((segment) => segment.text).join(' '));
    for (const finding of [...analysis.problems, ...analysis.violations]) {
      if (finding.evidence !== null && !source.includes(normalizeEvidence(finding.evidence))) {
        throw new QcError('ANALYSIS_EVIDENCE_INVALID', 'The analysis contains evidence absent from the transcript.', 502, true);
      }
    }
  }
  try { analysis.quality.overallScore = calculateOverallScore(analysis.quality.criteria); }
  catch { throw new QcError('ANALYSIS_SCORE_INVALID', 'The analysis contains inconsistent criterion scores.', 502, true); }
  return analysis;
}
