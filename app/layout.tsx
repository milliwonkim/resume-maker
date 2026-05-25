import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NotesProvider } from '@/components/providers/NotesProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://resume-ai.vercel.app';
const TITLE = 'ResumeAI — AI로 완성하는 나만의 이력서';
const DESCRIPTION =
  '경력, 기술, 프로젝트를 AI와 함께 정리해 세련된 이력서를 5분 안에 완성하세요.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s · ResumeAI',
  },
  description: DESCRIPTION,
  keywords: [
    '이력서',
    '이력서 빌더',
    'AI 이력서',
    'resume builder',
    '포트폴리오',
  ],
  authors: [{ name: 'milliwonkim' }],
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: 'ResumeAI',
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'ResumeAI — AI로 완성하는 나만의 이력서',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <QueryProvider>
          {children}
          <NotesProvider />
        </QueryProvider>
      </body>
    </html>
  );
}
