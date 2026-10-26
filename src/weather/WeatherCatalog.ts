import { SNOW_LINE_Y } from '../world/generate/biomes/pineForestConstants.ts'
import { resolveLook, type WeatherLook, type WeatherLookSpec } from './WeatherLook.ts'
import type { WeatherAir } from './WeatherSystems.ts'

/**
 * Every weather in the game and which biomes have it. Each surface biome has
 * six to nine (most its own), each Hell biome a calm and four cavern weathers.
 *
 * Ids are persisted (journal, seen weathers) and matched by milestones and
 * weather creatures: never rename one.
 *
 * Weather itself is made by weather systems drifting over the world
 * (WeatherSystems: cloud, rain, storm, wind and fog); each biome reads that
 * air through its own rules (BIOME_WEATHER), so one rain belt is a rain
 * shower on the plains, snowfall up in the pines and a cloudburst over the
 * desert, and one wind storm a gale on the hills and a sandstorm in the dunes.
 */

export type WeatherTime = 'day' | 'night'

export interface WeatherDef {
  readonly id: string
  readonly name: string
  /** One line for the Storm Glass and the first time you see it. */
  readonly flavour: string
  /** Only by day or only at night (the biome's rules see to it; for reference). */
  readonly time?: WeatherTime
  /** Below the pine forest's snow line this weather falls as another (snow → rain). */
  readonly belowSnowLine?: string
  readonly look: WeatherLook
}

interface WeatherDefSpec extends Omit<WeatherDef, 'look'> {
  readonly look: WeatherLookSpec
}

/** Sea level is 240; valley fog fills the land below about here. */
const VALLEY_FOG_TOP = 256

