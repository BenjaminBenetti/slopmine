import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { RootPillarBlockItem } from '../../../../items/blocks/root_pillar/RootPillarBlockItem.ts'
import sideTexUrl from './assets/root-pillar.webp'
import endTexUrl from './assets/root-pillar-end.webp'

registerTextureUrl(TextureId.ROOT_PILLAR_SIDE, sideTexUrl)
registerTextureUrl(TextureId.ROOT_PILLAR_END, endTexUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(sideTexUrl) })
const endMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(endTexUrl) })

/**
 * Root pillar - columns of twisted roots holding up the Sporeheart Hive's
 * halls. Dungeon structure: force 6. Not a log (no tree felling).
 */
export class RootPillarBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.ROOT_PILLAR,
    name: 'root_pillar',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 40,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.ROOT_PILLAR_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [sideMaterial, sideMaterial, endMaterial, endMaterial, sideMaterial, sideMaterial]
  }

  getTextureForFace(face: BlockFace): number {
    return face === 0 || face === 1 ? TextureId.ROOT_PILLAR_END : TextureId.ROOT_PILLAR_SIDE
  }

  getDrops(): IItem[] {
    return [new RootPillarBlockItem()]
  }
}
