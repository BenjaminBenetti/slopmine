import * as THREE from 'three'
import { TextureId } from '../world/blocks/FaceTextureRegistry.ts'
import { getTextureUrls } from './TextureAtlas.ts'
import {
  enableNearestTextureAnisotropy, getAnisotropy, getTextureFiltering, minFilterForMode, onTextureFilteringChange,
} from './TextureLoader.ts'
import { CHUNK_MAX_TEXTURE_LAYER } from './ChunkVertexFormat.ts'

/**
 * Block face textures for greedy chunk meshes as one THREE.DataArrayTexture:
 * one 64×64 RGBA layer per TextureId. Because every texture owns a whole
 * layer, the sampler's RepeatWrapping tiles it across merged quads (UVs are in
 * block units) and mip levels never bleed between textures — no atlas
 * padding or UV inset needed.
 *
 * Texels with alpha 0 get their RGB dilated from the nearest visible texels,
 * so mipmaps of cutout textures (leaves) keep their colour instead of
 * averaging in black.
 */

/** Edge length of every layer; source images are scaled to it (nearest). */
export const BLOCK_TEXTURE_SIZE = 64

/** Layer 0 is a magenta/black checker shown for faces with no texture. */
export const MISSING_TEXTURE_LAYER = 0

export interface BlockTextureArray {
  readonly texture: THREE.DataArrayTexture
  /** TextureId → layer index */
  readonly layers: ReadonlyMap<number, number>
}

let globalTextureArray: BlockTextureArray | null = null

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function writeMissingTexture(data: Uint8Array, offset: number): void {
  const half = BLOCK_TEXTURE_SIZE / 2
  for (let y = 0; y < BLOCK_TEXTURE_SIZE; y++) {
    for (let x = 0; x < BLOCK_TEXTURE_SIZE; x++) {
      const magenta = (x < half) !== (y < half)
      const o = offset + (y * BLOCK_TEXTURE_SIZE + x) * 4
      data[o] = magenta ? 255 : 0
      data[o + 1] = 0
      data[o + 2] = magenta ? 255 : 0
      data[o + 3] = 255
    }
  }
}

/**
 * Copy an image into a layer, flipping rows so layer row 0 is the image's
 * bottom (texture v points up the face, like a flipY texture).
 */
function writeImageLayer(ctx: CanvasRenderingContext2D, img: HTMLImageElement, data: Uint8Array, offset: number): void {
  const size = BLOCK_TEXTURE_SIZE
  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(img, 0, 0, size, size)
  const pixels = ctx.getImageData(0, 0, size, size).data
  const rowBytes = size * 4
  for (let row = 0; row < size; row++) {
    const src = row * rowBytes
    data.set(pixels.subarray(src, src + rowBytes), offset + (size - 1 - row) * rowBytes)
  }
}

/**
 * Fill the RGB of fully transparent texels from their visible neighbours,
 * growing outward one ring per pass (wrapping, since layers repeat).
 */
function dilateTransparentTexels(data: Uint8Array, offset: number): void {
  const size = BLOCK_TEXTURE_SIZE
  const texels = size * size
  const filled = new Uint8Array(texels)
  let filledCount = 0
  for (let i = 0; i < texels; i++) {
    if (data[offset + i * 4 + 3] > 0) {
      filled[i] = 1
      filledCount++
    }
  }
  if (filledCount === 0 || filledCount === texels) return

  const frontier: number[] = []
  while (filledCount < texels) {
    frontier.length = 0
    for (let i = 0; i < texels; i++) {
      if (filled[i] === 1) continue
      const x = i % size
      const y = (i / size) | 0
      let r = 0, g = 0, b = 0, n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const j = ((y + dy + size) % size) * size + ((x + dx + size) % size)
          if (filled[j] !== 1) continue
          const o = offset + j * 4
          r += data[o]
          g += data[o + 1]
          b += data[o + 2]
          n++
        }
      }
      if (n === 0) continue
      const o = offset + i * 4
      data[o] = Math.round(r / n)
      data[o + 1] = Math.round(g / n)
      data[o + 2] = Math.round(b / n)
      frontier.push(i)
    }
    if (frontier.length === 0) break
    for (const i of frontier) filled[i] = 1
    filledCount += frontier.length
  }
}

