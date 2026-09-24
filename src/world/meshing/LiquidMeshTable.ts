import type { IBlock } from '../interfaces/IBlock.ts'

/**
 * One liquid block as the greedy mesh worker's face rules see it:
 * [blockId, family (1-based index, equal for every level of one liquid and its
 * falling variant), level (surface height in eighths; full and falling = 8)].
 */
export type LiquidMeshEntry = [blockId: number, family: number, level: number]

/**
 * Build the mesh worker's liquid table from the registered blocks' own
 * properties (`isLiquid`, `liquidFamily`, `liquidLevel`), so a new liquid
 * needs no hand-kept id list. Sent to each mesh worker with its first job.
 */
export function buildLiquidMeshEntries(getBlock: (id: number) => IBlock, blockIds: readonly number[]): LiquidMeshEntry[] {
  const families = new Map<string, number>()
  const entries: LiquidMeshEntry[] = []
  for (const id of blockIds) {
    const props = getBlock(id).properties
    if (!props.isLiquid || !props.liquidFamily || !props.liquidLevel) continue
    let family = families.get(props.liquidFamily)
    if (family === undefined) {
      family = families.size + 1
      families.set(props.liquidFamily, family)
    }
    entries.push([id, family, props.liquidLevel])
  }
  return entries
}
