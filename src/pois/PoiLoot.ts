import { BlockIds } from '../world/blocks/BlockIds.ts'
import { registerChestLootTable, type LootRoll, type LootStack } from '../world/loot/ChestLootRegistry.ts'
import { createItemFromId } from '../persistence/ItemRegistry.ts'
import type { PoiKindId } from '../world/generate/caves/pois/PoiCatalog.ts'
import { poiRegistry } from './PoiRegistry.ts'

/** Collects a chest's stacks: `add` always, `maybe` with a chance. Unknown ids are skipped (and reported in dev). */
class LootBag {
  readonly stacks: LootStack[] = []
  private salt = 1

  constructor(private readonly roll: LootRoll) {}

  add(id: string, min: number, max = min): void {
    const salt = this.salt++
    const item = createItemFromId(id)
    if (!item) {
      if (import.meta.env.DEV) console.warn(`[pois] unknown loot item '${id}'`)
      return
    }
    this.stacks.push({ item, count: min + Math.floor(this.roll(salt * 7 + 3) * (max - min + 1)) })
  }

  maybe(chance: number, id: string, min = 1, max = min): void {
    const salt = this.salt++
    if (this.roll(salt * 11 + 5) < chance) this.add(id, min, max)
  }

  /** One of several items, picked by roll. */
  oneOf(ids: readonly string[], min = 1, max = min): void {
    const salt = this.salt++
    this.add(ids[Math.floor(this.roll(salt * 13 + 1) * ids.length)], min, max)
  }
}

const POTIONS = ['health_potion_1', 'health_potion_2', 'fire_resistance_potion', 'regeneration_potion', 'ember_sight_potion', 'strength_potion', 'slow_falling_potion', 'iceskin_potion']
const IRON_ARMOR = ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']
const STEEL_ARMOR = ['steel_helmet', 'steel_chestplate', 'steel_leggings', 'steel_boots']

