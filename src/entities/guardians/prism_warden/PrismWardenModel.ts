import * as THREE from 'three'
import {
  ABYSSAL_ROCK, ABYSSAL_ROCK_DARK, CRYSTAL_LAVENDER, CRYSTAL_ROSE, CRYSTAL_VIOLET, EYE_GLOW,
} from '../../enemies/crystal_shared/crystalPalette.ts'

/** Animated parts of the Prism Warden model (feet at y = 0, facing +Z). */
export interface PrismWardenParts {
  readonly root: THREE.Group
  /** Everything above the hips (leans for slams, bows when staggered). */
  readonly torso: THREE.Group
  readonly head: THREE.Group
  readonly leftArm: THREE.Group
  readonly rightArm: THREE.Group
  readonly leftLeg: THREE.Group
  readonly rightLeg: THREE.Group
  /** The prism heart in the chest (beam source). */
  readonly core: THREE.Mesh
  /** Crystal crown on the back (volley source). */
  readonly backCrystals: THREE.Group
  /** Lit materials (registered for world light + hurt flash). */
  readonly litMaterials: THREE.MeshLambertMaterial[]
  readonly crystalMaterial: THREE.MeshLambertMaterial
  readonly backCrystalMaterial: THREE.MeshLambertMaterial
  readonly coreMaterial: THREE.MeshBasicMaterial
  readonly eyeMaterial: THREE.MeshBasicMaterial
}

/** Hip height; torso pivot sits just above it. */
export const WARDEN_HIP_Y = 1.5
/** Local height of the prism heart (beam origin) above the feet. */
export const WARDEN_CORE_Y = 2.55
/** Local forward offset of the prism heart. */
export const WARDEN_CORE_Z = 0.72

function box(
  w: number, h: number, d: number,
  material: THREE.Material,
  x: number, y: number, z: number,
  parent: THREE.Object3D
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

/** A crystal spike standing on its base point (grows along local +Y). */
function spike(
  w: number, h: number,
  material: THREE.Material,
  x: number, y: number, z: number,
  rx: number, rz: number,
  parent: THREE.Object3D
): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.set(rx, 0, rz)
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.72, w), material)
  body.position.y = h * 0.36
  body.castShadow = true
  g.add(body)
  const tip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h * 0.32, w * 0.6), material)
  tip.position.y = h * 0.86
  g.add(tip)
  parent.add(g)
  return g
}

/**
 * The Prism Warden: a hulking colossus of abyssal rock ~4 blocks tall, a
 * glowing prism heart set in its chest, crystal pauldrons, a crown of
 * crystal shards on its back, a crystal-spiked head with pale eyes, and
 * long arms ending in massive crystal fists.
 */
