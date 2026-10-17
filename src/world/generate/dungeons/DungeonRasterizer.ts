import type { Box, DungeonKit, DungeonLayout } from './DungeonTypes.ts'
import { boxesIntersect, intersectBoxes, type SubChunkLike, type WorldSink } from './DungeonWriter.ts'
import { buildModuleContext, runPass } from './DungeonContexts.ts'

/**
 * Write the part of a dungeon that falls inside one sub-chunk.
 *
 * Order (deterministic write precedence, later wins): the kit's foundation
 * pass, every module in placement order, the kit's exterior pass. Each
 * builder draws its whole module; the writer keeps only the cells inside
 * this sub-chunk and the module's write box. Builders read nothing but pure
 * inputs (and, through `setIf`/`fillIf`, the very cell they write), so the
 * result is identical whatever order sub-chunks are generated in.
 *
 * @param chunk Sub-chunk storage (local coords 0-31)
 * @param originX/originY/originZ World position of the sub-chunk's (0, 0, 0)
 * @param size Sub-chunk edge length (32)
 * @returns true if anything of the dungeon intersects the sub-chunk
 */
export function rasterizeDungeon(
  layout: DungeonLayout,
  kit: DungeonKit,
  chunk: SubChunkLike,
  originX: number,
  originY: number,
  originZ: number,
  terrainHeight: (x: number, z: number) => number,
  size = 32
): boolean {
  const chunkBox: Box = {
    x0: originX,
    y0: originY,
    z0: originZ,
    x1: originX + size - 1,
    y1: originY + size - 1,
    z1: originZ + size - 1,
  }
  const clip = intersectBoxes(chunkBox, layout.bounds)
  if (!clip) return false
  const sink: WorldSink = { chunk, originX, originY, originZ }

  runPass(layout, kit, 'foundation', sink, clip, terrainHeight, null)
  for (const module of layout.modules) {
    if (!boxesIntersect(module.writeBox, clip)) continue
    module.def.build(buildModuleContext(layout, kit, module, sink, clip, terrainHeight, null))
  }
  runPass(layout, kit, 'exterior', sink, clip, terrainHeight, null)
  return true
}
