import './globals.css';
export const metadata = { title: 'Golden Note Method', description: 'English learning app' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="ja"><body className="bg-gray-50 min-h-screen">{children}</body></html>);
}
