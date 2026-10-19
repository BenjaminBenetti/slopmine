import * as THREE from 'three'
import { Entity } from '../../Entity.ts'
import type { IEntityConfig } from '../../interfaces/IEntityConfig.ts'
import type { IItem } from '../../../items/Item.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { getPlayerAttackDamage, getPlayerAttackKnockback } from '../../../combat/PlayerAttack.ts'
import type { DamageSource } from '../../../player/DamageModifiers.ts'
import { BlockIds } from '../../../world/blocks/BlockIds.ts'
import { AnglerLureItem } from '../../../items/materials/angler_lure/AnglerLureItem.ts'
import { SlimeBallItem } from '../../../items/materials/slime_ball/SlimeBallItem.ts'
import { DawnRetreat, fadeMaterials } from '../NightCreature.ts'
import { playSound, type PlaySoundOptions } from '../../../audio/SoundHooks.ts'

/** Behaviour states. */
type AnglerState =
  /** Just spawned: looking for water to lie in */
  | 'settle'
  /** Submerged at its spot, lure swaying */
  | 'lurk'
  /** Sliding nearer under the surface */
  | 'creep'
  /** Telegraph: the lure snaps down, water surges, the body rises */
  | 'windup'
  /** Leaping at the player, mouth open */
  | 'lunge'
  /** Out of the water after a lunge: croaking and vulnerable */
  | 'surfaced'
  /** Hopping back toward its water after landing on dry ground */
  | 'hop'
  /** Settling back under the surface */
  | 'sink'
  /** Dawn: dimming and sinking away for good */
  | 'exit'

// Combat
const MAX_HEALTH = 44
const BITE_DAMAGE = 9
/** The bite drags its prey toward the water it leapt from. */
const PULL_H = 7
const PULL_V = 3.5
const BITE_REACH = 1.5
const PLAYER_CHEST = 0.9

// Ranges (blocks)
const AMBUSH_RADIUS = 5
const CREEP_RANGE = 16
/** Never strays further than this from its lair. */
const LAIR_RANGE = 10
/** How far around its spawn point it looks for water. */
const LAIR_SEARCH = 8
/** Gives up looking (unloaded world) and lies where it is after this long. */
const SETTLE_TIMEOUT = 3

// Movement
const CREEP_SPEED = 1.2
const LUNGE_SPEED = 9
const LUNGE_MAX_TIME = 1.3
const HOP_DISTANCE = 3
const HOP_TIME = 0.5
const MAX_HOPS = 8
const GRAVITY = 28

// Body height relative to the surface (feet below it)
/** Lurking: only the eyes and the lure stalk break the surface. */
const SINK_DEPTH = 0.7
/** Surfaced in water: floating with its back out. */
const FLOAT_DEPTH = 0.3
/** Windup: rises this much toward the surface before the leap. */
const WINDUP_RISE = 0.4

// Timing (seconds)
const WINDUP_TIME = 0.5
/** A blow wakes it at once: a much shorter telegraph. */
const HIT_WINDUP_TIME = 0.25
const SURFACED_TIME = 3
const SINK_TIME = 0.7
const AMBUSH_COOLDOWN = 1.5
const HOP_PAUSE = 0.35

// Being hit (only out of the water; submerged it doesn't budge)
const HIT_PUSH = 3
const HIT_STUN = 0.3

const DEATH_DURATION = 1.4
const EXIT_DURATION = 2.2
const EXIT_SINK = 1.8

// Colours: warty olive-brown hide, moss and algae, pale belly, glowing lure
const SKIN = 0x5e5a33
const SKIN_DARK = 0x3e3b22
const SKIN_LIGHT = 0x837b47
const BELLY = 0xa39a68
const MOSS = 0x5a8a2e
const MOSS_DARK = 0x3c6420
const MOUTH = 0x2a0a0e
const GUM = 0x7a2a30
const TONGUE = 0x9a4048
const TOOTH = 0xe8e2c8
const STALK = 0x7a6440
const SAC = 0xa09a68
const EYE = 0xe0c840
/** Faint bioluminescent spots along the flanks and lip. */
const PHOTOPHORE = 0x7fb04a
const PUPIL = 0x101008
const LURE = 0xd8ff7a
const LURE_FLARE = 0xf6ffd8
const LURE_DIM = 0x4a5228
const SPLASH = 0x6fa8a0
const FLARE_COLOR = new THREE.Color(LURE_FLARE)
const DIM_COLOR = new THREE.Color(LURE_DIM)

const S = 0.0625 // 1 "pixel" = 1/16 block

const WATER_IDS: ReadonlySet<number> = new Set([
  BlockIds.WATER, BlockIds.WATER_SEVEN_EIGHTH, BlockIds.WATER_THREE_QUARTER, BlockIds.WATER_FIVE_EIGHTH,
  BlockIds.WATER_HALF, BlockIds.WATER_THREE_EIGHTH, BlockIds.WATER_QUARTER, BlockIds.WATER_EIGHTH, BlockIds.WATER_FALLING,
  BlockIds.SWAMP_WATER, BlockIds.SWAMP_WATER_SEVEN_EIGHTH, BlockIds.SWAMP_WATER_THREE_QUARTER, BlockIds.SWAMP_WATER_FIVE_EIGHTH,
  BlockIds.SWAMP_WATER_HALF, BlockIds.SWAMP_WATER_THREE_EIGHTH, BlockIds.SWAMP_WATER_QUARTER, BlockIds.SWAMP_WATER_EIGHTH,
  BlockIds.SWAMP_WATER_FALLING,
  // Plants standing in swamp water: their cells are water too
  BlockIds.GLOWKELP, BlockIds.GLOWKELP_TOP, BlockIds.LANTERNWEED,
])

