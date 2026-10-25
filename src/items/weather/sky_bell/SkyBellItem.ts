import { Item } from '../../Item.ts'
import type { IConsumable, IConsumableStats } from '../../interfaces/IConsumable.ts'
import type { IPlayerHealth } from '../../../player/PlayerHealth.ts'
import { showPlayerNotice } from '../../../ui/PlayerNotice.ts'
import { playSound } from '../../../audio/SoundHooks.ts'
import type { SoundId } from '../../../audio/SoundLibrary.ts'
import { ringSkyBell } from '../../../weather/WeatherHooks.ts'
import { getSkyBellPosition, markSkyBellRung, skyBellCooldownRemaining } from './SkyBellHooks.ts'

/**
 * Sky Bell - a golden handbell with a storm rune, forged around a scrap of
 * storm essence. Hold right-click to ring it: under a fair sky rain gathers
 * around you for a while (good for the crops), in wet weather the clouds
 * part. Reusable, with a five-minute rest between rings; it does nothing in
 * Hell (no sky to answer). Crafted from gold bars, storm essence and
 * fulgurite.
 */
export class SkyBellItem extends Item implements IConsumable {
  readonly id = 'sky_bell'
  readonly name = 'sky_bell'
  readonly consumedOnUse = false

  readonly consumableStats: IConsumableStats = {
    consumeTime: 1.5,
  }

  override get displayName(): string {
    return 'Sky Bell'
  }

  override get maxStackSize(): number {
    return 1
  }

  override get iconUrl(): string {
    return new URL('./assets/sky-bell-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['magic']
  }

  canConsume(_playerHealth: IPlayerHealth): boolean {
    const remaining = skyBellCooldownRemaining()
    if (remaining > 0) {
      showPlayerNotice(`The bell is still humming (${Math.ceil(remaining)}s)`)
      return false
    }
    return true
  }

  onConsume(_playerHealth: IPlayerHealth): void {
    const at = getSkyBellPosition()
    const cast = at ? ringSkyBell(at.x, at.z) : null
    if (at) playSound('weather.skybell', at)
    if (cast === null) {
      showPlayerNotice('Nothing answers down here.')
      return
    }
    markSkyBellRung()
    showPlayerNotice(cast === 'rain' ? 'The sky answers: rain is coming.' : 'The clouds begin to part.')
  }
}
