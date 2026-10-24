import * as THREE from 'three'
import type { BlockFace, BlockId, IBlock, IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { playBlockSound } from '../../../../audio/SoundHooks.ts'
import { PlantBlockItem } from '../../../../items/blocks/plants/PlantBlockItem.ts'
import type { FoliageSpec, IFoliageBlock } from '../../foliage/FoliageSpec.ts'

/**
 * Seconds between support checks (`tickInterval`): a plant whose ground was
 * dug away pops off almost at once.
 */
export const FOLIAGE_SUPPORT_TICK_INTERVAL = 0.1

export interface FoliageBlockOptions {
  readonly id: BlockId
  readonly name: string
  readonly displayName: string
  readonly foliage: FoliageSpec
  /** Light emitted (default 0). */
  readonly lightLevel?: number
  readonly tags?: readonly string[]
  /**
   * Blocks this plant grows on. Default: any solid block. A plant standing
   * on something else (its ground dug out, a block swapped) pops off.
   * Hanging plants (shape 'hang') check the block ABOVE them instead.
   */
  readonly ground?: readonly BlockId[]
  /** Blocks it floats on instead (lily pads: liquid sources). */
  readonly floatsOn?: readonly BlockId[]
  /**
   * Non-solid blocks that hold it too, besides any solid block: the pieces
   * of a chain (a stalactite's column, the vine above a vine).
   */
  readonly alsoSupportedBy?: readonly BlockId[]
  /** Needs no support at all (cobwebs strung across cave air). */
  readonly freestanding?: boolean
  /**
   * What breaking it gives (default: its own block item). Called per break,
   * so it may roll chances.
   */
  readonly drops?: () => IItem[]
  /** Placed blocks and liquids replace it (default true: grass, flowers, doodads). */
  readonly replaceable?: boolean
}

/** Display (item icon, held, dropped) planes for a foliage spec. */
function createDisplayGeometry(spec: FoliageSpec): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  if (spec.shape === 'flat') {
    const s = Math.min(spec.width, 1) * 0.5
    const y = -0.5 + 0.02
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -s, y, s, s, y, s, s, y, -s,
      -s, y, s, s, y, -s, -s, y, -s,
    ]), 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2))
  } else {
    const w = spec.width * 0.5
    const hang = spec.shape === 'hang'
    const bottom = hang ? 0.5 - spec.height : -0.5
    const top = bottom + spec.height
    const v = spec.spriteHeight ?? spec.height
    if (hang) {
      // The top of the sprite: v from 1 - v (plane bottom) to 1 (plane top)
      const v0 = 1 - v
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        -w, bottom, -w, w, bottom, w, w, top, w,
        -w, bottom, -w, w, top, w, -w, top, -w,
        -w, bottom, w, w, bottom, -w, w, top, -w,
        -w, bottom, w, w, top, -w, -w, top, w,
      ]), 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
        0, v0, 1, v0, 1, 1, 0, v0, 1, 1, 0, 1,
        0, v0, 1, v0, 1, 1, 0, v0, 1, 1, 0, 1,
      ]), 2))
      geo.computeVertexNormals()
      return geo
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -w, bottom, -w, w, bottom, w, w, top, w,
      -w, bottom, -w, w, top, w, -w, top, -w,
      -w, bottom, w, w, bottom, -w, w, top, -w,
      -w, bottom, w, w, top, -w, -w, top, w,
    ]), 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0, 1, 0, 1, v, 0, 0, 1, v, 0, v,
      0, 0, 1, 0, 1, v, 0, 0, 1, v, 0, v,
    ]), 2))
  }
  geo.computeVertexNormals()
  return geo
}

