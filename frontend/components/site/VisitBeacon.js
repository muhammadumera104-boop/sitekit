'use client';
import { useEffect } from 'react';

export default function VisitBeacon({ slug, path }) {
  useEffect(() => {
    fetch(`/api/public/tenants/${slug}/visit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }).catch(() => {});
  }, [slug, path]);
  return null;
}
