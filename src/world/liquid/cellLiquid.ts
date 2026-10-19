import type { IBlockProperties } from '../interfaces/IBlock.ts'

/**
 * The liquid family filling a cell holding this block: a liquid's own family,
 * the family a submerged block (glowkelp) stands in, or undefined. Use it
 * wherever the question is "is the player / camera / this spot in liquid"
 * rather than "does this block flow" (that stays `isLiquid`).
 */
export function getCellLiquidFamily(properties: IBlockProperties): string | undefined {
  return properties.isLiquid ? properties.liquidFamily : properties.submergedIn
}
