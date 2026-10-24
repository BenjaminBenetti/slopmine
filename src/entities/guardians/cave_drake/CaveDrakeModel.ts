import * as THREE from 'three'

/**
 * Procedural box model of the Cave Drake - the dragon that sleeps on the
 * hoard of a dragon's lair under the overworld: a long crimson-scaled body
 * on four clawed legs, a gold-plated belly, a horned head on a long neck
 * (the jaw drops and the throat glows when it breathes fire), membrane wings
 * that fold along its flanks and spread to buffet, and a spiked tail.
 *
 * Entity space: feet at y = 0, facing +Z; built at unit scale (2.6 blocks to
 * the top of the back) and scaled by MODEL_SCALE: about 4 blocks tall at the
 * back and 10 long nose to tail. Lambert materials are in `litMaterials`
 * (world light + hurt flash); the eyes and the throat are unlit glow.
 */
export interface CaveDrakeModel {
  readonly root: THREE.Group
  /** Body (everything but the legs): leans and twists. */
  readonly body: THREE.Group
  /** Neck base pivot and the head on it. */
  readonly neck: THREE.Group
  readonly head: THREE.Group
  readonly jaw: THREE.Group
  /** Wing pivots at the shoulders (rotate z to spread). */
  readonly leftWing: THREE.Group
  readonly rightWing: THREE.Group
  /** Tail segments, root first (each rotates on y to sway). */
  readonly tail: THREE.Group[]
  /** Leg pivots: front left, front right, back left, back right. */
  readonly legs: THREE.Group[]
  readonly litMaterials: THREE.MeshLambertMaterial[]
  /** Throat and mouth glow (brightens before fire breath). */
  readonly fireMaterial: THREE.MeshBasicMaterial
  readonly eyeMaterial: THREE.MeshBasicMaterial
}

const SCALE = 0x6a1a1a
const SCALE_DARK = 0x3a0e10
const BELLY = 0xb88a3c
const HORN = 0xd8ceb0
const MEMBRANE = 0x8a2a1c
const CLAW = 0x2a2022
const EYE = 0xffcc33
const FIRE = 0xff7a1e

/** The model is built small and scaled up to its true size. */
export const MODEL_SCALE = 1.45

/** Wing rotation (z, left wing; the right mirrors it) at rest: half raised. */
export const WING_REST = -0.7

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

/** A group at a position (a pivot). */
function pivot(x: number, y: number, z: number, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  if (children.length > 0) g.add(...children)
  return g
}

