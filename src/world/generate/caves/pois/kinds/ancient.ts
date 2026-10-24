import { arch, pillar } from '../../../dungeons/DungeonBuild.ts'
import { getPoiKind } from '../PoiCatalog.ts'
import type { PoiBuildDef } from '../PoiBuilder.ts'
import { B, F, FRONT, dist, hangFromCeiling, masonry, mix, scatter, walledRoom } from './shared.ts'

/**
 * Ruins of the lost civilisation under the overworld: rune circles, sealed
 * vaults, pillared halls, libraries, a colossal face and crypts.
 */

/** Standing runestones in a ring around a pedestal of glowing runes. */
export const RUNE_CIRCLE: PoiBuildDef = {
  kind: getPoiKind('rune_circle'),
  radius: 9, above: 10, below: 3,
  build(b) {
    b.chamber(0, 3, 0, 8.4, 5.8, 8.4, 0, B.STONE)
    const wall = masonry(b, 0.25, 0.2)
    for (let z = -8; z <= 8; z++) {
      for (let x = -8; x <= 8; x++) {
        const d = dist(x, z)
        if (d > 7.6) continue
        const id = d < 1.6 ? B.CARVED_ANCIENT_BRICKS : d < 6.6 ? (b.hash(x, -1, z, 5) < 0.12 ? B.MOSSY_STONE : B.ANCIENT_TILES) : wall
        b.set(x, -1, z, id)
      }
    }
    // The dais and its pedestal
    b.fill(-1, 0, -1, 1, 0, 1, B.ANCIENT_TILES)
    b.set(0, 1, 0, B.RUNE_PEDESTAL, b.facing(FRONT))
    // Eight standing stones, one or two fallen
    const turn = b.rng.next() * Math.PI / 4
    for (let k = 0; k < 8; k++) {
      const a = turn + (k * Math.PI) / 4
      const x = Math.round(5.6 * Math.cos(a))
      const z = Math.round(5.6 * Math.sin(a))
      const height = 2 + b.rng.int(1, 2)
      if (b.rng.chance(0.15)) {
        // Fallen: lying outward along the floor
        const dx = Math.round(Math.cos(a)), dz = Math.round(Math.sin(a))
        b.set(x, 0, z, B.RUNESTONE)
        for (let i = 1; i < height; i++) b.set(x + dx * i, 0, z + dz * i, B.RUNESTONE)
      } else {
        b.fill(x, 0, z, x, height - 1, z, B.RUNESTONE)
        b.set(x, height, z, B.CARVED_ANCIENT_BRICKS)
      }
    }
    b.chest(0, 0, -2, FRONT)
    scatter(b, -7, -7, 7, 7, 0, 11, (h, x, z) => {
      const d = dist(x, z)
      if (d < 2 || d > 7.2) return 0
      return h < 0.05 ? B.PEBBLES : h < 0.08 ? B.CAVE_BONES : h < 0.12 ? B.GLOW_BLOOM : h < 0.13 ? B.SKULL : 0
    })
    b.keystone(0, -2, 0)
  },
}

/** A brick vault sunk into the rock, its doorway sealed with runestone. */
export const RUNE_VAULT: PoiBuildDef = {
  kind: getPoiKind('rune_vault'),
  radius: 7, above: 7, below: 3,
  build(b) {
    const wall = masonry(b)
    // Clear a forecourt so the sealed facade faces the cave
    b.fill(-3, 0, 0, 3, 4, 3, B.AIR)
    b.floor(-3, 0, 3, 3, -1, B.ANCIENT_TILES)
    walledRoom(b, -3, 0, -6, 3, 4, -2, wall, B.ANCIENT_TILES)
    // The seal: a runestone door in a carved frame
    b.fill(-2, 0, -1, 2, 3, -1, B.CARVED_ANCIENT_BRICKS)
    b.fill(-1, 0, -1, 1, 2, -1, B.RUNESTONE)
    // Inside: runestone corner columns, the idol in its alcove, the hoard
    for (const x of [-3, 3]) for (const z of [-6, -2]) b.fill(x, 0, z, x, 4, z, B.RUNESTONE)
    b.set(0, 1, -7, B.GOLDEN_IDOL, b.facing(FRONT))
    b.set(-1, 1, -7, B.CARVED_ANCIENT_BRICKS)
    b.set(1, 1, -7, B.CARVED_ANCIENT_BRICKS)
    b.set(0, 0, -5, B.RUNE_PEDESTAL, b.facing(FRONT))
    b.chest(-2, 0, -6, FRONT)
    b.chest(2, 0, -6, FRONT)
    b.set(-2, 0, -5, B.TREASURE_HOARD)
    scatter(b, -2, -5, 2, -3, 0, 17, (h) => (h < 0.35 ? B.GOLD_COINS : 0))
    b.keystone(0, -2, -4)
  },
}