/**
 * Build the block texture array.
 *
 * @param textureIds TextureIds to include (those sampled by greedy faces).
 *   Ids without a registered URL, or whose image fails to load, map to the
 *   missing-texture layer.
 */
export async function buildBlockTextureArray(textureIds: Iterable<number>): Promise<BlockTextureArray> {
  const urls = getTextureUrls()
  const entries: Array<[number, string]> = []
  for (const id of new Set(textureIds)) {
    if (id === TextureId.AIR) continue
    const url = urls.get(id)
    if (url) entries.push([id, url])
  }
  entries.sort((a, b) => a[0] - b[0])

  const layerCount = entries.length + 1
  if (layerCount - 1 > CHUNK_MAX_TEXTURE_LAYER) {
    throw new Error(`Block texture array needs ${layerCount} layers; the chunk vertex format stores at most ${CHUNK_MAX_TEXTURE_LAYER + 1}`)
  }

  const layerBytes = BLOCK_TEXTURE_SIZE * BLOCK_TEXTURE_SIZE * 4
  const data = new Uint8Array(layerBytes * layerCount)
  writeMissingTexture(data, MISSING_TEXTURE_LAYER * layerBytes)

  const images = await Promise.all(entries.map(async ([id, url]) => {
    try {
      return await loadImage(url)
    } catch {
      console.warn(`Block texture ${id} failed to load: ${url}`)
      return null
    }
  }))

  const canvas = document.createElement('canvas')
  canvas.width = BLOCK_TEXTURE_SIZE
  canvas.height = BLOCK_TEXTURE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = false

  const layers = new Map<number, number>()
  for (let i = 0; i < entries.length; i++) {
    const img = images[i]
    const layer = i + 1
    const offset = layer * layerBytes
    if (img) {
      writeImageLayer(ctx, img, data, offset)
      dilateTransparentTexels(data, offset)
    } else {
      writeMissingTexture(data, offset)
    }
    layers.set(entries[i][0], layer)
  }

  const texture = new THREE.DataArrayTexture(data, BLOCK_TEXTURE_SIZE, BLOCK_TEXTURE_SIZE, layerCount)
  texture.format = THREE.RGBAFormat
  texture.type = THREE.UnsignedByteType
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  // Pixel-crisp up close: the chunk shader snaps its samples to texel centres
  // (crispTexelSampling.ts), so magnification is linear here - three.js then
  // applies the anisotropy (it skips NEAREST-magnified textures, whose
  // anisotropy blurs magnified texels on ANGLE/Direct3D 11). Minification
  // follows the Texture Filtering setting (crisp: nearest texel per mip
  // level; smooth: trilinear). The alpha dilation above keeps cutout mips
  // from averaging in black either way.
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = minFilterForMode(getTextureFiltering())
  texture.generateMipmaps = true
  texture.anisotropy = getAnisotropy()
  texture.needsUpdate = true

  globalTextureArray = { texture, layers }
  onTextureFilteringChange((mode) => {
    texture.minFilter = minFilterForMode(mode)
    texture.needsUpdate = true // re-upload with the new filter
  })
  return globalTextureArray
}

/**
 * Get the block texture array (null until buildBlockTextureArray resolves).
 */
export function getBlockTextureArray(): BlockTextureArray | null {
  return globalTextureArray
}

/**
 * Serialize TextureId → layer for transfer to mesh workers.
 */
export function serializeTextureLayers(): Array<[number, number]> {
  return globalTextureArray ? Array.from(globalTextureArray.layers.entries()) : []
}

/**
 * Renderer hook (WorldManager.setRenderer): anisotropic filtering for block
 * textures. The array itself needs nothing - three.js applies its anisotropy,
 * because its magnification is linear (made crisp in the shader). The
 * NEAREST-magnified textures of loadBlockTexture (instanced blocks, held
 * items) get it where the backend keeps them crisp with it.
 */
export function applyBlockTextureAnisotropy(renderer: THREE.WebGLRenderer): void {
  enableNearestTextureAnisotropy(renderer)
}
