import * as THREE from 'three'

/**
 * What the weather does to the world's light, applied by main.ts's 'skybox'
 * task on top of the biome atmosphere and the time of day (multipliers;
 * neutral until setupWeather's 'weather' task writes them each frame).
 */
export const weatherAtmosphere = {
  /** Multiplier on sky light (overcast, storms). */
  daylight: 1,
  /** Multiplier on the sun's (or moon's) directional light: soft overcast light, shadows fade. */
  sunLight: 1,
  /** Multiplier on the light colour. */
  lightTint: new THREE.Color(1, 1, 1),
  /** Multiplier on the light floor (Hell's cavern weathers tint and pulse it). */
  floorTint: new THREE.Color(1, 1, 1),
  /** Lightning: 0-1, added to sky light (and the light floor in the cavern). */
  flash: 0,
}
