import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PrismShardItem } from '../../../../items/materials/prism_shard/PrismShardItem.ts'
import texUrl from './assets/prism-crystal.webp'

registerTextureUrl(TextureId.PRISM_CRYSTAL, texUrl)
// Glowing texels light up in the dark (chunk shader emissive)
registerEmissiveTexture(TextureId.PRISM_CRYSTAL, { strength: 0.7, threshold: 0.2 })

const texture = loadBlockTexture(texUrl)
const material = new THREE.MeshLambertMaterial({ map: texture })

/**
 * Prism crystal - the Crystal Abyss resource: a glowing violet crystal mass
 * (spire veins, geode linings, island stalactites). Diamond pickaxe (force 5);
 * shatters into 2-3 prism shards.
 */
export class PrismCrystalBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PRISM_CRYSTAL,
    name: 'prism_crystal',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 20.0,
    lightLevel: 11,
    lightBlocking: 15,
    demolitionForceRequired: 5,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.PRISM_CRYSTAL
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    const count = 2 + Math.floor(Math.random() * 2) // 2-3 shards
    const drops: IItem[] = []
    for (let i = 0; i < count; i++) drops.push(new PrismShardItem())
    return drops
  }
}
