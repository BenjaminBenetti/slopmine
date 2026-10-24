import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlockMeshPart, IMultiMeshBlock } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { buildFlamePlanes, createFlameMaterial, type FlamePlane } from '../../../../renderer/FlameMaterial.ts'
import { StickItem } from '../../../../items/materials/stick/StickItem.ts'
import { mergeTaggedParts } from '../model_shared/mergeTaggedParts.ts'

import campfireTexUrl from './assets/campfire.webp'

// Register the texture (placeholder: warm magma-style tile; see manifest)
registerTextureUrl(TextureId.CAMPFIRE, campfireTexUrl)

/** Total visual height of the stone ring and logs (a low fire pit, walk-through). */
const CAMPFIRE_HEIGHT = 0.3

// ---------------------------------------------------------------------------
// Model: a ring of rough fieldstones (sooty on the inside) around an ash bed,
// logs pushed in toward the middle like spokes (charred and glowing at their
// inner ends, cut wood at the outer), a heap of embers between them, and
// animated pixel flames on four crossed planes (FlameMaterial.ts) throwing
// sparks. Cell space is [-0.5, 0.5], floor at y = -0.5. Box colours are
// vertex colours (sRGB hex below); materials:
//   0 = lit (stones, ash, logs, charcoal), 1 = glowing (embers, log tips),
//   2 = flames
// ---------------------------------------------------------------------------

const FLOOR_Y = -0.5
const LIT = 0
const GLOW = 1
const FLAME = 2

type ColorAt = (x: number, y: number, z: number, face: number, out: THREE.Color) => void

/**
 * Colour a part's vertices (BoxGeometry faces: +x, -x, +y, -y, +z, -z, four
 * vertices each) and tag it with a material index.
 */
