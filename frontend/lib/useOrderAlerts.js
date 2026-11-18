'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';

const KEY = 'alerts';
export const alertsOn = () => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } };

// A short two-tone chime (no audio file needed).
export function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [[880, 0], [1175, 0.16], [880, 0.32]].forEach(([f, t]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.15);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16);
    });
    setTimeout(() => ctx.close(), 900);
  } catch { /* ignore */ }
}

// Called from a button click (browsers only allow sound / notifications after a user gesture).
export async function enableAlerts() {
  try { localStorage.setItem(KEY, 'on'); } catch { /* ignore */ }
  chime();
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
}
export function disableAlerts() { try { localStorage.setItem(KEY, 'off'); } catch { /* ignore */ } }

// Polls the order summary; plays a chime and shows a notification when a NEW order arrives. Returns the live counts for the nav badge.
export function useOrderAlerts(slug, enabled, storeName = 'Store') {
  const [s, setS] = useState({ newOrders: 0, pendingPayments: 0 });
  const prev = useRef(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let stop = false;
    async function tick() {
      try {
        const d = await api('/tenant/orders/summary', { tenant: slug });
        if (stop) return;
        setS({ newOrders: d.newOrders || 0, pendingPayments: d.pendingPayments || 0 });
        if (prev.current !== null && d.newOrders > prev.current && alertsOn()) {
          chime();
          if ('Notification' in window && Notification.permission === 'granted') {
            try { new Notification(`${storeName}: new order${d.latestNew ? ` #${d.latestNew.number}` : ''}`, { body: `${d.newOrders} order(s) waiting`, tag: 'new-order' }); } catch { /* ignore */ }
          }
        }
        prev.current = d.newOrders || 0;
      } catch { /* ignore network blips */ }
    }
    tick();
    const t = setInterval(tick, 12000);
    return () => { stop = true; clearInterval(t); };
  }, [slug, enabled, storeName]);
  return s;
}
