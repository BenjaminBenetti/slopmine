import type { IBlock } from '../interfaces/IBlock.ts'

/**
 * One liquid block as the greedy mesh worker's face rules see it:
 * [blockId, family (1-based index, equal for every level of one liquid and its
 * falling variant), level (surface height in eighths; full and falling = 8),
 * drawAs (the liquid block whose faces this cell draws: itself for a liquid,
 * its liquid's source block for a submerged block such as glowkelp), clear
 * (1 = water-like: light ripples through it - caustics on the faces under it;
 * 0 = lava)].
 */
export type LiquidMeshEntry = [blockId: number, family: number, level: number, drawAs: number, clear: number]

/**
 * Build the mesh worker's liquid table from the registered blocks' own
 * properties (`isLiquid`, `liquidFamily`, `liquidLevel`, `submergedIn`), so a
 * new liquid needs no hand-kept id list. Sent to each mesh worker with its
 * first job. A submerged block counts as a full source of its liquid.
 */
export function buildLiquidMeshEntries(getBlock: (id: number) => IBlock, blockIds: readonly number[]): LiquidMeshEntry[] {
  const families = new Map<string, number>()
  const sources = new Map<string, number>()
  const familyIndex = (name: string): number => {
    let family = families.get(name)
    if (family === undefined) {
      family = families.size + 1
      families.set(name, family)
    }
    return family
  }
  const entries: LiquidMeshEntry[] = []
  for (const id of blockIds) {
    const props = getBlock(id).properties
    if (!props.isLiquid || !props.liquidFamily || !props.liquidLevel) continue
    entries.push([id, familyIndex(props.liquidFamily), props.liquidLevel, id, props.liquidFamily === 'lava' ? 0 : 1])
    if (props.liquidLevel === 8 && !props.isFallingLiquid) sources.set(props.liquidFamily, id)
  }
  for (const id of blockIds) {
    const family = getBlock(id).properties.submergedIn
    const source = family ? sources.get(family) : undefined
    if (family && source !== undefined) entries.push([id, familyIndex(family), 8, source, family === 'lava' ? 0 : 1])
  }
  return entries
}

/** A block that lights the liquid around it: [blockId, r, g, b] (`scatterGlow`, linear). */
export type LiquidGlowEntry = [blockId: number, r: number, g: number, b: number]

/** The mesh worker's scatter-glow table (blocks with `scatterGlow`), sent with its first job. */
export function buildLiquidGlowEntries(getBlock: (id: number) => IBlock, blockIds: readonly number[]): LiquidGlowEntry[] {
  const entries: LiquidGlowEntry[] = []
  for (const id of blockIds) {
    const glow = getBlock(id).properties.scatterGlow
    if (glow) entries.push([id, glow[0], glow[1], glow[2]])
  }
  return entries
}
