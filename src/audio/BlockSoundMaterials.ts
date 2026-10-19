/**
 * Which material a block sounds like. Resolved once per block id from its
 * name and tags, so new blocks get a sensible sound without registering
 * anything; add a keyword (or an explicit override) when one sounds wrong.
 */

import { BlockRegistry } from '../world/blocks/BlockRegistry.ts'
import { BlockTags } from '../world/blocks/tags/BlockTags.ts'
import type { BlockSoundMaterial } from './synth/blockSounds.ts'

/** Exact block names whose keywords would mislead. */
const OVERRIDES: Record<string, BlockSoundMaterial> = {
  ossified_rock: 'stone',
  prism_roof_tile: 'stone',
  frozen_magma: 'stone',
  rime_glyph: 'stone',
  ember_glyph: 'stone',
  cactus: 'soft',
  lanternweed: 'leaves', // not a lantern
  tnt: 'cloth',
  mycelial_carpet: 'cloth',
  crypt_cobweb: 'cloth',
  grave_candles: 'cloth',
  funerary_urn: 'stone',
  forge: 'stone',
  hellforge: 'metal',
  diamond_block: 'crystal',
  coal_block: 'stone',
  snowy_grass: 'snow',
  snowy_pine_needles: 'leaves',
  sea_star: 'bone',
  bed_head: 'cloth',
  bed_foot: 'cloth',
  emberwood_stem: 'wood',
  pinecone: 'wood',
}

/**
 * Checked in order; the first rule whose keyword appears in the name wins.
 * Mind substrings: 'fern' is in "infernal", 'comb' in "catacomb", 'ice' in
 * "lattice", 'rack' in "cracked" - anchor keywords with underscores.
 */
const KEYWORD_RULES: ReadonlyArray<[BlockSoundMaterial, readonly string[]]> = [
  ['stone', ['_ore', 'sandstone', 'mossy_stone']],
  ['glass', ['glass', 'window', 'mirror']],
  ['crystal', ['crystal', 'prism', 'geode', 'lens', 'spire']],
  ['ice', ['_ice', 'ice_', 'icicle', 'glacial', 'entombed']],
  ['snow', ['snow']],
  ['sand', ['sand', 'ash']],
  ['gravel', ['gravel']],
  ['bone', ['bone', 'skull', 'shell', 'chitin']],
  ['metal', ['iron', 'gold', 'copper', 'anvil', 'grate', 'bars', 'chain', 'brazier', 'lantern', 'candelabra', 'spawner', 'hoard', 'reliquary', 'apparatus']],
  ['cloth', ['banner', 'carpet', 'wool']],
  ['soft', ['mushroom', '_cap', 'glowcap', 'glimmercap', 'fungus', 'spore_sac', 'membrane', 'slime', 'brood_comb', 'egg_pod', 'gill', 'glow_bulb', 'glowing_sap', 'morel']],
  ['leaves', ['leaves', 'needles', 'vine', '_fern', 'flower', 'sprout', 'cattail', 'wheat', 'hemp', 'herb', 'sapling', 'tendril', 'bush', 'strand', 'bloom', 'cobweb', 'kelp']],
  ['grass', ['grass', 'mycelium', 'podzol', 'moss']],
  ['soil', ['dirt', 'mud', 'clay']],
  ['wood', ['log', 'plank', 'wood', 'door', 'fence', 'table', 'chair', 'shelf', 'ladder', 'chest', 'bench', 'stump', 'stem', 'torch', 'root', 'stick', 'weapon_rack', 'campfire', 'bookshelf', 'tap']],
]

const cache = new Map<number, BlockSoundMaterial | null>()

/** The block's material, or null for air and liquids (they make no block sounds). */
export function getBlockSoundMaterial(blockId: number): BlockSoundMaterial | null {
  const cached = cache.get(blockId)
  if (cached !== undefined) return cached
  const material = resolve(blockId)
  cache.set(blockId, material)
  return material
}

function resolve(blockId: number): BlockSoundMaterial | null {
  if (blockId === 0) return null
  const block = BlockRegistry.getInstance().getBlock(blockId)
  const props = block.properties
  if (props.id === 0 || props.isLiquid) return null
  const name = props.name
  const override = OVERRIDES[name]
  if (override) return override
  for (const [material, keywords] of KEYWORD_RULES) {
    for (const keyword of keywords) if (name.includes(keyword)) return material
  }
  const tags = props.tags ?? []
  if (tags.includes(BlockTags.WOOD)) return 'wood'
  if (tags.includes(BlockTags.LEAVES)) return 'leaves'
  if (tags.includes(BlockTags.SOIL)) return 'soil'
  return 'stone'
}
