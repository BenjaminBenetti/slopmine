import * as THREE from 'three'
import type { BlockId, IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture, type EmissiveTextureOptions } from '../../../../renderer/EmissiveTextures.ts'
import { PlantBlockItem } from '../../../../items/blocks/plants/PlantBlockItem.ts'

export interface CaveSolidBlockOptions {
  readonly id: BlockId
  readonly name: string
  readonly displayName: string
  readonly textureId: number
  readonly texture: string
  /** Glow: the chunk shader's emissive texels (EmissiveTextures). */
  readonly glow?: EmissiveTextureOptions
  readonly hardness: number
  readonly force: number
  readonly tags: readonly string[]
  readonly lightLevel?: number
  /** Default: the block's own item. */
  readonly drops?: () => IItem[]
}

/**
 * A greedy-meshed cave block with one texture on every face (cave biome
 * rock, crystal and fungus blocks; see cave_shared/caveSolidBlocks.ts):
 * registers its face texture (and glow) on construction.
 */
export class CaveSolidBlock extends SolidBlock {
  readonly properties: IBlockProperties
  private readonly material: THREE.Material

  constructor(private readonly options: CaveSolidBlockOptions) {
    super()
    registerTextureUrl(options.textureId, options.texture)
    if (options.glow) registerEmissiveTexture(options.textureId, options.glow)
    this.material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(options.texture) })
    this.properties = {
      id: options.id,
      name: options.name,
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: options.hardness,
      lightLevel: options.lightLevel ?? 0,
      lightBlocking: 15,
      demolitionForceRequired: options.force,
      tags: options.tags,
    }
  }

  protected get defaultTextureId(): number {
    return this.options.textureId
  }

  protected getMaterials(): THREE.Material {
    return this.material
  }

  getDrops(): IItem[] {
    return this.options.drops ? this.options.drops() : [new PlantBlockItem(this.properties.name, this.options.displayName)]
  }
}
