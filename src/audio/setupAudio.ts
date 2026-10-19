/**
 * The audio system: procedural sound effects, ambience and generative music.
 * Everything is synthesized at startup/first use in a worker (src/audio/synth)
 * - there are no audio asset files.
 *
 * Game code makes sounds two ways: gameplay events on `gameEvents` (block
 * mined/placed, hits, pickups, crafts, effects, dungeon and guardian moments)
 * and the SoundHooks module for feedback only audio cares about. This module
 * wires both, and runs the CRITICAL 'audio' task: listener position,
 * footsteps and other player-derived sounds, ambience, music and creature
 * idle calls.
 */

import * as THREE from 'three'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import { gameEvents } from '../events/GameEvents.ts'
import type { EntityManager } from '../entities/EntityManager.ts'
import { getEngagedGuardians } from '../entities/guardians/GuardianEntity.ts'
import { findNearestDungeon } from '../dungeons/DungeonLocator.ts'
import { BlockRegistry } from '../world/blocks/BlockRegistry.ts'
import { AmbienceController } from './AmbienceController.ts'
import { AudioEngine } from './AudioEngine.ts'
import type { AudioSettings } from './AudioSettings.ts'
import { AudioSynthClient, RenderPriority } from './AudioSynthClient.ts'
import { getBlockSoundMaterial } from './BlockSoundMaterials.ts'
import { getEntityVoice } from './EntityVoices.ts'
import { MusicDirector, type MusicContext } from './music/MusicDirector.ts'
import { PlayerSoundTracker, type PlayerSoundSources } from './PlayerSoundTracker.ts'
import { SoundBank } from './SoundBank.ts'
import { setSoundSink, type SoundPosition, type SoundSink } from './SoundHooks.ts'
import { getDeferredSoundIds, getPreloadSoundIds, getSoundDef, getVoiceSoundIds, type SoundId } from './SoundLibrary.ts'
import { worldClock } from '../daynight/WorldClock.ts'

export interface AudioDeps {
  scheduler: TaskScheduler
  settings: AudioSettings
  camera: THREE.Camera
  player: PlayerSoundSources
  /** Sky light (0-15) at a world position. */
  getSkyLight(x: number, y: number, z: number): number
  entityManager: EntityManager
  /** True while the post-lava burn or lava itself is hurting the player. */
  isBurning(): boolean
  getSeed(): number
  isLoading(): boolean
}

const BUFF_EFFECTS = new Set(['fire_resistance', 'slow_falling', 'regeneration', 'ember_sight', 'strength', 'resistance'])
const DEBUFF_EFFECTS = new Set(['poison', 'slowness', 'rootbound'])
/** A castle counts as "entered" within this many blocks of its anchor (its grid reaches ~50). */
const DUNGEON_MUSIC_RADIUS = 56
const BOSS_MUSIC_RADIUS = 48
const IDLE_RADIUS = 24
/** Seconds between any two creature idle calls. */
const IDLE_SPACING = 2.5
const LAYER_BOUNDARY_Y = 128

