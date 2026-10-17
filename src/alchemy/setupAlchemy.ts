import type * as THREE from 'three'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import type { IPlayerHealth } from '../player/PlayerHealth.ts'
import type { IPlayerState } from '../player/PlayerState.ts'
import type { ItemConsumption } from '../player/ItemConsumption.ts'
import { playerEffects, StatusEffectIds } from '../player/effects/StatusEffects.ts'
import { EffectBehaviours, getMovementSpeedMultiplier } from '../player/effects/EffectBehaviours.ts'
import type { IEffectBody } from '../player/effects/EffectBehaviours.ts'
import { registerEffectDisplay } from '../player/effects/registerEffectDisplay.ts'
import { ReturnIdolController } from '../player/returnidol/ReturnIdolController.ts'
import { createStatusEffectHUD } from '../ui/StatusEffectHUD.ts'
import type { StatusEffectHUD } from '../ui/StatusEffectHUD.ts'
import { createEffectVignetteUI } from '../ui/EffectVignette.ts'
import { createReturnIdolOverlayUI } from '../ui/ReturnIdolOverlay.ts'
import { createHudMessageUI } from '../ui/HudMessage.ts'
import { getWorldLightFloor, setWorldLightFloor } from '../renderer/worldLightShader.ts'

/**
 * Alchemy wiring: status effect behaviours, the effects HUD and debuff
 * vignettes, and the Return Idol. Called once from main.ts (depth wiring),
 * AFTER the 'skybox' task is registered: the effects task post-adjusts the
 * light floor the atmosphere sets there (ember sight).
 */
export interface AlchemyDeps {
  readonly scheduler: TaskScheduler
  readonly playerHealth: IPlayerHealth
  readonly playerBody: IEffectBody & { readonly position: THREE.Vector3 }
  readonly camera: THREE.Camera
  readonly cameraControls: {
    setInputEnabled(enabled: boolean): void
    addSpeedModifier(modifier: () => number): () => void
  }
  readonly healthDisplay: { flash(): void }
  readonly environmentalDamage: { setFireImmunityQuery(query: () => boolean): void }
  readonly itemConsumption: ItemConsumption
  readonly playerState: IPlayerState
  readonly isSolid: (x: number, y: number, z: number) => boolean
  /** True once the world data holding block (x, y, z) is loaded and lit. */
  readonly isLoadedAt: (x: number, y: number, z: number) => boolean
  readonly getRespawnPosition: () => THREE.Vector3
  /**
   * Whether the player is in gameplay (pointer locked to the game). An overlay
   * opened during the teleport veil (inventory, journal, pause menu) holds the
   * pointer: the teleport's end then leaves input to it.
   */
  readonly isInGameplay: () => boolean
  /** Clear fall tracking, lava/burn timers and the burn vignette (as on respawn). */
  readonly resetAfterTeleport: () => void
  readonly persistence: {
    initialize(): Promise<unknown>
    registerPlayerDataContributor(key: string, collect: () => unknown): void
    loadPlayerData<T>(key: string): Promise<T | null>
  }
}

export interface AlchemySystems {
  readonly behaviours: EffectBehaviours
  readonly hud: StatusEffectHUD
  readonly returnIdol: ReturnIdolController
}

const PLAYER_DATA_KEY = 'alchemy'
interface AlchemyPlayerData {
  readonly version: 1
  readonly idolCooldown?: number
}

export function setupAlchemy(deps: AlchemyDeps): AlchemySystems {
  registerEffectDisplay()

  const vignette = createEffectVignetteUI()
  const behaviours = new EffectBehaviours({
    playerHealth: deps.playerHealth,
    playerBody: deps.playerBody,
    getLightFloor: getWorldLightFloor,
    setLightFloor: setWorldLightFloor,
    onEffectDamage: (effectId) => {
      deps.healthDisplay.flash()
      if (effectId === StatusEffectIds.POISON) vignette.pulsePoison()
    },
  })
  deps.environmentalDamage.setFireImmunityQuery(() => behaviours.isFireImmune())
  deps.cameraControls.addSpeedModifier(() => getMovementSpeedMultiplier())

  const hud = createStatusEffectHUD()
  const messages = createHudMessageUI()

  const returnIdol = new ReturnIdolController({
    playerBody: deps.playerBody,
    camera: deps.camera,
    playerHealth: deps.playerHealth,
    // Re-enabling (teleport done) only in gameplay: an overlay opened under the
    // veil re-enables input itself when it closes / the pointer locks again
    setInputEnabled: (enabled) => deps.cameraControls.setInputEnabled(enabled && deps.isInGameplay()),
    getDestination: deps.getRespawnPosition,
    resetTransientState: deps.resetAfterTeleport,
    isSolid: deps.isSolid,
    isLoadedAt: deps.isLoadedAt,
    getChannelProgress: () => {
      if (!deps.itemConsumption.isConsuming()) return null
      const toolbar = deps.playerState.inventory.toolbar
      const held = toolbar.getStack(toolbar.selectedIndex)
      return held?.item.id === 'return_idol' ? deps.itemConsumption.getConsumptionProgress() : null
    },
    overlay: createReturnIdolOverlayUI(),
    showMessage: (text, color) => messages.show(text, 2.2, color),
  })

  // Idol cooldown survives a reload. Contribute only once the stored value
  // was read: an earlier save (or one after a failed read) would write 0
  // over it.
  deps.persistence
    .initialize()
    .then(() => deps.persistence.loadPlayerData<AlchemyPlayerData>(PLAYER_DATA_KEY))
    .then((data) => {
      if (data && typeof data.idolCooldown === 'number') returnIdol.setCooldownRemaining(data.idolCooldown)
      deps.persistence.registerPlayerDataContributor(PLAYER_DATA_KEY, (): AlchemyPlayerData => ({
        version: 1,
        idolCooldown: returnIdol.getCooldownRemaining(),
      }))
    })
    .catch((error) => console.warn('[alchemy] could not load player data (not saving it this session)', error))

  // Runs after 'status-effects' and 'skybox' (registered earlier, same priority)
  deps.scheduler.createTask({
    id: 'alchemy-effects',
    priority: TaskPriority.CRITICAL,
    update: (dt) => {
      behaviours.update(dt)
      vignette.setFrost(playerEffects.has(StatusEffectIds.SLOWNESS))
      returnIdol.update(dt)
      hud.update(dt)
    },
  })

  return { behaviours, hud, returnIdol }
}
