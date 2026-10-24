import type { ISubChunkData } from '../../../interfaces/ISubChunkData.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../../interfaces/IChunk.ts'
import { BlockIds } from '../../../blocks/BlockIds.ts'
import { getBlock } from '../../../blocks/BlockRegistry.ts'
import { isFoliageBlock, type IFoliageBlock } from '../../../blocks/foliage/FoliageSpec.ts'
import type { IBlock } from '../../../interfaces/IBlock.ts'
import { intersectBoxes } from '../../dungeons/DungeonWriter.ts'
import type { Box } from '../../dungeons/DungeonTypes.ts'
import { PoiBuilder } from './PoiBuilder.ts'
import { POI_CELL, poiSiteForCell, type PoiSiteContext } from './PoiSites.ts'
import { POI_BUILD_DEFS } from './kinds/index.ts'

export interface CavePoiContext extends PoiSiteContext {
  readonly chunkWorldX: number
  readonly chunkWorldZ: number
  readonly minWorldY: number
}

/**
 * Underground points of interest, worker side (after the cave dressing and
 * rock blobs, before light): draws the slice of its cell's point of interest
 * (if any) that falls in this sub-chunk, then takes down any cave plant the
 * structure left hanging in the air.
 */
export function placeCavePois(chunk: ISubChunkData, ctx: CavePoiContext): void {
  const cellX = Math.floor(ctx.chunkWorldX / POI_CELL)
  const cellZ = Math.floor(ctx.chunkWorldZ / POI_CELL)
  const site = poiSiteForCell(cellX, cellZ, ctx, POI_BUILD_DEFS)
  if (!site) return
  const chunkBox: Box = {
    x0: ctx.chunkWorldX, y0: ctx.minWorldY, z0: ctx.chunkWorldZ,
    x1: ctx.chunkWorldX + CHUNK_SIZE_X - 1, y1: ctx.minWorldY + SUB_CHUNK_HEIGHT - 1, z1: ctx.chunkWorldZ + CHUNK_SIZE_Z - 1,
  }
  const clip = intersectBoxes(site.box, chunkBox)
  if (!clip) return
  const sink = { chunk, originX: ctx.chunkWorldX, originY: ctx.minWorldY, originZ: ctx.chunkWorldZ }
  site.def.build(new PoiBuilder(site, sink, clip))
  dropFloatingPlants(chunk, ctx, clip)
}

/**
 * Remove foliage (cave plants, formations) whose support the structure took
 * away, by the plant's own rule (FoliageBlock.isSupportedBy: the block above a
 * hanging piece, below a standing one; cobwebs need none). Hanging chains are
 * walked top-down and standing stacks bottom-up so a removal frees the next
 * piece. Supports outside the sub-chunk are trusted.
 */
function dropFloatingPlants(chunk: ISubChunkData, ctx: CavePoiContext, box: Box): void {
  const ox = ctx.chunkWorldX
  const oy = ctx.minWorldY
  const oz = ctx.chunkWorldZ
  // Grow the box by one: a plant just outside it may have hung from a cell inside
  const x0 = Math.max(0, box.x0 - 1 - ox), x1 = Math.min(CHUNK_SIZE_X - 1, box.x1 + 1 - ox)
  const y0 = Math.max(0, box.y0 - 1 - oy), y1 = Math.min(SUB_CHUNK_HEIGHT - 1, box.y1 + 1 - oy)
  const z0 = Math.max(0, box.z0 - 1 - oz), z1 = Math.min(CHUNK_SIZE_Z - 1, box.z1 + 1 - oz)
  const plantAt = (x: number, y: number, z: number): (IFoliageBlock & SupportRule) | null => {
    const id = chunk.getBlockId(x, y, z)
    if (id === BlockIds.AIR) return null
    const block = getBlock(id)
    return isFoliageBlock(block) && 'isSupportedBy' in block ? (block as IFoliageBlock & SupportRule) : null
  }
  const unsupported = (plant: SupportRule, supportId: number): boolean => !plant.isSupportedBy(getBlock(supportId))
  // Hanging: top-down
  for (let y = Math.min(y1, SUB_CHUNK_HEIGHT - 2); y >= y0; y--) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const plant = plantAt(x, y, z)
        if (plant && plant.foliage.shape === 'hang' && unsupported(plant, chunk.getBlockId(x, y + 1, z))) chunk.setBlockId(x, y, z, BlockIds.AIR)
      }
    }
  }
  // Standing: bottom-up
  for (let y = Math.max(y0, 1); y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const plant = plantAt(x, y, z)
        if (plant && plant.foliage.shape !== 'hang' && unsupported(plant, chunk.getBlockId(x, y - 1, z))) chunk.setBlockId(x, y, z, BlockIds.AIR)
      }
    }
  }
}

interface SupportRule {
  isSupportedBy(support: IBlock): boolean
}