/** A pillared hall with a throne, braziers still burning. */
export const FORGOTTEN_HALL: PoiBuildDef = {
  kind: getPoiKind('forgotten_hall'),
  radius: 13, above: 11, below: 3,
  build(b) {
    const wall = masonry(b, 0.2, 0.18)
    walledRoom(b, -6, 0, -12, 6, 8, 1, wall, B.ANCIENT_TILES)
    // Grand arched entrance and an approach
    b.fill(-2, 0, 2, 2, 3, 2, B.AIR)
    b.set(-2, 3, 2, wall)
    b.set(2, 3, 2, wall)
    b.fill(-3, 0, 3, 3, 4, 5, B.AIR)
    b.floor(-3, 3, 3, 5, -1, B.ANCIENT_TILES)
    b.fill(-3, 0, 2, -3, 4, 2, B.CARVED_ANCIENT_BRICKS)
    b.fill(3, 0, 2, 3, 4, 2, B.CARVED_ANCIENT_BRICKS)
    // The aisle
    b.fill(-1, -1, -9, 1, -1, 1, B.CARVED_ANCIENT_BRICKS)
    // Pillars in two rows, some fallen to rubble, arched together
    for (const x of [-4, 4]) {
      for (const z of [-10, -7, -4, -1]) {
        const broken = b.hash(x, 0, z, 41) < 0.3
        const top = broken ? 1 + Math.floor(b.hash(x, 1, z, 42) * 3) : 7
        pillar(b, x, z, 0, top, wall, 1, B.CARVED_ANCIENT_BRICKS)
        if (broken) {
          scatter(b, x - 1, z - 1, x + 1, z + 1, 0, 43, (h) => (h < 0.4 ? B.PEBBLES : h < 0.5 ? B.GRAVEL : 0))
        }
      }
      for (const [z0, z1] of [[-10, -7], [-7, -4], [-4, -1]]) arch(b, false, z0, z1, x, 6, 1, wall)
    }
    // The throne on its dais
    b.fill(-3, 0, -12, 3, 0, -10, B.ANCIENT_TILES)
    b.fill(-2, 1, -12, 2, 1, -11, B.ANCIENT_TILES)
    b.fill(-1, 2, -11, 1, 2, -11, wall)
    b.set(-1, 3, -11, B.CARVED_ANCIENT_BRICKS)
    b.set(1, 3, -11, B.CARVED_ANCIENT_BRICKS)
    b.fill(-1, 2, -12, 1, 4, -12, B.CARVED_ANCIENT_BRICKS)
    b.set(0, 5, -12, B.GOLDEN_IDOL, b.facing(FRONT))
    b.set(0, 3, -11, B.SKULL, b.facing(FRONT))
    b.chest(-2, 2, -12, FRONT)
    b.chest(2, 2, -12, FRONT)
    // Braziers along the aisle
    for (const z of [-8, -3]) {
      for (const x of [-2, 2]) {
        b.set(x, 0, z, B.CARVED_ANCIENT_BRICKS)
        b.set(x, 1, z, B.CAMPFIRE)
      }
    }
    // Weapon racks on the walls, dust and bones
    for (const z of [-9, -5]) {
      b.set(-6, 0, z, B.WEAPON_RACK, b.facing(F.EAST))
      b.set(6, 0, z, B.WEAPON_RACK, b.facing(F.WEST))
    }
    scatter(b, -6, -9, 6, 1, 0, 44, (h, x) => (Math.abs(x) <= 1 ? 0 : h < 0.03 ? B.SKULL : h < 0.07 ? B.CAVE_BONES : h < 0.1 ? B.PEBBLES : 0))
    hangFromCeiling(b, -6, -12, 6, 1, 4, 8, 45, (h) => (h < 0.08 ? B.COBWEB : 0))
    b.keystone(0, -2, -9)
  },
}

