import * as THREE from 'three'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import type { WorldManager } from '../world/WorldManager.ts'
import type { EntityManager } from '../entities/EntityManager.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { IPlayerState } from '../player/PlayerState.ts'
import type { PersistenceManager } from '../persistence/PersistenceManager.ts'
import type { IItem } from '../items/Item.ts'
import { getEngagedGuardians, type GuardianEntity } from '../entities/guardians/GuardianEntity.ts'
import { BossBar } from '../ui/BossBar.ts'
import { SigilCompassHud } from '../ui/SigilCompassHud.ts'
import { setDungeonServices } from './DungeonServices.ts'
import { guardianSpawners } from './GuardianSpawnerSystem.ts'
import { garrisonSpawners } from './GarrisonSpawnerSystem.ts'
import { DUNGEON_DATA_KEY, DungeonTracker } from './DungeonTracker.ts'
import { SIGIL_COMPASS_ITEM_ID, SigilCompass } from './SigilCompass.ts'
import { placeRewardChest, type RewardChestWorld } from './RewardChest.ts'

export interface DungeonSetupDeps {
  scheduler: TaskScheduler
  world: WorldManager
  entityManager: EntityManager
  playerBody: IPhysicsBody
  playerHealth: { readonly isDead: boolean }
  playerState: IPlayerState
  camera: THREE.Camera
  persistenceManager: PersistenceManager
  getSeed(): number
  isLoading(): boolean
}

export interface DungeonSystems {
  readonly bossBar: BossBar
  readonly tracker: DungeonTracker
  readonly compass: SigilCompass
}

/**
 * Wire the dungeon framework into the game (called once from main.ts):
 * dungeon services for guardians (loot spill, player state), the guardian
 * spawner system, the garrison spawner system, the boss bar, the Sigil Compass and dungeon tracking
 * (`dungeon-entered` events, cleared dungeons saved as player data).
 *
 * Tasks: 'dungeons' (CRITICAL: cheap, must not starve) activates guardian and garrison spawners; 'dungeons-hud' (CRITICAL,
 * cheap per-frame visual state like the sky) drives the boss bar, the
 * compass and the 1 Hz dungeon-entered probe, so they keep running while
 * world streaming starves NORMAL tasks.
 */
export function setupDungeons(deps: DungeonSetupDeps): DungeonSystems {
  const { scheduler, world, entityManager, playerBody, playerHealth, playerState, persistenceManager } = deps

  const spawnDrops = (items: IItem[], x: number, y: number, z: number): void => {
    world.spawnBlockDrops(BigInt(Math.floor(x)), BigInt(Math.floor(y)), BigInt(Math.floor(z)), items)
  }
  setDungeonServices({
    spawnDrops,
    isPlayerDead: () => playerHealth.isDead,
  })

  const isBlockLoaded = (x: number, y: number, z: number): boolean =>
    y >= 0 && world.getSubChunk({ x: BigInt(x >> 5), z: BigInt(z >> 5), subY: y >> 5 }) !== undefined
  const chestWorld: RewardChestWorld = {
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    setBlock: (x, y, z, blockId, metadata) => world.setBlock(x, y, z, blockId, metadata),
    getMetadata: (x, y, z) => world.getMetadata(x, y, z),
    setBlockMetadata: (x, y, z, metadata) => world.setBlockMetadata(x, y, z, metadata),
    getBlockIdFast: (x, y, z) => world.getBlockIdFast(x, y, z),
    isBlockLoaded,
  }
  guardianSpawners.attach({
    world: {
      getBlockIdFast: (x, y, z) => world.getBlockIdFast(x, y, z),
      getBlockMetadataFast: (x, y, z) => world.getBlockMetadataFast(x, y, z),
      isBlockLoaded,
      setBlock: (x, y, z, blockId, metadata) => world.setBlock(x, y, z, blockId, metadata),
    },
    addEntity: (entity) => entityManager.addEntity(entity),
    playerPosition: playerBody.position,
    isPlayerDead: () => playerHealth.isDead,
    placeRewardChest: (x, y, z, items) => placeRewardChest(chestWorld, { x, y, z }, items, playerBody.position),
    spawnDrops,
  })

  garrisonSpawners.attach({
    world: {
      getBlockIdFast: (x, y, z) => world.getBlockIdFast(x, y, z),
      getBlockMetadataFast: (x, y, z) => world.getBlockMetadataFast(x, y, z),
      isSolid: (x, y, z) => world.getBlockFast(x, y, z).properties.isSolid,
      isBlockLoaded,
    },
    addEntity: (entity) => entityManager.addEntity(entity),
    removeEntity: (id) => entityManager.removeEntity(id),
    playerPosition: playerBody.position,
    isPlayerDead: () => playerHealth.isDead,
  })

  const tracker = new DungeonTracker({
    playerPosition: playerBody.position,
    getSeed: deps.getSeed,
    isLoading: deps.isLoading,
  })
  // Load cleared dungeons first, then contribute (never save over unloaded data)
  persistenceManager
    .initialize()
    .then(async () => {
      tracker.restore(await persistenceManager.loadPlayerData(DUNGEON_DATA_KEY))
      persistenceManager.registerPlayerDataContributor(DUNGEON_DATA_KEY, () => tracker.serialize())
    })
    .catch((error) => {
      console.error('[Dungeons] loading dungeon data failed:', error)
    })

  const toolbar = playerState.inventory.toolbar
  const compass = new SigilCompass({
    camera: deps.camera,
    playerPosition: playerBody.position,
    isHoldingCompass: () =>
      !deps.isLoading() && toolbar.getItem(toolbar.selectedIndex)?.id === SIGIL_COMPASS_ITEM_ID,
    getSeed: deps.getSeed,
    tracker,
    hud: new SigilCompassHud(),
  })

  const bossBar = new BossBar()
  const offset = new THREE.Vector3()

  // CRITICAL: a handful of records per frame, and NORMAL tasks starve while
  // the world streams - exactly when a player walks into a castle
  scheduler.createTask({
    id: 'dungeons',
    priority: TaskPriority.CRITICAL,
    update: (dt) => {
      guardianSpawners.update(dt)
      garrisonSpawners.update(dt)
    },
  })

  scheduler.createTask({
    id: 'dungeons-hud',
    priority: TaskPriority.CRITICAL,
    update: (dt) => {
      // Boss bar: the nearest engaged guardian
      let nearest: GuardianEntity | null = null
      let nearestDistSq = Infinity
      for (const guardian of getEngagedGuardians()) {
        const distSq = offset.copy(guardian.position).sub(playerBody.position).lengthSq()
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq
          nearest = guardian
        }
      }
      bossBar.setTarget(nearest)
      bossBar.update(dt)

      compass.update(dt)
      tracker.update(dt)
    },
  })

  return { bossBar, tracker, compass }
}
