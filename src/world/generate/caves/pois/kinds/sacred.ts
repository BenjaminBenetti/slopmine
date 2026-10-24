import { dome, ladder, pillar } from '../../../dungeons/DungeonBuild.ts'
import { getPoiKind } from '../PoiCatalog.ts'
import { PoiBuilder, type PoiBuildDef } from '../PoiBuilder.ts'
import { B, F, FRONT, dist, hangFromCeiling, masonry, mix, scatter, walledRoom, weighted } from './shared.ts'

/** Sacred and learned places: a chapel, a star chamber, a desert king's tomb, a buried wizard's tower, a sculptor's studio. */

/** A small vaulted chapel: pews either side of an aisle, an altar under a rose window of runes. */
export const FORGOTTEN_CHAPEL: PoiBuildDef = {
  kind: getPoiKind('forgotten_chapel'),
  radius: 9, above: 8, below: 3,
  build(b) {
    const wall = masonry(b, 0.22, 0.16)
    // The nave (interior x -3..3, z -8..-1) under a pointed vault
    walledRoom(b, -3, 0, -8, 3, 5, -1, wall, B.ANCIENT_TILES)
    b.fill(-3, 7, -9, 3, 7, 0, wall)
    b.fill(-2, 8, -9, 2, 8, 0, wall)
    b.fill(-2, 6, -8, 2, 6, -1, B.AIR)
    b.fill(-1, 7, -8, 1, 7, -1, B.AIR)
    for (let z = -8; z <= -1; z++) {
      b.set(-4, 4, z, B.CARVED_ANCIENT_BRICKS)
      b.set(4, 4, z, B.CARVED_ANCIENT_BRICKS)
    }
    // A pointed arch at the front and a forecourt of broken flagstones
    b.fill(-1, 0, 0, 1, 2, 0, B.AIR)
    b.set(0, 3, 0, B.AIR)
    b.fill(-2, 0, 0, -2, 3, 0, B.CARVED_ANCIENT_BRICKS)
    b.fill(2, 0, 0, 2, 3, 0, B.CARVED_ANCIENT_BRICKS)
    b.set(-1, 3, 0, B.CARVED_ANCIENT_BRICKS)
    b.set(1, 3, 0, B.CARVED_ANCIENT_BRICKS)
    b.set(0, 4, 0, B.CARVED_ANCIENT_BRICKS)
    b.fill(-2, 0, 1, 2, 3, 3, B.AIR)
    b.floor(-2, 1, 2, 3, -1, mix(b, 81, [[B.ANCIENT_TILES, 6], [B.MOSSY_STONE, 2], [B.GRAVEL, 2]]))
    b.fill(0, -1, -6, 0, -1, 0, B.CARVED_ANCIENT_BRICKS)
    // Pews facing the altar, a few rotted away
    for (const z of [-6, -4, -2]) {
      for (const x of [-3, -2, -1, 1, 2, 3]) {
        const h = b.hash(x, 0, z, 82)
        if (h < 0.1) continue
        b.set(x, 0, z, h < 0.18 ? B.OAK_SLAB : B.OAK_STAIRS, b.facing(F.NORTH))
      }
    }
    // The raised sanctuary: altar, idol, candles, shelves
    b.fill(-3, 0, -8, 3, 0, -7, B.ANCIENT_TILES)
    b.fill(-1, 1, -8, 1, 1, -8, B.CARVED_ANCIENT_BRICKS)
    b.set(0, 2, -8, B.GOLDEN_IDOL, b.facing(FRONT))
    b.set(-1, 2, -8, B.GRAVE_CANDLES)
    b.set(1, 2, -8, B.GRAVE_CANDLES)
    b.set(-3, 1, -7, B.GRAVE_CANDLES)
    b.set(3, 1, -7, B.GRAVE_CANDLES)
    for (const x of [-3, 3]) b.fill(x, 1, -8, x, 2, -8, B.ANCIENT_BOOKSHELF)
    b.chest(-2, 1, -8, FRONT)
    b.set(2, 1, -8, B.BOOK_PILE, b.facing(FRONT))
    // The rose window: runestone spokes and ring around a celestite heart
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy)
        if (d <= 0.6) b.set(dx, 4 + dy, -9, B.CELESTITE_BLOCK)
        else if (d > 1.9 && d <= 2.6) b.set(dx, 4 + dy, -9, B.RUNESTONE)
        else if (d <= 1.9 && (dx === 0 || dy === 0)) b.set(dx, 4 + dy, -9, B.RUNESTONE)
      }
    }
    b.set(-2, 0, -1, B.BOOK_PILE, b.facing(F.EAST))
    scatter(b, -3, -6, 3, -1, 0, 83, (h, x) => (x === 0 ? 0 : h < 0.05 ? B.PEBBLES : h < 0.07 ? B.CAVE_BONES : 0))
    hangFromCeiling(b, -3, -8, 3, -1, 2, 8, 84, (h) => (h < 0.1 ? B.COBWEB : 0))
    b.keystone(0, -2, -4)
  },
}

