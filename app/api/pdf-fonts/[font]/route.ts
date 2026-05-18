import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REGULAR_FONT_PATH = path.join(
  process.cwd(),
  'node_modules',
  '@fontsource',
  'noto-sans-kr',
  'files',
  'noto-sans-kr-korean-400-normal.woff2'
);
const BOLD_FONT_PATH = path.join(
  process.cwd(),
  'node_modules',
  '@fontsource',
  'noto-sans-kr',
  'files',
  'noto-sans-kr-korean-700-normal.woff'
);

interface RouteContext {
  params: Promise<{
    font: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { font } = await context.params;
  if (font !== 'regular' && font !== 'bold') {
    return Response.json({ error: 'Font not found' }, { status: 404 });
  }

  const filePath = font === 'regular' ? REGULAR_FONT_PATH : BOLD_FONT_PATH;
  const fontBytes = await readFile(filePath);
  return new Response(fontBytes, {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': font === 'regular' ? 'font/woff2' : 'font/woff',
    },
  });
}
