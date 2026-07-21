import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { initializeCanvas, Layer, Psd, readPsd } from 'ag-psd';
import { PromotionTableRow } from '../repositories/promotionRowsRepository';

type TextRole = 'oldPrice' | 'currentPrice' | 'benefit' | 'discountPercent';

type ParsedTextLayer = {
  layer: Layer;
  text: string;
  numericValue: number | null;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  fontSize: number | null;
  color: string | null;
};

type Replacement = ParsedTextLayer & {
  role: TextRole;
  value: string;
};

const FONT_FAMILY = 'GeneratedPosterSans';
const fontRoot = path.resolve(__dirname, '../../node_modules/pdfjs-dist/standard_fonts');
const pageWidthPt = 160 / 25.4 * 72;

let initialized = false;

const initialize = () => {
  if (initialized) return;
  initializeCanvas((width, height) => createCanvas(width, height) as unknown as HTMLCanvasElement);
  const regular = path.join(fontRoot, 'LiberationSans-Regular.ttf');
  const bold = path.join(fontRoot, 'LiberationSans-Bold.ttf');
  if (fs.existsSync(regular)) GlobalFonts.registerFromPath(regular, FONT_FAMILY);
  if (fs.existsSync(bold)) GlobalFonts.registerFromPath(bold, FONT_FAMILY);
  initialized = true;
};

const numericText = (value: string) => {
  const compact = value.replace(/\s+/g, '').replace(',', '.').replace(/[^\d.%-]/g, '');
  if (!compact || compact.includes('%') || compact === '00') return null;
  if (!/^\d+(\.\d+)?$/.test(compact)) return null;
  const parsed = Number(compact);
  return Number.isFinite(parsed) ? parsed : null;
};

const rgbToHex = (color: unknown) => {
  const c = color as { r?: number; g?: number; b?: number } | undefined;
  if (!c || c.r === undefined || c.g === undefined || c.b === undefined) return null;
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${part(c.r)}${part(c.g)}${part(c.b)}`;
};

const textStyle = (layer: Layer) => {
  const text = layer.text as {
    style?: { fontSize?: number; fillColor?: unknown };
    styleRuns?: Array<{ style?: { fontSize?: number; fillColor?: unknown } }>;
  } | undefined;
  const runStyle = text?.styleRuns?.find((run) => run.style)?.style;
  return {
    fontSize: text?.style?.fontSize ?? runStyle?.fontSize ?? null,
    color: rgbToHex(text?.style?.fillColor ?? runStyle?.fillColor),
  };
};

const collectTextLayers = (children: Layer[] | undefined): ParsedTextLayer[] => {
  const layers: ParsedTextLayer[] = [];
  const visit = (items: Layer[] | undefined) => {
    for (const layer of items ?? []) {
      const text = layer.text?.text?.trim();
      if (text && layer.hidden !== true) {
        const left = Number(layer.left ?? layer.text?.left ?? 0);
        const top = Number(layer.top ?? layer.text?.top ?? 0);
        const right = Number(layer.right ?? layer.text?.right ?? left);
        const bottom = Number(layer.bottom ?? layer.text?.bottom ?? top);
        const style = textStyle(layer);
        layers.push({
          layer,
          text,
          numericValue: numericText(text),
          left,
          top,
          right,
          bottom,
          width: Math.max(1, right - left),
          height: Math.max(1, bottom - top),
          fontSize: style.fontSize,
          color: style.color,
        });
      }
      visit(layer.children);
    }
  };
  visit(children);
  return layers;
};

const moneyRubles = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) throw new Error('Для генерации постера нужны старая и новая цена.');
  return String(Math.round(value));
};

const discountText = (row: PromotionTableRow) => {
  const percent = row.advertisingDiscountPercent ?? row.realDiscountPercent;
  if (percent === null || !Number.isFinite(percent)) return null;
  return `-${Math.round(percent)}%`;
};

export const classifyPosterTextLayers = (layers: ParsedTextLayer[], row: PromotionTableRow): Replacement[] => {
  const numericLayers = layers
    .filter((layer) => layer.numericValue !== null && layer.width > 4 && layer.height > 4)
    .sort((a, b) => (b.numericValue ?? 0) - (a.numericValue ?? 0));

  const replacements: Replacement[] = [];
  const oldPrice = numericLayers[0];
  const currentPrice = numericLayers[1];
  const benefit = numericLayers[2];
  if (oldPrice) replacements.push({ ...oldPrice, role: 'oldPrice', value: moneyRubles(row.regularPrice) });
  if (currentPrice) replacements.push({ ...currentPrice, role: 'currentPrice', value: moneyRubles(row.promoPrice) });
  if (benefit) {
    const difference = row.priceDifference ?? ((row.regularPrice ?? 0) - (row.promoPrice ?? 0));
    replacements.push({ ...benefit, role: 'benefit', value: moneyRubles(difference) });
  }

  const percent = discountText(row);
  const percentLayer = layers.find((layer) => layer.text.includes('%'));
  if (percent && percentLayer) replacements.push({ ...percentLayer, role: 'discountPercent', value: percent });
  return replacements;
};

const roleSizeScale = (role: TextRole) => {
  if (role === 'currentPrice') return 0.96;
  if (role === 'benefit') return 0.96;
  if (role === 'oldPrice') return 0.96;
  return 1;
};

const roleMaxWidthScale = (role: TextRole) => {
  if (role === 'currentPrice') return 1.06;
  if (role === 'benefit') return 1.06;
  if (role === 'oldPrice') return 1.04;
  return 1.04;
};

const fitAndDrawText = (ctx: SKRSContext2D, replacement: Replacement) => {
  const maxWidth = Math.max(20, replacement.width * roleMaxWidthScale(replacement.role));
  let size = Math.max(16, Math.round((replacement.fontSize ?? replacement.height * 0.86) * roleSizeScale(replacement.role)));
  while (size > 8) {
    ctx.font = `bold ${size}px "${FONT_FAMILY}"`;
    if (ctx.measureText(replacement.value).width <= maxWidth) break;
    size -= 2;
  }
  ctx.fillStyle = replacement.color ?? (replacement.role === 'discountPercent' ? '#e30613' : '#ffffff');
  ctx.font = `bold ${size}px "${FONT_FAMILY}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(replacement.value, replacement.left + replacement.width / 2, replacement.top + replacement.height / 2);
};

