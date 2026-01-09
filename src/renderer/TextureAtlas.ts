import * as THREE from 'three'
import { TextureId } from '../world/blocks/FaceTextureRegistry.ts'
import { getAnisotropy } from './TextureLoader.ts'

/**
 * UV region within the texture atlas.
 * Coordinates are normalized (0-1).
 */
export interface AtlasRegion {
  u0: number  // Left edge
  v0: number  // Bottom edge
  u1: number  // Right edge
  v1: number  // Top edge
}

/**
 * Result of building the texture atlas.
 */
export interface TextureAtlasResult {
  opaqueTexture: THREE.CanvasTexture
  transparentTexture: THREE.CanvasTexture | null
  regions: Map<number, AtlasRegion>
}

// Texture size (all textures assumed to be this size)
const TEXTURE_SIZE = 64
// Padding between textures to prevent bleeding at mipmap levels
const PADDING = 4

// Registered texture URLs
const textureUrls = new Map<TextureId, string>()
// Which textures are transparent (need separate atlas)
const transparentTextures = new Set<TextureId>()

// Global atlas instance
let globalAtlas: TextureAtlasResult | null = null

/**
 * Register a texture URL for atlas building.
 * Call this from block files during module initialization.
 */
export function registerTextureUrl(
  textureId: TextureId,
  url: string,
  isTransparent: boolean = false
): void {
  textureUrls.set(textureId, url)
  if (isTransparent) {
    transparentTextures.add(textureId)
  }
}

/**
 * Get all registered texture URLs.
 */
export function getTextureUrls(): Map<TextureId, string> {
  return textureUrls
}

/**
 * Load an image from a URL.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/**
 * Build the texture atlas from all registered textures.
 */
export async function buildTextureAtlas(): Promise<TextureAtlasResult> {
  // Separate opaque and transparent textures
  const opaqueEntries: Array<[TextureId, string]> = []
  const transparentEntries: Array<[TextureId, string]> = []

  for (const [id, url] of textureUrls.entries()) {
    if (id === TextureId.AIR) continue // Skip air
    if (transparentTextures.has(id)) {
      transparentEntries.push([id, url])
    } else {
      opaqueEntries.push([id, url])
    }
  }

  const regions = new Map<number, AtlasRegion>()

  // Build opaque atlas
  const opaqueTexture = await buildAtlasTexture(opaqueEntries, regions, false)

  // Build transparent atlas if we have transparent textures
  let transparentTexture: THREE.CanvasTexture | null = null
  if (transparentEntries.length > 0) {
    transparentTexture = await buildAtlasTexture(transparentEntries, regions, true)
  }

  const result: TextureAtlasResult = {
    opaqueTexture,
    transparentTexture,
    regions,
  }

  globalAtlas = result
  return result
}

/**
 * Build a single atlas texture from entries.
 */
async function buildAtlasTexture(
  entries: Array<[TextureId, string]>,
  regions: Map<number, AtlasRegion>,
  isTransparent: boolean
): Promise<THREE.CanvasTexture> {
  const count = entries.length
  if (count === 0) {
    // Return a tiny placeholder
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    return new THREE.CanvasTexture(canvas)
  }

  // Calculate grid size (square-ish)
  const gridSize = Math.ceil(Math.sqrt(count))
  const cellSize = TEXTURE_SIZE + PADDING * 2
  const atlasSize = nextPowerOf2(gridSize * cellSize)

  // Create canvas
  const canvas = document.createElement('canvas')
  canvas.width = atlasSize
  canvas.height = atlasSize
  const ctx = canvas.getContext('2d', { alpha: true })!

  // Disable image smoothing for pixel-perfect rendering
  ctx.imageSmoothingEnabled = false

  // For transparent textures, ensure we start with a fully transparent canvas
  if (isTransparent) {
    ctx.clearRect(0, 0, atlasSize, atlasSize)
  }

  // Load all images in parallel
  const loadPromises = entries.map(async ([id, url]) => {
    const img = await loadImage(url)
    return { id, img }
  })

  const loaded = await Promise.all(loadPromises)

  // Draw each texture to the atlas
  for (let i = 0; i < loaded.length; i++) {
    const { id, img } = loaded[i]
    const gridX = i % gridSize
    const gridY = Math.floor(i / gridSize)

    // Position with padding
    const x = gridX * cellSize + PADDING
    const y = gridY * cellSize + PADDING

    // Draw the main texture
    ctx.drawImage(img, x, y, TEXTURE_SIZE, TEXTURE_SIZE)

    // Draw padding pixels (extend edge pixels to prevent bleeding)
    // Only for opaque textures - transparent textures don't need padding
    // as mipmaps will be disabled
    if (!isTransparent) {
      // Top edge
      ctx.drawImage(img, 0, 0, TEXTURE_SIZE, 1, x, y - PADDING, TEXTURE_SIZE, PADDING)
      // Bottom edge
      ctx.drawImage(img, 0, TEXTURE_SIZE - 1, TEXTURE_SIZE, 1, x, y + TEXTURE_SIZE, TEXTURE_SIZE, PADDING)
      // Left edge
      ctx.drawImage(img, 0, 0, 1, TEXTURE_SIZE, x - PADDING, y, PADDING, TEXTURE_SIZE)
      // Right edge
      ctx.drawImage(img, TEXTURE_SIZE - 1, 0, 1, TEXTURE_SIZE, x + TEXTURE_SIZE, y, PADDING, TEXTURE_SIZE)
    }

    // Calculate UV region (normalized coordinates)
    // Add small inset to avoid sampling padding
    const halfPixel = 0.5 / atlasSize
    // With flipY = false: low V = canvas top, high V = canvas bottom
    // AtlasRegion convention: v0 = bottom of texture, v1 = top of texture
    // So v0 = high canvas Y = high V, v1 = low canvas Y = low V
    const region: AtlasRegion = {
      u0: x / atlasSize + halfPixel,
      v0: (y + TEXTURE_SIZE) / atlasSize - halfPixel,  // bottom of texture = high V
      u1: (x + TEXTURE_SIZE) / atlasSize - halfPixel,
      v1: y / atlasSize + halfPixel,  // top of texture = low V
    }
    regions.set(id, region)
  }

  // Create THREE.js texture
  const texture = new THREE.CanvasTexture(canvas)
  texture.flipY = false  // Don't flip - UV coords match canvas coords directly
  texture.magFilter = THREE.NearestFilter

  if (isTransparent) {
    // For transparent textures, don't use mipmaps as they cause color bleeding
    // at transparent pixel boundaries
    texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
  } else {
    texture.minFilter = THREE.NearestMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = getAnisotropy()
  }

  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  return texture
}

/**
 * Get the next power of 2 >= n.
 */
function nextPowerOf2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)))
}

/**
 * Get the global texture atlas.
 * Must be initialized first via buildTextureAtlas().
 */
export function getTextureAtlas(): TextureAtlasResult | null {
  return globalAtlas
}

/**
 * Check if a texture ID is transparent.
 */
export function isTransparentTexture(textureId: TextureId): boolean {
  return transparentTextures.has(textureId)
}

/**
 * Serialize atlas regions for transfer to workers.
 */
export function serializeAtlasRegions(): Array<[number, AtlasRegion]> {
  if (!globalAtlas) return []
  return Array.from(globalAtlas.regions.entries())
}

/**
 * Check if atlas has been built.
 */
export function isAtlasReady(): boolean {
  return globalAtlas !== null
}