export function buildPrismWardenModel(): PrismWardenParts {
  const rock = new THREE.MeshLambertMaterial({ color: ABYSSAL_ROCK })
  const rockDark = new THREE.MeshLambertMaterial({ color: ABYSSAL_ROCK_DARK })
  const crystalMaterial = new THREE.MeshLambertMaterial({
    color: CRYSTAL_VIOLET,
    emissive: new THREE.Color(CRYSTAL_VIOLET),
    emissiveIntensity: 0.5,
  })
  const roseMaterial = new THREE.MeshLambertMaterial({
    color: CRYSTAL_ROSE,
    emissive: new THREE.Color(CRYSTAL_ROSE),
    emissiveIntensity: 0.45,
  })
  const backCrystalMaterial = new THREE.MeshLambertMaterial({
    color: CRYSTAL_LAVENDER,
    emissive: new THREE.Color(CRYSTAL_VIOLET),
    emissiveIntensity: 0.6,
  })
  const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xe8d0ff })
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: EYE_GLOW })

  const root = new THREE.Group()

  // Legs
  const leg = (side: number): THREE.Group => {
    const g = new THREE.Group()
    g.position.set(side * 0.58, WARDEN_HIP_Y, 0)
    box(0.72, 1.5, 0.82, rockDark, 0, -0.75, 0, g)
    box(0.88, 0.26, 1.05, rock, 0, -1.37, 0.1, g)
    spike(0.2, 0.5, roseMaterial, side * 0.1, -0.62, 0.42, 1.1, -side * 0.25, g)
    root.add(g)
    return g
  }
  const leftLeg = leg(-1)
  const rightLeg = leg(1)
  box(1.55, 0.42, 0.95, rockDark, 0, WARDEN_HIP_Y + 0.05, 0, root) // pelvis

  // Torso (pivot above the hips)
  const torso = new THREE.Group()
  torso.position.set(0, WARDEN_HIP_Y + 0.2, 0)
  root.add(torso)
  box(1.5, 0.5, 1.0, rock, 0, 0.15, 0, torso) // belly
  box(2.15, 1.35, 1.25, rock, 0, 0.78, 0, torso) // chest
  box(1.7, 0.25, 1.1, rockDark, 0, 1.5, -0.05, torso) // collar
  // Prism heart, framed by dark rock
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), coreMaterial)
  core.position.set(0, WARDEN_CORE_Y - torso.position.y, WARDEN_CORE_Z - 0.06)
  core.scale.set(1, 1.3, 0.7)
  torso.add(core)
  const coreY = core.position.y
  box(0.18, 0.95, 0.2, rockDark, -0.48, coreY, 0.62, torso)
  box(0.18, 0.95, 0.2, rockDark, 0.48, coreY, 0.62, torso)
  box(0.8, 0.16, 0.2, rockDark, 0, coreY + 0.55, 0.62, torso)
  box(0.8, 0.16, 0.2, rockDark, 0, coreY - 0.55, 0.62, torso)

  // Crystal pauldrons
  for (const side of [-1, 1]) {
    spike(0.42, 0.95, crystalMaterial, side * 1.15, 1.35, 0.05, 0.1, -side * 0.55, torso)
    spike(0.32, 0.7, roseMaterial, side * 1.02, 1.4, -0.32, -0.35, -side * 0.35, torso)
    spike(0.26, 0.55, crystalMaterial, side * 1.25, 1.2, 0.38, 0.45, -side * 0.75, torso)
  }

  // Crystal crown on the back (volley source)
  const backCrystals = new THREE.Group()
  backCrystals.position.set(0, 1.15, -0.55)
  torso.add(backCrystals)
  const fan: Array<[number, number, number]> = [
    // x, height, lean
    [0, 1.5, 0], [-0.42, 1.15, 0.4], [0.42, 1.15, -0.4], [-0.78, 0.85, 0.75], [0.78, 0.85, -0.75],
  ]
  for (const [x, h, lean] of fan) {
    spike(0.3, h, backCrystalMaterial, x, 0, 0, -0.45, lean, backCrystals)
  }

  // Head
  const head = new THREE.Group()
  head.position.set(0, 1.62, 0.12)
  torso.add(head)
  box(0.72, 0.6, 0.72, rock, 0, 0.3, 0, head)
  box(0.78, 0.14, 0.2, rockDark, 0, 0.47, 0.32, head) // brow
  box(0.15, 0.08, 0.04, eyeMaterial, -0.17, 0.36, 0.37, head)
  box(0.15, 0.08, 0.04, eyeMaterial, 0.17, 0.36, 0.37, head)
  spike(0.16, 0.55, roseMaterial, 0, 0.6, -0.05, -0.2, 0, head)
  spike(0.13, 0.42, crystalMaterial, -0.25, 0.58, -0.05, -0.15, 0.4, head)
  spike(0.13, 0.42, crystalMaterial, 0.25, 0.58, -0.05, -0.15, -0.4, head)

  // Arms (pivot at the shoulder) with massive crystal fists
  const arm = (side: number): THREE.Group => {
    const g = new THREE.Group()
    g.position.set(side * 1.32, 1.15, 0)
    box(0.52, 1.0, 0.52, rock, 0, -0.5, 0, g)
    box(0.62, 0.9, 0.62, rockDark, 0, -1.35, 0.02, g)
    box(0.88, 0.78, 0.88, crystalMaterial, 0, -2.08, 0.05, g)
    spike(0.18, 0.42, roseMaterial, side * 0.32, -1.85, 0.15, 0.2, -side * 1.2, g)
    spike(0.18, 0.38, roseMaterial, 0, -2.0, 0.42, 1.3, 0, g)
    torso.add(g)
    return g
  }
  const leftArm = arm(-1)
  const rightArm = arm(1)

  return {
    root, torso, head, leftArm, rightArm, leftLeg, rightLeg, core, backCrystals,
    litMaterials: [rock, rockDark, crystalMaterial, roseMaterial, backCrystalMaterial],
    crystalMaterial, backCrystalMaterial, coreMaterial, eyeMaterial,
  }
}
