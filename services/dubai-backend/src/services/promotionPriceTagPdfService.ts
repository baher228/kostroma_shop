import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Canvas, SKRSContext2D, createCanvas } from '@napi-rs/canvas';
import { initializeCanvas, Layer, Psd, readPsd } from 'ag-psd';
import { PromotionTableRow } from '../repositories/promotionRowsRepository';
import { promotionFont, registerPromotionFonts } from './promotionFonts';

const TEMPLATE_FILE_NAME = 'Example_price_tag.psd';
const TEMPLATE_WIDTH = 1181;
const TEMPLATE_HEIGHT = 1358;
const PAGE_WIDTH_PT = 100 / 25.4 * 72;
const PAGE_HEIGHT_PT = 115 / 25.4 * 72;
const A4_WIDTH_PT = 210 / 25.4 * 72;
const A4_HEIGHT_PT = 297 / 25.4 * 72;
const SHEET_GAP_PT = 2 / 25.4 * 72;
const WHITE = '#ffffff';
const STRIKE_COLOR = '#985dff';

const templateLayerIds = {
  period: 6,
  discountMarker: 7,
  discount: 8,
  oldKopecks: 10,
  oldRubles: 153,
  newKopecks: 13,
  newRubles: 152,
  subtitle: 15,
  title: 16,
  oldPriceStrike: 154,
} as const;

type PriceTagLayerRole = keyof typeof templateLayerIds;
type TemplateLayers = Record<PriceTagLayerRole, Layer>;

export type PreparedPromotionPriceTagTemplate = {
  psd: Psd;
  layers: TemplateLayers;
  canvas: Canvas;
  context: SKRSContext2D;
};

type TextBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type DrawnText = {
  left: number;
  right: number;
  size: number;
};

export type PromotionPriceTagContent = {
  title: string;
  subtitle: string;
  oldRubles: string;
  oldKopecks: string;
  newRubles: string;
  newKopecks: string;
  discount: string;
  period: string;
};

export type PromotionPriceTagImage = {
  width: number;
  height: number;
  rgb: Buffer;
};

let initialized = false;
let cachedTemplate: PreparedPromotionPriceTagTemplate | null = null;

const initialize = () => {
  if (initialized) return;
  initializeCanvas((width, height) => createCanvas(width, height) as unknown as HTMLCanvasElement);
  registerPromotionFonts();
  initialized = true;
};

const formatMoneyParts = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) throw new Error('Для ценника нужны новая и старая цена.');
  const [rubles, kopecks] = Math.max(0, value).toFixed(2).split('.');
  return { rubles, kopecks };
};

const formatDate = (value: string | null) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
};

const formatPeriod = (startDate: string | null, endDate: string | null) => {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  if (start && end && start !== end) return `${start}-${end}`;
  return start || end;
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
  if (packageIndex > 0) {
    const titleWordCount = Math.min(2, Math.max(1, packageIndex - 1));
    return {
      title: words.slice(0, titleWordCount).join(' '),
      description: words.slice(titleWordCount).join(' '),
    };
  }
  return {
    title: words.slice(0, Math.min(2, words.length)).join(' '),
    description: words.slice(Math.min(2, words.length)).join(' '),
  };
};

const compactDescription = (value: string) => {
  const compacted = value
    .replace(/(^|\s)ВАРЕНАЯ(?=\s|$)/giu, ' ')
    .replace(/(^|\s)ВАРЕНЫЕ(?=\s|$)/giu, ' ')
    .replace(/(^|\s)ВАР\.?(?=\s|$)/giu, ' ')
    .replace(/\bС\s+МОЦАРЕЛЛОЙ\s+И\s+ТРАВАМИ\b/giu, 'С МОЦАРЕЛЛОЙ И ТРАВАМИ')
    .replace(/\s+/g, ' ')
    .trim();

  return compacted.startsWith('ДЛЯ ГРИЛЯ ')
    ? compacted.slice('ДЛЯ ГРИЛЯ '.length).trim()
    : compacted;
};

