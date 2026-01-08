/**
 * Texture IDs for greedy meshing face grouping.
 * Faces with different texture IDs cannot be merged together.
 *
 * Each unique texture gets a unique sequential ID.
 * IMPORTANT: When adding a new texture, add it here with a unique ID.
 * Faces with the same texture (e.g., dirt and grass bottom) should share the same ID.
 */
export enum TextureId {
  // Sequential IDs for each unique texture asset
  AIR = 0,         // Not rendered, but defined
  STONE = 1,       // stone.webp
  DIRT = 2,        // dirt.webp (also used by grass bottom)
  GRASS_TOP = 3,   // grass.webp
  GRASS_SIDE = 4,  // grass-dirt.webp
  OAK_LOG_SIDE = 5,  // oak-log.webp
  OAK_LOG_END = 6,   // oak-log-top.webp
  OAK_LEAVES = 7,
  IRON_BLOCK = 8,
  COPPER_BLOCK = 9,
  COAL_BLOCK = 10,
  GOLD_BLOCK = 11,
  DIAMOND_BLOCK = 12,
  TORCH = 13,        // Non-greedy, but defined
  FORGE = 14,
}

// Cache for the face texture map
let cachedFaceTextureMap: Map<number, number> | null = null

/**
 * Build face texture map from all registered blocks.
 * This queries each block's getTextureForFace() method.
 *
 * @param getBlock Function to get block by ID (from BlockRegistry)
 * @param allBlockIds Array of all registered block IDs
 */
export function buildFaceTextureMap(
  getBlock: (id: number) => { getTextureForFace: (face: number) => number },
  allBlockIds: number[]
): Map<number, number> {
  const map = new Map<number, number>()

  for (const blockId of allBlockIds) {
    const block = getBlock(blockId)
    for (let face = 0; face < 6; face++) {
      const textureId = block.getTextureForFace(face)
      map.set(blockId * 6 + face, textureId)
    }
  }

  cachedFaceTextureMap = map
  return map
}

/**
 * Get the cached face texture map, or build it if not yet created.
 * For use in workers where BlockRegistry isn't available.
 */
export function getCachedFaceTextureMap(): Map<number, number> | null {
  return cachedFaceTextureMap
}

/**
 * Set the face texture map directly (for use in workers).
 */
export function setFaceTextureMap(map: Map<number, number>): void {
  cachedFaceTextureMap = map
}

/**
 * Create face texture map from serialized array (for worker transfer).
 */
export function deserializeFaceTextureMap(entries: Array<[number, number]>): Map<number, number> {
  const map = new Map(entries)
  cachedFaceTextureMap = map
  return map
}

/**
 * Get texture ID for a block face.
 * @param blockId Block ID
 * @param faceIndex Face index (TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5)
 * @param faceTextureMap Pre-created face texture map
 * @returns Texture ID for greedy mesh grouping
 */
export function getFaceTextureId(
  blockId: number,
  faceIndex: number,
  faceTextureMap: Map<number, number>
): number {
  const key = blockId * 6 + faceIndex
  return faceTextureMap.get(key) ?? blockId
}

/**
 * Block IDs that should NOT use greedy meshing (custom geometry).
 */
export const NON_GREEDY_BLOCK_IDS = new Set<number>([
  11, // Torch - custom slim geometry
])

/**
 * Check if a block can be greedy-meshed.
 */
export function isGreedyMeshable(blockId: number): boolean {
  return !NON_GREEDY_BLOCK_IDS.has(blockId)
}
