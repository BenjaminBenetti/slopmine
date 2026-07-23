import { INVINCIBILITY_DURATION } from '../physics/constants.ts'

export interface PlayerHealthConfig {
  maxHealth?: number
  invincibilityDuration?: number
}

export interface IPlayerHealth {
  readonly currentHealth: number
  readonly maxHealth: number
  readonly isDead: boolean
  readonly isInvincible: boolean

  takeDamage(amount: number): void
  takeEnvironmentalDamage(amount: number): void
  heal(amount: number): void
  setHealth(amount: number): void
  reset(): void
  update(deltaTime: number): void
  setOnHealthChanged(callback: (current: number, max: number) => void): void
  setOnDeath(callback: () => void): void
}

type HealthChangedCallback = (current: number, max: number) => void
type DeathCallback = () => void

export class PlayerHealth implements IPlayerHealth {
  private _currentHealth: number
  private _maxHealth: number
  private _invincibilityDuration: number
  private _invincibilityTimer: number = 0
  private _onHealthChanged: HealthChangedCallback | null = null
  private _onDeath: DeathCallback | null = null

  constructor(config: PlayerHealthConfig = {}) {
    this._maxHealth = config.maxHealth ?? 40
    this._invincibilityDuration = config.invincibilityDuration ?? INVINCIBILITY_DURATION
    this._currentHealth = this._maxHealth
  }

  get currentHealth(): number {
    return this._currentHealth
  }

  get maxHealth(): number {
    return this._maxHealth
  }

  get isDead(): boolean {
    return this._currentHealth <= 0
  }

  get isInvincible(): boolean {
    return this._invincibilityTimer > 0
  }

  takeDamage(amount: number): void {
    if (this.isDead || this.isInvincible || amount <= 0) {
      return
    }

    this._currentHealth = Math.max(0, this._currentHealth - amount)
    this._invincibilityTimer = this._invincibilityDuration

    this._onHealthChanged?.(this._currentHealth, this._maxHealth)

    if (this._currentHealth <= 0) {
      this._onDeath?.()
    }
  }

  /**
   * Apply environmental damage (lava, burning, magma, etc.).
   * Unlike takeDamage, this bypasses melee invincibility frames and does
   * not grant any — the caller is responsible for its own damage cadence.
   */
  takeEnvironmentalDamage(amount: number): void {
    if (this.isDead || amount <= 0) {
      return
    }

    this._currentHealth = Math.max(0, this._currentHealth - amount)

    this._onHealthChanged?.(this._currentHealth, this._maxHealth)

    if (this._currentHealth <= 0) {
      this._onDeath?.()
    }
  }

  heal(amount: number): void {
    if (this.isDead || amount <= 0) {
      return
    }

    const oldHealth = this._currentHealth
    this._currentHealth = Math.min(this._maxHealth, this._currentHealth + amount)

    if (this._currentHealth !== oldHealth) {
      this._onHealthChanged?.(this._currentHealth, this._maxHealth)
    }
  }

  setHealth(amount: number): void {
    this._currentHealth = Math.max(0, Math.min(this._maxHealth, amount))
    this._onHealthChanged?.(this._currentHealth, this._maxHealth)
  }

  reset(): void {
    this._currentHealth = this._maxHealth
    this._invincibilityTimer = 0
    this._onHealthChanged?.(this._currentHealth, this._maxHealth)
  }

  update(deltaTime: number): void {
    if (this._invincibilityTimer > 0) {
      this._invincibilityTimer = Math.max(0, this._invincibilityTimer - deltaTime)
    }
  }

  setOnHealthChanged(callback: HealthChangedCallback): void {
    this._onHealthChanged = callback
  }

  setOnDeath(callback: DeathCallback): void {
    this._onDeath = callback
  }
}
