import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { GlowingSapBlockItem } from '../../../../items/blocks/glowing_sap/GlowingSapBlockItem.ts'
import texUrl from './assets/glowing-sap.webp'

registerTextureUrl(TextureId.GLOWING_SAP, texUrl)
registerEmissiveTexture(TextureId.GLOWING_SAP, { strength: 0.9, threshold: 0.0 })

const texture = loadBlockTexture(texUrl)
// Item displays glow too
const material = new THREE.MeshLambertMaterial({
  map: texture,
  emissiveMap: texture,
  emissive: 0xffffff,
  emissiveIntensity: 0.5,
})

/**
 * Glowing sap - luminous fungal sap set like resin: the hive's pools,
 * troughs and the throne's moat. A light source, and the signature of the
 * hive's tier-2 chest loot.
 */
export class GlowingSapBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLOWING_SAP,
    name: 'glowing_sap',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.2,
    lightLevel: 9,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.GLOWING_SAP
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new GlowingSapBlockItem()]
  }
}
