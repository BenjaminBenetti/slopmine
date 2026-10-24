import type * as THREE from 'three'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import type { PersistenceManager } from '../persistence/PersistenceManager.ts'
import type { PlayerState } from '../player/PlayerState.ts'
import type { EntitySpawner } from '../entities/spawning/EntitySpawner.ts'
import type { EntitySpawnConfig } from '../entities/spawning/EntitySpawnConfig.ts'
import { CaveSpiderEntity } from '../entities/cave/cave_spider/index.ts'
import { CaveDrakeEntity, CAVE_DRAKE_ID, CAVE_DRAKE_INDEX } from '../entities/guardians/cave_drake/CaveDrakeEntity.ts'
import { registerGuardian } from '../dungeons/GuardianRegistry.ts'
import { gameEvents } from '../events/GameEvents.ts'
import { showToast } from '../ui/Toasts.ts'
import { playSound } from '../audio/SoundHooks.ts'
import { HudOrder } from '../ui/hudLayout.ts'
import { SigilCompassHud, type CompassHudTheme } from '../ui/SigilCompassHud.ts'
import { POI_BUILD_DEFS } from '../world/generate/caves/pois/kinds/index.ts'
import { poiRegistry, type LoadedPoi } from './PoiRegistry.ts'
import { PoiDiscoveries, POI_DATA_KEY } from './PoiDiscoveries.ts'
import { registerPoiLoot } from './PoiLoot.ts'
import { DelversCompass, DELVERS_COMPASS_ITEM_ID } from './DelversCompass.ts'

export interface PointsOfInterestDeps {
  readonly scheduler: TaskScheduler
  readonly persistenceManager: PersistenceManager
  readonly playerState: PlayerState
  /** The player's feet (live reference). */
  readonly playerPosition: THREE.Vector3
  readonly camera: THREE.Camera
  readonly entitySpawner: EntitySpawner
  isLoading(): boolean
  isPlayerDead(): boolean
}

/** The Delver's Compass plaque: brass, with a rune-teal needle. */
const DELVERS_THEME: CompassHudTheme = {
  plaque: 'rgba(10, 18, 20, 0.62)',
  plaqueBorder: 'rgba(120, 210, 200, 0.4)',
  dialBorder: '#b8913a',
  dialFace: 'radial-gradient(circle at 50% 45%, #1e2e32 0%, #0f181b 70%, #0a1012 100%)',
  dialInset: '#4a3a1a',
  glow: 'rgba(95, 230, 212, 0.45)',
  ring: 'rgba(95, 230, 212, 0.35)',
  needle: 'linear-gradient(to bottom, #d8fff8 0%, #5fe6d4 40%, #1f7a70 50%, #4a3a30 52%, #7a6a58 100%)',
  hub: '#d9b25a',
  detail: '#9fd8cf',
}

/** Toast accent of a discovery. */
const DISCOVERY_ACCENT = '#5fe6d4'

/** Spider queens' nests are full of spiders. */
const NEST_SPIDERS: readonly EntitySpawnConfig[] = [{
  entityType: 'cave_spider', spawnRate: 0.3, maxNearby: 5, minY: 147, maxY: 240, maxLightLevel: 9,
  createEntity: (pos: THREE.Vector3) => new CaveSpiderEntity({ position: pos }),
}]

/** How close (blocks) the player must come to discover a point of interest, horizontally and vertically. */
function discoveryReach(poi: LoadedPoi): { horizontal: number; vertical: number } {
  const def = POI_BUILD_DEFS.get(poi.kind.id)
  const radius = def?.radius ?? 8
  return { horizontal: Math.max(6, radius * 0.8), vertical: Math.max(5, (def?.above ?? 6) * 0.7) }
}

