import * as THREE from 'three'
import { nearestMagnificationSurvivesAnisotropy } from './anisotropyProbe.ts'
import type { TextureFiltering } from '../settings/GraphicsSettings.ts'

/**
 * Shared texture loader with proper filtering settings for voxel games.
 * - NearestFilter for magFilter keeps pixelated look when close
 * - Mipmapped minification (crisp or smooth, see TextureFilteringMode)
 * - Anisotropic filtering improves quality at oblique angles, where the GPU
 *   backend allows it (see enableNearestTextureAnisotropy)
 */

const loader = new THREE.TextureLoader()

/**
 * Minification style for block textures (Graphics setting):
 * - 'crisp': nearest texel within each mip level, blended between levels
 *   (NearestMipmapLinearFilter) - pixel-art texels stay sharp at mid range.
 * - 'smooth': trilinear (LinearMipmapLinearFilter) - softer, no moire.
 * Magnification is always nearest (pixelated up close).
 */
export type TextureFilteringMode = TextureFiltering

let filteringMode: TextureFilteringMode = 'crisp'

/** Block textures this loader created (their minFilter follows the mode). */
const loadedTextures = new Set<THREE.Texture>()

/** Image loads started by loadBlockTexture that haven't finished (or failed) yet. */
const pendingLoads = new Set<Promise<void>>()

/**
 * Resolves once every block texture requested so far has loaded (or failed):
 * block icons are rendered from these textures, and one drawn before its
 * image arrived would stay blank.
 */
export async function whenBlockTexturesLoaded(): Promise<void> {
  while (pendingLoads.size > 0) await Promise.all([...pendingLoads])
}
const filteringListeners = new Set<(mode: TextureFilteringMode) => void>()

/** The three.js minification filter for a filtering mode. */
export function minFilterForMode(mode: TextureFilteringMode): THREE.MinificationTextureFilter {
  return mode === 'smooth' ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapLinearFilter
}

/** Current block texture filtering mode. */
export function getTextureFiltering(): TextureFilteringMode {
  return filteringMode
}

/**
 * Switch block texture filtering live: every texture loaded through
 * loadBlockTexture() is re-uploaded with the new minification filter, and
 * listeners (the chunk texture array) apply it to their own textures.
 */
export function setTextureFiltering(mode: TextureFilteringMode): void {
  if (mode === filteringMode) return
  filteringMode = mode
  const minFilter = minFilterForMode(mode)
  for (const texture of loadedTextures) {
    texture.minFilter = minFilter
    // Filters are applied at upload; skip textures whose image hasn't loaded
    if (texture.image) texture.needsUpdate = true
  }
  for (const listener of filteringListeners) listener(mode)
}

/** Be told when the filtering mode changes. */
export function onTextureFilteringChange(listener: (mode: TextureFilteringMode) => void): void {
  filteringListeners.add(listener)
}

// Anisotropy level (4, 8, or 16 typical). Will be clamped to max supported.
let anisotropyLevel = 16

/**
 * Anisotropy forced onto the NEAREST-magnified textures of this loader (0 =
 * none), and the renderer whose context they live in. See
 * enableNearestTextureAnisotropy.
 */
let nearestAnisotropy = 0
let anisotropyRenderer: THREE.WebGLRenderer | null = null

/**
 * Set the anisotropic filtering level (4, 8, 16).
 * Takes effect on textures loaded after this call.
 */
export function setAnisotropy(level: number): void {
  anisotropyLevel = level
}

/**
 * Get current anisotropy level.
 */
export function getAnisotropy(): number {
  return anisotropyLevel
}

/**
 * Anisotropic filtering for the NEAREST-magnified textures of this loader.
 *
 * three.js never applies `texture.anisotropy` to a NEAREST-magnified texture,
 * because some backends (ANGLE's Direct3D 11 on Windows, SwiftShader) then
 * interpolate magnified texels too and pixel art blurs up close. Where the
 * backend keeps NEAREST magnification crisp (checked once by rendering a
 * probe, see anisotropyProbe.ts) the anisotropy is set on each GL texture
 * directly: now for textures already on the GPU, and right after every later
 * upload (onUpdate: first upload, filtering switch, context restore).
 * Elsewhere these textures stay at anisotropy 1, exactly as three.js leaves
 * them. (Textures sampled through crispTexelSampling.ts - the chunk texture
 * array, liquids - magnify linearly and get anisotropy on every backend.)
 */
export function enableNearestTextureAnisotropy(renderer: THREE.WebGLRenderer): void {
  anisotropyRenderer = renderer
  nearestAnisotropy = 0
  if (!renderer.extensions.has('EXT_texture_filter_anisotropic')) return
  const level = Math.min(anisotropyLevel, renderer.capabilities.getMaxAnisotropy())
  if (level <= 1) return
  if (!nearestMagnificationSurvivesAnisotropy(renderer, level)) {
    console.info('[TextureLoader] This GPU backend blurs NEAREST magnification under anisotropic filtering: pixel-art block textures keep anisotropy 1')
    return
  }
  nearestAnisotropy = level

  const gl = renderer.getContext()
  for (const texture of loadedTextures) {
    const glTexture = (renderer.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture
    if (!glTexture) continue // not uploaded yet: onUpdate applies it
    renderer.state.bindTexture(gl.TEXTURE_2D, glTexture)
    applyNearestAnisotropy(texture)
    renderer.state.unbindTexture()
  }
}

/** texture.onUpdate: set the anisotropy of the texture bound to TEXTURE_2D (right after its upload). */
function applyNearestAnisotropy(texture: THREE.Texture): void {
  if (nearestAnisotropy <= 1 || !anisotropyRenderer || texture.magFilter !== THREE.NearestFilter) return
  const extension = anisotropyRenderer.extensions.get('EXT_texture_filter_anisotropic')
  const gl = anisotropyRenderer.getContext()
  gl.texParameterf(gl.TEXTURE_2D, extension.TEXTURE_MAX_ANISOTROPY_EXT, nearestAnisotropy)
}

/**
 * Load a texture with proper voxel-game filtering settings.
 * - Nearest mag filter (pixelated up close)
 * - Mipmap min filter (crisp or smooth, following setTextureFiltering)
 * - Anisotropic filtering (better at angles) where the backend keeps nearest
 *   magnification crisp with it (enableNearestTextureAnisotropy)
 *
 * Returns a dummy texture in worker context (no document).
 */
export function loadBlockTexture(url: string): THREE.Texture {
  // Workers don't have document - return dummy texture
  if (typeof document === 'undefined') {
    return new THREE.Texture()
  }

  let settle: () => void = () => {}
  const pending = new Promise<void>((resolve) => { settle = resolve })
  pendingLoads.add(pending)
  const done = (): void => {
    pendingLoads.delete(pending)
    settle()
  }
  const texture = loader.load(url, done, undefined, done)

  // Keep pixelated look when magnified (close up)
  texture.magFilter = THREE.NearestFilter

  // Use mipmaps for minification (far away) - reduces shimmering
  texture.minFilter = minFilterForMode(filteringMode)
  loadedTextures.add(texture)

  // Ensure mipmaps are generated
  texture.generateMipmaps = true

  // Anisotropic filtering for better quality at oblique angles. three.js
  // ignores this value for NEAREST magnification; onUpdate forces it where
  // the backend allows (enableNearestTextureAnisotropy). A texture switched
  // to linear magnification (sampled with crispTexelSampling.ts) gets it
  // from three.js.
  texture.anisotropy = anisotropyLevel
  texture.onUpdate = applyNearestAnisotropy

  // Proper color space
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}
