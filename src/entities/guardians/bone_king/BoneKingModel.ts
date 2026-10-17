import * as THREE from 'three'

/**
 * Procedural box model of the Bone King - the crowned skeletal monarch of
 * the Catacombs (~3.7 blocks tall). Kept apart from the guardian's AI.
 *
 * Built in entity space: feet at y = 0, facing +Z. Lambert materials are in
 * `litMaterials` (register them for world lighting - they also get the
 * guardian's hurt flash); the soul-fire parts (eyes, heart, crown gems,
 * scepter orb, casting orb) are unlit MeshBasicMaterials in `glowMaterials`
 * so attacks can flare them.
 */
export interface BoneKingModel {
  readonly root: THREE.Group
  /** Everything above the hips (hunches and rears with attacks). */
  readonly upper: THREE.Group
  readonly head: THREE.Group
  readonly jaw: THREE.Mesh
  /** Left arm: the casting hand (bone volleys). */
  readonly leftArm: THREE.Group
  /** Right arm: holds the scepter (slams). */
  readonly rightArm: THREE.Group
  readonly leftLeg: THREE.Group
  readonly rightLeg: THREE.Group
  /** Soul orb gathering in the left hand during a volley windup. */
  readonly castOrb: THREE.Mesh
  /** Soul orb on the scepter head (swells during a slam windup). */
  readonly scepterOrb: THREE.Mesh
  /** Orbiting bone shards of the bone shield (rotate this group). */
  readonly shield: THREE.Group
  readonly shieldShards: THREE.Group[]
  /** Soul-fire markers where the dead rise (positioned by the entity). */
  readonly graveMarkers: THREE.Group[]
  readonly litMaterials: THREE.MeshLambertMaterial[]
  /** Eyes, heart, crown gems, scepter orb, casting orb. */
  readonly glowMaterials: THREE.MeshBasicMaterial[]
}

const BONE = 0xe2d8c0
const BONE_DARK = 0xa59a80
const ROYAL = 0x2c2436
const ROYAL_TRIM = 0x5b4970
const CROWN = 0xcfbd8a
const SOCKET = 0x16130f
const SOUL = 0x7dffa6

/** Number of shards orbiting in the bone shield. */
export const BONE_SHIELD_SHARDS = 5

