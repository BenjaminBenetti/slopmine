import { getPoiKind } from '../PoiCatalog.ts'
import { PoiBuilder, type PoiBuildDef } from '../PoiBuilder.ts'
import { B, F, FRONT, dist, hangFromCeiling, masonry, mix, scatter, walledRoom } from './shared.ts'

/** Where people lived and worked underground, and the ones who never left. */

/** An abandoned miners' camp: bedrolls round a cold fire, crates of ore. */
export const MINERS_CAMP: PoiBuildDef = {
  kind: getPoiKind('miners_camp'),
  radius: 6, above: 5, below: 2,
  build(b) {
    b.chamber(0, 2, 0, 5.2, 3.2, 5.2, 0, B.STONE, 0.15)
    scatter(b, -5, -5, 5, 5, -1, 181, (h) => (h < 0.3 ? B.GRAVEL : 0), PoiBuilder.natural)
    // The cold fire pit
    b.set(0, -1, 0, B.CHARRED_LOG)
    b.set(0, 0, 0, B.CINDERS)
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.set(x, 0, z, B.VOLCANIC_ROCKS)
    b.set(-2, 0, 1, B.BEDROLL, b.facing(F.EAST))
    b.set(2, 0, 1, B.BEDROLL, b.facing(F.WEST))
    // A lantern and a torch on posts
    b.fill(-3, 0, -3, -3, 1, -3, B.OAK_FENCE)
    b.set(-3, 2, -3, B.MINERS_LANTERN)
    b.fill(3, 0, 2, 3, 1, 2, B.OAK_FENCE)
    b.set(3, 2, 2, B.TORCH)
    // Supplies
    b.set(2, 0, -3, B.ORE_CRATE)
    b.set(3, 0, -3, B.ORE_CRATE)
    b.set(3, 1, -3, B.ORE_CRATE)
    b.set(-2, 0, -3, B.BARREL)
    b.chest(0, 0, -3, FRONT)
    scatter(b, -4, -4, 4, 4, 0, 182, (h, x, z) => (dist(x, z) < 1.6 ? 0 : h < 0.05 ? B.PEBBLES : h < 0.07 ? B.TWIGS : 0))
    b.keystone(0, -2, -1)
  },
}

/** A hermit's home in the rock: a bed, a table, a mushroom patch, a lifetime of clutter. */
export const HERMITS_HOLLOW: PoiBuildDef = {
  kind: getPoiKind('hermits_hollow'),
  radius: 7, above: 5, below: 3,
  build(b) {
    b.chamber(0, 2, -1, 6, 3.2, 5.2, 0, B.STONE, 0.15)
    for (let z = -5; z <= 2; z++) {
      for (let x = -4; x <= 4; x++) if (dist(x, z, 0, -1.5) <= 3.6) b.set(x, -1, z, B.OAK_PLANKS)
    }
    b.set(-3, 0, -4, B.BED_HEAD, b.facing(F.NORTH))
    b.set(-3, 0, -3, B.BED_FOOT, b.facing(F.NORTH))
    b.set(1, 0, -3, B.OAK_TABLE)
    b.set(1, 1, -3, B.MINERS_LANTERN)
    b.set(1, 0, -2, B.OAK_CHAIR, b.facing(F.NORTH))
    b.set(3, 0, -3, B.BARREL)
    b.set(3, 0, -2, B.BARREL)
    b.set(2, 0, -4, B.BOOK_PILE, b.facing(FRONT))
    b.set(2, 0, -1, B.DUSTY_BOTTLES)
    b.chest(-1, 0, -4, FRONT)
    // The mushroom patch
    for (const [x, z] of [[-3, 0], [-2, 0], [-3, 1], [-2, 1]]) {
      b.set(x, -1, z, B.MOSS)
      b.set(x, 0, z, b.hash(x, 0, z, 191) < 0.5 ? B.BROWN_MUSHROOMS : B.CAVE_MUSHROOMS)
    }
    b.set(0, 0, 0, B.CINDERS)
    hangFromCeiling(b, -5, -5, 5, 3, 1, 5, 192, (h) => (h < 0.06 ? B.HANGING_ROOTS : 0))
    b.keystone(0, -2, -2)
  },
}

