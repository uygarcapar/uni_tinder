import { useRef } from "react";

export function useRenderCount(label: string) {
  const c = useRef(0);
  c.current += 1;
  if (__DEV__) {
    console.log(`[render] ${label}: ${c.current}`);
  }
}
