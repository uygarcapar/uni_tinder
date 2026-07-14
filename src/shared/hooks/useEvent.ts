import { useCallback, useLayoutEffect, useRef } from "react";

// React RFC useEvent pattern: caller function always reads the latest closure
// but the returned wrapper keeps a stable identity across renders. Use for
// callbacks handed to memoized children so state changes in the parent don't
// bust the child's React.memo prop equality.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEvent<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((...args: any[]) => ref.current(...args)) as T,
    [],
  );
}
