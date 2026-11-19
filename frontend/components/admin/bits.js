'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useLoad } from '@/components/ui';

// Every admin list can be narrowed to one website. This loads the store picker once.
export const useStores = () => useLoad(() => api('/admin/stores'), []);

export function StoreSelect({ stores = [], value, onChange, all = 'All websites', label = 'Website' }) {
  return (
    <select className="select-sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{all}</option>
      {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

// Small "logo + name" cell that links to the store's admin page.
export function StoreCell({ s }) {
  if (!s) return <span className="muted">—</span>;
  return (
    <Link href={`/admin/tenants/${s.id}`} className="store-cell">
      {s.logo ? <img src={s.logo} alt="" /> : <span className="dot-logo">{s.name.charAt(0)}</span>}
      <span><strong>{s.name}</strong><small>/{s.slug}</small></span>
    </Link>
  );
}

// Debounced search box state.
export function useSearch(delay = 300) {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), delay); return () => clearTimeout(t); }, [q, delay]);
  return [q, setQ, dq];
}

export const Stars = ({ n = 0 }) => <span style={{ color: '#f5a623', letterSpacing: 1, whiteSpace: 'nowrap' }}>{'★'.repeat(n)}<span style={{ opacity: .25 }}>{'★'.repeat(5 - n)}</span></span>;

// Tiny CSV download for the table that is on screen.
export function downloadCsv(name, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const Toolbar = ({ children }) => <div className="toolbar" style={{ marginBottom: 14 }}>{children}</div>;
