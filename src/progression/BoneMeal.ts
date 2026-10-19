import type * as THREE from 'three'
import type { WorldManager } from '../world/WorldManager.ts'
import type { IPlayerState } from '../player/PlayerState.ts'
import { BlockRaycaster } from '../player/BlockRaycaster.ts'
import { MAX_REACH_DISTANCE } from '../player/BlockInteraction.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { BlockRegistry, getBlock } from '../world/blocks/BlockRegistry.ts'
import { isGrowableBlock } from '../world/interfaces/IBlock.ts'
import { playSound } from '../audio/SoundHooks.ts'

/**
 * Bone meal: right-click a growing crop with bone meal in hand to grow it one
 * stage (wheat, hemp, herb, the farm crops), ripen a picked bush (berry,
 * blueberry, prickly pear, pineapple), maybe grow a sapling into a tree, or
 * sprout grass and flowers around a patch of bare ground. One bone meal per
 * use. The block swap is the same one the plant's own growth performs, so
 * block entities and ticks follow as usual.
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

/**
 * What sprouts around bone meal used on bare ground, by the ground block
 * (block names, repeated for weight).
 */
const SPROUTS: ReadonlyMap<number, readonly string[]> = new Map([
  [BlockIds.GRASS, ['short_grass', 'short_grass', 'short_grass', 'short_grass', 'tall_grass', 'tall_grass', 'clover', 'daisy', 'dandelion', 'yellow_flower', 'red_flower', 'blue_flower']],
  [BlockIds.MOSS, ['short_grass', 'short_grass', 'clover', 'sea_thrift']],
  [BlockIds.PODZOL, ['bracken', 'short_grass', 'short_grass', 'brown_mushrooms']],
  [BlockIds.SNOWY_GRASS, ['frosted_grass', 'frosted_grass', 'heather']],
  [BlockIds.MUDDY_GRASS, ['sedge', 'sedge', 'horsetail', 'bog_cotton']],
  [BlockIds.SAND, ['dry_grass', 'dry_grass', 'beach_grass', 'desert_marigold']],
])

/** Sprout plants on bare ground around a bone-mealed block; true if the ground takes bone meal. */
function sproutAround(world: WorldManager, x: bigint, y: bigint, z: bigint): boolean {
  if (!SPROUTS.has(world.getBlock(x, y, z).properties.id)) return false
  const above = world.getBlock(x, y + 1n, z).properties
  if (above.id !== BlockIds.AIR && !above.replaceable) return false
  for (let attempt = 0; attempt < 24; attempt++) {
    const px = x + BigInt(Math.floor(Math.random() * 7) - 3)
    const pz = z + BigInt(Math.floor(Math.random() * 7) - 3)
    const py = y + BigInt(Math.floor(Math.random() * 3) - 1)
    const plants = SPROUTS.get(world.getBlock(px, py, pz).properties.id)
    if (!plants || world.getBlock(px, py + 1n, pz).properties.id !== BlockIds.AIR) continue
    if (Math.random() < 0.4) continue
    const plant = BlockRegistry.getInstance().getBlockByName(plants[Math.floor(Math.random() * plants.length)])
    if (plant) world.setBlock(px, py + 1n, pz, plant.properties.id)
  }
  return true
}

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
    const block = getBlock(hit.blockId)
    const next = NEXT_GROWTH_STAGE.get(hit.blockId)
    if (isGrowableBlock(block)) {
      if (!block.grow(world, hit.worldX, hit.worldY, hit.worldZ)) return
    } else if (next !== undefined) {
      world.setBlock(hit.worldX, hit.worldY, hit.worldZ, next)
    } else if (!sproutAround(world, hit.worldX, hit.worldY, hit.worldZ)) {
      return
    }

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
