import { ItemTags } from './ItemTags.ts'

/** Wild plants, flowers, ferns, leaves and mushroom caps: compost for bone meal. */
const COMPOSTABLE = new Set([
  // Wild plants (wildPlantBlocks.ts)
  'clover', 'daisy', 'dandelion', 'lavender', 'foxglove', 'wild_bush', 'heather', 'bracken', 'toadstool',
  'brown_mushrooms', 'barrel_cactus', 'desert_marigold', 'fireweed', 'ember_lily', 'horsetail', 'bog_cotton',
  'orchid', 'heliconia', 'elephant_ear', 'sea_thrift', 'salal', 'lily_pad', 'water_lily',
  // Cave plants
  'cave_fern', 'glow_bloom', 'cave_mushrooms', 'puffballs',
  // Older plants with their own block items
  'red_flower', 'yellow_flower', 'blue_flower', 'jungle_fern', 'coastal_fern', 'cattail', 'vine', 'cactus',
  'glimmercap', 'lumen_fern', 'glowkelp', 'lanternweed', 'kelp', 'seagrass', 'oak_leaves', 'redwood_leaves',
  // Giant mushroom caps
  'mushroom_cap', 'blue_mushroom_cap', 'purple_mushroom_cap', 'foxfire_mushroom_cap', 'amber_mushroom_cap', 'pale_mushroom_cap',
])

/** Edible leaves and flowers. */
const SALAD_GREENS = new Set(['clover', 'dandelion', 'daisy', 'lavender', 'fireweed', 'salal', 'sea_thrift'])

const DRIPSTONE_FORMATIONS = new Set(['stalactite', 'stalagmite', 'dripstone_column'])

/**
 * Recipe tags of a block item, by the block it places (BlockItem.tags): one
 * table instead of a `tags` override in every plant's item class, so any
 * plant block item - PlantBlockItem or its own class - composts.
 */
export function blockItemTags(blockName: string): ReadonlyArray<string> {
  const tags: string[] = []
  if (COMPOSTABLE.has(blockName)) tags.push(ItemTags.COMPOSTABLE)
  if (SALAD_GREENS.has(blockName)) tags.push(ItemTags.SALAD_GREEN)
  if (DRIPSTONE_FORMATIONS.has(blockName)) tags.push(ItemTags.DRIPSTONE_FORMATION)
  return tags
}
