// Small text PDF with explicit Unicode mapping: exercises pdf-parse itself,
// without adding a PDF dependency or contacting an external service.
exports.textPdf = (lines) => {
  const characters = [...new Set(lines.join('').split(''))];
  if (characters.length > 220) throw new Error('Fixture contains too many distinct characters');
  const codes = new Map(characters.map((char, index) => [char, index + 32]));
  const hex = (value, width) => value.toString(16).padStart(width, '0');
  const mapping = characters.map((char) => `<${hex(codes.get(char), 2)}> <${hex(char.charCodeAt(0), 4)}>`).join('\n');
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Fixture def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${characters.length} beginbfchar\n${mapping}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const content = `BT\n/F1 12 Tf\n20 TL\n40 780 Td\n${lines.map((line) => `<${line.split('').map((char) => hex(codes.get(char), 2)).join('')}> Tj\nT*`).join('\n')}\nET`;
  const stream = (body) => `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 6 0 R >>',
    stream(content), stream(cmap),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
};

exports.promotionInvoicePdf = (name = 'Сервелат Финский') => exports.textPdf([
  'Период акции: 04.10.2026 - 10.10.2026',
  'Рекомендованные розничные цены:',
  `${name} - 80 р/кг`,
]);
