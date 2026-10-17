/**
 * Procedural dungeon framework - core types.
 *
 * A KIT (DungeonKit) is a set of MODULES (ModuleDef) on a 3D cell grid plus
 * a palette and whole-structure passes. The layout generator grows a castle
 * from an entrance module along open CONNECTORS; the rasterizer writes it
 * into sub-chunks. Worker-safe: no DOM, no three.js, no main-thread state.
 *
 * Coordinates:
 * - CELL space: integer (x, level, z) cells relative to the anchor cell;
 *   a cell is `cellSize` blocks wide and `floorHeight` blocks tall.
 * - MODULE-LOCAL block space (what builders draw in): the module's canonical
 *   (unrotated) box, x in [0, w), y in [0, h), z in [0, d) blocks, y = 0 is
 *   the bottom level's floor. Rotation is applied by the writer: draw the
 *   module as if rotation 0; faces, connectors and facing metadata follow.
 * - WORLD space: absolute block coordinates (passes draw here).
 */

import type { DungeonRng } from './DungeonRandom.ts'

/** Horizontal faces rotate (face + r) % 4; Up/Down never rotate. */
export const Face = {
  East: 0, // +X
  South: 1, // +Z
  West: 2, // -X
  North: 3, // -Z
  Up: 4, // +Y
  Down: 5, // -Y
} as const
export type Face = (typeof Face)[keyof typeof Face]

/** Unit step of a face in cell/block space: [dx, dy, dz]. */
export const FACE_DIR: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
]

export function oppositeFace(face: Face): Face {
  return (face < 4 ? (face + 2) % 4 : face === Face.Up ? Face.Down : Face.Up) as Face
}

export function rotateFace(face: Face, rotation: number): Face {
  return (face < 4 ? (face + rotation) % 4 : face) as Face
}

/** A block to write: an id, a palette material name, or a function of the module-local (pass: world) position. */
export type BlockSpec = number | string | ((x: number, y: number, z: number) => number | string)

