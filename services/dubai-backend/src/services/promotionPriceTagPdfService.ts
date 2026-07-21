import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { GlobalFonts, SKRSContext2D, createCanvas } from '@napi-rs/canvas';
import { PromotionTableRow } from '../repositories/promotionRowsRepository';

type TextBox = {
  x: number;
  y: number;
  width: number;
  maxSize: number;
  minSize: number;
  weight?: 'bold' | 'normal';
  align?: 'left' | 'center' | 'right';
  color?: string;
};

type MultiLineTextBox = TextBox & {
  lineHeight: number;
  maxLines: number;
};

const WIDTH = 1181;
const HEIGHT = 1358;
const RENDER_SCALE = 3;
const PAGE_WIDTH_PT = 100 / 25.4 * 72;
const PAGE_HEIGHT_PT = 115 / 25.4 * 72;
const FONT_FAMILY = 'PromotionTagSans';
const fontRoot = path.resolve(__dirname, '../../node_modules/pdfjs-dist/standard_fonts');

let fontsRegistered = false;

const registerFonts = () => {
  if (fontsRegistered) return;
  const regular = path.join(fontRoot, 'LiberationSans-Regular.ttf');
  const bold = path.join(fontRoot, 'LiberationSans-Bold.ttf');
  if (fs.existsSync(regular)) GlobalFonts.registerFromPath(regular, FONT_FAMILY);
  if (fs.existsSync(bold)) GlobalFonts.registerFromPath(bold, FONT_FAMILY);
  fontsRegistered = true;
};

const formatMoneyParts = (value: number | null) => {
  const amount = Math.max(0, value ?? 0);
  const fixed = amount.toFixed(2);
  const [rubles, cents] = fixed.split('.');
  return { rubles, cents };
};

const formatDate = (value: string | null) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
};

const splitProductName = (value: string) => {
  const source = value.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!source) return { title: 'ТОВАР', description: '' };
  const words = source.split(' ');
  if (words.length <= 2) return { title: source, description: '' };

  const firstWordTitle = new Set([
    'БЕКОН',
    'ВЕТЧИНА',
    'ВЫРЕЗКА',
    'ГРУДИНКА',
    'ЗАЛИВНОЕ',
    'КАРБОНАД',
    'КОЛБАСКИ',
    'КОЛБАСА',
    'КРАКОВСКАЯ',
    'ЛЮБИТЕЛЬСКАЯ',
    'МОЛОЧНАЯ',
    'МОРТАДЕЛЛА',
    'ОКОРОК',
    'РУЛЕТ',
    'РУССКАЯ',
    'САРДЕЛЬКИ',
    'СЕРВЕЛАТ',
    'СОСИСКИ',
    'ТЕЛЯЧЬЯ',
    'ХОЛОДЕЦ',
    'ЧЕВАПЧИЧИ',
    'ШАШЛЫК',
    'ШЕЙКА',
    'ЯЗЫК',
  ]);

  if (firstWordTitle.has(words[0]) && words.length > 2) {
    return {
      title: words[0],
      description: words.slice(1).join(' '),
    };
  }

  const grillIndex = words.findIndex((word, index) => index > 0 && word === 'ДЛЯ' && words[index + 1] === 'ГРИЛЯ');
  if (grillIndex > 1 && firstWordTitle.has(words[1])) {
    return {
      title: words[0],
      description: words.slice(1).join(' '),
    };
  }
  if (grillIndex > 0) {
    return {
      title: words.slice(0, grillIndex).join(' '),
      description: words.slice(grillIndex).join(' '),
    };
  }

  const packageIndex = words.findIndex((word, index) =>
    index > 0 && (/^\d/.test(word) || ['КГ', 'Г', 'Л', 'МЛ', 'ШТ'].includes(word.replace(/\.$/, ''))),
  );
  if (packageIndex > 1) {
    return {
      title: words.slice(0, packageIndex - 1).join(' '),
      description: words.slice(packageIndex - 1).join(' '),
    };
  }
  return {
    title: words.slice(0, Math.min(2, words.length)).join(' '),
    description: words.slice(Math.min(2, words.length)).join(' '),
  };
};

