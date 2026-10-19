import type { IBlock } from '../../interfaces/IBlock.ts'

/**
 * How a foliage sprite stands in its cell: `cross` - two crossed vertical
 * planes on the floor (grass, flowers, bushes); `flat` - one horizontal
 * quad lying on the floor (pebbles, fallen leaves, lily pads on the water).
 */
export type FoliageShape = 'cross' | 'flat'

/**
 * A plant or ground doodad drawn by the batched foliage renderer
 * (renderer/foliage/FoliageRenderer.ts): every foliage block in a sub-chunk
 * shares ONE draw call, so the overworld can be carpeted with grass and
 * dozens of plant kinds without a draw call per kind. Each instance gets a
 * position-hashed sprite variant, yaw, small offset and scale, and sways in
 * the wind. Worker-safe: plain data (sprite URLs, numbers).
 */
export interface FoliageSpec {
  /**
   * Sprite images (64×64, alpha-tested at 0.5). Cross sprites stand on the
   * image's bottom edge and fill its lower `height` (the rest is unused);
   * flat sprites fill the square. Instances pick one by position.
   */
  readonly sprites: readonly string[]
  /** Glow maps, one per sprite (black = no glow), or omitted. */
  readonly glowSprites?: readonly string[]
  /** Glow strength (emissive multiplier, default 1). */
  readonly glowStrength?: number
  /** The glow only shows in the dark (bioluminescence), like makeGlowDarkOnly. */
  readonly darkOnlyGlow?: boolean
  readonly shape: FoliageShape
  /** Cross: plane width, 1 = corner to corner of the cell. Flat: side of the square (blocks). */
  readonly width: number
  /** Cross: plane height (blocks), also the share of the sprite drawn. Ignored for flat. */
  readonly height: number
  /**
   * Share of the sprite's height mapped onto the plane (default `height`):
   * 1 for older full-square sprites stretched onto a shorter plane.
   */
  readonly spriteHeight?: number
  /** Wind sway at the tips: 0 stiff (cactus) .. 1 grass. */
  readonly sway: number
  /** Largest horizontal offset from the cell centre (blocks). */
  readonly jitter: number
  /** Size varies by ± this share per instance. */
  readonly scaleVariation: number
  /** Faded out by this distance from the camera (blocks); short grass goes first. */
  readonly viewDistance: number
  /** Height of the base above the cell floor (blocks), e.g. a lily pad on the water. */
  readonly baseHeight?: number
}

/** A block drawn by the foliage renderer instead of its own instanced mesh. */
export interface IFoliageBlock extends IBlock {
  readonly foliage: FoliageSpec
}

export function isFoliageBlock(block: IBlock): block is IFoliageBlock {
  return (block as Partial<IFoliageBlock>).foliage !== undefined
}
