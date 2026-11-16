import './globals.css';

export const metadata = { title: 'Live Stock Monitor', description: 'Live prices, charts, high/low and alerts' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
