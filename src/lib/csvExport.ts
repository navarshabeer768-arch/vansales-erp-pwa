/** Converts an array of flat values (already stringified by the caller) into a downloadable CSV file. */
export function exportRowsToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (value: string | number) => {
    const str = String(value ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const csv = [headers.map(escapeCell).join(','), ...rows.map((row) => row.map(escapeCell).join(','))].join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel-friendly UTF-8

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
