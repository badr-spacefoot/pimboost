import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PIMuP Mapping Assistant',
  description: 'Assistant interne de mapping PIMuP pour sources CSV/JSON',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