const font = (size: number, weight: 'bold' | 'normal' = 'bold') => `${weight} ${size}px "${FONT_FAMILY}"`;

const compactDescription = (value: string) =>
  value
    .replace(/(^|\s)ВАР\.?(?=\s|$)/giu, ' ')
    .replace(/\bВАРЕНАЯ\b/giu, ' ')
    .replace(/\bВАРЕНЫЕ\b/giu, ' ')
    .replace(/\bС\s+МОЦАРЕЛЛОЙ\s+И\s+ТРАВАМИ\b/giu, 'С МОЦАРЕЛ. И ТРАВАМИ')
    .replace(/\bМОЦАРЕЛЛОЙ\b/giu, 'МОЦАРЕЛ.')
    .replace(/\bМОЦАРЕЛЛА\b/giu, 'МОЦАРЕЛ.')
    .replace(/\bГОРЧИЦЕЙ\b/giu, 'ГОРЧИЦ.')
    .replace(/\bЦЕЛЛОФАН\b/giu, 'ЦЕЛЛОФ.')
    .replace(/\bТЕКСТИЛЬ\b/giu, 'ТЕКСТ.')
    .replace(/\s+/g, ' ')
    .trim();

const fitText = (ctx: SKRSContext2D, text: string, box: TextBox) => {
  const value = text.trim();
  let size = box.maxSize;
  while (size > box.minSize) {
    ctx.font = font(size, box.weight);
    if (ctx.measureText(value).width <= box.width) break;
    size -= 2;
  }
  ctx.fillStyle = box.color ?? '#000000';
  ctx.textAlign = box.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(size, box.weight);
  ctx.fillText(value, box.x, box.y);
};

const wrapWords = (ctx: SKRSContext2D, text: string, width: number) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(next).width <= width) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const fitMultilineText = (ctx: SKRSContext2D, text: string, box: MultiLineTextBox) => {
  const value = text.trim();
  if (!value) return;
  let size = box.maxSize;
  let lines: string[] = [value];
  while (size > box.minSize) {
    ctx.font = font(size, box.weight);
    lines = wrapWords(ctx, value, box.width);
    const longestLine = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (lines.length <= box.maxLines && longestLine <= box.width) break;
    size -= 2;
  }
  if (lines.length > box.maxLines) {
    lines = lines.slice(0, box.maxLines);
    const lastIndex = lines.length - 1;
    while (lines[lastIndex].length > 1 && ctx.measureText(`${lines[lastIndex]}...`).width > box.width) {
      lines[lastIndex] = lines[lastIndex].slice(0, -1).trim();
    }
    lines[lastIndex] = `${lines[lastIndex]}...`;
  }
  ctx.fillStyle = box.color ?? '#000000';
  ctx.textAlign = box.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(size, box.weight);
  lines.forEach((line, index) => {
    ctx.fillText(line, box.x, box.y + index * size * box.lineHeight);
  });
};

const pdfName = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'price-tag';

const pdfObject = (id: number, body: string | Buffer) => {
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body, 'binary');
  return { id, content };
};

const buildPdf = (image: { width: number; height: number; rgb: Buffer }) => {
  const compressedRgb = zlib.deflateSync(image.rgb, { level: 9 });
  const objects = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>\n'),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n'),
    pdfObject(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH_PT.toFixed(2)} ${PAGE_HEIGHT_PT.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`,
    ),
    pdfObject(
      4,
      Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressedRgb.length} >>\nstream\n`,
          'binary',
        ),
        compressedRgb,
        Buffer.from('\nendstream\n', 'binary'),
      ]),
    ),
  ];
  const content = `q\n${PAGE_WIDTH_PT.toFixed(2)} 0 0 ${PAGE_HEIGHT_PT.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  objects.push(pdfObject(5, `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}endstream\n`));

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  for (const object of objects) {
    offsets[object.id] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(Buffer.from(`${object.id} 0 obj\n`, 'binary'), object.content, Buffer.from('endobj\n', 'binary'));
  }
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...objects.map((object) => `${String(offsets[object.id]).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n');
  chunks.push(Buffer.from(xref, 'binary'));
  return Buffer.concat(chunks);
};

