import * as THREE from 'three'
import { Entity } from '../../entities/Entity.ts'
import type { IItem } from '../../items/Item.ts'
import { getBlock } from '../../world/blocks/BlockRegistry.ts'
import { playSound } from '../../audio/SoundHooks.ts'
import { waterWake } from '../WaterEffects.ts'

/** Steering input from the rider (setupBoats). */
export interface BoatInput {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
}

export interface BoatConfig {
  position: THREE.Vector3
  /** Heading (radians; 0 = facing +Z). */
  yaw?: number
  /** The boat item it breaks back into. */
  createItem?: () => IItem | null
}

/** How a kind of boat floats, steers, carries its rider and breaks. */
export interface BoatHandling {
  /** How deep the hull sits in the water, and its bob on the swell. */
  readonly draft: number
  readonly bob: number
  /** Turning (radians/s) at rest, per block/s of speed, and at most (a wide turn at speed). */
  readonly turnBase: number
  readonly turnPerSpeed: number
  readonly turnMax: number
  /** Boat-local (forward, side) points of the hull that must stay over water. */
  readonly hullPoints: ReadonlyArray<readonly [number, number]>
  /** The wake trails from this far behind the boat's centre. */
  readonly sternOffset: number
  /** Hits that break it back into its item. */
  readonly hitsToBreak: number
  /** Where the rider sits (boat-local: + forward, + up). */
  readonly seatForward: number
  readonly seatUp: number
}

/** What a boat's propulsion wants this step (filled in by `drive`). */
export interface BoatDrive {
  /** Forward speed to make for (blocks/s, negative backing), and the time constant (seconds) to approach it. */
  target: number
  seconds: number
  /** Sideways push on the water (blocks/s, world axes): a sail's leeway. */
  driftX: number
  driftZ: number
}

/** Hull moves are checked in steps no longer than this (blocks), so a fast boat never jumps a sandbar. */
const MOVE_STEP = 0.4

/**
 * A boat: floats on water with a bob, carried by river currents
 * (WaterCurrents); the rider's keys (setupBoats) drive and steer it. A kind of
 * boat gives its handling, how it is driven (`drive`: a sail on the wind,
 * paddles) and animates its own parts (`animate`). It runs aground on
 * shallows and banks - only a move from water onto land is blocked, so a boat
 * pushed half up a beach can still get off - and hits break it back into its
 * item. Speed eases toward the drive's target, so a boat picks up way and
 * glides on when it stops.
 */
export abstract class BoatEntity extends Entity {
  /** Boats come and go with their registry (setupBoats), never the distance despawn. */
  readonly keepLoaded = true
  /** Breaking a boat is no kill; every hit sounds as wood, with no cry (EntityVoices: a blocked hit). */
  readonly countsAsKill = false
  readonly lastHitBlocked = true

  yaw: number
  /** Forward speed (blocks/s, negative backing). */
  speed = 0
  /** Being ridden (its controller moves it; never hit by its own rider). */
  ridden = false
  readonly input: BoatInput = { forward: false, back: false, left: false, right: false }

  protected abstract readonly handling: BoatHandling
  protected time = Math.random() * 10
  /** The rudder or paddles' turn, eased: -1 (right) .. 1 (left). */
  protected rudder = 0
  protected readonly soundPos = { x: 0, y: 0, z: 0 }
  private hits = 0
  private destroyed = false
  private blockAt: ((x: number, y: number, z: number) => number) | null = null
  private currentAt: ((x: number, y: number, z: number, out: THREE.Vector3) => void) | null = null
  private readonly createItem: (() => IItem | null) | undefined
  private readonly current = new THREE.Vector3()
  private readonly driveOut: BoatDrive = { target: 0, seconds: 1, driftX: 0, driftZ: 0 }
  private wakeClock = 0

  constructor(type: string, config: BoatConfig, hitboxSize: THREE.Vector3) {
    super(type, {
      position: config.position,
      hasPhysics: true, // a hitbox for breaking it; it moves itself
      hitboxSize,
    })
    this.yaw = config.yaw ?? 0
    this.createItem = config.createItem
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = true
  }

