import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
const dm = localFont({
  src: [
    { path: '../../public/fonts/font-3.ttf', weight: '400' },
    { path: '../../public/fonts/font-4.ttf', weight: '500' },
    { path: '../../public/fonts/font-5.ttf', weight: '600' },
    { path: '../../public/fonts/font-6.ttf', weight: '700' },
  ],
  variable: '--font-dm',
  display: 'swap',
});
const barlow = localFont({
  src: [
    { path: '../../public/fonts/font-0.ttf', weight: '600' },
    { path: '../../public/fonts/font-1.ttf', weight: '700' },
    { path: '../../public/fonts/font-2.ttf', weight: '800' },
  ],
  variable: '--font-barlow',
  display: 'swap',
});
export const metadata: Metadata = {
  title: 'CDIR · Basket Analytics',
  description: 'El juego se vive. Los datos lo mejoran. Centro de análisis de CDI Rozasbasket.',
  icons: { icon: '/club/logo.png' },
};
export const viewport: Viewport = { themeColor: '#101D2F', width: 'device-width', initialScale: 1 };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${dm.variable} ${barlow.variable}`}>
      <body>
        <a href="#contenido" className="skip">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
