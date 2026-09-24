import * as THREE from 'three'

/**
 * Emissive ("glowing") block textures: textures whose hot pixels are light
 * sources of their own - magma cracks, ember veins, bioluminescent caps.
 *
 * Block light only lights the cells AROUND an emitter, so without this an
 * emitter's own faces are lit by its neighbours' (lower) light and a dim
 * emitter like magma reads as dark rock in a cave. Greedy chunk faces with
 * a registered texture add their hot texels as emissive light on top of the
 * world light (ChunkMaterial), so they visibly glow in the dark and fade
 * into the distance fog like everything else.
 *
 * Pure registry (no GPU state until buildLayerGlowTexture); block modules
 * register their textures at load, next to registerTextureUrl().
 */
export interface EmissiveTextureOptions {
  /**
   * Emissive strength: the glowing texels add `texel × strength` (linear)
   * on top of lighting. ~1 = the texel's own colour at full brightness.
   */
  readonly strength: number
  /**
   * Linear brightness (max RGB channel) at which texels start to glow; the
   * glow ramps in over the next 0.25. 0 = the whole texture glows.
   */
  readonly threshold: number
}

/** Largest strength representable in the glow lookup texture. */
const MAX_STRENGTH = 4

const emissiveTextures = new Map<number, EmissiveTextureOptions>()

/** Mark a block face texture as emissive (call at module load). */
export function registerEmissiveTexture(textureId: number, options: EmissiveTextureOptions): void {
  emissiveTextures.set(textureId, options)
}

/**
 * Per texture-array layer glow parameters as a 1-texel-high lookup texture:
 * R = strength / MAX_STRENGTH, G = threshold (0 in both = no glow). Read in
 * the chunk shader with texelFetch(…, ivec2(layer, 0), 0).
 *
 * @param layers TextureId → texture-array layer
 * @param layerCount Number of layers in the texture array
 */
export function buildLayerGlowTexture(layers: ReadonlyMap<number, number>, layerCount: number): THREE.DataTexture {
  const width = Math.max(1, layerCount)
  const data = new Uint8Array(width * 4)
  for (const [textureId, layer] of layers) {
    const glow = emissiveTextures.get(textureId)
    if (!glow || layer >= width) continue
    data[layer * 4] = Math.round(Math.min(1, Math.max(0, glow.strength / MAX_STRENGTH)) * 255)
    data[layer * 4 + 1] = Math.round(Math.min(1, Math.max(0, glow.threshold)) * 255)
  }
  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return texture
}

/** GLSL constant matching MAX_STRENGTH (glow strength decode). */
export const EMISSIVE_MAX_STRENGTH_GLSL = `${MAX_STRENGTH}.0`
