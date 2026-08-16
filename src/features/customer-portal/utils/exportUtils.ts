// Utility to generate and trigger browser file downloads for CSV and JSON data

export function exportToCSV<T extends Record<string, any>>(
  filename: string,
  rows: T[],
  headers: { key: keyof T; label: string }[]
) {
  if (!rows || !rows.length) return;

  const separator = ',';
  const csvHeader = headers.map((h) => `"${h.label}"`).join(separator);
  
  const csvRows = rows.map((row) => {
    return headers
      .map((h) => {
        const val = row[h.key];
        const formatted = val !== undefined && val !== null ? String(val).replace(/"/g, '""') : '';
        return `"${formatted}"`;
      })
      .join(separator);
  });

  const csvContent = [csvHeader, ...csvRows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