  /**
   * An invisible lid across the inside of the hull, a little above the
   * waterline: it writes only depth, after the boat and before the water (which
   * draws in the transparent pass), so the water's surface - higher than the
   * floor of a hull sitting in it - never shows inside the boat. `outline`
   * traces the inside of the walls (boat-local x/z in `unit`s) and `height` is
   * above the waterline in every heel; call it after optimizeEntityMesh (it
   * must not be merged).
   */
  protected addWaterMask(parent: THREE.Object3D, outline: ReadonlyArray<readonly [number, number]>, height: number, unit: number): void {
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x * unit, -z * unit)))
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2)
    const mask = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }))
    mask.position.y = height * unit
    mask.renderOrder = 1
    parent.add(mask)
  }

  /** Where the rider sits, boat-local (setupBoats). */
  get seatForward(): number {
    return this.handling.seatForward
  }

  get seatUp(): number {
    return this.handling.seatUp
  }

  setWorldQueryFns(blockQuery: (x: number, y: number, z: number) => number, _solidQuery: (x: number, y: number, z: number) => boolean): void {
    this.blockAt = blockQuery
  }

  /** River currents (WaterCurrents.currentAt). */
  setCurrentQuery(currentAt: (x: number, y: number, z: number, out: THREE.Vector3) => void): void {
    this.currentAt = currentAt
  }

  get isDestroyed(): boolean {
    return this.destroyed
  }

  /** What the boat's propulsion wants now (into `out`); `surface` is null when it is beached. */
  protected abstract drive(deltaTime: number, surface: number | null, out: BoatDrive): void

  /** Animate the boat's own parts and place them (the mesh follows the boat in `syncTransform`). */
  protected abstract animate(deltaTime: number, surface: number | null): void

  /**
   * The EntityManager's update (NORMAL priority, may skip frames): drifts the
   * boat while nobody rides it. A ridden boat is stepped by setupBoats'
   * CRITICAL task instead, so it and the rider's view never stutter apart.
   */
  update(deltaTime: number): void {
    if (!this.ridden) this.step(deltaTime)
  }

  /** Drive, steer, float and animate for `deltaTime` seconds. */
  step(deltaTime: number): void {
    this.time += deltaTime
    const handling = this.handling
    const surface = this.waterSurface()

    const drive = this.driveOut
    drive.target = 0
    drive.seconds = 1
    drive.driftX = 0
    drive.driftZ = 0
    this.drive(deltaTime, surface, drive)
    this.speed += (drive.target - this.speed) * (1 - Math.exp(-deltaTime / Math.max(0.05, drive.seconds)))
    if (surface === null) this.speed *= Math.exp(-6 * deltaTime) // beached

    // Steering: bites harder with way on (and reverses when backing)
    const steer = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0)
    this.rudder += ((this.ridden ? steer : 0) - this.rudder) * Math.min(1, deltaTime * 6)
    const turnRate = Math.min(handling.turnBase + handling.turnPerSpeed * Math.abs(this.speed), handling.turnMax)
    this.yaw += turnRate * this.rudder * (this.speed < -0.1 ? -1 : 1) * deltaTime

    // Movement: way on, drift, and the river's current
    let mx = Math.sin(this.yaw) * this.speed
    let mz = Math.cos(this.yaw) * this.speed
    if (surface !== null) {
      mx += drive.driftX
      mz += drive.driftZ
      if (this.currentAt) {
        this.currentAt(Math.floor(this.position.x), Math.floor(surface - 0.5), Math.floor(this.position.z), this.current)
        mx += this.current.x
        mz += this.current.z
      }
    }
    this.moveHull(mx * deltaTime, mz * deltaTime, surface)

    // Float on the surface with a gentle bob, a wake of foam astern
    if (surface !== null) {
      const targetY = surface - handling.draft + Math.sin(this.time * 1.7) * handling.bob
      this.position.y += (targetY - this.position.y) * Math.min(1, deltaTime * 6)
      this.wakeClock -= deltaTime
      const speed = Math.abs(this.speed)
      if (speed > 1.2 && this.wakeClock <= 0) {
        // (closer together at speed: one every ~0.3 blocks travelled, at most 40 a second)
        this.wakeClock = Math.max(0.025, Math.min(0.08, 0.3 / speed))
        const dir = Math.sign(this.speed)
        const fx = Math.sin(this.yaw) * dir
        const fz = Math.cos(this.yaw) * dir
        waterWake(this.position.x - fx * handling.sternOffset, surface, this.position.z - fz * handling.sternOffset, fx, fz, speed)
      }
    }

    this.animate(deltaTime, surface)
    this.syncTransform()
  }

  /**
   * Move by (dx, dz) unless the hull would run onto the bank or ground in the
   * shallows (it stops, bumping back), in short steps.
   */
  private moveHull(dx: number, dz: number, surface: number | null): void {
    if ((dx === 0 && dz === 0) || surface === null) return
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MOVE_STEP))
    for (let i = 0; i < steps; i++) {
      if (!this.moveHullStep(dx / steps, dz / steps, surface)) return
    }
  }

  private moveHullStep(dx: number, dz: number, surface: number): boolean {
    const ox = this.position.x
    const oz = this.position.z
    const nx = ox + dx
    const nz = oz + dz
    const hx = Math.sin(this.yaw)
    const hz = Math.cos(this.yaw)
    const keelY = Math.floor(surface - this.handling.draft - 0.35)
    const waterline = Math.floor(surface - 0.5)
    // Water under the keel, or at least at the waterline with nothing solid under it
    const clear = (x: number, z: number): boolean => {
      const bx = Math.floor(x)
      const bz = Math.floor(z)
      return this.isWater(bx, keelY, bz) || (this.isWater(bx, waterline, bz) && !this.isSolid(bx, keelY, bz))
    }
    for (const [f, s] of this.handling.hullPoints) {
      const ax = hx * f + hz * s
      const az = hz * f - hx * s
      if (!clear(nx + ax, nz + az) && clear(ox + ax, oz + az)) {
        if (Math.abs(this.speed) > 2) {
          this.setSoundPos()
          playSound('block.wood.hit', this.soundPos, { volume: Math.min(1, 0.4 + Math.abs(this.speed) * 0.03), pitch: 0.7 })
        }
        this.speed *= -0.25
        return false
      }
    }
    this.position.x = nx
    this.position.z = nz
    return true
  }

  /** The water surface under the boat (world Y), or null when there is no water there (beached). */
  protected waterSurface(): number | null {
    const x = Math.floor(this.position.x)
    const z = Math.floor(this.position.z)
    const start = Math.floor(this.position.y + this.handling.draft + 0.5)
    for (let y = start + 1; y >= start - 3; y--) {
      const fill = this.waterFill(x, y, z)
      if (fill > 0) {
        if (this.waterFill(x, y + 1, z) > 0) continue
        return y + fill
      }
    }
    return null
  }

  private waterFill(x: number, y: number, z: number): number {
    if (!this.blockAt) return 0
    const props = getBlock(this.blockAt(x, y, z)).properties
    if (props.isLiquid) return props.liquidFamily === 'lava' ? 0 : props.isFallingLiquid ? 1 : (props.liquidLevel ?? 8) / 8
    return props.submergedIn !== undefined ? 1 : 0
  }

  private isWater(x: number, y: number, z: number): boolean {
    return this.waterFill(x, y, z) > 0
  }

  private isSolid(x: number, y: number, z: number): boolean {
    return this.blockAt ? getBlock(this.blockAt(x, y, z)).properties.isSolid : false
  }

  protected setSoundPos(): void {
    this.soundPos.x = this.position.x
    this.soundPos.y = this.position.y
    this.soundPos.z = this.position.z
  }

  private syncTransform(): void {
    const mesh = this.getMesh()
    if (mesh) {
      mesh.position.copy(this.position)
      mesh.rotation.y = this.yaw
    }
    const physics = this.getPhysicsBody()
    if (physics) physics.position.copy(this.position)
  }

  // --- Breaking ---

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (this.ridden || this.destroyed) return false
    return playerPosition.distanceTo(this.position) <= maxDistance + 1.5
  }

  onPlayerInteract(_playerPosition: THREE.Vector3, isLeftClick: boolean, _heldItem: IItem | null): boolean {
    if (!isLeftClick || this.destroyed) return false
    this.hits++
    this.setSoundPos()
    this.onHit()
    if (this.hits >= this.handling.hitsToBreak) {
      this.destroyed = true
      playSound('block.wood.break', this.soundPos)
    }
    return true
  }

  /** A hit landed (a shudder). */
  protected onHit(): void {}

  /** Broken: it drops itself, as an item. */
  getDrops(): IItem[] {
    if (!this.destroyed || !this.createItem) return []
    const item = this.createItem()
    return item ? [item] : []
  }

  get isAlive(): boolean {
    return !this.destroyed && super.isAlive
  }

  dispose(): void {
    this.blockAt = null
    this.currentAt = null
    super.dispose()
  }
}
