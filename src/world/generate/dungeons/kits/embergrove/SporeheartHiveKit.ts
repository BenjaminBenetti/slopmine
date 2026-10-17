import { BlockIds } from '../../../../blocks/BlockIds.ts'
import { Face, FACE_DIR, type DungeonKit, type DungeonLayout, type PassContext, type PlacedModule } from '../../DungeonTypes.ts'
import { BlockFacing } from '../../../../blocks/BlockFacing.ts'
import { arch, foundationColumn } from '../../DungeonBuild.ts'
import { registerDungeonKit } from '../../DungeonKitRegistry.ts'
import { SPOREHEART_HIVE } from './hiveConstants.ts'
import { CS, FH } from './hiveShapes.ts'
import { HIVE_MODULES } from './hiveModules.ts'

/**
 * SPOREHEART HIVE - the Ember Grove's procedural dungeon.
 *
 * A colossal fungal mound of woven roots, speckled with glowing spore sacs,
 * buttress roots arching down into the mycelium, crowned by a colossal
 * crown fungus (and one or two smaller ones on its lobes) that glows across
 * the forest. A root arch leads in through the mound; inside, the hive
 * descends from the ground level through root tunnels, ramps, nurseries,
 * brood chambers, gill galleries, sap cisterns and root bridges to the
 * Sporemother's throne at the deepest point (level -2), with sap vaults
 * hidden behind root lattice grates and a crown gallery high under the cap.
 *
 * Passes: the foundation pass grows the mound over every ground-level
 * module (modules then hollow out their rooms - between them the mound
 * stays solid root); the exterior pass cuts the approach, raises the root
 * arch gateway, buttress roots and the crown fungi.
 */

const APPROACH_LENGTH = 26
/** How far the mound reaches beyond the ground-level modules. */
const MOUND_MARGIN = 5
/** Crown fungi must stay below the Hell layer boundary (Y 128). */
const CROWN_TOP_LIMIT = 124

const palette = {
  wall: [
    [BlockIds.HIVE_ROOTBRICK, 6],
    [BlockIds.OVERGROWN_ROOTBRICK, 3],
    [BlockIds.HIVE_ROOT, 1],
  ],
  mass: [
    [BlockIds.HIVE_ROOT, 7],
    [BlockIds.HIVE_ROOTBRICK, 2],
    [BlockIds.OVERGROWN_ROOTBRICK, 1],
  ],
  floor: [
    [BlockIds.MYCELIAL_CARPET, 6],
    [BlockIds.HIVE_ROOTBRICK, 2],
    [BlockIds.OVERGROWN_ROOTBRICK, 2],
  ],
  rib: [
    [BlockIds.ROOT_PILLAR, 3],
    [BlockIds.HIVE_ROOT, 2],
  ],
  pillar: BlockIds.ROOT_PILLAR,
  comb: [
    [BlockIds.BROOD_COMB, 8],
    [BlockIds.HIVE_MEMBRANE, 1],
  ],
  membrane: BlockIds.HIVE_MEMBRANE,
  gill: BlockIds.GILL_WALL,
  chitin: BlockIds.CHITIN_PLATE,
  chitinWall: [
    [BlockIds.CHITIN_PLATE, 5],
    [BlockIds.HIVE_ROOTBRICK, 3],
    [BlockIds.OVERGROWN_ROOTBRICK, 1],
  ],
  sap: BlockIds.GLOWING_SAP,
  lattice: BlockIds.ROOT_LATTICE,
  sac: BlockIds.SPORE_SAC,
  path: [
    [BlockIds.HIVE_ROOTBRICK, 7],
    [BlockIds.MYCELIAL_CARPET, 3],
  ],
  foundation: BlockIds.HIVE_ROOT,
  light: BlockIds.GLOW_BULB,
} as const

// ---------------------------------------------------------------------------
// The mound
// ---------------------------------------------------------------------------

interface MoundShape {
  readonly cx: number
  readonly cz: number
  readonly rx: number
  readonly rz: number
  /** Height of the dome summit above the base Y. */
  readonly rise: number
  readonly lobeA: number
  readonly lobeB: number
  /** Every module: none may poke out of the ground or the mound (cover lumps where the ground dips). */
  readonly covered: readonly PlacedModule[]
}

