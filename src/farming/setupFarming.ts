import type * as THREE from 'three'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import type { WorldManager } from '../world/WorldManager.ts'
import type { IPlayerState } from '../player/PlayerState.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import { BlockRaycaster } from '../player/BlockRaycaster.ts'
import { MAX_REACH_DISTANCE } from '../player/BlockInteraction.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { BlockRegistry, getBlock } from '../world/blocks/BlockRegistry.ts'
import { blockActionRegistry } from '../ui/blockui/BlockActionRegistry.ts'
import { RandomBlockTicks } from '../world/blocktick/RandomBlockTicks.ts'
import { FORAGE_BUSHES } from '../world/blocks/types/forage_shared/ForageBushBlock.ts'
import { isHarvestableBlock } from '../world/interfaces/IBlock.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import { isFarmlandWatered } from '../world/blocks/types/farmland/FarmlandBlock.ts'
import { playBlockSound } from '../audio/SoundHooks.ts'
import { gameEvents } from '../events/GameEvents.ts'

/** Ground a hoe tills into farmland. */
const TILLABLE: ReadonlySet<number> = new Set([
  BlockIds.GRASS, BlockIds.DIRT, BlockIds.PODZOL, BlockIds.MUDDY_GRASS, BlockIds.MOSS, BlockIds.SNOWY_GRASS,
])

export interface FarmingDeps {
  readonly scheduler: TaskScheduler
  readonly domElement: HTMLElement
  readonly camera: THREE.PerspectiveCamera
  readonly world: WorldManager
  readonly playerState: IPlayerState
  readonly playerBody: IPhysicsBody
  /** A right-click that harvested a bush must not also start eating the held food. */
  readonly itemConsumption: { endPress(): void }
}

/** Seconds between tills while a hoe's right-click is held. */
const TILL_REPEAT = 0.22

/**
 * Farming and wild growth (the Nature Update):
 * - the 'random-block-ticks' task (crops grow, bushes regrow, saplings grow
 *   into trees, farmland dries and wets - world/blocktick/RandomBlockTicks.ts)
 * - right-click (held: repeating) a grass/dirt top with a hoe: farmland
 *   (moist at once when water is within 4 blocks), clearing any grass on it;
 *   emits block-placed ('farmland') for the journal
 * - E or right-click on a ripe berry or forage bush (IHarvestableBlock): pick
 *   it (BlockPlacement places nothing on a ripe bush).
 * Planting is ordinary placement (BlockPlacement: IPlantable items); bone
 * meal grows any IGrowableBlock (progression/BoneMeal.ts).
 */
export function setupFarming(deps: FarmingDeps): void {
  const { world, playerState, domElement, camera } = deps

  deps.scheduler.registerTask(new RandomBlockTicks({
    world,
    getColumn: (cx, cz) => world.getColumnFast(cx, cz),
    getPlayerPosition: () => deps.playerBody.position,
    getBlock,
    blockIds: BlockRegistry.getInstance().getAllBlockIds(),
  }))

  const raycaster = new BlockRaycaster(world)
  const holdingHoe = (): boolean => {
    const toolbar = playerState.inventory.toolbar
    return toolbar.getStack(toolbar.selectedIndex)?.item.id.endsWith('_hoe') === true
  }

  /** Till the ground under the crosshair, if a hoe can; true if it did. */
  const till = (): boolean => {
    const hit = raycaster.castFromCamera(camera, MAX_REACH_DISTANCE)
    if (!hit) return false
    // Aimed at grass on the ground: till the ground under it
    let { worldX: x, worldY: y, worldZ: z } = hit
    if (getBlock(hit.blockId).properties.replaceable) y -= 1n
    const ground = world.getBlock(x, y, z).properties.id
    if (!TILLABLE.has(ground)) return false
    const above = world.getBlock(x, y + 1n, z).properties
    if (above.id !== BlockIds.AIR && !above.replaceable) return false
    if (above.id !== BlockIds.AIR) world.setBlock(x, y + 1n, z, BlockIds.AIR)
    const farmland = isFarmlandWatered(world, x, y, z) ? BlockIds.FARMLAND_MOIST : BlockIds.FARMLAND
    world.setBlock(x, y, z, farmland)
    playBlockSound(BlockIds.DIRT, 'place', { x: Number(x) + 0.5, y: Number(y) + 1, z: Number(z) + 0.5 })
    gameEvents.emit({ type: 'block-placed', blockId: farmland, blockName: 'farmland', x: Number(x), y: Number(y), z: Number(z) })
    return true
  }

  /** Pick a ripe bush at (x, y, z); true if it was one. */
  const harvest = (x: bigint, y: bigint, z: bigint): boolean => {
    const block = world.getBlock(x, y, z)
    if (!isHarvestableBlock(block)) return false
    const items = block.harvest(world, x, y, z)
    if (!items) return false
    world.spawnBlockDrops(x, y, z, items)
    playBlockSound(block.properties.id, 'break', { x: Number(x) + 0.5, y: Number(y) + 0.5, z: Number(z) + 0.5 }, { volume: 0.5 })
    return true
  }

  let rightHeld = false
  let sinceTill = 0
  domElement.addEventListener('mousedown', (event) => {
    if (event.button !== 2 || document.pointerLockElement !== domElement) return
    rightHeld = true
    const hit = raycaster.castFromCamera(camera, MAX_REACH_DISTANCE)
    if (hit && harvest(hit.worldX, hit.worldY, hit.worldZ)) {
      deps.itemConsumption.endPress()
      return
    }
    if (holdingHoe()) {
      till()
      sinceTill = 0
    }
  })
  window.addEventListener('mouseup', (event) => {
    if (event.button === 2) rightHeld = false
  })
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== domElement) rightHeld = false
  })

  // Holding right-click with a hoe keeps tilling whatever the crosshair moves onto
  const result = { completed: true, elapsedMs: 0, workUnits: 0 }
  deps.scheduler.registerTask({
    id: 'farming-input',
    priority: TaskPriority.CRITICAL,
    enabled: true,
    execute(deltaTime: number) {
      sinceTill += deltaTime
      if (rightHeld && sinceTill >= TILL_REPEAT && holdingHoe() && document.pointerLockElement === domElement) {
        sinceTill = 0
        till()
      }
      return result
    },
  })

  for (const id of [...FORAGE_BUSHES.map((bush) => bush.ripeId), BlockIds.BERRY_BUSH_BERRIES, BlockIds.CAVE_VINES_BERRIES]) {
    blockActionRegistry.register(id, (x, y, z) => harvest(x, y, z))
  }
}
