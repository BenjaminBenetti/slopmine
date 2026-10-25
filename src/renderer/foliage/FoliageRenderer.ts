import * as THREE from 'three'
import type { FoliageSpec, IFoliageBlock } from '../../world/blocks/foliage/FoliageSpec.ts'
import { dilateTransparentTexels, loadImage, writeImageLayer } from '../BlockTextureArray.ts'
import { CRISP_TEXEL_SAMPLING_GLSL } from '../crispTexelSampling.ts'
import { DARK_GLOW_GLSL } from '../EmissiveTextures.ts'
import { glowTimeUniform } from '../glowClock.ts'
import { windUniform } from '../WindUniform.ts'
import { FLICKER_GLSL, flickerSourcesUniform } from '../FlickerLights.ts'
import { getAnisotropy, getTextureFiltering, minFilterForMode, onTextureFilteringChange } from '../TextureLoader.ts'
import {
  daylightUniform, LIGHT_CURVE_DEFINES_GLSL, lightFloorUniform, WORLD_LIGHT_FRAGMENT_PARS, worldLightFragment,
} from '../worldLightShader.ts'

/**
 * The batched foliage renderer: every foliage block (FoliageSpec - grass,
 * flowers, bushes, ground doodads) in a sub-chunk is ONE instanced draw, so
 * plant variety and density cost no extra draw calls.
 *
 * - Sprites live in one DataArrayTexture (a layer per sprite image), glow
 *   maps in a second (layer 0 black = no glow).
 * - Each mesh is an InstancedBufferGeometry of 3 quads - two crossed planes
 *   and one flat - where each instance keeps the planes of its shape and
 *   collapses the others to a point (zero area, never rasterized).
 * - Per instance, hashed from the cell: sprite variant, yaw, a small offset
 *   and size change, so a meadow never shows the block grid. Lit by world
 *   light levels like instanced blocks (normal straight up: a tuft shades
 *   like the ground it stands on), sways in the wind (tips only), fades out
 *   by its view distance; whole meshes beyond reach are hidden on the CPU.
 */

const SPRITE_SIZE = 64

/** Extra reach of a sub-chunk mesh beyond its centre (half diagonal + plant height). */
const MESH_RADIUS = 30

interface FoliageTextures {
  readonly sprites: THREE.DataArrayTexture
  readonly glow: THREE.DataArrayTexture
  readonly spriteLayers: ReadonlyMap<string, number>
  readonly glowLayers: ReadonlyMap<string, number>
}

let textures: FoliageTextures | null = null
let material: THREE.MeshLambertMaterial | null = null

/** View distance multiplier of every plant (Plants setting: 1 full, NEAR_SCALE near). */
const distanceScaleUniform = { value: 1 }
const NEAR_SCALE = 0.55
let foliageHidden = false

/**
 * Plants setting: 'full' draws every plant to its view distance, 'near' to a
 * little over half of it (much less overdraw), 'off' hides them all.
 */
export function setFoliageDetail(detail: 'full' | 'near' | 'off'): void {
  distanceScaleUniform.value = detail === 'near' ? NEAR_SCALE : 1
  foliageHidden = detail === 'off'
  if (material) material.visible = !foliageHidden
}

/** Per block id: its spec resolved to texture layers. */
interface FoliageDraw {
  readonly layers: readonly number[]
  readonly glowLayers: readonly number[]
  readonly shape: number
  readonly spec: FoliageSpec
  /** Signed glow strength: negative = dark only. */
  readonly glow: number
}
const draws = new Map<number, FoliageDraw>()

function configureArrayTexture(texture: THREE.DataArrayTexture): void {
  texture.format = THREE.RGBAFormat
  texture.type = THREE.UnsignedByteType
  texture.colorSpace = THREE.SRGBColorSpace
  // Clamped: a sprite's bottom row must not wrap to its (empty) top in the mips
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  // Crisp up close through slopCrispTexel, like the block texture array
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = minFilterForMode(getTextureFiltering())
  texture.generateMipmaps = true
  texture.anisotropy = getAnisotropy()
  texture.needsUpdate = true
}