/** A domed observatory: a starry ceiling of celestite over an orrery on its dais. */
export const STAR_CHAMBER: PoiBuildDef = {
  kind: getPoiKind('star_chamber'),
  radius: 9, above: 10, below: 3,
  build(b) {
    const R = 8
    // The floor: flagstones with a runestone compass star, on foundations
    for (let z = -R; z <= R; z++) {
      for (let x = -R; x <= R; x++) {
        const d = dist(x, z)
        if (d > R + 0.3) continue
        let tile: number = b.hash(x, -1, z, 91) < 0.1 ? B.CRACKED_ANCIENT_BRICKS : B.ANCIENT_TILES
        if (d > 6.6) tile = B.CARVED_ANCIENT_BRICKS
        else if ((x === 0 || z === 0) && d <= 6) tile = B.RUNESTONE
        else if (Math.abs(x) === Math.abs(z) && d <= 4.3) tile = B.RUNESTONE
        else if (d > 5.3 && d <= 6.1) tile = B.CARVED_ANCIENT_BRICKS
        b.set(x, -1, z, tile)
        b.foundation(x, z, -2, B.STONE, 4)
      }
    }
    // Hollow out the dome, then its shell: brick walls, a night sky of slate and celestite above
    const inner = (R - 0.5) * (R - 0.5)
    for (let y = 0; y < R; y++) {
      for (let z = -R; z <= R; z++) {
        for (let x = -R; x <= R; x++) if (x * x + y * y + z * z <= inner) b.set(x, y, z, B.AIR)
      }
    }
    dome(b, 0, 0, 0, R, (x, y, z) => {
      if (y <= 1) return weighted(b.hash(x, y, z, 95), [[B.ANCIENT_BRICKS, 76], [B.MOSSY_ANCIENT_BRICKS, 12], [B.CRACKED_ANCIENT_BRICKS, 12]])
      return weighted(b.hash(x, y, z, 92), [[B.DAMP_SLATE, 84], [B.CELESTITE_BLOCK, 11], [B.CELESTITE_LAMP, 4]])
    })
    // The door through the dome, framed in carved brick
    b.fill(-1, 0, 6, 1, 2, 9, B.AIR)
    b.floor(-1, 6, 1, 9, -1, B.ANCIENT_TILES)
    b.fill(-2, 0, 8, -2, 3, 8, B.CARVED_ANCIENT_BRICKS)
    b.fill(2, 0, 8, 2, 3, 8, B.CARVED_ANCIENT_BRICKS)
    b.fill(-1, 3, 8, 1, 3, 8, B.CARVED_ANCIENT_BRICKS)
    // The dais and its orrery: a golden sun, planets on fence arms
    for (let z = -2; z <= 2; z++) {
      for (let x = -2; x <= 2; x++) if (dist(x, z) <= 2.5) b.set(x, 0, z, B.CARVED_ANCIENT_BRICKS)
    }
    b.fill(0, 1, 0, 0, 3, 0, B.OAK_FENCE)
    b.set(0, 4, 0, B.GOLD_BLOCK)
    b.fill(1, 2, 0, 2, 2, 0, B.OAK_FENCE)
    b.set(3, 2, 0, B.COPPER_BLOCK)
    b.set(-1, 2, 0, B.OAK_FENCE)
    b.set(-2, 2, 0, B.IRON_BLOCK)
    b.fill(0, 3, -3, 0, 3, -1, B.OAK_FENCE)
    b.set(0, 3, -4, B.CELESTITE_BLOCK)
    // The astronomer's corner: telescope, charts, a lantern
    b.set(-5, 0, -3, B.TELESCOPE, b.facing(F.NORTH))
    b.set(5, 0, -2, B.OAK_TABLE)
    b.set(5, 0, -1, B.OAK_TABLE)
    b.set(5, 1, -2, B.BOOK_PILE, b.facing(F.WEST))
    b.set(5, 1, -1, B.MINERS_LANTERN)
    b.set(4, 0, -1, B.OAK_CHAIR, b.facing(F.EAST))
    b.set(4, 0, 2, B.BOOK_PILE, b.facing(F.WEST))
    b.chest(-5, 0, 1, F.EAST)
    // Crystals creeping in along the walls and down from the dome
    scatter(b, -7, -7, 7, 7, 0, 93, (h, x, z) => {
      const d = dist(x, z)
      if (d < 6.6 || d > 7.6 || (Math.abs(x) <= 1 && z > 0)) return 0
      return h < 0.2 ? B.CELESTITE_CLUSTER : h < 0.35 ? B.CELESTITE_BUD : 0
    })
    hangFromCeiling(b, -6, -6, 6, 6, 3, 9, 94, (h) => (h < 0.05 ? B.HANGING_CELESTITE : 0))
    b.keystone(0, -2, 0)
  },
}

