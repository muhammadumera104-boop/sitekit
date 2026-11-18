'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Sets the browser tab title and icon for client-rendered areas (dashboard / admin), so the tab shows the brand, not a blank globe.
// NEVER remove or replace nodes inside <head>: Next.js manages them and crashes ("removeChild") on the next navigation.
// We only change attributes on the existing icon links (or add one if there is none).
export function useTabBrand(title, icon) {
  const path = usePathname(); // re-apply after every client-side navigation (Next resets the title/icon)
  useEffect(() => {
    if (title) document.title = title;
    if (!icon) return;
    const links = document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]');
    if (links.length) {
      links.forEach((l) => { l.removeAttribute('type'); l.removeAttribute('sizes'); l.setAttribute('href', icon); });
    } else {
      const l = document.createElement('link');
      l.rel = 'icon'; l.href = icon;
      document.head.appendChild(l);
    }
  }, [title, icon, path]);
}
