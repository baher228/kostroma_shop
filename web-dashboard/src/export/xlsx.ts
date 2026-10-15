export type XlsxCell = {
  value: string | number;
  style?: number;
  type?: 'number' | 'string';
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const crcTable = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

const zipHeader = (size: number): Uint8Array => new Uint8Array(size);

const makeZip = (files: Array<{ path: string; content: string }>): Uint8Array => {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);

    const localHeader = zipHeader(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(10, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, contentBytes.length, true);
    localView.setUint32(22, contentBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = zipHeader(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(12, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, contentBytes.length, true);
    centralView.setUint32(24, contentBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + contentBytes.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const endHeader = zipHeader(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return concatBytes([...localParts, centralDirectory, endHeader]);
};

export const xlsxColumnName = (index: number): string => {
  let name = '';
  let current = index;
  while (current > 0) {
    const mod = (current - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    current = Math.floor((current - mod) / 26);
  }
  return name;
};

const xlsxCellXml = (cell: XlsxCell, rowIndex: number, colIndex: number): string => {
  const ref = `${xlsxColumnName(colIndex)}${rowIndex}`;
  const style = cell.style ? ` s="${cell.style}"` : '';
  if (cell.value === '') {
    return `<c r="${ref}"${style}/>`;
  }
  if (cell.type === 'number' && typeof cell.value === 'number') {
    return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(String(cell.value))}</t></is></c>`;
};

const xlsxPackageBlob = (sheetName: string, stylesXml: string, sheetXml: string): Blob => {
  const files = [
    {
      path: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    },
    {
      path: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      path: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${escapeXml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>` +
        '</workbook>',
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    },
    {
      path: 'xl/styles.xml',
      content: stylesXml,
    },
    {
      path: 'xl/worksheets/sheet1.xml',
      content: sheetXml,
    },
  ];

  const zipBytes = makeZip(files);
  const zipBuffer = zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer;
  return new Blob([zipBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

export const makeXlsxBlob = (
  sheetName: string,
  rows: XlsxCell[][],
  merges: string[],
  options: { nameColumns?: number[] } = {},
): Blob => {
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const lastColumn = xlsxColumnName(columnCount);
  const colsXml = options.nameColumns
    ? `<cols>${Array.from({ length: columnCount }, (_, index) => {
        const column = index + 1;
        const width = options.nameColumns?.includes(column) ? 42 : 12;
        return `<col min="${column}" max="${column}" width="${width}" customWidth="1"/>`;
      }).join('')}</cols>`
    : '<cols><col min="1" max="1" width="42" customWidth="1"/><col min="2" max="200" width="12" customWidth="1"/></cols>';
  const sheetData = rows
    .map((row, rowIndex) =>
      `<row r="${rowIndex + 1}">${row.map((cell, colIndex) => xlsxCellXml(cell, rowIndex + 1, colIndex + 1)).join('')}</row>`,
    )
    .join('');
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : '';
  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font/><font><b/></font></fonts>' +
        '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFECF1EC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD6DFD6"/></patternFill></fill></fills>' +
        '<borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="center"/></xf></cellXfs>' +
        '</styleSheet>';
  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<dimension ref="A1:${lastColumn}${Math.max(rows.length, 1)}"/>` +
        colsXml +
        `<sheetData>${sheetData}</sheetData>${mergeXml}` +
        '</worksheet>';
  return xlsxPackageBlob(sheetName, stylesXml, sheetXml);
};

export type XlsxCellStyle = {
  font: string;
  size: number;
  bold?: boolean;
  horizontal?: 'left' | 'center';
  vertical: 'center' | 'bottom';
  wrap?: boolean;
  text?: boolean;
  fill?: boolean;
  border: [left: boolean, right: boolean, top: boolean, bottom: boolean];
};

export type XlsxTemplateCell = { value: string | number; style: number };

const TEMPLATE_FILL_RGB = 'FFBDD7EE';
const TEXT_NUMBER_FORMAT_ID = 49;

const templateStylesXml = (styles: XlsxCellStyle[]): string => {
  const fontKeys = [...new Set(styles.map((style) => `${style.font}|${style.size}|${style.bold ? 1 : 0}`))];
  const borderKeys = [...new Set(styles.map((style) => style.border.map((side) => (side ? 1 : 0)).join('')))];
  const fontsXml = fontKeys
    .map((key) => {
      const [name, size, bold] = key.split('|');
      return `<font>${bold === '1' ? '<b/>' : ''}<sz val="${size}"/><name val="${escapeXml(name)}"/></font>`;
    })
    .join('');
  const side = (name: string, on: string) => (on === '1' ? `<${name} style="hair"><color auto="1"/></${name}>` : `<${name}/>`);
  const bordersXml = borderKeys
    .map((key) => `<border>${side('left', key[0])}${side('right', key[1])}${side('top', key[2])}${side('bottom', key[3])}<diagonal/></border>`)
    .join('');
  const xfsXml = styles
    .map((style) => {
      const fontId = fontKeys.indexOf(`${style.font}|${style.size}|${style.bold ? 1 : 0}`) + 1;
      const borderId = borderKeys.indexOf(style.border.map((on) => (on ? 1 : 0)).join('')) + 1;
      const fillId = style.fill ? 2 : 0;
      const numFmtId = style.text ? TEXT_NUMBER_FORMAT_ID : 0;
      const horizontal = style.horizontal ? ` horizontal="${style.horizontal}"` : '';
      const wrap = style.wrap ? ' wrapText="1"' : '';
      return `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment${horizontal} vertical="${style.vertical}"${wrap}/></xf>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<fonts count="${fontKeys.length + 1}"><font><sz val="11"/><name val="Calibri"/></font>${fontsXml}</fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="${TEMPLATE_FILL_RGB}"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="${borderKeys.length + 1}"><border><left/><right/><top/><bottom/><diagonal/></border>${bordersXml}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${styles.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xfsXml}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
};

const templateCellXml = (cell: XlsxTemplateCell, ref: string): string => {
  const style = ` s="${cell.style + 1}"`;
  if (cell.value === '') return `<c r="${ref}"${style}/>`;
  if (typeof cell.value === 'number') return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
};

// Fixed-layout sheet: every cell carries its own style, with explicit column widths and row heights.
export const makeTemplateXlsxBlob = (params: {
  sheetName: string;
  styles: XlsxCellStyle[];
  cells: XlsxTemplateCell[][];
  merges: string[];
  columnWidths: number[];
  rowHeights: number[];
}): Blob => {
  const { sheetName, styles, cells, merges, columnWidths, rowHeights } = params;
  const columnCount = Math.max(columnWidths.length, ...cells.map((row) => row.length), 1);
  const colsXml = `<cols>${columnWidths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('')}</cols>`;
  const sheetData = cells
    .map((row, rowIndex) => {
      const height = rowHeights[rowIndex];
      const heightAttr = height ? ` ht="${height}" customHeight="1"` : '';
      const cellsXml = row.map((cell, colIndex) => templateCellXml(cell, `${xlsxColumnName(colIndex + 1)}${rowIndex + 1}`)).join('');
      return `<row r="${rowIndex + 1}"${heightAttr}>${cellsXml}</row>`;
    })
    .join('');
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : '';
  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${xlsxColumnName(columnCount)}${Math.max(cells.length, 1)}"/>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    colsXml +
    `<sheetData>${sheetData}</sheetData>${mergeXml}` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>';
  return xlsxPackageBlob(sheetName, templateStylesXml(styles), sheetXml);
};