/** A desert king's burial chamber: a broken-open corridor, carved pillars, the sarcophagus and its gold. */
export const SANDSTONE_TOMB: PoiBuildDef = {
  kind: getPoiKind('sandstone_tomb'),
  radius: 10, above: 7, below: 3,
  build(b) {
    const brick = (x: number, y: number, z: number): number => (b.hash(x, y, z, 101) < 0.12 ? B.SANDSTONE : B.SANDSTONE_BRICKS)
    // The burial chamber (interior x -5..5, z -9..-3) with a frieze of glyphs
    walledRoom(b, -5, 0, -9, 5, 4, -3, (x, y, z) => (y === 3 ? B.CARVED_SANDSTONE : brick(x, y, z)), B.SANDSTONE_BRICKS)
    // The corridor in, glyph-lined, its door broken open
    walledRoom(b, -1, 0, -1, 1, 2, 2, (x, y, z) => (y === 1 ? B.CARVED_SANDSTONE : brick(x, y, z)), B.SANDSTONE_BRICKS)
    b.fill(-1, 0, -2, 1, 2, -2, B.AIR)
    // Outside: a stepped roof, carved corner posts, a lintel and two obelisks at the door
    b.fill(-5, 6, -9, 5, 6, -3, brick)
    b.fill(-3, 7, -8, 3, 7, -4, B.CARVED_SANDSTONE)
    for (const x of [-6, 6]) for (const z of [-10, -2]) b.fill(x, 0, z, x, 5, z, B.CARVED_SANDSTONE)
    b.fill(-2, 3, 3, 2, 3, 3, B.CARVED_SANDSTONE)
    for (const x of [-3, 3]) {
      b.foundation(x, 4, -1, B.SANDSTONE, 4)
      b.fill(x, 0, 4, x, 2, 4, B.CARVED_SANDSTONE)
      b.set(x, 3, 4, B.SANDSTONE)
    }
    b.fill(-1, 0, 3, 1, 2, 3, B.AIR)
    b.set(1, 0, 3, B.SANDSTONE_BRICKS)
    b.fill(-2, 0, 4, 2, 3, 6, B.AIR)
    b.floor(-2, 4, 2, 6, -1, mix(b, 102, [[B.SAND, 7], [B.SANDSTONE, 3]]))
    b.set(-2, 0, 5, B.CARVED_SANDSTONE)
    b.set(1, 0, 5, B.SANDSTONE_BRICKS)
    scatter(b, -2, 4, 2, 6, 0, 103, (h) => (h < 0.2 ? B.PEBBLES : 0))
    // A robber who didn't make it out
    b.set(1, 0, 0, B.SKULL, b.facing(F.WEST))
    b.set(0, 0, 1, B.CAVE_BONES)
    // Carved pillars
    for (const x of [-3, 3]) for (const z of [-8, -5]) pillar(b, x, z, 0, 4, B.CARVED_SANDSTONE)
    // Sand drifted into the corners
    for (let z = -9; z <= -3; z++) {
      for (let x = -5; x <= 5; x++) {
        if (Math.abs(x) < 4 || (z > -8 && z < -4)) continue
        if (b.hash(x, 0, z, 104) < 0.75) b.set(x, 0, z, B.SAND)
        if (Math.abs(x) === 5 && (z === -9 || z === -3)) b.set(x, 1, z, B.SAND)
      }
    }
    // The dais, the sarcophagus, idols and gold
    b.fill(-2, 0, -9, 2, 0, -7, B.SANDSTONE_BRICKS)
    b.fill(-2, 0, -7, 2, 0, -7, B.CARVED_SANDSTONE)
    b.set(0, 1, -9, B.SARCOPHAGUS)
    b.set(0, 1, -8, B.SARCOPHAGUS)
    b.set(-2, 1, -9, B.GOLDEN_IDOL, b.facing(FRONT))
    b.set(2, 1, -9, B.GOLDEN_IDOL, b.facing(FRONT))
    b.chest(-1, 1, -9, FRONT)
    b.chest(1, 1, -9, FRONT)
    scatter(b, -2, -8, 2, -7, 1, 105, (h, x) => (x === 0 ? 0 : h < 0.45 ? B.GOLD_COINS : 0))
    b.set(-4, 0, -7, B.TREASURE_HOARD)
    b.set(4, 0, -6, B.GOLD_COINS)
    for (const x of [-5, 5]) b.set(x, 0, -6, B.FUNERARY_URN)
    b.set(-4, 0, -5, B.FUNERARY_URN)
    scatter(b, -2, -6, 2, -4, 0, 106, (h) => (h < 0.18 ? B.GOLD_COINS : 0))
    b.set(-4, 0, -3, B.MINERS_LANTERN)
    b.set(4, 0, -3, B.MINERS_LANTERN)
    hangFromCeiling(b, -5, -9, 5, -3, 1, 5, 107, (h) => (h < 0.1 ? B.COBWEB : 0))
    b.keystone(0, -2, -6)
  },
}