const DEF_SPECS: readonly WeatherDefSpec[] = [
  // Shared and temperate
  { id: 'clear', name: 'Clear', flavour: 'Fair weather.', look: {} },
  {
    id: 'overcast', name: 'Overcast', flavour: 'A grey lid over the world.',
    look: { cloud: 0.95, cloudDark: 0.3, skyGrey: 0.75, sunDim: 0.9, daylight: 0.82, sunLight: 0.4, hazeDistance: 900, wind: 0.3 },
  },
  {
    id: 'rain_shower', name: 'Rain Shower', flavour: 'Good for the crops.',
    look: {
      cloud: 1, cloudDark: 0.45, skyGrey: 0.85, skyTint: [0.85, 0.9, 0.98], skyTintAmount: 0.25, sunDim: 1, daylight: 0.68,
      sunLight: 0.25, hazeDistance: 320, particles: { rain: 0.55 }, wind: 0.4, wet: 1,
    },
  },
  {
    id: 'thunderstorm', name: 'Thunderstorm', flavour: 'Stay off the hilltops.',
    look: {
      cloud: 1, cloudDark: 0.85, skyGrey: 0.85, skyTint: [0.78, 0.84, 0.95], skyTintAmount: 0.35, sunDim: 1, daylight: 0.48,
      sunLight: 0.12, lightTint: [0.88, 0.92, 1.0], hazeDistance: 180, particles: { rain: 0.95, debris: 0.04 }, wind: 0.75, lightning: 6, wet: 1,
    },
  },
  {
    id: 'drizzle', name: 'Drizzle', flavour: 'Fine, soaking, endless.',
    look: {
      cloud: 0.95, cloudDark: 0.25, skyGrey: 0.8, sunDim: 0.95, daylight: 0.78, sunLight: 0.35, hazeDistance: 420,
      particles: { drizzle: 0.75 }, wind: 0.25, wet: 0.7,
    },
  },

  // Plains
  {
    id: 'seedfall', name: 'Seedfall', time: 'day', flavour: 'Dandelion fluff rides the warm wind.',
    look: { cloud: 0.1, particles: { fluff: 0.32 }, wind: 0.35, lightTint: [1.03, 1.0, 0.94], hazeDistance: 1200 },
  },
  {
    id: 'mist', name: 'Mist', flavour: 'The world fades out at the edges.',
    look: {
      groundFog: 0.025, groundFogTop: 250, hazeDistance: 700, skyGrey: 0.15, skyTint: [0.95, 0.97, 1.0], skyTintAmount: 0.2,
      sunDim: 0.3, daylight: 0.95, sunLight: 0.75, wind: 0.05,
    },
  },
  {
    id: 'hailstorm', name: 'Hailstorm', flavour: 'Ice from the sky. Find a roof.',
    look: {
      cloud: 1, cloudDark: 0.6, skyGrey: 0.75, sunDim: 1, daylight: 0.6, sunLight: 0.2, hazeDistance: 220,
      particles: { hail: 0.5, rain: 0.35 }, wind: 0.55, lightning: 2, wet: 0.6, hail: 1,
    },
  },

  // Grassy hills
  {
    id: 'gale', name: 'Gale', flavour: 'Petals and leaves tear past.',
    look: { cloud: 0.45, cloudDark: 0.15, skyGrey: 0.2, hazeDistance: 600, particles: { petal: 0.18, debris: 0.3, gust: 0.16 }, wind: 1, gale: 1 },
  },
  {
    id: 'valley_fog', name: 'Valley Fog', flavour: 'A sea of cloud, and the hilltops are islands.',
    look: { groundFog: 0.045, groundFogTop: VALLEY_FOG_TOP, hazeDistance: 1100, skyGrey: 0.1, sunDim: 0.2, wind: 0.05, daylight: 0.97 },
  },
  {
    id: 'meteor_shower', name: 'Meteor Shower', time: 'night', flavour: 'Make a wish. Some of them land.',
    look: { meteors: 1, cloud: -0.35 },
  },

  // Desert
  {
    id: 'heat_wave', name: 'Heat Wave', time: 'day', flavour: 'The air itself wavers.',
    look: {
      heatHaze: 1, skyTint: [1.08, 1.0, 0.86], skyTintAmount: 0.45, skyGrey: 0.2, lightTint: [1.06, 1.0, 0.9], daylight: 1.05,
      hazeDistance: 700, cloud: -0.4, wind: 0.15,
    },
  },
  {
    id: 'dust_devils', name: 'Dust Devils', time: 'day', flavour: 'Whirlwinds wander the dunes.',
    look: { dustDevils: 1, particles: { sand: 0.08 }, wind: 0.55, hazeDistance: 900, skyTint: [1.0, 0.9, 0.75], skyTintAmount: 0.2 },
  },
  {
    id: 'sandstorm', name: 'Sandstorm', flavour: 'A wall of sand swallows the sun.',
    look: {
      cloud: 1, cloudDark: 0.25, cloudTint: [1.0, 0.8, 0.58], skyGrey: 0.95, skyTint: [1.0, 0.72, 0.45], skyTintAmount: 1, sunDim: 0.95, daylight: 0.6, sunLight: 0.3,
      lightTint: [1.0, 0.85, 0.7], hazeDistance: 38, particles: { sand: 1, gust: 0.1 }, wind: 1, gale: 0.6,
    },
  },
  {
    id: 'cloudburst', name: 'Cloudburst', flavour: 'The desert drinks a year of rain in an hour.',
    look: {
      cloud: 1, cloudDark: 0.9, skyGrey: 0.8, sunDim: 1, daylight: 0.5, sunLight: 0.15, hazeDistance: 170,
      particles: { rain: 1 }, wind: 0.8, lightning: 5, wet: 1,
    },
  },

  // Volcanic lands
  {
    id: 'smoky_haze', name: 'Smoky Haze', flavour: 'The mountains are breathing.',
    look: { hazeDistance: 900, skyTint: [0.95, 0.88, 0.8], skyTintAmount: 0.25, wind: 0.2 },
  },
  {
    id: 'red_haze', name: 'Red Haze', flavour: 'The sun hangs like a coal.',
    look: {
      skyGrey: 0.65, skyTint: [1.0, 0.5, 0.35], skyTintAmount: 0.75, sunDim: 0.4, lightTint: [1.0, 0.72, 0.6], daylight: 0.75, sunLight: 0.6,
      hazeDistance: 260, cloudTint: [0.7, 0.5, 0.45], cloud: 0.4, particles: { ash: 0.12 },
    },
  },
  {
    id: 'ash_fall', name: 'Ash Fall', flavour: 'Grey snow that never melts.',
    look: {
      cloud: 1, cloudDark: 0.55, cloudTint: [0.55, 0.5, 0.47], skyGrey: 0.7, skyTint: [0.75, 0.7, 0.66], skyTintAmount: 0.4,
      sunDim: 1, daylight: 0.6, sunLight: 0.25, hazeDistance: 170, particles: { ash: 0.7 }, wind: 0.25,
    },
  },
  {
    id: 'sulphur_rain', name: 'Sulphur Rain', flavour: 'It stings. Do not stand in it.',
    look: {
      cloud: 1, cloudDark: 0.5, cloudTint: [0.82, 0.82, 0.55], skyGrey: 0.6, skyTint: [0.95, 0.95, 0.6], skyTintAmount: 0.5,
      sunDim: 1, daylight: 0.62, sunLight: 0.2, lightTint: [0.98, 1.0, 0.8], hazeDistance: 240, particles: { sulphur: 0.6 },
      wind: 0.35, sulphur: 1, wet: 0.5,
    },
  },
  {
    id: 'ember_storm', name: 'Ember Storm', flavour: 'Burning ash on the wind.',
    look: {
      cloud: 0.9, cloudDark: 0.7, cloudTint: [0.55, 0.38, 0.3], skyGrey: 0.6, skyTint: [1.0, 0.55, 0.35], skyTintAmount: 0.5,
      sunDim: 1, daylight: 0.55, sunLight: 0.2, lightTint: [1.0, 0.7, 0.5], hazeDistance: 200, particles: { ember: 0.55, ash: 0.35, gust: 0.08 },
      wind: 0.85, embers: 1,
    },
  },
  {
    id: 'volcanic_lightning', name: 'Volcanic Lightning', flavour: 'The ash cloud crackles with fire.',
    look: {
      cloud: 1, cloudDark: 0.95, cloudTint: [0.45, 0.4, 0.4], skyGrey: 0.85, sunDim: 1, daylight: 0.45, sunLight: 0.12,
      hazeDistance: 160, particles: { ash: 0.8, ember: 0.12 }, wind: 0.6, lightning: 5, lightningColor: [1.0, 0.85, 0.75],
    },
  },

  // Jungle
  {
    id: 'humid', name: 'Humid', flavour: 'Warm, heavy, alive.',
    look: { hazeDistance: 800, skyTint: [0.95, 1.0, 0.95], skyTintAmount: 0.1, lightTint: [1.02, 1.0, 0.96] },
  },
  {
    id: 'pollen_bloom', name: 'Pollen Bloom', time: 'day', flavour: 'The jungle flowers all at once.',
    look: {
      particles: { pollen: 0.45 }, skyTint: [1.05, 0.98, 0.8], skyTintAmount: 0.3, lightTint: [1.06, 1.0, 0.86], hazeDistance: 500,
      wind: 0.15,
    },
  },
  {
    id: 'steam_mist', name: 'Steam Mist', flavour: 'The rain rises again as steam.',
    look: {
      groundFog: 0.022, groundFogTop: 258, hazeDistance: 320, skyGrey: 0.35, sunDim: 0.5, daylight: 0.88, sunLight: 0.55,
      wind: 0.05, wet: 0.15,
    },
  },
  {
    id: 'sun_shower', name: 'Sun Shower', time: 'day', flavour: 'Rain in the sunshine, and a rainbow.',
    look: { cloud: 0.25, particles: { rain: 0.4 }, rainbow: 1, wet: 1, hazeDistance: 700, wind: 0.3 },
  },
  {
    id: 'downpour', name: 'Downpour', flavour: 'Like standing under a waterfall.',
    look: {
      cloud: 1, cloudDark: 0.6, skyGrey: 0.8, sunDim: 1, daylight: 0.6, sunLight: 0.2, hazeDistance: 120, particles: { rain: 1 },
      wind: 0.45, wet: 1,
    },
  },
  {
    id: 'monsoon', name: 'Monsoon Storm', flavour: 'The sky splits open.',
    look: {
      cloud: 1, cloudDark: 0.9, skyGrey: 0.85, sunDim: 1, daylight: 0.45, sunLight: 0.1, hazeDistance: 110,
      particles: { rain: 0.75, driving: 0.35, debris: 0.12, gust: 0.06 }, wind: 0.85, lightning: 7, wet: 1,
    },
  },

  // Swamp
  { id: 'murk', name: 'Murk', flavour: 'Still water, still air.', look: { hazeDistance: 900, wind: 0.08 } },
  {
    id: 'glowmist', name: 'Glowmist', time: 'night', flavour: 'Lights drift in the fog. Do not follow them.',
    look: {
      groundFog: 0.04, groundFogTop: 240, hazeDistance: 250, particles: { wisp: 0.013 }, skyTint: [0.85, 1.0, 0.88],
      skyTintAmount: 0.3, wind: 0.03,
    },
  },
  {
    id: 'swamp_gas', name: 'Swamp Gas', flavour: 'Something green rises from the bog.',
    look: {
      skyTint: [0.85, 1.0, 0.7], skyTintAmount: 0.45, lightTint: [0.92, 1.0, 0.85], hazeDistance: 200, groundFog: 0.04,
      groundFogTop: 238, sunDim: 0.4, daylight: 0.85, wind: 0.05,
    },
  },
  {
    id: 'thick_fog', name: 'Thick Fog', flavour: 'You can barely see your own hands.',
    look: { groundFog: 0.12, groundFogTop: 248, hazeDistance: 60, cloud: 1, skyGrey: 0.85, sunDim: 0.95, daylight: 0.8, sunLight: 0.3, wind: 0.03 },
  },

  // Pine forest (snow above the snow line)
  { id: 'crisp', name: 'Crisp', flavour: 'Clean, cold air.', look: { lightTint: [0.98, 1.0, 1.04] } },
  {
    id: 'aurora', name: 'Aurora', time: 'night', flavour: 'The sky is on fire with green light.',
    look: { aurora: 1, cloud: -0.4 },
  },
  {
    id: 'diamond_dust', name: 'Diamond Dust', flavour: 'The air glitters with ice.',
    look: { particles: { glitter: 0.7 }, lightTint: [0.97, 1.0, 1.05], hazeDistance: 1200, cloud: -0.2, wind: 0.1 },
  },
  {
    id: 'freezing_fog', name: 'Freezing Fog', flavour: 'Every needle grows a coat of frost.',
    look: {
      groundFog: 0.06, groundFogTop: 270, hazeDistance: 90, skyGrey: 0.6, skyTint: [0.92, 0.96, 1.05], skyTintAmount: 0.35,
      sunDim: 0.85, daylight: 0.82, sunLight: 0.3, wind: 0.05, particles: { glitter: 0.12 }, cold: 0.4,
    },
  },
  {
    id: 'snowfall', name: 'Snowfall', flavour: 'Soft and silent.', belowSnowLine: 'rain_shower',
    look: {
      cloud: 1, cloudDark: 0.3, skyGrey: 0.7, skyTint: [0.95, 0.97, 1.03], skyTintAmount: 0.3, sunDim: 1, daylight: 0.75,
      sunLight: 0.3, hazeDistance: 220, particles: { snow: 0.6 }, wind: 0.3,
    },
  },
  {
    id: 'blizzard', name: 'Blizzard', flavour: 'White out. Find shelter or freeze.', belowSnowLine: 'thunderstorm',
    look: {
      cloud: 1, cloudDark: 0.55, skyGrey: 0.85, skyTint: [0.92, 0.95, 1.02], skyTintAmount: 0.5, sunDim: 1, daylight: 0.6,
      sunLight: 0.15, hazeDistance: 40, particles: { snow: 1, gust: 0.12 }, wind: 1, cold: 1, gale: 0.4,
    },
  },

  // Coastal rainforest
  {
    id: 'sea_fog', name: 'Sea Fog', flavour: 'It rolls in off the water.',
    look: {
      groundFog: 0.08, groundFogTop: 252, hazeDistance: 140, skyGrey: 0.5, skyTint: [0.93, 0.96, 1.0], skyTintAmount: 0.3,
      sunDim: 0.8, daylight: 0.85, sunLight: 0.35, wind: 0.15,
    },
  },
  {
    id: 'squall', name: 'Squall', flavour: 'The rain comes in sideways.',
    look: {
      cloud: 1, cloudDark: 0.6, skyGrey: 0.75, sunDim: 1, daylight: 0.6, sunLight: 0.2, hazeDistance: 200,
      particles: { driving: 0.75, drizzle: 0.15, debris: 0.22, gust: 0.12 }, wind: 1, wet: 1, gale: 0.8,
    },
  },
  {
    id: 'glowing_tide', name: 'Glowing Tide', time: 'night', flavour: 'Every wave breaks in blue light.',
    look: { waterGlow: 1, groundFog: 0.03, groundFogTop: 245, hazeDistance: 600, wind: 0.1 },
  },

  // Hell: cavern weather, falling from the ceiling
  { id: 'calm', name: 'Calm', flavour: 'The cavern holds its breath.', look: {} },
  {
    id: 'heat_surge', name: 'Heat Surge', flavour: 'The rock glows hotter.',
    look: {
      floorTint: [1.35, 1.0, 0.8], glowPulse: 0.35, skyTint: [1.1, 0.8, 0.6], skyTintAmount: 0.3, hazeDistance: 300,
      particles: { ember: 0.08 }, heatHaze: 0.6,
    },
  },
  {
    id: 'ash_squall', name: 'Ash Squall', flavour: 'A choking gale of ash.',
    look: {
      hazeDistance: 45, skyTint: [0.55, 0.5, 0.48], skyTintAmount: 0.6, floorTint: [0.8, 0.78, 0.78], particles: { ash: 1, gust: 0.06 },
      wind: 0.9, gale: 0.5,
    },
  },
  {
    id: 'ember_rain', name: 'Ember Rain', flavour: 'Sparks fall from the ceiling.',
    look: {
      hazeDistance: 220, particles: { ember: 0.7 }, floorTint: [1.2, 0.95, 0.8], skyTint: [1.1, 0.7, 0.5], skyTintAmount: 0.25,
      wind: 0.25, embers: 1,
    },
  },
  {
    id: 'firefall', name: 'Firefall', flavour: 'The ceiling weeps molten rock.',
    look: { particles: { firefall: 0.3, ember: 0.25 }, floorTint: [1.25, 0.95, 0.8], hazeDistance: 260, embers: 0.6, wind: 0.05 },
  },
  {
    id: 'soul_wisps', name: 'Soul Wisps', flavour: 'The dead are restless.',
    look: { particles: { wisp: 0.008 }, floorTint: [0.9, 1.15, 1.0], hazeDistance: 500 },
  },
  {
    id: 'ghost_fog', name: 'Ghost Fog', flavour: 'Pale fog pools between the bones.',
    look: {
      groundFog: 0.09, groundFogTop: 5, hazeDistance: 180, skyTint: [0.85, 1.0, 0.9], skyTintAmount: 0.35,
      floorTint: [0.95, 1.1, 1.0],
    },
  },
  {
    id: 'bone_dust', name: 'Bone-Dust Storm', flavour: 'The dunes are walking.',
    look: { particles: { bone: 1, gust: 0.06 }, hazeDistance: 40, skyTint: [0.95, 0.92, 0.82], skyTintAmount: 0.6, wind: 1, gale: 0.5 },
  },
  {
    id: 'grave_storm', name: 'Grave Storm', flavour: 'Green lightning and no rain.',
    look: {
      particles: { bone: 0.3, wisp: 0.004 }, hazeDistance: 160, lightning: 5, lightningColor: [0.5, 1.0, 0.65],
      floorTint: [0.85, 1.05, 0.9], wind: 0.6, skyTint: [0.7, 0.9, 0.75], skyTintAmount: 0.3,
    },
  },
  {
    id: 'crimson_mist', name: 'Crimson Mist', flavour: 'Red fog breathes out of the mycelium.',
    look: {
      groundFog: 0.06, groundFogTop: 6, hazeDistance: 160, skyTint: [1.1, 0.6, 0.62], skyTintAmount: 0.5,
      floorTint: [1.15, 0.9, 0.92],
    },
  },
  {
    id: 'ember_drift', name: 'Ember Drift', flavour: 'Slow sparks drift between the caps.',
    look: { particles: { ember: 0.35, spore: 0.1 }, hazeDistance: 400, wind: 0.3 },
  },
  {
    id: 'spore_bloom', name: 'Spore Bloom', flavour: 'The grove exhales.',
    look: {
      particles: { spore: 0.75 }, hazeDistance: 120, skyTint: [0.8, 1.0, 0.95], skyTintAmount: 0.3, floorTint: [0.95, 1.1, 1.05],
    },
  },
  {
    id: 'glowfall', name: 'Glowfall', flavour: 'Light rains from the fungi.',
    look: { particles: { spore: 0.35, pollen: 0.3 }, floorTint: [1.1, 1.1, 1.0], glowPulse: 0.2, hazeDistance: 300 },
  },
  {
    id: 'violet_mist', name: 'Violet Mist', flavour: 'The abyss fills with violet.',
    look: {
      groundFog: 0.06, groundFogTop: 6, hazeDistance: 150, skyTint: [0.85, 0.65, 1.1], skyTintAmount: 0.5,
      floorTint: [1.05, 0.9, 1.2],
    },
  },
  {
    id: 'resonance', name: 'Resonance', flavour: 'The crystals sing, and the light sings with them.',
    look: { glowPulse: 0.6, floorTint: [1.2, 0.95, 1.4], particles: { glitter: 0.2 }, hazeDistance: 600 },
  },
  {
    id: 'prism_lights', name: 'Prism Lights', flavour: 'Ribbons of colour under the stone sky.',
    look: { aurora: 1, floorTint: [1.05, 1.0, 1.15] },
  },
  {
    id: 'crystal_hail', name: 'Crystal Hail', flavour: 'Shards ring as they fall.',
    look: { particles: { shard: 0.85 }, hazeDistance: 400, floorTint: [1.1, 1.0, 1.2], hail: 0.5 },
  },
  {
    id: 'frost_glitter', name: 'Frost Glitter', flavour: 'The cold itself sparkles.',
    look: { particles: { glitter: 0.5 }, hazeDistance: 700, floorTint: [1.0, 1.05, 1.15] },
  },
  {
    id: 'soul_snow', name: 'Soul Snow', flavour: 'Pale flakes that glow as they fall.',
    look: { particles: { soulsnow: 0.45 }, floorTint: [0.95, 1.05, 1.15], hazeDistance: 500 },
  },
  {
    id: 'rime_fog', name: 'Freezing Fog', flavour: 'Fog that freezes where it touches.',
    look: {
      groundFog: 0.08, groundFogTop: 5, hazeDistance: 120, skyTint: [0.9, 0.97, 1.1], skyTintAmount: 0.4, cold: 0.5,
    },
  },
  {
    id: 'black_blizzard', name: 'Black Blizzard', flavour: 'Dark snow, howling out of nowhere.',
    look: {
      particles: { blacksnow: 1, gust: 0.06 }, hazeDistance: 35, skyTint: [0.55, 0.6, 0.7], skyTintAmount: 0.6,
      floorTint: [0.8, 0.85, 0.95], wind: 1, cold: 1, gale: 0.4,
    },
  },
]