/** Ground soft enough to lie half-buried in. */
const SOFT_GROUND: ReadonlySet<number> = new Set([BlockIds.MUD, BlockIds.MUDDY_GRASS, BlockIds.GLOWMOSS, BlockIds.GRASS, BlockIds.DIRT, BlockIds.CLAY])
/** What a water-dweller may slide through besides water. */
const MUD_GROUND: ReadonlySet<number> = new Set([BlockIds.MUD, BlockIds.MUDDY_GRASS, BlockIds.GLOWMOSS])

const SPLASH_DROPS = 10

/** Falling back into the water after a lunge: a smaller splash. */
const LANDING_SPLASH: PlaySoundOptions = { volume: 0.5 }

/** A surface cell: the y of the first free cell above water or ground. */
interface Surface {
  y: number
  water: boolean
  ground: number
}

/**
 * Mire angler - the swamp's night ambusher: a squat bog-frog the size of a
 * rowboat with a mouth full of needle teeth, lying in the black water with
 * only its yellow eyes above the surface. The first (and often last) thing
 * anyone sees is its lure: a glowing bulb on a long stalk, bobbing over the
 * water like a will-o'-wisp.
 *
 * It lies still, creeping nearer under the surface while prey wanders within
 * 16 blocks. Come within 5 and the lure snaps down, the water surges - then
 * it leaps out in an arc, jaws wide, and the bite DRAGS its prey toward the
 * water it came from. After a lunge it sits croaking in the open for a few
 * seconds (the moment to strike back), then slips under again. It never
 * strays more than 10 blocks from its lair; without water nearby it lies
 * half-sunk in the mud instead. Hit it while it lurks and it lunges at once.
 * At dawn its lure fades and it sinks away.
 *
 * Stats: 44 HP, 9 damage bite + pull, 5 block ambush radius.
 * Drops: an angler lure, sometimes a slime ball.
 */
export class MireAnglerEntity extends Entity {
  readonly type = 'mire_angler'

  private ai: AnglerState = 'settle'
  private stateTime = 0
  private health = MAX_HEALTH
  private _isDying = false
  private deathTimer = 0
  private dropsCollected = false
  private readonly dawn = new DawnRetreat(EXIT_DURATION)

  /** Lair: the water (or mud) it settled in; its home range is centred here. */
  private readonly lair = new THREE.Vector3()
  private lairInWater = false
  /** Surface level of the cell it is at (lurking, surfaced or landed). */
  private surfaceY = 0
  /** Lying in water (true) or half-sunk in mud. */
  private inWater = false
  private settleTime = 0
  private windupTime = WINDUP_TIME
  private ambushCooldown = 0
  private hopCount = 0
  private hopPause = 0
  private bitten = false
  private landed = false
  private exitStartY = 0

