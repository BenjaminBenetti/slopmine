import { CanvasTexture, Sprite, SpriteMaterial, Vector3 } from 'three'

import type { FloatingTextOptions } from './interfaces/IFloatingText.ts'

/** Default values for floating text options */
const DEFAULT_FLOAT_SPEED = 0.5
const DEFAULT_FADE_TIME = 0.5
const DEFAULT_SCALE = 1

/** Canvas rendering constants */
const FONT_SIZE = 24
const FONT_FAMILY = 'sans-serif'
const PADDING = 8
const BORDER_RADIUS = 6
const BACKGROUND_OPACITY = 0.6
const WORLD_SCALE_FACTOR = 0.01 // Convert canvas pixels to world units

/**
 * A floating text label that displays in 3D world space.
 * Uses a sprite with canvas texture for billboarding effect.
 */
export class FloatingText {
  private readonly sprite: Sprite
  private readonly texture: CanvasTexture
  private readonly material: SpriteMaterial

  private readonly mode: 'stationary' | 'floating'
  private readonly duration: number
  private readonly floatSpeed: number
  private readonly fadeTime: number

  private elapsed: number = 0
  private disposed: boolean = false

  constructor(options: FloatingTextOptions) {
    this.mode = options.mode
    this.duration = options.duration
    this.floatSpeed = options.floatSpeed ?? DEFAULT_FLOAT_SPEED
    this.fadeTime = options.fadeTime ?? DEFAULT_FADE_TIME

    const scale = options.scale ?? DEFAULT_SCALE

    // Create canvas and render text
    const { canvas, width, height } = this.createTextCanvas(options.text)

    // Create texture from canvas
    this.texture = new CanvasTexture(canvas)
    this.texture.needsUpdate = true

    // Create sprite material
    this.material = new SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    })

    // Create sprite
    this.sprite = new Sprite(this.material)
    this.sprite.position.copy(options.position)

    // Scale sprite to world units
    const worldWidth = width * WORLD_SCALE_FACTOR * scale
    const worldHeight = height * WORLD_SCALE_FACTOR * scale
    this.sprite.scale.set(worldWidth, worldHeight, 1)
  }

  /**
   * Creates a canvas with the rendered text.
   * @param text The text to render, supports newlines
   * @returns The canvas and its dimensions
   */
  private createTextCanvas(text: string): {
    canvas: HTMLCanvasElement
    width: number
    height: number
  } {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    // Set font for measurement
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`

    // Split text into lines
    const lines = text.split('\n')

    // Measure text dimensions
    let maxWidth = 0
    for (const line of lines) {
      const metrics = ctx.measureText(line)
      maxWidth = Math.max(maxWidth, metrics.width)
    }

    const lineHeight = FONT_SIZE * 1.2
    const textHeight = lines.length * lineHeight

    // Calculate canvas size with padding
    const width = Math.ceil(maxWidth + PADDING * 2)
    const height = Math.ceil(textHeight + PADDING * 2)

    // Resize canvas (resets context state)
    canvas.width = width
    canvas.height = height

    // Restore font after resize
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'

    // Draw rounded rectangle background
    this.drawRoundedRect(ctx, 0, 0, width, height, BORDER_RADIUS)
    ctx.fillStyle = `rgba(0, 0, 0, ${BACKGROUND_OPACITY})`
    ctx.fill()

    // Draw text
    ctx.fillStyle = 'white'
    for (let i = 0; i < lines.length; i++) {
      const x = PADDING
      const y = PADDING + i * lineHeight
      ctx.fillText(lines[i], x, y)
    }

    return { canvas, width, height }
  }

  /**
   * Draws a rounded rectangle path.
   */
  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  /**
   * Updates the floating text state.
   * @param deltaTime Time elapsed in seconds
   * @returns true if the text has expired and should be removed
   */
  update(deltaTime: number): boolean {
    if (this.disposed) {
      return true
    }

    this.elapsed += deltaTime

    // Check if expired
    if (this.elapsed >= this.duration) {
      return true
    }

    // Handle floating mode - move upward
    if (this.mode === 'floating') {
      this.sprite.position.y += this.floatSpeed * deltaTime
    }

    // Handle fade-out
    const fadeStart = this.duration - this.fadeTime
    if (this.elapsed >= fadeStart) {
      const fadeProgress = (this.elapsed - fadeStart) / this.fadeTime
      this.material.opacity = 1 - fadeProgress
    }

    return false
  }

  /**
   * Gets the sprite for adding to the scene.
   */
  getSprite(): Sprite {
    return this.sprite
  }

  /**
   * Gets the current position of the text.
   */
  getPosition(): Vector3 {
    return this.sprite.position
  }

  /**
   * Disposes of all resources.
   */
  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.texture.dispose()
    this.material.dispose()
  }
}