/** Shelves of crumbling books around a reading table. */
export const FORGOTTEN_LIBRARY: PoiBuildDef = {
  kind: getPoiKind('forgotten_library'),
  radius: 8, above: 7, below: 3,
  build(b) {
    const wall = masonry(b)
    walledRoom(b, -5, 0, -7, 5, 4, -1, wall, B.ANCIENT_TILES)
    // Doorway and a little landing in front
    b.fill(-1, 0, 0, 1, 2, 0, B.AIR)
    b.fill(-2, 0, 1, 2, 3, 2, B.AIR)
    b.floor(-2, 1, 2, 2, -1, B.ANCIENT_TILES)
    b.fill(-1, -1, -7, 1, -1, 0, B.CARVED_ANCIENT_BRICKS)
    // Wall shelves, three high, with gaps where they've collapsed
    const shelf = (x: number, z: number): void => {
      for (let y = 0; y <= 2; y++) if (b.hash(x, y, z, 51) > 0.08) b.set(x, y, z, B.ANCIENT_BOOKSHELF)
    }
    for (let z = -7; z <= -1; z++) {
      shelf(-5, z)
      shelf(5, z)
    }
    for (let x = -4; x <= 4; x++) if (Math.abs(x) > 1) shelf(x, -7)
    // Two freestanding stacks
    for (const x of [-3, 3]) for (let z = -5; z <= -3; z++) shelf(x, z)
    // Reading table, chairs, a lantern, the desk at the back
    b.set(0, 0, -4, B.OAK_TABLE)
    b.set(0, 1, -4, B.MINERS_LANTERN)
    b.set(0, 0, -3, B.OAK_CHAIR, b.facing(F.NORTH))
    b.set(0, 0, -5, B.OAK_CHAIR, b.facing(F.SOUTH))
    b.set(0, 0, -7, B.OAK_TABLE)
    b.set(0, 1, -7, B.GRAVE_CANDLES)
    b.chest(-1, 0, -6, FRONT)
    b.set(1, 0, -6, B.BOOK_PILE, b.facing(FRONT))
    b.set(-1, 0, -2, B.BOOK_PILE, b.facing(F.EAST))
    b.set(2, 0, -1, B.BOOK_PILE, b.facing(F.WEST))
    hangFromCeiling(b, -4, -6, 4, -1, 1, 4, 52, (h) => (h < 0.1 ? B.COBWEB : 0))
    b.keystone(0, -2, -4)
  },
}

/** A giant stone face in the cave wall; its open mouth leads into a treasure room. */
export const STONE_COLOSSUS: PoiBuildDef = {
  kind: getPoiKind('stone_colossus'),
  radius: 9, above: 13, below: 3,
  build(b) {
    // Open the cavern in front of the face
    b.chamber(0, 5, 3, 8.6, 7.4, 5.6, 0, B.STONE, 0.15)
    // The head: an oval relief standing out of the back wall
    // Pale calcite stands out from the grey rock; moss creeps over it
    const face = mix(b, 61, [[B.CALCITE, 94], [B.MOSS, 6]])
    for (let y = 0; y <= 12; y++) {
      for (let x = -7; x <= 7; x++) {
        const o = (x / 6.6) ** 2 + ((y - 6) / 6.6) ** 2
        if (o > 1) continue
        b.fill(x, y, -7, x, y, -2, face)
      }
    }
    // Brow, nose, lips and cheeks stand forward
    b.fill(-5, 8, -1, 5, 8, -1, face)
    b.fill(-1, 3, -1, 1, 7, -1, face)
    b.fill(0, 3, 0, 0, 5, 0, face)
    b.fill(-3, 3, -1, 3, 3, -1, face)
    b.fill(-3, 0, -1, 3, 0, -1, face)
    for (const x of [-4, 4]) b.fill(x, 4, -1, x, 5, -1, face)
    // Glowing runestone eyes
    b.fill(-4, 6, -2, -2, 7, -2, B.RUNESTONE)
    b.fill(2, 6, -2, 4, 7, -2, B.RUNESTONE)
    // A carved band and gold studs for a crown
    b.fill(-5, 10, -2, 5, 10, -2, B.CARVED_ANCIENT_BRICKS)
    for (let x = -4; x <= 4; x += 2) b.set(x, 11, -2, B.HEAPED_GOLD)
    // The mouth opens into a room inside the head
    b.fill(-2, 1, -3, 2, 2, -1, B.AIR)
    b.fill(-2, 0, -6, 2, 3, -3, B.AIR)
    b.floor(-2, -6, 2, -1, -1, B.ANCIENT_TILES)
    b.set(0, 0, -6, B.GOLDEN_IDOL, b.facing(FRONT))
    b.set(-2, 0, -6, B.GRAVE_CANDLES)
    b.set(2, 0, -6, B.GRAVE_CANDLES)
    b.chest(-2, 0, -4, F.EAST)
    b.set(2, 0, -4, B.TREASURE_HOARD)
    scatter(b, -1, -5, 1, -3, 0, 62, (h) => (h < 0.4 ? B.GOLD_COINS : 0))
    // A broken processional path up to the chin
    for (let z = 1; z <= 7; z++) {
      for (let x = -1; x <= 1; x++) if (b.hash(x, -1, z, 63) < 0.75) b.set(x, -1, z, B.ANCIENT_TILES)
    }
    b.keystone(0, -2, -5)
  },
}