async function buildLayers(urls: readonly string[], dilate: boolean): Promise<{ texture: THREE.DataArrayTexture; layers: Map<string, number> }> {
  const layerBytes = SPRITE_SIZE * SPRITE_SIZE * 4
  const data = new Uint8Array(layerBytes * (urls.length + 1)) // layer 0 transparent black
  const images = await Promise.all(urls.map(async (url) => {
    try {
      return await loadImage(url)
    } catch {
      console.warn(`Foliage sprite failed to load: ${url}`)
      return null
    }
  }))
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_SIZE
  canvas.height = SPRITE_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = false
  const layers = new Map<string, number>()
  urls.forEach((url, i) => {
    const img = images[i]
    const offset = (i + 1) * layerBytes
    if (img) {
      writeImageLayer(ctx, img, data, offset)
      if (dilate) dilateTransparentTexels(data, offset)
    }
    layers.set(url, i + 1)
  })
  const texture = new THREE.DataArrayTexture(data, SPRITE_SIZE, SPRITE_SIZE, urls.length + 1)
  configureArrayTexture(texture)
  return { texture, layers }
}

/**
 * Load every foliage block's sprites (and glow maps) into the foliage
 * texture arrays. Call once, after blocks are registered and before any
 * sub-chunk is meshed. Returns the sprite count.
 */
export async function buildFoliageTextures(blocks: Iterable<IFoliageBlock>): Promise<number> {
  const spriteUrls = new Set<string>()
  const glowUrls = new Set<string>()
  for (const block of blocks) {
    for (const url of block.foliage.sprites) spriteUrls.add(url)
    for (const url of block.foliage.glowSprites ?? []) glowUrls.add(url)
  }
  const [sprites, glow] = await Promise.all([buildLayers([...spriteUrls], true), buildLayers([...glowUrls], false)])
  textures = { sprites: sprites.texture, glow: glow.texture, spriteLayers: sprites.layers, glowLayers: glow.layers }
  draws.clear()
  onTextureFilteringChange((mode) => {
    for (const t of [sprites.texture, glow.texture]) {
      t.minFilter = minFilterForMode(mode)
      t.needsUpdate = true
    }
  })
  if (material) {
    material.userData.shaderUniforms.uFoliageSprites.value = sprites.texture
    material.userData.shaderUniforms.uFoliageGlow.value = glow.texture
  }
  return spriteUrls.size
}

const VERTEX_PARS = /* glsl */ `
attribute vec3 aOffset;
attribute vec4 aSprite;
attribute vec4 aShape;
attribute vec2 aGlow;
attribute vec2 aLight;
attribute float aVertShape;
uniform float uFoliageTime;
uniform vec3 uWind;
uniform float uFoliageDistanceScale;
varying vec3 vFoliageUv;
varying vec2 vFoliageLight;
varying vec2 vFoliageGlow;
varying vec3 vFoliageFlicker;
${FLICKER_GLSL}
`

