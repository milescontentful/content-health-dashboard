import { useEffect, useState } from 'react';
import tokens from '@contentful/f36-tokens';

// Status colors validated for ≥3:1 contrast on white (dataviz six-checks):
// green500 / yellow700 / red600. Score + grade text always accompany the
// color, so state is never encoded by color alone.
export function statusColor(score: number): string {
  if (score >= 80) return tokens.green500;
  if (score >= 60) return tokens.yellow700;
  return tokens.red600;
}

export function ScoreRing({ score, grade, size = 132 }: { score: number; grade: string; size?: number }) {
  const STROKE = size >= 100 ? 9 : 7;
  const R = size / 2 - STROKE;
  const C = 2 * Math.PI * R;
  const center = size / 2;
  // Animate the arc sweeping in on mount / score change
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDrawn(score));
    return () => cancelAnimationFrame(t);
  }, [score]);
  const color = statusColor(score);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} role="img" aria-label={`Health score ${score} out of 100, grade ${grade}`}>
        <circle cx={center} cy={center} r={R} fill="none" stroke={tokens.gray200} strokeWidth={STROKE} />
        <circle
          cx={center} cy={center} r={R} fill="none"
          stroke={color} strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - drawn / 100)}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.3s' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size >= 100 ? 34 : 26, fontWeight: 700, lineHeight: 1, color: tokens.gray900, fontVariantNumeric: 'tabular-nums' }}>
          {score}
        </span>
        <span style={{ fontSize: size >= 100 ? 12 : 10, fontWeight: 600, color, letterSpacing: 0.5 }}>GRADE {grade}</span>
      </div>
    </div>
  );
}