const moundCache = new WeakMap<DungeonLayout, MoundShape>()

/** Would an underground module stick out of the ground somewhere (a dip in the terrain over it)? */
function exposed(m: PlacedModule, terrainHeight: (x: number, z: number) => number): boolean {
  const b = m.box
  for (const x of [b.x0, (b.x0 + b.x1) >> 1, b.x1]) {
    for (const z of [b.z0, (b.z0 + b.z1) >> 1, b.z1]) if (terrainHeight(x, z) < b.y1 + 3) return true
  }
  return false
}

function moundShape(L: DungeonLayout, terrainHeight: (x: number, z: number) => number): MoundShape {
  let shape = moundCache.get(L)
  if (shape) return shape
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, top = L.baseY
  const covered: PlacedModule[] = []
  for (const m of L.modules) {
    // The dome spans the ground-level rooms and any underground room the terrain leaves bare
    if (m.cell[1] + m.size[1] <= 0 && !exposed(m, terrainHeight)) continue
    covered.push(m)
    x0 = Math.min(x0, m.box.x0)
    z0 = Math.min(z0, m.box.z0)
    x1 = Math.max(x1, m.box.x1)
    z1 = Math.max(z1, m.box.z1)
    top = Math.max(top, m.box.y1)
  }
  if (covered.length === 0) {
    x0 = L.anchorX - CS
    x1 = L.anchorX + CS
    z0 = L.anchorZ - CS
    z1 = L.anchorZ + CS
  }
  const seedA = ((L.seed ^ L.anchorX * 73856093 ^ L.anchorZ * 19349663) >>> 0) % 6283
  shape = {
    cx: (x0 + x1) / 2,
    cz: (z0 + z1) / 2,
    rx: (x1 - x0) / 2 + MOUND_MARGIN,
    rz: (z1 - z0) / 2 + MOUND_MARGIN,
    // A tall skep-like dome (always 9+ blocks over the highest room)
    rise: Math.max(top - L.baseY + 9, Math.min(34, 0.5 * Math.min((x1 - x0) / 2, (z1 - z0) / 2) + 6)),
    lobeA: seedA / 1000,
    lobeB: (seedA * 7) % 6283 / 1000,
    covered: L.modules,
  }
  moundCache.set(L, shape)
  return shape
}

/** How far buttress roots reach beyond the mound's radii. */
const BUTTRESS_REACH = 10

/** Where a hive stands on the surface (other features keep clear of it). */
export interface HiveFootprint {
  /** Mound centre and radii, buttress roots and lobes included (superellipse, exponent 2.4). */
  readonly cx: number
  readonly cz: number
  readonly rx: number
  readonly rz: number
  /** The approach: from the gate (just outside the entrance) along (dirX, dirZ) for `approach` blocks. */
  readonly gateX: number
  readonly gateZ: number
  readonly dirX: number
  readonly dirZ: number
  readonly approach: number
}

export function sporeheartHiveFootprint(L: DungeonLayout, terrainHeight: (x: number, z: number) => number): HiveFootprint {
  const s = moundShape(L, terrainHeight)
  const [dx, , dz] = FACE_DIR[L.entrance.face]
  return {
    cx: s.cx,
    cz: s.cz,
    rx: s.rx * 1.12 + BUTTRESS_REACH,
    rz: s.rz * 1.12 + BUTTRESS_REACH,
    gateX: L.entrance.x,
    gateZ: L.entrance.z,
    dirX: dx,
    dirZ: dz,
    approach: APPROACH_LENGTH,
  }
}

