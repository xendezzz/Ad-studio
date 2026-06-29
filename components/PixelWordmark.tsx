'use client';

import { useEffect, useRef } from 'react';

/**
 * Big glowing "Ad-Studio" serif wordmark rendered on a canvas, anchored to the bottom.
 * A circular region follows the cursor (with lag) and shows a PIXELATED version of the
 * wordmark there — sharp everywhere else.
 */
export function PixelWordmark() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let tx = -9999, ty = -9999, lx = -9999, ly = -9999; // target + lagged cursor
    const buffer = document.createElement('canvas');
    const bctx = buffer.getContext('2d')!;
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d')!;

    function renderBuffer() {
      w = window.innerWidth;
      h = window.innerHeight;
      cv!.width = w; cv!.height = h;
      buffer.width = w; buffer.height = h;
      bctx.clearRect(0, 0, w, h);
      bctx.textAlign = 'center';
      bctx.textBaseline = 'alphabetic';
      bctx.font = 'italic 295px "Instrument Serif", Georgia, serif';
      bctx.fillStyle = 'rgba(255,255,255,0.92)';
      bctx.shadowColor = 'rgba(255,255,255,0.5)';
      bctx.shadowBlur = 55;
      bctx.fillText('Ad-Studio', w / 2, h - 22);
      bctx.shadowBlur = 130; // second pass = bigger glow halo
      bctx.fillText('Ad-Studio', w / 2, h - 22);
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      ctx!.drawImage(buffer, 0, 0);
      if (lx > -9000) {
        lx += (tx - lx) * 0.04; // lag toward cursor (more delay = smaller factor)
        ly += (ty - ly) * 0.04;
        const R = 88;
        const block = 8;
        const bx = Math.round(lx - R), by = Math.round(ly - R), rw = R * 2, rh = R * 2;
        const cols = Math.max(1, Math.round(rw / block));
        const rows = Math.max(1, Math.round(rh / block));
        tmp.width = cols; tmp.height = rows;
        tctx.clearRect(0, 0, cols, rows);
        tctx.imageSmoothingEnabled = true;
        tctx.drawImage(buffer, bx, by, rw, rh, 0, 0, cols, rows); // downsample
        // punch a circular hole in the sharp layer, then draw the pixelated tile in it
        ctx!.save();
        ctx!.globalCompositeOperation = 'destination-out';
        ctx!.beginPath(); ctx!.arc(lx, ly, R, 0, Math.PI * 2); ctx!.fillStyle = '#000'; ctx!.fill();
        ctx!.restore();
        ctx!.save();
        ctx!.beginPath(); ctx!.arc(lx, ly, R, 0, Math.PI * 2); ctx!.clip();
        ctx!.imageSmoothingEnabled = false;
        ctx!.drawImage(tmp, 0, 0, cols, rows, bx, by, rw, rh); // upscale = pixelated
        ctx!.restore();
      }
      raf = requestAnimationFrame(draw);
    }

    const onMove = (e: MouseEvent) => { tx = e.clientX; ty = e.clientY; if (lx < -9000) { lx = tx; ly = ty; } };
    const onResize = () => renderBuffer();

    renderBuffer();
    if (document.fonts?.load) document.fonts.load('italic 295px "Instrument Serif"').then(renderBuffer).catch(() => {});
    window.addEventListener('mousemove', onMove);
    window.addEventListener('resize', onResize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-10 h-full w-full" />;
}
