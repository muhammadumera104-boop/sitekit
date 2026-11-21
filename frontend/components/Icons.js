'use client';
// Line icons for the side menus (24x24, drawn with currentColor so they follow the theme and the active state).
const P = {
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></>,
  bag: <><path d="M5.5 8h13l1 12.5h-15L5.5 8z" /><path d="M9 8V7a3 3 0 0 1 6 0v1" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></>,
  users: <><path d="M16 20v-1.2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V20" /><circle cx="10" cy="8" r="3.5" /><path d="M20 20v-1a3.2 3.2 0 0 0-2.4-3.1M15.6 4.6a3.5 3.5 0 0 1 0 6.8" /></>,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />,
  tag: <><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.3" /></>,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></>,
  bank: <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18" />,
  box: <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />,
  building: <path d="M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 7h3M8 11h3M8 15h3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.9-.9 1.6-1.9-.3-1 .3-2.1 1.4-2.1H17a4 4 0 0 0 4-4c0-5-4-10-9-10z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  sliders: <><path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0" /><circle cx="15" cy="6" r="2.2" /><circle cx="9" cy="12" r="2.2" /><circle cx="17" cy="18" r="2.2" /></>,
  megaphone: <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></>,
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  cog: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  scooter: <><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M8.5 17H14l2.5-7H13M16.5 10l1.5 7M6 17l1.5-5H11" /></>,
  store: <path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M9.5 20v-5.5h5V20" />,
  map: <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />,
  utensils: <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 4-3.5 7.5V14H17" />,
  file: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h6" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-9 9" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 7.5l9 6 9-6" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  coins: <><circle cx="12" cy="12" r="9" /><path d="M14.8 9.4c-.4-.9-1.4-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.2 1.7 2.8 2 2.8.8 2.8 2-1.2 2-2.8 2c-1.5 0-2.5-.5-3-1.5M12 6.2V8M12 16v1.8" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>,
  dot: <circle cx="12" cy="12" r="2.5" />,
};

// Old emoji used in the nav definitions -> icon name.
const MAP = {
  '▦': 'grid', '🌐': 'globe', '🛍': 'bag', '🧾': 'receipt', '💰': 'coins', '🧑‍🤝‍🧑': 'users', '⭐': 'star', '🏷': 'tag', '💳': 'card', '🏦': 'bank', '📦': 'box',
  '🏢': 'building', '＋': 'plus', '🎨': 'palette', '🎚': 'sliders', '📣': 'megaphone', '👥': 'users', '🔑': 'key', '📜': 'pulse', '⚙': 'cog',
  '🛵': 'scooter', '🏬': 'store', '🗺': 'map', '🍽': 'utensils', '📄': 'file', '🖼': 'image', '✉': 'mail', '👁': 'eye', '📈': 'trend',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg className="nav-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] || P.dot}
    </svg>
  );
}

export const NavIcon = ({ glyph }) => <Icon name={MAP[String(glyph || '').replace(/\uFE0F/g, '')] || (P[glyph] ? glyph : 'dot')} />;

// Brand mark for the side menu header.
export const BrandMark = () => (
  <svg className="brand-mark" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3dc92" /><stop offset="1" stopColor="#b8892f" /></linearGradient></defs>
    <path d="M12 2l8.5 6.2-3.2 12.3H6.7L3.5 8.2 12 2z" fill="none" stroke="url(#bm)" strokeWidth="1.8" strokeLinejoin="round" /><path d="M3.5 8.2h17M9 8.2l3 12.3 3-12.3M12 2L9 8.2M12 2l3 6.2" fill="none" stroke="url(#bm)" strokeWidth="1.2" strokeLinejoin="round" opacity=".7" />
  </svg>
);