export const WEATHER_DEFS: ReadonlyMap<string, WeatherDef> = new Map(
  DEF_SPECS.map((spec) => [spec.id, { ...spec, look: resolveLook(spec.look) }])
)

export function getWeatherDef(id: string): WeatherDef {
  const def = WEATHER_DEFS.get(id)
  if (!def) throw new Error(`Unknown weather '${id}'`)
  return def
}

/** What a biome reads the air with: the weather's day or night, its fair-weather specials. */
export interface PresentContext {
  readonly night: boolean
  /** 0-1: a drifting regional patch of some fair-weather special here (a different map per salt). */
  regional(salt: number): number
  /** 1 on nights a sky event happens (meteor showers, auroras), else 0. */
  nightEvent(salt: number, chance: number): number
}

/**
 * Hands out a mix's weight, most severe weather first: each rule takes its
 * strength's share of what is left, and the biome's fair weather gets the
 * rest - so the mix always sums to 1 and changes smoothly with the air.
 */
export class WeatherCascade {
  private mix: Map<string, number> = new Map()
  private scale = 1
  private rest = 1

  begin(mix: Map<string, number>, scale: number): this {
    this.mix = mix
    this.scale = scale
    this.rest = 1
    return this
  }

  rule(id: string, strength: number): this {
    if (strength <= 0 || this.rest <= 0) return this
    const w = this.rest * Math.min(1, strength)
    this.mix.set(id, (this.mix.get(id) ?? 0) + w * this.scale)
    this.rest -= w
    return this
  }