function paint(geo: THREE.BufferGeometry, materialIndex: number, colorAt: ColorAt): THREE.BufferGeometry {
  const position = geo.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  const color = new THREE.Color()
  for (let i = 0; i < position.count; i++) {
    colorAt(position.getX(i), position.getY(i), position.getZ(i), Math.floor(i / 4), color)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return tag(geo, materialIndex)
}

function tag(geo: THREE.BufferGeometry, materialIndex: number): THREE.BufferGeometry {
  if (geo.groups.length === 0) geo.addGroup(0, geo.index ? geo.index.count : geo.getAttribute('position').count, materialIndex)
  for (const group of geo.groups) group.materialIndex = materialIndex
  return geo
}

function solid(hex: number, scale = 1): ColorAt {
  return (_x, _y, _z, _face, out) => { out.setHex(hex).multiplyScalar(scale) }
}

function hash(a: number, b: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return h - Math.floor(h)
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// --- Ash bed: an octagon of pale ash (two squares a hair apart, no z-fighting) ---
const ash: THREE.BufferGeometry[] = [0, Math.PI / 4].map((angle, i) => {
  const h = 0.012 + i * 0.004
  const geo = new THREE.BoxGeometry(0.62, h, 0.62)
  geo.rotateY(angle)
  geo.translate(0, FLOOR_Y + h / 2, 0)
  return paint(geo, LIT, solid(i === 0 ? 0x57524d : 0x4d4844))
})

// --- Stone ring: [angle°, radius, width, depth, height, yaw, colour] ---
const STONES: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
  [0, 0.39, 0.19, 0.15, 0.15, 0.1, 0x6f7174],
  [35, 0.4, 0.15, 0.13, 0.12, -0.3, 0x808386],
  [72, 0.38, 0.18, 0.16, 0.17, 0.25, 0x66686a],
  [108, 0.4, 0.14, 0.12, 0.11, 0.6, 0x75726e],
  [145, 0.39, 0.19, 0.15, 0.16, -0.2, 0x7b7e81],
  [180, 0.4, 0.16, 0.14, 0.13, 0.35, 0x6a6c6f],
  [215, 0.38, 0.18, 0.15, 0.15, -0.45, 0x858789],
  [252, 0.4, 0.14, 0.13, 0.12, 0.15, 0x6e6b67],
  [288, 0.39, 0.19, 0.16, 0.17, -0.1, 0x777a7d],
  [324, 0.4, 0.15, 0.13, 0.12, 0.5, 0x686a6d],
]

/** Stone colour: lighter tops, darker undersides, soot on the side facing the fire. */
function stoneColor(hex: number): ColorAt {
  return (x, _y, z, face, out) => {
    const soot = 0.55 + 0.45 * smoothstep(0.27, 0.44, Math.hypot(x, z))
    const light = face === 2 ? 1.12 : face === 3 ? 0.7 : 1
    out.setHex(hex).multiplyScalar(soot * light)
  }
}

const stones: THREE.BufferGeometry[] = []
for (const [angle, radius, w, d, h, yaw, hex] of STONES) {
  // A body and a smaller cap turned against it: a rough, rounded fieldstone
  const body = new THREE.BoxGeometry(w, h * 0.72, d)
  body.rotateY(yaw)
  body.translate(0, FLOOR_Y + h * 0.36, radius)
  const cap = new THREE.BoxGeometry(w * 0.72, h * 0.34, d * 0.74)
  cap.rotateY(yaw + 0.5)
  cap.translate(0, FLOOR_Y + h * 0.83, radius - 0.005)
  for (const part of [body, cap]) {
    part.rotateY((angle * Math.PI) / 180)
    stones.push(paint(part, LIT, stoneColor(hex)))
  }
}

// --- Logs: [angle°, length, thickness, tilt] - inner ends raised over the embers ---
const LOGS: ReadonlyArray<readonly [number, number, number, number]> = [
  [18, 0.32, 0.11, 0.42],
  [92, 0.3, 0.1, 0.36],
  [158, 0.33, 0.12, 0.4],
  [228, 0.29, 0.1, 0.34],
  [300, 0.31, 0.11, 0.44],
]
const LOG_INNER_RADIUS = 0.03
const BARK = 0x4a3120
const CUT_WOOD = 0x8d6440
const CHAR = 0x211712

const logs: THREE.BufferGeometry[] = []
for (const [angle, length, thickness, tilt] of LOGS) {
  // Built along +X from its inner end (x = 0), then tilted and turned into place
  const place = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
    geo.rotateZ(-tilt)
    geo.translate(LOG_INNER_RADIUS, FLOOR_Y + thickness / 2 + length * Math.sin(tilt) - 0.02, 0)
    geo.rotateY((angle * Math.PI) / 180)
    return geo
  }
  const log = new THREE.BoxGeometry(length, thickness, thickness)
  log.translate(length / 2, 0, 0)
  paint(log, LIT, (x, _y, _z, face, out) => {
    if (face === 0) out.setHex(CUT_WOOD)
    else if (face === 1) out.setHex(CHAR)
    else out.setHex(CHAR).lerp(new THREE.Color(BARK), smoothstep(0.0, 0.4, x / length))
  })
  logs.push(place(log))
  // The burning end
  const tip = new THREE.BoxGeometry(0.05, thickness * 0.92, thickness * 0.92)
  tip.translate(0.02, 0, 0)
  logs.push(place(paint(tip, GLOW, solid(0xff6a1c))))
}

// --- Embers: a rough 4×4 heap (corners missing) of glowing coals and charcoal ---
const EMBER_COLORS = [0xff9a2e, 0xe2561a, 0xa3300f]
const embers: THREE.BufferGeometry[] = []
for (let i = 0; i < 4; i++) {
  for (let j = 0; j < 4; j++) {
    if ((i === 0 || i === 3) && (j === 0 || j === 3)) continue
    const h = 0.025 + hash(i, j) * 0.035
    const geo = new THREE.BoxGeometry(0.09, h, 0.09)
    geo.translate(-0.135 + i * 0.09, FLOOR_Y + 0.012 + h / 2, -0.135 + j * 0.09)
    const roll = hash(j + 7, i + 3)
    embers.push(roll < 0.2
      ? paint(geo, LIT, solid(0x2a221d))
      : paint(geo, GLOW, solid(EMBER_COLORS[Math.floor(hash(i + 11, j) * EMBER_COLORS.length)])))
  }
}
// A few coals spilled between the logs
for (const [angle, radius, hex] of [[55, 0.2, 0xff9a2e], [195, 0.21, 0xe2561a], [265, 0.19, 0xff9a2e]] as const) {
  const geo = new THREE.BoxGeometry(0.06, 0.045, 0.06)
  geo.rotateY(0.4)
  geo.translate(0, FLOOR_Y + 0.012 + 0.0225, radius)
  geo.rotateY((angle * Math.PI) / 180)
  embers.push(paint(geo, GLOW, solid(hex)))
}

