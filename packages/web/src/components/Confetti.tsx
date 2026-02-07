import { useEffect, useState } from "react";
import "./Confetti.css";

interface ConfettiProps {
  active: boolean;
  duration?: number; // ms, default 3000
}

interface Particle {
  id: number;
  x: number;     // start X (%)
  color: string;
  delay: number;  // animation delay (s)
  size: number;   // px
  drift: number;  // horizontal drift (px)
  dur: number;    // fall duration (s)
}

const COLORS = [
  "#6aaa64", // correct green
  "#c9b458", // present yellow
  "#e84393", // pink
  "#a855f7", // purple
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#22c1c3", // teal
];

let idCounter = 0;

export default function Confetti({ active, duration = 3000 }: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    // Generate particles
    const count = 80;
    const ps: Particle[] = [];
    for (let i = 0; i < count; i++) {
      ps.push({
        id: ++idCounter,
        x: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.8,
        size: 6 + Math.random() * 6,
        drift: (Math.random() - 0.5) * 200,
        dur: 1.5 + Math.random() * 2,
      });
    }
    setParticles(ps);

    // Clean up after duration
    const timer = setTimeout(() => setParticles([]), duration);
    return () => clearTimeout(timer);
  }, [active, duration]);

  if (particles.length === 0) return null;

  return (
    <div className="confetti-container" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.x}%`,
            backgroundColor: p.color,
            width: p.size,
            height: p.size * 0.6,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            // @ts-ignore -- CSS custom property
            "--drift": `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
