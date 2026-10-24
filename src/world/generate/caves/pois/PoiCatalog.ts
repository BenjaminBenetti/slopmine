import type { CaveBiomeId } from '../CaveBiomes.ts'

/**
 * The underground points of interest: the kinds of discovery hidden in the
 * overworld's caves (ruins, treasure, lairs, wonders). Plain data shared by
 * the generation worker (placement and builders, PoiSites.ts / kinds/) and
 * the main thread (discovery toasts, journal, loot) - keep it free of block
 * or renderer imports.
 *
 * `id` and `index` are persisted (journal milestones, the keystone's
 * metadata in saved chunks): never rename or renumber a kind, and never
 * reuse a retired index (22: the ruined portal, removed before release -
 * the game has no portals; an unknown keystone index is ignored).
 */
export type PoiKindId =
  | 'rune_circle'
  | 'rune_vault'
  | 'dragons_lair'
  | 'lost_hoard'
  | 'smugglers_cache'
  | 'miners_camp'
  | 'dwarven_forge'
  | 'forgotten_hall'
  | 'ancient_crypt'
  | 'giant_geode'
  | 'giant_fossil'
  | 'petrified_tree'
  | 'sunken_shrine'
  | 'fairy_ring'
  | 'lost_explorer'
  | 'forgotten_library'
  | 'alchemists_den'
  | 'spider_nest'
  | 'buried_longship'
  | 'stone_colossus'
  | 'wishing_well'
  | 'mother_lode'
  | 'hermits_hollow'
  | 'frozen_explorer'
  | 'hidden_garden'
  | 'sunken_cistern'
  | 'old_bridge'
  | 'forgotten_gaol'
  | 'buried_arena'
  | 'black_monolith'
  | 'forgotten_chapel'
  | 'star_chamber'
  | 'sandstone_tomb'
  | 'sunken_tower'
  | 'sculptors_studio'
  | 'bandit_hideout'
  | 'cave_in'
  | 'excavation_site'
  | 'deepway_tavern'
  | 'mushroom_village'
  | 'hot_springs'
  | 'fallen_star'
  | 'great_roots'
  | 'frozen_waterfall'
  | 'wyrm_burrow'

/** What a site looks like from above and around: drives the odds of each kind. */
export interface PoiEnvironment {
  /** Surface (layer 1) biome over the cell. */
  readonly surfaceBiome: string
  /** Special cave zone at the cell's centre (null in plain caves). */
  readonly caveBiome: CaveBiomeId | null
}

export interface PoiKindInfo {
  readonly id: PoiKindId
  /** Keystone metadata (1-255). */
  readonly index: number
  /** Shown in the discovery toast and the journal. */
  readonly name: string
  /** One line under the name in the discovery toast. */
  readonly flavor: string
  /** Relative odds of this kind for a site in this environment (0 = never). */
  weight(env: PoiEnvironment): number
}

/** Rarity tiers (relative odds). */
const COMMON = 10
const UNCOMMON = 6
const RARE = 3
const LEGENDARY = 2.2

const under = (env: PoiEnvironment, ...biomes: string[]): boolean => biomes.includes(env.surfaceBiome)

