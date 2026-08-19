import fs from 'fs';
import path from 'path';
import { GlobalFonts } from '@napi-rs/canvas';

export const PROMOTION_FONT_FAMILY = 'Golos Text';

type PromotionFontWeight = 400 | 600 | 700;

const fontFiles: ReadonlyArray<{ fileName: string; weight: PromotionFontWeight }> = [
  { fileName: 'GolosText-Regular.ttf', weight: 400 },
  { fileName: 'GolosText-SemiBold.ttf', weight: 600 },
  { fileName: 'GolosText-Bold.ttf', weight: 700 },
];

const fontRootCandidates = () => [
  process.env.PROMOTION_FONT_DIR,
  // Runtime Docker image and other package-local deployments.
  path.resolve(__dirname, '../../assets/Golos_text'),
  // Repository layout used by local development and tests.
  path.resolve(__dirname, '../../../../assets/Golos_text'),
].filter((candidate): candidate is string => Boolean(candidate));

const fontPathsForRoot = (root: string) =>
  fontFiles.map(({ fileName, weight }) => ({
    path: path.join(root, 'static', fileName),
    weight,
  }));

export const resolvePromotionFontFiles = () => {
  for (const root of fontRootCandidates()) {
    const files = fontPathsForRoot(root);
    if (files.every((file) => fs.existsSync(file.path))) return files;
  }
  throw new Error(
    `Golos Text font files were not found. Checked: ${fontRootCandidates().join(', ')}`,
  );
};

let registered = false;

export const registerPromotionFonts = () => {
  if (registered) return;
  const fontFilesToRegister = resolvePromotionFontFiles();
  for (const fontFile of fontFilesToRegister) {
    if (!GlobalFonts.registerFromPath(fontFile.path, PROMOTION_FONT_FAMILY)) {
      throw new Error(`Failed to register Golos Text font: ${fontFile.path}`);
    }
  }
  registered = true;
};

export const promotionFont = (size: number, weight: PromotionFontWeight = 700) =>
  `${weight} ${size}px "${PROMOTION_FONT_FAMILY}"`;
