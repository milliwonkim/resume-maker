import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/pdf-fonts/*': [
      './node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff2',
      './node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff',
    ],
  },
};

export default nextConfig;
