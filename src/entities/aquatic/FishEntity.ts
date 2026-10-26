import * as THREE from 'three'
import { PeacefulEntity } from '../PeacefulEntity.ts'
import type { IEntityDrop } from '../PeacefulEntity.ts'
import type { IEntity } from '../interfaces/IEntity.ts'
import type { IItem } from '../../items/Item.ts'
import { optimizeEntityMesh } from '../EntityMeshOptimizer.ts'
import { getBlock } from '../../world/blocks/BlockRegistry.ts'
import { worldClock } from '../../daynight/WorldClock.ts'
import { playSound } from '../../audio/SoundHooks.ts'
import type { FishColors, FishSpecies } from './FishSpecies.ts'

const S = 0.0625 // 1 "pixel" = 1/16 block

/** Wander targets around the school's centre (blocks). */
const SCHOOL_RADIUS = 4.5
const SCHOOL_HEIGHT = 1.6
const RETARGET_MIN = 1.5
const RETARGET_MAX = 3.5
/** Never strays further than this from where it spawned. */
const LEASH = 28
/** The player this close (in or near the water) sends it darting off. */
const STARTLE_RANGE = 3.2
const FLEE_TIME = 1.4
const FLEE_SPEED_FACTOR = 2.2
/** Keeps this far below the surface (blocks), or this far above the bed for bottom fish. */
const SURFACE_MARGIN = 0.35
/** Out of water: hops every so often and loses 1 HP every FLOP_DAMAGE_INTERVAL seconds. */
const FLOP_HOP_MIN = 0.5
const FLOP_HOP_MAX = 1.1
const FLOP_DAMAGE_INTERVAL = 2.5

type FishState = 'swim' | 'flee' | 'flop'

export interface FishConfig {
  position: THREE.Vector3
  species: FishSpecies
  /** Palette of a species with several (reef fish); random when omitted. */
  palette?: number
  /** Bring a school along on spawn (default true - the spawner's fish). */
  school?: boolean
  /** Item factory for the species' drop (setupWater resolves item ids). */
  createDrop?: () => IItem | null
}

/**
 * A fish, or a jellyfish: one entity class for every species in
 * FISH_SPECIES, its pixel-box body built from the species' data.
 *
 * Fish swim in schools (the spawned one brings its schoolmates, who keep
 * around it) through the water - and only the water: every move is checked
 * against the blocks, so they turn back from the bed, the banks and the
 * surface. Each species keeps to its depth (minnows and reef fish near the
 * top of shallow water, cod down deep, catfish along the bottom). The player
 * close by sends a school darting off. Knocked out onto dry land a fish
 * flops about and suffocates unless it gets back into the water.
 * Jellyfish drift slowly, pulsing, and glow softly after dark.
 */
export class FishEntity extends PeacefulEntity {
  readonly type: string
  readonly species: FishSpecies

  private fishState: FishState = 'swim'
  private stateTime = 0
  private time = Math.random() * 10
  private retargetTimer = 0
  private flopTimer = 0
  private airTime = 0
  private readonly phase = Math.random() * Math.PI * 2
  private readonly palette: FishColors
  private readonly paletteIndex: number
  private readonly bringsSchool: boolean
  private leader: FishEntity | null = null
  private readonly spawnPoint = new THREE.Vector3()
  private readonly swimVel = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly soundPos = { x: 0, y: 0, z: 0 }

  private player: THREE.Vector3 | null = null
  private blockAt: ((x: number, y: number, z: number) => number) | null = null
  private spawnFn: ((entity: IEntity) => boolean) | null = null
  private readonly createDrop: (() => IItem | null) | undefined

  // Model parts
  private pose: THREE.Group | null = null
  private tail: THREE.Group | null = null
  private tentacles: THREE.Group[] = []
  private glowMaterial: THREE.MeshBasicMaterial | null = null