const drawLayerImage = (ctx: SKRSContext2D, layer: Layer, draw: () => void) => {
  ctx.save();
  ctx.globalAlpha *= layer.opacity ?? 1;
  if (layer.blendMode && layer.blendMode !== 'normal' && layer.blendMode !== 'pass through') {
    ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
  }
  draw();
  ctx.restore();
};

const renderLayerTree = (ctx: SKRSContext2D, layers: Layer[] | undefined, replacements: Map<Layer, Replacement>) => {
  for (const layer of layers ?? []) {
    if (layer.hidden === true) continue;
    drawLayerImage(ctx, layer, () => {
      const replacement = replacements.get(layer);
      if (replacement) {
        fitAndDrawText(ctx, replacement);
        return;
      }
      if (layer.children?.length) {
        renderLayerTree(ctx, layer.children, replacements);
        return;
      }
      const layerCanvas = layer.canvas as unknown as Parameters<typeof ctx.drawImage>[0] | undefined;
      if (layerCanvas) ctx.drawImage(layerCanvas, Number(layer.left ?? 0), Number(layer.top ?? 0));
    });
  }
};

const pdfObject = (id: number, body: string | Buffer) => ({
  id,
  content: Buffer.isBuffer(body) ? body : Buffer.from(body, 'binary'),
});

const buildPdf = (image: { width: number; height: number; rgb: Buffer }) => {
  const pageHeightPt = pageWidthPt * (image.height / image.width);
  const compressedRgb = zlib.deflateSync(image.rgb, { level: 9 });
  const objects = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>\n'),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n'),
    pdfObject(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt.toFixed(2)} ${pageHeightPt.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`,
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
  const content = `q\n${pageWidthPt.toFixed(2)} 0 0 ${pageHeightPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  objects.push(pdfObject(5, `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}endstream\n`));

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  for (const object of objects) {
    offsets[object.id] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(Buffer.from(`${object.id} 0 obj\n`, 'binary'), object.content, Buffer.from('endobj\n', 'binary'));
  }
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(Buffer.from([
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
  ].join('\n'), 'binary'));
  return Buffer.concat(chunks);
};

export const createGeneratedPosterPdfFromPsd = (psdBuffer: Buffer, row: PromotionTableRow) => {
  initialize();
  const psd = readPsd(psdBuffer, { skipThumbnail: true, skipLinkedFilesData: true, totalMemoryLimit: 512 * 1024 * 1024 }) as Psd;
  const sourceCanvas = psd.canvas as unknown as ReturnType<typeof createCanvas> | undefined;
  if (!sourceCanvas) throw new Error('PSD не содержит composite preview, из которого можно собрать постер.');

  const canvas = createCanvas(psd.width, psd.height);
  const ctx = canvas.getContext('2d');
  const replacements = classifyPosterTextLayers(collectTextLayers(psd.children), row);
  if (replacements.length < 3) throw new Error('Не удалось уверенно найти ценовые слои в PSD.');

  const replacementsByLayer = new Map(replacements.map((replacement) => [replacement.layer, replacement]));
  renderLayerTree(ctx, psd.children, replacementsByLayer);
  if (!psd.children?.length) ctx.drawImage(sourceCanvas as unknown as Parameters<typeof ctx.drawImage>[0], 0, 0);

  const imageData = ctx.getImageData(0, 0, psd.width, psd.height).data;
  const rgb = Buffer.allocUnsafe(psd.width * psd.height * 3);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < imageData.length; sourceIndex += 4, targetIndex += 3) {
    rgb[targetIndex] = imageData[sourceIndex];
    rgb[targetIndex + 1] = imageData[sourceIndex + 1];
    rgb[targetIndex + 2] = imageData[sourceIndex + 2];
  }
  return buildPdf({ width: psd.width, height: psd.height, rgb });
};
