/**
 * The living-world shader clock: seconds that pulsing emissive textures
 * (ChunkMaterial) breathe and twinkle by and swaying water plants
 * (SwayingPlantMaterial) wave by. Plain data, no three.js - block modules
 * (also loaded in workers) may import it.
 */
export const glowTimeUniform = { value: 0 }

/** Advance the clock (once per frame, in the 'skybox' task). */
export function advanceGlowTime(deltaTime: number): void {
  // Wrapped: float precision in the shaders' sin() would degrade over hours
  glowTimeUniform.value = (glowTimeUniform.value + deltaTime) % 3600
}
