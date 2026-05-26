import { useEffect, useRef } from "react";
import { isEditableTarget } from "../lib/shortcuts";

export function useShortcut(keys: string, handler: () => void, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const parts = keys.toLowerCase().split(" ");
    let index = 0;
    let timer: number | null = null;

    const reset = () => {
      index = 0;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (keys === "mod+k" && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handlerRef.current();
        return;
      }
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key !== parts[index]) {
        reset();
        return;
      }
      event.preventDefault();
      index += 1;
      if (index >= parts.length) {
        reset();
        handlerRef.current();
        return;
      }
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(reset, 900);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      reset();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, keys]);
}
