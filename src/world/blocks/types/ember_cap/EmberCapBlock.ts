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
import { EmberCapBlockItem } from '../../../../items/blocks/ember_cap/EmberCapBlockItem.ts'
import capTexUrl from './assets/ember-cap.webp'

registerTextureUrl(TextureId.EMBER_CAP, capTexUrl)
// Only the ember spots glow; the crimson skin stays dark so caps read as
// spotted silhouettes against the haze
registerEmissiveTexture(TextureId.EMBER_CAP, { strength: 0.55, threshold: 0.5 })

const capMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(capTexUrl) })

/** Ember cap - the crimson, ember-spotted skin of a giant hell fungus cap. */
export class EmberCapBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.EMBER_CAP,
    name: 'ember_cap',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.6,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.EMBER_CAP
  }

  protected getMaterials(): THREE.Material {
    return capMaterial
  }

  getDrops(): IItem[] {
    return [new EmberCapBlockItem()]
  }
}
