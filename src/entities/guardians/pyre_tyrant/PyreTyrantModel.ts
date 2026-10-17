import * as THREE from 'three'

/**
 * Procedural box model of the Pyre Tyrant - a hulking forge-king of the
 * Molten Wastes (~3.4 blocks tall): obsidian-black limbs split by lava
 * seams, a crimson infernal-stone chest caging a molten heart, black-iron
 * spiked pauldrons, a horned head under a crown of fire, and two enormous
 * magma fists.
 *
 * Built in entity space: feet at y = 0, facing +Z. Lambert materials are in
 * `litMaterials` (register them for world lighting and the hurt flash);
 * glowing parts are unlit MeshBasicMaterials in `glowMaterials` /
 * `flameMaterials` so attacks can flare them.
 */
export interface PyreTyrantModel {
  readonly root: THREE.Group
  /** Everything above the hips (leans, crouches, twists). */
  readonly upper: THREE.Group
  readonly head: THREE.Group
  readonly leftArm: THREE.Group
  readonly rightArm: THREE.Group
  readonly leftLeg: THREE.Group
  readonly rightLeg: THREE.Group
  /** The crown of flames (scaled to flare). */
  readonly crown: THREE.Group
  readonly crownFlames: THREE.Mesh[]
  /** Fists (flare during windups). */
  readonly leftFist: THREE.Mesh
  readonly rightFist: THREE.Mesh
  /** Flat ground ring telegraphing the slam (scaled to the slam radius). */
  readonly slamRing: THREE.Mesh
  readonly slamRingMaterial: THREE.MeshBasicMaterial
  readonly litMaterials: THREE.MeshLambertMaterial[]
  /** Lava seams, eyes and heart: brighten in the second phase. */
  readonly glowMaterials: THREE.MeshBasicMaterial[]
  /** Fist material (own colour so it can flare white-hot). */
  readonly fistMaterial: THREE.MeshBasicMaterial
  readonly flameMaterial: THREE.MeshBasicMaterial
}

const OBSIDIAN = 0x1b1418
const STONE = 0x4a1a19
const STONE_DARK = 0x2c0d0f
const IRON = 0x2b2522
const HORN = 0x3a2a24
const LAVA = 0xff6a1a
const HEART = 0xffc040
const EYE = 0xffe680
const FIST = 0xff8a28
const FLAME = 0xffb43c

/** Height of the hips (top of the legs). */
export const HIP_Y = 1.25
/** Shoulder height, in upper-body space (upper sits at HIP_Y). */
const SHOULDER_Y = 1.55

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

