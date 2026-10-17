import * as THREE from 'three'

/**
 * Procedural box model of the Sporemother, the Sporeheart Hive's guardian:
 * a colossal fungal matriarch ~4.6 blocks tall. A bulbous emberwood-fibre
 * body rooted by a skirt of tendril roots, glowing spore sacs, a cluster of
 * ember eyes over a gill maw, four long tendril arms and a broad crimson
 * cap with glowing teal gills and hanging spore strands.
 *
 * Built at the entity's feet (y = 0), facing +Z. Returns the animated parts;
 * the caller registers `litMaterials` for world-light dimming (glowing parts
 * use MeshBasicMaterial and stay full-bright).
 */
export interface SporemotherParts {
  readonly root: THREE.Group
  /** Body (bobs, leans into slams). */
  readonly body: THREE.Group
  /** Cap crown (puffs on spore attacks). */
  readonly cap: THREE.Group
  /** Four tendril arms: [front-left, front-right, back-left, back-right]. */
  readonly arms: THREE.Group[]
  /** Root skirt tendrils (dig in while rooted, lift as legs once uprooted). */
  readonly roots: THREE.Group[]
  /** Pulsing glow material (sacs, gills, eyes). */
  readonly glow: THREE.MeshBasicMaterial
  readonly eyeGlow: THREE.MeshBasicMaterial
  readonly litMaterials: THREE.MeshLambertMaterial[]
  /** Muzzle point (local) where spore globs are launched from. */
  readonly mouth: THREE.Object3D
  /** Ground telegraph: the tendril slam's impact zone (local, in front). */
  readonly slamMarker: THREE.Mesh
  /** Ground telegraph: a root eruption under the player (positioned per frame). */
  readonly eruptMarker: THREE.Mesh
  /** Phase-2 spore aura shell around the body. */
  readonly aura: THREE.Mesh
  /** Telegraph/aura materials (opacity animated). */
  readonly slamMaterial: THREE.MeshBasicMaterial
  readonly eruptMaterial: THREE.MeshBasicMaterial
  readonly auraMaterial: THREE.MeshBasicMaterial
}

/** Slam impact zone: centre distance in front of the feet, and radius (blocks). */
export const SLAM_OFFSET = 2.4
export const SLAM_RADIUS = 2.8
/** Root eruption radius (blocks). */
export const ERUPT_RADIUS = 1.9
/** Phase-2 spore aura radius (blocks). */
export const AURA_RADIUS = 3.6

const FIBRE = 0x6e2229
const FIBRE_DARK = 0x45141a
const ROOT = 0x3e1d1c
const CAP = 0x8a2324
const CAP_DARK = 0x6a1a1c
const SPOT = 0xf0a040
const TEAL = 0x5ae6cc
const EMBER_EYE = 0xffb040

