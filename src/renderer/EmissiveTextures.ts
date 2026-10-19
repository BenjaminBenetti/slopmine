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
 * A texture may bring its own glow map (`map`): then the glow's colour comes
 * from the map, not from the texel, so a surface can look plain by day and
 * light up in another colour at night. `darkOnly` (bioluminescence) fades
 * the glow out wherever sky light × daylight is bright: it shows at night,
 * in deep shade and underground, never in the sun.
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
   * glow ramps in over the next 0.25. 0 = the whole texture glows. Ignored
   * with a `map`.
   */
  readonly threshold: number
  /**
   * Glow map URL (same size as the texture): each texel's glow colour,
   * black = no glow. The glow adds `map × strength` instead of the texel's
   * own colour.
   */
  readonly map?: string
  /** Glow only in the dark (night, shade, caves) - bioluminescence. */
  readonly darkOnly?: boolean
  /**
   * Optional living glow (bioluminescence): the glow dips by up to `amount`
   * (0-1) and comes back. `speck`: every texel on its own clock (twinkling
   * spore specks); `wave`: slow waves of light drifting across the surface
   * (mushroom caps). Without it the glow is steady. With a `map`, only its
   * bright texels pulse (a dim sheen stays steady).
   */
  readonly pulse?: {
    readonly amount: number
    readonly grain: 'speck' | 'wave'
  }
}

/** Largest strength representable in the glow lookup texture. */
const MAX_STRENGTH = 4

const emissiveTextures = new Map<number, EmissiveTextureOptions>()

/** Mark a block face texture as emissive (call at module load). */
export function registerEmissiveTexture(textureId: number, options: EmissiveTextureOptions): void {
  emissiveTextures.set(textureId, options)
}

/** Glow map URL per TextureId (textures registered with a `map`). */
export function getEmissiveMapUrls(): ReadonlyMap<number, string> {
  const urls = new Map<number, string>()
  for (const [textureId, options] of emissiveTextures) {
    if (options.map) urls.set(textureId, options.map)
  }
  return urls
}

/**
 * GLSL: how much of a dark-only (bioluminescent) glow shows for a daylit
 * value `slopLightShape(sky) × uDaylight` - 0 in the open by day (the swamp's
 * overcast noon is 0.62), full at night (0.09-0.15). Shared by the chunk
 * shader and the instanced plant patch (BioluminescentMaterial.ts).
 * Never write it as smoothstep( 0.3, 0.12, … ): reversed edges are undefined
 * in GLSL, and SwiftShader's instanced variant then glowed at noon.
 */
export const DARK_GLOW_GLSL = /* glsl */ `
float slopDarkGlow( float daylit ) {
  return 1.0 - smoothstep( 0.12, 0.3, daylit );
}
`

/**
 * Per texture-array layer glow parameters as a 2-texel-high lookup texture,
 * read in the chunk shader with texelFetch(…, ivec2(layer, row), 0):
 * row 0: R = strength / MAX_STRENGTH, G = threshold (0 in both = no glow),
 * B = pulse amount, A = pulse grain (0 wave, 1 speck);
 * row 1: R = glow map layer (0 = none, see BlockTextureArray's glowMaps),
 * G = dark only (1).
 *
 * @param layers TextureId → texture-array layer
 * @param layerCount Number of layers in the texture array
 * @param mapLayers TextureId → glow map layer (1-based)
 */
export function buildLayerGlowTexture(
  layers: ReadonlyMap<number, number>,
  layerCount: number,
  mapLayers: ReadonlyMap<number, number>,
): THREE.DataTexture {
  const width = Math.max(1, layerCount)
  const data = new Uint8Array(width * 4 * 2)
  for (const [textureId, layer] of layers) {
    const glow = emissiveTextures.get(textureId)
    if (!glow || layer >= width) continue
    data[layer * 4] = Math.round(Math.min(1, Math.max(0, glow.strength / MAX_STRENGTH)) * 255)
    data[layer * 4 + 1] = Math.round(Math.min(1, Math.max(0, glow.threshold)) * 255)
    data[layer * 4 + 2] = Math.round(Math.min(1, Math.max(0, glow.pulse?.amount ?? 0)) * 255)
    data[layer * 4 + 3] = glow.pulse?.grain === 'speck' ? 255 : 0
    const row1 = (width + layer) * 4
    data[row1] = Math.min(255, mapLayers.get(textureId) ?? 0)
    data[row1 + 1] = glow.darkOnly ? 255 : 0
  }
  const texture = new THREE.DataTexture(data, width, 2, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return texture
}

/** GLSL constant matching MAX_STRENGTH (glow strength decode). */
export const EMISSIVE_MAX_STRENGTH_GLSL = `${MAX_STRENGTH}.0`
