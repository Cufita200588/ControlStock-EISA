export const toCSV = (rows) => {
  if (!rows || !rows.length) return '';
  const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = cols.map(esc).join(',');
  const body = rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n');
  return head + '\n' + body;
};
