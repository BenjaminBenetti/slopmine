/**
 * The wind as shaders see it, shared by every program that sways or turns
 * with it (foliage, the weathervane): xy = the direction it blows toward
 * (unit, world x/z), z = strength 0 (calm) .. 1 (a gale). Set each frame by
 * the weather (setupWeather); one object for all programs.
 */
export const windUniform = { value: { x: 1, y: 0, z: 0.15 } }

export function setWorldWind(dirX: number, dirZ: number, strength: number): void {
  const w = windUniform.value
  w.x = dirX
  w.y = dirZ
  w.z = strength
}
