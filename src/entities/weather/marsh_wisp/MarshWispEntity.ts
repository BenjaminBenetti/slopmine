import * as THREE from 'three'
import { AggressiveEntity } from '../../AggressiveEntity.ts'
import { AggressionMode } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IAggressiveEntityConfig } from '../../interfaces/IAggressiveEntityConfig.ts'
import type { IEntity } from '../../interfaces/IEntity.ts'
import { EntityState } from '../../interfaces/IEntity.ts'
import type { IItem } from '../../../items/Item.ts'
import { createItemFromId } from '../../../persistence/ItemRegistry.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'
import { ProjectileEntity } from '../../projectiles/ProjectileEntity.ts'
import { WeatherRetreat } from '../WeatherCreature.ts'
import { playSound } from '../../../audio/SoundHooks.ts'

// Colours: a pale core in a green flame, a dark hollow face
const CORE = 0xe2ffd8
const INNER = 0x86ff98
const SHELL = 0x3fe46c
const HALO = 0x39e06a
const HALO_INNER = 0x9dffb0
const TONGUE = 0x74ff96
const FACE = 0x0f3d1d
const MOTE = 0xbaffc8
const FLARE_CORE = 0xf2fff0
const FLARE_SHELL = 0x52f07a

const S = 0.0625 // 1 "pixel" = 1/16 block

// Tuning
const MAX_HEALTH = 18
const FLARE_DAMAGE = 4
const FLARE_SLOW_SECONDS = 3
const FLARE_SPEED = 5
const FLARE_HOMING = 1.2
/** The weathers it lives in (WeatherCatalog ids). */
const WISP_WEATHERS: ReadonlySet<string> = new Set(['glowmist', 'thick_fog'])
/** Lights in the fog are seen from afar: notice / lose the player at these ranges. */
const NOTICE_RANGE = 24
const LOSE_RANGE = 40
/** The lure keeps this far from the player (horizontally). */
const KEEP_MIN = 6
const KEEP_MAX = 10
/** Closer than this it hurries away. */
const TOO_CLOSE = 4
const DRIFT_SPEED = 1.2
const RETREAT_SPEED = 3.4
const HURRY_SPEED = 5.2
const APPROACH_SPEED = 2.4
const ORBIT_SPEED = 0.9
/** Every ~6 s it either casts a flare or blinks to a new spot. */
const ACTION_MIN = 5
const ACTION_MAX = 7
const FLARE_CHANCE = 0.6
/** Telegraph before a flare: the flame swells and whitens. */
const CAST_TIME = 0.9
/** Blink: gone for this long, then reappears elsewhere. */
const BLINK_OUT = 0.3
const BLINK_IN = 0.35
const FLEE_TIME = 1.8
/** Body centre above the wisp's position (the hitbox bottom). */
const BODY_CENTER = 0.4
/** Collision box half width / height. */
const HALF = 0.25
const COLLIDE_HEIGHT = 0.7
/** Hover height above ground or water when idle. */
const HOVER = 1.6
/** Exit: gutters out like a candle. */
const EXIT_SECONDS = 2.2
const DEATH_SECONDS = 1.0
const MOTE_COUNT = 7

type WispState = 'drift' | 'lure' | 'cast' | 'blink' | 'flee'

/**
 * Marsh Wisp - a will-o'-the-wisp of the swamp's glowmist and thick fog: a
 * floating green flame-orb about 0.7 blocks across with a pale core, a faint
 * hollow face and a few motes trailing off it. Its light shows through the
 * fog from far off; that is the lure.
 *
 * It never closes in. Once it has noticed the player it keeps 6-10 blocks
 * away, drifting off when approached (hurrying when cornered) and wandering
 * around them when left alone. Every ~6 s it either casts a slow homing
 * wisp-flare (4 'magic' damage + Frostbite-style slowness, 3 s) after a
 * swelling telegraph, or blinks out and reappears somewhere else around the
 * player. A blow knocks it away and sends it fleeing. When the fog lifts it
 * gutters out like a candle, its motes scattering.
 *
 * Stats: 18 HP. Drops: 1 wisp light.
 */
export class MarshWispEntity extends AggressiveEntity {
  readonly type = 'marsh_wisp'

