import { Feature, type FeatureContext } from '../Feature.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../../../interfaces/IChunk.ts'
import { BlockRegistry, getBlock } from '../../../blocks/BlockRegistry.ts'
import { CRYSTAL_CORE_OF } from '../../../blocks/types/crystal_core/crystalCore.ts'

export interface CrystalCoreFeatureSettings {
  /** Kill switch (tests / tuning). */
  enabled: boolean
}

let opaqueLookup: Uint8Array | null = null
let coreLookup: Uint16Array | null = null

function lookups(): { opaque: Uint8Array; core: Uint16Array } {
  if (!opaqueLookup || !coreLookup) {
    const ids = BlockRegistry.getInstance().getAllBlockIds()
    const size = Math.max(...ids) + 1
    opaqueLookup = new Uint8Array(size)
    for (const id of ids) if (getBlock(id).properties.isOpaque) opaqueLookup[id] = 1
    coreLookup = new Uint16Array(size)
    for (const [emitting, core] of CRYSTAL_CORE_OF) if (emitting < size) coreLookup[emitting] = core
  }
  return { opaque: opaqueLookup, core: coreLookup }
}

/**
 * Crystal core pass - runs LAST among the Crystal Abyss features: every
 * glowing crystal cell (spire, rose, prism) whose six neighbours are all
 * opaque becomes its non-emitting core twin (same texture, emissive glow and
 * drops; see crystalCore.ts). Spires, geode linings and stalactites then emit
 * light only from their exposed shell, cutting light sources per column by a
 * large factor without changing the look.
 *
 * Deterministic per sub-chunk: only cells of this sub-chunk are read;
 * neighbours across its faces count as covered.
 */
export class CrystalCoreFeature extends Feature {
  readonly settings: CrystalCoreFeatureSettings

  constructor(settings: CrystalCoreFeatureSettings) {
    super()
    this.settings = settings
  }

  async scan(context: FeatureContext): Promise<void> {
    if (!this.settings.enabled) return
    const { opaque, core } = lookups()
    const blocks = context.chunk.getBlockData()
    const SX = CHUNK_SIZE_X
    const LAYER = CHUNK_SIZE_X * CHUNK_SIZE_Z
    const isOpaque = (id: number): boolean => id < opaque.length && opaque[id] === 1

    // Collect first, then convert: a converted cell stays opaque, so the
    // order never changes another cell's verdict. A neighbour across the
    // sub-chunk's faces counts as covered: inside a spire it nearly always is,
    // and a face exposed there merely loses its emission (it still glows).
    const toConvert: number[] = []
    const lastX = CHUNK_SIZE_X - 1
    const lastZ = CHUNK_SIZE_Z - 1
    const lastY = SUB_CHUNK_HEIGHT - 1
    for (let y = 0; y <= lastY; y++) {
      for (let z = 0; z <= lastZ; z++) {
        let i = y * LAYER + z * SX
        for (let x = 0; x <= lastX; x++, i++) {
          const id = blocks[i]
          if (id >= core.length || core[id] === 0) continue
          if (
            (x === lastX || isOpaque(blocks[i + 1])) && (x === 0 || isOpaque(blocks[i - 1])) &&
            (z === lastZ || isOpaque(blocks[i + SX])) && (z === 0 || isOpaque(blocks[i - SX])) &&
            (y === lastY || isOpaque(blocks[i + LAYER])) && (y === 0 || isOpaque(blocks[i - LAYER]))
          ) {
            toConvert.push(i)
          }
        }
      }
    }
    for (const i of toConvert) blocks[i] = core[blocks[i]]
  }
}
