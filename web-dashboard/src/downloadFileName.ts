export const downloadFallbackFileName = (contentType: string | null) => {
  const normalized = (contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (normalized === 'application/pdf') return 'download.pdf';
  if (normalized === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'download.xlsx';
  if (normalized === 'application/vnd.ms-excel') return 'download.xls';
  if (normalized === 'text/csv') return 'download.csv';
  return 'download';
};

export const downloadFileName = (
  disposition: string,
  contentType: string | null,
  selectedDocumentFileName?: string,
) => {
  const fileNameUtf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const fileNameMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (fileNameUtf8Match) {
    try {
      return decodeURIComponent(fileNameUtf8Match[1]);
    } catch {
      // Fall through to the ASCII name when a proxy returned a malformed
      // extended filename.
    }
  }
  return fileNameMatch?.[1] || selectedDocumentFileName || downloadFallbackFileName(contentType);
};
