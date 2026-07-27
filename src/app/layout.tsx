import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ES CP热度排行榜',
  description: '追踪LOFTER上偶像梦幻祭CP标签热度，实时排名',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
