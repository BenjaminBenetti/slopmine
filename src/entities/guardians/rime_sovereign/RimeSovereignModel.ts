import * as THREE from 'three'

/**
 * Procedural box model of the Rime Sovereign - the crowned frozen tyrant of
 * the Frozen Citadel (~3.3 blocks tall). Kept apart from the guardian's AI so
 * the entity file stays about behaviour.
 *
 * Built in entity space: feet at y = 0, facing +Z. Lambert materials are
 * returned in `litMaterials` (register them for world lighting); the glowing
 * parts (eyes, crystal heart, crown tips, scepter crystal) are unlit
 * MeshBasicMaterials kept in `glowMaterials` so attacks can flare them.
 */
export interface RimeSovereignModel {
  readonly root: THREE.Group
  /** Everything above the hips (leans and turns with attacks). */
  readonly upper: THREE.Group
  readonly leftArm: THREE.Group
  /** Holds the scepter. */
  readonly rightArm: THREE.Group
  readonly leftLeg: THREE.Group
  readonly rightLeg: THREE.Group
  readonly cape: THREE.Group
  /** Translucent ice shell shown during the ice-armor phase. */
  readonly iceArmor: THREE.Group
  /** Flat ground ring telegraphing the frost nova (scaled to the nova radius). */
  readonly novaRing: THREE.Mesh
  /** Tip of the scepter crystal, in rightArm space (projectile origin). */
  readonly scepterTip: THREE.Object3D
  readonly litMaterials: THREE.MeshLambertMaterial[]
  readonly glowMaterials: THREE.MeshBasicMaterial[]
  readonly novaMaterial: THREE.MeshBasicMaterial
  readonly armorMaterial: THREE.MeshLambertMaterial
}

const BLACK_ICE = 0x1a2230
const ARMOR_DARK = 0x273246
const MANTLE = 0x1d2638
const GLACIAL = 0x9cc2de
const PALE = 0xc8e2f2
const IRON = 0x3a4252
const FACE = 0x0b0f16
const GLOW = 0x8ff0ff
const GLOW_HOT = 0xe2fdff