export const createPromotionPriceTagContent = (row: PromotionTableRow): PromotionPriceTagContent => {
  const { title, description } = splitProductName(row.productName);
  const oldPrice = formatMoneyParts(row.regularPrice);
  const newPrice = formatMoneyParts(row.promoPrice);
  const discountPercent = row.advertisingDiscountPercent ?? row.realDiscountPercent;
  const period = formatPeriod(row.startDate, row.endDate);

  return {
    title,
    subtitle: compactDescription(description),
    oldRubles: oldPrice.rubles,
    oldKopecks: oldPrice.kopecks,
    newRubles: newPrice.rubles,
    newKopecks: newPrice.kopecks,
    discount: discountPercent === null || !Number.isFinite(discountPercent)
      ? ''
      : `-${Math.round(discountPercent)}%`,
    period: period
      ? `*при покупке от 100 кг. период акции: ${period}`
      : '*при покупке от 100 кг.',
  };
};

const priceTagPeriod = (row: Pick<PromotionTableRow, 'startDate' | 'endDate'>) =>
  formatPeriod(row.startDate, row.endDate) || 'без_даты';

const safeFileNamePart = (value: string) =>
  value
    .normalize('NFC')
    .replace(/[\\/:]+/g, '-')
    .replace(/[<>"|?*\u0000-\u001F]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .trim()
    .replace(/[. ]+$/g, '') || 'Товар';

export const resolvePromotionPriceTagTemplatePath = () => {
  const candidates = [
    path.resolve(__dirname, '../../assets/Price_tag', TEMPLATE_FILE_NAME),
    path.resolve(__dirname, '../../../../assets/Price_tag', TEMPLATE_FILE_NAME),
  ];

  const templatePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (templatePath) return templatePath;
  throw new Error(`PSD-шаблон ценника не найден. Проверены пути: ${candidates.join(', ')}`);
};

const loadPromotionPriceTagTemplate = () => {
  if (!cachedTemplate) {
    cachedTemplate = preparePromotionPriceTagTemplate(fs.readFileSync(resolvePromotionPriceTagTemplatePath()));
  }
  return cachedTemplate;
};

const collectLayersById = (children: Layer[] | undefined) => {
  const layers = new Map<number, Layer>();
  const visit = (items: Layer[] | undefined) => {
    for (const layer of items ?? []) {
      if (typeof layer.id === 'number') {
        if (layers.has(layer.id)) throw new Error(`В PSD-шаблоне повторяется id слоя ${layer.id}.`);
        layers.set(layer.id, layer);
      }
      visit(layer.children);
    }
  };
  visit(children);
  return layers;
};

const resolveTemplateLayers = (psd: Psd): TemplateLayers => {
  if (psd.width !== TEMPLATE_WIDTH || psd.height !== TEMPLATE_HEIGHT) {
    throw new Error(
      `PSD-шаблон ценника должен быть ${TEMPLATE_WIDTH}x${TEMPLATE_HEIGHT} px, получено ${psd.width}x${psd.height} px.`,
    );
  }

  const byId = collectLayersById(psd.children);
  const result = {} as TemplateLayers;
  for (const [role, id] of Object.entries(templateLayerIds) as Array<[PriceTagLayerRole, number]>) {
    const layer = byId.get(id);
    if (!layer) throw new Error(`В PSD-шаблоне ценника не найден слой ${role} (id ${id}).`);
    if (role !== 'oldPriceStrike' && !layer.text) {
      throw new Error(`Слой ${role} (id ${id}) в PSD-шаблоне должен быть текстовым.`);
    }
    result[role] = layer;
  }
  return result;
};

export const inspectPromotionPriceTagTemplate = (psdBuffer: Buffer) => {
  initialize();
  const psd = readPsd(psdBuffer, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
    totalMemoryLimit: 512 * 1024 * 1024,
  }) as Psd;
  const layers = resolveTemplateLayers(psd);
  return {
    width: psd.width,
    height: psd.height,
    horizontalResolution: psd.imageResources?.resolutionInfo?.horizontalResolution ?? null,
    verticalResolution: psd.imageResources?.resolutionInfo?.verticalResolution ?? null,
    layerIds: Object.fromEntries(
      (Object.entries(layers) as Array<[PriceTagLayerRole, Layer]>).map(([role, layer]) => [role, layer.id]),
    ) as Record<PriceTagLayerRole, number>,
  };
};

const layerBox = (layer: Layer): TextBox => ({
  left: Number(layer.left ?? 0),
  top: Number(layer.top ?? 0),
  right: Number(layer.right ?? layer.left ?? 0),
  bottom: Number(layer.bottom ?? layer.top ?? 0),
});

const layerFontSize = (layer: Layer, fallback: number) => {
  const text = layer.text as {
    style?: { fontSize?: number };
    styleRuns?: Array<{ style?: { fontSize?: number } }>;
  } | undefined;
  return text?.style?.fontSize
    ?? text?.styleRuns?.find((run) => run.style?.fontSize !== undefined)?.style?.fontSize
    ?? fallback;
};

const setFont = (ctx: SKRSContext2D, size: number, weight: 400 | 600 | 700 = 600) => {
  ctx.font = promotionFont(size, weight);
};

const fittedSize = (
  ctx: SKRSContext2D,
  value: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  weight: 400 | 600 | 700 = 600,
) => {
  let size = maxSize;
  while (size > minSize) {
    setFont(ctx, size, weight);
    if (ctx.measureText(value).width <= maxWidth) break;
    size -= 2;
  }
  return Math.max(minSize, size);
};

const drawText = (
  ctx: SKRSContext2D,
  value: string,
  options: {
    x: number;
    centerY: number;
    maxWidth: number;
    maxSize: number;
    minSize: number;
    align: 'left' | 'center';
    weight?: 400 | 600 | 700;
  },
): DrawnText => {
  const weight = options.weight ?? 600;
  const size = fittedSize(ctx, value, options.maxWidth, options.maxSize, options.minSize, weight);
  setFont(ctx, size, weight);
  const naturalWidth = ctx.measureText(value).width;
  const scaleX = naturalWidth > options.maxWidth ? options.maxWidth / naturalWidth : 1;
  const width = naturalWidth * scaleX;
  ctx.fillStyle = WHITE;
  ctx.textAlign = options.align;
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(options.x, options.centerY);
  ctx.scale(scaleX, 1);
  ctx.fillText(value, 0, 0);
  ctx.restore();
  const left = options.align === 'center' ? options.x - width / 2 : options.x;
  return { left, right: left + width, size };
};

const drawCenteredLayerText = (
  ctx: SKRSContext2D,
  layer: Layer,
  value: string,
  maxWidth: number,
  minSize: number,
  weight: 400 | 600 | 700 = 600,
) => {
  if (!value) return null;
  const box = layerBox(layer);
  return drawText(ctx, value, {
    x: (box.left + box.right) / 2,
    centerY: (box.top + box.bottom) / 2,
    maxWidth,
    maxSize: layerFontSize(layer, box.bottom - box.top),
    minSize,
    align: 'center',
    weight,
  });
};

const priceGroupSize = (
  ctx: SKRSContext2D,
  rubles: string,
  kopecks: string,
  maxWidth: number,
  rublesMaxSize: number,
  kopecksMaxSize: number,
  rublesMinSize: number,
  gap: number,
) => {
  let rublesSize = rublesMaxSize;
  let kopecksSize = kopecksMaxSize;
  const ratio = kopecksMaxSize / rublesMaxSize;
  while (true) {
    setFont(ctx, rublesSize);
    const rublesWidth = ctx.measureText(rubles).width;
    setFont(ctx, kopecksSize);
    const kopecksWidth = ctx.measureText(kopecks).width;
    const naturalWidth = rublesWidth + gap + kopecksWidth;
    if (naturalWidth <= maxWidth || rublesSize <= rublesMinSize) {
      return {
        rublesSize,
        kopecksSize,
        rublesWidth,
        kopecksWidth,
        scaleX: naturalWidth > maxWidth ? maxWidth / naturalWidth : 1,
      };
    }
    rublesSize = Math.max(rublesMinSize, rublesSize - 2);
    kopecksSize = Math.max(16, rublesSize * ratio);
  }
};

const drawPriceGroup = (
  ctx: SKRSContext2D,
  rublesLayer: Layer,
  kopecksLayer: Layer,
  rubles: string,
  kopecks: string,
  layout: {
    left: number;
    right: number;
    alignment: 'left' | 'center';
    rublesMinSize: number;
    gap: number;
  },
) => {
  const rublesBox = layerBox(rublesLayer);
  const kopecksBox = layerBox(kopecksLayer);
  const sizes = priceGroupSize(
    ctx,
    rubles,
    kopecks,
    layout.right - layout.left,
    layerFontSize(rublesLayer, rublesBox.bottom - rublesBox.top),
    layerFontSize(kopecksLayer, kopecksBox.bottom - kopecksBox.top),
    layout.rublesMinSize,
    layout.gap,
  );
  const totalWidth = (sizes.rublesWidth + layout.gap + sizes.kopecksWidth) * sizes.scaleX;
  const startX = layout.alignment === 'center'
    ? (layout.left + layout.right - totalWidth) / 2
    : layout.left;

  ctx.save();
  ctx.translate(startX, 0);
  ctx.scale(sizes.scaleX, 1);
  setFont(ctx, sizes.rublesSize);
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(rubles, 0, (rublesBox.top + rublesBox.bottom) / 2);

  const kopecksX = sizes.rublesWidth + layout.gap;
  setFont(ctx, sizes.kopecksSize);
  ctx.fillText(kopecks, kopecksX, (kopecksBox.top + kopecksBox.bottom) / 2);
  ctx.restore();

  return {
    left: startX,
    right: startX + totalWidth,
  };
};

const drawStrike = (ctx: SKRSContext2D, priceBounds: { left: number; right: number }) => {
  const left = Math.max(25, priceBounds.left - 14);
  const right = Math.min(455, priceBounds.right + 14);
  const centerY = 678.5;
  const halfRise = (right - left) * 0.196;
  ctx.strokeStyle = STRIKE_COLOR;
  ctx.lineWidth = 8;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(left, centerY + halfRise);
  ctx.lineTo(right, centerY - halfRise);
  ctx.stroke();
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

const renderTemplate = (
  ctx: SKRSContext2D,
  layers: Layer[] | undefined,
  dynamicRenderers: Map<number, () => void>,
) => {
  for (const layer of layers ?? []) {
    if (layer.hidden === true) continue;
    drawLayerImage(ctx, layer, () => {
      if (typeof layer.id === 'number' && dynamicRenderers.has(layer.id)) {
        dynamicRenderers.get(layer.id)?.();
        return;
      }
      if (layer.children?.length) {
        renderTemplate(ctx, layer.children, dynamicRenderers);
        return;
      }
      const layerCanvas = layer.canvas as unknown as Parameters<typeof ctx.drawImage>[0] | undefined;
      if (layerCanvas) ctx.drawImage(layerCanvas, Number(layer.left ?? 0), Number(layer.top ?? 0));
    });
  }
};

const readTemplatePsd = (psdBuffer: Buffer) => {
  initialize();
  return readPsd(psdBuffer, {
    skipThumbnail: true,
    skipLinkedFilesData: true,
    totalMemoryLimit: 512 * 1024 * 1024,
  }) as Psd;
};

export const preparePromotionPriceTagTemplate = (psdBuffer: Buffer): PreparedPromotionPriceTagTemplate => {
  const psd = readTemplatePsd(psdBuffer);
  const canvas = createCanvas(psd.width, psd.height);
  return {
    psd,
    layers: resolveTemplateLayers(psd),
    canvas,
    context: canvas.getContext('2d'),
  };
};

export const renderPromotionPriceTagImage = (
  template: PreparedPromotionPriceTagTemplate,
  row: PromotionTableRow,
): PromotionPriceTagImage => {
  const { psd, layers, canvas, context: ctx } = template;
  const content = createPromotionPriceTagContent(row);
  ctx.clearRect(0, 0, psd.width, psd.height);
  let oldPriceBounds: { left: number; right: number } | null = null;

  const skip = () => undefined;
  const dynamicRenderers = new Map<number, () => void>([
    [templateLayerIds.period, () => {
      drawCenteredLayerText(ctx, layers.period, content.period, 1050, 14, 400);
    }],
    [templateLayerIds.discountMarker, skip],
    [templateLayerIds.discount, () => {
      if (!content.discount) return;
      const box = layerBox(layers.discount);
      const discount = drawText(ctx, content.discount, {
        x: box.left,
        centerY: (box.top + box.bottom) / 2,
        maxWidth: 440,
        maxSize: layerFontSize(layers.discount, box.bottom - box.top),
        minSize: 90,
        align: 'left',
      });
      drawText(ctx, '*', {
        x: discount.right + 10,
        centerY: 1122,
        maxWidth: 35,
        maxSize: 42,
        minSize: 28,
        align: 'left',
      });
    }],
    [templateLayerIds.oldKopecks, skip],
    [templateLayerIds.oldRubles, () => {
      oldPriceBounds = drawPriceGroup(
        ctx,
        layers.oldRubles,
        layers.oldKopecks,
        content.oldRubles,
        content.oldKopecks,
        { left: 51, right: 438, alignment: 'left', rublesMinSize: 92, gap: 12 },
      );
    }],
    [templateLayerIds.newKopecks, skip],
    [templateLayerIds.newRubles, () => {
      drawPriceGroup(
        ctx,
        layers.newRubles,
        layers.newKopecks,
        content.newRubles,
        content.newKopecks,
        { left: 325, right: 1155, alignment: 'center', rublesMinSize: 190, gap: 18 },
      );
    }],
    [templateLayerIds.subtitle, () => {
      drawCenteredLayerText(ctx, layers.subtitle, content.subtitle, 1140, 26);
    }],
    [templateLayerIds.title, () => {
      drawCenteredLayerText(ctx, layers.title, content.title, 1100, 54);
    }],
    [templateLayerIds.oldPriceStrike, () => {
      if (oldPriceBounds) drawStrike(ctx, oldPriceBounds);
    }],
  ]);

  renderTemplate(ctx, psd.children, dynamicRenderers);
  const imageData = canvas.data();
  const rgb = Buffer.allocUnsafe(psd.width * psd.height * 3);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < imageData.length; sourceIndex += 4, targetIndex += 3) {
    rgb[targetIndex] = imageData[sourceIndex];
    rgb[targetIndex + 1] = imageData[sourceIndex + 1];
    rgb[targetIndex + 2] = imageData[sourceIndex + 2];
  }
  return { width: psd.width, height: psd.height, rgb };
};

export const renderPromotionPriceTagImageFromPsd = (psdBuffer: Buffer, row: PromotionTableRow) =>
  renderPromotionPriceTagImage(preparePromotionPriceTagTemplate(psdBuffer), row);

const pdfObject = (id: number, body: string | Buffer) => ({
  id,
  content: Buffer.isBuffer(body) ? body : Buffer.from(body, 'binary'),
});

type PdfImagePlacement = {
  render: () => PromotionPriceTagImage;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PriceTagPdfPage = {
  width: number;
  height: number;
  images: PdfImagePlacement[];
};

// Single tags and print sheets share the same PDF image/stream encoding. Images
// are rendered and compressed one at a time so a batch does not retain all RGB
// rasters (about 4.8 MB per tag) in memory.
const buildPdf = (pages: PriceTagPdfPage[]) => {
  const objects = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>\n'),
    pdfObject(2, ''),
  ];
  const addObject = (body: string | Buffer) => {
    const objectId = objects.length + 1;
    objects.push(pdfObject(objectId, body));
    return objectId;
  };
  const pageIds: number[] = [];
  for (const page of pages) {
    const pageId = addObject('');
    pageIds.push(pageId);
    const imageReferences: string[] = [];
    const drawingCommands: string[] = [];
    for (const [index, placement] of page.images.entries()) {
      const image = placement.render();
      const compressedRgb = zlib.deflateSync(image.rgb, { level: 9 });
      const imageId = addObject(Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressedRgb.length} >>\nstream\n`,
          'binary',
        ),
        compressedRgb,
        Buffer.from('\nendstream\n', 'binary'),
      ]));
      imageReferences.push(`/Im${index} ${imageId} 0 R`);
      drawingCommands.push(
        `q\n${placement.width.toFixed(2)} 0 0 ${placement.height.toFixed(2)} ${placement.x.toFixed(2)} ${placement.y.toFixed(2)} cm\n/Im${index} Do\nQ\n`,
      );
    }
    const content = drawingCommands.join('');
    const contentId = addObject(`<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}endstream\n`);
    objects[pageId - 1] = pdfObject(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width.toFixed(2)} ${page.height.toFixed(2)}] /Resources << /XObject << ${imageReferences.join(' ')} >> >> /Contents ${contentId} 0 R >>\n`,
    );
  }
  objects[1] = pdfObject(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\n`);

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  let byteOffset = chunks[0].length;
  for (const object of objects) {
    offsets[object.id] = byteOffset;
    const objectHeader = Buffer.from(`${object.id} 0 obj\n`, 'binary');
    const objectFooter = Buffer.from('endobj\n', 'binary');
    chunks.push(objectHeader, object.content, objectFooter);
    byteOffset += objectHeader.length + object.content.length + objectFooter.length;
  }
  const xrefOffset = byteOffset;
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

const buildSinglePriceTagPdf = (render: () => PromotionPriceTagImage) => buildPdf([{
  width: PAGE_WIDTH_PT,
  height: PAGE_HEIGHT_PT,
  images: [{ render, x: 0, y: 0, width: PAGE_WIDTH_PT, height: PAGE_HEIGHT_PT }],
}]);

export const createPromotionPriceTagPdfFromPsd = (psdBuffer: Buffer, row: PromotionTableRow) =>
  buildSinglePriceTagPdf(() => renderPromotionPriceTagImageFromPsd(psdBuffer, row));

export const promotionPriceTagFileName = (row: PromotionTableRow) => {
  const period = priceTagPeriod(row);
  const prefix = 'Ценник_';
  const suffix = `_${period}.pdf`;
  const maxProductLength = Math.max(1, 180 - prefix.length - suffix.length);
  const product = safeFileNamePart(row.productName).slice(0, maxProductLength).trim().replace(/[. ]+$/g, '');
  return `${prefix}${product || 'Товар'}${suffix}`;
};

export const promotionPriceTagContentDisposition = (row: PromotionTableRow) => {
  const fileName = promotionPriceTagFileName(row);
  const fallbackPeriod = formatPeriod(row.startDate, row.endDate) || 'no-date';
  const fallback = `price-tag-${row.rowNumber}-${fallbackPeriod}.pdf`;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

export const createPromotionPriceTagPdf = (row: PromotionTableRow): Buffer =>
  buildSinglePriceTagPdf(() => renderPromotionPriceTagImage(loadPromotionPriceTagTemplate(), row));

export const createPromotionPriceTagSheetPdf = (rows: readonly PromotionTableRow[]): Buffer => {
  if (!rows.length) throw new Error('Нет акций для печати ценников.');
  const template = loadPromotionPriceTagTemplate();
  const pages: PriceTagPdfPage[] = [];
  const left = (A4_WIDTH_PT - PAGE_WIDTH_PT * 2 - SHEET_GAP_PT) / 2;
  const bottom = (A4_HEIGHT_PT - PAGE_HEIGHT_PT * 2 - SHEET_GAP_PT) / 2;
  for (let offset = 0; offset < rows.length; offset += 4) {
    pages.push({
      width: A4_WIDTH_PT,
      height: A4_HEIGHT_PT,
      images: rows.slice(offset, offset + 4).map((row, index) => ({
        render: () => renderPromotionPriceTagImage(template, row),
        x: left + (index % 2) * (PAGE_WIDTH_PT + SHEET_GAP_PT),
        y: bottom + (1 - Math.floor(index / 2)) * (PAGE_HEIGHT_PT + SHEET_GAP_PT),
        width: PAGE_WIDTH_PT,
        height: PAGE_HEIGHT_PT,
      })),
    });
  }
  return buildPdf(pages);
};
