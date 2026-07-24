/**
 * Server-side Remotion render harness for the emphasis node.
 *
 * The composition references the source video, font, and SFX by URL, so we
 * serve the render workspace over a loopback HTTP server for the duration of
 * the render (OffthreadVideo and Audio both read from it). The webpack bundle
 * of remotion/index.ts is built once per process and reused.
 */
import http from 'http';
import path from 'path';
import { createReadStream, promises as fs } from 'fs';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { AdEmphasisData, AdEmphasisProps } from '@/remotion/types';

let bundlePromise: Promise<string> | null = null;

export function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(process.cwd(), 'remotion', 'index.ts'),
    });
  }
  return bundlePromise;
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ttf': 'font/ttf',
};

/** Serve a directory on 127.0.0.1:<random port>. Supports range requests (needed for video seeking). */
export async function serveDir(dir: string): Promise<{ baseUrl: string; close: () => void }> {
  const server = http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\/+/, ''));
      const file = path.join(dir, name);
      if (!file.startsWith(dir)) throw new Error('forbidden');
      const stat = await fs.stat(file);
      const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
      // fonts are fetched cross-origin by the headless browser — CORS is required
      res.setHeader('Access-Control-Allow-Origin', '*');
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const start = m?.[1] ? parseInt(m[1], 10) : 0;
        const end = m?.[2] ? parseInt(m[2], 10) : stat.size - 1;
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
        });
        createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
        createReadStream(file).pipe(res);
      }
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() };
}

export interface RenderEmphasisOpts {
  /** local source video (already inside `assetsDir`) */
  videoFile: string;
  /** directory holding video + sfx + font — served during the render */
  assetsDir: string;
  /** font file name inside assetsDir (optional) */
  fontFile?: string | null;
  props: Omit<AdEmphasisData, 'src' | 'fontUrl'>;
  outFile: string;
  onProgress?: (progress: number) => void;
}

/** Render the AdEmphasis composition to an H.264 MP4 at `outFile`. */
export async function renderEmphasis(opts: RenderEmphasisOpts): Promise<void> {
  const serveUrl = await getBundle();
  const { baseUrl, close } = await serveDir(opts.assetsDir);
  try {
    const inputProps: AdEmphasisProps = {
      ...opts.props,
      src: `${baseUrl}/${encodeURIComponent(path.basename(opts.videoFile))}`,
      fontUrl: opts.fontFile ? `${baseUrl}/${encodeURIComponent(opts.fontFile)}` : null,
      events: opts.props.events.map((ev) => ({
        ...ev,
        sfxUrl: ev.sfxUrl ? `${baseUrl}/${encodeURIComponent(ev.sfxUrl)}` : null,
      })),
    };
    const composition = await selectComposition({ serveUrl, id: 'AdEmphasis', inputProps });
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      inputProps,
      outputLocation: opts.outFile,
      onProgress: opts.onProgress
        ? ({ progress }) => opts.onProgress!(progress)
        : undefined,
    });
  } finally {
    close();
  }
}
