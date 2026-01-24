import type { Vector3 } from 'three'

/**
 * Mode for floating text behavior.
 * - 'stationary': Text stays in place
 * - 'floating': Text floats upward
 */
export type FloatingTextMode = 'stationary' | 'floating'

/**
 * Configuration options for spawning floating text.
 */
export interface FloatingTextOptions {
  /** The text to display. Supports newlines (\n) for multi-line. */
  text: string

  /** World position to spawn the text at. */
  position: Vector3

  /** Behavior mode: stationary or floating upward. */
  mode: FloatingTextMode

  /** Duration in seconds before the text disappears. */
  duration: number

  /** Speed in world units per second for floating mode. Default: 0.5 */
  floatSpeed?: number

  /** Duration in seconds for the fade-out effect. Default: 0.5 */
  fadeTime?: number

  /** Scale multiplier for text size. Default: 1 */
  scale?: number
}