export function buildCaveDrakeModel(): CaveDrakeModel {
  const lit = (color: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color })
  const scale = lit(SCALE)
  const dark = lit(SCALE_DARK)
  const belly = lit(BELLY)
  const horn = lit(HORN)
  const membrane = lit(MEMBRANE)
  const claw = lit(CLAW)
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE })
  const fireMaterial = new THREE.MeshBasicMaterial({ color: FIRE })

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  // --- Torso (hips at z -1.3, shoulders at z +1.2) ---
  body.add(box(1.7, 1.25, 3.4, scale, 0, 1.75, 0))
  body.add(box(1.5, 0.3, 3.0, belly, 0, 1.08, 0.1))
  body.add(box(1.85, 0.5, 1.4, scale, 0, 1.9, 1.0)) // chest swell
  // Dorsal spikes
  for (let i = 0; i < 6; i++) body.add(box(0.14, 0.3 + (i % 2) * 0.12, 0.3, horn, 0, 2.5, 1.4 - i * 0.55))

  // --- Neck and head ---
  const head = new THREE.Group()
  head.add(box(0.85, 0.7, 1.1, scale, 0, 0, 0.2)) // skull
  head.add(box(0.62, 0.42, 1.0, scale, 0, -0.08, 1.15)) // snout
  head.add(box(0.66, 0.12, 0.9, dark, 0, 0.18, 1.1)) // nose ridge
  head.add(box(0.14, 0.14, 0.14, dark, -0.2, 0.1, 1.6)) // nostrils
  head.add(box(0.14, 0.14, 0.14, dark, 0.2, 0.1, 1.6))
  head.add(box(0.12, 0.1, 0.06, eyeMaterial, -0.36, 0.14, 0.62))
  head.add(box(0.12, 0.1, 0.06, eyeMaterial, 0.36, 0.14, 0.62))
  for (const s of [-1, 1]) {
    head.add(box(0.14, 0.14, 0.75, horn, s * 0.3, 0.45, -0.35))
    head.add(box(0.12, 0.12, 0.45, horn, s * 0.36, 0.62, -0.85))
    head.add(box(0.1, 0.1, 0.25, horn, s * 0.4, 0.78, -1.15))
  }
  head.add(box(0.5, 0.1, 0.5, fireMaterial, 0, -0.27, 0.85)) // mouth glow
  const jaw = pivot(0, -0.25, 0.45, box(0.55, 0.16, 1.3, dark, 0, -0.06, 0.6))
  head.add(jaw)
  const neckTop = pivot(0, 1.0, 0.7, head)
  const neck = pivot(0, 2.1, 1.6,
    box(0.75, 0.75, 1.1, scale, 0, 0.3, 0.4),
    box(0.65, 0.65, 0.9, scale, 0, 0.75, 0.75),
    box(0.4, 0.5, 1.2, fireMaterial, 0, 0.12, 0.45), // throat glow under the neck
    neckTop,
  )
  body.add(neck)

  // --- Wings (folded along the flanks; rotate z to spread) ---
  const wing = (side: number): THREE.Group => {
    const w = pivot(side * 0.8, 2.35, 0.7)
    const arm = pivot(0, 0, 0,
      box(2.4, 0.16, 0.2, dark, side * 1.2, 0, 0),
      box(2.3, 0.06, 2.5, membrane, side * 1.35, -0.02, -1.2),
      box(0.14, 0.12, 2.3, dark, side * 2.45, 0, -1.05),
      box(0.12, 0.1, 2.0, dark, side * 1.5, 0.01, -1.0),
      box(0.3, 0.12, 0.3, horn, side * 2.45, 0.08, 0.15), // claw at the wrist
    )
    w.add(arm)
    w.rotation.z = side * WING_REST
    return w
  }
  const leftWing = wing(1)
  const rightWing = wing(-1)
  body.add(leftWing, rightWing)

  // --- Tail: four chained segments, tapering ---
  const tail: THREE.Group[] = []
  let parent: THREE.Object3D = body
  let z = -1.7
  let y = 1.8
  for (let i = 0; i < 4; i++) {
    const width = 0.75 - i * 0.15
    const length = 1.1 - i * 0.08
    const seg = pivot(0, y, z, box(width, width * 0.85, length, scale, 0, 0, -length / 2), box(0.1, 0.2, 0.25, horn, 0, width * 0.5, -length / 2))
    parent.add(seg)
    tail.push(seg)
    parent = seg
    z = -length
    y = -0.12
  }
  tail[3].add(box(0.5, 0.08, 0.5, dark, 0, 0, -1.15)) // tail blade

  // --- Legs: thigh + shin + claws, pivot at the hip/shoulder ---
  const legs: THREE.Group[] = []
  for (const [lx, lz] of [[0.75, 1.1], [-0.75, 1.1], [0.75, -1.2], [-0.75, -1.2]]) {
    const leg = pivot(lx, 1.45, lz,
      box(0.5, 0.75, 0.6, scale, 0, -0.3, 0),
      box(0.4, 0.75, 0.42, dark, 0, -0.95, 0.08),
      box(0.5, 0.16, 0.65, claw, 0, -1.37, 0.2),
    )
    root.add(leg)
    legs.push(leg)
  }

  root.scale.setScalar(MODEL_SCALE)

  return {
    root, body, neck, head: neckTop, jaw, leftWing, rightWing, tail, legs,
    litMaterials: [scale, dark, belly, horn, membrane, claw],
    fireMaterial, eyeMaterial,
  }
}
