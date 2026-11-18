export const money = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export const FONTS = [
  { label: 'Serif (Georgia)', value: 'Georgia, serif' },
  { label: 'Modern (Trebuchet)', value: 'Trebuchet MS, sans-serif' },
  { label: 'Clean (Verdana)', value: 'Verdana, sans-serif' },
  { label: 'System', value: 'system-ui, sans-serif' },
  { label: 'Classic (Palatino)', value: 'Palatino Linotype, Palatino, serif' },
  { label: 'Mono (Courier)', value: 'Courier New, monospace' },
];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const defaultHours = () => DAYS.map((day) => ({ day, open: '09:00', close: '21:00', closed: false }));

// Minimal CSV parser (handles quotes) for bulk import: category,name,description,price,image
export function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; if (row.some((x) => x.trim())) rows.push(row); row = [];
    } else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
export function parseImport(text) {
  const t = text.trim();
  let rows = t.startsWith('[') ? JSON.parse(t) : parseCsv(t);
  rows = rows.map((r) => ({
    category: r.category, name: r.name, description: r.description || '', price: Number(r.price) || 0, image: r.image || '',
    isAvailable: !['false', '0', 'no'].includes(String(r.isAvailable ?? r.isavailable ?? 'true').toLowerCase()),
  }));
  return rows.filter((r) => r.category && r.name);
}