  constructor(config: FishConfig) {
    const species = config.species
    const drops: IEntityDrop[] = config.createDrop
      ? [{ createItem: () => config.createDrop!() as IItem, minCount: 1, maxCount: 1 }]
      : []
    const size = Math.max(species.length, species.width) * S
    super(species.type, {
      position: config.position,
      hasPhysics: true, // hitbox for player attacks, and for flopping on land; swimming is manual
      hitboxSize: new THREE.Vector3(Math.max(0.3, size * 0.8), Math.max(0.22, species.height * S * 1.2), Math.max(0.3, size * 0.8)),
      maxHealth: species.maxHealth,
      knockbackHorizontal: 5,
      knockbackVertical: 2,
      knockbackStunTime: 0.15,
      drops,
    })
    this.type = species.type
    this.species = species
    this.paletteIndex = config.palette ?? Math.floor(Math.random() * species.colors.length)
    this.palette = species.colors[this.paletteIndex % species.colors.length]
    this.bringsSchool = config.school ?? true
    this.createDrop = config.createDrop
    this.spawnPoint.copy(config.position)
    const body = this.getPhysicsBody()
    if (body) {
      body.skipPhysics = true
      // Flopping on a beach, it doesn't float - it's back to swimming in water
      body.buoyancy = 0
    }
  }

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.player = positionRef
  }

  setWorldQueryFns(blockQuery: (x: number, y: number, z: number) => number, _solidQuery: (x: number, y: number, z: number) => boolean): void {
    this.blockAt = blockQuery
  }

  setEntitySpawnFn(spawn: (entity: IEntity) => boolean): void {
    this.spawnFn = spawn
  }

  /** Fish are their own swimmers: they never look for land (PeacefulEntity's water avoidance). */
  setLiquidQueryFn(): void {}

  onSpawn(): void {
    super.onSpawn()
    this.spawnPoint.copy(this.position)
    this.pickTarget()
    this.syncTransform()
    if (this.bringsSchool) this.spawnSchool()
  }

  /** The spawner's fish brings its schoolmates, in the water around it. */
  private spawnSchool(): void {
    if (!this.spawnFn) return
    const [min, max] = this.species.school
    const extra = min - 1 + Math.floor(Math.random() * (max - min + 1))
    for (let i = 0; i < extra; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 0.6 + Math.random() * 1.6
      const pos = new THREE.Vector3(this.position.x + Math.cos(a) * r, this.position.y + (Math.random() - 0.5) * 0.8, this.position.z + Math.sin(a) * r)
      if (!this.swimmable(pos.x, pos.y, pos.z)) pos.copy(this.position)
      const mate = new FishEntity({ position: pos, species: this.species, palette: this.paletteIndex, school: false, createDrop: this.createDrop })
      mate.leader = this
      this.spawnFn(mate)
    }
  }

  // --- Model ---

  protected createMesh(): THREE.Object3D {
    return this.species.shape === 'jelly' ? this.createJellyMesh() : this.createFishMesh()
  }

  private lit(color: number): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color })
    this.registerMaterialForLighting(material)
    return material
  }

  private createFishMesh(): THREE.Object3D {
    const sp = this.species
    const c = this.palette
    const root = new THREE.Group()
    const bodyM = this.lit(c.body)
    const backM = this.lit(c.back)
    const bellyM = this.lit(c.belly)
    const finM = this.lit(c.fin)
    const markM = c.mark !== undefined ? this.lit(c.mark) : bodyM
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x0c0c0e })
    const eyeRing = this.lit(0xe8e8dc)

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      parent.add(mesh)
      return mesh
    }

    const pose = new THREE.Group()
    pose.position.y = sp.height * 0.6 * S + 0.04
    root.add(pose)
    this.pose = pose

    // Three body sections nose to tail root (+Z is forward): head, middle, rear, each a flank with a back and belly
    const L = sp.length
    const H = sp.height
    const W = sp.width
    const sections: Array<[number, number, number, number]> = [
      // [z centre, length, height scale, width scale]
      [L * 0.32, L * 0.36, 0.82, 0.8],
      [0, L * 0.34, 1, 1],
      [-L * 0.3, L * 0.3, 0.66, 0.62],
    ]
    for (const [z, len, hs, ws] of sections) {
      const h = H * hs
      const w = W * ws
      box(w, h * 0.56, len, bodyM, 0, 0, z, pose)
      box(w * 0.92, h * 0.24, len * 0.98, backM, 0, h * 0.38, z, pose)
      box(w * 0.86, h * 0.22, len * 0.96, bellyM, 0, -h * 0.38, z, pose)
    }
    // Markings on the flanks
    const flank = W * 0.5 + 0.05
    if (sp.marks === 'lateral') {
      box(W + 0.1, H * 0.14, L * 0.78, markM === bodyM ? backM : markM, 0, H * 0.06, L * 0.02, pose)
    } else if (sp.marks === 'spots') {
      for (let i = 0; i < 7; i++) {
        const z = -L * 0.38 + (i / 6) * L * 0.7
        const y = ((i * 37) % 5) / 5 * H * 0.5 - H * 0.12
        for (const side of [-1, 1]) box(0.25, H * 0.12, 0.6, markM, side * flank, y, z, pose)
      }
    } else if (sp.marks === 'stripes') {
      for (let i = 0; i < 4; i++) {
        const z = -L * 0.3 + i * L * 0.2
        for (const side of [-1, 1]) box(0.25, H * 0.7, 0.45, markM, side * flank, 0.1, z, pose)
      }
    } else if (sp.marks === 'band' && c.mark !== undefined) {
      for (const z of [L * 0.28, -L * 0.08]) box(W + 0.12, H * 0.9, 0.8, markM, 0, 0, z, pose)
    }
    // Eyes
    for (const side of [-1, 1]) {
      box(0.2, 0.9, 0.9, eyeRing, side * (W * 0.42 + 0.06), H * 0.14, L * 0.4, pose)
      box(0.24, 0.5, 0.5, eyeM, side * (W * 0.42 + 0.1), H * 0.14, L * 0.42, pose)
    }
    // Fins: dorsal, pectorals, belly
    const dorsalH = sp.tallFin ? H * 0.9 : H * 0.45
    box(0.3, dorsalH, L * 0.32, finM, 0, H * 0.5 + dorsalH * 0.4, 0, pose)
    for (const side of [-1, 1]) {
      const fin = box(1.2, 0.25, L * 0.18, finM, side * (W * 0.5 + 0.4), -H * 0.18, L * 0.14, pose)
      fin.rotation.z = side * 0.5
    }
    box(0.28, H * 0.3, L * 0.16, finM, 0, -H * 0.55, -L * 0.12, pose)
    if (sp.whiskers) {
      for (const side of [-1, 1]) {
        const whisker = box(0.2, 0.2, L * 0.28, backM, side * W * 0.38, -H * 0.12, L * 0.62, pose)
        whisker.rotation.y = side * 0.5
      }
    }
    // Tail: a hinge at the tail root with a (forked) fin
    const tail = new THREE.Group()
    tail.position.set(0, 0, -L * 0.45 * S)
    pose.add(tail)
    this.tail = tail
    box(W * 0.4, H * 0.42, L * 0.14, bodyM, 0, 0, -L * 0.05, tail)
    if (sp.forkedTail) {
      for (const up of [-1, 1]) {
        const lobe = box(0.3, H * 0.5, L * 0.22, finM, 0, up * H * 0.28, -L * 0.2, tail)
        lobe.rotation.x = up * 0.45
      }
    } else {
      box(0.3, H * 0.9, L * 0.2, finM, 0, 0, -L * 0.2, tail)
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [pose, tail],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return root
  }

  private createJellyMesh(): THREE.Object3D {
    const sp = this.species
    const c = this.palette
    const root = new THREE.Group()
    const bell = new THREE.MeshLambertMaterial({ color: c.body, transparent: true, opacity: 0.62, depthWrite: false })
    const cap = new THREE.MeshLambertMaterial({ color: c.back, transparent: true, opacity: 0.72, depthWrite: false })
    this.registerMaterialForLighting(bell)
    this.registerMaterialForLighting(cap)
    this.glowMaterial = new THREE.MeshBasicMaterial({ color: sp.glow ?? c.fin, transparent: true, opacity: 0.85, depthWrite: false })
    const tentacleM = new THREE.MeshLambertMaterial({ color: c.fin, transparent: true, opacity: 0.55, depthWrite: false })
    this.registerMaterialForLighting(tentacleM)

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      parent.add(mesh)
      return mesh
    }
    const pose = new THREE.Group()
    pose.position.y = sp.height * S
    root.add(pose)
    this.pose = pose
    const D = sp.width
    box(D, sp.height * 0.55, D, bell, 0, 0, 0, pose)
    box(D * 0.72, sp.height * 0.3, D * 0.72, cap, 0, sp.height * 0.42, 0, pose)
    box(D * 0.36, sp.height * 0.3, D * 0.36, this.glowMaterial, 0, sp.height * 0.1, 0, pose)
    this.tentacles = []
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const strand = new THREE.Group()
      strand.position.set(Math.cos(a) * D * 0.3 * S, -sp.height * 0.28 * S, Math.sin(a) * D * 0.3 * S)
      box(0.4, sp.height * 1.3, 0.4, i % 2 === 0 ? tentacleM : this.glowMaterial, 0, -sp.height * 0.65, 0, strand)
      pose.add(strand)
      this.tentacles.push(strand)
    }
    return root
  }

  // --- Behaviour ---

  update(deltaTime: number): void {
    const physics = this.getPhysicsBody()
    if (this._isDying) {
      if (physics) physics.skipPhysics = false
      super.update(deltaTime)
      return
    }
    this.time += deltaTime
    this.stateTime += deltaTime

    const inWater = this.swimmable(this.position.x, this.position.y, this.position.z)
    if (!inWater && this.fishState !== 'flop') this.enter('flop')
    if (this.fishState === 'flop') {
      this.updateFlop(deltaTime, inWater)
      return
    }
    if (physics) physics.skipPhysics = true

    const player = this.player
    if (player && this.fishState !== 'flee') {
      const d = this.tmp.set(player.x - this.position.x, player.y + 0.9 - this.position.y, player.z - this.position.z).length()
      if (d < STARTLE_RANGE) this.enter('flee')
    }

    let speed = this.species.speed
    if (this.fishState === 'flee') {
      const from = player ?? this.spawnPoint
      this.tmp.set(this.position.x - from.x, 0, this.position.z - from.z)
      if (this.tmp.lengthSq() < 1e-4) this.tmp.set(Math.random() - 0.5, 0, Math.random() - 0.5)
      this.tmp.normalize()
      this.target.set(this.position.x + this.tmp.x * 4, this.position.y, this.position.z + this.tmp.z * 4)
      speed *= FLEE_SPEED_FACTOR
      if (this.stateTime >= FLEE_TIME) {
        this.enter('swim')
        this.pickTarget()
      }
    } else {
      this.retargetTimer -= deltaTime
      if (this.retargetTimer <= 0 || this.position.distanceTo(this.target) < 0.4) this.pickTarget()
    }

    this.steer(speed, deltaTime)
    this.swimStep(deltaTime)
    this.face(deltaTime)
    this.syncTransform()
    this.isWalking = true
    this.updateAnimations(deltaTime)
  }

  private enter(state: FishState): void {
    if (state === 'flop' && this.fishState !== 'flop') {
      this.airTime = 0
      this.flopTimer = 0.2
      const physics = this.getPhysicsBody()
      if (physics) {
        physics.skipPhysics = false
        physics.velocity.copy(this.swimVel).multiplyScalar(0.5)
      }
    }
    this.fishState = state
    this.stateTime = 0
  }

  /** Out of the water: flop about (physics carries it), suffocating, until it lands back in. */
  private updateFlop(deltaTime: number, inWater: boolean): void {
    const physics = this.getPhysicsBody()
    if (inWater) {
      if (physics) {
        physics.skipPhysics = true
        this.swimVel.copy(physics.velocity).multiplyScalar(0.3)
        physics.velocity.set(0, 0, 0)
      }
      this.enter('swim')
      this.pickTarget()
      return
    }
    // The physics body moved it: follow it
    if (physics) this.position.copy(physics.position)
    this.flopTimer -= deltaTime
    if (this.flopTimer <= 0 && physics?.isOnGround) {
      this.flopTimer = FLOP_HOP_MIN + Math.random() * (FLOP_HOP_MAX - FLOP_HOP_MIN)
      const a = Math.random() * Math.PI * 2
      physics.velocity.set(Math.cos(a) * 1.4, 4.2 + Math.random() * 1.5, Math.sin(a) * 1.4)
      this.soundPos.x = this.position.x
      this.soundPos.y = this.position.y
      this.soundPos.z = this.position.z
      playSound('player.splash.small', this.soundPos, { volume: 0.25, pitch: 1.8 })
    }
    this.airTime += deltaTime
    if (this.airTime >= FLOP_DAMAGE_INTERVAL) {
      this.airTime -= FLOP_DAMAGE_INTERVAL
      this.health -= 1
      if (this.health <= 0) {
        this._isDying = true
        this.deathTimer = 0
      }
    }
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    // Lying on its side, thrashing
    if (this.pose) {
      this.pose.rotation.z += (Math.PI / 2 - this.pose.rotation.z) * Math.min(1, deltaTime * 8)
      this.pose.rotation.x = Math.sin(this.time * 18) * 0.3
    }
    if (this.tail) this.tail.rotation.y = Math.sin(this.time * 22) * 0.7
  }

  /** The point the school swims around: the leader while it lives, else its own spawn point. */
  private schoolCentre(): THREE.Vector3 {
    const leader = this.leader
    if (leader && leader.isAlive && !leader.isDying && leader.fishState !== 'flop') return leader.position
    return this.spawnPoint
  }

  /** A new spot in the water around the school's centre, at the species' depth. */
  private pickTarget(): void {
    this.retargetTimer = RETARGET_MIN + Math.random() * (RETARGET_MAX - RETARGET_MIN)
    const centre = this.schoolCentre()
    const leash = this.position.distanceTo(this.spawnPoint) > LEASH
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * SCHOOL_RADIUS
      const x = (leash ? this.spawnPoint.x : centre.x) + Math.cos(a) * r
      const z = (leash ? this.spawnPoint.z : centre.z) + Math.sin(a) * r
      let y = centre.y + (Math.random() * 2 - 1) * SCHOOL_HEIGHT
      y = this.depthFor(x, y, z)
      if (!this.swimmable(x, y, z)) continue
      this.target.set(x, y, z)
      return
    }
    this.target.copy(centre)
  }

  /** Move a target height toward the species' depth in the water column at (x, z). */
  private depthFor(x: number, y: number, z: number): number {
    const depth = this.species.depth
    if (depth === 'mid') return y
    const bx = Math.floor(x)
    const bz = Math.floor(z)
    let surface = Math.floor(y)
    while (surface < y + 12 && this.isWaterBlock(bx, surface + 1, bz)) surface++
    let bed = Math.floor(y)
    while (bed > y - 24 && this.isWaterBlock(bx, bed - 1, bz)) bed--
    if (depth === 'shallow') return Math.max(bed + 0.3, surface + 1 - SURFACE_MARGIN - Math.random() * 1.6)
    if (depth === 'bottom') return Math.min(surface + 1 - SURFACE_MARGIN, bed + 0.25 + Math.random() * 0.6)
    // Deep: the lower half of the column
    return bed + 0.3 + Math.random() * Math.max(0.2, (surface + 1 - bed) * 0.45)
  }

  private steer(speed: number, deltaTime: number): void {
    this.tmp.copy(this.target).sub(this.position)
    const dist = this.tmp.length()
    if (dist > 0.05) this.tmp.multiplyScalar(Math.min(speed, dist * 2) / dist)
    else this.tmp.set(0, 0, 0)
    // A gentle weave; jellyfish only drift and bob
    const t = this.time
    if (this.species.shape === 'jelly') {
      this.tmp.y += Math.sin(t * 1.1 + this.phase) * 0.35
    } else {
      this.tmp.x += Math.sin(t * 2.3 + this.phase) * 0.25 * speed
      this.tmp.z += Math.cos(t * 1.9 + this.phase) * 0.25 * speed
    }
    this.swimVel.lerp(this.tmp, Math.min(1, deltaTime * (this.fishState === 'flee' ? 6 : 2.5)))
  }

  /** Move by velocity·dt, only ever through water - fish turn back from the bed, banks and surface. */
  private swimStep(deltaTime: number): void {
    const pos = this.position
    const step = this.tmp.copy(this.swimVel).multiplyScalar(deltaTime)
    if (this.swimmable(pos.x + step.x, pos.y, pos.z)) pos.x += step.x
    else {
      this.swimVel.x *= -0.5
      this.retargetTimer = 0
    }
    if (this.swimmable(pos.x, pos.y, pos.z + step.z)) pos.z += step.z
    else {
      this.swimVel.z *= -0.5
      this.retargetTimer = 0
    }
    if (this.swimmable(pos.x, pos.y + step.y, pos.z) && this.swimmable(pos.x, pos.y + step.y + SURFACE_MARGIN, pos.z)) pos.y += step.y
    else this.swimVel.y *= -0.3
  }

  /** Face the way it swims, pitching up and down with its course. */
  private face(deltaTime: number): void {
    const mesh = this.getMesh()
    const pose = this.pose
    if (!mesh || !pose) return
    if (this.species.shape === 'jelly') return
    const dx = this.swimVel.x
    const dz = this.swimVel.z
    if (dx * dx + dz * dz > 0.01) {
      let delta = Math.atan2(dx, dz) - mesh.rotation.y
      delta = Math.atan2(Math.sin(delta), Math.cos(delta))
      mesh.rotation.y += delta * Math.min(1, deltaTime * 7)
    }
    const horizontal = Math.hypot(dx, dz)
    const pitch = Math.max(-0.6, Math.min(0.6, -Math.atan2(this.swimVel.y, Math.max(0.2, horizontal))))
    pose.rotation.x += (pitch - pose.rotation.x) * Math.min(1, deltaTime * 6)
    pose.rotation.z += (0 - pose.rotation.z) * Math.min(1, deltaTime * 6)
  }

  private syncTransform(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    const physics = this.getPhysicsBody()
    if (physics) physics.position.copy(this.position)
  }

  protected updateAnimations(deltaTime: number): void {
    if (this.species.shape === 'jelly') {
      // The bell pulses; tentacles trail and sway
      const pulse = Math.sin(this.time * 2.2 + this.phase)
      if (this.pose) this.pose.scale.set(1 + pulse * 0.1, 1 - pulse * 0.08, 1 + pulse * 0.1)
      for (let i = 0; i < this.tentacles.length; i++) {
        const strand = this.tentacles[i]
        strand.rotation.x = Math.sin(this.time * 1.4 + i * 1.3) * 0.25
        strand.rotation.z = Math.cos(this.time * 1.1 + i * 0.9) * 0.25
      }
      // A soft glow after dark
      if (this.glowMaterial) {
        const night = worldClock.nightAmount
        this.glowMaterial.opacity = 0.25 + 0.65 * night * (0.75 + 0.25 * Math.sin(this.time * 1.7 + this.phase))
      }
      return
    }
    // The tail beats faster the faster it swims
    const speed = this.swimVel.length()
    const rate = 6 + speed * 5
    if (this.tail) this.tail.rotation.y = Math.sin(this.time * rate + this.phase) * (0.35 + Math.min(0.35, speed * 0.1))
    void deltaTime
  }

  // --- World ---

  private isWaterBlock(x: number, y: number, z: number): boolean {
    const blockAt = this.blockAt
    if (!blockAt) return true
    const props = getBlock(blockAt(x, y, z)).properties
    const family = props.isLiquid ? props.liquidFamily : props.submergedIn
    return family !== undefined && this.species.waters.includes(family)
  }

  /** Water at the body centre (the block holding the point). */
  private swimmable(x: number, y: number, z: number): boolean {
    return this.isWaterBlock(Math.floor(x), Math.floor(y + 0.1), Math.floor(z))
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    const handled = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (!handled || this._isDying) return handled
    const physics = this.getPhysicsBody()
    if (physics && this.fishState !== 'flop') {
      // Knocked: it darts off along the blow (a hard hit at the surface can throw it out onto the bank)
      this.swimVel.copy(physics.velocity)
      physics.velocity.set(0, 0, 0)
      this.enter('flee')
    }
    return handled
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    return super.canPlayerInteract(playerPosition, maxDistance + 0.4)
  }

  dispose(): void {
    this.pose = null
    this.tail = null
    this.tentacles = []
    this.glowMaterial = null
    this.player = null
    this.blockAt = null
    this.spawnFn = null
    this.leader = null
    super.dispose()
  }
}