// aOffset: base centre (sub-chunk local). aSprite: layer, yaw, width, height.
// aShape: shape (0 cross, 1 flat, 2 hang), sway, view distance, sprite height share.
// aGlow: glow layer, signed strength (negative = dark only). aLight: sky, block.
const BEGIN_VERTEX = /* glsl */ `
vec3 transformed = aOffset;
{
  vec4 foliageView = modelViewMatrix * vec4( aOffset, 1.0 );
  float reach = aShape.z * uFoliageDistanceScale;
  float fade = 1.0 - smoothstep( reach * 0.65, reach, length( foliageView.xyz ) );
  // The other shape's planes collapse to a point: zero area, never rasterized
  // (hanging plants use the crossed planes)
  float hang = step( 1.5, aShape.x );
  float flatShape = step( 0.5, aShape.x ) - hang;
  float keep = fade * step( abs( aVertShape - flatShape ), 0.5 );
  vec3 p = position;
  p.xz *= aSprite.z * keep;
  // Hanging: the plane's top at the cell ceiling, its tip aSprite.w below
  p.y = ( p.y * aSprite.w + hang * ( 1.0 - aSprite.w ) ) * keep;
  float c = cos( aSprite.y );
  float s = sin( aSprite.y );
  p.xz = vec2( c * p.x - s * p.z, s * p.x + c * p.z );
  // Wind: the tips sway, the base stays put; slow gusts roll across the land
  vec3 foliageWorld = ( modelMatrix * vec4( aOffset, 1.0 ) ).xyz;
  float t = uFoliageTime;
  // The weather's wind (WindUniform.ts): stronger winds bend further, flutter faster and lean downwind
  float windStrength = uWind.z;
  float gust = 0.55 + 0.45 * sin( t * ( 0.5 + windStrength ) + foliageWorld.x * 0.05 + foliageWorld.z * 0.035 );
  float phase = foliageWorld.x * 0.73 + foliageWorld.z * 0.51;
  float flutterRate = 1.0 + 1.6 * windStrength;
  vec2 wind = vec2( sin( t * 1.8 * flutterRate + phase ), sin( t * 1.37 * flutterRate + phase * 1.31 + 1.7 ) ) * ( 0.06 + 0.1 * windStrength )
    + uWind.xy * ( 0.03 + 0.2 * windStrength );
  // Free ends sway: the tips of standing plants, the bottoms of hanging ones
  float freeEnd = mix( position.y, 1.0 - position.y, hang );
  float bend = aShape.y * freeEnd * freeEnd * ( 1.0 - aVertShape );
  p.xz += wind * ( gust * bend * aSprite.w * keep );
  p.y += aVertShape * 0.015 * keep;
  transformed += p;
  float spriteV = mix( uv.y * aShape.w, 1.0 - aShape.w + uv.y * aShape.w, hang );
  vFoliageUv = vec3( uv.x, mix( spriteV, uv.y, aVertShape ), aSprite.x );
  vFoliageLight = aLight;
  vFoliageFlicker = slopFlicker( foliageWorld );
  vFoliageGlow = aGlow;
}
`

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2DArray uFoliageSprites;
uniform sampler2DArray uFoliageGlow;
varying vec3 vFoliageUv;
varying vec2 vFoliageLight;
varying vec2 vFoliageGlow;
varying vec3 vFoliageFlicker;
${LIGHT_CURVE_DEFINES_GLSL}
${WORLD_LIGHT_FRAGMENT_PARS}
${DARK_GLOW_GLSL}
${CRISP_TEXEL_SAMPLING_GLSL}
`

const EMISSIVE_FRAGMENT = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 foliageGlow = slopCrispTexel( uFoliageGlow, vec3( vFoliageUv.xy, vFoliageGlow.x ) ).rgb;
  float glowDark = vFoliageGlow.y < 0.0 ? slopDarkGlow( slopLightShape( vFoliageLight.x ) * uDaylight ) : 1.0;
  totalEmissiveRadiance += foliageGlow * abs( vFoliageGlow.y ) * glowDark;
}
`

