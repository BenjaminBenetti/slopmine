import * as THREE from 'three'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import { gameEvents } from '../events/GameEvents.ts'
import { worldClock, sunElevationAt } from '../daynight/WorldClock.ts'
import { LAYER_BOUNDARY_Y } from '../world/generate/GenerationConfig.ts'
import { BlockRegistry } from '../world/blocks/BlockRegistry.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import type { IEntity } from '../entities/interfaces/IEntity.ts'
import type { EntitySpawnConfig } from '../entities/spawning/EntitySpawnConfig.ts'
import type { EntitySpawnProvider } from '../entities/spawning/EntitySpawner.ts'
import { ThunderheadEntity } from '../entities/weather/thunderhead/index.ts'
import { DuneDervishEntity } from '../entities/weather/dune_dervish/index.ts'
import { WhiteoutStalkerEntity } from '../entities/weather/whiteout_stalker/index.ts'
import { MarshWispEntity } from '../entities/weather/marsh_wisp/index.ts'
import type { Skybox } from '../renderer/skybox/Skybox.ts'
import { createSkyWeather } from '../renderer/skybox/Skybox.ts'
import type { DistanceFog } from '../renderer/DistanceFog.ts'
import { getWorldDaylight, getWorldLightFloor } from '../renderer/worldLightShader.ts'
import { setWorldWind } from '../renderer/WindUniform.ts'
import { setTideGlow } from '../renderer/LiquidMaterials.ts'
import { ShelterMap, type ShelterColumn } from '../renderer/weather/ShelterMap.ts'
import { PrecipitationRenderer, type PrecipitationFrame } from '../renderer/weather/PrecipitationRenderer.ts'
import { LightningRenderer } from '../renderer/weather/LightningRenderer.ts'
import { AuroraCurtains } from '../renderer/weather/AuroraCurtains.ts'
import { showToast } from '../ui/Toasts.ts'
import { showPlayerNotice } from '../ui/PlayerNotice.ts'
import { BIOME_WEATHER, biomeWeatherOf, getWeatherDef, WEATHER_DEFS } from './WeatherCatalog.ts'
import { createWeatherLook, totalParticles } from './WeatherLook.ts'
import { PARTICLE_KIND_INDEX } from './ParticleKinds.ts'
import { createAir, WeatherSystems, worldTime } from './WeatherSystems.ts'
import { WeatherState, type WeatherSpell } from './WeatherState.ts'
import { WeatherSkyMap } from './WeatherSkyMap.ts'
import { LightningSystem } from './Lightning.ts'
import { WeatherHazards } from './WeatherHazards.ts'
import { DustDevils } from './DustDevils.ts'
import { weatherAtmosphere } from './WeatherAtmosphere.ts'
import { registerWeatherProvider, type WeatherSnapshot } from './WeatherHooks.ts'
import { createStormGlassHud } from './ui/StormGlassHud.ts'
import { setSkyBellPositionSource } from '../items/weather/sky_bell/SkyBellHooks.ts'

/**
 * The weather (see WeatherSystems.ts for the weather systems drifting over
 * the world and WeatherCatalog.ts for what each biome makes of them): the
 * CRITICAL 'weather' task moves the live weather at the player on every frame
 * and hands it to the sky, fog, light, wind and particles, lightning and
 * hazards; weather creatures come and go with their weather; the weathers a
 * player has seen, a rung Sky Bell's spell and the weather clock's offset
 * (sleeping moves the weather on) are saved under keyed player data `weather`.
 */

/** Keyed player data. */
const PLAYER_DATA_KEY = 'weather'

interface WeatherPlayerData {
  version: 2
  /** Weathers seen (ids). */
  seen: string[]
  spell: WeatherSpell | null
  /** Weather time ahead of world time (seconds): each night slept adds SLEEP_WEATHER_JUMP. */
  clockOffset: number
}