export function setupAudio(deps: AudioDeps): void {
  const engine = AudioEngine.create(deps.settings)
  if (!engine) {
    console.warn('[Audio] Web Audio unavailable - the game runs silent')
    return
  }
  const client = new AudioSynthClient()
  const bank = new SoundBank(engine, client)
  const music = new MusicDirector(engine, bank)
  const ambience = new AmbienceController(engine, bank)
  const tracker = new PlayerSoundTracker(bank, deps.player)

  // Rooms: a short cavern reverb for effects, a long hall for music. A
  // convolver needs its impulse at the context's own sample rate.
  const rate = engine.context.sampleRate
  Promise.all([client.renderImpulse(1.8, 4500, 11, rate), client.renderImpulse(3.8, 6000, 23, rate)])
    .then(([room, hall]) => engine.setImpulseResponses(bank.toBuffer(room.channels, rate), bank.toBuffer(hall.channels, rate)))
    .catch((error) => console.warn('[Audio] reverb impulse failed:', error))
  void bank.preload(getPreloadSoundIds(), RenderPriority.NORMAL).then(() => bank.preload(getDeferredSoundIds()))

  const voicesLoaded = new Set<string>()
  const preloadVoice = (entityType: string): void => {
    const voice = getEntityVoice(entityType)
    if (!voice || voicesLoaded.has(voice.archetype)) return
    voicesLoaded.add(voice.archetype)
    void bank.preload(getVoiceSoundIds(voice.archetype))
  }
  deps.entityManager.addCallback({ onEntityAdded: (entity) => preloadVoice(entity.type) })

  const sink: SoundSink = {
    play: (id, position, options) => bank.play(id, position, options),
    playBlock: (blockId, action, position, options) => {
      const material = getBlockSoundMaterial(blockId)
      if (material) bank.play(`block.${material}.${action}`, position, options)
    },
    playEntity: (entityType, kind, position, options) => {
      const voice = getEntityVoice(entityType)
      if (!voice) return
      const id = `voice.${voice.archetype}.${kind}`
      if (!getSoundDef(id)) return
      bank.play(id, position, { volume: (options?.volume ?? 1) * (voice.boss ? 1.4 : 1), pitch: voice.pitch * (options?.pitch ?? 1) })
    },
    blockUi: (blockId, opened, position) => {
      const name = BlockRegistry.getInstance().getBlock(blockId).properties.name
      const sound = blockUiSound(name, opened)
      bank.play(sound.id, sound.positional ? position : null, { pitch: sound.pitch })
    },
  }
  setSoundSink(sink)

  // --- gameplay events -----------------------------------------------------

  const center = (e: { x: number; y: number; z: number }): SoundPosition => ({ x: e.x + 0.5, y: e.y + 0.5, z: e.z + 0.5 })
  gameEvents.on('block-mined', (e) => sink.playBlock(e.blockId, 'break', center(e)))
  gameEvents.on('block-placed', (e) => sink.playBlock(e.blockId, 'place', center(e)))
  gameEvents.on('item-picked-up', () => bank.play('item.pickup', null))
  gameEvents.on('item-crafted', (e) => {
    const at = e.x !== undefined && e.y !== undefined && e.z !== undefined ? center({ x: e.x, y: e.y, z: e.z }) : null
    const id: SoundId = { hand: 'ui.craft', woodworking: 'woodwork.craft', hellforge: 'hellforge.craft', forge: 'forge.done', apothecary: 'brew.craft' }[
      e.station
    ] as SoundId
    // World stations (forge, apothecary) finish on their own: only heard nearby.
    if ((e.station === 'forge' || e.station === 'apothecary') && !at) return
    bank.play(id, e.station === 'forge' || e.station === 'apothecary' ? at : null)
  })
  gameEvents.on('item-consumed', (e) => {
    tracker.markConsumed()
    if (e.itemId === 'return_idol') bank.play('idol.teleport', null)
    else if (e.itemId === 'infernal_heart') bank.play('item.heart', null)
  })
  gameEvents.on('entity-hit', (e) => {
    const at = { x: e.x, y: e.y + 0.8, z: e.z }
    const voice = getEntityVoice(e.entityType)
    // The impact sounds like what was struck; a charged blow lands heavier
    const material = e.blocked ? (voice?.shield ?? 'shield') : (voice?.hit ?? 'flesh')
    const strong = e.charge >= 0.9
    bank.play('player.swing', null)
    bank.play(`hit.${material}`, at, { volume: strong ? 1.3 : 1, pitch: strong ? 0.92 : 1 })
    if (e.killed) sink.playEntity(e.entityType, 'death', at)
    else if (!e.blocked) sink.playEntity(e.entityType, 'hurt', at)
  })
  gameEvents.on('player-hurt', (e) => {
    if (!e.environmental) {
      bank.play('player.hurt', null)
    } else {
      bank.play('player.hurt.soft', null)
      if (deps.isBurning()) bank.play('player.sizzle', null)
    }
  })
  gameEvents.on('player-died', () => {
    bank.play('player.death', null)
    music.silence(3, 25)
  })
  gameEvents.on('effect-applied', (e) => {
    if (BUFF_EFFECTS.has(e.effectId)) bank.play('magic.buff', null)
    else if (DEBUFF_EFFECTS.has(e.effectId)) bank.play('magic.debuff', null)
  })
  gameEvents.on('dungeon-entered', () => bank.play('dungeon.enter', null))
  gameEvents.on('guardian-defeated', () => bank.play('boss.defeat', null))

  let biome = 'plains'
  let layer: 0 | 1 = 1
  gameEvents.on('biome-entered', (e) => {
    biome = e.biome
    layer = e.layer
  })

  // --- per-frame task ---------------------------------------------------------

  const forward = new THREE.Vector3()
  const listenerPos = new THREE.Vector3()
  const idleNext = new Map<string, number>()
  let envTimer = 0
  let musicTimer = 0
  let dungeonTimer = 0
  let idleTimer = 0
  let lastIdleAt = -Infinity
  let inDungeon = false
  let clock = 0

  const isBossEngaged = (): boolean => {
    const p = deps.player.body.position
    for (const guardian of getEngagedGuardians()) {
      const dx = guardian.position.x - p.x
      const dz = guardian.position.z - p.z
      if (dx * dx + dz * dz < BOSS_MUSIC_RADIUS * BOSS_MUSIC_RADIUS) return true
    }
    return false
  }

  const updateIdleCalls = (): void => {
    const now = clock
    const candidates = deps.entityManager.getEntitiesNear(listenerPos, IDLE_RADIUS)
    for (const guardian of getEngagedGuardians()) candidates.push(guardian)
    for (const entity of candidates) {
      if (!entity.isAlive || entity.isDying || entity.isQuiet) continue
      const voice = getEntityVoice(entity.type)
      if (!voice || voice.idleEvery <= 0) continue
      if (voice.boss && !getEngagedGuardians().has(entity as never)) continue
      const next = idleNext.get(entity.id)
      if (next === undefined) {
        idleNext.set(entity.id, now + voice.idleEvery * (0.3 + Math.random()))
        continue
      }
      if (now < next) continue
      idleNext.set(entity.id, now + voice.idleEvery * (0.6 + Math.random() * 0.8))
      // One creature call at a time, and not too often: a herd stays a backdrop
      if (now - lastIdleAt < IDLE_SPACING) continue
      lastIdleAt = now
      sink.playEntity(entity.type, 'idle', { x: entity.position.x, y: entity.position.y + 1, z: entity.position.z })
    }
    if (idleNext.size > 200) idleNext.clear()
  }

  deps.scheduler.createTask({
    id: 'audio',
    priority: TaskPriority.CRITICAL,
    update: (dt) => {
      clock += dt
      const camera = deps.camera
      camera.getWorldPosition(listenerPos)
      camera.getWorldDirection(forward)
      bank.setListener(listenerPos, forward)
      if (deps.isLoading()) return

      tracker.update(dt)

      envTimer += dt
      if (envTimer >= 0.25) {
        const envDt = envTimer
        envTimer = 0
        const submergedIn = liquidAt(deps.player, listenerPos.x, listenerPos.y, listenerPos.z)
        const outdoors = layer === 0 ? 0 : deps.getSkyLight(listenerPos.x, listenerPos.y, listenerPos.z) / 15
        engine.setMuffled(submergedIn === 'lava' ? 0.75 : submergedIn ? 1 : 0)
        engine.setEnvironmentReverb(submergedIn ? 0.15 : layer === 0 ? (inDungeon ? 0.42 : 0.32) : 0.05 + 0.27 * (1 - outdoors))
        ambience.update({ layer, biome, outdoors, cameraY: listenerPos.y, submergedIn, night: layer === 1 ? worldClock.nightAmount : 0 }, envDt)
      }

      dungeonTimer -= dt
      if (dungeonTimer <= 0) {
        dungeonTimer = 1
        const p = deps.player.body.position
        inDungeon = p.y < LAYER_BOUNDARY_Y && findNearestDungeon(p.x, p.z, deps.getSeed(), DUNGEON_MUSIC_RADIUS) !== null
      }

      musicTimer -= dt
      if (musicTimer <= 0) {
        musicTimer = 0.5
        const ctx: MusicContext = {
          active: !deps.player.isDead(),
          layer,
          biome,
          underground: layer === 1 && deps.getSkyLight(listenerPos.x, listenerPos.y, listenerPos.z) < 4 && listenerPos.y < 236,
          inDungeon,
          bossEngaged: isBossEngaged(),
          night: worldClock.nightAmount > 0.5,
        }
        music.update(ctx)
      }

      idleTimer -= dt
      if (idleTimer <= 0) {
        idleTimer = 0.5
        updateIdleCalls()
      }
    },
  })
}

function liquidAt(player: PlayerSoundSources, x: number, y: number, z: number): string | null {
  const id = player.getBlockId(x, y, z)
  if (id === 0) return null
  const props = BlockRegistry.getInstance().getBlock(id).properties
  return props.isLiquid ? (props.liquidFamily ?? 'water') : props.submergedIn ?? null
}

/** What opening/closing a block's UI sounds like. */
function blockUiSound(name: string, opened: boolean): { id: SoundId; positional: boolean; pitch?: number } {
  if (name === 'chest') return { id: opened ? 'chest.open' : 'chest.close', positional: true }
  if (!opened) return { id: 'ui.close', positional: false }
  if (name === 'forge') return { id: 'forge.open', positional: true }
  if (name === 'hellforge') return { id: 'forge.open', positional: true, pitch: 0.75 }
  if (name === 'apothecary_workbench') return { id: 'brew.open', positional: true }
  return { id: 'ui.open', positional: false }
}
