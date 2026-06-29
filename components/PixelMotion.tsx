'use client';

import { useEffect, useRef } from 'react';

/**
 * Lightweight animated pixelated background. Renders a tiny low-res field of dithered
 * grayscale pixels (layered sine waves, quantized) on a small canvas, then CSS-scales it up
 * with image-rendering:pixelated → big chunky moving pixels. ~6k pixels/frame = cheap on CPU/memory.
 */
export function PixelMotion() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const W = 420; // higher res = much smaller pixels
    const H = 236;
    cv.width = W;
    cv.height = H;
    const img = ctx.createImageData(W, H);
    const data = img.data;
    let raf = 0;
    let t = 0;

    const draw = () => {
      t += 0.014;
      for (let y = 0; y < H; y++) {
        const ny = y / H;
        for (let x = 0; x < W; x++) {
          const nx = x / W;
          // normalized frequencies → pattern scale is independent of resolution
          let v =
            Math.sin(nx * 18 + t) +
            Math.sin(ny * 13 + t * 0.8) +
            Math.sin((nx + ny) * 14 - t * 0.6) +
            Math.sin(Math.hypot(nx - 0.5, ny - 0.5) * 18 - t * 1.1);
          v = (v + 4) / 8; // → 0..1
          const levels = 6;
          v = Math.round(v * levels) / levels; // quantize → dither banding
          const g = Math.floor(7 + v * 40); // dark grayscale 7..47
          const i = (y * W + x) * 4;
          data[i] = g;
          data[i + 1] = g;
          data[i + 2] = g + 3; // faint cool tint
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
