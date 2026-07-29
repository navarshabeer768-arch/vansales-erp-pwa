import * as XLSX from 'xlsx';

export function exportRowsToExcel(filename: string, headers: string[], rows: (string | number)[][]) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Reads the first sheet of an .xlsx/.xls file into an array of row objects keyed by the header row — same shape as parseCsv, so both can feed the same import logic. */
export async function parseExcelFile(file: File): Promise<Record<string, string>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      obj[key.trim()] = String(row[key] ?? '').trim();
    }
    return obj;
  });
}