export function buildSporemotherModel(): SporemotherParts {
  const root = new THREE.Group()
  const fibre = new THREE.MeshLambertMaterial({ color: FIBRE })
  const fibreDark = new THREE.MeshLambertMaterial({ color: FIBRE_DARK })
  const rootMat = new THREE.MeshLambertMaterial({ color: ROOT })
  const capMat = new THREE.MeshLambertMaterial({ color: CAP })
  const capDark = new THREE.MeshLambertMaterial({ color: CAP_DARK })
  const glow = new THREE.MeshBasicMaterial({ color: TEAL })
  const eyeGlow = new THREE.MeshBasicMaterial({ color: EMBER_EYE })
  const spot = new THREE.MeshBasicMaterial({ color: SPOT })

  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    parent.add(mesh)
    return mesh
  }

  // Root skirt: 8 tendril roots splayed into the floor
  const roots: THREE.Group[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const g = new THREE.Group()
    g.position.set(Math.sin(a) * 0.9, 0.55, Math.cos(a) * 0.9)
    g.rotation.y = a
    const upper = box(0.32, 0.32, 1.1, rootMat, 0, 0, 0.5, g)
    upper.rotation.x = 0.45
    box(0.24, 0.24, 0.9, rootMat, 0, -0.38, 1.25, g).rotation.x = 0.9
    roots.push(g)
    root.add(g)
  }

  // Body: tiered bulbs
  const body = new THREE.Group()
  body.position.y = 0.4
  root.add(body)
  box(2.3, 1.4, 2.1, fibre, 0, 0.75, 0, body)
  box(2.5, 0.5, 2.3, fibreDark, 0, 0.25, 0, body)
  box(1.9, 1.0, 1.8, fibre, 0, 1.9, 0, body)
  box(1.3, 0.8, 1.3, fibreDark, 0, 2.75, 0, body)
  // Glowing spore sacs on the flanks
  const sacs: Array<[number, number, number, number]> = [
    [1.18, 0.9, 0.4, 0.5], [-1.2, 0.7, -0.3, 0.6], [0.5, 1.5, 1.0, 0.42], [-0.7, 2.0, 0.92, 0.36],
    [0.95, 2.0, -0.6, 0.4], [-0.4, 1.1, -1.1, 0.5],
  ]
  for (const [x, y, z, s] of sacs) box(s, s, s, glow, x, y, z, body)
  // Face: a vertical gill maw under three ember eyes
  box(0.8, 0.9, 0.12, glow, 0, 1.75, 0.92, body)
  box(0.12, 0.9, 0.14, fibreDark, -0.2, 1.75, 0.93, body)
  box(0.12, 0.9, 0.14, fibreDark, 0.2, 1.75, 0.93, body)
  for (const [x, y] of [[-0.42, 2.45], [0.42, 2.45], [0, 2.62]]) box(0.22, 0.16, 0.1, eyeGlow, x, y, 0.68, body)
  const mouth = new THREE.Object3D()
  mouth.position.set(0, 1.8, 1.2)
  body.add(mouth)

  // Tendril arms (two segments each), pivoting at the shoulders
  const arms: THREE.Group[] = []
  const shoulders: Array<[number, number]> = [[-1.0, 0.6], [1.0, 0.6], [-0.9, -0.6], [0.9, -0.6]]
  for (const [x, z] of shoulders) {
    const arm = new THREE.Group()
    arm.position.set(x, 2.3, z)
    box(0.34, 1.5, 0.34, fibre, 0, -0.75, 0, arm)
    const fore = new THREE.Group()
    fore.position.set(0, -1.5, 0)
    box(0.26, 1.3, 0.26, fibreDark, 0, -0.65, 0, fore)
    box(0.42, 0.3, 0.42, glow, 0, -1.35, 0, fore) // glowing club tip
    arm.add(fore)
    arm.rotation.z = x < 0 ? -0.35 : 0.35
    arms.push(arm)
    body.add(arm)
  }

  // Cap crown with ember spots, teal gills and hanging strands
  const cap = new THREE.Group()
  cap.position.y = 3.2
  body.add(cap)
  box(4.4, 0.55, 4.4, capMat, 0, 0.3, 0, cap)
  box(3.4, 0.5, 3.4, capMat, 0, 0.8, 0, cap)
  box(2.2, 0.45, 2.2, capDark, 0, 1.25, 0, cap)
  box(3.5, 0.12, 3.5, glow, 0, 0.06, 0, cap) // gills, recessed under the rim
  // Drooping crimson lip around the gills: the cap reads as a dome from below
  box(4.4, 0.4, 0.45, capMat, 0, -0.05, 2.0, cap)
  box(4.4, 0.4, 0.45, capMat, 0, -0.05, -2.0, cap)
  box(0.45, 0.4, 3.6, capMat, 2.0, -0.05, 0, cap)
  box(0.45, 0.4, 3.6, capMat, -2.0, -0.05, 0, cap)
  const spots: Array<[number, number, number]> = [[1.5, 0.59, 1.1], [-1.4, 0.59, -0.9], [0.4, 1.06, -1.2], [-1.1, 1.06, 1.0], [1.8, 0.59, -1.6], [0.2, 1.48, 0.4]]
  for (const [x, y, z] of spots) box(0.5, 0.06, 0.5, spot, x, y, z, cap)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const len = 0.5 + ((i * 7) % 5) * 0.18
    box(0.06, len, 0.06, glow, Math.sin(a) * 1.9, -len / 2, Math.cos(a) * 1.9, cap)
  }

  // Telegraphs: flat glowing discs on the floor (no depth write, drawn after the sky)
  // Unfogged so they stay vivid through the hive's haze; a bright rim marks the edge
  const disc = (radius: number): THREE.Mesh => {
    const material = new THREE.MeshBasicMaterial({
      color: TEAL, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
    })
    const geometry = new THREE.RingGeometry(radius * 0.1, radius, 40, 1).rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geometry, material)
    const rim = new THREE.Mesh(new THREE.RingGeometry(radius - 0.22, radius, 48, 1).rotateX(-Math.PI / 2), material)
    rim.position.y = 0.01
    mesh.add(rim)
    mesh.renderOrder = 510
    rim.renderOrder = 511
    mesh.visible = false
    return mesh
  }
  const slamMarker = disc(SLAM_RADIUS)
  slamMarker.position.set(0, 0.06, SLAM_OFFSET)
  root.add(slamMarker)
  const eruptMarker = disc(ERUPT_RADIUS)
  root.add(eruptMarker)

  const auraMaterial = new THREE.MeshBasicMaterial({
    color: TEAL, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const aura = new THREE.Mesh(new THREE.IcosahedronGeometry(AURA_RADIUS, 2), auraMaterial)
  aura.position.y = 1.6
  aura.renderOrder = 510
  aura.visible = false
  root.add(aura)

  return {
    root, body, cap, arms, roots, glow, eyeGlow, mouth, slamMarker, eruptMarker, aura,
    slamMaterial: slamMarker.material as THREE.MeshBasicMaterial,
    eruptMaterial: eruptMarker.material as THREE.MeshBasicMaterial,
    auraMaterial,
    litMaterials: [fibre, fibreDark, rootMat, capMat, capDark],
  }
}
