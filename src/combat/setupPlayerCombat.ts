import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import type { IPlayerState } from '../player/PlayerState.ts'
import { gameEvents } from '../events/GameEvents.ts'
import { createAttackChargeIndicator } from './AttackChargeIndicator.ts'
import {
  getPlayerAttackCharge,
  onPlayerAttack,
  resetPlayerAttack,
  tickPlayerAttack,
} from './PlayerAttack.ts'

export interface PlayerCombatDeps {
  readonly scheduler: TaskScheduler
  readonly playerState: IPlayerState
  /** Plays one full swing of the held item on every hit */
  readonly heldItemRenderer: { playAttackSwing(): void }
  /** Whether the in-game HUD (crosshair) is showing - the charge bar follows it */
  readonly isHudVisible: () => boolean
}

/**
 * Wire the player's melee combat: the attack cooldown clock, the charge bar
 * under the crosshair and the swing on every hit. Damage itself is computed
 * by getPlayerAttackDamage (PlayerAttack.ts) when an entity is hit.
 */
export function setupPlayerCombat(deps: PlayerCombatDeps): void {
  const indicator = createAttackChargeIndicator()
  const toolbar = deps.playerState.inventory.toolbar

  onPlayerAttack(() => deps.heldItemRenderer.playAttackSwing())
  gameEvents.on('player-died', () => resetPlayerAttack())

  // CRITICAL: cheap per-frame state; a skipped frame would stall the cooldown
  deps.scheduler.createTask({
    id: 'player-combat',
    priority: TaskPriority.CRITICAL,
    update: (deltaTime) => {
      tickPlayerAttack(deltaTime)
      const held = toolbar.getItem(toolbar.selectedIndex)
      indicator.update(getPlayerAttackCharge(held), deps.isHudVisible())
    },
  })
}
