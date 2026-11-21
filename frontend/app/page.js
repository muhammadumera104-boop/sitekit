import Link from 'next/link';
import { Icon } from '@/components/Icons';

export const metadata = {
  title: 'SiteForge — Online ordering & store platform',
  description: 'Launch branded online stores with delivery, POS, riders, promo codes and a real admin portal — all from one platform.',
};

const FEATURES = [
  ['🛍️', 'Branded online stores', 'Every business gets its own website, theme and address — launched in minutes, no code.'],
  ['🛵', 'Delivery & rider app', 'City and area picker, delivery fees, live rider tracking and one-tap delivered.'],
  ['💳', 'POS & payments', 'Cashier point of sale, cash on delivery, JazzCash / Easypaisa / bank with verification.'],
  ['🏷️', 'Promos & reviews', 'Promo codes, customer accounts, order history, reorder and verified reviews.'],
  ['🎚️', 'Feature toggles', 'Switch features on or off per store or for the whole platform from one dashboard.'],
  ['🔐', 'Roles & security', 'Owner, manager, worker and rider doors. Every store is fully isolated.'],
];
const STEPS = [['Create a store', 'Add the business, pick a template and upload a logo.'], ['Add the menu', 'Categories, items, options and photos — or import a CSV.'], ['Go live', 'Share the link. Orders arrive with a sound alert and print-ready tickets.']];

// Deliberately neutral: the platform home never lists customer websites.
// Every business lives at its own address (/their-name) with its own staff login (/their-name/login).
export default function Home() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-brand"><img src="/icon.svg" alt="" width="34" height="34" /> SiteForge</div>
        <div className="row" style={{ gap: 8 }}><Link className="btn lp-btn" href="/demo" prefetch={false}>View demo</Link><Link className="btn lp-btn" href="/login" prefetch={false}>Admin login</Link></div>
      </header>
      <section className="lp-hero">
        <div className="lp-copy">
          <span className="lp-pill">Multi-store ordering platform</span>
          <h1>One platform. Every <em>premium</em> store online.</h1>
          <p>Launch branded websites with delivery, POS, riders and payments. Manage everything from a single admin portal.</p>
          <div className="lp-cta">
            <Link className="btn primary lg" href="/demo" prefetch={false}>View demo (no login) →</Link>
            <Link className="btn lg" href="/login" prefetch={false}>Admin login</Link>
          </div>
          <div className="lp-note">Looking for a restaurant or shop? Open its own web address.</div>
        </div>
        <div className="lp-card" aria-hidden="true">
          <div className="lp-mock">
            <div className="m-head"><span /><span /><span /></div>
            <div className="m-hero">Authentic Kababs &amp; Grills</div>
            <div className="m-row"><i /><i /><i /></div>
            <div className="m-cart">🛒 View cart (2) · Rs. 750</div>
          </div>
          <div className="lp-float f1">🔔 New order #7K2X9</div>
          <div className="lp-float f2">🛵 Rider on the way</div>
        </div>
      </section>
      <section className="lp-sec">
        <h2>Everything a delivery business needs</h2>
        <div className="lp-grid">
          {FEATURES.map(([i, t, d]) => <div className="lp-feat" key={t}><span>{i}</span><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </section>
      <section className="lp-sec">
        <h2>Live in three steps</h2>
        <div className="lp-steps">
          {STEPS.map(([t, d], k) => <div key={t}><b>{k + 1}</b><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </section>
      <footer className="lp-foot">
        <div className="lp-foot-links">
          <Link href="/login" prefetch={false} className="lp-foot-link"><Icon name="shield" size={18} /> Admin portal</Link>
          <Link href="/demo" prefetch={false} className="lp-foot-link"><Icon name="eye" size={18} /> View demo (no login)</Link>
        </div>
        <div>© {new Date().getFullYear()} SiteForge · Multi-store ordering platform</div>
      </footer>
    </div>
  );
}
