'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface GsapRevealProps {
  children: ReactNode;
  className?: string;
  /** Animation direction/offset */
  y?: number;
  x?: number;
  scale?: number;
  duration?: number;
  delay?: number;
  /** Stagger direct children instead of animating the wrapper as one block */
  stagger?: number;
  /** Trigger when scrolled into view instead of immediately on mount */
  scrollTrigger?: boolean;
}

export default function GsapReveal({
  children,
  className = '',
  y = 24,
  x = 0,
  scale = 1,
  duration = 0.7,
  delay = 0,
  stagger,
  scrollTrigger = false,
}: GsapRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const target = stagger
        ? containerRef.current?.children
        : containerRef.current;

      if (!target) return;

      gsap.from(target, {
        opacity: 0,
        y,
        x,
        scale,
        duration,
        delay,
        stagger: stagger ?? 0,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
        ...(scrollTrigger && {
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top 85%',
            once: true,
          },
        }),
      });
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}