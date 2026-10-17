import type * as THREE from 'three'
import type { WorldManager } from '../world/WorldManager.ts'
import type { IPlayerState } from '../player/PlayerState.ts'
import { BlockRaycaster } from '../player/BlockRaycaster.ts'
import { MAX_REACH_DISTANCE } from '../player/BlockInteraction.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { playSound } from '../audio/SoundHooks.ts'

/**
 * Bone meal: right-click a growing crop with bone meal in hand to grow it one
 * stage (wheat, hemp, herb), or a picked-clean berry bush to ripen it. One
 * bone meal per use. The block swap is the same one the crop's own growth
 * performs, so block entities and scheduled ticks follow as usual.
 */

export const BONE_MEAL_ITEM_ID = 'bone_meal'

/** Block id → the block id one growth stage later */
const NEXT_GROWTH_STAGE: ReadonlyMap<number, number> = new Map([
  [BlockIds.WHEAT_1, BlockIds.WHEAT_2],
  [BlockIds.WHEAT_2, BlockIds.WHEAT_3],
  [BlockIds.HEMP_1, BlockIds.HEMP_2],
  [BlockIds.HEMP_2, BlockIds.HEMP_3],
  [BlockIds.HERB_1, BlockIds.HERB_2],
  [BlockIds.HERB_2, BlockIds.HERB_3],
  [BlockIds.BERRY_BUSH, BlockIds.BERRY_BUSH_BERRIES],
])

export interface BoneMealOptions {
  domElement: HTMLElement
  camera: THREE.PerspectiveCamera
  world: WorldManager
  playerState: IPlayerState
  /** Called after a use consumed bone meal (sync toolbar/held item) */
  onUsed(): void
}

/** Install the right-click handler. Returns a dispose function. */
export function setupBoneMeal(options: BoneMealOptions): () => void {
  const { domElement, camera, world, playerState } = options
  const raycaster = new BlockRaycaster(world)

  const onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 2) return
    if (document.pointerLockElement !== domElement) return

    const toolbar = playerState.inventory.toolbar
    const stack = toolbar.getStack(toolbar.selectedIndex)
    if (!stack || stack.item.id !== BONE_MEAL_ITEM_ID) return

    const hit = raycaster.castFromCamera(camera, MAX_REACH_DISTANCE)
    if (!hit) return
    const next = NEXT_GROWTH_STAGE.get(hit.blockId)
    if (next === undefined) return

    world.setBlock(hit.worldX, hit.worldY, hit.worldZ, next)
    playSound('item.bonemeal', { x: Number(hit.worldX) + 0.5, y: Number(hit.worldY) + 0.5, z: Number(hit.worldZ) + 0.5 })
    if (stack.count <= 1) {
      toolbar.clearSlot(toolbar.selectedIndex)
    } else {
      stack.count -= 1
    }
    options.onUsed()
  }

  domElement.addEventListener('mousedown', onMouseDown)
  return () => domElement.removeEventListener('mousedown', onMouseDown)
}