/** Inclusive integer box. */
export interface Box {
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/**
 * A palette material: one block id, or weighted variants picked per world
 * position (deterministic, seam-safe) - e.g. 70 % bricks, 20 % cracked, 10 % mossy.
 */
export type PaletteEntry = number | ReadonlyArray<readonly [blockId: number, weight: number]>

/**
 * Named materials. Names are the kit's own, except these conventions used by
 * framework helpers: 'foundation' (foundation pass), 'light' (ctx.light),
 * 'air' is always AIR.
 */
export type DungeonPalette = Readonly<Record<string, PaletteEntry>>

// ---------------------------------------------------------------------------
// Modules and connectors
// ---------------------------------------------------------------------------

export interface ConnectorDef {
  /** Cell inside the module, canonical orientation: [x, level, z] (0-based). */
  readonly cell: readonly [number, number, number]
  /** Face of that cell the opening is on. */
  readonly face: Face
  /** Compatibility class: only connectors of the same kind join. Default 'door'. */
  readonly kind?: string
  /**
   * Opening to the outside world (the entrance gate): never joined to a
   * module, never capped, always open. Entrance modules need one; the
   * layout puts it on the grid edge facing outward.
   */
  readonly exterior?: boolean
}

/** A connector as the builder sees it (module-local, canonical orientation). */
export interface ModuleConnector extends ConnectorDef {
  /** Index in the def's `connectors`. */
  readonly index: number
  /** Joined to another module (or exterior) - carve the doorway. Closed: build a wall. */
  readonly open: boolean
  /** Index of the joined module (-1 for exterior/closed). */
  readonly joinedModule: number
}

export interface ModuleDef {
  /** Unique within the kit. */
  readonly id: string
  /** Size in cells, canonical orientation: [x (width), levels, z (depth)]. */
  readonly size: readonly [number, number, number]
  readonly connectors: readonly ConnectorDef[]
  /**
   * Roles: 'entrance' (layout root, needs an exterior connector), 'boss'
   * (guardian arena, placed at/near the deepest point), 'cap' (dead-end
   * used to close spare connectors), plus any kit tags ('vault',
   * 'garrison', 'room', 'corridor', 'stairs', 'tower', ...) used by
   * `DungeonKit.require` and builders.
   */
  readonly tags?: readonly string[]
  /** Relative pick weight during growth. Default 1. */
  readonly weight?: number
  /** At least this many in every castle (guaranteed by retries; the def is boosted while short). */
  readonly minCount?: number
  /** At most this many. */
  readonly maxCount?: number
  /** Path depth (modules from the entrance) limits for placement. */
  readonly minDepth?: number
  readonly maxDepth?: number
  /** Allowed bottom level range (default: the kit's levels). Negative = underground. */
  readonly levels?: readonly [number, number]
  /** Allowed rotations (quarter turns). Default [0, 1, 2, 3]. */
  readonly rotations?: readonly number[]
  /**
   * Blocks the builder may draw OUTSIDE its cell box (roofs, spires, eaves,
   * foundations). Writes beyond box + overhang are dropped (seam safety).
   */
  readonly overhang?: { readonly up?: number; readonly down?: number; readonly side?: number }
  /** Draw the module (see ModuleContext). Must be a pure function of ctx. */
  build(ctx: ModuleContext): void
}

// ---------------------------------------------------------------------------
// Kit
// ---------------------------------------------------------------------------

export interface DungeonRequirement {
  /** Module tag that must appear... */
  readonly tag: string
  /** ...at least this many times. */
  readonly count: number
}

export interface DungeonKit {
  /** Unique id (ProceduralDungeonFeature config `kitId`). */
  readonly id: string
  /** Blocks per cell horizontally (e.g. 9: a 3-wide door centred in a 7-block room between 1-block walls). */
  readonly cellSize: number
  /** Blocks per level (floor block + interior + ceiling block, e.g. 7). */
  readonly floorHeight: number
  /** Max cells from the anchor cell in x/z: the grid is (2r+1)² cells. */
  readonly gridRadius: number
  /** Level range [min, max]; level 0's floor is the castle base Y. Negative levels are underground. */
  readonly levels: readonly [number, number]
  /** Absolute Y limits for any module block (e.g. Hell: [4, 136] under the basalt ceiling). */
  readonly worldYRange?: readonly [number, number]
  readonly modules: readonly ModuleDef[]
  /** Module count target [min, max] (requirements included). */
  readonly targetModules: readonly [number, number]
  /** Required module tags (the boss and an entrance are always required). */
  readonly require?: readonly DungeonRequirement[]
  readonly palette: DungeonPalette
  /** Doorway size for horizontal connectors (width, height). Default [3, 4]. */
  readonly door?: readonly [number, number]
  /** Hole size of Up/Down connectors (square, centred on the cell). Default 1 (a ladder shaft). */
  readonly shaftSize?: number
  /**
   * Loot-tier signature blocks, index = tier (0 = near the entrance ... 3 =
   * deepest/vaults). `ctx.chest()` puts the tier's block directly under the
   * chest, so a chest loot table can key on it with `signatureRadius: 1`.
   */
  readonly lootTierBlocks?: readonly number[]
  /**
   * Blocks beyond the module boxes that kit passes may draw on (curtain
   * walls, towers, the approach path). Pass writes beyond are DROPPED - make
   * it cover everything your passes draw. Default 8.
   */
  readonly exteriorMargin?: number
  /** How far below the base Y foundations may reach (and the pass bounds go). Default 48. */
  readonly foundationDepth?: number
  /** How far above the highest module the exterior pass may draw (spires). Default 16. */
  readonly exteriorHeight?: number
  /** Layout attempts before the deterministic fallback. Default 24. */
  readonly maxAttempts?: number
  /** Minimum boss path depth as a fraction of the deepest module's depth. Default 0.75. */
  readonly bossDepthFraction?: number
  /**
   * Floor Y of level 0 (the castle base). Default: median terrain height
   * over the footprint (the floor replaces the surface block), clamped to
   * `baseYRange`. Must be a pure function of its inputs.
   */
  baseY?(ctx: BaseYContext): number
  /** Clamp for the base Y. */
  readonly baseYRange?: readonly [number, number]
  /** Loot tier 0-3 of a placed module (default: depth-based, +1 for 'vault', 3 for 'boss'). */
  tierFor?(module: PlacedModule, layout: LayoutInfo): number
  /**
   * Whole-structure pre-pass (world space), before any module: meet the
   * terrain - foundations, plateau cuts, platforms. Default:
   * `defaultFoundationPass` (palette 'foundation' under level-0 modules).
   */
  foundation?(ctx: PassContext): void
  /** Whole-structure post-pass (world space), after all modules: curtain walls, towers, approach, lights. */
  exterior?(ctx: PassContext): void
}

export interface BaseYContext {
  readonly anchorX: number
  readonly anchorZ: number
  /** Half-size of the module grid in blocks. */
  readonly radius: number
  /** Pure terrain height at a world column. */
  terrainHeight(x: number, z: number): number
}

// ---------------------------------------------------------------------------
// Layout (output of the generator)
// ---------------------------------------------------------------------------

export interface PlacedConnector {
  readonly def: ConnectorDef
  readonly index: number
  /** Cell (grid space) the connector sits on, and its rotated face. */
  readonly cell: readonly [number, number, number]
  readonly face: Face
  readonly kind: string
  readonly exterior: boolean
  /** Joined module index, -1 when closed or exterior. */
  joined: number
}

export interface PlacedModule {
  readonly index: number
  readonly def: ModuleDef
  /** Min corner cell of the rotated box (grid space). */
  readonly cell: readonly [number, number, number]
  /** Rotated size in cells [x, levels, z]. */
  readonly size: readonly [number, number, number]
  readonly rotation: number
  readonly connectors: PlacedConnector[]
  /** Modules from the entrance along joined connectors (entrance = 0). */
  depth: number
  /** Loot tier 0-3. */
  tier: number
  /** World block box of the cells. */
  readonly box: Box
  /** World block box the builder may write (box + overhang). */
  readonly writeBox: Box
}

export type MarkerType = 'chest' | 'garrison' | 'guardian' | 'light'

export interface DungeonMarker {
  readonly type: MarkerType
  readonly x: number
  readonly y: number
  readonly z: number
  /** Chest: loot tier. Garrison/guardian: metadata index. */
  readonly value: number
  /** Module that placed it (-1: a pass). */
  readonly module: number
}

/** What builders and passes may know about the whole layout. */
export interface LayoutInfo {
  readonly kitId: string
  readonly seed: number
  readonly salt: number
  readonly anchorX: number
  readonly anchorZ: number
  /** Floor Y of level 0. */
  readonly baseY: number
  /** World block of cell (0, 0, 0)'s min corner (x, z) and baseY. */
  readonly originX: number
  readonly originZ: number
  readonly cellSize: number
  readonly floorHeight: number
  readonly modules: readonly PlacedModule[]
  readonly maxDepth: number
  /** Module index occupying a grid cell, or -1. */
  moduleAt(cx: number, level: number, cz: number): number
}

export interface DungeonLayout extends LayoutInfo {
  /** Union of every write box and the pass bounds (world). */
  readonly bounds: Box
  /** Pass bounds: module footprint + exterior margin, foundation depth below, exterior height above. */
  readonly passBox: Box
  /** Module index of the entrance, and the world block just outside its exterior opening (floor level). */
  readonly entrance: { readonly module: number; readonly x: number; readonly y: number; readonly z: number; readonly face: Face }
  /** Guardian spawner position (first guardian marker), or the boss module centre, or null. */
  readonly boss: { readonly x: number; readonly y: number; readonly z: number } | null
  readonly markers: readonly DungeonMarker[]
  /** Generation attempts used (1 = first try) and whether the deterministic fallback was used. */
  readonly attempts: number
  readonly fallback: boolean
  /** Layout generation time in ms (diagnostics). */
  readonly genMs: number
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/**
 * Where builders and passes draw. Coordinates are module-local (builders)
 * or world (passes). Writes outside the current sub-chunk and outside the
 * module's write box are dropped silently - draw the whole module every
 * time; never branch on what was or wasn't written.
 */
export interface DrawTarget {
  /** World box this call may write (the current sub-chunk ∩ the write box); null in a dry run. */
  readonly clip: Box | null
  /** Layout-time dry run: nothing is written, only markers are recorded - skip expensive drawing. */
  readonly dryRun: boolean
  /** Write one block (palette materials resolve per world position). */
  set(x: number, y: number, z: number, block: BlockSpec, meta?: number): void
  /** Write only where the cell currently holds a block accepted by `test` (it sees this cell only - seam-safe). */
  setIf(x: number, y: number, z: number, block: BlockSpec, test: (currentId: number) => boolean, meta?: number): void
  /**
   * Fill an inclusive box. Ranges must be ordered (x0 ≤ x1, y0 ≤ y1, z0 ≤ z1): an inverted
   * range writes NOTHING (never swapped; dev builds warn once per call site) - so a range
   * clamped to the clip that came out empty stays empty.
   */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: BlockSpec, meta?: number): void
  /** Fill only the cells of a box whose current block passes `test`. */
  fillIf(
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
    block: BlockSpec, test: (currentId: number) => boolean, meta?: number
  ): void
  /** Facing metadata (BlockFacing) in this target's frame → world facing (rotated for modules). */
  facing(blockFacing: number): number
  /** Terrain surface height at a column in this target's frame, returned in this frame's Y. */
  terrainY(x: number, z: number): number
  /** Deterministic [0, 1) per position in this frame (world-anchored: seam-safe). */
  hash(x: number, y: number, z: number, salt?: number): number
}

export interface ChestOptions {
  /** Loot tier (default: the module's tier). */
  readonly tier?: number
  /** BlockFacing the chest's front faces (default SOUTH, in the module's frame). */
  readonly facing?: number
  /** Put the tier signature block under the chest (default true). */
  readonly signature?: boolean
}

/** Marker helpers shared by ModuleContext and PassContext. */
export interface MarkerTarget {
  /** A worldgen chest (loot filled on first open), tier signature block below it. */
  chest(x: number, y: number, z: number, options?: ChestOptions): void
  /** A garrison spawner (metadata = garrison index; see src/dungeons/GarrisonRegistry.ts). */
  garrison(x: number, y: number, z: number, index: number): void
  /** The guardian spawner (metadata = guardian index; see src/dungeons/GuardianRegistry.ts). */
  guardian(x: number, y: number, z: number, index: number): void
  /** A light source (palette 'light', default TORCH). */
  light(x: number, y: number, z: number, block?: BlockSpec): void
}

export interface ModuleContext extends DrawTarget, MarkerTarget {
  readonly kit: DungeonKit
  readonly layout: LayoutInfo
  readonly module: PlacedModule
  readonly def: ModuleDef
  /** Canonical block size of the module box: width (x), height (y), depth (z). */
  readonly w: number
  readonly h: number
  readonly d: number
  readonly cellSize: number
  readonly floorHeight: number
  /** Bottom level of the module (grid level). */
  readonly level: number
  readonly depth: number
  readonly tier: number
  readonly rotation: number
  /** Every connector with its open/closed state, canonical orientation. */
  readonly connectors: readonly ModuleConnector[]
  /** Fresh per build call, seeded by the layout and module index: consume it identically every call. */
  readonly rng: DungeonRng
  /** Has the module a tag? */
  hasTag(tag: string): boolean
  /**
   * Grid occupancy relative to this module, canonical orientation: cell
   * (cx, cy, cz) of the module's own cell grid (may be outside 0..size-1),
   * e.g. isCellOccupied(0, size[1], 0) = is something built above my first cell.
   */
  isCellOccupied(cx: number, cy: number, cz: number): boolean
  /** True if the face of one of my cells borders no module (outside wall: windows, buttresses). */
  isOuterFace(cx: number, cy: number, cz: number, face: Face): boolean
  /** Module-local doorway box of a connector (on the wall plane; up/down: a hole in ceiling/floor). */
  doorwayBox(connector: ModuleConnector): Box
}

export interface PassContext extends DrawTarget, MarkerTarget {
  readonly kit: DungeonKit
  readonly layout: DungeonLayout
  /** Pure terrain height (world column). */
  terrainHeight(x: number, z: number): number
  /** Fresh per pass call, seeded by the layout. */
  readonly rng: DungeonRng
}