/** An alchemist's den: a working apothecary bench, bottles everywhere, a little herb bed. */
export const ALCHEMISTS_DEN: PoiBuildDef = {
  kind: getPoiKind('alchemists_den'),
  radius: 7, above: 6, below: 3,
  build(b) {
    b.chamber(0, 2, -1, 6, 3.5, 5.4, 0, B.STONE, 0.15)
    for (let z = -5; z <= 2; z++) {
      for (let x = -4; x <= 4; x++) if (dist(x, z, 0, -2) <= 3.6) b.set(x, -1, z, B.OAK_PLANKS)
    }
    b.set(0, 0, -4, B.APOTHECARY_WORKBENCH, b.facing(FRONT))
    b.set(-2, 0, -4, B.OAK_TABLE)
    b.set(-2, 1, -4, B.DUSTY_BOTTLES)
    b.set(2, 0, -4, B.OAK_TABLE)
    b.set(2, 1, -4, B.GRAVE_CANDLES)
    b.set(-3, 0, -2, B.DUSTY_BOTTLES)
    b.set(3, 0, -1, B.DUSTY_BOTTLES)
    b.set(3, 0, -3, B.BARREL)
    b.chest(1, 0, -5, FRONT)
    // A herb bed watered from a sunken basin
    b.set(-4, -1, -1, B.WATER)
    b.set(-4, -2, -1, B.STONE)
    for (const [x, z] of [[-3, -1], [-2, -1], [-3, 0], [-2, 0]]) {
      b.set(x, -1, z, B.FARMLAND_MOIST)
      b.set(x, 0, z, B.HERB_3)
    }
    b.set(-4, 0, 0, B.CAVE_MUSHROOMS)
    b.set(4, 0, -2, B.MINERS_LANTERN)
    hangFromCeiling(b, -5, -6, 5, 3, 1, 6, 201, (h) => (h < 0.07 ? B.HANGING_ROOTS : 0))
    b.keystone(0, -2, -3)
  },
}

/** A dwarven smithy: forges, an anvil and a channel of lava under carved pillars. */
export const DWARVEN_FORGE: PoiBuildDef = {
  kind: getPoiKind('dwarven_forge'),
  radius: 8, above: 7, below: 3,
  build(b) {
    const wall = masonry(b, 0.08, 0.16)
    walledRoom(b, -6, 0, -7, 6, 5, 0, wall, B.ANCIENT_TILES)
    // Wide entrance with carved jambs, and a landing
    b.fill(-2, 0, 1, 2, 3, 1, B.AIR)
    b.fill(-3, 0, 1, -3, 4, 1, B.CARVED_ANCIENT_BRICKS)
    b.fill(3, 0, 1, 3, 4, 1, B.CARVED_ANCIENT_BRICKS)
    b.fill(-2, 4, 1, 2, 4, 1, B.CARVED_ANCIENT_BRICKS)
    b.fill(-3, 0, 2, 3, 4, 3, B.AIR)
    b.floor(-3, 2, 3, 3, -1, B.ANCIENT_TILES)
    // The lava channel along the back wall
    b.fill(-5, -1, -7, 5, -1, -7, B.LAVA)
    b.fill(-5, -2, -7, 5, -2, -7, B.ANCIENT_BRICKS)
    // Forges with brick hoods, the anvil, racks of arms
    for (const x of [-3, 3]) {
      b.set(x, 0, -6, B.FORGE, b.facing(FRONT))
      b.fill(x - 1, 3, -7, x + 1, 5, -7, B.CARVED_ANCIENT_BRICKS)
    }
    b.set(0, 0, -4, B.INFERNAL_ANVIL, b.facing(FRONT))
    b.set(-6, 0, -3, B.WEAPON_RACK, b.facing(F.EAST))
    b.set(6, 0, -3, B.WEAPON_RACK, b.facing(F.WEST))
    for (const x of [-5, 5]) for (const z of [-5, -1]) b.fill(x, 0, z, x, 5, z, B.CARVED_ANCIENT_BRICKS)
    b.chest(-5, 0, -3, F.EAST)
    b.chest(5, 0, -4, F.WEST)
    b.set(4, 0, -6, B.ORE_CRATE)
    b.set(-4, 0, -1, B.BARREL)
    b.set(4, 0, -1, B.BARREL)
    b.set(-2, 0, 2, B.MINERS_LANTERN)
    b.set(2, 0, 2, B.MINERS_LANTERN)
    b.keystone(0, -2, -4)
  },
}

