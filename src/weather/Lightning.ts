import * as THREE from 'three'
import { gameEvents } from '../events/GameEvents.ts'
import type { LightningRenderer } from '../renderer/weather/LightningRenderer.ts'
import { lightningRods } from './LightningRods.ts'
import type { WeatherLook } from './WeatherLook.ts'

/**
 * Lightning: strikes around the player at the weather's rate, flashes in far
 * clouds, and falling stars on meteor-shower nights. A strike picks a spot
 * (the highest of a few nearby columns - lightning likes high ground), a
 * lightning rod within reach catches it instead, and where it lands it chars
 * a log, fuses sand into fulgurite or burns whoever stands there.
 */

/** Strikes land between these distances from the player (blocks), biased far. */
const STRIKE_NEAR = 18
const STRIKE_FAR = 170
/** Chance a strike seeks out an exposed player (lands within ~2 blocks of them). */
const PLAYER_STRIKE_CHANCE = 0.035
/** A strike within this distance of the player (horizontally, and 4 up/down) hurts them. */
const STRIKE_HURT_RADIUS = 3
const STRIKE_DAMAGE = 6
/** Bolts start this far above where they land (clouds); in the cavern, at the ceiling. */
const CLOUD_HEIGHT = 140
const CAVERN_CEILING = 139
/** Far flashes: per minute per unit of local lightning, and from a storm on the horizon. */
const FAR_FLASH_SHARE = 0.8
const HORIZON_FLASHES_PER_MINUTE = 2.5
/** Falling stars per minute at a full meteor shower, and where they land. */
const STARS_PER_MINUTE = 0.7
const STAR_NEAR = 30
const STAR_FAR = 110

export interface LightningWorld {
  /** Top surface of a column (the Y of the first open cell above the ground), or null if unloaded. */
  surfaceAt(x: number, z: number): number | null
  /** In the cavern: the floor under the ceiling (first cell weather stops on, scanning down), or null. */
  cavernFloorAt(x: number, z: number, fromY: number): number | null
  getBlockId(x: number, y: number, z: number): number
  setBlock(x: number, y: number, z: number, id: number): void
  /** Block ids a strike changes: what it hit → what it becomes (logs → charred, sand → fulgurite). */
  strikeResult(id: number): number | null
  /** Whether a placed star fragment can sit on this block (solid ground). */
  isSolid(id: number): boolean
  starFragmentId: number
}

export interface LightningPlayer {
  readonly position: THREE.Vector3
  /** Under open sky (nothing over the head). */
  exposed(): boolean
  hurt(amount: number): void
}

export class LightningSystem {
  /** 0-1: how bright the sky and world flash now. */
  flash = 0
  /** Direction toward the latest flash (for the sky). */
  readonly flashDir = new THREE.Vector3(0, 1, 0)
  private readonly color = new THREE.Color()
  private readonly scratch = new THREE.Vector3()

  constructor(
    private readonly renderer: LightningRenderer,
    private readonly world: LightningWorld,
    private readonly player: LightningPlayer,
  ) {}

  /**
   * @param look the weather at the player (lightning rate, colour, meteors)
   * @param cavern in the Hell cavern (bolts drop from the ceiling)
   * @param night meteor showers only show at night
   * @param stormNear 0-1: storm clouds in view somewhere (sky map), for flashes on the horizon
   */
  update(dt: number, look: WeatherLook, cavern: boolean, night: number, stormNear: number, stormDirX: number, stormDirZ: number): void {
    this.flash = Math.max(0, this.flash - dt * 4)
    this.renderer.update(dt)

    const rate = look.lightning / 60
    if (rate > 0 && Math.random() < rate * dt) this.strike(look, cavern)
    // Far flashes: in the storm's own clouds, and from storms on the horizon
    const far = (rate * FAR_FLASH_SHARE + (cavern ? 0 : (stormNear * HORIZON_FLASHES_PER_MINUTE) / 60))
    if (far > 0 && Math.random() < far * dt) {
      const local = rate * FAR_FLASH_SHARE >= far * Math.random()
      const angle = Math.random() * Math.PI * 2
      const dir = local ? this.scratch.set(Math.cos(angle), 0.35, Math.sin(angle)) : this.scratch.set(stormDirX, 0.15, stormDirZ)
      const distance = local ? 300 + Math.random() * 600 : 600 + Math.random() * 700
      this.raiseFlash(0.25 + Math.random() * 0.25, dir.normalize())
      gameEvents.emit({ type: 'lightning-flash', distance })
    }

    if (!cavern && look.meteors > 0 && night > 0.5 && Math.random() < ((look.meteors * STARS_PER_MINUTE) / 60) * dt) this.fallingStar()
  }