export const promotionPriceTagFileName = (row: PromotionTableRow) =>
  `${pdfName(`${row.rowNumber}_${row.productName}`)}.pdf`;

export const createPromotionPriceTagPdf = (row: PromotionTableRow): Buffer => {
  registerFonts();

  const renderWidth = WIDTH * RENDER_SCALE;
  const renderHeight = HEIGHT * RENDER_SCALE;
  const canvas = createCanvas(renderWidth, renderHeight);
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  const red = '#ff0000';
  const yellow = '#ffd900';
  const black = '#000000';
  const { title, description } = splitProductName(row.productName);
  const displayDescription = compactDescription(description);
  const oldPrice = formatMoneyParts(row.regularPrice);
  const newPrice = formatMoneyParts(row.promoPrice);
  const discount = row.advertisingDiscountPercent !== null
    ? `-${Math.round(row.advertisingDiscountPercent)}%`
    : row.realDiscountPercent !== null
      ? `-${Math.round(row.realDiscountPercent)}%`
      : '';
  const period = row.startDate || row.endDate
    ? `*при покупке от 100 кг. период акции: ${formatDate(row.startDate)}-${formatDate(row.endDate)}`
    : '*при покупке от 100 кг.';

  ctx.fillStyle = yellow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = red;
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, WIDTH - 12, HEIGHT - 12);
  ctx.beginPath();
  ctx.moveTo(0, 184);
  ctx.lineTo(WIDTH, 184);
  ctx.stroke();

  fitText(ctx, 'АКЦИЯ', { x: WIDTH / 2, y: 149, width: 900, maxSize: 150, minSize: 88, align: 'center', color: red });
  fitText(ctx, title, { x: WIDTH / 2, y: 367, width: 1040, maxSize: 172, minSize: 72, align: 'center', color: black });
  fitText(ctx, displayDescription, {
    x: WIDTH / 2,
    y: 488,
    width: 1120,
    maxSize: 62,
    minSize: 36,
    align: 'center',
    color: black,
  });

  fitText(ctx, 'БЫЛО:', { x: 48, y: 584, width: 350, maxSize: 86, minSize: 54, color: red });
  fitText(ctx, oldPrice.rubles, { x: 48, y: 760, width: 310, maxSize: 190, minSize: 120, color: red });
  fitText(ctx, oldPrice.cents, { x: 352, y: 656, width: 95, maxSize: 62, minSize: 38, color: red });

  fitText(ctx, newPrice.rubles, { x: 392, y: 1000, width: 610, maxSize: 455, minSize: 240, color: red });
  fitText(ctx, newPrice.cents, { x: 1014, y: 743, width: 130, maxSize: 110, minSize: 64, color: red });

  fitText(ctx, 'ВЫГОДА:', { x: 48, y: 1038, width: 390, maxSize: 88, minSize: 52, color: red });
  if (discount) fitText(ctx, discount, { x: 48, y: 1196, width: 430, maxSize: 180, minSize: 92, color: red });
  fitText(ctx, '*', { x: 457, y: 1071, width: 28, maxSize: 32, minSize: 22, color: red });
  fitText(ctx, period, { x: WIDTH / 2, y: 1344, width: 820, maxSize: 32, minSize: 18, align: 'center', weight: 'normal', color: red });

  const imageData = ctx.getImageData(0, 0, renderWidth, renderHeight).data;
  const rgb = Buffer.allocUnsafe(renderWidth * renderHeight * 3);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < imageData.length; sourceIndex += 4, targetIndex += 3) {
    rgb[targetIndex] = imageData[sourceIndex];
    rgb[targetIndex + 1] = imageData[sourceIndex + 1];
    rgb[targetIndex + 2] = imageData[sourceIndex + 2];
  }
  return buildPdf({ width: renderWidth, height: renderHeight, rgb });
};
