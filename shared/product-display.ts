const BUTTER_LABELS: Array<[RegExp, string]> = [
  [/^Масло\s+сливочное\s+72(?:[.,]5)?%/i, 'Масло 72% сл'],
  [/^Масло\s+сливочное\s+82(?:[.,]5)?%/i, 'Масло 82% сл'],
];

export const managerProductName = (name: string): string => {
  const trimmed = name.trim();
  const match = BUTTER_LABELS.find(([pattern]) => pattern.test(trimmed));
  return match ? match[1] : name;
};
