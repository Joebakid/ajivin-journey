import './globals.css';
import { Inter } from 'next/font/google';
import type { Metadata, Viewport } from 'next';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  themeColor: '#0a7337',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'https://ajivin-journey.vercel.app'
  ),
  title: {
    default: 'AJMS | Fleet Dispatch & Real-Time Journey Tracking',
    template: '%s | AJMS',
  },
  description:
    'Ajivin Journey Management System (AJMS) - Enterprise logistics platform for live GPS fleet tracking, dispatch coordination, fast-track clearances, and driver expense reporting.',
  applicationName: 'AJMS',
  authors: [{ name: 'Ajivin Group of Companies' }],
  creator: 'Ajivin Group of Companies',
  publisher: 'Ajivin Logistics',
  keywords: [
    'AJMS',
    'Ajivin',
    'Fleet Management',
    'Journey Management',
    'Real-time GPS Tracking',
    'Logistics Dispatch',
    'Driver Management',
    'Cargo Transit Monitoring',
  ],
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: '/',
    siteName: 'AJMS - Ajivin Journey Management System',
    title: 'AJMS | Fleet Dispatch & Real-Time Journey Tracking',
    description:
      'Enterprise logistics management and live GPS fleet dispatch coordination by Ajivin Group of Companies.',
    images: [
      {
        url: '/logo.png',
        width: 800,
        height: 800,
        alt: 'Ajivin Journey Management System Logo',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'AJMS | Fleet Dispatch & Real-Time Journey Tracking',
    description:
      'Enterprise logistics management and live GPS fleet dispatch coordination by Ajivin Group of Companies.',
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen flex flex-col`}>
        <div className="flex-grow">
          {children}
        </div>
        <footer className="w-full py-4 bg-white border-t border-slate-200 text-center text-xs text-slate-500 mt-auto">
          <p>&copy; {new Date().getFullYear()} Ajivin Group of Companies. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