  /** A strike somewhere around the player now (or aimed at x/z: debug and tests). */
  strike(look: WeatherLook, cavern: boolean, at?: { x: number; z: number }): void {
    const p = this.player.position
    let x = 0
    let z = 0
    let ground: number | null = null
    if (at) {
      x = at.x
      z = at.z
      ground = this.groundAt(x, z, cavern, p.y)
    } else if (this.player.exposed() && Math.random() < PLAYER_STRIKE_CHANCE) {
      x = p.x + (Math.random() - 0.5) * 4
      z = p.z + (Math.random() - 0.5) * 4
      ground = this.groundAt(x, z, cavern, p.y)
    } else {
      // The highest of three nearby candidates: lightning prefers high ground
      const angle = Math.random() * Math.PI * 2
      const r = STRIKE_NEAR + (STRIKE_FAR - STRIKE_NEAR) * Math.sqrt(Math.random())
      const cx = p.x + Math.cos(angle) * r
      const cz = p.z + Math.sin(angle) * r
      for (let i = 0; i < 3; i++) {
        const tx = cx + (Math.random() - 0.5) * 16
        const tz = cz + (Math.random() - 0.5) * 16
        const g = this.groundAt(tx, tz, cavern, p.y)
        if (g !== null && (ground === null || g > ground)) {
          ground = g
          x = tx
          z = tz
        }
      }
    }
    if (ground === null) return

    // A lightning rod within reach catches it
    let rod = false
    if (!cavern) {
      const catcher = lightningRods.catcher(x, z)
      if (catcher) {
        x = catcher.x
        z = catcher.z
        ground = catcher.y
        rod = true
      }
    }
    x = Math.floor(x) + 0.5
    z = Math.floor(z) + 0.5

    this.color.setRGB(look.lightningColor[0], look.lightningColor[1], look.lightningColor[2])
    const top = new THREE.Vector3(x + (Math.random() - 0.5) * 30, cavern ? CAVERN_CEILING : ground + CLOUD_HEIGHT, z + (Math.random() - 0.5) * 30)
    this.renderer.strike(top, new THREE.Vector3(x, ground, z), this.color)

    const dx = x - p.x
    const dz = z - p.z
    const distance = Math.hypot(dx, dz, ground - p.y)
    this.raiseFlash(Math.min(1, Math.max(0.3, 1.25 - distance / 160)), this.scratch.set(dx, ground + 60 - p.y, dz).normalize())

    // What it hits
    if (!rod && !cavern) {
      const hit = Math.floor(ground) - 1
      const result = this.world.strikeResult(this.world.getBlockId(Math.floor(x), hit, Math.floor(z)))
      if (result !== null) this.world.setBlock(Math.floor(x), hit, Math.floor(z), result)
    }
    if (!rod && Math.hypot(dx, dz) <= STRIKE_HURT_RADIUS && Math.abs(ground - p.y) <= 4 && this.player.exposed()) {
      this.player.hurt(STRIKE_DAMAGE)
    }
    gameEvents.emit({ type: 'lightning-strike', x, y: ground, z, distance, rod })
  }

  private groundAt(x: number, z: number, cavern: boolean, playerY: number): number | null {
    return cavern ? this.world.cavernFloorAt(x, z, Math.min(CAVERN_CEILING, playerY + 40)) : this.world.surfaceAt(x, z)
  }

  private raiseFlash(amount: number, dir: THREE.Vector3): void {
    if (amount >= this.flash) this.flashDir.copy(dir)
    this.flash = Math.max(this.flash, amount)
  }

  /** A shooting star comes down somewhere around the player and leaves a star fragment. */
  fallingStar(): void {
    const p = this.player.position
    // A few tries at dry, open ground (not water, not a tree top)
    let x = 0
    let z = 0
    let ground: number | null = null
    for (let attempt = 0; attempt < 8 && ground === null; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const r = STAR_NEAR + (STAR_FAR - STAR_NEAR) * Math.random()
      x = Math.floor(p.x + Math.cos(angle) * r)
      z = Math.floor(p.z + Math.sin(angle) * r)
      const top = this.world.surfaceAt(x + 0.5, z + 0.5)
      if (top === null) continue
      if (this.world.isSolid(this.world.getBlockId(x, top - 1, z)) && this.world.getBlockId(x, top, z) === 0) ground = top
    }
    if (ground === null) return
    const to = new THREE.Vector3(x + 0.5, ground + 0.4, z + 0.5)
    const across = Math.random() * Math.PI * 2
    const from = to.clone().add(new THREE.Vector3(Math.cos(across) * 160, 220, Math.sin(across) * 160))
    this.color.setRGB(0.75, 0.85, 1.0)
    // Announced as it starts falling: the sound's whoosh, then its impact as it lands
    gameEvents.emit({ type: 'star-fallen', x: to.x, y: ground, z: to.z, distance: to.distanceTo(p) })
    const landY = ground
    this.renderer.fallingStar(from, to, this.color, () => {
      // Still free when it lands (the player may have built there)
      if (this.world.getBlockId(x, landY, z) === 0) this.world.setBlock(x, landY, z, this.world.starFragmentId)
      this.raiseFlash(0.25, this.scratch.set(to.x - p.x, 30, to.z - p.z).normalize())
    })
  }
}