/**
 * A night in bed moves the weather on this much further than the hours
 * skipped (seconds of weather time): the systems overhead have long since
 * passed and others have come, so you wake to new weather.
 */
const SLEEP_WEATHER_JUMP = 2400
/** A clock jump of more than this (seconds) together with a nightfall or daybreak is a sleep (or the night button). */
const CLOCK_JUMP = 60

/** A Sky Bell's spell lasts this long (seconds of world time). */
const SPELL_SECONDS = 300
/** Weather creatures alive at once, at most. */
const WEATHER_CREATURE_CAP = 4
/** Storms on the horizon: the sky map is probed this far out for flashes in far clouds. */
const HORIZON_PROBE = 700

/** Each biome's fair weather (the first of its list): not announced, not counted as seen. */
const FAIR_WEATHERS: ReadonlySet<string> = new Set(Object.values(BIOME_WEATHER).map((b) => b.ids[0]))

export interface WeatherWorld {
  getColumnFast(cx: number, cz: number): ShelterColumn | undefined
  getBlockIdFast(x: number, y: number, z: number): number
  setBlock(x: number, y: number, z: number, id: number): void
  /** Sky light level (0-15) at a cell. */
  skyLightAt(x: number, y: number, z: number): number
}

export interface WeatherPlayer {
  readonly position: THREE.Vector3
  isDead(): boolean
  isBurning(): boolean
  extinguish(): void
  ignite(ticks: number): void
  hurt(amount: number, source: 'fire' | 'projectile' | 'magic'): void
  applyEffect(id: string, seconds: number, level: number): void
  push(x: number, z: number, dt: number): void
  heldItemId(): string | null
}

export interface WeatherSetupDeps {
  readonly scheduler: TaskScheduler
  readonly scene: THREE.Scene
  readonly seed: number
  readonly camera: THREE.Camera
  readonly player: WeatherPlayer
  readonly world: WeatherWorld
  /** Biome id at a world position on a layer (0 Hell, 1 surface). */
  biomeAt(x: number, z: number, layer: 0 | 1): string
  readonly skybox: Skybox
  readonly distanceFog: DistanceFog
  readonly persistence: {
    initialize(): Promise<unknown>
    registerPlayerDataContributor(key: string, collect: () => unknown): void
    loadPlayerData<T>(key: string): Promise<T | null>
  }
  readonly entitySpawner: { addSpawnProvider(provider: EntitySpawnProvider): void }
  readonly entityManager: { getEntitiesByType(type: string): IEntity[] }
  /** Render height in pixels (rain is drawn at least ~1.5 px wide). */
  viewportHeight(): number
}

export interface WeatherSystem {
  /** Debug: force the next weather of the biome the player stands in (then back to the real weather). */
  cycleForcedWeather(): void
  /** Debug button label. */
  debugLabel(): string
  /** Debug and tests: force a weather (any WeatherCatalog id) everywhere, or null for the real weather. */
  forceWeather(id: string | null): void
  /** Debug and tests: a lightning strike around the player now (in the weather's colour), or aimed at x/z. */
  strikeNow(x?: number, z?: number): void
  /** Debug and tests: a shooting star comes down near the player now. */
  starNow(): void
  /** Debug and tests: move the weather on (or back) by this many seconds of weather time, as sleeping does. */
  advanceWeather(seconds: number): void
}

/** Weather creatures: which weathers raise them, where. */
interface WeatherCreatureDef {
  readonly entityType: string
  readonly weathers: ReadonlySet<string>
  readonly biomes: readonly string[]
  readonly config: Omit<EntitySpawnConfig, 'entityType' | 'createEntity'>
  create(position: THREE.Vector3): IEntity
}