/** The one shared foliage material (null until the textures are built). */
export function getFoliageMaterial(): THREE.Material | null {
  if (!textures) return null
  if (material) return material
  const uniforms = {
    uFoliageSprites: { value: textures.sprites },
    uFoliageGlow: { value: textures.glow },
    uFoliageTime: glowTimeUniform,
    uWind: windUniform,
    uFoliageDistanceScale: distanceScaleUniform,
    uDaylight: daylightUniform,
    uLightFloor: lightFloorUniform,
    uFlickerSources: flickerSourcesUniform,
  }
  material = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    alphaToCoverage: true,
  })
  material.name = 'FoliageMaterial'
  material.visible = !foliageHidden
  material.userData.shaderUniforms = uniforms
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
      .replace('#include <begin_vertex>', BEGIN_VERTEX)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <map_fragment>', 'diffuseColor *= slopCrispTexel( uFoliageSprites, vFoliageUv );')
      .replace('#include <emissivemap_fragment>', EMISSIVE_FRAGMENT)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>\n${worldLightFragment('vFoliageLight.x', 'vFoliageLight.y', '1.0', 'vFoliageFlicker')}`)
  }
  material.customProgramCacheKey = () => 'slopmine-foliage-v2'
  return material
}

function getDraw(blockId: number, block: IFoliageBlock): FoliageDraw | null {
  const cached = draws.get(blockId)
  if (cached) return cached
  if (!textures) return null
  const spec = block.foliage
  const layers = spec.sprites.map((url) => textures!.spriteLayers.get(url) ?? 0)
  const glowLayers = spec.sprites.map((_, i) => {
    const url = spec.glowSprites?.[i]
    return url ? textures!.glowLayers.get(url) ?? 0 : 0
  })
  const strength = spec.glowStrength ?? 1
  const draw: FoliageDraw = {
    layers,
    glowLayers,
    shape: spec.shape === 'flat' ? 1 : spec.shape === 'hang' ? 2 : 0,
    spec,
    glow: spec.darkOnlyGlow ? -strength : strength,
  }
  draws.set(blockId, draw)
  return draw
}

/** 32-bit hash of a block cell, for per-instance variation. */
function hashCell(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Base quads: two crossed planes (shape 0) and one flat square (shape 1), unit size. */
function createBaseAttributes(geometry: THREE.InstancedBufferGeometry): void {
  const r = 0.5
  const positions = new Float32Array([
    // plane A (corner to corner at width 1)
    -r, 0, -r, r, 0, r, r, 1, r, -r, 1, -r,
    // plane B
    -r, 0, r, r, 0, -r, r, 1, -r, -r, 1, r,
    // flat square
    -r, 0, r, r, 0, r, r, 0, -r, -r, 0, -r,
  ])
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1])
  const shapes = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1])
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setAttribute('aVertShape', new THREE.BufferAttribute(shapes, 1))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11])
}

function releaseArrayAfterUpload(this: { array: ArrayLike<number> | null }): void {
  this.array = null
}

function instanceAttribute(array: Float32Array, size: number): THREE.InstancedBufferAttribute {
  const attribute = new THREE.InstancedBufferAttribute(array, size)
  attribute.onUpload(releaseArrayAfterUpload)
  return attribute
}

/** Foliage meshes in the scene, hidden on the CPU beyond their reach. */
const liveMeshes = new Set<THREE.Mesh>()

/**
 * Collects a sub-chunk's foliage instances (one entry per foliage block id
 * from the mesh worker's non-greedy lists) and builds its single mesh.
 */
export class FoliageBatch {
  private readonly groups: Array<{ blockId: number; block: IFoliageBlock; positions: Float32Array; lights: Uint8Array }> = []
  private count = 0

  add(blockId: number, block: IFoliageBlock, positions: Float32Array, lights: Uint8Array): void {
    this.groups.push({ blockId, block, positions, lights })
    this.count += positions.length / 3
  }

  /**
   * Build the mesh, placed at the sub-chunk origin (positions are world cell
   * corners). Null when empty or the foliage textures aren't built.
   */
  build(originX: number, originY: number, originZ: number): THREE.Mesh | null {
    const mat = getFoliageMaterial()
    if (this.count === 0 || !mat) return null
    const n = this.count
    const offsets = new Float32Array(n * 3)
    const sprites = new Float32Array(n * 4)
    const shapes = new Float32Array(n * 4)
    const glows = new Float32Array(n * 2)
    const lights = new Float32Array(n * 2)
    let reach = 0
    let i = 0
    for (const group of this.groups) {
      const draw = getDraw(group.blockId, group.block)
      if (!draw) continue
      const spec = draw.spec
      reach = Math.max(reach, spec.viewDistance)
      const variants = draw.layers.length
      const sprite = spec.shape === 'flat' ? 1 : spec.spriteHeight ?? spec.height
      for (let j = 0; j < group.positions.length / 3; j++, i++) {
        const x = group.positions[j * 3]
        const y = group.positions[j * 3 + 1]
        const z = group.positions[j * 3 + 2]
        let h = hashCell(x, y, z)
        const variant = h % variants
        h = hashCell(h, x, 7)
        const yaw = (h & 0xffff) / 0x10000 * Math.PI * 2
        const jx = (((h >>> 16) & 0xff) / 255 - 0.5) * 2 * spec.jitter
        const jz = (((h >>> 24) & 0xff) / 255 - 0.5) * 2 * spec.jitter
        h = hashCell(h, z, 13)
        const scale = 1 + ((h & 0xffff) / 0xffff - 0.5) * 2 * spec.scaleVariation

        offsets[i * 3] = x + 0.5 + jx - originX
        offsets[i * 3 + 1] = y + (spec.baseHeight ?? 0) - originY
        offsets[i * 3 + 2] = z + 0.5 + jz - originZ
        sprites[i * 4] = draw.layers[variant]
        sprites[i * 4 + 1] = yaw
        sprites[i * 4 + 2] = spec.width * scale
        sprites[i * 4 + 3] = spec.height * scale
        shapes[i * 4] = draw.shape
        shapes[i * 4 + 1] = spec.sway
        shapes[i * 4 + 2] = spec.viewDistance
        shapes[i * 4 + 3] = sprite
        glows[i * 2] = draw.glowLayers[variant]
        glows[i * 2 + 1] = draw.glow
        const packed = group.lights[j] ?? 0xf0
        lights[i * 2] = packed >> 4
        lights[i * 2 + 1] = packed & 15
      }
    }

    const geometry = new THREE.InstancedBufferGeometry()
    createBaseAttributes(geometry)
    geometry.setAttribute('aOffset', instanceAttribute(offsets, 3))
    geometry.setAttribute('aSprite', instanceAttribute(sprites, 4))
    geometry.setAttribute('aShape', instanceAttribute(shapes, 4))
    geometry.setAttribute('aGlow', instanceAttribute(glows, 2))
    geometry.setAttribute('aLight', instanceAttribute(lights, 2))
    geometry.instanceCount = i
    // Local sub-chunk bounds (+ plants poking out of the top), never scanned
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(33, 34, 33))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(16, 17, 16), MESH_RADIUS)

    const mesh = new THREE.Mesh(geometry, mat)
    mesh.frustumCulled = true
    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.position.set(originX, originY, originZ)
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    mesh.userData.foliageReach = reach
    liveMeshes.add(mesh)
    return mesh
  }
}

/** Forget a foliage mesh that is being disposed. */
export function releaseFoliageMesh(mesh: THREE.Mesh): void {
  liveMeshes.delete(mesh)
}

const meshCentre = new THREE.Vector3()

/**
 * Hide foliage meshes whose plants are all faded out from this camera (the
 * vertex shader would collapse every instance anyway; this skips the draw).
 * Call once per frame before rendering.
 */
export function updateFoliageVisibility(camera: THREE.Camera): void {
  const eye = camera.position
  for (const mesh of liveMeshes) {
    meshCentre.set(mesh.position.x + 16, mesh.position.y + 16, mesh.position.z + 16)
    const reach = (mesh.userData.foliageReach as number) * distanceScaleUniform.value + MESH_RADIUS
    mesh.visible = meshCentre.distanceToSquared(eye) < reach * reach
  }
}