  private playerPositionRef: THREE.Vector3 | null = null
  private playerDamageCallback: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void) | null = null
  private blockQuery: ((x: number, y: number, z: number) => number) | null = null
  private solidQuery: ((x: number, y: number, z: number) => boolean) | null = null

  /** Leap/hop/knockback velocity. */
  private readonly flight = new THREE.Vector3()
  /** Where the current lunge started: the bite pulls toward it. */
  private readonly pullAnchor = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private readonly surface: Surface = { y: 0, water: false, ground: 0 }
  private readonly soundAt = { x: 0, y: 0, z: 0 }
  private yaw = Math.random() * Math.PI * 2
  private time = Math.random() * 10

  // Animation state
  private jawOpen = 0
  private lureDip = 0
  private lureFlare = 0
  private bodyPitch = 0
  private bodyRoll = 0

  // Mesh parts
  private body: THREE.Group | null = null
  private jaw: THREE.Group | null = null
  private sac: THREE.Group | null = null
  private lureBase: THREE.Group | null = null
  private lureMid: THREE.Group | null = null
  private bulbHang: THREE.Group | null = null
  private armL: THREE.Group | null = null
  private armR: THREE.Group | null = null
  private legL: THREE.Group | null = null
  private legR: THREE.Group | null = null
  private bulbMaterial: THREE.MeshBasicMaterial | null = null
  private haloMaterial: THREE.MeshBasicMaterial | null = null
  private readonly splashDrops: THREE.Mesh[] = []
  private readonly splashVelocity: THREE.Vector3[] = []
  private readonly splashLife: number[] = []
  private readonly fadeTargets: THREE.Material[] = []
  private readonly baseOpacity = new Map<THREE.Material, number>()

  constructor(config: Omit<IEntityConfig, 'hasPhysics' | 'hitboxSize'>) {
    super('mire_angler', {
      ...config,
      hasPhysics: true, // hitbox for player attacks; movement is manual
      hitboxSize: new THREE.Vector3(1.7, 1.15, 1.7),
    })
    const body = this.getPhysicsBody()
    if (body) body.skipPhysics = true
  }

  get isDying(): boolean {
    return this._isDying
  }

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerPositionRef = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => boolean | void): void {
    this.playerDamageCallback = callback
  }

  setWorldQueryFns(blockQuery: (x: number, y: number, z: number) => number, solidQuery: (x: number, y: number, z: number) => boolean): void {
    this.blockQuery = blockQuery
    this.solidQuery = solidQuery
  }

  // ---- model ----

  protected createMesh(): THREE.Object3D {
    const root = new THREE.Group()
    const body = new THREE.Group()
    root.add(body)
    this.body = body

    const lambert = (color: number): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ color })
      this.registerMaterialForLighting(m)
      return m
    }
    const skin = lambert(SKIN)
    const skinDark = lambert(SKIN_DARK)
    const skinLight = lambert(SKIN_LIGHT)
    const belly = lambert(BELLY)
    const moss = lambert(MOSS)
    const mossDark = lambert(MOSS_DARK)
    const mouth = lambert(MOUTH)
    const gum = lambert(GUM)
    const tongue = lambert(TONGUE)
    const tooth = lambert(TOOTH)
    const stalk = lambert(STALK)
    const sacMat = lambert(SAC)
    const pupil = lambert(PUPIL)
    // Eyes and lure shine in the dark: unlit
    const eye = new THREE.MeshBasicMaterial({ color: EYE })
    const photophore = new THREE.MeshBasicMaterial({ color: PHOTOPHORE })
    this.bulbMaterial = new THREE.MeshBasicMaterial({ color: LURE })
    this.haloMaterial = new THREE.MeshBasicMaterial({ color: LURE, transparent: true, opacity: 0.28, depthWrite: false })
    const splash = new THREE.MeshLambertMaterial({ color: SPLASH, transparent: true, opacity: 0.7, depthWrite: false })
    this.registerMaterialForLighting(splash)

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), m)
      mesh.position.set(x * S, y * S, z * S)
      parent.add(mesh)
      return mesh
    }
    const group = (x: number, y: number, z: number, parent: THREE.Object3D): THREE.Group => {
      const g = new THREE.Group()
      g.position.set(x * S, y * S, z * S)
      parent.add(g)
      return g
    }

    // Torso tapering back from the broad head to a stubby finned tail, with
    // a dark hump along the spine and a pale belly band down the flanks
    box(30, 8, 7, skin, 0, 5.5, -5.5, body)
    box(26, 7, 6, skin, 0, 5, -12, body)
    box(14, 5, 5, skin, 0, 5, -17.5, body)
    box(18, 4.5, 2.5, skinDark, 0, 6.5, -21, body)
    box(20, 2, 11, skinDark, 0, 9.5, -8.5, body)
    box(28, 2, 18, belly, 0, 1.5, -7, body)
    // Mossy skin frills and dangling algae along the flanks; pale spots
    for (const side of [-1, 1]) {
      box(3, 1.5, 16, moss, side * 15, 6.5, -6, body)
      box(1.5, 3.5, 1.5, mossDark, side * 15.6, 4.5, -10, body)
      box(1.5, 2.5, 1.5, mossDark, side * 15.6, 5, -3, body)
      box(0.6, 2, 2, skinLight, side * 15.2, 3.8, -6.5, body)
      box(0.6, 1.5, 1.5, skinLight, side * 13.2, 4, -13, body)
    }

    // Broad flat head, wider than the body: the upper jaw, with an
    // overhanging lip, nostrils and needle teeth behind the lip line
    box(34, 4, 15, skin, 0, 7, 5, body)
    box(30, 1.5, 13, skin, 0, 9.75, 4.5, body)
    box(33, 1.5, 1.5, skinDark, 0, 5.6, 12.4, body)
    box(28, 1.5, 11, mouth, 0, 5.4, 5.5, body)
    box(30, 1, 1, gum, 0, 5.1, 10.8, body)
    for (let x = -13.5; x <= 13.5; x += 3) box(0.9, 2.2, 0.9, tooth, x, 4.1, 11.3, body)
    for (const side of [-1, 1]) {
      for (let z = 1; z <= 9; z += 2.7) box(0.9, 2, 0.9, tooth, side * 15.5, 4.2, z, body)
      box(1.2, 0.6, 1.2, pupil, side * 3, 10.6, 10.5, body)
    }
    // Warts and moss on the back and brow
    const warts: Array<[number, number, number, THREE.Material]> = [
      [-10, 10.8, 9, skinLight], [4, 10.8, 10, skinDark], [12, 10.8, 1, skinLight], [-3, 10.8, 0, skinLight],
      [-12, 9.3, -5, skinLight], [9, 10.8, -9, skinLight], [-6, 10.8, -11, skinDark], [2, 10.8, -4, skinLight],
      [13, 9.3, -12, skinDark], [-16, 8.3, 8, skinLight], [16, 8.3, 4, skinLight],
    ]
    for (const [x, y, z, m] of warts) box(2, 1, 2, m, x, y, z, body)
    box(8, 1, 6, moss, 6, 10.6, -7, body)
    box(6, 1, 5, moss, -7, 10.6, -10, body)
    box(5, 1, 4, mossDark, -9, 10.9, 7, body)
    box(4, 1, 3, moss, 11, 10.9, 8, body)

    // A row of faintly glowing spots down each flank and along the lip
    for (const side of [-1, 1]) {
      for (let z = -12; z <= 3; z += 3) box(1, 1, 1.2, photophore, side * 15.05, 3.6 + (z % 2 === 0 ? 0 : 0.6), z, body)
    }
    for (const x of [-12, -6, 6, 12]) box(1.2, 1, 0.5, photophore, x, 6.7, 12.4, body)

    // Bulging frog eyes on turrets: yellow, with a dark slit
    for (const side of [-1, 1]) {
      box(6, 3.5, 6, skin, side * 9, 11.75, 3.5, body)
      box(5, 1, 5, skinDark, side * 9, 13.8, 3.5, body)
      box(4, 2.6, 1, eye, side * 9, 12, 6.55, body)
      box(1, 2.6, 3, eye, side * 12.05, 12, 4.5, body)
      box(3, 0.7, 0.3, pupil, side * 9, 12, 7.1, body)
    }

    // Lower jaw on a hinge at the back of the mouth: an underbite with two
    // fangs that jut above the lip even when closed, a tongue and a throat sac
    const jaw = group(0, 5, -1, body)
    this.jaw = jaw
    box(33, 4, 14.5, skin, 0, -2, 7.25, jaw)
    box(30, 1, 13, belly, 0, -4.2, 6.5, jaw)
    box(26, 0.6, 12, mouth, 0, 0.1, 6.5, jaw)
    box(18, 1, 9, tongue, 0, 0.4, 5.5, jaw)
    for (let x = -12; x <= 12; x += 3) box(0.9, 1.8, 0.9, tooth, x, 0.6, 13.6, jaw)
    for (const side of [-1, 1]) {
      box(1.4, 3.8, 1.4, tooth, side * 10.5, 1.4, 14, jaw)
      box(1, 2.6, 1, tooth, side * 4.5, 1, 14.1, jaw)
    }
    const sac = group(0, -3.2, 5, jaw)
    this.sac = sac
    box(12, 2.2, 9, sacMat, 0, -1, 0, sac)
    sac.scale.y = 0.5

    // Stubby webbed forelimbs and folded hind legs
    const makeArm = (side: number): THREE.Group => {
      const arm = group(side * 14, 3, 6, body)
      box(4, 3, 5, skin, side * 2, -1.5, 0, arm)
      box(6, 1, 6, skinDark, side * 3, -2.6, 1.5, arm)
      return arm
    }
    this.armL = makeArm(-1)
    this.armR = makeArm(1)
    const makeLeg = (side: number): THREE.Group => {
      const leg = group(side * 13, 4, -11, body)
      box(5, 5, 9, skin, side * 1.5, 0, -1, leg)
      box(7, 1, 8, skinDark, side * 3, -3.5, 2, leg)
      return leg
    }
    this.legL = makeLeg(-1)
    this.legR = makeLeg(1)

    // The lure: a fleshy stalk rising from the brow, bending forward, with a
    // glowing bulb dangling from its tip
    const lureBase = group(0, 10, 9, body)
    this.lureBase = lureBase
    box(1.4, 14, 1.4, stalk, 0, 7, 0, lureBase)
    const lureMid = group(0, 14, 0, lureBase)
    this.lureMid = lureMid
    box(1.1, 12, 1.1, stalk, 0, 6, 0, lureMid)
    const bulbHang = group(0, 12, 0, lureMid)
    this.bulbHang = bulbHang
    box(0.5, 3, 0.5, stalk, 0, -1.5, 0, bulbHang)
    box(1.6, 1, 1.6, stalk, 0, -2.8, 0, bulbHang)
    box(4, 4, 4, this.bulbMaterial, 0, -5, 0, bulbHang)
    box(5, 2.6, 2.6, this.bulbMaterial, 0, -5, 0, bulbHang)
    box(2.6, 5, 2.6, this.bulbMaterial, 0, -5, 0, bulbHang)
    box(2.6, 2.6, 5, this.bulbMaterial, 0, -5, 0, bulbHang)
    box(7, 7, 7, this.haloMaterial, 0, -5, 0, bulbHang)

    // Splash droplets for the telegraph and landings (hidden until thrown)
    const dropGeo = new THREE.BoxGeometry(2.2 * S, 2.2 * S, 2.2 * S)
    for (let i = 0; i < SPLASH_DROPS; i++) {
      const drop = new THREE.Mesh(dropGeo, splash)
      drop.visible = false
      root.add(drop)
      this.splashDrops.push(drop)
      this.splashVelocity.push(new THREE.Vector3())
      this.splashLife.push(0)
    }

    optimizeEntityMesh(root, {
      merge: true,
      dynamic: [body, jaw, sac, lureBase, lureMid, bulbHang, this.armL, this.armR, this.legL, this.legR, ...this.splashDrops],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })

    // Everything that fades when it dies or leaves (merged materials included)
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      const m = node.material as THREE.Material
      if (this.fadeTargets.includes(m)) return
      this.fadeTargets.push(m)
      this.baseOpacity.set(m, m.transparent ? m.opacity : 1)
    })
    return root
  }

  // ---- behaviour ----

  update(deltaTime: number): void {
    this.time += deltaTime
    this.stateTime += deltaTime
    this.ambushCooldown = Math.max(0, this.ambushCooldown - deltaTime)

    if (this._isDying) {
      this.updateDeath(deltaTime)
    } else {
      // Dawn only takes it where it can sink away: never mid-leap
      if (this.ai !== 'lunge' && this.ai !== 'hop' && this.ai !== 'settle') {
        const exit = this.dawn.update(deltaTime)
        if (exit > 0 && this.ai !== 'exit') {
          this.exitStartY = this.position.y
          this.playSoundHere('night.vanish')
          this.enter('exit')
        }
      }
      this.think(deltaTime)
    }

    this.syncTransform()
    this.animate(deltaTime)
  }

  private enter(state: AnglerState): void {
    this.ai = state
    this.stateTime = 0
  }

  private think(deltaTime: number): void {
    const player = this.playerPositionRef

    switch (this.ai) {
      case 'settle': {
        this.settleTime += deltaTime
        if (this.findLair() || this.settleTime > SETTLE_TIMEOUT) {
          if (this.settleTime > SETTLE_TIMEOUT && !this.lairInWater && this.lair.lengthSq() === 0) {
            // Unloaded around it: lie where it stands
            this.surfaceY = Math.floor(this.position.y)
            this.lair.set(this.position.x, this.surfaceY, this.position.z)
          }
          this.position.set(this.lair.x, this.surfaceY - SINK_DEPTH, this.lair.z)
          this.enter('lurk')
        }
        break
      }

      case 'lurk':
      case 'creep': {
        this.easeDepth(SINK_DEPTH, deltaTime, 2)
        if (player) {
          const dist = this.horizontalDistance(player)
          const dy = player.y - this.surfaceY
          if (this.ambushCooldown <= 0 && dist <= AMBUSH_RADIUS && dy > -2 && dy < 3.5 && this.hasClearLine(player, this.surfaceY + 0.3)) {
            this.windupTime = WINDUP_TIME
            this.startWindup()
            break
          }
          if (dist <= CREEP_RANGE && dist > 1.5) {
            this.faceToward(player.x, player.z, deltaTime, 2)
            this.ai = this.creepToward(player.x, player.z, deltaTime) ? 'creep' : 'lurk'
            break
          }
        }
        // Nothing to hunt: drift home
        if (this.horizontalDistance(this.lair) > 1) {
          this.faceToward(this.lair.x, this.lair.z, deltaTime, 1.5)
          this.ai = this.creepToward(this.lair.x, this.lair.z, deltaTime) ? 'creep' : 'lurk'
        } else {
          this.ai = 'lurk'
        }
        break
      }

      case 'windup': {
        this.easeDepth(SINK_DEPTH - WINDUP_RISE, deltaTime, 6)
        if (player) this.faceToward(player.x, player.z, deltaTime, 10)
        if (this.stateTime >= this.windupTime) {
          if (player) this.launchAt(player)
          else this.enter('lurk')
        }
        break
      }

      case 'lunge': {
        this.flyStep(deltaTime)
        if (!this.bitten && player) this.tryBite(player)
        if (this.landed) {
          this.splash(1)
          if (this.inWater) this.playSoundHere('night.splash', LANDING_SPLASH)
          this.enter('surfaced')
        } else if (this.stateTime >= LUNGE_MAX_TIME) {
          this.forceLand()
          this.enter('surfaced')
        }
        break
      }

      case 'surfaced': {
        this.slide(deltaTime)
        this.easeDepth(this.inWater ? FLOAT_DEPTH : 0, deltaTime, 4)
        if (player && this.horizontalDistance(player) < 12) this.faceToward(player.x, player.z, deltaTime, 3)
        if (this.stateTime >= SURFACED_TIME) {
          if (this.canLurkHere()) {
            this.splash(0.6)
            this.enter('sink')
          } else {
            this.hopCount = 0
            this.hopPause = 0
            this.startHop()
          }
        }
        break
      }

      case 'hop': {
        if (this.hopPause > 0) {
          this.hopPause -= deltaTime
          if (this.hopPause <= 0) this.startHop()
          break
        }
        this.flyStep(deltaTime)
        if (this.landed || this.stateTime >= LUNGE_MAX_TIME) {
          if (!this.landed) this.forceLand()
          if (this.canLurkHere() || this.hopCount >= MAX_HOPS) {
            this.splash(0.6)
            this.enter('sink')
          } else {
            this.hopPause = HOP_PAUSE
          }
        }
        break
      }

      case 'sink': {
        this.easeDepth(SINK_DEPTH, deltaTime, 5)
        if (this.stateTime >= SINK_TIME) {
          this.ambushCooldown = AMBUSH_COOLDOWN
          this.enter('lurk')
        }
        break
      }

      case 'exit': {
        const t = Math.min(1, this.stateTime / EXIT_DURATION)
        this.position.y = this.exitStartY - t * t * EXIT_SINK
        if (t >= 1) this.kill()
        break
      }
    }
  }

  // ---- lair, surface and movement ----

  /** Find the nearest water surface within LAIR_SEARCH (else lie in the mud here). */
  private findLair(): boolean {
    if (!this.blockQuery || !this.solidQuery) return false
    const cx = Math.floor(this.position.x)
    const cz = Math.floor(this.position.z)
    const nearY = this.position.y
    let best = Infinity
    for (let dx = -LAIR_SEARCH; dx <= LAIR_SEARCH; dx++) {
      for (let dz = -LAIR_SEARCH; dz <= LAIR_SEARCH; dz++) {
        const d = dx * dx + dz * dz
        if (d >= best || d > LAIR_SEARCH * LAIR_SEARCH) continue
        const s = this.surfaceAt(cx + dx, cz + dz, nearY)
        if (!s || !s.water) continue
        best = d
        this.lair.set(cx + dx + 0.5, s.y, cz + dz + 0.5)
        this.surfaceY = s.y
      }
    }
    if (best < Infinity) {
      this.lairInWater = true
      this.inWater = true
      return true
    }
    const here = this.surfaceAt(cx, cz, nearY)
    if (!here) return false
    this.lair.set(this.position.x, here.y, this.position.z)
    this.surfaceY = here.y
    this.lairInWater = false
    this.inWater = false
    return true
  }

  /**
   * The surface of column (x, z) near `nearY`: the first free cell above
   * water or solid ground, scanning from a little above. Null when none.
   */
  private surfaceAt(x: number, z: number, nearY: number): Surface | null {
    if (!this.blockQuery || !this.solidQuery) return null
    const top = Math.floor(nearY) + 3
    for (let y = top; y >= top - 8; y--) {
      const id = this.blockQuery(x, y, z)
      const above = this.blockQuery(x, y + 1, z)
      if (WATER_IDS.has(above) || this.solidQuery(x, y + 1, z)) continue
      if (WATER_IDS.has(id)) {
        this.surface.y = y + 1
        this.surface.water = true
        this.surface.ground = id
        return this.surface
      }
      if (this.solidQuery(x, y, z)) {
        this.surface.y = y + 1
        this.surface.water = false
        this.surface.ground = id
        return this.surface
      }
    }
    return null
  }

  /** Whether it may lie hidden at column (x, z) at its current level. */
  private isLurkable(s: Surface | null): boolean {
    if (!s) return false
    if (this.lairInWater) {
      if (s.water) return s.y === this.surfaceY
      return MUD_GROUND.has(s.ground) && Math.abs(s.y - this.surfaceY) <= 1
    }
    return !s.water && SOFT_GROUND.has(s.ground) && Math.abs(s.y - this.surfaceY) <= 1
  }

  private canLurkHere(): boolean {
    if (this.horizontalDistance(this.lair) > LAIR_RANGE) return false
    const s = this.surfaceAt(Math.floor(this.position.x), Math.floor(this.position.z), this.position.y + 0.5)
    if (!s) return false
    if (!this.lairInWater) return !s.water && SOFT_GROUND.has(s.ground)
    return s.water || MUD_GROUND.has(s.ground)
  }

  /** Slide toward (x, z) under the surface through lurkable cells; false when stuck. */
  private creepToward(x: number, z: number, deltaTime: number): boolean {
    this.tmp.set(x - this.position.x, 0, z - this.position.z)
    const len = this.tmp.length()
    if (len < 0.05) return false
    this.tmp.multiplyScalar(Math.min(len, CREEP_SPEED * deltaTime) / len)
    const px = this.position.x
    const pz = this.position.z
    if (this.tryCreepTo(px + this.tmp.x, pz + this.tmp.z)) return true
    if (Math.abs(this.tmp.x) > 1e-4 && this.tryCreepTo(px + this.tmp.x, pz)) return true
    if (Math.abs(this.tmp.z) > 1e-4 && this.tryCreepTo(px, pz + this.tmp.z)) return true
    return false
  }

  private tryCreepTo(x: number, z: number): boolean {
    const lx = x - this.lair.x
    const lz = z - this.lair.z
    if (lx * lx + lz * lz > LAIR_RANGE * LAIR_RANGE) return false
    const s = this.surfaceAt(Math.floor(x), Math.floor(z), this.surfaceY)
    if (!this.isLurkable(s)) return false
    this.position.x = x
    this.position.z = z
    this.surfaceY = s!.y
    this.inWater = s!.water
    return true
  }

  /** Ease the feet toward `depth` below the current surface. */
  private easeDepth(depth: number, deltaTime: number, rate: number): void {
    const target = this.surfaceY - depth
    this.position.y += (target - this.position.y) * Math.min(1, deltaTime * rate)
  }

  private startWindup(): void {
    this.splash(1)
    this.playSoundHere('night.splash')
    this.enter('windup')
  }

  /** Leap in an arc that lands just past the player's feet. */
  private launchAt(player: THREE.Vector3): void {
    this.pullAnchor.set(this.position.x, this.surfaceY, this.position.z)
    this.tmp.set(player.x - this.position.x, 0, player.z - this.position.z)
    const d = this.tmp.length()
    if (d > 0.01) this.tmp.divideScalar(d)
    else this.tmp.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
    const reach = d + 0.6
    const time = Math.min(0.75, Math.max(0.35, reach / LUNGE_SPEED))
    this.setArc(this.tmp.x * reach, player.y - this.position.y, this.tmp.z * reach, time)
    this.bitten = false
    this.enter('lunge')
  }

  /** Ballistic velocity covering (dx, dy, dz) in `time` seconds. */
  private setArc(dx: number, dy: number, dz: number, time: number): void {
    this.flight.set(dx / time, Math.min(14, (dy + 0.5 * GRAVITY * time * time) / time), dz / time)
    this.landed = false
  }

  /** One hop toward the lair (after a lunge left it high and dry). */
  private startHop(): void {
    this.hopCount++
    this.tmp.set(this.lair.x - this.position.x, 0, this.lair.z - this.position.z)
    const d = this.tmp.length()
    const step = Math.min(HOP_DISTANCE, d)
    if (d > 0.01) this.tmp.multiplyScalar(step / d)
    const tx = this.position.x + this.tmp.x
    const tz = this.position.z + this.tmp.z
    const s = this.surfaceAt(Math.floor(tx), Math.floor(tz), this.position.y + 0.5)
    const ty = s ? (s.water ? s.y - FLOAT_DEPTH : s.y) : this.position.y
    this.setArc(this.tmp.x, ty - this.position.y, this.tmp.z, HOP_TIME)
    this.faceToward(tx, tz, 1, 100)
    this.enter('hop')
  }

  /** Ballistic flight with block collision; sets `landed` on ground or water. */
  private flyStep(deltaTime: number): void {
    this.flight.y -= GRAVITY * deltaTime
    const pos = this.position
    const nx = pos.x + this.flight.x * deltaTime
    const nz = pos.z + this.flight.z * deltaTime
    const midY = pos.y + 0.4
    if (this.isSolid(nx, midY, pos.z) || this.isSolid(nx, midY + 0.5, pos.z)) this.flight.x = 0
    else pos.x = nx
    if (this.isSolid(pos.x, midY, nz) || this.isSolid(pos.x, midY + 0.5, nz)) this.flight.z = 0
    else pos.z = nz
    const ny = pos.y + this.flight.y * deltaTime
    if (this.flight.y > 0) {
      if (this.isSolid(pos.x, ny + 1.0, pos.z)) this.flight.y = 0
      else pos.y = ny
      return
    }
    const cellY = Math.floor(ny)
    const fx = Math.floor(pos.x)
    const fz = Math.floor(pos.z)
    if (this.isSolid(pos.x, ny, pos.z)) {
      this.land(cellY + 1, false)
      return
    }
    if (this.blockQuery && WATER_IDS.has(this.blockQuery(fx, cellY, fz)) && !WATER_IDS.has(this.blockQuery(fx, cellY + 1, fz))) {
      // Plunged through the surface: float
      this.land(cellY + 1, true)
      pos.y = Math.max(ny, cellY + 1 - FLOAT_DEPTH)
      return
    }
    pos.y = ny
  }

  private land(surfaceY: number, water: boolean): void {
    this.surfaceY = surfaceY
    this.inWater = water
    this.position.y = water ? surfaceY - FLOAT_DEPTH : surfaceY
    this.flight.set(0, 0, 0)
    this.landed = true
  }

  /** A flight that never touched down (open air, unloaded world): drop onto the surface below. */
  private forceLand(): void {
    const s = this.surfaceAt(Math.floor(this.position.x), Math.floor(this.position.z), this.position.y)
    if (s) this.land(s.y, s.water)
    else this.land(this.surfaceY, this.inWater)
  }

  /** Knockback slide while surfaced. */
  private slide(deltaTime: number): void {
    if (this.flight.x === 0 && this.flight.z === 0) return
    const pos = this.position
    const nx = pos.x + this.flight.x * deltaTime
    const nz = pos.z + this.flight.z * deltaTime
    const midY = pos.y + 0.4
    if (!this.isSolid(nx, midY, pos.z)) pos.x = nx
    if (!this.isSolid(pos.x, midY, nz)) pos.z = nz
    const decay = Math.max(0, 1 - deltaTime * 6)
    this.flight.x *= decay
    this.flight.z *= decay
    if (Math.abs(this.flight.x) + Math.abs(this.flight.z) < 0.05) this.flight.set(0, 0, 0)
  }

  private tryBite(player: THREE.Vector3): void {
    // Mouth: the front of the head
    this.tmp.set(this.position.x + Math.sin(this.yaw) * 0.8, this.position.y + 0.4, this.position.z + Math.cos(this.yaw) * 0.8)
    this.tmp2.set(player.x, player.y + PLAYER_CHEST, player.z)
    if (this.tmp.distanceTo(this.tmp2) > BITE_REACH) return
    // Never through a wall
    if (!this.hasClearLine(player, this.position.y + 0.5)) return
    this.bitten = true
    if (!this.playerDamageCallback) return
    // The bite drags its prey toward the water it leapt from
    this.tmp.set(this.pullAnchor.x - player.x, 0, this.pullAnchor.z - player.z)
    if (this.tmp.lengthSq() < 0.25) this.tmp.set(-this.flight.x, 0, -this.flight.z)
    if (this.tmp.lengthSq() < 1e-6) this.tmp.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    this.tmp.normalize().multiplyScalar(PULL_H)
    this.tmp.y = PULL_V
    this.playerDamageCallback(BITE_DAMAGE, this.tmp.clone(), 'melee')
  }

  /** No solid block between (its x, `fromY`, its z) and the player's chest (sampled). */
  private hasClearLine(player: THREE.Vector3, fromY: number): boolean {
    if (!this.solidQuery) return true
    const dx = player.x - this.position.x
    const dy = player.y + PLAYER_CHEST - fromY
    const dz = player.z - this.position.z
    const steps = Math.ceil(Math.hypot(dx, dy, dz) / 0.5)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (this.isSolid(this.position.x + dx * t, fromY + dy * t, this.position.z + dz * t)) return false
    }
    return true
  }

  private isSolid(x: number, y: number, z: number): boolean {
    if (!this.solidQuery) return y < 0
    return this.solidQuery(Math.floor(x), Math.floor(y), Math.floor(z))
  }

  private horizontalDistance(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z)
  }

  private faceToward(x: number, z: number, deltaTime: number, rate: number): void {
    const dx = x - this.position.x
    const dz = z - this.position.z
    if (dx * dx + dz * dz < 0.01) return
    const target = Math.atan2(dx, dz)
    let diff = target - this.yaw
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    this.yaw += diff * Math.min(1, deltaTime * rate)
  }

  // ---- presentation ----

  private syncTransform(): void {
    const mesh = this.getMesh()
    if (mesh) {
      mesh.position.copy(this.position)
      mesh.rotation.y = this.yaw
    }
    const body = this.getPhysicsBody()
    if (body) body.position.copy(this.position)
  }

  /** A sound at the water line where it lies. */
  private playSoundHere(id: 'night.splash' | 'night.vanish', options?: PlaySoundOptions): void {
    this.soundAt.x = this.position.x
    this.soundAt.y = Math.max(this.position.y, this.surfaceY)
    this.soundAt.z = this.position.z
    playSound(id, this.soundAt, options)
  }

  /** Throw the splash droplets up around the body at the water line. */
  private splash(strength: number): void {
    const waterLine = this.surfaceY - this.position.y
    for (let i = 0; i < this.splashDrops.length; i++) {
      const a = (i / this.splashDrops.length) * Math.PI * 2 + Math.random() * 0.5
      const r = 0.6 + Math.random() * 0.6
      const drop = this.splashDrops[i]
      drop.position.set(Math.cos(a) * r, waterLine, Math.sin(a) * r + 0.3)
      this.splashVelocity[i].set(Math.cos(a) * 1.6, (3.5 + Math.random() * 2.5) * strength, Math.sin(a) * 1.6)
      this.splashLife[i] = 0.5 + Math.random() * 0.3
      drop.visible = true
    }
  }

  private animate(deltaTime: number): void {
    const k = (rate: number): number => Math.min(1, deltaTime * rate)
    const s = this.ai
    const croak = s === 'surfaced' ? Math.max(0, Math.sin(this.time * 3.2)) ** 2 : 0

    // Jaw: ajar while lurking, gaping in the leap, croaking when surfaced
    const jawTarget = this._isDying ? 0.5 : s === 'lunge' ? 0.95 : s === 'windup' ? 0.4 : s === 'surfaced' ? 0.08 + croak * 0.25 : s === 'exit' ? 0 : 0.06
    this.jawOpen += (jawTarget - this.jawOpen) * k(12)
    if (this.jaw) this.jaw.rotation.x = this.jawOpen * 0.95
    if (this.sac) this.sac.scale.set(1 + croak * 0.35, 0.5 + croak * 1.1, 1 + croak * 0.35)

    // Body: a gentle bob in the water, nose up in the leap, belly-up in death
    let pitchTarget = 0
    if (s === 'lunge' || s === 'hop') pitchTarget = -Math.atan2(this.flight.y, Math.max(1, Math.hypot(this.flight.x, this.flight.z))) * 0.6
    else if (s === 'windup') pitchTarget = -0.25
    this.bodyPitch += (pitchTarget - this.bodyPitch) * k(10)
    if (this.body) {
      this.body.position.y = s === 'lurk' || s === 'creep' ? Math.sin(this.time * 1.6) * 0.03 : 0
      this.body.rotation.x = this.bodyPitch
      this.body.rotation.z = this.bodyRoll
    }

    // Legs kick out behind in the leap, tuck in at rest
    const airborne = s === 'lunge' || (s === 'hop' && this.hopPause <= 0)
    const legTarget = airborne ? -0.9 : 0
    const armTarget = airborne ? -0.6 : 0
    for (const leg of [this.legL, this.legR]) if (leg) leg.rotation.x += (legTarget - leg.rotation.x) * k(12)
    for (const arm of [this.armL, this.armR]) if (arm) arm.rotation.x += (armTarget - arm.rotation.x) * k(12)

    // Lure: sways like a will-o'-wisp; snaps down for the telegraph
    const dipTarget = s === 'windup' ? 1 : 0
    this.lureDip += (dipTarget - this.lureDip) * k(s === 'windup' ? 18 : 4)
    const flareTarget = s === 'windup' || s === 'lunge' ? 1 : 0
    this.lureFlare += (flareTarget - this.lureFlare) * k(10)
    if (this.lureBase && this.lureMid && this.bulbHang) {
      const sway = s === 'lurk' || s === 'creep' ? 1 : 0.4
      this.lureBase.rotation.x = 0.2 + Math.sin(this.time * 0.9) * 0.14 * sway + this.lureDip * 0.9
      this.lureBase.rotation.z = Math.sin(this.time * 0.7) * 0.28 * sway
      this.lureMid.rotation.x = 1.1 + Math.sin(this.time * 1.3 + 1) * 0.18 * sway + this.lureDip * 0.5
      // The bulb hangs plumb from the tip, swinging a little behind the stalk
      this.bulbHang.rotation.x = -(this.lureBase.rotation.x + this.lureMid.rotation.x + this.bodyPitch) + Math.sin(this.time * 2.1) * 0.15
      this.bulbHang.rotation.z = -this.lureBase.rotation.z - this.bodyRoll
    }
    if (this.bulbMaterial && this.haloMaterial) {
      const leaving = s === 'exit' ? Math.min(1, this.stateTime / (EXIT_DURATION * 0.6)) : 0
      const dying = this._isDying ? Math.min(1, this.deathTimer / (DEATH_DURATION * 0.5)) : 0
      const dim = Math.max(leaving, dying)
      const pulse = 0.88 + 0.12 * Math.sin(this.time * 2.1)
      this.bulbMaterial.color.setHex(LURE).multiplyScalar(pulse)
      if (this.lureFlare > 0.01) this.bulbMaterial.color.lerp(FLARE_COLOR, this.lureFlare)
      if (dim > 0) this.bulbMaterial.color.lerp(DIM_COLOR, dim)
      this.haloMaterial.opacity = (0.22 + 0.08 * Math.sin(this.time * 2.1) + this.lureFlare * 0.25) * (1 - dim)
    }

    // Splash droplets
    for (let i = 0; i < this.splashDrops.length; i++) {
      if (this.splashLife[i] <= 0) continue
      const drop = this.splashDrops[i]
      this.splashLife[i] -= deltaTime
      this.splashVelocity[i].y -= GRAVITY * 0.6 * deltaTime
      drop.position.addScaledVector(this.splashVelocity[i], deltaTime)
      if (this.splashLife[i] <= 0) drop.visible = false
    }

    // Fade out at the end of the exit and the death
    let fade = 1
    if (s === 'exit') fade = 1 - Math.max(0, (this.stateTime / EXIT_DURATION - 0.45) / 0.55)
    if (this._isDying) fade = 1 - Math.max(0, (this.deathTimer / DEATH_DURATION - 0.4) / 0.6)
    if (fade < 1) fadeMaterials(this.fadeTargets, Math.max(0, fade), this.baseOpacity)
  }

  private updateDeath(deltaTime: number): void {
    this.deathTimer += deltaTime
    // Killed mid-leap: finish the fall first
    if (!this.landed && (this.ai === 'lunge' || this.ai === 'hop')) {
      this.flyStep(deltaTime)
      if (this.deathTimer > LUNGE_MAX_TIME) this.forceLand()
    } else {
      // Belly-up, then it slips under
      this.position.y -= deltaTime * (this.deathTimer > DEATH_DURATION * 0.4 ? 0.9 : 0)
    }
    this.bodyRoll += (Math.PI - this.bodyRoll) * Math.min(1, deltaTime * 5)
    if (this.deathTimer >= DEATH_DURATION) this.kill()
  }

  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying || this.dawn.leaving || this.ai === 'settle') return false
    return this.position.distanceTo(playerPosition) <= maxDistance + 1.5
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying || this.dawn.leaving) return false
    this.health -= getPlayerAttackDamage(heldItem)
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      return true
    }
    const knockback = getPlayerAttackKnockback(heldItem)
    switch (this.ai) {
      case 'lurk':
      case 'creep':
      case 'sink':
        // Submerged it doesn't budge - it erupts at its attacker
        this.windupTime = HIT_WINDUP_TIME
        this.startWindup()
        break
      case 'surfaced':
      case 'hop':
        if (this.ai === 'hop' && !this.landed) break
        // Heavy: shoved a little, briefly checked
        this.flight.set(this.position.x - playerPosition.x, 0, this.position.z - playerPosition.z)
        if (this.flight.lengthSq() > 1e-6) this.flight.normalize()
        this.flight.multiplyScalar(HIT_PUSH * knockback)
        this.stateTime = Math.min(this.stateTime, SURFACED_TIME - HIT_STUN * Math.min(1, knockback))
        break
      // Windup and lunge are committed: the blow lands, the leap goes on
    }
    return true
  }

  getDrops(): IItem[] {
    if (this.dropsCollected) return []
    this.dropsCollected = true
    const drops: IItem[] = [new AnglerLureItem()]
    if (Math.random() < 0.5) drops.push(new SlimeBallItem())
    return drops
  }

  dispose(): void {
    this.body = null
    this.jaw = null
    this.sac = null
    this.lureBase = null
    this.lureMid = null
    this.bulbHang = null
    this.armL = null
    this.armR = null
    this.legL = null
    this.legR = null
    this.bulbMaterial = null
    this.haloMaterial = null
    this.splashDrops.length = 0
    this.splashVelocity.length = 0
    this.splashLife.length = 0
    this.fadeTargets.length = 0
    this.baseOpacity.clear()
    this.playerPositionRef = null
    this.playerDamageCallback = null
    this.blockQuery = null
    this.solidQuery = null
    super.dispose()
  }
}
