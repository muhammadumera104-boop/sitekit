'use client';
import { useEffect } from 'react';

// Sets the browser tab title and icon for client-rendered areas (dashboard / admin), so the tab shows the brand, not a blank globe.
export function useTabBrand(title, icon) {
  useEffect(() => {
    if (title) document.title = title;
    if (!icon) return undefined;
    let link = document.querySelector('link[rel="icon"][data-brand]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; link.dataset.brand = '1'; document.head.appendChild(link); }
    link.href = icon;
    // Drop the default icon links so the brand icon wins.
    document.querySelectorAll('link[rel="icon"]:not([data-brand]), link[rel="shortcut icon"]').forEach((l) => l.remove());
    return undefined;
  }, [title, icon]);
}