/** Each kind's chest contents: what the place would hold. */
const LOOT: Readonly<Record<PoiKindId, (bag: LootBag) => void>> = {
  rune_circle: (b) => {
    b.add('rune_shard', 2, 5)
    b.add('celestite_shard', 1, 3)
    b.maybe(0.5, 'ember_sight_potion')
    b.maybe(0.4, 'gold_bar', 1, 2)
    b.maybe(0.2, 'delvers_compass')
    b.maybe(0.15, 'diamond')
  },
  rune_vault: (b) => {
    b.add('gold_bar', 2, 5)
    b.add('rune_shard', 2, 4)
    b.maybe(0.5, 'diamond', 1, 2)
    b.maybe(0.35, 'strength_potion')
    b.maybe(0.25, 'steel_sword')
    b.maybe(0.25, 'iron_chestplate')
    b.maybe(0.15, 'delvers_compass')
  },
  dragons_lair: (b) => {
    b.add('gold_bar', 4, 9)
    b.add('diamond', 2, 5)
    b.add('heaped_gold_block', 4, 10)
    b.maybe(0.5, 'fire_resistance_potion_long')
    b.maybe(0.25, 'diamond_sword')
    b.maybe(0.2, 'diamond_chestplate')
    b.maybe(0.15, 'treasure_hoard_block')
    b.maybe(0.12, 'infernal_heart')
  },
  lost_hoard: (b) => {
    b.add('gold_bar', 2, 4)
    b.add('gold_ore', 2, 5)
    b.maybe(0.3, 'diamond')
    b.maybe(0.2, 'golden_idol_block')
    b.maybe(0.3, 'health_potion_1')
  },
  smugglers_cache: (b) => {
    b.add('rope', 2, 5)
    b.add('copper_bar', 2, 5)
    b.add('iron_bar', 2, 4)
    b.maybe(0.6, 'gold_bar', 1, 3)
    b.maybe(0.5, 'tnt_block', 1, 3)
    b.maybe(0.4, 'sulfur', 2, 4)
    b.maybe(0.4, 'health_potion_1', 1, 2)
    b.add('bread', 2, 4)
  },
  miners_camp: (b) => {
    b.add('torch_block', 6, 12)
    b.add('coal', 4, 10)
    b.add('iron_ore', 2, 6)
    b.oneOf(['bread', 'baked_potato', 'cooked_pork'], 2, 4)
    b.maybe(0.4, 'rope_ladder_block', 3, 8)
    b.maybe(0.25, 'iron_pickaxe')
    b.maybe(0.08, 'steel_pickaxe')
  },
  dwarven_forge: (b) => {
    b.add('iron_bar', 3, 7)
    b.add('steel_bar', 2, 5)
    b.add('coal', 6, 12)
    b.maybe(0.5, 'gold_bar', 1, 3)
    b.maybe(0.3, 'steel_pickaxe')
    b.maybe(0.25, 'steel_axe')
    b.maybe(0.2, 'steel_sword')
    b.maybe(0.2, STEEL_ARMOR[0])
    b.maybe(0.2, 'diamond')
  },
  forgotten_hall: (b) => {
    b.add('gold_bar', 3, 6)
    b.add('diamond', 1, 3)
    b.maybe(0.3, 'steel_sword')
    b.maybe(0.1, 'diamond_sword')
    b.maybe(0.3, 'iron_chestplate')
    b.maybe(0.25, 'golden_idol_block')
    b.maybe(0.3, 'regeneration_potion')
  },
  ancient_crypt: (b) => {
    b.add('bone', 3, 8)
    b.add('bone_meal', 2, 6)
    b.maybe(0.6, 'gold_bar', 1, 3)
    b.maybe(0.4, 'health_potion_2')
    b.maybe(0.3, 'regeneration_potion')
    b.maybe(0.25, 'iron_helmet')
    b.maybe(0.12, 'diamond')
  },
  giant_geode: (b) => b.add('celestite_shard', 3, 6),
  giant_fossil: (b) => {
    b.add('bone', 6, 14)
    b.add('bone_meal', 4, 10)
    b.add('torch_block', 4, 8)
    b.maybe(0.3, 'iron_shovel')
    b.maybe(0.15, 'diamond')
  },
  petrified_tree: (b) => {
    b.add('oak_sapling_block', 2, 4)
    b.add('bone_meal', 3, 6)
    b.add('glowberries', 3, 8)
    b.add('celestite_shard', 2, 5)
    b.maybe(0.5, 'herb', 2, 4)
    b.maybe(0.25, 'regeneration_potion')
  },
  sunken_shrine: (b) => {
    b.add('gold_bar', 2, 4)
    b.add('celestite_shard', 3, 6)
    b.maybe(0.4, 'diamond', 1, 2)
    b.maybe(0.3, 'health_potion_2')
    b.maybe(0.3, 'slow_falling_potion')
  },
  fairy_ring: (b) => {
    b.add('glowberries', 4, 9)
    b.maybe(0.6, 'gold_bar', 1, 3)
    b.maybe(0.5, 'celestite_shard', 1, 3)
    b.maybe(0.3, 'regeneration_potion')
    b.maybe(0.3, 'ember_sight_potion')
    b.maybe(0.15, 'diamond')
  },
  lost_explorer: (b) => {
    b.add('torch_block', 4, 10)
    b.add('bread', 1, 3)
    b.add('rope_ladder_block', 3, 6)
    b.maybe(0.5, 'health_potion_1')
    b.maybe(0.3, 'iron_pickaxe')
    b.maybe(0.3, 'delvers_compass')
    b.maybe(0.3, 'gold_bar', 1, 2)
  },
  forgotten_library: (b) => {
    b.add('rune_shard', 1, 3)
    b.maybe(0.4, 'ember_sight_potion')
    b.maybe(0.25, 'strength_potion')
    b.maybe(0.25, 'slow_falling_potion')
    b.maybe(0.15, 'iceskin_potion')
    b.maybe(0.25, 'delvers_compass')
    b.maybe(0.5, 'gold_bar', 1, 2)
  },
  alchemists_den: (b) => {
    b.add('health_potion_1', 1, 3)
    b.add('herb', 3, 6)
    b.oneOf(POTIONS)
    b.oneOf(POTIONS)
    b.maybe(0.5, 'health_potion_2')
    b.maybe(0.2, 'magma_cream')
  },
  spider_nest: (b) => {
    b.add('spider_silk', 4, 10)
    b.add('bone', 2, 6)
    b.maybe(0.6, 'gold_bar', 1, 3)
    b.maybe(0.25, 'diamond')
    b.maybe(0.4, 'health_potion_1')
    b.maybe(0.2, 'iron_sword')
  },
  buried_longship: (b) => {
    b.add('gold_bar', 2, 5)
    b.add('iron_bar', 2, 5)
    b.add('rope', 2, 4)
    b.maybe(0.35, 'iron_sword')
    b.maybe(0.25, 'steel_axe')
    b.maybe(0.5, 'sea_shell_block', 2, 5)
    b.maybe(0.25, 'diamond')
  },
  stone_colossus: (b) => {
    b.add('gold_bar', 3, 7)
    b.add('diamond', 1, 3)
    b.add('rune_shard', 2, 4)
    b.maybe(0.4, 'strength_potion')
    b.maybe(0.1, 'diamond_pickaxe')
  },
  wishing_well: (b) => {
    b.add('gold_bar', 1, 3)
    b.add('gold_ore', 3, 8)
    b.maybe(0.3, 'diamond')
    b.maybe(0.3, 'health_potion_1')
  },
  mother_lode: (b) => b.add('torch_block', 4, 8),
  hermits_hollow: (b) => {
    b.oneOf(['mushroom_stew', 'vegetable_stew', 'baked_potato'], 1, 3)
    b.add('potato', 2, 5)
    b.add('carrot', 2, 4)
    b.maybe(0.5, 'health_potion_1')
    b.maybe(0.4, 'pumpkin_seeds', 1, 3)
    b.maybe(0.2, 'iron_axe')
    b.maybe(0.2, 'gold_bar', 1, 2)
  },
  frozen_explorer: (b) => {
    b.add('torch_block', 4, 8)
    b.add('cooked_venison', 2, 4)
    b.maybe(0.4, 'iceskin_potion')
    b.maybe(0.3, 'diamond', 1, 2)
    b.maybe(0.2, 'delvers_compass')
    b.maybe(0.2, 'steel_pickaxe')
    b.maybe(0.2, IRON_ARMOR[1])
  },
  hidden_garden: (b) => {
    b.add('oak_sapling_block', 2, 4)
    b.add('glowberries', 4, 8)
    b.add('bone_meal', 4, 8)
    b.oneOf(['carrot', 'potato'], 2, 4)
    b.oneOf(['tomato_seeds', 'strawberry_seeds', 'pumpkin_seeds', 'blueberry_seeds'], 2, 4)
    b.maybe(0.5, 'herb', 2, 5)
  },
  // --- Ruins ---
  sunken_cistern: (b) => {
    b.add('gold_bar', 1, 3)
    b.add('iron_bar', 2, 4)
    b.maybe(0.4, 'health_potion_1', 1, 2)
    b.maybe(0.3, 'slow_falling_potion')
    b.maybe(0.25, 'diamond')
  },
  old_bridge: (b) => {
    b.add('rope', 2, 5)
    b.add('torch_block', 4, 8)
    b.maybe(0.5, 'gold_bar', 1, 2)
    b.maybe(0.4, 'slow_falling_potion')
    b.maybe(0.25, 'iron_sword')
    b.maybe(0.2, 'rope_ladder_block', 4, 8)
  },
  forgotten_gaol: (b) => {
    b.add('bone', 2, 6)
    b.add('iron_bar', 2, 5)
    b.add('iron_bars_block', 4, 8)
    b.maybe(0.4, 'gold_bar', 1, 2)
    b.maybe(0.3, 'health_potion_1')
    b.maybe(0.2, 'iron_sword')
    b.maybe(0.15, IRON_ARMOR[0])
  },
  buried_arena: (b) => {
    b.add('gold_bar', 2, 4)
    b.maybe(0.4, 'strength_potion')
    b.maybe(0.35, 'steel_sword')
    b.maybe(0.3, 'iron_sword')
    b.maybe(0.25, IRON_ARMOR[0])
    b.maybe(0.15, STEEL_ARMOR[1])
    b.maybe(0.2, 'diamond')
  },
  black_monolith: (b) => {
    b.add('rune_shard', 3, 6)
    b.add('obsidian_block', 2, 4)
    b.maybe(0.4, 'diamond', 1, 2)
    b.maybe(0.3, 'strength_potion')
    b.maybe(0.25, 'delvers_compass')
    b.maybe(0.15, 'infernal_heart')
  },
  // --- Sacred and learned places ---
  forgotten_chapel: (b) => {
    b.add('gold_bar', 1, 3)
    b.maybe(0.5, 'health_potion_2')
    b.maybe(0.4, 'regeneration_potion')
    b.maybe(0.3, 'book_pile_block')
    b.maybe(0.15, 'golden_idol_block')
    b.maybe(0.15, 'diamond')
  },
  star_chamber: (b) => {
    b.add('celestite_shard', 3, 6)
    b.add('gold_bar', 2, 4)
    b.maybe(0.4, 'delvers_compass')
    b.maybe(0.3, 'telescope_block')
    b.maybe(0.3, 'slow_falling_potion')
    b.maybe(0.3, 'diamond')
  },
  sandstone_tomb: (b) => {
    b.add('gold_bar', 3, 7)
    b.add('bone', 2, 5)
    b.maybe(0.5, 'diamond', 1, 3)
    b.maybe(0.4, 'golden_idol_block')
    b.maybe(0.3, 'gold_coins_block', 2, 5)
    b.maybe(0.2, 'treasure_hoard_block')
    b.maybe(0.25, 'health_potion_2')
  },
  sunken_tower: (b) => {
    b.add('rune_shard', 2, 5)
    b.oneOf(POTIONS)
    b.oneOf(POTIONS)
    b.maybe(0.5, 'gold_bar', 1, 3)
    b.maybe(0.3, 'delvers_compass')
    b.maybe(0.25, 'book_pile_block')
    b.maybe(0.2, 'diamond')
  },
  sculptors_studio: (b) => {
    b.add('calcite_block', 4, 8)
    b.add('ancient_bricks_block', 4, 10)
    b.maybe(0.5, 'stone_bust_block')
    b.maybe(0.35, 'iron_pickaxe')
    b.maybe(0.4, 'gold_bar', 1, 2)
  },
  // --- People and peril ---
  bandit_hideout: (b) => {
    b.add('gold_bar', 2, 4)
    b.add('iron_bar', 2, 4)
    b.add('bread', 2, 4)
    b.maybe(0.4, 'iron_sword')
    b.maybe(0.3, 'tnt_block', 1, 3)
    b.maybe(0.4, 'health_potion_1', 1, 2)
    b.maybe(0.3, 'rope', 2, 4)
    b.maybe(0.15, 'diamond')
  },
  cave_in: (b) => {
    b.add('coal', 4, 10)
    b.add('iron_ore', 3, 6)
    b.add('torch_block', 4, 8)
    b.maybe(0.4, 'gold_ore', 1, 3)
    b.maybe(0.3, 'iron_pickaxe')
    b.maybe(0.08, 'steel_pickaxe')
  },
  excavation_site: (b) => {
    b.add('bone', 3, 6)
    b.add('torch_block', 4, 8)
    b.maybe(0.4, 'fossil_bone_block', 2, 4)
    b.maybe(0.5, 'gold_bar', 1, 3)
    b.maybe(0.4, 'iron_shovel')
    b.maybe(0.2, 'golden_idol_block')
    b.maybe(0.3, 'rope', 2, 4)
  },
  deepway_tavern: (b) => {
    b.add('bread', 3, 6)
    b.oneOf(['cooked_pork', 'cooked_beef', 'cooked_venison'], 2, 4)
    b.add('gold_coins_block', 3, 8)
    b.maybe(0.5, 'gold_bar', 1, 2)
    b.maybe(0.4, 'health_potion_1', 1, 2)
    b.maybe(0.4, 'tankards_block')
    b.maybe(0.3, 'barrel_block', 1, 2)
  },
  mushroom_village: (b) => {
    b.add('glowberries', 3, 6)
    b.add('brown_mushrooms_block', 3, 6)
    b.add('puffballs_block', 2, 4)
    b.maybe(0.5, 'mushroom_stew', 1, 2)
    b.maybe(0.3, 'regeneration_potion')
    b.maybe(0.3, 'gold_bar', 1, 2)
  },
  // --- Natural wonders ---
  hot_springs: (b) => {
    b.add('celestite_shard', 2, 4)
    b.maybe(0.5, 'regeneration_potion')
    b.maybe(0.3, 'health_potion_2')
    b.maybe(0.3, 'gold_bar', 1, 2)
    b.maybe(0.2, 'diamond')
  },
  fallen_star: (b) => {
    b.add('celestite_shard', 4, 8)
    b.add('diamond', 1, 3)
    b.add('obsidian_block', 2, 4)
    b.maybe(0.5, 'gold_bar', 1, 3)
    b.maybe(0.3, 'strength_potion')
  },
  great_roots: (b) => {
    b.add('oak_sapling_block', 2, 4)
    b.add('glowberries', 3, 6)
    b.add('bone_meal', 3, 6)
    b.maybe(0.5, 'herb', 2, 4)
    b.maybe(0.3, 'regeneration_potion')
  },
  frozen_waterfall: (b) => {
    b.add('torch_block', 4, 8)
    b.add('cooked_venison', 2, 3)
    b.maybe(0.5, 'iceskin_potion')
    b.maybe(0.4, 'diamond', 1, 2)
    b.maybe(0.15, 'steel_pickaxe')
  },
  wyrm_burrow: (b) => {
    b.add('bone', 4, 8)
    b.add('gold_bar', 2, 5)
    b.maybe(0.5, 'diamond', 1, 2)
    b.maybe(0.3, STEEL_ARMOR[0])
    b.maybe(0.3, IRON_ARMOR[1])
    b.maybe(0.3, 'health_potion_1', 1, 2)
  },
}

/** Fallback when a chest's keystone isn't loaded: a little of everything. */
function generic(b: LootBag): void {
  b.add('torch_block', 3, 8)
  b.maybe(0.6, 'gold_bar', 1, 2)
  b.maybe(0.4, 'health_potion_1')
}

/**
 * The 'cave-poi' chest loot table: every point of interest's chest lies
 * within 8 blocks of its keystone, and the keystone's kind (through the
 * registry of loaded points of interest) picks the contents. Highest
 * priority: keystones only exist inside points of interest.
 */
export function registerPoiLoot(): void {
  registerChestLootTable({
    id: 'cave-poi',
    signatureBlocks: [BlockIds.POI_KEYSTONE],
    signatureRadius: 8,
    priority: 20,
    roll(roll, x, y, z) {
      const bag = new LootBag(roll)
      const poi = poiRegistry.near(x, y, z, 8)
      ;(poi ? LOOT[poi.kind.id] : generic)(bag)
      return bag.stacks
    },
  })
}

/** For dev checks: roll a kind's loot with a fixed roll function. */
export function rollPoiLoot(kind: PoiKindId, roll: LootRoll): LootStack[] {
  const bag = new LootBag(roll)
  LOOT[kind](bag)
  return bag.stacks
}