  private wispState: WispState = 'drift'
  private stateTime = 0
  private time = Math.random() * 10
  private actionTimer = ACTION_MIN + Math.random() * (ACTION_MAX - ACTION_MIN)
  private orbitDir = Math.random() < 0.5 ? 1 : -1
  private readonly phaseA = Math.random() * Math.PI * 2
  private readonly phaseB = Math.random() * Math.PI * 2
  private readonly phaseC = Math.random() * Math.PI * 2
  private engaged = false
  /** The blink: where it reappears, and whether it has moved yet. */
  private readonly blinkTo = new THREE.Vector3()
  private blinkMoved = false
  /** 0 invisible .. 1 fully shown (blink fades). */
  private presence = 1
  /** Flame swell 0-1 (the cast telegraph). */
  private swell = 0

  private readonly retreat = new WeatherRetreat(WISP_WEATHERS, EXIT_SECONDS)
  private readonly exitDrift = new THREE.Vector3()
  private exitStarted = false

  private readonly flightVel = new THREE.Vector3()
  private readonly home = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly chest = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly step = new THREE.Vector3()
  private readonly soundPos = { x: 0, y: 0, z: 0 }

  private player: THREE.Vector3 | null = null
  private solidAt: ((x: number, y: number, z: number) => boolean) | null = null
  private blockAt: ((x: number, y: number, z: number) => number) | null = null
  private entitySpawnFn: ((entity: IEntity) => boolean) | null = null
  private readonly flares: IEntity[] = []
  private dropsTaken = false

  // Model parts
  private body: THREE.Group | null = null
  private flame: THREE.Group | null = null
  private tongues: THREE.Group[] = []
  private motes: THREE.Mesh[] = []
  /** Per-mote scatter direction for the exit and death. */
  private readonly moteDirs: THREE.Vector3[] = []
  private coreMaterial: THREE.MeshBasicMaterial | null = null
  private glowMaterials: Array<THREE.MeshBasicMaterial | THREE.SpriteMaterial> = []
  private faceMaterial: THREE.MeshBasicMaterial | null = null
  private readonly baseOpacity = new Map<THREE.Material, number>()
  private readonly baseColor = new Map<THREE.Material, THREE.Color>()
  private readonly white = new THREE.Color(0xffffff)

  constructor(config: Partial<IAggressiveEntityConfig> & { position: THREE.Vector3 }) {
    super('marsh_wisp', {
      ...config,
      hasPhysics: true, // hitbox for player attacks; flight is manual
      hitboxSize: new THREE.Vector3(0.6, 0.8, 0.6),
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      maxHealth: MAX_HEALTH,
      attackDamage: FLARE_DAMAGE,
      detectionRange: NOTICE_RANGE,
      knockbackHorizontal: 9,
      knockbackVertical: 3,
      knockbackStunTime: 0.2,
    })
    this.home.copy(config.position)
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = true
  }

