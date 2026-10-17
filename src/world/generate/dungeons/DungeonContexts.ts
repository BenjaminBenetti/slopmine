import { DungeonRng, hashInts } from './DungeonRandom.ts'
import { FACE_DIR, Face, type Box, type DungeonKit, type DungeonLayout, type DungeonMarker, type LayoutInfo, type ModuleConnector, type ModuleContext, type ModuleDef, type PassContext, type PlacedModule } from './DungeonTypes.ts'
import { FrameTarget, intersectBoxes, type WorldSink } from './DungeonWriter.ts'

/**
 * Builds the contexts builders and passes draw through (shared by the
 * layout dry run and the rasterizer).
 */

const DEFAULT_DOOR: readonly [number, number] = [3, 4]

/** Rotate a cell offset inside a w×d box by r quarter turns (E→S): [x, z]. Affine, so it works outside the box too. */
export function rotateCellOffset(x: number, z: number, w: number, d: number, r: number): [number, number] {
  switch (r & 3) {
    case 1: return [d - 1 - z, x]
    case 2: return [w - 1 - x, d - 1 - z]
    case 3: return [z, w - 1 - x]
    default: return [x, z]
  }
}

class ModuleCtx extends FrameTarget implements ModuleContext {
  readonly kit: DungeonKit
  readonly layout: LayoutInfo
  readonly module: PlacedModule
  readonly def: ModuleDef
  readonly w: number
  readonly h: number
  readonly d: number
  readonly cellSize: number
  readonly floorHeight: number
  readonly level: number
  readonly depth: number
  readonly tier: number
  readonly connectors: readonly ModuleConnector[]
  readonly rng: DungeonRng

  constructor(
    layout: LayoutInfo,
    kit: DungeonKit,
    module: PlacedModule,
    sink: WorldSink | null,
    clip: Box | null,
    terrainHeight: (x: number, z: number) => number,
    markers: DungeonMarker[] | null
  ) {
    const def = module.def
    const W = def.size[0] * kit.cellSize
    const D = def.size[2] * kit.cellSize
    const writeClip = clip ? intersectBoxes(clip, module.writeBox) : null
    super({
      sink,
      clip: writeClip,
      palette: kit.palette,
      markerConfig: kit,
      terrainHeight,
      world: false,
      mx: module.box.x0,
      my: module.box.y0,
      mz: module.box.z0,
      W,
      D,
      rotation: module.rotation,
      tier: module.tier,
      moduleIndex: module.index,
      moduleId: def.id,
      markers,
    })
    this.kit = kit
    this.layout = layout
    this.module = module
    this.def = def
    this.w = W
    this.h = def.size[1] * kit.floorHeight
    this.d = D
    this.cellSize = kit.cellSize
    this.floorHeight = kit.floorHeight
    this.level = module.cell[1]
    this.depth = module.depth
    this.tier = module.tier
    this.connectors = module.connectors.map((c) => ({
      ...c.def,
      index: c.index,
      open: c.exterior || c.joined >= 0,
      joinedModule: c.joined,
    }))
    this.rng = new DungeonRng(hashInts(layout.anchorX, layout.anchorZ, layout.seed ^ layout.salt, 0x4d0d + module.index))
  }

  hasTag(tag: string): boolean {
    return this.def.tags !== undefined && this.def.tags.includes(tag)
  }

  isCellOccupied(cx: number, cy: number, cz: number): boolean {
    const [rx, rz] = rotateCellOffset(cx, cz, this.def.size[0], this.def.size[2], this.module.rotation)
    return this.layout.moduleAt(this.module.cell[0] + rx, this.module.cell[1] + cy, this.module.cell[2] + rz) >= 0
  }

  isOuterFace(cx: number, cy: number, cz: number, face: Face): boolean {
    const [dx, dy, dz] = FACE_DIR[face]
    return !this.isCellOccupied(cx + dx, cy + dy, cz + dz)
  }

  doorwayBox(connector: ModuleConnector): Box {
    return doorwayBox(this.kit, this.def, connector)
  }
}

