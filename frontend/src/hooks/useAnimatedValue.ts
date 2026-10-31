import { useEffect, useState } from "react";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Eases from `from` to `to` over `durationMs` whenever `key` changes. Returns `to`
 * immediately when the user prefers reduced motion.
 */
export function useAnimatedValue(from: number, to: number, durationMs: number, key: unknown): number {
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(from + (to - from) * easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setValue(from);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Re-run only when the animation key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return value;
}