  // ---- wiring (EntityManager duck-typed setters) ----

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.player = positionRef
  }

  setWorldQueryFns(blockQuery: (x: number, y: number, z: number) => number, solidQuery: (x: number, y: number, z: number) => boolean): void {
    this.blockAt = blockQuery
    this.solidAt = solidQuery
  }

  /** Wired by EntityManager (duck-typed): lets the wisp cast flares. */
  setEntitySpawnFn(spawn: (entity: IEntity) => boolean): void {
    this.entitySpawnFn = spawn
  }

  /** Flares still in flight (cleared with the wisp by any owner). */
  get spawnedChildren(): readonly IEntity[] {
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i]
      if (!f.isAlive || f.state === EntityState.DISPOSED) this.flares.splice(i, 1)
    }
    return this.flares
  }

  onSpawn(): void {
    // Spawned on the ground or the water: float up to hover height (as far as it is clear)
    const rise = HOVER + Math.random() * 0.8
    for (let climbed = 0; climbed < rise; climbed += 0.25) {
      if (!this.clear(this.position.x, this.position.y + 0.25, this.position.z)) break
      this.position.y += 0.25
    }
    this.home.copy(this.position)
    this.syncTransform()
  }

  // ---- model ----

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    // Self-lit: none of it is registered for world light. The glow ignores the
    // fog, so the wisp's light shows through it from afar - the lure.
    const basic = (color: number, opacity = 1, additive = false): THREE.MeshBasicMaterial => {
      const m = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1 || additive,
        opacity,
        depthWrite: !additive && opacity >= 1,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        fog: false,
      })
      this.baseOpacity.set(m, opacity)
      this.baseColor.set(m, new THREE.Color(color))
      return m
    }
    const core = basic(CORE)
    const inner = basic(INNER, 0.85)
    const shell = basic(SHELL, 0.42, true)
    const tongue = basic(TONGUE, 0.55, true)
    const face = basic(FACE, 0.75)
    const mote = basic(MOTE, 0.9, true)
    // Soft round glow around the flame: camera-facing sprites, not a box
    const glow = (color: number, opacity: number): THREE.SpriteMaterial => {
      const m = new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
      this.baseOpacity.set(m, opacity)
      this.baseColor.set(m, new THREE.Color(color))
      return m
    }
    const halo = glow(HALO, 0.42)
    const haloInner = glow(HALO_INNER, 0.35)
    this.coreMaterial = core
    this.faceMaterial = face
    this.glowMaterials = [core, inner, shell, halo, haloInner, tongue, face, mote]

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      parent.add(mesh)
      return mesh
    }

    const body = new THREE.Group()
    body.position.y = BODY_CENTER
    root.add(body)
    this.body = body

    // Glow of light around the whole flame
    const outerGlow = new THREE.Sprite(halo)
    outerGlow.scale.setScalar(1.9)
    outerGlow.position.y = 2 * S
    body.add(outerGlow)
    const innerGlow = new THREE.Sprite(haloInner)
    innerGlow.scale.setScalar(0.95)
    innerGlow.position.y = 1 * S
    body.add(innerGlow)

    // The flame: a teardrop of translucent green shells around the core
    const flame = new THREE.Group()
    body.add(flame)
    this.flame = flame
    // Shell layers turned alternately by 45° so the silhouette rounds off
    box(10, 6, 10, shell, 0, -1.2, 0, flame)
    box(9, 5, 9, shell, 0, 1.5, 0, flame).rotation.y = Math.PI / 4
    box(7, 4, 7, shell, 0, 4.6, 0, flame)
    box(5, 3, 5, shell, 0, 7.2, 0, flame).rotation.y = Math.PI / 4
    box(3, 3, 3, shell, 0, 9.4, 0, flame)
    box(7, 7, 7, inner, 0, 0, 0, flame)
    box(5, 4, 5, inner, 0, 4.2, 0, flame).rotation.y = Math.PI / 4
    box(4, 4, 4, core, 0, 0.6, 0, flame)
    // Faint hollow face on the front (+Z): two narrow eye slits and a round, wailing mouth
    for (const side of [-1, 1]) box(0.9, 2.2, 0.3, face, side * 1.5, 1.6, 3.6, flame)
    box(1.8, 0.5, 0.3, face, 0, -0.6, 3.6, flame)
    box(1.8, 0.5, 0.3, face, 0, -2.3, 3.6, flame)
    box(0.5, 1.4, 0.3, face, -1.05, -1.45, 3.6, flame)
    box(0.5, 1.4, 0.3, face, 1.05, -1.45, 3.6, flame)

    // Licking tongues of flame above, pivoted at their base
    this.tongues = []
    const tongueSpots: Array<[number, number, number]> = [[0, 10.5, 0], [-2, 8.5, 1], [2, 8.5, -1], [1, 9, 1.5]]
    for (const [x, y, z] of tongueSpots) {
      const pivot = new THREE.Group()
      pivot.position.set(x * S, y * S, z * S)
      box(1.8, 2.4, 1.8, tongue, 0, 1.2, 0, pivot)
      box(1.1, 2.6, 1.1, tongue, 0, 3.6, 0, pivot)
      box(0.6, 1.6, 0.6, tongue, 0, 5.5, 0, pivot)
      flame.add(pivot)
      this.tongues.push(pivot)
    }

    // Motes trailing off the flame (cycled in updateAnimations)
    this.motes = []
    this.moteDirs.length = 0
    const moteGeo = new THREE.BoxGeometry(1.3 * S, 1.3 * S, 1.3 * S)
    for (let i = 0; i < MOTE_COUNT; i++) {
      const m = new THREE.Mesh(moteGeo, mote)
      root.add(m)
      this.motes.push(m)
      const a = (i / MOTE_COUNT) * Math.PI * 2 + Math.random() * 0.5
      this.moteDirs.push(new THREE.Vector3(Math.cos(a), 0.4 + Math.random() * 0.8, Math.sin(a)).normalize())
    }
    return root
  }

  // ---- behaviour ----

  update(deltaTime: number): void {
    this.time += deltaTime
    if (this._isDying) {
      this.deathTimer += deltaTime
      this.animateDeath()
      if (this.deathTimer >= DEATH_SECONDS) this.kill()
      return
    }

    const exit = this.retreat.update(deltaTime, this.position.x, this.position.y + BODY_CENTER, this.position.z)
    if (exit > 0) {
      this.updateExit(deltaTime, exit)
      return
    }

    this.stateTime += deltaTime
    this.actionTimer -= deltaTime
    const player = this.player
    if (player) this.chest.set(player.x, player.y + 1.1, player.z)
    const dx = player ? this.position.x - player.x : 0
    const dz = player ? this.position.z - player.z : 0
    const flat = Math.hypot(dx, dz)
    const dist = player ? this.tmp.set(this.position.x, this.position.y + BODY_CENTER, this.position.z).distanceTo(this.chest) : Infinity
    if (!this.engaged && dist <= NOTICE_RANGE) {
      this.engaged = true
      if (this.wispState === 'drift') this.enter('lure')
    } else if (this.engaged && dist > LOSE_RANGE) {
      this.engaged = false
      this.home.copy(this.position)
      if (this.wispState !== 'blink') this.enter('drift')
    }

    let speed = DRIFT_SPEED
    switch (this.wispState) {
      case 'drift': {
        // Lazy wandering over its patch of marsh
        this.target.set(
          this.home.x + Math.sin(this.time * 0.31 + this.phaseA) * 3,
          this.hoverY(this.home.x, this.home.y, this.home.z) + Math.sin(this.time * 0.8 + this.phaseB) * 0.3,
          this.home.z + Math.sin(this.time * 0.23 + this.phaseC) * 3
        )
        break
      }
      case 'lure': {
        // Keep 6-10 blocks off: drift away when approached, back in when left behind, else wander around
        const nx = flat > 1e-3 ? dx / flat : 1
        const nz = flat > 1e-3 ? dz / flat : 0
        let tx = player!.x + nx * flat
        let tz = player!.z + nz * flat
        if (flat < KEEP_MIN) {
          tx = player!.x + nx * (KEEP_MIN + 2)
          tz = player!.z + nz * (KEEP_MIN + 2)
          speed = flat < TOO_CLOSE ? HURRY_SPEED : RETREAT_SPEED
        } else if (flat > KEEP_MAX) {
          tx = player!.x + nx * (KEEP_MAX - 1)
          tz = player!.z + nz * (KEEP_MAX - 1)
          speed = APPROACH_SPEED
        } else {
          if (Math.random() < deltaTime * 0.12) this.orbitDir = -this.orbitDir
          tx += -nz * this.orbitDir * 3
          tz += nx * this.orbitDir * 3
          speed = ORBIT_SPEED
        }
        const ty = Math.max(player!.y + 1.4 + Math.sin(this.time * 0.9 + this.phaseB) * 0.5, this.hoverY(tx, this.position.y, tz) - 0.6)
        this.target.set(tx, ty, tz)
        if (this.actionTimer <= 0) {
          this.actionTimer = ACTION_MIN + Math.random() * (ACTION_MAX - ACTION_MIN)
          // Too close to cast safely: blink away instead
          if (Math.random() < FLARE_CHANCE && flat >= KEEP_MIN - 1 && dist < 16 && this.hasClearLine()) this.enter('cast')
          else if (this.findBlinkSpot()) this.enter('blink')
        }
        break
      }
      case 'cast': {
        // Hover in place, the flame swelling and whitening: the telegraph
        this.target.copy(this.position)
        speed = 0
        // Rushed mid-cast: the flare fizzles and it blinks off
        if (flat < TOO_CLOSE) {
          this.swell = 0
          if (this.findBlinkSpot()) this.enter('blink')
          else this.enter('flee')
          break
        }
        if (this.stateTime >= CAST_TIME) {
          this.fireFlare()
          this.enter(this.engaged ? 'lure' : 'drift')
        }
        break
      }
      case 'blink': {
        // Fade out, jump, fade back in somewhere else
        this.target.copy(this.position)
        speed = 0
        if (!this.blinkMoved && this.stateTime >= BLINK_OUT) {
          this.blinkMoved = true
          this.position.copy(this.blinkTo)
          this.flightVel.set(0, 0, 0)
          this.playAt('night.vanish')
        }
        if (this.stateTime >= BLINK_OUT + BLINK_IN) this.enter(this.engaged ? 'lure' : 'drift')
        break
      }
      case 'flee': {
        // Hurt: away from the player and up, then (often) blink off
        const from = player ?? this.home
        this.tmp.set(this.position.x - from.x, 0, this.position.z - from.z)
        if (this.tmp.lengthSq() < 1e-4) this.tmp.set(1, 0, 0)
        this.tmp.normalize()
        this.target.set(this.position.x + this.tmp.x * 4, Math.max(this.position.y, from.y + 2), this.position.z + this.tmp.z * 4)
        speed = HURRY_SPEED
        if (this.stateTime >= FLEE_TIME) {
          if (this.engaged && Math.random() < 0.5 && this.findBlinkSpot()) this.enter('blink')
          else this.enter(this.engaged ? 'lure' : 'drift')
        }
        break
      }
    }

    this.updatePresence(deltaTime)
    this.steer(speed, deltaTime)
    this.flyStep(deltaTime)
    this.face(deltaTime)
    this.syncTransform()
    this.isWalking = true
    this.updateAnimations(deltaTime)
  }

  private enter(state: WispState): void {
    this.wispState = state
    this.stateTime = 0
    if (state === 'blink') this.blinkMoved = false
  }

  /** Fades for the blink; fully present otherwise. */
  private updatePresence(deltaTime: number): void {
    let want = 1
    if (this.wispState === 'blink') {
      want = this.blinkMoved ? Math.min(1, (this.stateTime - BLINK_OUT) / BLINK_IN) : Math.max(0, 1 - this.stateTime / BLINK_OUT)
      this.presence = want
    } else {
      this.presence += (want - this.presence) * Math.min(1, deltaTime * 6)
    }
    const swellWant = this.wispState === 'cast' ? Math.min(1, this.stateTime / CAST_TIME) : 0
    this.swell += (swellWant - this.swell) * Math.min(1, deltaTime * (swellWant > this.swell ? 20 : 5))
  }

  /** Hover height over the ground or water below (x, z), searching down from y. */
  private hoverY(x: number, y: number, z: number): number {
    const block = this.blockAt
    if (!block) return y
    const bx = Math.floor(x)
    const bz = Math.floor(z)
    const top = Math.floor(y) + 2
    for (let by = top; by > top - 16; by--) {
      if (block(bx, by, bz) !== 0) return by + 1 + HOVER
    }
    return y
  }

  /** A free spot 6-9 blocks around the player with a clear line to them. False when there is none. */
  private findBlinkSpot(): boolean {
    const p = this.player
    if (!p) return false
    const start = Math.random() * Math.PI * 2
    for (let i = 0; i < 14; i++) {
      const a = start + i * 2.39996
      const r = KEEP_MIN + Math.random() * 3
      const x = p.x + Math.cos(a) * r
      const z = p.z + Math.sin(a) * r
      const y = Math.max(p.y + 1 + Math.random() * 1.5, this.hoverY(x, p.y + 3, z) - 0.6)
      if (!this.clear(x, y, z) || !this.hasClearLine(x, y, z)) continue
      this.blinkTo.set(x, y, z)
      return true
    }
    return false
  }

  /** Steer toward the target with a slow, floating wobble. */
  private steer(speed: number, deltaTime: number): void {
    this.tmp.copy(this.target).sub(this.position)
    const d = this.tmp.length()
    if (d > 0.05 && speed > 0) this.tmp.multiplyScalar(Math.min(speed, d * 1.8) / d)
    else this.tmp.set(0, 0, 0)
    const t = this.time
    this.tmp.x += Math.sin(t * 1.3 + this.phaseA) * 0.35
    this.tmp.y += Math.sin(t * 1.9 + this.phaseB) * 0.25
    this.tmp.z += Math.cos(t * 1.1 + this.phaseC) * 0.35
    this.flightVel.lerp(this.tmp, Math.min(1, deltaTime * (speed > RETREAT_SPEED ? 4.5 : 2.5)))
  }

  private fireFlare(): void {
    if (!this.entitySpawnFn || !this.player) return
    const from = new THREE.Vector3(this.position.x, this.position.y + BODY_CENTER, this.position.z)
    const velocity = this.chest.clone().sub(from)
    if (velocity.lengthSq() < 1e-4) return
    velocity.normalize().multiplyScalar(FLARE_SPEED)
    const flare = new ProjectileEntity({
      position: from,
      velocity,
      damage: FLARE_DAMAGE,
      owner: this,
      mesh: createWispFlareMesh(),
      radius: 0.3,
      homing: FLARE_HOMING,
      lifetime: 5,
      damageSource: 'magic',
      effect: { id: StatusEffectIds.SLOWNESS, seconds: FLARE_SLOW_SECONDS, level: 1 },
    })
    if (this.entitySpawnFn(flare)) this.flares.push(flare)
  }

  /** No solid block between the wisp's body (at feet x, y, z) and the player's chest (sampled). */
  private hasClearLine(x: number = this.position.x, y: number = this.position.y, z: number = this.position.z): boolean {
    if (!this.solidAt || !this.player) return true
    const sx = x
    const sy = y + BODY_CENTER
    const sz = z
    const dx = this.chest.x - sx
    const dy = this.chest.y - sy
    const dz = this.chest.z - sz
    const steps = Math.ceil(Math.hypot(dx, dy, dz) / 0.4)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.solidAt(Math.floor(sx + dx * t), Math.floor(sy + dy * t), Math.floor(sz + dz * t))) return false
    }
    return true
  }

  /** Move by velocity·dt, sliding along solid blocks; rises over what blocks it. */
  private flyStep(deltaTime: number): void {
    const pos = this.position
    if (!this.clear(pos.x, pos.y, pos.z)) {
      pos.y += deltaTime * 2
      return
    }
    const step = this.step.copy(this.flightVel).multiplyScalar(deltaTime)
    let blockedSide = false
    if (this.clear(pos.x + step.x, pos.y, pos.z)) pos.x += step.x
    else {
      this.flightVel.x *= -0.3
      blockedSide = true
    }
    if (this.clear(pos.x, pos.y, pos.z + step.z)) pos.z += step.z
    else {
      this.flightVel.z *= -0.3
      blockedSide = true
    }
    if (this.clear(pos.x, pos.y + step.y, pos.z)) pos.y += step.y
    else this.flightVel.y *= -0.3
    if (blockedSide) this.flightVel.y = Math.max(this.flightVel.y, 2)
    if (pos.y > 480) pos.y = 480
  }

  /** The collision box (feet at y) is free of solid blocks. */
  private clear(x: number, y: number, z: number): boolean {
    const solid = this.solidAt
    if (!solid) return true
    for (const oy of [0.05, COLLIDE_HEIGHT]) {
      const by = Math.floor(y + oy)
      if (solid(Math.floor(x - HALF), by, Math.floor(z - HALF))) return false
      if (solid(Math.floor(x + HALF), by, Math.floor(z - HALF))) return false
      if (solid(Math.floor(x - HALF), by, Math.floor(z + HALF))) return false
      if (solid(Math.floor(x + HALF), by, Math.floor(z + HALF))) return false
    }
    return true
  }

  /** Turn its face toward the player once engaged (else along its drift). */
  private face(deltaTime: number): void {
    const mesh = this.getMesh()
    if (!mesh) return
    let dx = this.flightVel.x
    let dz = this.flightVel.z
    if (this.engaged && this.player) {
      dx = this.player.x - this.position.x
      dz = this.player.z - this.position.z
    }
    if (dx * dx + dz * dz < 0.01) return
    let delta = Math.atan2(dx, dz) - mesh.rotation.y
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    mesh.rotation.y += delta * Math.min(1, deltaTime * 4)
  }

  private playAt(id: 'night.vanish'): void {
    this.soundPos.x = this.position.x
    this.soundPos.y = this.position.y + BODY_CENTER
    this.soundPos.z = this.position.z
    playSound(id, this.soundPos)
  }

  private syncTransform(): void {
    const mesh = this.getMesh()
    if (mesh) mesh.position.copy(this.position)
    const physics = this.getPhysicsBody()
    if (physics) physics.position.copy(this.position)
  }

  // ---- looks ----

  /** Brightness and opacity of every part (presence fades the blink; `bright` lifts toward white). */
  private shade(presence: number, bright: number): void {
    for (const m of this.glowMaterials) {
      m.opacity = (this.baseOpacity.get(m) ?? 1) * presence
      if (!m.transparent && presence < 0.999) {
        m.transparent = true
        m.needsUpdate = true
      }
      const base = this.baseColor.get(m)
      if (base) m.color.copy(base).lerp(this.white, m === this.faceMaterial ? 0 : bright)
    }
  }

  protected updateAnimations(_deltaTime: number): void {
    const t = this.time
    const body = this.body
    const flame = this.flame
    if (!body || !flame) return
    // Bob and sway
    body.position.y = BODY_CENTER + Math.sin(t * 1.6 + this.phaseA) * 0.1
    body.rotation.z = Math.sin(t * 1.1 + this.phaseB) * 0.08
    // Flicker: the flame breathes, quickening and swelling through a cast
    const flicker = 0.05 * Math.sin(t * 13 + this.phaseC) + 0.035 * Math.sin(t * 21.7 + this.phaseA)
    const s = 1 + flicker + 0.28 * this.swell
    flame.scale.set(s, s + flicker * 0.6, s)
    for (let i = 0; i < this.tongues.length; i++) {
      const lick = 0.75 + 0.35 * Math.sin(t * (9 + i * 2.3) + i * 1.7) + 0.5 * this.swell
      this.tongues[i].scale.set(1, Math.max(0.2, lick), 1)
      this.tongues[i].rotation.z = Math.sin(t * 5 + i) * 0.18
    }
    const pulse = 0.12 + 0.08 * Math.sin(t * 3 + this.phaseB)
    this.shade(this.presence, pulse * 0.15 + 0.6 * this.swell)
    if (this.coreMaterial) this.coreMaterial.color.lerp(this.white, 0.3 * this.swell)
    // Motes rise and drift off behind it, fading as they go
    for (let i = 0; i < this.motes.length; i++) {
      const cycle = (t * 0.45 + i / this.motes.length) % 1
      const m = this.motes[i]
      m.visible = this.presence > 0.05
      m.position.set(
        Math.sin(i * 2.1 + t * 0.9) * (0.15 + cycle * 0.35),
        BODY_CENTER + 0.2 + cycle * 0.9,
        Math.cos(i * 1.3 + t * 0.7) * (0.15 + cycle * 0.35)
      )
      m.scale.setScalar(Math.max(0.01, (1 - cycle) * this.presence))
    }
  }

  /** The fog lifted: the flame gutters - violent flickers, shrinking, one last flare - and the motes scatter. */
  private updateExit(deltaTime: number, progress: number): void {
    if (!this.exitStarted) {
      this.exitStarted = true
      this.wispState = 'drift'
      this.swell = 0
      const a = Math.random() * Math.PI * 2
      this.exitDrift.set(Math.cos(a) * 0.3, 0.25, Math.sin(a) * 0.3)
      this.playAt('night.vanish')
    }
    this.position.addScaledVector(this.exitDrift, deltaTime)
    this.syncTransform()
    const body = this.body
    const flame = this.flame
    if (!body || !flame) {
      if (progress >= 1) this.kill()
      return
    }
    const t = this.time
    // Guttering: random dips that deepen; a last flare-up near the end, then out
    const gutter = Math.max(0, Math.sin(t * 37) * Math.sin(t * 23.3 + 1.3)) * (0.4 + 0.6 * progress)
    const lastFlare = Math.exp(-Math.pow((progress - 0.72) / 0.05, 2))
    const size = Math.max(0, (1 - Math.pow(progress, 1.6)) * (1 - gutter * 0.6) + 0.35 * lastFlare) * (progress < 0.82 ? 1 : Math.max(0, 1 - (progress - 0.82) / 0.1))
    flame.scale.setScalar(Math.max(0.001, size))
    for (let i = 0; i < this.tongues.length; i++) this.tongues[i].scale.set(1, Math.max(0.05, size * (0.6 + 0.6 * Math.sin(t * 15 + i))), 1)
    const glow = Math.max(0, 1 - progress) * (1 - 0.5 * gutter) + 0.4 * lastFlare
    this.shade(Math.min(1, glow * 1.2), 0.5 * lastFlare)
    // Motes: drift as usual until the flame goes out, then scatter outward and fade
    const scatter = Math.max(0, (progress - 0.75) / 0.25)
    const moteMaterial = this.motes[0]?.material as THREE.MeshBasicMaterial | undefined
    if (moteMaterial) moteMaterial.opacity = 0.9 * (scatter > 0 ? 1 - scatter : Math.min(1, glow))
    const r = 0.2 + scatter * 1.6
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i]
      const dir = this.moteDirs[i]
      m.visible = true
      m.position.set(dir.x * r, BODY_CENTER + 0.3 + dir.y * r, dir.z * r)
      m.scale.setScalar(Math.max(0.01, 1 - scatter * 0.7))
    }
    if (progress >= 1) this.kill()
  }

  /** Slain: the flame bursts, shrinks to a spark and goes out; the motes burst outward. */
  private animateDeath(): void {
    const p = Math.min(1, this.deathTimer / DEATH_SECONDS)
    const flame = this.flame
    if (flame) {
      const size = p < 0.15 ? 1 + p * 2.5 : Math.max(0.001, 1.375 * (1 - (p - 0.15) / 0.85))
      flame.scale.setScalar(size)
    }
    this.shade(Math.max(0, 1 - p * p), Math.max(0, 0.8 - p))
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i]
      const dir = this.moteDirs[i]
      const r = 0.2 + p * 2.2
      m.visible = true
      m.position.set(dir.x * r, BODY_CENTER + 0.3 + dir.y * r - p * p * 0.6, dir.z * r)
      m.scale.setScalar(Math.max(0.01, 1 - p))
    }
  }

  // ---- combat ----

  /** A blow knocks it away and sends it fleeing. */
  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (this.retreat.leaving || this.presence < 0.4) return false
    const handled = super.onPlayerInteract(playerPosition, isLeftClick, heldItem)
    if (!handled || this._isDying) return handled
    // The base class wrote the knockback into the physics body: fly it
    const physics = this.getPhysicsBody()
    if (physics) {
      this.flightVel.copy(physics.velocity)
      physics.velocity.set(0, 0, 0)
    }
    this.engaged = true
    this.swell = 0
    this.enter('flee')
    return handled
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (this.retreat.leaving || this.presence < 0.4) return false
    return super.canPlayerInteract(playerPosition, maxDistance + 0.3)
  }

  /** One wisp light, once (the items fork registers 'wisp_light'). */
  getDrops(): IItem[] {
    if (this.dropsTaken) return []
    this.dropsTaken = true
    const light = createItemFromId('wisp_light')
    return light ? [light] : []
  }

  dispose(): void {
    this.body = null
    this.flame = null
    this.tongues = []
    this.motes = []
    // Sprites aren't meshes: Entity.dispose() doesn't reach their materials
    for (const m of this.glowMaterials) if (m instanceof THREE.SpriteMaterial) m.dispose()
    this.coreMaterial = null
    this.faceMaterial = null
    this.glowMaterials = []
    this.baseOpacity.clear()
    this.baseColor.clear()
    this.flares.length = 0
    this.player = null
    this.solidAt = null
    this.blockAt = null
    this.entitySpawnFn = null
    super.dispose()
  }
}

let glowTexture: THREE.Texture | null = null

/** Shared soft radial glow (white, alpha falling off from the centre) for the halo sprites. */
function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1
      const dy = (y + 0.5) / size * 2 - 1
      const r = Math.min(1, Math.hypot(dx, dy))
      const a = Math.pow(1 - r, 2.2)
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      data[i + 3] = Math.round(a * 255)
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  glowTexture = texture
  return texture
}

/** A wisp-flare: a pale spark in a green glow (owned by its projectile). */
function createWispFlareMesh(): THREE.Object3D {
  const group = new THREE.Group()
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.36, 0.42),
    new THREE.MeshBasicMaterial({ color: FLARE_SHELL, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  )
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.2), new THREE.MeshBasicMaterial({ color: FLARE_CORE, fog: false }))
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.4),
    new THREE.MeshBasicMaterial({ color: FLARE_SHELL, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  )
  tail.position.z = -0.32
  group.add(shell)
  group.add(core)
  group.add(tail)
  return group
}
