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
  FORGE_FRONT = 14,
  FORGE_SIDE = 55,
  FORGE_TOP = 56,
  WATER = 15,        // Non-greedy, transparent liquid
  WATER_THREE_QUARTER = 16,  // Non-greedy, partial liquid (3/4 height)
  WATER_HALF = 17,           // Non-greedy, partial liquid (1/2 height)
  WATER_QUARTER = 18,        // Non-greedy, partial liquid (1/4 height)
  WATER_EIGHTH = 19,         // Non-greedy, evaporating liquid (1/8 height)
  WATER_SEVEN_EIGHTH = 20,   // Non-greedy, partial liquid (7/8 height)
  WATER_FIVE_EIGHTH = 21,    // Non-greedy, partial liquid (5/8 height)
  WATER_THREE_EIGHTH = 22,   // Non-greedy, partial liquid (3/8 height)
  LAVA = 23,                 // Non-greedy, transparent liquid (full height)
  LAVA_SEVEN_EIGHTH = 24,    // Non-greedy, partial liquid (7/8 height)
  LAVA_THREE_QUARTER = 25,   // Non-greedy, partial liquid (3/4 height)
  LAVA_FIVE_EIGHTH = 26,     // Non-greedy, partial liquid (5/8 height)
  LAVA_HALF = 27,            // Non-greedy, partial liquid (1/2 height)
  LAVA_THREE_EIGHTH = 28,    // Non-greedy, partial liquid (3/8 height)
  LAVA_QUARTER = 29,         // Non-greedy, partial liquid (1/4 height)
  LAVA_EIGHTH = 30,          // Non-greedy, evaporating liquid (1/8 height)
  SAND = 31,                 // sand.webp
  SANDSTONE = 32,            // sandstone.webp
  CACTUS = 33,               // cactus.webp
  VINE = 34,                 // vine.webp
  BASALT = 35,               // basalt.webp
  MAGMA = 36,                // magma.webp
  MUD = 37,                  // mud.webp
  CLAY = 38,                 // clay.webp
  MUSHROOM = 39,             // mushroom.webp
  MUSHROOM_CAP = 40,         // mushroom-cap.webp
  SWAMP_WATER = 41,          // swamp-water.webp
  SWAMP_WATER_SEVEN_EIGHTH = 42,
  SWAMP_WATER_THREE_QUARTER = 43,
  SWAMP_WATER_FIVE_EIGHTH = 44,
  SWAMP_WATER_HALF = 45,
  SWAMP_WATER_THREE_EIGHTH = 46,
  SWAMP_WATER_QUARTER = 47,
  SWAMP_WATER_EIGHTH = 48,
  MUDDY_GRASS_TOP = 49,
  MUDDY_GRASS_SIDE = 50,
  BLUE_MUSHROOM = 51,
  BLUE_MUSHROOM_CAP = 52,
  PURPLE_MUSHROOM = 53,
  PURPLE_MUSHROOM_CAP = 54,
  WHEAT_1 = 57,              // wheat-1.webp (seedling)
  WHEAT_2 = 58,              // wheat-2.webp (growing)
  WHEAT_3 = 59,              // wheat-3.webp (mature)
  HELL_ROCK = 60,            // hell-rock.webp
  HELL_MAGMA = 61,           // hell-magma.webp
  CORRUPTED_HELL_ROCK = 62,  // corrupted-hell-rock.webp
  GLASS = 63,                // glass.webp
  HERB_1 = 64,               // herb-1.webp (seedling)
  HERB_2 = 65,               // herb-2.webp (growing)
  HERB_3 = 66,               // herb-3.webp (mature)
  APOTHECARY_FRONT = 67,     // apothecary-front.webp
  APOTHECARY_SIDE = 68,      // apothecary-side.webp
  APOTHECARY_TOP = 69,       // apothecary-top.webp
  YELLOW_FLOWER = 70,        // yellow-flower.webp
  BLUE_FLOWER = 71,          // blue-flower.webp
  RED_FLOWER = 72,           // red-flower.webp
  JUNGLE_FERN = 73,          // jungle-fern.webp
  LADDER = 74,               // ladder.webp
  HEMP_1 = 75,               // hemp-1.webp (seedling)
  HEMP_2 = 76,               // hemp-2.webp (growing)
  HEMP_3 = 77,               // hemp-3.webp (mature)
  BED_HEAD_TOP = 78,         // bed-head-top.webp (pillow/blanket from above)
  BED_HEAD_FRONT = 79,       // bed-head-front.webp (headboard with pillow)
  BED_SIDE = 80,             // bed-side.webp (wood frame with blue blanket)
  BED_FOOT_TOP = 81,         // bed-foot-top.webp (blanket from above)
  BED_FOOT_END = 82,         // bed-foot-end.webp (foot of bed)
  BED_BOTTOM = 83,           // bed-bottom.webp (wood underside)
  ROPE_LADDER = 84,          // rope_ladder.webp
  WOODWORKING_BENCH_FRONT = 85,  // woodworking-bench-front.webp
  WOODWORKING_BENCH_SIDE = 86,   // woodworking-bench-side.webp
  WOODWORKING_BENCH_TOP = 87,    // woodworking-bench-top.webp
  DIVINING_STICK = 88,           // divining-stick.webp
  CHEST_FRONT = 89,              // chest-front.webp
  CHEST_SIDE = 90,               // chest-side.webp
  CHEST_TOP = 91,                // chest-top.webp
  PINE_LOG_SIDE = 92,            // pine-log.webp
  PINE_LOG_END = 93,             // pine-log-top.webp
  PINE_NEEDLES = 94,             // pine-needles.webp
  PODZOL = 95,                   // podzol.webp
  REDWOOD_LOG_SIDE = 96,         // redwood-log.webp
  REDWOOD_LOG_END = 97,          // redwood-log-top.webp
  REDWOOD_LEAVES = 98,           // redwood-leaves.webp
  MOSS = 99,                     // moss.webp
  MOSSY_STONE = 100,             // mossy-stone.webp
  COASTAL_FERN = 101,            // coastal-fern.webp (bottom half)
  COASTAL_FERN_TOP = 102,        // coastal-fern-top.webp (top half)
  SEA_SHELL = 103,               // sea-shell.webp (decor block face map entry)
  CRAB_SHELL = 104,              // crab-shell.webp (decor block face map entry)
  RESIN_TORCH = 105,             // custom geometry, colored materials (like TORCH)
  SEA_STAR = 106,                // sea-star.webp (decor block face map entry)
  OAK_PLANKS = 107,              // oak-planks.webp (shared by oak slab/stairs/fence/gate/table/chair/shelf)
  PINE_PLANKS = 108,             // pine-planks.webp (shared by pine carpentry blocks)
  REDWOOD_PLANKS = 109,          // redwood-planks.webp (shared by redwood carpentry blocks)
  OAK_DOOR_LOWER = 110,          // oak-door-lower.webp
  OAK_DOOR_UPPER = 111,          // oak-door-upper.webp
  PINE_DOOR_LOWER = 112,         // pine-door-lower.webp
  PINE_DOOR_UPPER = 113,         // pine-door-upper.webp
  REDWOOD_DOOR_LOWER = 114,      // redwood-door-lower.webp
  REDWOOD_DOOR_UPPER = 115,      // redwood-door-upper.webp
  OAK_TRAPDOOR = 116,            // oak-trapdoor.webp
  PINE_TRAPDOOR = 117,           // pine-trapdoor.webp
  REDWOOD_TRAPDOOR = 118,        // redwood-trapdoor.webp
  OAK_WINDOW = 119,              // oak-window.webp (transparent)
  PINE_WINDOW = 120,             // pine-window.webp (transparent)
  REDWOOD_WINDOW = 121,          // redwood-window.webp (transparent)
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
 * Block IDs that should NOT use greedy meshing (custom geometry or rotation).
 */
export const NON_GREEDY_BLOCK_IDS = new Set<number>([
  11, // Torch - custom slim geometry
  12, // Forge - directional block with rotation
  32, // Vine - directional flat plane with rotation
  58, // Glass - needs blended transparency (not alphaTest)
  62, // Apothecary Workbench - directional block with rotation
  67, // Ladder - directional flat plane with rotation
  71, // Bed Head - half-height directional block
  72, // Bed Foot - half-height directional block
  73, // Woodworking Bench - directional block with rotation
  74, // Rope Ladder - directional flat plane with rotation
  75, // Divining Stick - custom Y-shaped geometry
  76, // Chest - directional block with rotation
  // Water (13-16) is now greedy-meshed to eliminate internal face z-fighting
  // Carpentry (oak 94-108, pine 110-124, redwood 126-140): everything except
  // planks is custom geometry/rotation; windows need blended transparency like glass
  94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
  110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124,
  126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140,
])

/**
 * Check if a block can be greedy-meshed.
 */
export function isGreedyMeshable(blockId: number): boolean {
  return !NON_GREEDY_BLOCK_IDS.has(blockId)
}
