import * as THREE from 'three'

/**
 * Shared texture loader with proper filtering settings for voxel games.
 * - NearestFilter for magFilter keeps pixelated look when close
 * - NearestMipmapLinearFilter uses mipmaps for better distance rendering
 * - Anisotropic filtering improves quality at oblique angles
 */

const loader = new THREE.TextureLoader()

// Anisotropy level (4, 8, or 16 typical). Will be clamped to max supported.
let anisotropyLevel = 16

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
 * Load a texture with proper voxel-game filtering settings.
 * - Nearest mag filter (pixelated up close)
 * - Mipmap min filter (smooth at distance)
 * - Anisotropic filtering (better at angles)
 */
export function loadBlockTexture(url: string): THREE.Texture {
  const texture = loader.load(url)

  // Keep pixelated look when magnified (close up)
  texture.magFilter = THREE.NearestFilter

  // Use mipmaps for minification (far away) - reduces shimmering
  texture.minFilter = THREE.NearestMipmapLinearFilter

  // Ensure mipmaps are generated
  texture.generateMipmaps = true

  // Anisotropic filtering for better quality at oblique angles
  texture.anisotropy = anisotropyLevel

  // Proper color space
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}
