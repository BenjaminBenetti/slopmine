import { BlockIds } from '../../blocks/BlockIds.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../interfaces/IChunk.ts'
import type { CaveConfig, CaveLiningEntry } from './CaveConfig.ts'

/** Minimal block access shared by IChunkData and ISubChunkData. */
interface BlockAccess {
  getBlockId(x: number, y: number, z: number): number
  setBlockId(x: number, y: number, z: number, blockId: number): boolean
}

export type LiningHeightGetter = (worldX: number, worldZ: number) => number

/**
 * Deterministic [0,1) hash of world position + seed. Integer avalanche mix
 * (never Math.random) so chunk borders and regeneration are consistent.
 */
function coordHash01(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(z, 1610612741) ^
    Math.imul(seed, 1013904223)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * Whether a lining entry's optional world-Y band admits this Y. Entries
 * without bounds apply everywhere (the pre-band behavior).
 */
function entryAppliesAtY(entry: CaveLiningEntry, worldY: number): boolean {
  if (entry.minY !== undefined && worldY < entry.minY) return false
  if (entry.maxY !== undefined && worldY > entry.maxY) return false
  return true
}

/** Any lava block id (source, flow levels, falling). */
function isLava(blockId: number): boolean {
  return (
    (blockId >= BlockIds.LAVA && blockId <= BlockIds.LAVA_EIGHTH) ||
    blockId === BlockIds.LAVA_FALLING
  )
}

/**
 * Post-carve cave wall lining pass (see CaveLiningConfig in CaveConfig.ts).
 *
 * Sprinkles mineral blocks on cave walls: replaceable solid blocks
 * face-adjacent to carved cave air get a deterministic per-block chance to
 * convert (e.g. volcanic sulfur ore / obsidian), and blocks face-adjacent to
 * lava get a separate (higher) chance — obsidian rings around flood lava and
 * lava lake beds.
 *
 * Must run AFTER carving (which includes the flood fill) and AFTER features,
 * so lava lakes placed by LavaFeature exist and already-placed ore veins are
 * naturally skipped (only `replaceableBlocks` convert).
 *
 * Adjacency is evaluated strictly within this storage region: neighbors
 * beyond chunk or sub-chunk borders are treated as unknown (never air), so
 * borders under-line slightly rather than over-lining or crashing. Air
 * adjacency additionally requires the block to sit below the un-carved
 * terrain surface, so ordinary surface air doesn't trigger wall conversion
 * (column-fill terrain has no natural overhangs); lava adjacency has no such
 * gate so lake beds at the surface still ring with obsidian.
 */
export function applyCaveWallLining(
  blocks: BlockAccess,
  caves: CaveConfig,
  seed: number,
  chunkWorldX: number,
  chunkWorldZ: number,
  minWorldY: number,
  maxWorldY: number,
  getHeightAt: LiningHeightGetter
): void {
  const lining = caves.lining
  if (!lining) return

  const bandLo = Math.max(minWorldY, Math.floor(caves.minY))
  const bandHi = Math.min(maxWorldY, Math.floor(caves.maxY))
  if (bandLo > bandHi) return

  const { replaceableBlocks, wallBlocks, lavaContactBlock } = lining
  const hasWall = wallBlocks.length > 0
  if (!hasWall && !lavaContactBlock) return

  const maxStorageY = maxWorldY - minWorldY

  for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
    for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
      const worldX = chunkWorldX + localX
      const worldZ = chunkWorldZ + localZ
      const surfaceY = Math.floor(getHeightAt(worldX, worldZ))
      // No solid terrain above the surface block (features above it are rare
      // decorations, not cave walls) — cap the column scan there.
      const yHi = Math.min(bandHi, surfaceY)

      for (let worldY = bandLo; worldY <= yHi; worldY++) {
        const storageY = worldY - minWorldY
        const blockId = blocks.getBlockId(localX, storageY, localZ)
        if (!replaceableBlocks.includes(blockId)) continue

        // Face-adjacency scan, bounded to this storage region. NOTE: the
        // accessor returns AIR for out-of-range coordinates, so bounds are
        // checked explicitly — otherwise every chunk/sub-chunk seam would
        // read as air-adjacent and convert in solid bands.
        let touchesAir = false
        let touchesLava = false
        let n: number
        if (storageY > 0) {
          n = blocks.getBlockId(localX, storageY - 1, localZ)
          if (n === BlockIds.AIR) touchesAir = true
          else if (isLava(n)) touchesLava = true
        }
        if (storageY < maxStorageY) {
          n = blocks.getBlockId(localX, storageY + 1, localZ)
          if (n === BlockIds.AIR) touchesAir = true
          else if (isLava(n)) touchesLava = true
        }
        if (localX > 0) {
          n = blocks.getBlockId(localX - 1, storageY, localZ)
          if (n === BlockIds.AIR) touchesAir = true
          else if (isLava(n)) touchesLava = true
        }
        if (localX < CHUNK_SIZE_X - 1) {
          n = blocks.getBlockId(localX + 1, storageY, localZ)
          if (n === BlockIds.AIR) touchesAir = true
          else if (isLava(n)) touchesLava = true
        }
        if (localZ > 0) {
          n = blocks.getBlockId(localX, storageY, localZ - 1)
          if (n === BlockIds.AIR) touchesAir = true
          else if (isLava(n)) touchesLava = true
        }
        if (localZ < CHUNK_SIZE_Z - 1) {
          n = blocks.getBlockId(localX, storageY, localZ + 1)
          if (n === BlockIds.AIR) touchesAir = true
          else if (isLava(n)) touchesLava = true
        }

        // Lava contact: higher-chance conversion (obsidian forms where rock
        // meets lava). A failed roll can still fall through to wall lining.
        // Out-of-band entries skip the roll entirely (also falls through).
        if (touchesLava && lavaContactBlock && entryAppliesAtY(lavaContactBlock, worldY)) {
          if (coordHash01(worldX, worldY, worldZ, seed ^ 0x5eed51ab) < lavaContactBlock.chance) {
            blocks.setBlockId(localX, storageY, localZ, lavaContactBlock.blockId)
            continue
          }
        }

        // Cave-air wall lining: single roll over cumulative entry chances.
        // Gated below the un-carved surface so open-sky air never triggers.
        if (touchesAir && hasWall && worldY < surfaceY) {
          const roll = coordHash01(worldX, worldY, worldZ, seed)
          let cumulative = 0
          for (const entry of wallBlocks) {
            // Out-of-band entries still advance the cumulative walk (they
            // just place nothing) so a Y band on one entry never shifts the
            // deterministic placement of the entries after it.
            cumulative += entry.chance
            if (roll < cumulative) {
              if (entryAppliesAtY(entry, worldY)) {
                blocks.setBlockId(localX, storageY, localZ, entry.blockId)
              }
              break
            }
          }
        }
      }
    }
  }
}
