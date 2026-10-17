import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { HellRockBlockItem } from '../../../../items/blocks/hell_rock/HellRockBlockItem.ts'
import myceliumTexUrl from './assets/crimson-mycelium.webp'
import myceliumSideTexUrl from './assets/crimson-mycelium-side.webp'
import hellRockTexUrl from '../hell_rock/assets/hell-rock.webp'

// HELL_ROCK (the bottom face) is registered by HellRockBlock
registerTextureUrl(TextureId.CRIMSON_MYCELIUM_TOP, myceliumTexUrl)
registerTextureUrl(TextureId.CRIMSON_MYCELIUM_SIDE, myceliumSideTexUrl)

const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(myceliumTexUrl) })
const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(myceliumSideTexUrl) })
const bottomMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(hellRockTexUrl) })

/**
 * Crimson mycelium - the Ember Grove floor: hell rock overgrown with a
 * matted crimson fungal skin (the Hell layer's "grass"). Like grass over
 * dirt, it drops the rock underneath.
 */
export class CrimsonMyceliumBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRIMSON_MYCELIUM,
    name: 'crimson_mycelium',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CRIMSON_MYCELIUM_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [sideMaterial, sideMaterial, topMaterial, bottomMaterial, sideMaterial, sideMaterial]
  }

  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: return TextureId.CRIMSON_MYCELIUM_TOP
      case 1: return TextureId.HELL_ROCK
      default: return TextureId.CRIMSON_MYCELIUM_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new HellRockBlockItem()]
  }
}
