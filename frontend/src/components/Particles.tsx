import { useEffect, useRef } from 'react';

export default function Particles() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const count = 40;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${12 + Math.random() * 18}s`;
      p.style.animationDelay = `${Math.random() * 20}s`;
      p.style.width = p.style.height = `${1 + Math.random() * 2}px`;
      p.style.opacity = `${0.1 + Math.random() * 0.3}`;
      container.appendChild(p);
    }
    return () => { container.innerHTML = ''; };
  }, []);

  return <div ref={containerRef} className="particles-container" />;
}
