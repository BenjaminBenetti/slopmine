import * as THREE from 'three'
import { setReturnIdolHandler } from '../../items/magic/return_idol/ReturnIdolHooks.ts'
import { registerDamageModifier } from '../DamageModifiers.ts'
import type { IPlayerHealth } from '../PlayerHealth.ts'
import type { ReturnIdolOverlayUI } from '../../ui/ReturnIdolOverlay.ts'
import { EYE_HEIGHT } from '../../physics/constants.ts'

/**
 * Runs the Return Idol: cooldown, channel interruption, and the teleport home
 * (bed or world spawn) with the death respawn's safety - the player is held
 * at the destination (input off, behind a veil) until its world data has
 * loaded, then set down on the ground there.
 *
 * Rules: reusable; 120 s cooldown from each teleport (shown when the idol is
 * used while recharging); any non-magic damage while channeling breaks the
 * channel (it restarts if the button is still held). Usable anywhere,
 * mid-air included - the hold resets fall tracking.
 */
export const RETURN_IDOL_COOLDOWN_SECONDS = 120

/** Damage this recent (s) blocks/breaks the channel. */
const INTERRUPT_WINDOW = 0.6
/** Teleport hold: at least this long (veil fade), at most this long (then release anyway). */
const MIN_HOLD_MS = 1200
const MAX_HOLD_MS = 60000
/** Vertical search range for a safe standing spot at the destination. */
const SAFE_SEARCH = 48
/** After a teleport, swallow "recharging" messages while the button is still held. */
const QUIET_AFTER_TELEPORT = 4

export interface ReturnIdolDeps {
  readonly playerBody: { readonly position: THREE.Vector3; readonly velocity: THREE.Vector3 }
  readonly camera: THREE.Camera
  readonly playerHealth: IPlayerHealth
  readonly setInputEnabled: (enabled: boolean) => void
  /** Where home is (bed spawn, else world spawn) - getRespawnPosition(). */
  readonly getDestination: () => THREE.Vector3
  /** Clear fall tracking, lava/burn timers and the burn vignette (as on respawn). */
  readonly resetTransientState: () => void
  readonly isSolid: (x: number, y: number, z: number) => boolean
  /** True once the world data holding block (x, y, z) is loaded and lit. */
  readonly isLoadedAt: (x: number, y: number, z: number) => boolean
  /** Is the player channeling the idol right now, and how far (0-1). */
  readonly getChannelProgress: () => number | null
  readonly overlay: ReturnIdolOverlayUI
  readonly showMessage: (text: string, color?: string) => void
}

function formatCooldown(seconds: number): string {
  const s = Math.ceil(seconds)
  if (s < 60) return `${s}s`
  const r = s % 60
  return `${Math.floor(s / 60)}:${r < 10 ? '0' : ''}${r}`
}

export class ReturnIdolController {
  private readonly deps: ReturnIdolDeps
  private readonly unregisterModifier: () => void

  private cooldown = 0
  /** Game time (s); drives the interrupt window and message throttling. */
  private clock = 0
  private lastHurtAt = -Infinity
  private lastMessageAt = -Infinity
  private lastTeleportAt = -Infinity
  private teleporting = false

  constructor(deps: ReturnIdolDeps) {
    this.deps = deps
    // Observe (never change) incoming damage: a hit breaks the channel.
    // Poison ('magic') is exempt, or a poisoned player could never escape.
    this.unregisterModifier = registerDamageModifier((amount, source) => {
      if (amount > 0 && source !== 'magic') this.lastHurtAt = this.clock
      return amount
    })
    setReturnIdolHandler({
      canUse: () => this.canUse(),
      activate: () => this.activate(),
    })
  }

  /** Seconds until the idol can be used again (0 = ready). */
  getCooldownRemaining(): number {
    return this.cooldown
  }

  /** Restore a saved cooldown. */
  setCooldownRemaining(seconds: number): void {
    this.cooldown = Math.max(0, Math.min(RETURN_IDOL_COOLDOWN_SECONDS, Number(seconds) || 0))
  }

  isTeleporting(): boolean {
    return this.teleporting
  }