export function buildRimeSovereignModel(): RimeSovereignModel {
  const lit = (color: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color })
  const blackIce = lit(BLACK_ICE)
  const armorDark = lit(ARMOR_DARK)
  const mantle = lit(MANTLE)
  const glacial = lit(GLACIAL)
  const pale = lit(PALE)
  const iron = lit(IRON)
  const face = lit(FACE)
  const glow = new THREE.MeshBasicMaterial({ color: GLOW })
  const glowHot = new THREE.MeshBasicMaterial({ color: GLOW_HOT })
  const armorMaterial = new THREE.MeshLambertMaterial({ color: 0xd4ecfa, transparent: true, opacity: 0.5, depthWrite: false })
  const novaMaterial = new THREE.MeshBasicMaterial({
    color: 0x9ff4ff, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide,
  })

  const box = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rz = 0, rx = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    mesh.rotation.z = rz
    mesh.rotation.x = rx
    parent.add(mesh)
    return mesh
  }

  const root = new THREE.Group()

  // --- legs (pivot at the hips) ---
  const makeLeg = (side: number): THREE.Group => {
    const leg = new THREE.Group()
    leg.position.set(side * 0.3, 1.3, 0)
    box(leg, 0.42, 1.3, 0.46, 0, -0.65, 0, blackIce)
    box(leg, 0.48, 0.3, 0.5, 0, -0.62, 0.04, glacial) // knee plate
    box(leg, 0.5, 0.18, 0.62, 0, -1.22, 0.06, armorDark) // sabaton
    root.add(leg)
    return leg
  }
  const leftLeg = makeLeg(-1)
  const rightLeg = makeLeg(1)

  // --- upper body ---
  const upper = new THREE.Group()
  upper.position.set(0, 1.3, 0)
  root.add(upper)
  // tattered mantle skirt
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const len = 0.85 + ((i * 37) % 5) * 0.06
    box(upper, 0.36, len, 0.08, Math.sin(a) * 0.5, -len / 2 + 0.05, Math.cos(a) * 0.36, mantle, 0, 0).rotation.y = a
  }
  box(upper, 1.12, 1.0, 0.62, 0, 0.62, 0, armorDark) // chest
  box(upper, 0.84, 0.66, 0.08, 0, 0.7, 0.33, glacial) // breastplate
  box(upper, 0.22, 0.26, 0.06, 0, 0.72, 0.38, glow) // crystal heart
  box(upper, 0.9, 0.2, 0.66, 0, 0.12, 0, iron) // belt
  // pauldrons with spikes
  for (const side of [-1, 1]) {
    box(upper, 0.56, 0.36, 0.7, side * 0.72, 1.06, 0, pale)
    box(upper, 0.12, 0.42, 0.12, side * 0.86, 1.36, -0.12, glacial, side * -0.35)
    box(upper, 0.1, 0.3, 0.1, side * 0.7, 1.32, 0.16, glacial, side * -0.2)
  }
  // head, face, eyes, icicle beard
  box(upper, 0.56, 0.56, 0.56, 0, 1.46, 0.02, blackIce)
  box(upper, 0.4, 0.3, 0.04, 0, 1.42, 0.3, face)
  box(upper, 0.1, 0.06, 0.02, -0.1, 1.48, 0.32, glowHot)
  box(upper, 0.1, 0.06, 0.02, 0.1, 1.48, 0.32, glowHot)
  for (const [x, len] of [[-0.14, 0.3], [-0.05, 0.42], [0.05, 0.38], [0.14, 0.26]] as const) {
    box(upper, 0.07, len, 0.07, x, 1.2 - len / 2 + 0.06, 0.27, pale)
  }
  // crown: ring of jagged ice spikes with glowing crystal tips
  box(upper, 0.66, 0.1, 0.66, 0, 1.78, 0.02, glacial)
  const spikes: ReadonlyArray<readonly [number, number, number]> = [
    [0, 0.31, 0.62], [0.24, 0.24, 0.42], [-0.24, 0.24, 0.42], [0.3, 0, 0.34], [-0.3, 0, 0.34], [0.2, -0.24, 0.3], [-0.2, -0.24, 0.3],
  ]
  for (const [x, z, h] of spikes) {
    box(upper, 0.1, h, 0.1, x, 1.83 + h / 2, z + 0.02, pale)
    box(upper, 0.08, 0.1, 0.08, x, 1.83 + h + 0.03, z + 0.02, glow)
  }

  // --- arms (pivot at the shoulders) ---
  const leftArm = new THREE.Group()
  leftArm.position.set(-0.78, 1.02, 0)
  box(leftArm, 0.3, 0.9, 0.32, 0, -0.45, 0, armorDark)
  box(leftArm, 0.36, 0.34, 0.38, 0, -0.92, 0.02, glacial) // ice gauntlet
  for (const cx of [-0.1, 0, 0.1]) box(leftArm, 0.06, 0.22, 0.06, cx, -1.18, 0.1, pale) // claws
  upper.add(leftArm)

  const rightArm = new THREE.Group()
  rightArm.position.set(0.78, 1.02, 0)
  box(rightArm, 0.3, 0.9, 0.32, 0, -0.45, 0, armorDark)
  box(rightArm, 0.34, 0.3, 0.36, 0, -0.9, 0.02, glacial)
  // scepter held forward-up: shaft + crystal head
  const scepter = new THREE.Group()
  scepter.position.set(0, -0.95, 0.12)
  scepter.rotation.x = Math.PI / 2 - 0.25
  box(scepter, 0.1, 1.9, 0.1, 0, 0.35, 0, iron)
  box(scepter, 0.24, 0.12, 0.24, 0, 1.28, 0, iron)
  box(scepter, 0.26, 0.42, 0.26, 0, 1.55, 0, glow)
  box(scepter, 0.12, 0.3, 0.12, 0, 1.86, 0, glowHot)
  const scepterTip = new THREE.Object3D()
  scepterTip.position.set(0, 2.0, 0)
  scepter.add(scepterTip)
  rightArm.add(scepter)
  upper.add(rightArm)

  // --- cape (sways) ---
  const cape = new THREE.Group()
  cape.position.set(0, 1.18, -0.34)
  box(cape, 1.2, 1.9, 0.08, 0, -0.95, 0, mantle)
  box(cape, 1.24, 0.12, 0.12, 0, -0.02, 0.02, pale) // frosted collar
  upper.add(cape)

  // --- ice armor shell (ice-armor phase) ---
  const iceArmor = new THREE.Group()
  box(iceArmor, 1.5, 1.6, 1.0, 0, 1.95, 0, armorMaterial)
  box(iceArmor, 1.1, 1.3, 0.9, 0, 0.75, 0, armorMaterial)
  box(iceArmor, 0.8, 0.7, 0.8, 0, 2.9, 0.02, armorMaterial)
  iceArmor.visible = false
  root.add(iceArmor)

  // --- frost nova telegraph ring (unit radius; scaled by the AI) ---
  const ringGeometry = new THREE.RingGeometry(0.86, 1.0, 40)
  ringGeometry.rotateX(-Math.PI / 2)
  const novaRing = new THREE.Mesh(ringGeometry, novaMaterial)
  novaRing.position.y = 0.06
  novaRing.renderOrder = 600 // after the sky dome (see Renderer notes)
  novaRing.visible = false
  root.add(novaRing)

  return {
    root, upper, leftArm, rightArm, leftLeg, rightLeg, cape, iceArmor, novaRing, scepterTip,
    litMaterials: [blackIce, armorDark, mantle, glacial, pale, iron, face],
    glowMaterials: [glow, glowHot],
    novaMaterial,
    armorMaterial,
  }
}
