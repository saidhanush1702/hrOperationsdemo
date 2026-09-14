import * as XLSX from 'xlsx';

/**
 * Export an array of objects to an .xlsx file.
 * @param {Object[]} data   - Flat array of row objects
 * @param {string[]} headers - Column header labels (in order)
 * @param {string[]} keys    - Object keys matching each header
 * @param {string}  filename - Downloaded file name (without extension)
 */
export const exportToExcel = (data, headers, keys, filename = 'export') => {
    const rows = [
        headers,
        ...data.map(row => keys.map(k => {
            const v = row[k];
            return v === null || v === undefined ? '' : v;
        })),
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Auto-width columns
    const colWidths = headers.map((h, i) => {
        const maxLen = Math.max(
            h.length,
            ...data.map(row => String(row[keys[i]] ?? '').length)
        );
        return { wch: Math.min(maxLen + 2, 50) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename}.xlsx`);
};