  fallback(id: string): void {
    if (this.rest > 0) this.mix.set(id, (this.mix.get(id) ?? 0) + this.rest * this.scale)
  }
}

export interface BiomeWeather {
  /** Every weather the biome can have, fair to wild; the first is its fair weather (not announced). */
  readonly ids: readonly string[]
  /** Read the air into weathers (cascade.begin() already called). */
  present(air: WeatherAir, ctx: PresentContext, cascade: WeatherCascade): void
}

/** 0 below a, 1 above b, smooth between. */
function ramp(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A storm's core: storminess with the rain to go with it. */
const stormy = (air: WeatherAir): number => ramp(air.storm, 0.35, 0.6) * ramp(air.precip, 0.25, 0.45)
/** Skies clear enough to see the stars, or to be called fair. */
const clearSky = (air: WeatherAir): number => 1 - ramp(air.cloud, 0.35, 0.65)
const overcast = (air: WeatherAir): number => ramp(air.cloud, 0.5, 0.8)

/** Salts of the regional specials and sky events. */
const SALT = {
  seedfall: 1, heat: 2, pollen: 3, gas: 4, red: 5, diamond: 6, meteor: 7, aurora: 8, tide: 9, glowmist: 10,
  hellHeat: 11, wisps: 12, drift: 13, glitter: 14, devils: 15,
} as const
/** Chance a night has each sky event. */
const METEOR_NIGHTS = 0.3
const AURORA_NIGHTS = 0.4
const TIDE_NIGHTS = 0.35
const GLOWMIST_NIGHTS = 0.35

const day = (ctx: PresentContext): number => (ctx.night ? 0 : 1)
const night = (ctx: PresentContext): number => (ctx.night ? 1 : 0)

/**
 * Each biome's weathers and how it reads the air. The air is the same
 * everywhere (WeatherSystems); a biome may weigh it first (the desert dries
 * rain out to virga, the swamp thickens fog, the coast catches the wind).
 */
export const BIOME_WEATHER: Readonly<Record<string, BiomeWeather>> = {
  plains: {
    ids: ['clear', 'seedfall', 'mist', 'overcast', 'gale', 'rain_shower', 'hailstorm', 'thunderstorm'],
    present: (air, ctx, c) => {
      const storm = stormy(air)
      // About a quarter of storms bring hail
      c.rule('hailstorm', storm * (1 - ramp(air.flavor, 0.22, 0.36))).rule('thunderstorm', storm)
        .rule('rain_shower', ramp(air.precip, 0.1, 0.35))
        .rule('gale', ramp(air.wind, 0.62, 0.85))
        .rule('mist', ramp(air.fog, 0.3, 0.6))
        .rule('overcast', overcast(air))
        .rule('seedfall', day(ctx) * ctx.regional(SALT.seedfall) * clearSky(air))
        .fallback('clear')
    },
  },
  'grassy-hills': {
    ids: ['clear', 'meteor_shower', 'valley_fog', 'overcast', 'gale', 'drizzle', 'rain_shower', 'thunderstorm'],
    present: (air, ctx, c) => {
      // Exposed: the wind blows harder, fog pools in the valleys
      const wind = air.wind * 1.15
      c.rule('thunderstorm', stormy(air))
        .rule('rain_shower', ramp(air.precip, 0.35, 0.55))
        .rule('drizzle', ramp(air.precip, 0.08, 0.3))
        .rule('gale', ramp(wind, 0.6, 0.85))
        .rule('valley_fog', ramp(air.fog * 1.2, 0.3, 0.6))
        .rule('overcast', overcast(air))
        .rule('meteor_shower', night(ctx) * ctx.nightEvent(SALT.meteor, METEOR_NIGHTS) * clearSky(air))
        .fallback('clear')
    },
  },
  desert: {
    ids: ['clear', 'meteor_shower', 'heat_wave', 'dust_devils', 'overcast', 'sandstorm', 'cloudburst'],
    present: (air, ctx, c) => {
      // Rain dries out before it lands (only storm cores get through) and cloud thins over the hot sand;
      // the wind lifts the sand
      const precip = air.precip * 0.4
      const wind = air.wind * 1.15
      c.rule('cloudburst', ramp(precip, 0.22, 0.36))
        .rule('sandstorm', ramp(wind, 0.58, 0.82))
        .rule('dust_devils', day(ctx) * Math.max(ramp(wind, 0.34, 0.52), ctx.regional(SALT.devils) * clearSky(air)))
        .rule('overcast', ramp(air.cloud * 0.8, 0.62, 0.8))
        .rule('heat_wave', day(ctx) * ctx.regional(SALT.heat) * clearSky(air))
        .rule('meteor_shower', night(ctx) * ctx.nightEvent(SALT.meteor, METEOR_NIGHTS) * clearSky(air))
        .fallback('clear')
    },
  },
  volcanic: {
    ids: ['smoky_haze', 'red_haze', 'ash_fall', 'sulphur_rain', 'ember_storm', 'volcanic_lightning'],
    present: (air, ctx, c) => {
      c.rule('volcanic_lightning', ramp(air.storm, 0.4, 0.68))
        .rule('ember_storm', ramp(air.wind, 0.55, 0.8))
        .rule('sulphur_rain', ramp(air.precip, 0.12, 0.35))
        // Any cloud over the vents rains ash
        .rule('ash_fall', ramp(air.cloud, 0.55, 0.85))
        .rule('red_haze', Math.max(ramp(air.fog, 0.3, 0.6), ctx.regional(SALT.red)))
        .fallback('smoky_haze')
    },
  },
  jungle: {
    ids: ['humid', 'pollen_bloom', 'steam_mist', 'overcast', 'sun_shower', 'rain_shower', 'downpour', 'monsoon'],
    present: (air, ctx, c) => {
      // Wetter than anywhere: rain falls harder, mist rises thicker
      const precip = air.precip * 1.25
      c.rule('monsoon', stormy(air))
        .rule('downpour', ramp(precip, 0.4, 0.62))
        // The ragged edge of the rain: sunshine through it by day
        .rule(ctx.night ? 'rain_shower' : 'sun_shower', ramp(precip, 0.08, 0.3))
        .rule('steam_mist', ramp(air.fog * 1.3, 0.3, 0.6))
        .rule('overcast', ramp(air.cloud, 0.62, 0.9))
        .rule('pollen_bloom', day(ctx) * ctx.regional(SALT.pollen) * clearSky(air))
        .fallback('humid')
    },
  },
  swamp: {
    ids: ['murk', 'glowmist', 'swamp_gas', 'overcast', 'thick_fog', 'drizzle', 'rain_shower', 'thunderstorm'],
    present: (air, ctx, c) => {
      const fog = air.fog * 1.5
      c.rule('thunderstorm', stormy(air))
        .rule('rain_shower', ramp(air.precip, 0.35, 0.55))
        .rule('drizzle', ramp(air.precip, 0.08, 0.3))
        .rule('thick_fog', ramp(fog, 0.5, 0.8))
        // After dark the swamp's mist glows, and on some nights the whole bog does
        .rule('glowmist', night(ctx) * Math.max(ramp(fog, 0.15, 0.4), ctx.nightEvent(SALT.glowmist, GLOWMIST_NIGHTS)))
        .rule('swamp_gas', Math.max(ctx.regional(SALT.gas), ramp(fog, 0.15, 0.4)))
        .rule('overcast', overcast(air))
        .fallback('murk')
    },
  },
  'pine-forest': {
    ids: ['crisp', 'aurora', 'diamond_dust', 'freezing_fog', 'overcast', 'gale', 'snowfall', 'blizzard'],
    present: (air, ctx, c) => {
      // Snow (rain below the snow line: resolveAtHeight); wind and snow together are a blizzard
      c.rule('blizzard', Math.max(stormy(air), ramp(air.precip, 0.25, 0.45) * ramp(air.wind, 0.5, 0.75)))
        .rule('snowfall', ramp(air.precip, 0.08, 0.3))
        .rule('gale', ramp(air.wind, 0.62, 0.85))
        .rule('freezing_fog', ramp(air.fog, 0.3, 0.6))
        .rule('overcast', overcast(air))
        .rule('aurora', night(ctx) * ctx.nightEvent(SALT.aurora, AURORA_NIGHTS) * clearSky(air))
        .rule('diamond_dust', ctx.regional(SALT.diamond) * clearSky(air) * (1 - ramp(air.wind, 0.3, 0.5)))
        .fallback('crisp')
    },
  },
  'coastal-rainforest': {
    ids: ['clear', 'glowing_tide', 'sea_fog', 'overcast', 'gale', 'drizzle', 'rain_shower', 'squall', 'thunderstorm'],
    present: (air, ctx, c) => {
      // The sea's wind and fog come ashore
      const wind = air.wind * 1.1
      c.rule('thunderstorm', stormy(air))
        .rule('squall', ramp(wind, 0.55, 0.8) * ramp(air.precip, 0.12, 0.3))
        .rule('rain_shower', ramp(air.precip, 0.38, 0.58))
        .rule('drizzle', ramp(air.precip, 0.08, 0.32))
        .rule('gale', ramp(wind, 0.62, 0.85))
        .rule('sea_fog', ramp(air.fog * 1.4, 0.3, 0.6))
        .rule('overcast', overcast(air))
        .rule('glowing_tide', night(ctx) * ctx.nightEvent(SALT.tide, TIDE_NIGHTS))
        .fallback('clear')
    },
  },
  ocean: {
    ids: ['clear', 'glowing_tide', 'sea_fog', 'overcast', 'gale', 'drizzle', 'rain_shower', 'squall', 'thunderstorm'],
    present: (air, ctx, c) => {
      // Nothing breaks the wind out at sea, and fog banks lie thick on the water
      const wind = air.wind * 1.25
      c.rule('thunderstorm', stormy(air))
        .rule('squall', ramp(wind, 0.5, 0.75) * ramp(air.precip, 0.12, 0.3))
        .rule('rain_shower', ramp(air.precip, 0.38, 0.58))
        .rule('drizzle', ramp(air.precip, 0.08, 0.32))
        .rule('gale', ramp(wind, 0.58, 0.82))
        .rule('sea_fog', ramp(air.fog * 1.6, 0.3, 0.6))
        .rule('overcast', overcast(air))
        .rule('glowing_tide', night(ctx) * ctx.nightEvent(SALT.tide, TIDE_NIGHTS))
        .fallback('clear')
    },
  },

  // Hell: the cavern has its own air (a separate set of systems) and no sky
  hell: {
    ids: ['calm', 'heat_surge', 'ash_squall', 'ember_rain', 'firefall'],
    present: (air, ctx, c) => {
      c.rule('firefall', ramp(air.storm, 0.4, 0.68))
        .rule('ash_squall', ramp(air.wind, 0.55, 0.8))
        .rule('ember_rain', ramp(air.precip, 0.15, 0.4))
        .rule('heat_surge', Math.max(ramp(air.fog, 0.3, 0.6), ctx.regional(SALT.hellHeat)))
        .fallback('calm')
    },
  },
  ossuary: {
    ids: ['calm', 'soul_wisps', 'ghost_fog', 'bone_dust', 'grave_storm'],
    present: (air, ctx, c) => {
      c.rule('grave_storm', ramp(air.storm, 0.4, 0.68))
        .rule('bone_dust', ramp(air.wind, 0.55, 0.8))
        .rule('ghost_fog', ramp(air.fog, 0.3, 0.6))
        .rule('soul_wisps', Math.max(ramp(air.precip, 0.15, 0.4), ctx.regional(SALT.wisps)))
        .fallback('calm')
    },
  },
  'ember-grove': {
    ids: ['calm', 'crimson_mist', 'ember_drift', 'spore_bloom', 'glowfall'],
    present: (air, ctx, c) => {
      c.rule('glowfall', ramp(air.storm, 0.4, 0.68))
        .rule('spore_bloom', ramp(air.precip, 0.15, 0.4))
        .rule('ember_drift', Math.max(ramp(air.wind, 0.45, 0.7), ctx.regional(SALT.drift)))
        .rule('crimson_mist', ramp(air.fog, 0.3, 0.6))
        .fallback('calm')
    },
  },
  'crystal-abyss': {
    ids: ['calm', 'violet_mist', 'resonance', 'prism_lights', 'crystal_hail'],
    present: (air, _ctx, c) => {
      // Wind through the crystals sings; the cloud decks overhead light up as prism ribbons
      c.rule('crystal_hail', Math.max(ramp(air.storm, 0.4, 0.68), ramp(air.precip, 0.25, 0.5)))
        .rule('resonance', ramp(air.wind, 0.5, 0.75))
        .rule('violet_mist', ramp(air.fog, 0.3, 0.6))
        .rule('prism_lights', ramp(air.cloud, 0.6, 0.88))
        .fallback('calm')
    },
  },
  cocytus: {
    ids: ['calm', 'frost_glitter', 'soul_snow', 'rime_fog', 'black_blizzard'],
    present: (air, ctx, c) => {
      c.rule('black_blizzard', Math.max(ramp(air.storm, 0.4, 0.68), ramp(air.precip, 0.25, 0.45) * ramp(air.wind, 0.5, 0.75)))
        .rule('soul_snow', ramp(air.precip, 0.1, 0.32))
        .rule('rime_fog', ramp(air.fog, 0.3, 0.6))
        .rule('frost_glitter', Math.max(ramp(air.cloud, 0.6, 0.88), ctx.regional(SALT.glitter)))
        .fallback('calm')
    },
  },
}

const FALLBACK_BIOME = BIOME_WEATHER.plains

export function biomeWeatherOf(biome: string): BiomeWeather {
  return BIOME_WEATHER[biome] ?? FALLBACK_BIOME
}

/** The pine forest's snow line (snowfall below it is rain). */
export const WEATHER_SNOW_LINE = SNOW_LINE_Y

/** The weather a definition becomes at a height (snow → rain below the snow line). */
export function resolveAtHeight(id: string, y: number): string {
  const def = WEATHER_DEFS.get(id)
  if (def?.belowSnowLine && y < WEATHER_SNOW_LINE) return def.belowSnowLine
  return id
}
