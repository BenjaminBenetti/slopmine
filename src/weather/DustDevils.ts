import * as THREE from 'three'
import { MAX_DEVILS } from '../renderer/weather/PrecipitationRenderer.ts'

/**
 * Dust devils: a few whirlwinds wandering the open ground around the player
 * while the weather has them (the particle renderer spins sand around each).
 * Each lives a while, drifts with the wind and wanders, and fades in and out.
 */

const NEAR = 22
const FAR = 60
const LIFE: readonly [number, number] = [25, 55]
const FADE = 4

interface Devil {
  readonly pos: THREE.Vector4
  heading: number
  age: number
  life: number
}

export class DustDevils {
  /** For the renderer: x, z, ground y, strength 0-1. */
  readonly positions: THREE.Vector4[] = []
  private readonly devils: Devil[] = []

  /**
   * @param amount 0-1: how many of MAX_DEVILS-1 whirl about (the weather's dustDevils)
   * @param groundAt the floor of a column (where weather lands), or null
   */
  update(dt: number, amount: number, player: THREE.Vector3, windX: number, windZ: number, groundAt: (x: number, z: number) => number | null): void {
    const want = Math.round(amount * (MAX_DEVILS - 1))
    if (this.devils.length < want && Math.random() < dt * 0.5) {
      const angle = Math.random() * Math.PI * 2
      const r = NEAR + Math.random() * (FAR - NEAR)
      const x = player.x + Math.cos(angle) * r
      const z = player.z + Math.sin(angle) * r
      const ground = groundAt(x, z)
      if (ground !== null && Math.abs(ground - player.y) < 20) {
        this.devils.push({ pos: new THREE.Vector4(x, z, ground, 0), heading: Math.random() * Math.PI * 2, age: 0, life: LIFE[0] + Math.random() * (LIFE[1] - LIFE[0]) })
      }
    }
    this.positions.length = 0
    for (let i = this.devils.length - 1; i >= 0; i--) {
      const d = this.devils[i]
      d.age += dt
      const ending = this.devils.length > want || d.age > d.life
      if (ending) d.life = Math.min(d.life, d.age + FADE)
      d.heading += (Math.random() - 0.5) * dt * 2
      const speed = 2.5
      d.pos.x += (Math.cos(d.heading) * speed + windX * 1.5) * dt
      d.pos.y += (Math.sin(d.heading) * speed + windZ * 1.5) * dt
      const ground = groundAt(d.pos.x, d.pos.y)
      if (ground !== null) d.pos.z += (ground - d.pos.z) * Math.min(1, dt * 4)
      const far = Math.hypot(d.pos.x - player.x, d.pos.y - player.z) > FAR * 1.5
      d.pos.w = Math.min(1, d.age / FADE, Math.max(0, (d.life - d.age) / FADE))
      if (d.age >= d.life || far) {
        this.devils.splice(i, 1)
        continue
      }
      this.positions.push(d.pos)
    }
  }
}
