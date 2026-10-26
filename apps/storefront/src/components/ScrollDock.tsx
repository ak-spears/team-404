'use client';

import { useEffect } from 'react';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Pair {
  source: HTMLElement;
  target: HTMLElement | null;
  label: HTMLElement | null;
  start: Box;
  end: Box;
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Smootherstep. Scroll position maps to docking progress on a curve rather than 1:1, so a
 * small scroll near either end barely moves anything -- a linear mapping made the buttons lurch
 * on the lightest flick, since they travel most of the viewport over one hero's worth of scroll.
 * The scroll budget is fixed (docking has to finish by the bottom of the hero, and `distance` is
 * already capped at the page's own max scroll), so a slower feel means holding the motion back
 * early and late rather than stretching it out. Both endpoints and the scroll offset where
 * docking completes are unchanged. */
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const box = (r: DOMRect, scrollY = 0): Box => ({
  x: r.left,
  y: r.top + scrollY,
  w: r.width,
  h: r.height,
});

/** Scroll-links every `[data-dock="key"]` on the page into the header's `[data-dock-target="key"]`
 * (translate + scale, all sharing one progress). An optional `[data-dock-label]` child is
 * counter-scaled so its text never stretches. Sources with no matching target just fade out.
 * Docking completes exactly when the bottom of the `[data-dock-until]` element (the home hero
 * or customer welcome band) meets the bottom of the header, so it closes into it with no gap.
 * Publishes progress as `--dock` (0..1) on <html> and sets `data-docked` once everything has
 * landed, for CSS to swap in the real header elements. */
export function ScrollDock() {
  useEffect(() => {
    const root = document.documentElement;
    // The header is fixed (or sticky from the top) wherever this runs, so target boxes are
    // scroll-independent.
    const pairs: Pair[] = Array.from(document.querySelectorAll<HTMLElement>('[data-dock]')).map(
      (source) => ({
        source,
        target: document.querySelector<HTMLElement>(
          `.site-header [data-dock-target="${source.dataset.dock}"]`,
        ),
        label: source.querySelector<HTMLElement>('[data-dock-label]'),
        start: { x: 0, y: 0, w: 1, h: 1 },
        end: { x: 0, y: 0, w: 1, h: 1 },
      }),
    );
    const header = document.querySelector<HTMLElement>('.site-header');
    const until = document.querySelector<HTMLElement>('[data-dock-until]');
    if (!pairs.length || !header || !until) return;

    let distance = 1;
    let frame = 0;
    let alive = true;

    const render = () => {
      frame = 0;
      const { scrollY } = window;
      const progress = ease(clamp01(scrollY / distance));

      for (const { source, target, label, start, end } of pairs) {
        if (!target) {
          source.style.opacity = String(clamp01(1 - progress * 2.5));
          continue;
        }
        const x = lerp(start.x, end.x, progress) - start.x;
        const y = lerp(start.y, end.y, progress) - (start.y - scrollY);
        const sx = lerp(1, end.w / start.w, progress);
        const sy = lerp(1, end.h / start.h, progress);
        source.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${sx}, ${sy})`;
        if (label) label.style.transform = `scale(${sy / sx}, 1)`;
      }

      root.style.setProperty('--dock', progress.toFixed(3));
      root.toggleAttribute('data-docked', progress >= 1);
    };

    const measure = () => {
      if (!alive) return;
      for (const pair of pairs) {
        pair.source.style.transform = 'none';
        if (pair.label) pair.label.style.transform = 'none';
      }
      for (const pair of pairs) {
        pair.start = box(pair.source.getBoundingClientRect(), window.scrollY);
        if (pair.target) pair.end = box(pair.target.getBoundingClientRect());
      }
      // Published so CSS can size the section after the hero to exactly fill the viewport below
      // the header -- the page then ends right where docking completes.
      root.style.setProperty('--header-h', `${header.offsetHeight}px`);
      // Capped at the max scroll so a short page can never strand elements mid-flight.
      const untilBottom = until.getBoundingClientRect().bottom + window.scrollY;
      const maxScroll = root.scrollHeight - window.innerHeight;
      distance = Math.max(
        1,
        Math.min(untilBottom - header.getBoundingClientRect().bottom, maxScroll),
      );
      render();
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };

    measure();
    document.fonts.ready.then(measure);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      for (const { source, label } of pairs) {
        source.style.transform = '';
        source.style.opacity = '';
        if (label) label.style.transform = '';
      }
      root.style.removeProperty('--dock');
      root.style.removeProperty('--header-h');
      root.removeAttribute('data-docked');
    };
  }, []);

  return null;
}
