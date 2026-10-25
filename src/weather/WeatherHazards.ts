import type { WeatherLook } from './WeatherLook.ts'

/**
 * What weather does to a player caught out in it (only under open sky - a
 * roof is always the answer): rain puts out a burning player, hail stings,
 * falling embers can set them alight, sulphur rain poisons and a blizzard's
 * cold brings frostbite after a while, and a gale pushes them along.
 */

/** Seconds between hail stings, and their damage. */
const HAIL_INTERVAL = 5
const HAIL_DAMAGE = 1
/** Chance per second at full embers that one sets the player alight, and for how many burn ticks. */
const EMBER_IGNITE_PER_SECOND = 0.05
const EMBER_BURN_TICKS = 2
/** Seconds out in sulphur rain before it poisons, and the poison's length (refreshed). */
const SULPHUR_GRACE = 6
const SULPHUR_POISON_SECONDS = 4
/** Seconds out in freezing weather before frostbite sets in, and its length (refreshed). */
const COLD_GRACE = 12
const COLD_FROSTBITE_SECONDS = 5
/** Push of a full gale on an exposed player (blocks/s). */
const GALE_PUSH = 1.4

export interface HazardPlayer {
  isDead(): boolean
  isBurning(): boolean
  extinguish(): void
  ignite(ticks: number): void
  hurt(amount: number, source: 'projectile' | 'magic'): void
  applyEffect(id: string, seconds: number, level: number): void
  /** Push the player along (blocks/s this frame). */
  push(x: number, z: number, dt: number): void
  /** One action-bar line, at most every few seconds per key. */
  notice(key: string, text: string): void
}

export class WeatherHazards {
  private hailClock = 0
  private sulphurFor = 0
  private coldFor = 0
  /** Seconds since each effect was last applied (re-applied shortly before it runs out, not every frame). */
  private readonly sinceApplied = new Map<string, number>()

  constructor(private readonly player: HazardPlayer) {}

  /**
   * @param exposed the player is under open sky (or the open cavern, in Hell)
   */
  update(dt: number, look: WeatherLook, exposed: boolean, windX: number, windZ: number): void {
    const p = this.player
    for (const [id, t] of this.sinceApplied) this.sinceApplied.set(id, t + dt)
    if (p.isDead() || !exposed) {
      this.sulphurFor = 0
      this.coldFor = Math.max(0, this.coldFor - dt * 2)
      return
    }
    if (look.wet >= 0.3 && p.isBurning()) {
      p.extinguish()
      p.notice('weather.douse', 'The rain puts out the flames.')
    }
    if (look.hail >= 0.3) {
      this.hailClock += dt * look.hail
      if (this.hailClock >= HAIL_INTERVAL) {
        this.hailClock = 0
        p.hurt(HAIL_DAMAGE, 'projectile')
        p.notice('weather.hail', 'Hail! Find a roof.')
      }
    }
    if (look.embers >= 0.3 && Math.random() < EMBER_IGNITE_PER_SECOND * look.embers * dt) {
      p.ignite(EMBER_BURN_TICKS)
      p.notice('weather.embers', 'A falling ember sets you alight!')
    }
    if (look.sulphur >= 0.3) {
      this.sulphurFor += dt
      if (this.sulphurFor >= SULPHUR_GRACE) {
        this.keepEffect('poison', SULPHUR_POISON_SECONDS)
        p.notice('weather.sulphur', 'The sulphur rain burns. Get under cover!')
      }
    } else {
      this.sulphurFor = 0
    }
    if (look.cold >= 0.5) {
      this.coldFor += dt * look.cold
      if (this.coldFor >= COLD_GRACE) {
        this.keepEffect('slowness', COLD_FROSTBITE_SECONDS)
        p.notice('weather.cold', 'The cold bites. Find shelter or a fire.')
      }
    } else {
      this.coldFor = Math.max(0, this.coldFor - dt)
    }
    if (look.gale >= 0.3) p.push(windX * GALE_PUSH * look.gale, windZ * GALE_PUSH * look.gale, dt)
  }

  /** Keep an effect going: apply it, then again only once most of it has run out. */
  private keepEffect(id: string, seconds: number): void {
    const since = this.sinceApplied.get(id)
    if (since !== undefined && since < seconds - 1) return
    this.player.applyEffect(id, seconds, 1)
    this.sinceApplied.set(id, 0)
  }
}