// --- Flames: two tall outer planes crossed at 45°, two hotter inner ones square to the cell ---
const FLAME_PLANES: readonly FlamePlane[] = [
  { width: 0.84, height: 0.95, heat: 0, sparks: true },
  { width: 0.84, height: 0.95, heat: 0, sparks: true },
  { width: 0.56, height: 0.66, heat: 0.2, sparks: false },
  { width: 0.56, height: 0.66, heat: 0.2, sparks: false },
]
const flamePlanes = buildFlamePlanes(FLAME_PLANES, [Math.PI / 4, -Math.PI / 4, 0, Math.PI / 2]).map((geo) => {
  geo.translate(0, FLOOR_Y + 0.025, 0)
  return paint(geo, 0, solid(0xffffff))
})

const pitParts = [...ash, ...stones, ...logs, ...embers]
const pitGeometry = mergeTaggedParts(pitParts)
const flameGeometry = mergeTaggedParts(flamePlanes)
/** Item displays (icon, held, dropped): one geometry, flames included. */
const displayGeometry = mergeTaggedParts([...pitParts, ...flamePlanes.map((geo) => tag(geo.clone(), FLAME))])

const pitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true })
const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
const flameMaterial = createFlameMaterial(FLAME_PLANES)
const displayMaterials = [pitMaterial, glowMaterial, flameMaterial]

/** Chunk meshes: the pit, and the flames apart so they stay out of shadow maps. */
const chunkParts: IBlockMeshPart[] = [
  { geometry: pitGeometry, material: [pitMaterial, glowMaterial] },
  { geometry: flameGeometry, material: flameMaterial, castShadow: false },
]

/**
 * Campfire - a stone-ringed fire pit with burning logs, embers and flickering
 * flames. Strong light source (14, between torch 13 and resin torch 15) whose
 * light flickers (FlickerLights.ts). No collision: players can walk through
 * (over) it. Placed by worldgen at
 * hunters' camps, charred mining camps and underground points of interest.
 */
export class CampfireBlock extends TransparentBlock implements IMultiMeshBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CAMPFIRE,
    name: 'campfire',
    isOpaque: false,
    isSolid: false, // No collision - walk-through like torch
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 14, // Brighter than a torch (13), dimmer than resin torch (15)
    lightFlicker: true,
    lightBlocking: 0, // Doesn't block light
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.CAMPFIRE
  }

  protected getGeometry(): THREE.BufferGeometry {
    return displayGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return displayMaterials
  }

  getMultiMeshParts(): IBlockMeshPart[] {
    return chunkParts
  }

  getCollisionBox(): THREE.Box3 | null {
    // No collision - players can walk through campfires
    return null
  }

  shouldRenderFace(_face: BlockFace): boolean {
    // Always render (small non-cube shape)
    return true
  }

  isGreedyMeshable(): boolean {
    // Custom geometry - cannot be greedy-meshed
    return false
  }

  /**
   * Get the interaction box for raycasting: a low, wide box matching the
   * stone ring footprint.
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.05, 0, 0.05),
      new THREE.Vector3(0.95, CAMPFIRE_HEIGHT, 0.95)
    )
  }

  getDrops(): IItem[] {
    // The stones scatter; a couple of usable sticks survive
    return [new StickItem(), new StickItem()]
  }
}
