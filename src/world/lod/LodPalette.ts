import { BlockFace, type IBlock } from '../interfaces/IBlock.ts'
import { buildFaceTextureMap, getFaceTextureId } from '../blocks/FaceTextureRegistry.ts'
import { BlockTags } from '../blocks/tags/BlockTags.ts'
import type { LodPaletteData } from './LodTypes.ts'
import { linearToSrgbByte, srgbByteToLinear } from './srgb.ts'

/** sRGB colour, 0-255 per channel. */
export type RgbTriplet = readonly [number, number, number]

/** Pixels at or above this alpha count as visible (the alpha-test cutoff). */
const VISIBLE_ALPHA = 128

/*
 * LOD faces have no AO, holes or translucency, so the palette carries the
 * average look of the full-detail surfaces they stand in for. The factors
 * below were matched against full detail by rendering the same views both
 * ways (plains, pine, jungle, desert, coastal, volcanic, swamp) and
 * comparing mean colours per surface type - for leaves and liquids per
 * block, over the pixels whose full-detail ray hits that block at 100-180
 * blocks. Shades multiply sRGB values.
 */

/**
 * Canopy shade per leaf block (by block name; others LEAF_SHADE). Alpha-
 * tested canopies read differently per leaf type - hole pattern, texture
 * contrast, crown shape (dense redwood clusters, snow-dusted cones) - so one
 * factor (0.9) left jungle (oak) and pine canopies ~20% and redwood / snowy
 * pine ~33% darker in LOD than in full detail.
 */
const LEAF_SHADE = 1.0
const LEAF_SHADES: Readonly<Record<string, number>> = {
  oak_leaves: 1.04,
  pine_needles: 1.0,
  redwood_leaves: 1.1,
  snowy_pine_needles: 1.07,
}

/**
 * Side walls: full-detail walls are mostly 1-3 block terrace steps whose
 * ambient occlusion darkens their lower half (and cliff feet).
 */
const SIDE_SHADE = 0.82

/** Tops: AO along every step edge darkens top faces slightly on average. */
const TOP_SHADE = 0.98

/**
 * Water-like liquids: full-detail water is translucent (the bed shows
 * through) and reflects the sky at glancing angles, so from afar it reads
 * greyer and lighter than its texture. Desaturate toward the texture's own
 * luminance by this much (linear), and brighten slightly. (Measured per
 * block, full-detail water and swamp water get lighter with distance as the
 * Fresnel reflection grows: this factor is about right at 100-180 blocks and
 * leaves LOD liquids ~15% darker beyond 180, where LOD takes over.)
 */
const LIQUID_DESATURATE = 0.5
const LIQUID_BRIGHTEN = 1.3

/** Glowing liquids (lava, light >= this): emissive in full detail. */
const GLOWING_LIQUID_MIN_LIGHT = 10
/** Linear brightening of glowing liquids (their emissive glow). */
const GLOWING_LIQUID_BRIGHTEN = 1.6

/** Fallback for blocks without a texture colour. */
const NEUTRAL_GREY: RgbTriplet = [128, 128, 128]

const SIDE_FACES = [BlockFace.NORTH, BlockFace.SOUTH, BlockFace.EAST, BlockFace.WEST]

/**
 * Average visible colour of RGBA pixels (sRGB in and out, averaged in linear
 * space). Counts pixels with alpha >= 128; a texture with none (e.g. a very
 * translucent liquid) is averaged weighted by alpha instead. Null when fully
 * transparent.
 */
export function averageTextureColor(rgba: ArrayLike<number>): RgbTriplet | null {
  let r = 0, g = 0, b = 0, count = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < VISIBLE_ALPHA) continue
    r += srgbByteToLinear(rgba[i])
    g += srgbByteToLinear(rgba[i + 1])
    b += srgbByteToLinear(rgba[i + 2])
    count++
  }
  if (count > 0) {
    return [linearToSrgbByte(r / count), linearToSrgbByte(g / count), linearToSrgbByte(b / count)]
  }

  let weight = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255
    r += srgbByteToLinear(rgba[i]) * alpha
    g += srgbByteToLinear(rgba[i + 1]) * alpha
    b += srgbByteToLinear(rgba[i + 2]) * alpha
    weight += alpha
  }
  if (weight === 0) return null
  return [linearToSrgbByte(r / weight), linearToSrgbByte(g / weight), linearToSrgbByte(b / weight)]
}

/** Linear-space mean of several colours (null entries skipped). */
function meanColor(colors: ReadonlyArray<RgbTriplet | null | undefined>): RgbTriplet | null {
  let r = 0, g = 0, b = 0, count = 0
  for (const color of colors) {
    if (!color) continue
    r += srgbByteToLinear(color[0])
    g += srgbByteToLinear(color[1])
    b += srgbByteToLinear(color[2])
    count++
  }
  if (count === 0) return null
  return [linearToSrgbByte(r / count), linearToSrgbByte(g / count), linearToSrgbByte(b / count)]
}