/** Mound surface Y at a column (or -Infinity outside the mound). */
function moundTop(L: DungeonLayout, s: MoundShape, x: number, z: number): number {
  const u = (x - s.cx) / s.rx
  const v = (z - s.cz) / s.rz
  const theta = Math.atan2(v, u)
  const lobe = 1 + 0.07 * Math.sin(3 * theta + s.lobeA) + 0.05 * Math.sin(5 * theta + s.lobeB)
  const dd = Math.pow(Math.pow(Math.abs(u), 2.4) + Math.pow(Math.abs(v), 2.4), 1 / 2.4) / lobe
  let top = -Infinity
  if (dd < 1) {
    // Beehive profile (steep flanks, rounded crown) with soft knobbly bumps
    top = L.baseY + s.rise * Math.pow(1 - Math.pow(dd, 2.2), 0.6) + (valueNoise(x / 8, z / 8, 3) * 4 - 2) * (1 - dd)
  }
  // Every module stays buried: rounded root lumps over rooms the dome or the ground leave bare
  for (const m of s.covered) {
    if (x < m.box.x0 - 3 || x > m.box.x1 + 3 || z < m.box.z0 - 3 || z > m.box.z1 + 3) continue
    const ex = Math.max(m.box.x0 - x, x - m.box.x1, 0)
    const ez = Math.max(m.box.z0 - z, z - m.box.z1, 0)
    const edge = Math.hypot(ex, ez)
    if (edge > 3) continue
    const swell = hash3(x >> 2, m.index, z >> 2, 5) < 0.5 ? 1 : 0
    top = Math.max(top, m.box.y1 + 2 + swell - edge * 1.2)
  }
  return Math.floor(top)
}

/** Woven root skin, speckled with glowing sacs and gill patches. */
function skin(x: number, y: number, z: number): number {
  const h = hash3(x, y, z, 7)
  if (h < 0.004) return BlockIds.SPORE_SAC
  if (h < 0.04) return BlockIds.EMBER_GILLS
  if (h < 0.1) return BlockIds.OVERGROWN_ROOTBRICK
  return BlockIds.HIVE_ROOT
}

/** Smooth 2D value noise in [0, 1) (bilinear over a hashed integer lattice; world-anchored). */
function valueNoise(x: number, z: number, salt: number): number {
  const ix = Math.floor(x), iz = Math.floor(z)
  const fx = x - ix, fz = z - iz
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz)
  const a = hash3(ix, 0, iz, salt), b = hash3(ix + 1, 0, iz, salt)
  const c = hash3(ix, 0, iz + 1, salt), d = hash3(ix + 1, 0, iz + 1, salt)
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz
}