export function buildBoneKingModel(): BoneKingModel {
  const lit = (color: number): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ color })
  const bone = lit(BONE)
  const boneDark = lit(BONE_DARK)
  const royal = lit(ROYAL)
  const trim = lit(ROYAL_TRIM)
  const crown = lit(CROWN)
  const socket = new THREE.MeshBasicMaterial({ color: SOCKET })
  const eyes = new THREE.MeshBasicMaterial({ color: SOUL })
  const heart = new THREE.MeshBasicMaterial({ color: SOUL })
  const gems = new THREE.MeshBasicMaterial({ color: SOUL })
  const orb = new THREE.MeshBasicMaterial({ color: 0xc8ffd8, transparent: true, opacity: 0.9 })

  const box = (
    w: number, h: number, d: number,
    material: THREE.Material,
    x: number, y: number, z: number,
    parent: THREE.Object3D
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = material !== socket
    parent.add(mesh)
    return mesh
  }

  const root = new THREE.Group()

  // ---- Legs (pivot at the hip, y 1.45)
  const makeLeg = (side: number): THREE.Group => {
    const leg = new THREE.Group()
    leg.position.set(side * 0.3, 1.45, 0)
    box(0.22, 0.75, 0.22, bone, 0, -0.38, 0, leg) // thigh
    box(0.26, 0.16, 0.26, boneDark, 0, -0.78, 0.02, leg) // knee
    box(0.19, 0.68, 0.19, bone, 0, -1.1, 0, leg) // shin
    box(0.3, 0.12, 0.46, boneDark, 0, -1.39, 0.08, leg) // foot
    root.add(leg)
    return leg
  }
  const leftLeg = makeLeg(-1)
  const rightLeg = makeLeg(1)

  // ---- Upper body (pivot at the hips)
  const upper = new THREE.Group()
  upper.position.set(0, 1.45, 0)
  root.add(upper)
  box(0.86, 0.26, 0.44, boneDark, 0, 0, 0, upper) // pelvis
  // Royal skirt of tattered cloth over the pelvis
  box(1.0, 0.62, 0.62, royal, 0, -0.2, 0, upper)
  box(0.74, 0.12, 0.66, trim, 0, 0.1, 0, upper) // belt
  for (const [x, z, h] of [[-0.36, 0.3, 0.42], [0, 0.32, 0.55], [0.36, 0.3, 0.38], [-0.4, -0.3, 0.5], [0.4, -0.3, 0.45]] as const) {
    box(0.22, h, 0.06, royal, x, -0.5 - h / 2 + 0.02, z, upper) // hanging tatters
  }
  box(0.18, 0.62, 0.18, bone, 0, 0.42, -0.08, upper) // spine
  // Ribcage around the soul-fire heart
  const ribBase = 0.62
  for (let i = 0; i < 4; i++) {
    const y = ribBase + 0.12 + i * 0.17
    const w = 0.96 - i * 0.04
    box(w, 0.07, 0.07, bone, 0, y, -0.25, upper) // back
    box(0.07, 0.07, 0.5, bone, -w / 2, y, 0, upper) // sides
    box(0.07, 0.07, 0.5, bone, w / 2, y, 0, upper)
    box(w * 0.36, 0.07, 0.07, bone, -w * 0.3, y, 0.25, upper) // front, open middle
    box(w * 0.36, 0.07, 0.07, bone, w * 0.3, y, 0.25, upper)
  }
  box(0.1, 0.62, 0.08, boneDark, 0, ribBase + 0.38, 0.26, upper) // sternum
  box(0.3, 0.3, 0.26, heart, 0, ribBase + 0.38, 0, upper) // soul-fire heart
  // Cape, mantle and skull pauldrons
  box(1.18, 2.15, 0.08, royal, 0, 0.32, -0.42, upper)
  box(1.22, 0.08, 0.1, trim, 0, 1.36, -0.42, upper)
  box(1.36, 0.24, 0.78, trim, 0, 1.38, -0.02, upper) // mantle
  for (const side of [-1, 1]) {
    box(0.4, 0.36, 0.4, bone, side * 0.72, 1.52, 0, upper)
    box(0.09, 0.09, 0.03, socket, side * 0.72 - 0.09, 1.56, 0.205, upper)
    box(0.09, 0.09, 0.03, socket, side * 0.72 + 0.09, 1.56, 0.205, upper)
    box(0.07, 0.24, 0.07, boneDark, side * 0.84, 1.8, 0, upper) // shoulder spike
  }
  box(0.16, 0.2, 0.16, bone, 0, 1.56, 0, upper) // neck

  // ---- Head: skull, jaw, eyes, crown
  const head = new THREE.Group()
  head.position.set(0, 1.66, 0.02)
  upper.add(head)
  box(0.54, 0.5, 0.54, bone, 0, 0.27, 0, head)
  box(0.44, 0.12, 0.2, bone, 0, 0.08, 0.2, head) // cheekbones
  for (const side of [-1, 1]) {
    box(0.13, 0.1, 0.03, eyes, side * 0.12, 0.3, 0.276, head)
  }
  box(0.06, 0.08, 0.03, socket, 0, 0.17, 0.276, head) // nose
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), boneDark)
  jaw.geometry.translate(0, -0.06, 0.06)
  jaw.position.set(0, 0.04, 0.02)
  head.add(jaw)
  for (let i = -2; i <= 2; i++) box(0.05, 0.06, 0.03, bone, i * 0.07, -0.02, 0.26, jaw) // teeth
  // Crown: a gilded bone circlet with five tall points and soul gems
  box(0.62, 0.12, 0.62, crown, 0, 0.56, 0, head)
  const points: Array<[number, number, number]> = [[0, 0.33, 0.28], [-0.24, 0.24, 0.28], [0.24, 0.24, 0.28], [-0.29, 0.28, -0.2], [0.29, 0.28, -0.2]]
  for (const [x, h, z] of points) box(0.09, h, 0.09, crown, x, 0.62 + h / 2, z, head)
  box(0.12, 0.12, 0.05, gems, 0, 0.6, 0.315, head)
  for (const side of [-1, 1]) box(0.08, 0.08, 0.05, gems, side * 0.2, 0.6, 0.315, head)

  // ---- Arms (pivot at the shoulder)
  const makeArm = (side: number): THREE.Group => {
    const arm = new THREE.Group()
    arm.position.set(side * 0.72, 1.36, 0.02)
    upper.add(arm)
    box(0.15, 0.62, 0.15, bone, 0, -0.32, 0, arm) // upper arm
    box(0.18, 0.14, 0.18, boneDark, 0, -0.66, 0, arm) // elbow
    box(0.13, 0.56, 0.13, bone, 0, -0.96, 0.02, arm) // forearm
    box(0.2, 0.18, 0.12, boneDark, 0, -1.31, 0.03, arm) // hand
    for (const f of [-0.07, 0, 0.07]) box(0.04, 0.16, 0.04, bone, f, -1.46, 0.06, arm) // claws
    return arm
  }
  const leftArm = makeArm(-1)
  const rightArm = makeArm(1)
  // Scepter in the right hand: bone shaft, small skull, soul orb
  const scepter = new THREE.Group()
  scepter.position.set(0, -1.32, 0.12)
  rightArm.add(scepter)
  box(0.08, 1.7, 0.08, boneDark, 0, 0.35, 0, scepter)
  box(0.22, 0.22, 0.22, bone, 0, 1.28, 0, scepter)
  const scepterOrb = box(0.2, 0.2, 0.2, orb, 0, 1.52, 0, scepter)
  for (const side of [-1, 1]) box(0.06, 0.2, 0.06, crown, side * 0.12, 1.42, 0, scepter)
  // Casting orb in the left hand (scaled up during a volley windup)
  const castOrb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), orb)
  castOrb.position.set(0, -1.5, 0.22)
  castOrb.scale.setScalar(0.001)
  leftArm.add(castOrb)

  // ---- Bone shield: shards orbiting the body (hidden until raised)
  const shield = new THREE.Group()
  shield.visible = false
  root.add(shield)
  const shieldShards: THREE.Group[] = []
  for (let i = 0; i < BONE_SHIELD_SHARDS; i++) {
    const shard = new THREE.Group()
    const angle = (i / BONE_SHIELD_SHARDS) * Math.PI * 2
    shard.position.set(Math.sin(angle) * 1.55, 1.0 + (i % 2) * 1.1, Math.cos(angle) * 1.55)
    shard.rotation.set(0.35, angle, 0.45)
    box(0.3, 1.05, 0.3, bone, 0, 0, 0, shard)
    box(0.18, 0.3, 0.18, boneDark, 0, 0.62, 0, shard) // jagged tip
    box(0.16, 0.7, 0.16, gems, 0, 0, 0.12, shard) // soul-fire core
    box(0.16, 0.7, 0.16, gems, 0, 0, -0.12, shard)
    shield.add(shard)
    shieldShards.push(shard)
  }

  // ---- Grave markers for raise-dead (world positions set by the entity)
  const graveMarkers: THREE.Group[] = []
  for (let i = 0; i < 4; i++) {
    const marker = new THREE.Group()
    marker.visible = false
    box(0.7, 0.05, 0.7, gems, 0, 0.03, 0, marker)
    box(0.18, 0.7, 0.18, orb, 0, 0.4, 0, marker)
    root.add(marker)
    graveMarkers.push(marker)
  }

  return {
    root, upper, head, jaw, leftArm, rightArm, leftLeg, rightLeg, castOrb, scepterOrb, shield, shieldShards, graveMarkers,
    litMaterials: [bone, boneDark, royal, trim, crown],
    glowMaterials: [eyes, heart, gems, orb],
  }
}