/** Module-local doorway box of a connector (canonical orientation). */
export function doorwayBox(kit: DungeonKit, def: ModuleDef, connector: { cell: readonly [number, number, number]; face: Face }): Box {
  const [dw, dh] = kit.door ?? DEFAULT_DOOR
  const cs = kit.cellSize
  const fh = kit.floorHeight
  const W = def.size[0] * cs
  const D = def.size[2] * cs
  const [cx, cy, cz] = connector.cell
  const floorY = cy * fh
  const off = Math.floor((cs - dw) / 2)
  const xa = cx * cs + off
  const za = cz * cs + off
  switch (connector.face) {
    case Face.East:
      return { x0: W - 1, x1: W - 1, y0: floorY + 1, y1: floorY + dh, z0: za, z1: za + dw - 1 }
    case Face.West:
      return { x0: 0, x1: 0, y0: floorY + 1, y1: floorY + dh, z0: za, z1: za + dw - 1 }
    case Face.South:
      return { x0: xa, x1: xa + dw - 1, y0: floorY + 1, y1: floorY + dh, z0: D - 1, z1: D - 1 }
    case Face.North:
      return { x0: xa, x1: xa + dw - 1, y0: floorY + 1, y1: floorY + dh, z0: 0, z1: 0 }
    case Face.Up:
    case Face.Down: {
      // Shaft hole: `shaftSize` (default 1) square, centred on the cell (rotation-invariant)
      const sw = kit.shaftSize ?? 1
      const so = Math.floor((cs - sw) / 2)
      const sx = cx * cs + so
      const sz = cz * cs + so
      const y = connector.face === Face.Up ? floorY + fh - 1 : floorY
      return { x0: sx, x1: sx + sw - 1, y0: y, y1: y, z0: sz, z1: sz + sw - 1 }
    }
    default:
      return { x0: xa, x1: xa + dw - 1, y0: floorY + 1, y1: floorY + dh, z0: za, z1: za + dw - 1 }
  }
}

/** The context a module builder draws through. */
export function buildModuleContext(
  layout: LayoutInfo,
  kit: DungeonKit,
  module: PlacedModule,
  sink: WorldSink | null,
  clip: Box | null,
  terrainHeight: (x: number, z: number) => number,
  markers: DungeonMarker[] | null
): ModuleContext {
  return new ModuleCtx(layout, kit, module, sink, clip, terrainHeight, markers)
}

class PassCtx extends FrameTarget implements PassContext {
  readonly kit: DungeonKit
  readonly layout: DungeonLayout
  readonly rng: DungeonRng
  private readonly heightFn: (x: number, z: number) => number

  constructor(
    layout: DungeonLayout,
    kit: DungeonKit,
    pass: number,
    sink: WorldSink | null,
    clip: Box | null,
    terrainHeight: (x: number, z: number) => number,
    markers: DungeonMarker[] | null
  ) {
    const passClip = clip ? intersectBoxes(clip, layout.passBox) : null
    super({
      sink,
      clip: passClip,
      palette: kit.palette,
      markerConfig: kit,
      terrainHeight,
      world: true,
      tier: 0,
      moduleIndex: -1,
      moduleId: pass === 1 ? 'pass:foundation' : 'pass:exterior',
      markers,
    })
    this.kit = kit
    this.layout = layout
    this.heightFn = terrainHeight
    this.rng = new DungeonRng(hashInts(layout.anchorX, layout.anchorZ, layout.seed ^ layout.salt, 0x9a55 + pass))
  }

  terrainHeight(x: number, z: number): number {
    return this.heightFn(x, z)
  }
}

/** Run the kit's foundation or exterior pass (dry run when sink is null). */
export function runPass(
  layout: DungeonLayout,
  kit: DungeonKit,
  which: 'foundation' | 'exterior',
  sink: WorldSink | null,
  clip: Box | null,
  terrainHeight: (x: number, z: number) => number,
  markers: DungeonMarker[] | null
): void {
  const ctx = new PassCtx(layout, kit, which === 'foundation' ? 1 : 2, sink, clip, terrainHeight, markers)
  if (sink && !ctx.clip) return
  if (which === 'foundation') (kit.foundation ?? defaultFoundationPass)(ctx)
  else kit.exterior?.(ctx)
}

/**
 * Default foundation pass: under every module whose bottom level is 0 or
 * above and that touches level 0, fill from the terrain surface up to the
 * module's floor with palette 'foundation' (if the palette has one).
 */
export function defaultFoundationPass(ctx: PassContext): void {
  if (ctx.kit.palette.foundation === undefined) return
  foundationUnderModules(ctx, 'foundation', (m) => m.cell[1] === 0)
}

/**
 * Fill each column under the selected modules from the terrain surface up to
 * the module floor (exclusive), within the current clip only.
 */
export function foundationUnderModules(
  ctx: PassContext,
  material: string | number,
  select: (module: PlacedModule) => boolean
): void {
  const clip = ctx.clip
  if (!clip) return
  const minY = ctx.layout.passBox.y0
  for (const m of ctx.layout.modules) {
    if (!select(m)) continue
    const x0 = Math.max(m.box.x0, clip.x0)
    const x1 = Math.min(m.box.x1, clip.x1)
    const z0 = Math.max(m.box.z0, clip.z0)
    const z1 = Math.min(m.box.z1, clip.z1)
    if (x0 > x1 || z0 > z1 || clip.y0 >= m.box.y0) continue
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const top = m.box.y0 - 1
        const bottom = Math.max(minY, ctx.terrainHeight(x, z) + 1)
        if (bottom <= top) ctx.fill(x, bottom, z, x, top, z, material)
      }
    }
  }
}