/**
 * Per-block LOD colours from per-texture average colours: top = the TOP face
 * texture, side = mean of the four side-face textures (face textures come
 * from the FaceTextureRegistry, the same mapping the greedy mesher uses).
 */
export function composeLodPalette(
  blockIds: readonly number[],
  getBlock: (id: number) => IBlock,
  textureColors: ReadonlyMap<number, RgbTriplet>
): LodPaletteData {
  const faceTextures = buildFaceTextureMap(getBlock, [...blockIds])
  const size = (blockIds.length > 0 ? Math.max(...blockIds) : 0) + 1
  const top = new Uint8Array(size * 3)
  const side = new Uint8Array(size * 3)

  for (const id of blockIds) {
    const properties = getBlock(id).properties
    const topColor = textureColors.get(getFaceTextureId(id, BlockFace.TOP, faceTextures))
    const sideColor = meanColor(SIDE_FACES.map((face) => textureColors.get(getFaceTextureId(id, face, faceTextures))))
    const shade = properties.tags.includes(BlockTags.LEAVES) ? (LEAF_SHADES[properties.name] ?? LEAF_SHADE) : 1
    const look = properties.isLiquid ? liquidLook(properties.lightLevel ?? 0) : null
    writeColor(top, id, applyLook(topColor ?? sideColor ?? NEUTRAL_GREY, look), shade * TOP_SHADE)
    writeColor(side, id, applyLook(sideColor ?? topColor ?? NEUTRAL_GREY, look), shade * SIDE_SHADE)
  }
  // A submerged plant (glowkelp) is its liquid from afar (LOD reads its cell as liquid)
  for (const id of blockIds) {
    const family = getBlock(id).properties.submergedIn
    const source = family ? blockIds.find((other) => {
      const p = getBlock(other).properties
      return p.isLiquid && p.liquidFamily === family && p.liquidLevel === 8 && !p.isFallingLiquid
    }) : undefined
    if (source === undefined) continue
    top.copyWithin(id * 3, source * 3, source * 3 + 3)
    side.copyWithin(id * 3, source * 3, source * 3 + 3)
  }
  return { top, side }
}

/** How a liquid's surface reads from afar: linear saturation and brightness. */
interface LiquidLook {
  readonly saturation: number
  readonly brightness: number
}

function liquidLook(lightLevel: number): LiquidLook {
  return lightLevel >= GLOWING_LIQUID_MIN_LIGHT
    ? { saturation: 1, brightness: GLOWING_LIQUID_BRIGHTEN }
    : { saturation: 1 - LIQUID_DESATURATE, brightness: LIQUID_BRIGHTEN }
}

function applyLook(color: RgbTriplet, look: LiquidLook | null): RgbTriplet {
  if (!look) return color
  const r = srgbByteToLinear(color[0])
  const g = srgbByteToLinear(color[1])
  const b = srgbByteToLinear(color[2])
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const k = look.brightness
  const t = look.saturation
  return [
    linearToSrgbByte((luma + (r - luma) * t) * k),
    linearToSrgbByte((luma + (g - luma) * t) * k),
    linearToSrgbByte((luma + (b - luma) * t) * k),
  ]
}

function writeColor(target: Uint8Array, id: number, color: RgbTriplet, shade: number): void {
  target[id * 3] = Math.min(255, Math.round(color[0] * shade))
  target[id * 3 + 1] = Math.min(255, Math.round(color[1] * shade))
  target[id * 3 + 2] = Math.min(255, Math.round(color[2] * shade))
}

/**
 * Load every registered block texture (TextureAtlas getTextureUrls()) and
 * build the LOD palette. Main thread only (decodes images through a canvas).
 */
export async function buildLodPalette(
  textureUrls: ReadonlyMap<number, string>,
  blockIds: readonly number[],
  getBlock: (id: number) => IBlock
): Promise<LodPaletteData> {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('2D canvas unavailable for LOD palette')

  const textureColors = new Map<number, RgbTriplet>()
  await Promise.all(
    [...textureUrls].map(async ([textureId, url]) => {
      const image = new Image()
      image.src = url
      try {
        await image.decode()
      } catch {
        console.warn(`[LodPalette] Failed to load texture ${textureId}: ${url}`)
        return
      }
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      const color = averageTextureColor(context.getImageData(0, 0, canvas.width, canvas.height).data)
      if (color) textureColors.set(textureId, color)
    })
  )
  return composeLodPalette(blockIds, getBlock, textureColors)
}
