import './globals.css';
import './site.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = {
  title: 'SiteForge — Multi-tenant website platform',
  description: 'One platform, many branded websites. Add a customer and their website goes live instantly.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}" }} />
      </head>
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
