/**
 * Lightweight CSV export utility — no external dependencies.
 * Handles string escaping, BOM for Excel, and file download.
 */

function escapeCell(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  // Wrap in quotes if it contains a comma, newline, or quote character
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ];
  return lines.join('\r\n');
}

/**
 * Triggers a browser download of the given data as a UTF-8 CSV file
 * with a BOM so Excel opens it correctly.
 */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const csv = buildCsv(headers, rows);
  // UTF-8 BOM keeps Excel happy
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Format a Date or ISO string for CSV output */
export function formatDateForCsv(date: string | Date | undefined | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace('T', ' ').substring(0, 19);
}
