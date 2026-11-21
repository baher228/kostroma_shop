export const resolveTaskDeadlineAtSubmission = (
  useCurrentTime: boolean,
  selectedDeadlineAt: string | null,
  submittedAt = new Date(),
): string | null => {
  if (useCurrentTime) return submittedAt.toISOString();
  if (!selectedDeadlineAt) return null;
  const selectedDeadline = new Date(selectedDeadlineAt);
  return Number.isFinite(selectedDeadline.getTime()) ? selectedDeadline.toISOString() : null;
};