const WEATHER_CREATURES: readonly WeatherCreatureDef[] = [
  {
    entityType: 'thunderhead',
    weathers: new Set(['thunderstorm', 'monsoon', 'cloudburst', 'volcanic_lightning', 'hailstorm']),
    biomes: ['plains', 'grassy-hills', 'jungle', 'swamp', 'coastal-rainforest', 'desert', 'volcanic'],
    config: { spawnRate: 0.06, maxNearby: 1, searchFromSky: true, minSkyLight: 12 },
    create: (p) => new ThunderheadEntity({ position: p }),
  },
  {
    entityType: 'dune_dervish',
    weathers: new Set(['sandstorm', 'dust_devils']),
    biomes: ['desert'],
    config: { spawnRate: 0.08, maxNearby: 2, searchFromSky: true, minSkyLight: 12, validGroundBlocks: [BlockIds.SAND, BlockIds.SANDSTONE] },
    create: (p) => new DuneDervishEntity({ position: p }),
  },
  {
    entityType: 'whiteout_stalker',
    weathers: new Set(['blizzard']),
    biomes: ['pine-forest'],
    config: { spawnRate: 0.05, maxNearby: 1, searchFromSky: true, minSkyLight: 8, minY: 252 },
    create: (p) => new WhiteoutStalkerEntity({ position: p }),
  },
  {
    entityType: 'marsh_wisp',
    weathers: new Set(['glowmist', 'thick_fog']),
    biomes: ['swamp'],
    config: { spawnRate: 0.06, maxNearby: 2, searchFromSky: true, minSkyLight: 8, maxBlockLight: 7 },
    create: (p) => new MarshWispEntity({ position: p }),
  },
]
const WEATHER_CREATURE_TYPES: ReadonlySet<string> = new Set(WEATHER_CREATURES.map((c) => c.entityType))

function layerOf(y: number): 0 | 1 {
  return y < LAYER_BOUNDARY_Y ? 0 : 1
}

