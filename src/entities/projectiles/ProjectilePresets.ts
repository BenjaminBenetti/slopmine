import * as THREE from 'three'

/**
 * Visual presets for ProjectileEntity: small self-lit (unshaded) meshes - a
 * solid core inside an additive glow shell, optionally with a fading trail -
 * so projectiles read clearly in the dark Hell layer without real lights
 * (a PointLight per projectile would recompile every lit material).
 *
 * Geometries and materials are shared by every projectile of a preset and
 * are never disposed (ProjectileEntity skips disposal for preset visuals).
 */
export type ProjectilePreset = 'fireball' | 'bone_shard' | 'ice_shard' | 'crystal_shard' | 'spore_glob'

/** Every preset name (for iteration / debug UIs). */
export const PROJECTILE_PRESETS: readonly ProjectilePreset[] = [
  'fireball',
  'bone_shard',
  'ice_shard',
  'crystal_shard',
  'spore_glob',
]

type Shape = 'sphere' | 'shard' | 'glob'

interface PresetSpec {
  readonly shape: Shape
  /** Core diameter (spheres/globs) or shard thickness, in blocks at scale 1. */
  readonly size: number
  readonly core: number
  readonly shell: number
  /** Shell size relative to the core. */
  readonly shellScale: number
  readonly trail: boolean
  /** Spin around the flight axis (shards) or tumble (globs), rad/s. */
  readonly spin: number
  /** Shell pulse amplitude (0 = steady). */
  readonly flicker: number
}

const SPECS: Record<ProjectilePreset, PresetSpec> = {
  fireball: { shape: 'sphere', size: 0.5, core: 0xffd27a, shell: 0xff5a14, shellScale: 1.7, trail: true, spin: 0, flicker: 0.18 },
  bone_shard: { shape: 'shard', size: 0.3, core: 0xe6dcc2, shell: 0x8fe07a, shellScale: 1.45, trail: false, spin: 9, flicker: 0.08 },
  ice_shard: { shape: 'shard', size: 0.3, core: 0xe4f7ff, shell: 0x4fb2ff, shellScale: 1.5, trail: true, spin: 6, flicker: 0.06 },
  crystal_shard: { shape: 'shard', size: 0.32, core: 0xf6c8ff, shell: 0xd24aff, shellScale: 1.55, trail: true, spin: 7, flicker: 0.1 },
  spore_glob: { shape: 'glob', size: 0.5, core: 0xc8f05a, shell: 0x22d0a4, shellScale: 1.5, trail: true, spin: 3, flicker: 0.14 },
}

/** Trail ghosts per projectile and their opacity falloff. */
const TRAIL_OPACITY = [0.42, 0.28, 0.17, 0.08] as const

interface PresetResources {
  readonly spec: PresetSpec
  readonly coreGeometry: THREE.BufferGeometry
  readonly shellGeometry: THREE.BufferGeometry
  readonly coreMaterial: THREE.MeshBasicMaterial
  readonly shellMaterial: THREE.MeshBasicMaterial
  readonly trailMaterials: THREE.MeshBasicMaterial[]
}

let sphereGeometry: THREE.BufferGeometry | null = null
let shardGeometry: THREE.BufferGeometry | null = null
let globGeometry: THREE.BufferGeometry | null = null

function geometryFor(shape: Shape): THREE.BufferGeometry {
  switch (shape) {
    case 'sphere':
      return (sphereGeometry ??= new THREE.IcosahedronGeometry(0.5, 1))
    case 'shard':
      // Elongated octahedron along +Z (the flight direction): 1 × 1 × 3.2
      return (shardGeometry ??= new THREE.OctahedronGeometry(0.5, 0).scale(1, 1, 3.2))
    case 'glob':
      return (globGeometry ??= new THREE.IcosahedronGeometry(0.5, 0))
  }
}

const resources = new Map<ProjectilePreset, PresetResources>()

