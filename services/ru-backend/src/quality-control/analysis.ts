import { z } from 'zod';
import { QcError, type DialogContext, type DialogTranscript, type QualityClass } from './types';

export const ANALYSIS_SCHEMA_VERSION = '1.2';
export const SCORECARD_VERSION = '1.0';
export const criterionKeys = ['greeting', 'politeness', 'needsDiscovery', 'productKnowledge', 'objectionHandling', 'closing', 'scriptCompliance'] as const;

const text = z.string().trim().min(1).max(4000);
const criterionSchema = z.strictObject({
  score: z.number().min(0).max(10),
  maxScore: z.literal(10),
  status: z.enum(['good', 'neutral', 'needs_improvement', 'not_applicable']),
  comment: text,
});
const evidenceSchema = z.strictObject({
  segmentIndex: z.number().int().nonnegative().describe('Zero-based index of the source transcript segment.'),
  quote: z.string().trim().min(1).max(1500).describe('One contiguous character-for-character substring copied from that segment text, without added quotation marks.'),
});
const findingSchema = z.strictObject({
  type: z.string().trim().min(1).max(100),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: text,
  evidence: z.array(evidenceSchema).max(8),
});

// The same schema drives provider JSON constraints and server-side validation.
export const dialogAnalysisSchema = z.strictObject({
  schemaVersion: z.literal(ANALYSIS_SCHEMA_VERSION),
  boundaries: z.strictObject({
    start: z.enum(['starts_here', 'continues_previous', 'unknown']),
    end: z.enum(['ends_here', 'continues_next', 'unknown']),
    confidence: z.enum(['high', 'medium', 'low']),
    explanation: text,
  }),
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
  dialog: z.strictObject({
    hasConflict: z.boolean(), hasComplaint: z.boolean(), hasObjection: z.boolean(), saleIntentDetected: z.boolean(),
    upsellDetected: z.boolean(), crossSellDetected: z.boolean(), purchaseCompleted: z.boolean(),
  }),
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
    if (parsed.data.status === 'not_applicable' && parsed.data.score === 0) continue;
    const expected = parsed.data.score >= 8 ? 'good' : parsed.data.score >= 6 ? 'neutral' : 'needs_improvement';
    // The numeric score is authoritative. Provider-generated labels are only a
    // display convenience and are canonicalized here to avoid a full LLM retry
    // for a mechanically derivable value.
    criteria[key].status = expected;
    sum += parsed.data.score;
    maximum += parsed.data.maxScore;
  }
  if (!maximum) throw new QcError('INVALID_SCORE', 'At least one criterion must be applicable.');
  return Math.round((sum / maximum) * 10000) / 100;
}

function normalizeEvidence(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('ru-RU').replace(/[‐‑‒–—]/gu, '-').replace(/\s*-\s*/gu, '-').replace(/\s+/gu, ' ').trim();
}

function trimAddedOuterQuotes(value: string): string {
  const pairs: ReadonlyArray<readonly [string, string]> = [['"', '"'], ["'", "'"], ['«', '»'], ['“', '”'], ['„', '“']];
  let result = value.trim();
  for (const [open, close] of pairs) {
    if (result.startsWith(open) && result.endsWith(close) && result.length > open.length + close.length) {
      result = result.slice(open.length, -close.length).trim();
      break;
    }
  }
  return result;
}

export function validateAnalysis(value: unknown, transcript?: DialogTranscript, context?: DialogContext): DialogAnalysis {
  const parsed = dialogAnalysisSchema.safeParse(value);
  if (!parsed.success) throw new QcError('ANALYSIS_SCHEMA_INVALID', 'The analysis did not match the required response schema.', 502, true);
  const analysis = parsed.data;
  if (context && ((!context.previous && analysis.boundaries.start === 'continues_previous') ||
      (!context.next && analysis.boundaries.end === 'continues_next'))) {
    if (!context.previous && analysis.boundaries.start === 'continues_previous') analysis.boundaries.start = 'unknown';
    if (!context.next && analysis.boundaries.end === 'continues_next') analysis.boundaries.end = 'unknown';
    analysis.boundaries.confidence = 'low';
    analysis.boundaries.explanation = `Соседняя расшифровка недоступна; продолжение диалога не подтверждено. ${analysis.boundaries.explanation}`.slice(0, 4000);
  }
  // A technical segment boundary is not evidence that a seller failed to
  // greet/close. Exclude unobservable criteria even if the model scores them.
  for (const [key, observable] of [
    ['greeting', analysis.boundaries.start === 'starts_here'],
    ['closing', analysis.boundaries.end === 'ends_here'],
  ] as const) {
    if (!observable) {
      analysis.quality.criteria[key] = { score: 0, maxScore: 10, status: 'not_applicable',
        comment: `Граница диалога вне записи или не определена. ${analysis.boundaries.explanation}`.slice(0, 4000) };
    }
  }
  if (transcript) {
    for (const finding of [...analysis.problems, ...analysis.violations]) {
      for (const evidence of finding.evidence) {
        const segment = transcript.segments[evidence.segmentIndex];
        const quote = normalizeEvidence(trimAddedOuterQuotes(evidence.quote));
        if (!segment || !quote || !normalizeEvidence(segment.text).includes(quote)) {
          throw new QcError('ANALYSIS_EVIDENCE_INVALID', 'The analysis contains evidence absent from its referenced transcript segment.', 502, true);
        }
      }
    }
  }
  try { analysis.quality.overallScore = calculateOverallScore(analysis.quality.criteria); }
  catch { throw new QcError('ANALYSIS_SCORE_INVALID', 'The analysis contains inconsistent criterion scores.', 502, true); }
  return analysis;
}