/** The top of a round wizard's tower, buried to its eaves: a library below, a study above, a slate spire into the rock. */
export const SUNKEN_TOWER: PoiBuildDef = {
  kind: getPoiKind('sunken_tower'),
  radius: 9, above: 13, below: 3,
  build(b) {
    b.chamber(0, 5, 0, 8.6, 7.6, 8.6, 0, B.STONE, 0.14)
    const wall = masonry(b, 0.25, 0.15)
    // The round shell rises out of the floor; two storeys inside
    for (let z = -5; z <= 5; z++) {
      for (let x = -5; x <= 5; x++) {
        const d = dist(x, z)
        if (d > 4.5) continue
        if (d > 3.5) {
          b.fill(x, -3, z, x, 8, z, wall)
          continue
        }
        b.fill(x, 0, z, x, 8, z, B.AIR)
        b.set(x, -1, z, B.OAK_PLANKS)
        b.foundation(x, z, -2, B.STONE, 2)
        b.set(x, 4, z, B.OAK_PLANKS)
      }
    }
    // The roof: slate eaves, then a cone into the cave ceiling, a golden finial
    for (let z = -6; z <= 6; z++) {
      for (let x = -6; x <= 6; x++) {
        const d = dist(x, z)
        if (d <= 5.4) b.set(x, 9, z, B.DAMP_SLATE)
        for (let y = 10; y <= 12; y++) {
          const r = 4.6 - (y - 10) * 1.3
          if (d <= r && d > r - 1.4) b.set(x, y, z, B.DAMP_SLATE)
        }
      }
    }
    b.set(0, 13, 0, B.GOLD_BLOCK)
    // The door and its step; windows
    b.set(0, 0, 4, B.OAK_DOOR, b.facing(F.SOUTH))
    b.set(0, 1, 4, B.OAK_DOOR_UPPER, b.facing(F.SOUTH))
    b.fill(-1, 0, 5, 1, 2, 6, B.AIR)
    b.floor(-1, 5, 1, 7, -1, mix(b, 111, [[B.GRAVEL, 5], [B.STONE, 3], [B.MOSSY_STONE, 2]]))
    for (const x of [-4, 4]) {
      b.fill(x, 1, 0, x, 2, 0, B.GLASS)
      b.fill(x, 5, 0, x, 6, 0, B.IRON_BARS, b.facing(F.EAST))
    }
    b.set(0, 6, 4, B.GLASS)
    b.set(3, 6, -3, B.GLASS)
    // The earth that swallowed it, heaped around the base
    scatter(b, -7, -7, 7, 7, 0, 112, (h, x, z) => {
      const d = dist(x, z)
      if (d <= 4.5 || d > 6.6 || (Math.abs(x) <= 1 && z > 0)) return 0
      return h < 0.3 ? B.GRAVEL : h < 0.45 ? B.STONE : h < 0.5 ? B.PEBBLES : 0
    })
    // The library: shelves around the wall, a pedestal of runes
    for (let z = -3; z <= 3; z++) {
      for (let x = -3; x <= 3; x++) {
        const d = dist(x, z)
        if (d <= 2.5 || d > 3.5) continue
        if ((z >= 2 && Math.abs(x) <= 1) || (z === 0 && Math.abs(x) === 3) || (x === 0 && z === -3)) continue
        for (let y = 0; y <= 2; y++) if (b.hash(x, y, z, 113) > 0.12) b.set(x, y, z, B.ANCIENT_BOOKSHELF)
      }
    }
    b.set(0, 0, 0, B.RUNE_PEDESTAL, b.facing(FRONT))
    b.set(1, 0, 1, B.BOOK_PILE, b.facing(F.WEST))
    b.set(-1, 0, 2, B.MINERS_LANTERN)
    // The study above: bed, worktable, telescope at the window
    ladder(b, 0, -3, 0, 5, F.SOUTH)
    b.set(-2, 5, -2, B.BED_HEAD, b.facing(F.NORTH))
    b.set(-2, 5, -1, B.BED_FOOT, b.facing(F.NORTH))
    b.set(1, 5, -1, B.OAK_TABLE)
    b.set(2, 5, -1, B.OAK_TABLE)
    b.set(1, 6, -1, B.DUSTY_BOTTLES)
    b.set(2, 6, -1, B.MINERS_LANTERN)
    b.set(-2, 5, 1, B.TELESCOPE, b.facing(F.WEST))
    b.set(-1, 5, 2, B.BOOK_PILE, b.facing(FRONT))
    b.chest(2, 5, 1, F.WEST)
    hangFromCeiling(b, -3, -3, 3, 3, 0, 3, 114, (h) => (h < 0.08 ? B.COBWEB : 0))
    hangFromCeiling(b, -3, -3, 3, 3, 5, 8, 115, (h) => (h < 0.08 ? B.COBWEB : 0))
    hangFromCeiling(b, -8, -8, 8, 8, 9, 13, 116, (h) => (h < 0.08 ? B.HANGING_ROOTS : 0))
    b.keystone(0, -2, 0)
  },
}