function getResources(preset: ProjectilePreset): PresetResources {
  let res = resources.get(preset)
  if (res) return res
  const spec = SPECS[preset]
  const geometry = geometryFor(spec.shape)
  const glow = (color: number, opacity: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  res = {
    spec,
    coreGeometry: geometry,
    shellGeometry: geometry,
    coreMaterial: new THREE.MeshBasicMaterial({ color: spec.core }),
    shellMaterial: glow(spec.shell, 0.5),
    trailMaterials: TRAIL_OPACITY.map((opacity) => glow(spec.shell, opacity)),
  }
  resources.set(preset, res)
  return res
}

/**
 * A built preset visual. The root stays unrotated at the projectile's
 * position; `head` turns to face the flight direction; trail ghosts are laid
 * out behind the head along the flight direction.
 */
export class ProjectileVisual {
  readonly root = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly shell: THREE.Mesh
  private readonly ghosts: THREE.Mesh[] = []
  private readonly spec: PresetSpec
  private readonly size: number
  private spinAngle = Math.random() * Math.PI * 2
  private time = Math.random() * 10

  private static readonly forward = new THREE.Vector3(0, 0, 1)
  private static readonly tumbleAxis = new THREE.Vector3(0.6, 0.8, 0).normalize()
  private static readonly dir = new THREE.Vector3()
  private static readonly spinQuat = new THREE.Quaternion()

  constructor(preset: ProjectilePreset, scale: number, trail: boolean | undefined) {
    const res = getResources(preset)
    this.spec = res.spec
    this.size = res.spec.size * scale

    const core = new THREE.Mesh(res.coreGeometry, res.coreMaterial)
    core.scale.setScalar(this.size)
    this.shell = new THREE.Mesh(res.shellGeometry, res.shellMaterial)
    this.shell.scale.setScalar(this.size * res.spec.shellScale)
    this.head.add(core, this.shell)
    this.root.add(this.head)

    if (trail ?? res.spec.trail) {
      res.trailMaterials.forEach((material, i) => {
        const ghost = new THREE.Mesh(res.shellGeometry, material)
        ghost.scale.setScalar(this.size * res.spec.shellScale * (0.9 - i * 0.15))
        this.ghosts.push(ghost)
        this.root.add(ghost)
      })
    }

    // Additive glow sorts after opaque geometry; keep it from flickering in
    // and out at frustum edges on its tiny bounds
    this.root.traverse((object) => {
      object.frustumCulled = false
    })
  }

  /** Orient along `velocity`, animate spin/flicker and place the trail. */
  update(deltaTime: number, velocity: THREE.Vector3): void {
    this.time += deltaTime
    const dir = ProjectileVisual.dir.copy(velocity)
    const speed = dir.length()
    if (speed > 1e-4) dir.divideScalar(speed)
    else dir.set(0, 0, 1)

    this.head.quaternion.setFromUnitVectors(ProjectileVisual.forward, dir)
    if (this.spec.spin !== 0) {
      this.spinAngle += this.spec.spin * deltaTime
      // Shards roll around their flight axis; spheres and globs tumble
      const axis = this.spec.shape === 'shard' ? ProjectileVisual.forward : ProjectileVisual.tumbleAxis
      this.head.quaternion.multiply(ProjectileVisual.spinQuat.setFromAxisAngle(axis, this.spinAngle))
    }

    if (this.spec.flicker > 0) {
      const pulse = 1 + this.spec.flicker * Math.sin(this.time * 23) * Math.sin(this.time * 7.3)
      this.shell.scale.setScalar(this.size * this.spec.shellScale * pulse)
    }

    // Trail ghosts trail behind along the flight direction (none when still)
    const spacing = speed > 1e-4 ? this.size * 0.9 : 0
    for (let i = 0; i < this.ghosts.length; i++) {
      this.ghosts[i].position.copy(dir).multiplyScalar(-spacing * (i + 1))
    }
  }
}

/** Default hit radius (blocks) for a preset at a visual scale. */
export function presetHitRadius(preset: ProjectilePreset, scale: number): number {
  return SPECS[preset].size * scale * 0.5 + 0.12
}
