import './globals.css';

export const metadata = {
  title: 'CivicFix - AI Civic Problem Management',
  description: 'Report civic issues, track progress and verify resolutions using AI support.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased bg-neutral-50 text-neutral-800">{children}</body>
    </html>
  );
}
