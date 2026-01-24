import type { Scene } from 'three'

import type { FloatingTextOptions } from './interfaces/IFloatingText.ts'
import { FloatingText } from './FloatingText.ts'

/**
 * Singleton manager for floating text labels in the 3D world.
 * Must be initialized with a scene before use.
 *
 * @example
 * ```typescript
 * // Initialize once at startup
 * FloatingTextManager.instance.initialize(renderer.scene)
 *
 * // Spawn floating text
 * FloatingTextManager.instance.spawn({
 *   text: 'Hello!',
 *   position: new Vector3(0, 2, 0),
 *   mode: 'floating',
 *   duration: 3,
 * })
 *
 * // Update each frame
 * FloatingTextManager.instance.update(deltaTime)
 * ```
 */
export class FloatingTextManager {
  private static _instance: FloatingTextManager | null = null

  private scene: Scene | null = null
  private readonly texts: FloatingText[] = []

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Gets the singleton instance.
   */
  static get instance(): FloatingTextManager {
    if (!FloatingTextManager._instance) {
      FloatingTextManager._instance = new FloatingTextManager()
    }
    return FloatingTextManager._instance
  }

  /**
   * Initializes the manager with a scene reference.
   * Must be called before spawning any text.
   * @param scene The Three.js scene to add text sprites to
   */
  initialize(scene: Scene): void {
    this.scene = scene
  }

  /**
   * Spawns a new floating text label.
   * @param options Configuration for the floating text
   * @returns The created FloatingText instance
   * @throws Error if manager has not been initialized
   */
  spawn(options: FloatingTextOptions): FloatingText {
    if (!this.scene) {
      throw new Error(
        'FloatingTextManager has not been initialized. Call initialize(scene) first.'
      )
    }

    const text = new FloatingText(options)
    this.texts.push(text)
    this.scene.add(text.getSprite())

    return text
  }

  /**
   * Updates all floating texts and removes expired ones.
   * Should be called each frame.
   * @param deltaTime Time elapsed in seconds
   */
  update(deltaTime: number): void {
    if (!this.scene) {
      return
    }

    // Update texts and collect expired ones
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const text = this.texts[i]
      const expired = text.update(deltaTime)

      if (expired) {
        // Remove from scene and dispose
        this.scene.remove(text.getSprite())
        text.dispose()
        this.texts.splice(i, 1)
      }
    }
  }

  /**
   * Removes all floating texts immediately.
   */
  clear(): void {
    if (!this.scene) {
      return
    }

    for (const text of this.texts) {
      this.scene.remove(text.getSprite())
      text.dispose()
    }
    this.texts.length = 0
  }

  /**
   * Gets the current number of active floating texts.
   */
  get count(): number {
    return this.texts.length
  }
}