/** A sculptor's workshop: a great face half carved from the wall, statues in every stage, scaffolding and chips. */
export const SCULPTORS_STUDIO: PoiBuildDef = {
  kind: getPoiKind('sculptors_studio'),
  radius: 9, above: 7, below: 3,
  build(b) {
    b.chamber(0, 2, -1, 8, 4, 6.5, 0, B.STONE, 0.15)
    scatter(b, -8, -7, 8, 5, -1, 121, (h) => (h < 0.22 ? B.CALCITE : h < 0.3 ? B.GRAVEL : 0), PoiBuilder.natural)
    // The relief: a face in the back wall, its left half carved smooth from calcite, the right still raw rock
    for (let y = 0; y <= 6; y++) {
      for (let x = -4; x <= 4; x++) {
        if ((x / 4.4) ** 2 + ((y - 3) / 3.6) ** 2 > 1) continue
        const raw = x > 0
        b.fill(x, y, -8, x, y, -6, raw ? (b.hash(x, y, -6, 122) < 0.25 ? B.CALCITE : B.STONE) : B.CALCITE)
        if (raw && b.hash(x, y, -5, 123) < 0.45) b.set(x, y, -5, b.hash(x, y, -5, 124) < 0.5 ? B.STONE : B.ANDESITE)
      }
    }
    b.fill(-3, 5, -5, 0, 5, -5, B.CALCITE) // brow
    b.fill(-2, 4, -7, -2, 4, -6, B.AIR) // the eye, cut deep
    b.fill(0, 2, -5, 0, 4, -5, B.CALCITE) // nose
    b.set(0, 2, -4, B.CALCITE)
    b.fill(-2, 1, -7, 0, 1, -6, B.AIR) // the mouth
    b.fill(-3, 0, -5, -1, 0, -5, B.CALCITE) // chin
    // Scaffolding over the rough half
    for (const x of [1, 4]) b.fill(x, 0, -4, x, 2, -4, B.OAK_FENCE)
    b.fill(1, 3, -5, 4, 3, -4, B.OAK_PLANKS)
    b.set(3, 4, -4, B.MINERS_LANTERN)
    // Statues: a rough block, one half carved, finished busts
    b.fill(4, 0, 0, 5, 2, 1, B.CALCITE)
    b.set(5, 2, 1, B.AIR)
    b.fill(-5, 0, -1, -4, 0, 0, B.CALCITE)
    b.fill(-5, 1, -1, -5, 2, -1, B.CALCITE)
    b.set(-5, 3, -1, B.STONE_BUST, b.facing(F.EAST))
    b.set(-4, 0, -4, B.STONE_BUST, b.facing(FRONT))
    b.set(-2, 0, -4, B.STONE_BUST, b.facing(FRONT))
    b.set(6, 0, -2, B.STONE_BUST, b.facing(F.WEST))
    // Stock and the workbench
    b.fill(5, 0, -4, 6, 1, -3, B.CALCITE)
    b.set(6, 1, -3, B.AIR)
    b.set(1, 0, 0, B.OAK_TABLE)
    b.set(2, 0, 0, B.OAK_TABLE)
    b.set(1, 1, 0, B.MINERS_LANTERN)
    b.set(2, 1, 0, B.BOOK_PILE, b.facing(FRONT))
    b.set(1, 0, 1, B.OAK_CHAIR, b.facing(F.NORTH))
    b.chest(-1, 0, -5, FRONT)
    // Chips everywhere
    scatter(b, -7, -6, 7, 4, 0, 124, (h, x, z) => {
      if (Math.abs(x) <= 1 && z > 1) return 0
      return h < 0.12 ? B.PEBBLES : h < 0.14 ? B.GRAVEL : 0
    })
    b.keystone(0, -2, -2)
  },
}

export const SACRED_KINDS: readonly PoiBuildDef[] = [FORGOTTEN_CHAPEL, STAR_CHAMBER, SANDSTONE_TOMB, SUNKEN_TOWER, SCULPTORS_STUDIO]