function hash3(x: number, y: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1610612741) ^ Math.imul(salt, 1013904223)
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Foundation pass: the mound over every ground/upper module (rooms are carved into it afterwards). */
function foundationPass(ctx: PassContext): void {
  const clip = ctx.clip
  if (!clip || ctx.dryRun) return
  const L = ctx.layout
  const s = moundShape(L, (x, z) => ctx.terrainHeight(x, z))
  const decor = (id: number): boolean => id === BlockIds.AIR || id === BlockIds.GLOWCAP || id === BlockIds.CRIMSON_SPROUTS
  // Woven coils: a band of root brick every 5 blocks up the flanks (like a straw skep)
  const coil = (_x: number, y: number, _z: number): number | string =>
    (y - L.baseY) % 5 === 0 && y > L.baseY ? BlockIds.HIVE_ROOTBRICK : 'mass'
  for (let x = clip.x0; x <= clip.x1; x++) {
    for (let z = clip.z0; z <= clip.z1; z++) {
      const top = moundTop(L, s, x, z)
      if (top === -Infinity) continue
      const ground = ctx.terrainHeight(x, z)
      if (top <= ground) continue
      const y0 = Math.max(ground + 1, clip.y0)
      const y1 = Math.min(top, clip.y1)
      if (y0 > y1) continue
      if (y1 === top) {
        if (y0 < top) ctx.fill(x, y0, z, x, top - 1, z, coil)
        ctx.set(x, top, z, (top - L.baseY) % 5 === 0 ? BlockIds.HIVE_ROOTBRICK : skin(x, top, z))
        // Sprouts and the odd glowcap on the skin
        const g = hash3(x, top + 1, z, 9)
        if (top + 1 <= clip.y1) {
          if (g < 0.005) ctx.setIf(x, top + 1, z, BlockIds.GLOWCAP, decor)
          else if (g < 0.03) ctx.setIf(x, top + 1, z, BlockIds.CRIMSON_SPROUTS, decor)
        }
      } else {
        ctx.fill(x, y0, z, x, y1, z, coil)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Exterior: approach, root arch, buttresses, crown fungi
// ---------------------------------------------------------------------------

/** The approach corridor (entrance outwards, 7 wide): buttresses and crown fungi never grow into it. */
function inApproach(L: DungeonLayout, x: number, y: number, z: number): boolean {
  const e = L.entrance
  const [dx, , dz] = FACE_DIR[e.face]
  const along = (x - e.x) * dx + (z - e.z) * dz
  if (along < -1 || along > APPROACH_LENGTH + 2) return false
  const lat = dx !== 0 ? z - e.z : x - e.x
  return lat >= -3 && lat <= 3 && y >= e.y - APPROACH_LENGTH - 2 && y <= e.y + APPROACH_LENGTH + 8
}

/** Does the mound rise over the ground anywhere across the approach (5 wide) at this step? */
function moundOver(ctx: PassContext, s: MoundShape, x: number, z: number): boolean {
  const e = ctx.layout.entrance
  const alongX = e.face === Face.North || e.face === Face.South
  for (let k = -3; k <= 3; k++) {
    const gx = alongX ? x + k : x
    const gz = alongX ? z : z + k
    if (moundTop(ctx.layout, s, gx, gz) > ctx.terrainHeight(gx, gz)) return true
  }
  return false
}

/**
 * The approach (like the framework's `approach()`, but it keeps going until
 * it is out of the mound as well as level with the ground): a 5-wide path
 * of root brick and mycelium from the gate, rising/falling one block per
 * step with emberwood stairs, root mass under causeways, a 4-high tunnel
 * through the mound. Returns the path level per step.
 */
function hiveApproach(ctx: PassContext, s: MoundShape): number[] {
  const L = ctx.layout
  const e = L.entrance
  const dir = e.face
  const [dx, , dz] = FACE_DIR[dir]
  const half = 2
  const levels: number[] = []
  let level = L.baseY
  for (let i = 0; i < APPROACH_LENGTH; i++) {
    const px = e.x + dx * i
    const pz = e.z + dz * i
    let ground = -Infinity
    for (let k = -half; k <= half; k++) ground = Math.max(ground, ctx.terrainHeight(px + (dz !== 0 ? k : 0), pz + (dx !== 0 ? k : 0)))
    if (i > 0) {
      if (ground < level) level = Math.max(ground, level - 1)
      else if (ground > level) level = Math.min(ground, level + 1)
    }
    levels.push(level)
    if (i > 2 && ground === level && !moundOver(ctx, s, px, pz)) break
  }
  const toward = facingMeta(dir) // stairs climbing back toward the gate
  const away = facingMeta(OPPOSITE[dir]) // stairs climbing out of a trench
  for (let i = 0; i < levels.length; i++) {
    const lv = levels[i]
    for (let k = -half; k <= half; k++) {
      const gx = e.x + dx * i + (dz !== 0 ? k : 0)
      const gz = e.z + dz * i + (dx !== 0 ? k : 0)
      foundationColumn(ctx, gx, gz, lv, 'mass', 48)
      ctx.set(gx, lv, gz, 'path')
      ctx.fill(gx, lv + 1, gz, gx, lv + 4, gz, BlockIds.AIR)
      if (i > 0 && lv === levels[i - 1] - 1) ctx.set(gx, lv + 1, gz, BlockIds.EMBERWOOD_STAIRS, ctx.facing(toward))
    }
    if (i > 0 && lv === levels[i - 1] + 1) {
      for (let k = -half; k <= half; k++) {
        const gx = e.x + dx * (i - 1) + (dz !== 0 ? k : 0)
        const gz = e.z + dz * (i - 1) + (dx !== 0 ? k : 0)
        ctx.set(gx, lv, gz, BlockIds.EMBERWOOD_STAIRS, ctx.facing(away))
      }
    }
    // Sac lanterns in the tunnel walls every 5 steps
    if (i % 5 === 2 && moundOver(ctx, s, e.x + dx * i, e.z + dz * i)) {
      for (const side of [-half - 1, half + 1]) {
        const gx = e.x + dx * i + (dz !== 0 ? side : 0)
        const gz = e.z + dz * i + (dx !== 0 ? side : 0)
        ctx.setIf(gx, lv + 3, gz, 'sac', (id) => id !== BlockIds.AIR)
      }
    }
  }
  return levels
}

const OPPOSITE: Record<number, Face> = { 0: Face.West, 1: Face.North, 2: Face.East, 3: Face.South }

function facingMeta(face: Face): number {
  switch (face) {
    case Face.East: return BlockFacing.EAST
    case Face.West: return BlockFacing.WEST
    case Face.North: return BlockFacing.NORTH
    default: return BlockFacing.SOUTH
  }
}

function exteriorPass(ctx: PassContext): void {
  if (ctx.dryRun) return
  const L = ctx.layout
  const s = moundShape(L, (x, z) => ctx.terrainHeight(x, z))
  const e = L.entrance
  const [dx, , dz] = FACE_DIR[e.face]

  // The approach: a root tunnel through the mound, then a path out to the forest floor
  const levels = hiveApproach(ctx, s)

  // Root arches framing the tunnel mouth (where the path leaves the mound) and a second one outside
  let mouth = levels.length - 1
  for (let i = 1; i < levels.length; i++) {
    if (!moundOver(ctx, s, e.x + dx * i, e.z + dz * i)) {
      mouth = i
      break
    }
  }
  const alongX = e.face === Face.North || e.face === Face.South
  // Free-standing root arches just outside the tunnel mouth: root pillar ribs backed by root mass,
  // a glowing sac at the keystone and sac lanterns on the feet
  for (const [k, rise, span] of [[1, 9, 5], [6, 7, 4]] as const) {
    const i = Math.min(levels.length - 1, mouth + k)
    const px = e.x + dx * i
    const pz = e.z + dz * i
    const base = levels[i] + 1
    for (const side of [-span, span]) {
      const fx = alongX ? px + side : px
      const fz = alongX ? pz : pz + side
      foundationColumn(ctx, fx, fz, base - 1, 'mass', 24)
      if (alongX) foundationColumn(ctx, fx, fz + dz, base - 1, 'mass', 24)
      else foundationColumn(ctx, fx + dx, fz, base - 1, 'mass', 24)
    }
    if (alongX) {
      arch(ctx, true, px - span, px + span, pz, base, rise, 'pillar')
      arch(ctx, true, px - span, px + span, pz + dz, base, rise - 1, 'mass')
      ctx.set(px, base + rise + 1, pz, 'sac')
    } else {
      arch(ctx, false, pz - span, pz + span, px, base, rise, 'pillar')
      arch(ctx, false, pz - span, pz + span, px + dx, base, rise - 1, 'mass')
      ctx.set(px, base + rise + 1, pz, 'sac')
    }
    const lx = alongX ? span : 0
    const lz = alongX ? 0 : span
    ctx.set(px - lx, base + 3, pz - lz, 'sac')
    ctx.set(px + lx, base + 3, pz + lz, 'sac')
  }

  // Buttress roots arching from the mound flanks to the ground (none across the gate)
  const gateAngle = Math.atan2(e.z - s.cz, e.x - s.cx)
  for (let k = 0; k < 7; k++) {
    const a = gateAngle + Math.PI / 4.5 + (k / 7) * (Math.PI * 2 - Math.PI / 2.25) + (hash3(k, 1, L.anchorX, 21) - 0.5) * 0.3
    const ca = Math.cos(a), sa = Math.sin(a)
    const sx = s.cx + ca * s.rx * 0.82
    const sz = s.cz + sa * s.rz * 0.82
    const sy = moundTop(L, s, Math.round(sx), Math.round(sz))
    if (sy === -Infinity) continue
    const ex = s.cx + ca * (s.rx + BUTTRESS_REACH - 1)
    const ez = s.cz + sa * (s.rz + BUTTRESS_REACH - 1)
    const ey = ctx.terrainHeight(Math.round(ex), Math.round(ez))
    const mx = s.cx + ca * (s.rx + 6)
    const mz = s.cz + sa * (s.rz + 6)
    const my = sy + 2
    for (let i = 0; i <= 28; i++) {
      const t = i / 28
      const bx = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex
      const bz = (1 - t) * (1 - t) * sz + 2 * (1 - t) * t * mz + t * t * ez
      const by = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey
      const r = 2 - 1.1 * t
      blob(ctx, L, bx, by, bz, r, 'mass')
    }
  }

  // The crown fungus over the mound's summit, and smaller crowns on two lobes
  const summitX = Math.round(s.cx)
  const summitZ = Math.round(s.cz)
  crownFungus(ctx, summitX, moundTop(L, s, summitX, summitZ) - 1, summitZ, {
    stemHeight: 40,
    stemRadius: 3.4,
    capRadius: Math.min(26, Math.max(18, Math.min(s.rx, s.rz) * 0.75)),
    capRise: 8,
    salt: 1,
  })
  for (let k = 0; k < 2; k++) {
    const a = hash3(L.anchorX, k, L.anchorZ, 31) * Math.PI * 2
    const fx = Math.round(s.cx + Math.cos(a) * s.rx * 0.6)
    const fz = Math.round(s.cz + Math.sin(a) * s.rz * 0.6)
    const top = moundTop(L, s, fx, fz)
    if (top === -Infinity) continue
    crownFungus(ctx, fx, top - 1, fz, { stemHeight: 16 + k * 5, stemRadius: 1.7, capRadius: 8 + k * 2, capRise: 4, salt: 2 + k })
  }
}

/** A sphere of `block` (open cells only, never in the approach). */
function blob(ctx: PassContext, L: DungeonLayout, cx: number, cy: number, cz: number, r: number, block: string): void {
  const rr = Math.ceil(r)
  const clip = ctx.clip
  if (!clip || cx + rr < clip.x0 || cx - rr > clip.x1 || cy + rr < clip.y0 || cy - rr > clip.y1 || cz + rr < clip.z0 || cz - rr > clip.z1) return
  for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) {
    for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
      for (let z = Math.floor(cz - rr); z <= Math.ceil(cz + rr); z++) {
        const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2
        if (d2 <= r * r && !inApproach(L, x, y, z)) ctx.setIf(x, y, z, block, isOpen)
      }
    }
  }
}

const isOpen = (id: number): boolean =>
  id === BlockIds.AIR || id === BlockIds.CRIMSON_SPROUTS || id === BlockIds.GLOWCAP || id === BlockIds.SPORE_STRAND

/** Crown fungi may grow into air, foliage and the mound skin - never into rooms or paths. */
const crownCan = (id: number): boolean => isOpen(id) || id === BlockIds.HIVE_ROOT || id === BlockIds.EMBER_GILLS

interface CrownParams {
  readonly stemHeight: number
  readonly stemRadius: number
  readonly capRadius: number
  readonly capRise: number
  readonly salt: number
}

/**
 * A colossal crown fungus rooted at (x, y, z) (y = the mound surface - 1):
 * emberwood stem, ember-spotted dome cap with a gill underside, a sparse
 * subset of light-casting gills, a few spore sacs in the cap and hanging
 * strands. Pure (world-anchored hashes), clipped by the pass.
 */
function crownFungus(ctx: PassContext, x: number, y: number, z: number, p: CrownParams): void {
  const clip = ctx.clip
  if (!clip) return
  const L = ctx.layout
  const put = (xx: number, yy: number, zz: number, id: number, test: (id: number) => boolean): void => {
    if (!inApproach(L, xx, yy, zz)) ctx.setIf(xx, yy, zz, id, test)
  }
  const rim = Math.min(y + p.stemHeight, CROWN_TOP_LIMIT - Math.ceil(p.capRise) - 1)
  if (rim <= y + 4) return
  const R = p.capRadius
  // Quick reject when this sub-chunk is nowhere near the fungus
  if (clip.x1 < x - R - 2 || clip.x0 > x + R + 2 || clip.z1 < z - R - 2 || clip.z0 > z + R + 2) return
  if (clip.y1 < y || clip.y0 > rim + p.capRise + 1) return

  // Cap radius toward a column, and the cap's underside there (see the cap loop below)
  const capRadiusAt = (xx: number, zz: number): number => {
    const theta = Math.atan2(zz - z, xx - x)
    return R * (1 + 0.06 * Math.sin(3 * theta + p.salt) + 0.04 * Math.sin(5 * theta + p.salt * 2))
  }
  const capBottomAt = (rr: number, Rr: number): number => {
    const top = Math.floor(rim + p.capRise * (1 - (rr / Rr) * (rr / Rr)))
    const next = Math.floor(rim + p.capRise * (1 - Math.min(1, (rr + 1) / Rr) ** 2))
    return Math.min(top - 1, next)
  }

  // Stem (tapers, slight flare at the foot); every stem column rises into the cap's underside,
  // which domes up to capRise above the rim
  const r0 = Math.ceil(p.stemRadius + 1.5)
  for (let xx = x - r0; xx <= x + r0; xx++) {
    for (let zz = z - r0; zz <= z + r0; zz++) {
      const d2 = (xx - x) ** 2 + (zz - z) ** 2
      if (d2 > (p.stemRadius + 1.2) ** 2) continue
      const stemTop = capBottomAt(Math.sqrt(d2), capRadiusAt(xx, zz))
      for (let yy = Math.max(y, clip.y0); yy <= Math.min(stemTop, clip.y1); yy++) {
        const t = Math.min(1, (yy - y) / Math.max(1, rim - y))
        const r = p.stemRadius * (1 - 0.3 * t) + (t < 0.12 ? 1.2 * (1 - t / 0.12) : 0)
        if (d2 <= r * r) put(xx, yy, zz, BlockIds.EMBERWOOD_STEM, crownCan)
      }
    }
  }
  // Cap: a dome shell over the rim, gills underneath, a drooping lip
  for (let xx = Math.max(clip.x0, Math.floor(x - R - 1)); xx <= Math.min(clip.x1, Math.ceil(x + R + 1)); xx++) {
    for (let zz = Math.max(clip.z0, Math.floor(z - R - 1)); zz <= Math.min(clip.z1, Math.ceil(z + R + 1)); zz++) {
      const rr = Math.hypot(xx - x, zz - z)
      const Rr = capRadiusAt(xx, zz)
      if (rr > Rr) continue
      const top = Math.floor(rim + p.capRise * (1 - (rr / Rr) * (rr / Rr)))
      let bottom = capBottomAt(rr, Rr)
      const lip = rr > Rr - 1.2
      if (lip) bottom -= 1
      for (let yy = Math.max(bottom, clip.y0); yy <= Math.min(top, clip.y1); yy++) {
        let id: number = BlockIds.EMBER_CAP
        if (yy === bottom && !lip && rr > p.stemRadius) {
          id = hash3(xx, yy, zz, 40 + p.salt) < 0.03 ? BlockIds.EMBER_GILLS_LIT : BlockIds.EMBER_GILLS
        } else if (yy === top && hash3(xx, yy, zz, 41 + p.salt) < 0.015) {
          id = BlockIds.SPORE_SAC
        }
        put(xx, yy, zz, id, crownCan)
      }
      // Strands and sacs hanging under the gills
      if (lip || rr < p.stemRadius + 1.5) continue
      const roll = hash3(xx, bottom, zz, 50 + p.salt)
      if (roll < 0.05) {
        const len = 1 + Math.floor(hash3(xx, bottom, zz, 51 + p.salt) * 4)
        for (let i = 1; i <= len; i++) {
          const yy = bottom - i
          if (yy >= clip.y0 && yy <= clip.y1) put(xx, yy, zz, BlockIds.SPORE_STRAND, (id) => id === BlockIds.AIR)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The kit
// ---------------------------------------------------------------------------

export const sporeheartHiveKit: DungeonKit = {
  id: SPOREHEART_HIVE.kitId,
  cellSize: CS,
  floorHeight: FH,
  gridRadius: 5,
  levels: [-2, 1],
  worldYRange: [4, 124],
  modules: HIVE_MODULES,
  targetModules: [22, 32],
  require: [
    { tag: 'garrison', count: 3 },
    { tag: 'vault', count: 2 },
    { tag: 'nursery', count: 1 },
  ],
  palette,
  door: [3, 4],
  lootTierBlocks: [BlockIds.HIVE_ROOTBRICK, BlockIds.BROOD_COMB, BlockIds.GLOWING_SAP, BlockIds.ROOT_LATTICE],
  // Approach (22) + root arches + buttresses (mound + 9) + crown caps
  exteriorMargin: 30,
  exteriorHeight: 76,
  baseYRange: [34, 62],
  maxAttempts: 48,
  tierFor(m, layout) {
    if (m.def.tags?.includes('boss')) return 3
    if (m.def.tags?.includes('vault')) return 3
    return Math.min(2, Math.floor((3 * m.depth) / (layout.maxDepth + 1)))
  },
  foundation: foundationPass,
  exterior: exteriorPass,
}

registerDungeonKit(sporeheartHiveKit)