export const POI_KINDS: readonly PoiKindInfo[] = [
  {
    id: 'rune_circle', index: 1, name: 'Rune Circle',
    flavor: 'Standing stones that still hum with old magic.',
    weight: () => UNCOMMON,
  },
  {
    id: 'rune_vault', index: 2, name: 'Sealed Rune Vault',
    flavor: 'A vault sealed with runes, buried and forgotten.',
    weight: () => UNCOMMON,
  },
  {
    id: 'dragons_lair', index: 3, name: "Dragon's Lair",
    flavor: 'Scorched stone, old bones and a mountain of gold.',
    weight: (env) => LEGENDARY * (under(env, 'volcanic', 'grassy-hills') || env.caveBiome === 'magma_chamber' ? 2 : 1),
  },
  {
    id: 'lost_hoard', index: 4, name: 'Lost Hoard',
    flavor: 'Someone hid their gold down here, and never came back for it.',
    weight: (env) => UNCOMMON * (under(env, 'desert') ? 1.5 : 1),
  },
  {
    id: 'smugglers_cache', index: 5, name: "Smuggler's Cache",
    flavor: 'Barrels, crates and a ledger nobody was meant to find.',
    weight: (env) => UNCOMMON * (under(env, 'coastal-rainforest', 'swamp') ? 1.5 : 1),
  },
  {
    id: 'miners_camp', index: 6, name: "Miner's Camp",
    flavor: 'The fire is long cold. The miners never came back.',
    weight: (env) => COMMON * (under(env, 'grassy-hills', 'pine-forest') ? 1.4 : 1),
  },
  {
    id: 'dwarven_forge', index: 7, name: 'Dwarven Forge',
    flavor: 'An ancient smithy, its lava channel still glowing.',
    weight: (env) => UNCOMMON * (under(env, 'grassy-hills', 'volcanic') ? 1.4 : 1),
  },
  {
    id: 'forgotten_hall', index: 8, name: 'Forgotten Hall',
    flavor: 'Pillars and a throne, from a kingdom no one remembers.',
    weight: () => RARE,
  },
  {
    id: 'ancient_crypt', index: 9, name: 'Ancient Crypt',
    flavor: 'Candles still burn beside the sarcophagi. Who lit them?',
    weight: (env) => UNCOMMON * (under(env, 'desert') ? 1.5 : 1),
  },
  {
    id: 'giant_geode', index: 10, name: 'Giant Geode',
    flavor: 'A hollow stone egg, lined with glowing crystal.',
    weight: (env) => UNCOMMON * (env.caveBiome === 'crystal_geode' ? 0.4 : 1),
  },
  {
    id: 'giant_fossil', index: 11, name: 'Giant Fossil',
    flavor: 'The bones of something enormous, set in the rock.',
    weight: (env) => UNCOMMON * (under(env, 'desert') ? 1.6 : 1),
  },
  {
    id: 'petrified_tree', index: 12, name: 'Petrified Tree',
    flavor: 'A tree that grew where no light reaches, now turned to stone.',
    weight: (env) => RARE * (under(env, 'desert', 'volcanic') ? 0.5 : 1),
  },
  {
    id: 'sunken_shrine', index: 13, name: 'Sunken Shrine',
    flavor: 'An altar on an island, in a pool as still as glass.',
    weight: (env) => UNCOMMON * (under(env, 'swamp', 'coastal-rainforest', 'jungle') ? 1.5 : under(env, 'desert', 'volcanic') ? 0.3 : 1),
  },
  {
    id: 'fairy_ring', index: 14, name: 'Fairy Ring',
    flavor: 'A perfect circle of glowing mushrooms. Make a wish.',
    weight: (env) =>
      COMMON *
      (env.caveBiome === 'fungal_hollow' || env.caveBiome === 'mossy_grotto' ? 1.6 : 1) *
      (under(env, 'desert', 'volcanic') ? 0.3 : 1),
  },
  {
    id: 'lost_explorer', index: 15, name: 'Lost Explorer',
    flavor: 'An explorer who went one cave too far.',
    weight: () => COMMON,
  },
  {
    id: 'forgotten_library', index: 16, name: 'Forgotten Library',
    flavor: 'Shelves of crumbling books, written in a lost tongue.',
    weight: () => UNCOMMON,
  },
  {
    id: 'alchemists_den', index: 17, name: "Alchemist's Den",
    flavor: 'Bottles, herbs and a workbench stained every colour.',
    weight: (env) => UNCOMMON * (under(env, 'swamp', 'jungle') ? 1.4 : 1),
  },
  {
    id: 'spider_nest', index: 18, name: "Spider Queen's Nest",
    flavor: 'Thick webs, egg sacs, and things wrapped in silk.',
    weight: (env) => UNCOMMON * (env.caveBiome === 'webbed_hollow' ? 3 : 1),
  },
  {
    id: 'buried_longship', index: 19, name: 'Buried Longship',
    flavor: 'A ship, deep under the ground. How did it get here?',
    weight: (env) => RARE * (under(env, 'coastal-rainforest', 'swamp') ? 1.6 : 1),
  },
  {
    id: 'stone_colossus', index: 20, name: 'Stone Colossus',
    flavor: 'A giant face carved in the rock, its eyes still watching.',
    weight: () => RARE,
  },
  {
    id: 'wishing_well', index: 21, name: 'Wishing Well',
    flavor: 'Coins glint at the bottom of the water.',
    weight: () => UNCOMMON,
  },
  {
    id: 'mother_lode', index: 23, name: 'Mother Lode',
    flavor: 'The rock here glitters with ore.',
    weight: () => COMMON,
  },
  {
    id: 'hermits_hollow', index: 24, name: "Hermit's Hollow",
    flavor: 'Somebody lived down here, alone, for a very long time.',
    weight: () => UNCOMMON,
  },
  {
    id: 'frozen_explorer', index: 25, name: 'Frozen Explorer',
    flavor: 'Frozen in the ice, mid-stride, for a hundred years.',
    weight: (env) => (under(env, 'pine-forest') || env.caveBiome === 'frozen_cave' ? RARE * 3 : 0),
  },
  {
    id: 'hidden_garden', index: 26, name: 'Hidden Garden',
    flavor: 'Life finds a way, even in the dark.',
    weight: (env) => UNCOMMON * (under(env, 'jungle', 'swamp', 'coastal-rainforest') ? 1.5 : under(env, 'desert', 'volcanic') ? 0.4 : 1),
  },
  // --- Ruins ---
  {
    id: 'sunken_cistern', index: 27, name: 'Sunken Cistern',
    flavor: 'Stone columns marching into still, dark water.',
    weight: (env) => UNCOMMON * (under(env, 'desert', 'volcanic') ? 0.5 : 1),
  },
  {
    id: 'old_bridge', index: 28, name: 'Old Stone Bridge',
    flavor: 'A bridge over a bottomless chasm. Half of it is gone.',
    weight: () => UNCOMMON,
  },
  {
    id: 'forgotten_gaol', index: 29, name: 'Forgotten Gaol',
    flavor: 'Rusted cells, and the prisoners never left.',
    weight: () => UNCOMMON,
  },
  {
    id: 'buried_arena', index: 30, name: 'Buried Arena',
    flavor: 'Tiers of stone seats around a pit of sand. The crowd is long gone.',
    weight: (env) => RARE * (under(env, 'desert') ? 1.5 : 1),
  },
  {
    id: 'black_monolith', index: 31, name: 'Black Monolith',
    flavor: 'A slab of obsidian no hand could have cut. It hums.',
    weight: () => RARE,
  },
  // --- Sacred and learned places ---
  {
    id: 'forgotten_chapel', index: 32, name: 'Forgotten Chapel',
    flavor: 'Pews, an altar, and candles that never quite go out.',
    weight: () => UNCOMMON,
  },
  {
    id: 'star_chamber', index: 33, name: 'Star Chamber',
    flavor: 'An observatory under the earth, its ceiling set with stars.',
    weight: () => RARE,
  },
  {
    id: 'sandstone_tomb', index: 34, name: 'Sandstone Tomb',
    flavor: 'A king sealed beneath the dunes, with everything he owned.',
    weight: (env) => (under(env, 'desert') ? UNCOMMON * 2 : 0),
  },
  {
    id: 'sunken_tower', index: 35, name: "Buried Wizard's Tower",
    flavor: 'The top of a tower, swallowed whole by the earth.',
    weight: () => RARE,
  },
  {
    id: 'sculptors_studio', index: 36, name: "Sculptor's Studio",
    flavor: 'Half-finished statues, still waiting for the chisel.',
    weight: () => UNCOMMON,
  },
  // --- People and peril ---
  {
    id: 'bandit_hideout', index: 37, name: 'Bandit Hideout',
    flavor: 'Stolen goods, and a lookout over the only way in.',
    weight: () => UNCOMMON,
  },
  {
    id: 'cave_in', index: 38, name: 'Cave-In',
    flavor: 'The tunnel came down. Something is still under the rubble.',
    weight: (env) => COMMON * (under(env, 'grassy-hills', 'pine-forest') ? 1.3 : 1),
  },
  {
    id: 'excavation_site', index: 39, name: 'Excavation Site',
    flavor: 'Someone was digging for something down here. They found it.',
    weight: (env) => UNCOMMON * (under(env, 'desert') ? 1.5 : 1),
  },
  {
    id: 'deepway_tavern', index: 40, name: 'Deepway Tavern',
    flavor: 'A tavern on the deep roads. Last orders were a long time ago.',
    weight: () => RARE,
  },
  {
    id: 'mushroom_village', index: 41, name: 'Mushroom Village',
    flavor: 'Little houses in giant mushrooms. Whoever lived here was very small.',
    weight: (env) =>
      UNCOMMON *
      (env.caveBiome === 'fungal_hollow' ? 2.5 : under(env, 'swamp', 'jungle') ? 1.4 : 1) *
      (under(env, 'desert', 'volcanic') ? 0.3 : 1),
  },
  // --- Natural wonders ---
  {
    id: 'hot_springs', index: 42, name: 'Hot Springs',
    flavor: 'Terraced pools of warm, mineral-white water.',
    weight: (env) => UNCOMMON * (under(env, 'volcanic') ? 1.8 : under(env, 'pine-forest') || env.caveBiome === 'frozen_cave' ? 0.4 : 1),
  },
  {
    id: 'fallen_star', index: 43, name: 'Fallen Star',
    flavor: 'Something fell from the sky and burned its way down here.',
    weight: () => RARE,
  },
  {
    id: 'great_roots', index: 44, name: 'Great Roots',
    flavor: 'The roots of some enormous tree, breaking through the ceiling.',
    weight: (env) =>
      UNCOMMON * (under(env, 'pine-forest', 'coastal-rainforest', 'jungle') ? 1.6 : under(env, 'desert', 'volcanic') ? 0.2 : 1),
  },
  {
    id: 'frozen_waterfall', index: 45, name: 'Frozen Waterfall',
    flavor: 'A waterfall, stopped mid-fall by the cold.',
    weight: (env) => (under(env, 'pine-forest') || env.caveBiome === 'frozen_cave' ? UNCOMMON * 2 : 0),
  },
  {
    id: 'wyrm_burrow', index: 46, name: 'Wyrm Burrow',
    flavor: 'A perfectly round tunnel bored through solid rock. By what?',
    weight: () => RARE,
  },
]

const BY_ID = new Map<PoiKindId, PoiKindInfo>(POI_KINDS.map((k) => [k.id, k]))
const BY_INDEX = new Map<number, PoiKindInfo>(POI_KINDS.map((k) => [k.index, k]))

export function getPoiKind(id: PoiKindId): PoiKindInfo {
  return BY_ID.get(id)!
}

/** The kind a keystone's metadata names (undefined for an unknown index). */
export function getPoiKindByIndex(index: number): PoiKindInfo | undefined {
  return BY_INDEX.get(index)
}