  /** Call every tick (game time: a paused game doesn't recharge). */
  update(dt: number): void {
    this.clock += dt
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt)
    this.deps.overlay.setChannelProgress(this.teleporting ? null : this.deps.getChannelProgress())
  }

  dispose(): void {
    this.unregisterModifier()
    setReturnIdolHandler(null)
    this.deps.overlay.destroy()
  }

  private canUse(): boolean {
    if (this.teleporting || this.deps.playerHealth.isDead) return false
    if (this.cooldown > 0) {
      if (this.clock - this.lastTeleportAt > QUIET_AFTER_TELEPORT) {
        this.message(`Return Idol recharging: ${formatCooldown(this.cooldown)}`, '#d9c2ff')
      }
      return false
    }
    if (this.clock - this.lastHurtAt < INTERRUPT_WINDOW) {
      this.message('Hurt! The idol\'s pull was broken', '#ffb3a8')
      return false
    }
    return true
  }

  private message(text: string, color: string): void {
    if (this.clock - this.lastMessageAt < 1.5) return
    this.lastMessageAt = this.clock
    this.deps.showMessage(text, color)
  }

  private activate(): void {
    if (!this.canUse()) return
    this.cooldown = RETURN_IDOL_COOLDOWN_SECONDS
    this.lastTeleportAt = this.clock
    this.teleport(this.deps.getDestination())
  }

  /**
   * Teleport to `destination` (feet position) the way respawn does: pin the
   * body there with input off until the world around it has loaded, then put
   * it on the ground (out of any terrain, down onto the floor below).
   */
  private teleport(destination: THREE.Vector3): void {
    const { playerBody, camera, overlay } = this.deps
    this.teleporting = true
    overlay.setChannelProgress(null)
    overlay.showVeil('Returning home...')
    this.deps.setInputEnabled(false)

    // Cell centre: the world spawn sits on a block boundary
    const x = Math.floor(destination.x) + 0.5
    const z = Math.floor(destination.z) + 0.5
    let feetY = destination.y + 0.5

    const pin = (): void => {
      playerBody.position.set(x, feetY, z)
      playerBody.velocity.set(0, 0, 0)
      camera.position.set(x, feetY + EYE_HEIGHT, z)
    }
    pin()
    this.deps.resetTransientState()

    const start = performance.now()
    const hold = (): void => {
      const elapsed = performance.now() - start
      if (this.deps.playerHealth.isDead) {
        // The death respawn takes over (and re-enables input itself)
        this.teleporting = false
        this.deps.overlay.hideVeil()
        return
      }
      if (elapsed >= MIN_HOLD_MS) {
        const safeY = this.findSafeFeetY(x, destination.y, z)
        if (safeY !== null || elapsed >= MAX_HOLD_MS) {
          if (safeY !== null) feetY = safeY + 0.01
          pin()
          this.deps.resetTransientState()
          this.finishTeleport()
          return
        }
      }
      pin()
      requestAnimationFrame(hold)
    }
    requestAnimationFrame(hold)
  }

  private finishTeleport(): void {
    this.teleporting = false
    this.deps.overlay.hideVeil()
    this.deps.setInputEnabled(true)
  }

  /**
   * Feet Y of a safe standing spot in the column at (x, z) near `y0`: rise out
   * of terrain, then drop to the floor. Null while the data isn't loaded yet.
   * Falls back to the original height when no floor is within reach.
   */
  private findSafeFeetY(x: number, y0: number, z: number): number | null {
    const { isSolid, isLoadedAt } = this.deps
    const bx = Math.floor(x)
    const bz = Math.floor(z)
    const startY = Math.max(1, Math.min(509, Math.floor(y0)))
    if (!isLoadedAt(bx, startY, bz) || !isLoadedAt(bx, startY - 1, bz) || !isLoadedAt(bx, startY + 2, bz)) {
      return null
    }
    let y = startY
    // Out of the ground (a hill above the world spawn height)
    for (let i = 0; i < SAFE_SEARCH && (isSolid(bx, y, bz) || isSolid(bx, y + 1, bz)); i++) {
      y++
      if (!isLoadedAt(bx, y + 1, bz)) return null
    }
    // Down to the floor (the world spawn floats above low terrain)
    for (let i = 0; i < SAFE_SEARCH && y > 1 && !isSolid(bx, y - 1, bz); i++) {
      y--
      if (!isLoadedAt(bx, y - 1, bz)) return null
    }
    return isSolid(bx, y - 1, bz) ? y : startY
  }
}
