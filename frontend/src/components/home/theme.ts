export const homeTheme = {
  background: '#f4f3f0',
  card: '#ffffff',
  border: '#e7e4de',
  text: '#1d1d1b',
  muted: '#6b6a66',
  accent: '#2f5d3a',
  accentSoft: '#e4ece4',
  badgeBg: '#fde4e1',
  badgeText: '#b42318',
  bannerBg: '#fdf3d8',
  bannerText: '#6b4a12',
  bannerButton: '#6b4a12',
  danger: '#b42318',
};

export type HomeFontSize = 'normal' | 'large';

export const fontScaleFor = (size: HomeFontSize): number => (size === 'large' ? 1.15 : 1);

export const initialsOf = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
};