/**
 * Underground points of interest, runtime side (the generator builds them:
 * world/generate/caves/pois/):
 * - discovery: the CRITICAL 'points-of-interest' task notices the player
 *   arriving at a loaded point of interest they haven't found before - a
 *   toast, a chime, `poi-discovered` (journal: Lost and Found) - and
 *   remembers it (keyed player data `pois`)
 * - the Delver's Compass (needle to the nearest undiscovered one)
 * - the 'cave-poi' chest loot table (contents by kind)
 * - spiders around spider queens' nests
 * - the Cave Drake, guardian of the dragon's lairs (its altar is on the hoard)
 */
export function setupPointsOfInterest(deps: PointsOfInterestDeps): PoiDiscoveries {
  registerPoiLoot()
  registerGuardian({
    id: CAVE_DRAKE_ID,
    index: CAVE_DRAKE_INDEX,
    displayName: 'The Cave Drake',
    // Wakes as the player walks into the lair (the altar is on the hoard, ~7 blocks in)
    activationRadius: 12,
    activationHeight: 9,
    create: (position: THREE.Vector3) => new CaveDrakeEntity(position),
  })
  const discoveries = new PoiDiscoveries()
  let loaded = false
  deps.persistenceManager
    .initialize()
    .then(async () => {
      discoveries.restore(await deps.persistenceManager.loadPlayerData(POI_DATA_KEY))
      loaded = true
      deps.persistenceManager.registerPlayerDataContributor(POI_DATA_KEY, () => discoveries.serialize())
    })
    .catch((error) => console.error('[POI] loading discoveries failed:', error))

  deps.entitySpawner.addSpawnProvider((_biome, layer, position) => {
    if (layer !== 1) return undefined
    for (const poi of poiRegistry.all()) {
      if (poi.kind.id !== 'spider_nest') continue
      if (Math.abs(poi.x - position.x) <= 24 && Math.abs(poi.z - position.z) <= 24 && Math.abs(poi.y - position.y) <= 16) return NEST_SPIDERS
    }
    return undefined
  })

  const toolbar = deps.playerState.inventory.toolbar
  const compass = new DelversCompass({
    camera: deps.camera,
    playerPosition: deps.playerPosition,
    isHoldingCompass: () => !deps.isLoading() && toolbar.getItem(toolbar.selectedIndex)?.id === DELVERS_COMPASS_ITEM_ID,
    discoveries,
    hud: new SigilCompassHud(document.body, DELVERS_THEME, HudOrder.DELVERS_COMPASS),
  })

  const discover = (poi: LoadedPoi): void => {
    if (!discoveries.discover(poi)) return
    gameEvents.emit({ type: 'poi-discovered', poi: poi.kind.id, x: poi.x, y: poi.y, z: poi.z, distinctKinds: discoveries.kindCount })
    showToast({ caption: 'Discovered', title: poi.kind.name, body: poi.kind.flavor, accent: DISCOVERY_ACCENT, durationMs: 6000 })
    playSound('ui.discover')
    // Save the discovery soon rather than at the next autosave
    deps.persistenceManager.savePlayerData(POI_DATA_KEY, discoveries.serialize()).catch(() => {})
  }

  let timer = 0
  deps.scheduler.createTask({
    id: 'points-of-interest',
    priority: TaskPriority.CRITICAL,
    update: (dt) => {
      compass.update(dt)
      timer += dt
      if (timer < 0.5) return
      timer = 0
      if (!loaded || deps.isLoading() || deps.isPlayerDead()) return
      const p = deps.playerPosition
      for (const poi of poiRegistry.all()) {
        if (discoveries.isDiscovered(poi)) continue
        const reach = discoveryReach(poi)
        const dx = p.x - (poi.x + 0.5)
        const dz = p.z - (poi.z + 0.5)
        if (dx * dx + dz * dz > reach.horizontal * reach.horizontal) continue
        if (Math.abs(p.y - (poi.y + 2)) > reach.vertical) continue
        discover(poi)
      }
    },
  })
  return discoveries
}
