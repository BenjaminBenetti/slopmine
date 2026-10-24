import * as THREE from 'three'
import { LAYER_BOUNDARY_Y } from '../world/generate/GenerationConfig.ts'
import type { SigilCompassHud } from '../ui/SigilCompassHud.ts'
import { poiRegistry, type LoadedPoi } from './PoiRegistry.ts'
import type { PoiDiscoveries } from './PoiDiscoveries.ts'

/** Item id of the Delver's Compass. */
export const DELVERS_COMPASS_ITEM_ID = 'delvers_compass'

/** Re-pick the target this often (seconds) while held. */
const REFRESH_INTERVAL = 1
/** Within this horizontal distance the player has arrived. */
const ARRIVED_DISTANCE = 8
/** Height differences shown from this many blocks. */
const SHOW_HEIGHT_FROM = 6

export interface DelversCompassDeps {
  readonly camera: THREE.Camera
  /** The player's feet (live reference). */
  readonly playerPosition: THREE.Vector3
  isHoldingCompass(): boolean
  readonly discoveries: PoiDiscoveries
  readonly hud: SigilCompassHud
}

/**
 * The Delver's Compass: while held in the overworld, the HUD needle points
 * to the nearest point of interest the player hasn't discovered yet, among
 * the ones loaded around them (the world loads well past the view, so that
 * is everything within reach). It names nothing until you get there - the
 * plaque only says how far, and how far up or down.
 */
export class DelversCompass {
  private target: LoadedPoi | null = null
  private refreshTimer = 0
  private readonly forward = new THREE.Vector3()
  private bearing = 0

  constructor(private readonly deps: DelversCompassDeps) {}

  update(deltaTime: number): void {
    const { hud, playerPosition: player } = this.deps
    if (!this.deps.isHoldingCompass()) {
      hud.setVisible(false)
      this.refreshTimer = 0
      return
    }
    hud.setVisible(true)
    this.refreshTimer -= deltaTime
    if (this.refreshTimer <= 0 || (this.target && this.deps.discoveries.isDiscovered(this.target))) {
      this.refreshTimer = REFRESH_INTERVAL
      this.target = player.y >= LAYER_BOUNDARY_Y ? this.nearestUndiscovered() : null
    }
    const target = this.target
    if (!target) {
      hud.show({ kind: 'silent', message: player.y >= LAYER_BOUNDARY_Y ? 'Nothing left to find nearby' : 'The rune lies still' })
      hud.update(deltaTime)
      return
    }
    const tx = target.x + 0.5 - player.x
    const tz = target.z + 0.5 - player.z
    const distance = Math.hypot(tx, tz)
    this.deps.camera.getWorldDirection(this.forward)
    const fLen = Math.hypot(this.forward.x, this.forward.z)
    if (fLen > 1e-3) {
      const fx = this.forward.x / fLen
      const fz = this.forward.z / fLen
      this.bearing = Math.atan2(tx * -fz + tz * fx, tx * fx + tz * fz)
    }
    // The keystone lies under the floor: aim at standing height
    const dy = target.y + 2 - player.y
    let detail = distance < ARRIVED_DISTANCE ? 'Close' : `${Math.round(distance)} blocks`
    if (Math.abs(dy) >= SHOW_HEIGHT_FROM) detail += ` · ${Math.round(Math.abs(dy))} ${dy > 0 ? 'above' : 'below'}`
    hud.show({ kind: 'target', name: 'Something undiscovered', detail, bearing: this.bearing, arrived: distance < ARRIVED_DISTANCE, cleared: false })
    hud.update(deltaTime)
  }

  private nearestUndiscovered(): LoadedPoi | null {
    const p = this.deps.playerPosition
    let best: LoadedPoi | null = null
    let bestDistance = Infinity
    for (const poi of poiRegistry.all()) {
      if (this.deps.discoveries.isDiscovered(poi)) continue
      const d = Math.hypot(poi.x - p.x, (poi.y - p.y) * 1.5, poi.z - p.z)
      if (d < bestDistance) {
        bestDistance = d
        best = poi
      }
    }
    return best
  }
}
