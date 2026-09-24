import { TextureId } from '../world/blocks/FaceTextureRegistry.ts'

/**
 * Registry of block face texture URLs, filled by block modules at import time.
 *
 * Consumers build their GPU resources from it: BlockTextureArray.ts (the
 * greedy chunk mesh texture array) and anything else that needs per-texture
 * data (e.g. average colours). The module keeps its historical name because
 * every block file imports registerTextureUrl from here. Whether a face is
 * alpha-tested is decided per block (`opaque` in the mesh worker), not here.
 */

// Registered texture URLs
const textureUrls = new Map<TextureId, string>()

/**
 * Register a texture URL for a TextureId.
 * Call this from block files during module initialization.
 */
export function registerTextureUrl(textureId: TextureId, url: string): void {
  textureUrls.set(textureId, url)
}

/**
 * Get all registered texture URLs.
 */
export function getTextureUrls(): Map<TextureId, string> {
  return textureUrls
}
