'use client';

/**
 * Aurora light-leak background: black base with soft, drifting blurred color blobs that emanate
 * from the TOP edge and smear down the sides — blue + pink. Plus a twinkling center star and a
 * dotted grid (matching the node canvas). All CSS/GPU — no image or canvas.
 */
const PINK = 'rgba(255,95,175,0.55)';
const BLUE = 'rgba(70,135,250,0.5)';

export function AuroraBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black">
      {/* top-left, smearing down the left edge — pink */}
      <div className="aurora-blob" style={{ left: '-14%', top: '-18%', width: '52vw', height: '88vh', background: `radial-gradient(ellipse 50% 55% at 50% 30%, ${PINK}, transparent 68%)`, filter: 'blur(70px)', animation: 'aurora-1 11s ease-in-out infinite' }} />
      {/* left side — blue */}
      <div className="aurora-blob" style={{ left: '-8%', top: '-14%', width: '26vw', height: '95vh', background: `radial-gradient(ellipse 45% 50% at 50% 25%, ${BLUE}, transparent 70%)`, filter: 'blur(60px)', animation: 'aurora-3 13s ease-in-out infinite' }} />
      {/* top-center — blue */}
      <div className="aurora-blob" style={{ left: '30%', top: '-22%', width: '46vw', height: '46vw', background: `radial-gradient(circle, ${BLUE}, transparent 65%)`, filter: 'blur(70px)', animation: 'aurora-2 12s ease-in-out infinite' }} />
      {/* band across the top — pink */}
      <div className="aurora-blob" style={{ left: '12%', top: '-24%', width: '78vw', height: '34vw', background: `radial-gradient(ellipse 60% 55% at 50% 40%, ${PINK}, transparent 68%)`, filter: 'blur(70px)', animation: 'aurora-1 10s ease-in-out infinite reverse' }} />
      {/* top-right, smearing down the right edge — blue */}
      <div className="aurora-blob" style={{ right: '-14%', top: '-16%', width: '46vw', height: '88vh', background: `radial-gradient(ellipse 50% 55% at 50% 30%, ${BLUE}, transparent 68%)`, filter: 'blur(70px)', animation: 'aurora-2 14s ease-in-out infinite' }} />

      {/* center star sparkle */}
      <div className="aurora-star" />
      {/* dotted grid (like the canvas) */}
      <div className="canvas-dots" />
    </div>
  );
}