/** A crypt of sarcophagi, burial niches and candles that still burn. */
export const ANCIENT_CRYPT: PoiBuildDef = {
  kind: getPoiKind('ancient_crypt'),
  radius: 8, above: 6, below: 3,
  build(b) {
    const wall = masonry(b, 0.3, 0.18)
    walledRoom(b, -4, 0, -7, 4, 4, -1, wall, B.ANCIENT_TILES)
    b.fill(-1, 0, 0, 1, 2, 0, B.AIR)
    b.fill(-2, 0, 1, 2, 3, 2, B.AIR)
    b.floor(-2, 1, 2, 2, -1, B.ANCIENT_TILES)
    b.fill(-2, 3, 0, 2, 3, 0, B.CARVED_ANCIENT_BRICKS)
    // Sarcophagi in two rows, candles on their lids
    for (const x of [-3, 3]) {
      for (const z0 of [-3, -6]) {
        b.set(x, 0, z0, B.SARCOPHAGUS)
        b.set(x, 0, z0 + 1, B.SARCOPHAGUS)
        if (b.hash(x, 1, z0, 71) < 0.7) b.set(x, 1, z0 + 1, B.GRAVE_CANDLES)
      }
    }
    // Burial niches in the side walls
    for (const x of [-5, 5]) {
      for (let z = -6; z <= -2; z += 2) b.set(x, 1, z, b.hash(x, 1, z, 72) < 0.5 ? B.SKULL : B.BONE_PILE, b.facing(x < 0 ? F.EAST : F.WEST))
    }
    // The altar at the back
    b.fill(-1, 0, -7, 1, 0, -7, B.CARVED_ANCIENT_BRICKS)
    b.set(-1, 1, -7, B.GRAVE_CANDLES)
    b.set(1, 1, -7, B.GRAVE_CANDLES)
    b.set(0, 1, -7, B.SKULL, b.facing(FRONT))
    b.chest(0, 0, -6, FRONT)
    for (const x of [-4, 4]) {
      b.set(x, 0, -1, B.FUNERARY_URN)
      b.set(x, 0, -7, B.FUNERARY_URN)
    }
    scatter(b, -2, -5, 2, -1, 0, 73, (h) => (h < 0.06 ? B.CAVE_BONES : 0))
    hangFromCeiling(b, -4, -7, 4, -1, 1, 4, 74, (h) => (h < 0.14 ? B.COBWEB : 0))
    b.keystone(0, -2, -4)
  },
}

export const ANCIENT_KINDS: readonly PoiBuildDef[] = [RUNE_CIRCLE, RUNE_VAULT, FORGOTTEN_HALL, FORGOTTEN_LIBRARY, STONE_COLOSSUS, ANCIENT_CRYPT]
