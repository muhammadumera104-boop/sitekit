import './globals.css';
import './site.css';
import './ordering.css';
import './theme.css';
import './extras.css';
import './fashion.css';
import './dark.css';
import { Plus_Jakarta_Sans, Outfit, Playfair_Display } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';

// Modern type: Plus Jakarta Sans for text, Outfit for headings (Playfair available as a serif option per store).
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap' });

const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

export const metadata = {
  metadataBase: new URL(base),
  title: { default: 'SiteForge — Online ordering & store platform', template: '%s' },
  description: 'Launch branded online stores with delivery, POS, riders and a real admin portal — all from one platform.',
  applicationName: 'SiteForge',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};
export const viewport = { themeColor: '#4f46e5', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${outfit.variable} ${playfair.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('theme')||'dark';document.documentElement.dataset.theme=t}catch(e){}" }} />
      </head>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