export function setupWeather(deps: WeatherSetupDeps): WeatherSystem {
  // The surface's weather systems, and the Hell cavern's own
  const state = new WeatherState({
    surface: new WeatherSystems(deps.seed),
    cavern: new WeatherSystems(deps.seed ^ 0x48e11),
    biomeAt: deps.biomeAt,
  })
  const skyMap = new WeatherSkyMap(state)
  const skyWeather = createSkyWeather()
  deps.skybox.setWeather(skyWeather)

  // Which blocks weather stops on, and what a strike turns a block into
  const registry = BlockRegistry.getInstance()
  const blocksWeather = new Uint8Array(1024)
  const strikeResults = new Map<number, number>()
  const hasFulgurite = registry.getAllBlockIds().includes(BlockIds.FULGURITE)
  for (const id of registry.getAllBlockIds()) {
    const props = registry.getBlock(id).properties
    if (id < blocksWeather.length && (props.isSolid || props.isOpaque || props.isLiquid || props.lightBlocking > 0 || props.submergedIn)) blocksWeather[id] = 1
    if (id !== BlockIds.CHARRED_LOG && props.name.endsWith('log') && props.tags.includes('wood')) strikeResults.set(id, BlockIds.CHARRED_LOG)
  }
  if (hasFulgurite) strikeResults.set(BlockIds.SAND, BlockIds.FULGURITE)

  const shelter = new ShelterMap({ getColumn: (cx, cz) => deps.world.getColumnFast(cx, cz) }, blocksWeather)
  const precipitation = new PrecipitationRenderer(shelter)
  precipitation.addTo(deps.scene)
  const lightningRenderer = new LightningRenderer()
  lightningRenderer.addTo(deps.scene)
  const aurora = new AuroraCurtains()
  aurora.addTo(deps.scene)
  const devils = new DustDevils()
  const stormGlassHud = createStormGlassHud()
  const player = deps.player
  // The Sky Bell rings where the player stands
  setSkyBellPositionSource(() => player.position)

  /** The cavern floor under (x, z): the first cell weather stops on scanning down from `fromY`. */
  const cavernFloorAt = (x: number, z: number, fromY: number): number | null => {
    const bx = Math.floor(x)
    const bz = Math.floor(z)
    if (!deps.world.getColumnFast(bx >> 5, bz >> 5)) return null
    for (let y = Math.floor(fromY); y > 1; y--) {
      if (blocksWeather[deps.world.getBlockIdFast(bx, y, bz)] === 1) return y + 1
    }
    return null
  }
  const lightning = new LightningSystem(lightningRenderer, {
    surfaceAt: (x, z) => {
      const bx = Math.floor(x)
      const bz = Math.floor(z)
      const column = deps.world.getColumnFast(bx >> 5, bz >> 5)
      if (!column) return null
      const floor = column.skyFloor[((bz & 31) << 5) | (bx & 31)]
      return floor >= 511 || floor <= 0 ? null : floor
    },
    cavernFloorAt,
    getBlockId: (x, y, z) => deps.world.getBlockIdFast(x, y, z),
    setBlock: (x, y, z, id) => deps.world.setBlock(x, y, z, id),
    strikeResult: (id) => strikeResults.get(id) ?? null,
    isSolid: (id) => blocksWeather[id] === 1 && !registry.getBlock(id).properties.isLiquid,
    starFragmentId: BlockIds.STAR_FRAGMENT,
  }, {
    position: player.position,
    exposed: () => isExposed(),
    hurt: (amount) => {
      player.hurt(amount, 'fire')
      player.ignite(3)
      showPlayerNotice('Struck by lightning!')
    },
  })

  const lastNotice = new Map<string, number>()
  const hazards = new WeatherHazards({
    isDead: () => player.isDead(),
    isBurning: () => player.isBurning(),
    extinguish: () => player.extinguish(),
    ignite: (ticks) => player.ignite(ticks),
    hurt: (amount, source) => player.hurt(amount, source),
    applyEffect: (id, seconds, level) => player.applyEffect(id, seconds, level),
    push: (x, z, dt) => player.push(x, z, dt),
    notice: (key, text) => {
      const now = performance.now()
      if (now - (lastNotice.get(key) ?? -Infinity) < 20000) return
      lastNotice.set(key, now)
      showPlayerNotice(text, 3000)
    },
  })

  // Seen weathers, a rung bell's spell and the weather clock, saved with the player
  const seen = new Set<string>()
  let loaded = false
  let clockOffset = 0
  let mapFilled = false
  deps.persistence
    .initialize()
    .then(() => deps.persistence.loadPlayerData<Partial<WeatherPlayerData>>(PLAYER_DATA_KEY))
    .then((data) => {
      for (const id of data?.seen ?? []) if (WEATHER_DEFS.has(id)) seen.add(id)
      const spell = data?.spell
      if (spell && (spell.mode === 'rain' || spell.mode === 'clear') && Number.isFinite(spell.until)) state.spell = spell
      if (typeof data?.clockOffset === 'number' && Number.isFinite(data.clockOffset)) {
        clockOffset = Math.max(0, data.clockOffset)
        state.snap()
        mapFilled = false
      }
      deps.persistence.registerPlayerDataContributor(PLAYER_DATA_KEY, (): WeatherPlayerData => ({
        version: 2,
        seen: [...seen],
        spell: state.spell,
        clockOffset,
      }))
      loaded = true
    })
    .catch((error) => console.warn('[weather] could not load seen weathers (not saving them this session)', error))

  const exposure = { value: 1 }
  const isExposed = (): boolean => shelter.floorAt(player.position.x, player.position.z) <= player.position.y + 1.05
  const camera = deps.camera.position
  const scratchMix = new Map<string, number>()
  const scratchAir = createAir()
  const scratchLook = createWeatherLook()
  const lightColor = new THREE.Color()
  const densities = new Float32Array(scratchLook.particles.length)
  const frame: PrecipitationFrame = {
    densities, windX: 1, windZ: 0, windStrength: 0, light: lightColor, devils: devils.positions, cavern: false, pixelSize: 0.003,
  }
  let lastWeather = ''
  // Sleep detection: a nightfall or daybreak this frame, and the clock last frame
  let clockEvent = false
  let lastClock = worldTime(worldClock.day, worldClock.time)
  gameEvents.on('nightfall', () => {
    clockEvent = true
  })
  gameEvents.on('daybreak', () => {
    clockEvent = true
  })
  let pulseClock = 0
  /** The cavern floor around the player (eased), for Hell's ground fogs. */
  let cavernFloor = 60
  let floorClock = 0

  const snapshot = (): WeatherSnapshot => ({
    layer: state.layer,
    weatherId: state.weatherId,
    weatherName: getWeatherDef(state.weatherId).name,
    look: state.look,
    exposure: exposure.value,
    windX: state.windX,
    windZ: state.windZ,
    windStrength: state.windStrength,
    wetness: state.wetness,
    rainbow: Math.max(state.look.rainbow, state.afterRainbow),
  })

  registerWeatherProvider({
    snapshot,
    weatherAt: (x, y, z) => state.dominantOf(state.mixAt(x, y, z, layerOf(y), 'none', scratchMix)),
    isRainingOn: (x, y, z) => {
      if (layerOf(y) !== 1 || deps.world.skyLightAt(x, y, z) < 15) return false
      return state.lookOf(state.mixAt(x, y, z, 1, 'none', scratchMix, scratchAir), scratchLook, scratchAir).wet >= 0.3
    },
    forecast: (seconds) => {
      const id = state.forecast(player.position.x, player.position.y, player.position.z, seconds)
      return { weatherId: id, weatherName: getWeatherDef(id).name }
    },
    ringSkyBell: (x, z) => {
      if (state.layer !== 1) return null
      // By the weather as it is named there: anything falling is cleared, fair weather brings rain
      // (each biome's own: snow in the pines, sulphur over the vents, a cloudburst in the desert)
      const here = getWeatherDef(state.dominantOf(state.mixAt(x, player.position.y, z, 1, 'none', scratchMix))).look
      const wet = here.wet >= 0.3 || totalParticles(here) > 0.1
      const mode = wet ? 'clear' : 'rain'
      state.spell = { mode, x, z, until: state.time + SPELL_SECONDS }
      mapFilled = false
      return mode
    },
  })

  // Weather creatures come with their weather (spawn position checked against the creature's weathers)
  const countWeatherCreatures = (): number => {
    let n = 0
    for (const type of WEATHER_CREATURE_TYPES) n += deps.entityManager.getEntitiesByType(type).length
    return n
  }
  const byBiome = new Map<string, WeatherCreatureDef[]>()
  for (const def of WEATHER_CREATURES) for (const biome of def.biomes) byBiome.set(biome, [...(byBiome.get(biome) ?? []), def])
  const configCache = new Map<WeatherCreatureDef, EntitySpawnConfig>()
  deps.entitySpawner.addSpawnProvider((biome, layer, position) => {
    if (layer !== 1) return undefined
    const defs = byBiome.get(biome)
    if (!defs) return undefined
    const here = state.dominantOf(state.mixAt(position.x, position.y, position.z, 1, 'none', scratchMix))
    const configs: EntitySpawnConfig[] = []
    for (const def of defs) {
      if (!def.weathers.has(here)) continue
      let config = configCache.get(def)
      if (!config) {
        config = { ...def.config, entityType: def.entityType, createEntity: def.create, condition: () => countWeatherCreatures() < WEATHER_CREATURE_CAP }
        configCache.set(def, config)
      }
      configs.push(config)
    }
    return configs.length > 0 ? configs : undefined
  })

  deps.scheduler.createTask({
    id: 'weather',
    // Critical: it drives the sky, light and particles every frame (see the 'skybox' task)
    priority: TaskPriority.CRITICAL,
    update: (dt) => {
      const clock = worldTime(worldClock.day, worldClock.time)
      // A night slept (the clock jumped through a nightfall or daybreak): the weather moves on further
      if (clockEvent && clock - lastClock > CLOCK_JUMP) {
        clockOffset += SLEEP_WEATHER_JUMP
        state.snap()
        mapFilled = false
      }
      clockEvent = false
      lastClock = clock
      const t = clock + clockOffset
      const p = player.position
      const layer = layerOf(p.y)
      const cavern = layer === 0
      const sunUp = Math.min(1, Math.max(0, sunElevationAt(worldClock.hour) * 5))
      exposure.value = shelter.openness(camera.x, camera.y, camera.z)
      state.update(dt, t, clock, p.x, p.y, p.z, layer, exposure.value, sunUp)
      const look = state.look

      // Sky (the surface's dome), the storms around it and on the horizon
      if (!cavern) {
        if (!mapFilled) {
          skyMap.fill(camera.x, camera.z)
          mapFilled = true
        } else {
          skyMap.update(camera.x, camera.z)
        }
      }
      skyWeather.skyGrey = cavern ? 0 : look.skyGrey
      skyWeather.dim = cavern ? 1 : 1 - 0.45 * look.cloudDark
      skyWeather.tint.setRGB(look.skyTint[0], look.skyTint[1], look.skyTint[2])
      skyWeather.tintAmount = look.skyTintAmount
      skyWeather.sunDim = look.sunDim
      skyWeather.rainbow = cavern ? 0 : Math.max(look.rainbow, state.afterRainbow)
      skyWeather.aurora = cavern ? 0 : look.aurora
      skyWeather.meteors = cavern ? 0 : look.meteors
      skyWeather.heatHaze = cavern ? 0 : look.heatHaze
      setTideGlow(cavern ? 0 : look.waterGlow)
      deps.skybox.setWind(state.windX, state.windZ, state.windStrength)
      setWorldWind(state.windX, state.windZ, state.windStrength)

      // Air
      deps.distanceFog.setWeatherHaze(look.haze)
      deps.distanceFog.setWeatherField(!cavern && skyMap.active ? 1 : 0)
      // In the cavern a fog's top is height above the floor around the player (floors there range from Y 30 to 70+)
      floorClock += dt
      if (cavern && look.groundFog > 0 && floorClock >= 0.5) {
        floorClock = 0
        let sum = 0
        let count = 0
        for (let dz = -12; dz <= 12; dz += 6) {
          for (let dx = -12; dx <= 12; dx += 6) {
            const f = cavernFloorAt(p.x + dx, p.z + dz, p.y + 2)
            if (f !== null) { sum += f; count++ }
          }
        }
        const target = count > 0 ? sum / count : p.y - 2
        // Snap when the fog is just starting, else drift with the floor
        cavernFloor = look.groundFog < 0.005 ? target : cavernFloor + (target - cavernFloor) * 0.3
      }
      deps.distanceFog.setGroundFog(look.groundFog, cavern ? cavernFloor + look.groundFogTop : look.groundFogTop)

      // Lightning, near and far; falling stars
      let stormNear = 0
      let stormX = 1
      let stormZ = 0
      if (!cavern) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          const d = skyMap.darknessAt(camera.x + Math.cos(a) * HORIZON_PROBE, camera.z + Math.sin(a) * HORIZON_PROBE)
          if (d > stormNear) {
            stormNear = d
            stormX = Math.cos(a)
            stormZ = Math.sin(a)
          }
        }
        stormNear = Math.min(1, Math.max(0, (stormNear - 0.7) / 0.25))
      }
      lightning.update(dt, look, cavern, worldClock.nightAmount, stormNear, stormX, stormZ)
      skyWeather.flash = cavern ? 0 : lightning.flash
      skyWeather.flashDir.copy(lightning.flashDir)

      // Light: the 'skybox' task applies these on top of biome and time of day
      pulseClock += dt
      const pulse = 1 + look.glowPulse * 0.45 * Math.sin(pulseClock * 1.9)
      weatherAtmosphere.daylight = cavern ? 1 : look.daylight
      weatherAtmosphere.sunLight = cavern ? 1 : look.sunLight
      weatherAtmosphere.lightTint.setRGB(look.lightTint[0], look.lightTint[1], look.lightTint[2])
      weatherAtmosphere.floorTint.setRGB(look.floorTint[0] * pulse, look.floorTint[1] * pulse, look.floorTint[2] * pulse)
      weatherAtmosphere.flash = lightning.flash

      // Particles: what falls, lit by the sky (or the cavern's glow)
      densities.set(look.particles)
      devils.update(dt, cavern ? 0 : look.dustDevils, p, state.windX, state.windZ, (x, z) => {
        const f = shelter.floorAt(x, z)
        return f > p.y + 30 || f < p.y - 30 ? null : f
      })
      densities[PARTICLE_KIND_INDEX.devil] = devils.positions.length > 0 ? 0.14 : 0
      const daylight = getWorldDaylight()
      const floor = getWorldLightFloor()
      lightColor.setRGB(
        Math.min(1, look.lightTint[0] * daylight * 0.85 + floor.r * 1.6 + 0.02),
        Math.min(1, look.lightTint[1] * daylight * 0.85 + floor.g * 1.6 + 0.02),
        Math.min(1, look.lightTint[2] * daylight * 0.85 + floor.b * 1.6 + 0.02),
      )
      frame.windX = state.windX
      frame.windZ = state.windZ
      frame.windStrength = state.windStrength
      frame.cavern = cavern
      const cam = deps.camera as THREE.PerspectiveCamera
      frame.pixelSize = (2 * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 100) / 2))) / Math.max(1, deps.viewportHeight())
      precipitation.update(dt, camera, frame)
      aurora.update(dt, camera, cavern ? look.aurora : 0)

      // Out in it
      hazards.update(dt, look, isExposed(), state.windX, state.windZ)
      stormGlassHud.update(player.heldItemId())

      // Announce changes, and weathers never seen before
      if (state.weatherId !== lastWeather) {
        if (lastWeather) gameEvents.emit({ type: 'weather-changed', weather: state.weatherId, previous: lastWeather, layer })
        lastWeather = state.weatherId
        if (loaded && !FAIR_WEATHERS.has(state.weatherId) && !seen.has(state.weatherId)) {
          seen.add(state.weatherId)
          const def = getWeatherDef(state.weatherId)
          showToast({ caption: 'New weather', title: def.name, body: def.flavour, accent: '#8fc8ff' })
          gameEvents.emit({ type: 'weather-seen', weather: state.weatherId, distinct: seen.size })
        }
      }
    },
  })

  return {
    cycleForcedWeather: () => {
      const p = player.position
      const layer = layerOf(p.y)
      const ids = biomeWeatherOf(deps.biomeAt(p.x, p.z, layer)).ids
      const cycle: (string | null)[] = [null, ...ids]
      const at = cycle.indexOf(state.forced)
      state.forced = cycle[(at + 1) % cycle.length]
      state.snap()
      mapFilled = false
    },
    strikeNow: (x, z) => lightning.strike(state.look, layerOf(player.position.y) === 0, x !== undefined && z !== undefined ? { x, z } : undefined),
    starNow: () => lightning.fallingStar(),
    forceWeather: (id) => {
      state.forced = id && WEATHER_DEFS.has(id) ? id : null
      state.snap()
      mapFilled = false
    },
    advanceWeather: (seconds) => {
      clockOffset = Math.max(0, clockOffset + seconds)
      state.snap()
      mapFilled = false
    },
    debugLabel: () => {
      const name = getWeatherDef(state.weatherId).name
      return state.forced ? `☁ ${getWeatherDef(state.forced).name}` : `☁ Auto: ${name}`
    },
  }
}
