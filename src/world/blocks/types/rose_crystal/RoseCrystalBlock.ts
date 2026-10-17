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
import { RoseCrystalBlockItem } from '../../../../items/blocks/rose_crystal/RoseCrystalBlockItem.ts'
import texUrl from './assets/rose-crystal.webp'

registerTextureUrl(TextureId.ROSE_CRYSTAL, texUrl)
// Glowing texels light up in the dark (chunk shader emissive)
registerEmissiveTexture(TextureId.ROSE_CRYSTAL, { strength: 0.45, threshold: 0.15 })

const texture = loadBlockTexture(texUrl)
const material = new THREE.MeshLambertMaterial({ map: texture })

/**
 * Rose crystal - the magenta crown of the Crystal Abyss spires. Glows softly;
 * drops itself as a decorative light-giving building block.
 */
export class RoseCrystalBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.ROSE_CRYSTAL,
    name: 'rose_crystal',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 8.0,
    lightLevel: 7,
    lightBlocking: 15,
    demolitionForceRequired: 3,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.ROSE_CRYSTAL
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new RoseCrystalBlockItem()]
  }
}
