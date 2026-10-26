import * as THREE from 'three'
import type { TaskScheduler } from '../../core/TaskScheduler.ts'
import { TaskPriority } from '../../core/interfaces/ITask.ts'
import type { IEntity } from '../../entities/interfaces/IEntity.ts'
import type { IItem } from '../../items/Item.ts'
import type { IPhysicsBody } from '../../physics/interfaces/IPhysicsBody.ts'
import type { IBlockProperties } from '../../world/interfaces/IBlock.ts'
import { EYE_HEIGHT } from '../../physics/constants.ts'
import { hasGameplayPointer } from '../../player/PointerMode.ts'
import { playSound } from '../../audio/SoundHooks.ts'
import type { SoundId } from '../../audio/SoundLibrary.ts'
import type { BoatConfig, BoatEntity } from './BoatEntity.ts'
import { SailboatEntity } from './SailboatEntity.ts'
import { CanoeEntity } from './CanoeEntity.ts'
import { waterAmbience } from '../WaterHooks.ts'
import { gameEvents } from '../../events/GameEvents.ts'

/** Boats exist (as entities) within this many blocks of the player, and are put away beyond the second. */
const SPAWN_RANGE = 128
const PUT_AWAY_RANGE = 160
/** E boards a boat this close along the view. */
const BOARD_REACH = 4.5
/** Right-click puts the boat on water this far along the view. */
const PLACE_REACH = 5.5
/** The rider's eyes sit this far above the seat. */
const SEATED_EYE = 0.95
/** The rider moved further than this from the seat (a teleport): off the boat. */
const SEAT_SLACK = 4
const PLAYER_DATA_KEY = 'boats'

/** The kinds of boat: each is put in the water from the item of the same id, and breaks back into it. */
const BOAT_KINDS = {
  sailboat: (config: BoatConfig): BoatEntity => new SailboatEntity(config),
  canoe: (config: BoatConfig): BoatEntity => new CanoeEntity(config),
} as const
type BoatKind = keyof typeof BOAT_KINDS
const isBoatKind = (id: unknown): id is BoatKind => id === 'sailboat' || id === 'canoe'

/** v2 added `kind` (a v1 boat is a sailboat). */
interface BoatsPlayerData {
  version: 2
  boats: Array<{ kind: BoatKind; x: number; y: number; z: number; yaw: number }>
}

interface BoatRecord {
  kind: BoatKind
  x: number
  y: number
  z: number
  yaw: number
  entity: BoatEntity | null
}

export interface BoatsDeps {
  readonly scheduler: TaskScheduler
  readonly entityManager: {
    addEntity(entity: IEntity): unknown
    removeEntity(id: string): unknown
  }
  readonly world: {
    getBlockFast(x: number, y: number, z: number): { readonly properties: IBlockProperties }
    /** The column's sub-chunk at (x, y, z) is loaded (boats only come back into loaded water). */
    isLoadedAt(x: number, y: number, z: number): boolean
  }
  readonly camera: THREE.Camera
  readonly cameraControls: {
    mounted: boolean
    getMovementKeys(out: { forward: boolean; back: boolean; left: boolean; right: boolean; jump: boolean; sneak: boolean }): void
  }
  readonly playerBody: IPhysicsBody
  readonly isPlayerDead: () => boolean
  /** The held item, and taking it out of the hand once placed. */
  readonly getHeldItem: () => IItem | null
  readonly consumeHeldItem: () => void
  readonly createItem: (id: string) => IItem | null
  readonly domElement: HTMLElement
  readonly setEntityInteractHandler: (handler: () => boolean) => void
  readonly currentAt: (x: number, y: number, z: number, out: THREE.Vector3) => void
  readonly resetFall: () => void
  readonly persistence: {
    initialize(): Promise<unknown>
    registerPlayerDataContributor(key: string, collect: () => unknown): void
    loadPlayerData<T>(key: string): Promise<T | null>
  }
}

