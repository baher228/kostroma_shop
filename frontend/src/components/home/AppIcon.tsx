import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type AppIconName =
  | 'home'
  | 'list'
  | 'squareCheck'
  | 'tag'
  | 'truck'
  | 'cart'
  | 'scan'
  | 'clipboardCheck'
  | 'help'
  | 'users'
  | 'mic'
  | 'menu'
  | 'search'
  | 'chevronRight'
  | 'chevronLeft'
  | 'chevronUp'
  | 'chevronDown'
  | 'logOut';

const PATHS: Record<AppIconName, string[]> = {
  home: [
    'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
    'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  squareCheck: ['m9 12 2 2 4-4'],
  tag: [
    'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
  ],
  truck: [
    'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2',
    'M15 18H9',
    'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14',
  ],
  cart: ['M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12'],
  scan: ['M3 7V5a2 2 0 0 1 2-2h2', 'M17 3h2a2 2 0 0 1 2 2v2', 'M21 17v2a2 2 0 0 1-2 2h-2', 'M7 21H5a2 2 0 0 1-2-2v-2', 'M7 12h10'],
  clipboardCheck: [
    'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
    'm9 14 2 2 4-4',
  ],
  help: ['M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  search: ['m21 21-4.3-4.3'],
  chevronRight: ['m9 18 6-6-6-6'],
  chevronLeft: ['m15 18-6-6 6-6'],
  chevronUp: ['m18 15-6-6-6 6'],
  chevronDown: ['m6 9 6 6 6-6'],
  logOut: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
};

const Extras = ({ name, color }: { name: AppIconName; color: string }) => {
  switch (name) {
    case 'squareCheck':
      return <Rect x={3} y={3} width={18} height={18} rx={2} />;
    case 'tag':
      return <Circle cx={7.5} cy={7.5} r={1} fill={color} />;
    case 'truck':
      return (
        <>
          <Circle cx={17} cy={18} r={2} />
          <Circle cx={7} cy={18} r={2} />
        </>
      );
    case 'cart':
      return (
        <>
          <Circle cx={8} cy={21} r={1} />
          <Circle cx={19} cy={21} r={1} />
        </>
      );
    case 'clipboardCheck':
      return <Rect x={8} y={2} width={8} height={4} rx={1} />;
    case 'help':
      return <Circle cx={12} cy={12} r={10} />;
    case 'users':
      return <Circle cx={9} cy={7} r={4} />;
    case 'search':
      return <Circle cx={11} cy={11} r={8} />;
    default:
      return null;
  }
};

export const AppIcon = ({ name, size = 24, color = '#2f5d3a' }: { name: AppIconName; size?: number; color?: string }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Extras name={name} color={color} />
    {PATHS[name].map((d) => (
      <Path key={d} d={d} />
    ))}
  </Svg>
);
