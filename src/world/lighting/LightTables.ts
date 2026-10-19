import { BlockRegistry } from '../blocks/BlockRegistry.ts'

/**
 * Light semantics (Minecraft-style, 4-bit levels 0-15):
 *
 * - Skylight: a cell whose column is sky-clear all the way to the world top
 *   ("direct" sky) holds its sub-chunk's biome cap (15 for most surface
 *   biomes) - full skylight travels straight down through fully transparent
 *   cells undiminished. Every other step costs max(1, opacity) of the cell
 *   being entered, and a cell never exceeds its sub-chunk's cap.
 * - Blocklight: emitters hold their lightLevel; every step costs
 *   max(1, opacity) of the cell being entered.
 * - Opaque cells (opacity 15) block both channels and hold 0 skylight;
 *   opaque emitters (magma, mushroom caps, ...) hold their own emission.
 *
 * Opacity is one of three classes, derived from block properties so new
 * blocks get sensible light behaviour without a table edit:
 * - OPAQUE  (15): isOpaque blocks
 * - DIFFUSE  (1): leaves and liquids - they stop direct sky (so skylight
 *                 fades by one level per leaf/water cell going down) but
 *                 cost the same as air sideways; also blocksVerticalLight
 *                 shapes (below)
 * - CLEAR    (0): air, glass, plants, torches, doors, trapdoors, fences, ...
 *
 * Closed faces (verticalStop[id] = 1, IBlockProperties.blocksVerticalLight):
 * slabs and stairs have one full horizontal face - the bottom one, or the
 * top one when placed upside down (metadata flip bit, see closedLightFaces).
 * Light never crosses that face, in either direction; through the other
 * faces the cell takes and passes light like DIFFUSE (it stops direct sky).
 * So a slab or stair roof keeps both direct and scattered skylight out of
 * the room below (Minecraft stops skylight at their full faces), while the
 * cell itself stays lit - a slab sunk into a path is lit from above, and the
 * wall faces next to it sample a lit cell.
 */
export const MAX_LIGHT = 15
export const OPACITY_CLEAR = 0
export const OPACITY_DIFFUSE = 1
export const OPACITY_OPAQUE = 15

/** Block ids are Uint16, so the tables cover the full id space. */
const TABLE_SIZE = 1 << 16

export interface LightTables {
  /** Per block id: OPACITY_CLEAR, OPACITY_DIFFUSE or OPACITY_OPAQUE. */
  readonly opacity: Uint8Array
  /** Per block id: emitted blocklight level (0-15). */
  readonly emission: Uint8Array
  /** Per block id: 1 = the block has a closed horizontal face (slabs, stairs) - see closedLightFaces. */
  readonly verticalStop: Uint8Array
}

/** closedLightFaces bits. */
export const LIGHT_FACE_BOTTOM = 1
export const LIGHT_FACE_TOP = 2

/**
 * The horizontal faces light can't cross for a cell holding block `id` with
 * `metadata` (LIGHT_FACE_* bits): for verticalStop blocks the bottom face, or
 * the top face when placed upside down (BlockFacing.getMetadataFlipped: bit 4).
 */
export function closedLightFaces(tables: LightTables, id: number, metadata: number): number {
  if (tables.verticalStop[id] === 0) return 0
  return (metadata & 0b10000) !== 0 ? LIGHT_FACE_TOP : LIGHT_FACE_BOTTOM
}

let tables: LightTables | null = null

/**
 * Get the light tables, building them from the BlockRegistry on first use.
 * Works identically on the main thread and in workers (both register the
 * default blocks before generating or lighting anything). Unregistered ids
 * are treated as opaque so unknown data can never leak light.
 */
export function getLightTables(): LightTables {
  if (tables) return tables

  const opacity = new Uint8Array(TABLE_SIZE).fill(OPACITY_OPAQUE)
  const emission = new Uint8Array(TABLE_SIZE)
  const verticalStop = new Uint8Array(TABLE_SIZE)
  const registry = BlockRegistry.getInstance()
  for (const id of registry.getAllBlockIds()) {
    const props = registry.getBlock(id).properties
    if (props.isOpaque) {
      opacity[id] = OPACITY_OPAQUE
    } else if (props.isLiquid || props.submergedIn || props.lightBlocking > 0 || props.blocksVerticalLight) {
      opacity[id] = OPACITY_DIFFUSE
    } else {
      opacity[id] = OPACITY_CLEAR
    }
    if (!props.isOpaque && props.blocksVerticalLight) verticalStop[id] = 1
    emission[id] = Math.max(0, Math.min(MAX_LIGHT, props.lightLevel | 0))
  }

  tables = { opacity, emission, verticalStop }
  return tables
}