/**
 * A wild plant or ground doodad drawn by the batched foliage renderer (see
 * FoliageSpec): grasses, flowers, bushes, pebbles, fallen leaves, lily pads.
 * Never solid, no collision, mined instantly; placed blocks and liquids
 * replace it; when its ground goes it pops off and drops what it drops
 * (scheduled ticks: worldgen plants cost nothing until something changes next
 * to them). In the world it is part of its sub-chunk's foliage mesh; item
 * displays (icon, held, dropped) use the plain cross or flat plane below.
 */
export class FoliageBlock extends TransparentBlock implements IFoliageBlock {
  readonly properties: IBlockProperties
  readonly foliage: FoliageSpec
  private readonly options: FoliageBlockOptions
  private displayGeometry: THREE.BufferGeometry | null = null
  private displayMaterial: THREE.Material | null = null

  constructor(options: FoliageBlockOptions) {
    super()
    this.options = options
    this.foliage = options.foliage
    this.properties = {
      id: options.id,
      name: options.name,
      isOpaque: false,
      isSolid: false,
      isLiquid: false,
      hardness: 0,
      lightLevel: options.lightLevel ?? 0,
      lightBlocking: 0,
      demolitionForceRequired: 0,
      tags: options.tags ?? [],
      tickInterval: FOLIAGE_SUPPORT_TICK_INTERVAL,
      replaceable: options.replaceable ?? true,
    }
    // Start loading the display texture now (main thread): block icons are
    // rendered at startup, after whenBlockTexturesLoaded()
    if (typeof document !== 'undefined') this.getMaterials()
  }

  get displayName(): string {
    return this.options.displayName
  }

  protected get defaultTextureId(): number {
    return TextureId.AIR
  }

  protected getGeometry(): THREE.BufferGeometry {
    this.displayGeometry ??= createDisplayGeometry(this.foliage)
    return this.displayGeometry
  }

  protected getMaterials(): THREE.Material {
    this.displayMaterial ??= new THREE.MeshLambertMaterial({
      map: loadBlockTexture(this.foliage.sprites[0]),
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    })
    return this.displayMaterial
  }

  /** The block that holds this plant up: the one above a hanging plant, else the one below. */
  private supportAt(world: IWorld, x: bigint, y: bigint, z: bigint): IBlock {
    return world.getBlock(x, this.foliage.shape === 'hang' ? y + 1n : y - 1n, z)
  }

  /** Whether `below` (above, for a hanging plant) holds this plant: its ground, or the liquid it floats on. */
  isSupportedBy(below: IBlock): boolean {
    const { ground, floatsOn, alsoSupportedBy, freestanding } = this.options
    if (freestanding) return true
    if (alsoSupportedBy?.includes(below.properties.id)) return true
    if (floatsOn) return floatsOn.includes(below.properties.id)
    if (ground) return ground.includes(below.properties.id)
    return below.properties.isSolid
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const here = world.getBlock(x, y, z).properties
    if (here.id !== 0 && !here.replaceable) return false
    return this.isSupportedBy(this.supportAt(world, x, y, z))
  }

  onScheduledTick(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    if (this.isSupportedBy(this.supportAt(world, x, y, z))) return false
    playBlockSound(this.properties.id, 'break', { x: Number(x) + 0.5, y: Number(y) + 0.5, z: Number(z) + 0.5 }, { volume: 0.25 })
    world.spawnBlockDrops?.(x, y, z, this.getDrops())
    world.setBlock(x, y, z, 0)
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    const spec = this.foliage
    if (spec.shape === 'flat') {
      return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 0.08, 0.9))
    }
    const half = Math.min(0.4, spec.width * 0.35)
    const reach = Math.max(0.15, Math.min(1, spec.height * 0.9))
    const bottom = spec.shape === 'hang' ? 1 - reach : 0
    return new THREE.Box3(new THREE.Vector3(0.5 - half, bottom, 0.5 - half), new THREE.Vector3(0.5 + half, bottom + reach, 0.5 + half))
  }

  getDrops(): IItem[] {
    return this.options.drops ? this.options.drops() : [new PlantBlockItem(this.properties.name, this.options.displayName)]
  }
}
