/**
 * Debug display modes that can be cycled through.
 */
export enum DebugMode {
  OFF = 0,
  FPS_ONLY = 1,
  FPS_AND_WIREFRAMES = 2,
}

/**
 * localStorage key for persisting debug mode.
 */
export const DEBUG_MODE_STORAGE_KEY = 'slopmine:debugMode'

/**
 * Get the next debug mode in the cycle.
 */
export function getNextDebugMode(current: DebugMode): DebugMode {
  return ((current + 1) % 3) as DebugMode
}
