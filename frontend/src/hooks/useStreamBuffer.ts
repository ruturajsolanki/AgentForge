import { useCallback, useEffect, useRef } from "react";

export function useStreamBuffer<T>(onFlush: (batch: T[]) => void, ms = 40) {
  const queue = useRef<T[]>([]);
  const timer = useRef<number | null>(null);

  const push = useCallback((item: T) => {
    queue.current.push(item);
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      const batch = queue.current;
      queue.current = [];
      timer.current = null;
      onFlush(batch);
    }, ms);
  }, [onFlush, ms]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return push;
}