export function buildPyreTyrantModel(): PyreTyrantModel {
  const lit = (color: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color })
  const obsidian = lit(OBSIDIAN)
  const stone = lit(STONE)
  const stoneDark = lit(STONE_DARK)
  const iron = lit(IRON)
  const horn = lit(HORN)
  const lava = new THREE.MeshBasicMaterial({ color: LAVA })
  const heart = new THREE.MeshBasicMaterial({ color: HEART })
  const eye = new THREE.MeshBasicMaterial({ color: EYE })
  const fistMaterial = new THREE.MeshBasicMaterial({ color: FIST })
  const flameMaterial = new THREE.MeshBasicMaterial({ color: FLAME, transparent: true, opacity: 0.92 })
  const slamRingMaterial = new THREE.MeshBasicMaterial({
    color: 0xff9a1e, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  })

  const root = new THREE.Group()

  // --- Legs (pivot at the hip) ---
  const makeLeg = (side: number): THREE.Group => {
    const leg = new THREE.Group()
    leg.position.set(side * 0.42, HIP_Y, 0)
    leg.add(box(0.55, 0.7, 0.6, obsidian, 0, -0.35, 0)) // thigh
    leg.add(box(0.5, 0.6, 0.55, obsidian, 0, -0.95, 0.02)) // shin
    leg.add(box(0.6, 0.18, 0.78, stoneDark, 0, -1.16, 0.1)) // foot
    leg.add(box(0.08, 0.5, 0.08, lava, side * 0.28, -0.6, 0.12)) // lava seam
    leg.add(box(0.56, 0.06, 0.08, lava, 0, -0.62, 0.3)) // knee seam
    root.add(leg)
    return leg
  }
  const leftLeg = makeLeg(1)
  const rightLeg = makeLeg(-1)

  // --- Upper body ---
  const upper = new THREE.Group()
  upper.position.y = HIP_Y
  root.add(upper)

  upper.add(box(1.0, 0.35, 0.7, obsidian, 0, 0.15, 0)) // belly / belt
  upper.add(box(1.5, 1.15, 1.0, stone, 0, 0.9, 0)) // chest
  upper.add(box(1.3, 0.25, 0.9, stoneDark, 0, 1.55, -0.02)) // collar
  // Molten heart behind a rib grille
  upper.add(box(0.5, 0.5, 0.06, heart, 0, 0.95, 0.5))
  for (const y of [0.78, 0.95, 1.12]) upper.add(box(0.62, 0.07, 0.08, obsidian, 0, y, 0.53))
  // Lava seams across the chest and back
  upper.add(box(0.08, 0.9, 0.04, lava, 0.52, 0.85, 0.51))
  upper.add(box(0.08, 0.7, 0.04, lava, -0.55, 0.95, 0.51))
  upper.add(box(1.2, 0.07, 0.04, lava, 0, 0.55, -0.51))
  upper.add(box(0.07, 0.8, 0.04, lava, 0.2, 0.95, -0.51))

  // Pauldrons with spikes
  for (const side of [-1, 1]) {
    upper.add(box(0.7, 0.4, 0.85, iron, side * 0.88, SHOULDER_Y, 0))
    for (const z of [-0.25, 0.25]) {
      const spike = box(0.12, 0.42, 0.12, horn, side * 0.98, SHOULDER_Y + 0.38, z)
      spike.rotation.z = -side * 0.35
      upper.add(spike)
    }
  }

  // Head with horns, eyes and the crown of fire
  const head = new THREE.Group()
  head.position.set(0, SHOULDER_Y + 0.25, 0.12)
  upper.add(head)
  head.add(box(0.62, 0.6, 0.6, obsidian, 0, 0.3, 0))
  head.add(box(0.5, 0.18, 0.12, stoneDark, 0, 0.12, 0.3)) // jaw
  head.add(box(0.36, 0.05, 0.04, lava, 0, 0.18, 0.37)) // molten maw
  for (const side of [-1, 1]) {
    head.add(box(0.14, 0.08, 0.04, eye, side * 0.15, 0.38, 0.31))
    const hornBase = box(0.14, 0.32, 0.14, horn, side * 0.36, 0.62, -0.02)
    hornBase.rotation.z = -side * 0.5
    head.add(hornBase)
    const hornTip = box(0.1, 0.3, 0.1, horn, side * 0.5, 0.85, -0.08)
    hornTip.rotation.z = -side * 0.15
    head.add(hornTip)
  }
  const crown = new THREE.Group()
  crown.position.y = 0.62
  head.add(crown)
  const crownFlames: THREE.Mesh[] = []
  const flameSpots: Array<[number, number, number]> = [
    [0, 0.3, 0], [0.18, 0.22, 0.12], [-0.18, 0.22, 0.12], [0.16, 0.2, -0.16], [-0.16, 0.2, -0.16],
  ]
  for (const [x, h, z] of flameSpots) {
    const flame = box(0.16, h * 2, 0.16, flameMaterial, x, h, z)
    flame.castShadow = false
    crown.add(flame)
    crownFlames.push(flame)
  }

  // --- Arms (pivot at the shoulder) with magma fists ---
  const makeArm = (side: number): { arm: THREE.Group; fist: THREE.Mesh } => {
    const arm = new THREE.Group()
    arm.position.set(side * 0.95, SHOULDER_Y - 0.05, 0)
    upper.add(arm)
    arm.add(box(0.42, 0.7, 0.45, obsidian, 0, -0.38, 0)) // upper arm
    arm.add(box(0.46, 0.65, 0.5, stone, 0, -0.98, 0.02)) // forearm
    arm.add(box(0.06, 0.55, 0.06, lava, side * 0.2, -0.98, 0.18)) // seam
    arm.add(box(0.5, 0.08, 0.54, iron, 0, -0.7, 0.02)) // bracer
    const fist = box(0.62, 0.55, 0.62, fistMaterial, 0, -1.55, 0.04)
    fist.castShadow = false
    arm.add(fist)
    return { arm, fist }
  }
  const left = makeArm(1)
  const right = makeArm(-1)

  // Slam telegraph ring at the feet (radius 1, scaled by the entity)
  const slamRing = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40, 1).rotateX(-Math.PI / 2), slamRingMaterial)
  slamRing.position.y = 0.05
  slamRing.renderOrder = 2
  slamRing.visible = false
  root.add(slamRing)

  return {
    root,
    upper,
    head,
    leftArm: left.arm,
    rightArm: right.arm,
    leftLeg,
    rightLeg,
    crown,
    crownFlames,
    leftFist: left.fist,
    rightFist: right.fist,
    slamRing,
    slamRingMaterial,
    litMaterials: [obsidian, stone, stoneDark, iron, horn],
    glowMaterials: [lava, heart, eye],
    fistMaterial,
    flameMaterial,
  }
}
