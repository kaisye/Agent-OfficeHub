import { useCallback, useRef } from "react";

/**
 * A callback with a stable identity that always calls the latest function.
 * `@officehub/ui` Dialog re-runs its focus effect whenever `onClose` changes, which would steal
 * focus on every keystroke, so dialogs here always get a stable `onClose`.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}