export interface BoatsSystem {
  /** The boat the player rides, if any. */
  readonly riding: BoatEntity | null
}

/**
 * Boats - sailboats and canoes: right-click water with the boat's item to put
 * one in; E boards the boat in view and E (or Shift) steps off it, onto the
 * nearest dry spot. While riding, the movement keys sail or paddle the boat
 * (SailboatEntity, CanoeEntity) and the player sits in it, free to look around.
 *
 * Every boat put in the world is remembered (keyed player data `boats`), so
 * a boat left at a jetty is there when the player comes back: within 128
 * blocks of the player a boat is an entity in loaded water, further off it's
 * only its record (the EntityManager never despawns it - `keepLoaded`).
 */
export function setupBoats(deps: BoatsDeps): BoatsSystem {
  const boats: BoatRecord[] = []
  let riding: BoatRecord | null = null
  /** Just boarded: the rider is still where they stood (no teleport check this frame). */
  let boarding = false
  let loaded = false
  const keys = { forward: false, back: false, left: false, right: false, jump: false, sneak: false }
  const ray = new THREE.Ray()
  const box = new THREE.Box3()
  const hit = new THREE.Vector3()
  const seat = new THREE.Vector3()
  const soundPos = { x: 0, y: 0, z: 0 }

  const spawnBoat = (record: BoatRecord): void => {
    const entity = BOAT_KINDS[record.kind]({
      position: new THREE.Vector3(record.x, record.y, record.z),
      yaw: record.yaw,
      createItem: () => deps.createItem(record.kind),
    })
    entity.setCurrentQuery(deps.currentAt)
    deps.entityManager.addEntity(entity)
    record.entity = entity
  }

  const seatOf = (boat: BoatEntity, out: THREE.Vector3): THREE.Vector3 =>
    out.set(boat.position.x + Math.sin(boat.yaw) * boat.seatForward, boat.position.y + boat.seatUp, boat.position.z + Math.cos(boat.yaw) * boat.seatForward)

  const play = (id: SoundId, at: THREE.Vector3, volume = 1): void => {
    soundPos.x = at.x
    soundPos.y = at.y
    soundPos.z = at.z
    playSound(id, soundPos, { volume })
  }

  // --- Boarding and leaving ---

  const board = (record: BoatRecord): void => {
    const boat = record.entity
    if (!boat) return
    riding = record
    boarding = true
    boat.ridden = true
    deps.cameraControls.mounted = true
    deps.playerBody.skipPhysics = true
    deps.playerBody.velocity.set(0, 0, 0)
    play('block.wood.place', boat.position, 0.7)
    gameEvents.emit({ type: 'boat-boarded', kind: record.kind, x: boat.position.x, y: boat.position.y, z: boat.position.z })
  }

  const isOpen = (x: number, y: number, z: number): boolean => {
    const props = deps.world.getBlockFast(x, y, z).properties
    return !props.isSolid
  }
  const isGround = (x: number, y: number, z: number): boolean => {
    const props = deps.world.getBlockFast(x, y, z).properties
    return props.isSolid === true
  }

  /** Step off: onto dry land beside the boat if there is any, else into the water next to it. */
  const leave = (moveOff: boolean): void => {
    const record = riding
    riding = null
    deps.cameraControls.mounted = false
    deps.playerBody.skipPhysics = false
    deps.playerBody.velocity.set(0, 0, 0)
    deps.resetFall()
    const boat = record?.entity
    if (!boat) return
    boat.ridden = false
    for (const input of ['forward', 'back', 'left', 'right'] as const) boat.input[input] = false
    if (!moveOff) return
    const sx = Math.cos(boat.yaw)
    const sz = -Math.sin(boat.yaw)
    const fx = Math.sin(boat.yaw)
    const fz = Math.cos(boat.yaw)
    const offsets: Array<[number, number]> = [[0, 1.4], [0, -1.4], [2.4, 0], [-2.2, 0], [1.2, 1.6], [1.2, -1.6], [-1.2, 1.6], [-1.2, -1.6], [0, 2.6], [0, -2.6]]
    let fallback: THREE.Vector3 | null = null
    for (const [f, s] of offsets) {
      const x = Math.floor(boat.position.x + fx * f + sx * s)
      const z = Math.floor(boat.position.z + fz * f + sz * s)
      for (let y = Math.floor(boat.position.y) + 2; y >= Math.floor(boat.position.y) - 1; y--) {
        if (!isOpen(x, y, z) || !isOpen(x, y + 1, z)) continue
        if (isGround(x, y - 1, z)) {
          deps.playerBody.position.set(x + 0.5, y, z + 0.5)
          play('block.wood.step', boat.position, 0.6)
          return
        }
        fallback ??= new THREE.Vector3(x + 0.5, y, z + 0.5)
      }
    }
    if (fallback) deps.playerBody.position.copy(fallback)
    play('player.splash.small', boat.position, 0.5)
  }

  /** The boat along the view within reach (its hitbox), if any. */
  const boatInView = (): BoatRecord | null => {
    deps.camera.getWorldPosition(ray.origin)
    deps.camera.getWorldDirection(ray.direction)
    let best: BoatRecord | null = null
    let bestDistance = BOARD_REACH
    for (const record of boats) {
      const boat = record.entity
      if (!boat || boat.isDestroyed) continue
      box.min.set(boat.position.x - 1.2, boat.position.y - 0.4, boat.position.z - 1.2)
      box.max.set(boat.position.x + 1.2, boat.position.y + 1.2, boat.position.z + 1.2)
      if (!ray.intersectBox(box, hit)) continue
      const distance = hit.distanceTo(ray.origin)
      if (distance < bestDistance) {
        bestDistance = distance
        best = record
      }
    }
    return best
  }

  // Shift steps off (on the key itself: a quick tap may fall between two frames)
  window.addEventListener('keydown', (event) => {
    if (!riding || event.repeat || (event.code !== 'ShiftLeft' && event.code !== 'ShiftRight')) return
    if (!hasGameplayPointer()) return
    leave(true)
  })

  deps.setEntityInteractHandler(() => {
    if (riding) {
      leave(true)
      return true
    }
    const record = boatInView()
    if (!record) return false
    board(record)
    return true
  })

  // --- Putting a boat in the water ---

  const waterFill = (x: number, y: number, z: number): number => {
    const props = deps.world.getBlockFast(x, y, z).properties
    if (props.isLiquid) return props.liquidFamily === 'lava' ? 0 : props.isFallingLiquid ? 1 : (props.liquidLevel ?? 8) / 8
    return props.submergedIn !== undefined ? 1 : 0
  }

  /** Where the view meets a water surface (before anything solid), or null. */
  const waterInView = (): THREE.Vector3 | null => {
    deps.camera.getWorldPosition(ray.origin)
    deps.camera.getWorldDirection(ray.direction)
    const p = new THREE.Vector3()
    for (let t = 0.3; t <= PLACE_REACH; t += 0.05) {
      p.copy(ray.direction).multiplyScalar(t).add(ray.origin)
      const x = Math.floor(p.x)
      const y = Math.floor(p.y)
      const z = Math.floor(p.z)
      const props = deps.world.getBlockFast(x, y, z).properties
      if (props.isSolid) return null
      const fill = waterFill(x, y, z)
      if (fill > 0 && p.y <= y + fill) {
        let top = y
        while (waterFill(x, top + 1, z) > 0 && top < y + 8) top++
        return new THREE.Vector3(p.x, top + waterFill(x, top, z), p.z)
      }
    }
    return null
  }

  deps.domElement.addEventListener('mousedown', (event: MouseEvent) => {
    if (event.button !== 2 || !hasGameplayPointer() || riding || deps.isPlayerDead()) return
    const kind = deps.getHeldItem()?.id
    if (!isBoatKind(kind) || !loaded) return
    const at = waterInView()
    if (!at) return
    // Bow away from the player
    const yaw = Math.atan2(at.x - deps.playerBody.position.x, at.z - deps.playerBody.position.z)
    const record: BoatRecord = { kind, x: at.x, y: at.y - 0.25, z: at.z, yaw, entity: null }
    boats.push(record)
    spawnBoat(record)
    deps.consumeHeldItem()
    play('player.splash.small', at, 0.8)
  })

  // --- Every frame: the ridden boat and the rider, boats in and out of range ---

  const result = { completed: true, elapsedMs: 0, workUnits: 0 }
  deps.scheduler.registerTask({
    id: 'boats',
    priority: TaskPriority.CRITICAL,
    enabled: true,
    execute(deltaTime: number) {
      // The ridden boat: the keys sail it, the rider sits in it
      if (riding) {
        const boat = riding.entity
        if (!boat || boat.isDestroyed || deps.isPlayerDead()) {
          leave(false)
        } else if (!boarding && deps.playerBody.position.distanceTo(seatOf(boat, seat).setY(seat.y + SEATED_EYE - EYE_HEIGHT)) > SEAT_SLACK) {
          // Moved away from the seat by something else (a teleport): off the boat, where it put the player
          leave(false)
        } else {
          boarding = false
          deps.cameraControls.getMovementKeys(keys)
          {
            boat.input.forward = keys.forward
            boat.input.back = keys.back
            boat.input.left = keys.left
            boat.input.right = keys.right
            boat.step(deltaTime)
            seatOf(boat, seat)
            deps.playerBody.position.set(seat.x, seat.y + SEATED_EYE - EYE_HEIGHT, seat.z)
            deps.playerBody.velocity.set(0, 0, 0)
            deps.camera.position.set(seat.x, seat.y + SEATED_EYE, seat.z)
          }
        }
      }

      // The hull laps under the rider, more with speed
      waterAmbience.boat = riding?.entity ? 0.45 + Math.min(0.55, Math.abs(riding.entity.speed) * 0.08) : 0

      // Boats come into the world near the player and go back into their records away from it
      const p = deps.playerBody.position
      for (let i = boats.length - 1; i >= 0; i--) {
        const record = boats[i]
        const boat = record.entity
        if (boat) {
          if (boat.isDestroyed || !boat.isAlive) {
            // Broken (its item went to the player): gone for good
            if (riding === record) leave(false)
            boats.splice(i, 1)
            continue
          }
          record.x = boat.position.x
          record.y = boat.position.y
          record.z = boat.position.z
          record.yaw = boat.yaw
        }
        const distance = Math.hypot(record.x - p.x, record.z - p.z)
        if (boat && riding !== record && distance > PUT_AWAY_RANGE) {
          deps.entityManager.removeEntity(boat.id)
          record.entity = null
        } else if (!boat && loaded && distance < SPAWN_RANGE && deps.world.isLoadedAt(record.x, record.y, record.z)) {
          spawnBoat(record)
        }
      }
      return result
    },
  })

  // Boats are remembered with the player
  deps.persistence
    .initialize()
    .then(() => deps.persistence.loadPlayerData<Partial<BoatsPlayerData>>(PLAYER_DATA_KEY))
    .then((data) => {
      for (const b of data?.boats ?? []) {
        if ([b.x, b.y, b.z, b.yaw].every((v) => typeof v === 'number' && Number.isFinite(v))) {
          boats.push({ kind: isBoatKind(b.kind) ? b.kind : 'sailboat', x: b.x, y: b.y, z: b.z, yaw: b.yaw, entity: null })
        }
      }
      deps.persistence.registerPlayerDataContributor(PLAYER_DATA_KEY, (): BoatsPlayerData => ({
        version: 2,
        boats: boats.map((b) => ({ kind: b.kind, x: b.x, y: b.y, z: b.z, yaw: b.yaw })),
      }))
      loaded = true
    })
    .catch((error) => console.warn('[boats] could not load the boats (not saving them this session)', error))

  return {
    get riding() {
      return riding?.entity ?? null
    },
  }
}
