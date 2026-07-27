import { useRef } from "react";
import { bump } from "./renderTracker";
import { PERF_HUD, PERF_RENDER_LOG, PERF_STORM, PERF_STARTUP_RENDER } from "./flags";

export function useRenderCount(label: string) {
  const c = useRef(0);
  c.current += 1;
  // bump hem HUD sayacını, hem render-storm dedektörünü, hem açılış render
  // özetini besler.
  if (PERF_HUD || PERF_STORM || PERF_STARTUP_RENDER) bump(label);
  if (PERF_RENDER_LOG) console.log(`[render] ${label}: ${c.current}`);
}