/** The last camp of an explorer who went one cave too far. */
export const LOST_EXPLORER: PoiBuildDef = {
  kind: getPoiKind('lost_explorer'),
  radius: 4, above: 4, below: 2,
  build(b) {
    b.chamber(0, 1, -1, 3.4, 2.6, 3, 0, B.STONE, 0.15)
    b.set(0, 0, -2, B.BONE_PILE)
    b.set(-1, 0, -2, B.SKULL, b.facing(F.SOUTH))
    b.set(1, 0, -1, B.CAVE_BONES)
    b.chest(1, 0, -2, FRONT)
    b.set(-1, 0, 0, B.BEDROLL, b.facing(F.EAST))
    b.set(-2, 0, -1, B.TORCH)
    scatter(b, -3, -3, 3, 1, 0, 211, (h) => (h < 0.1 ? B.PEBBLES : 0))
    b.keystone(0, -2, -1)
  },
}

/** An explorer frozen in a block of black ice, the camp still beside them. */
export const FROZEN_EXPLORER: PoiBuildDef = {
  kind: getPoiKind('frozen_explorer'),
  radius: 6, above: 6, below: 3,
  build(b) {
    b.ellipsoid(0, 2, 0, 6.6, 4.6, 6.6, mix(b, 221, [[B.GLACIAL_ICE, 35], [B.FROSTED_STONE, 65]]), 0.1, PoiBuilder.natural)
    b.chamber(0, 2, 0, 5.4, 3.5, 5.4, 0, B.FROSTED_STONE, 0.14)
    scatter(b, -5, -5, 5, 5, -1, 222, (h) => (h < 0.35 ? B.GLACIAL_ICE : 0), PoiBuilder.natural)
    // The block of ice and the figure inside it
    b.fill(-1, 0, -3, 1, 3, -1, B.BLACK_ICE)
    b.set(0, 0, -1, B.ENTOMBED_UPRIGHT_LOWER)
    b.set(0, 1, -1, B.ENTOMBED_UPRIGHT_UPPER)
    // The camp they left
    b.set(2, 0, 1, B.BEDROLL, b.facing(F.WEST))
    b.set(-2, 0, 1, B.MINERS_LANTERN)
    b.chest(2, 0, -1, FRONT)
    scatter(b, -4, -4, 4, 4, 0, 223, (h, x, z) => (Math.abs(x) <= 1 && z <= -1 ? 0 : h < 0.4 ? B.SNOW_PATCH : 0))
    hangFromCeiling(b, -5, -5, 5, 5, 1, 6, 224, (h) => (h < 0.25 ? B.ICICLE : 0))
    b.keystone(0, -2, 0)
  },
}

export const DWELLING_KINDS: readonly PoiBuildDef[] = [MINERS_CAMP, HERMITS_HOLLOW, ALCHEMISTS_DEN, DWARVEN_FORGE, LOST_EXPLORER, FROZEN_EXPLORER]
