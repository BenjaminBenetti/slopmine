import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IBlockEntity } from '../../../../entities/interfaces/IBlockEntity.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { StoneBlockItem } from '../../../../items/blocks/stone/StoneBlockItem.ts'
import stoneTexUrl from '../stone/assets/stone.webp'
import { PoiKeystoneBlockEntity } from './PoiKeystoneBlockEntity.ts'

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(stoneTexUrl) })

/**
 * A point of interest's keystone: plain stone to look at and to mine (same
 * texture layer, same drop), buried under the structure by the generator
 * with the kind's index in its metadata (caves/pois/PoiBuilder.keystone).
 * Its block entity tells the game where the point of interest is.
 */
export class PoiKeystoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.POI_KEYSTONE,
    name: 'poi_keystone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.STONE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new StoneBlockItem()]
  }

  createBlockEntity(position: IWorldCoordinate, world: IWorld): IBlockEntity {
    const metadata = world.getMetadata?.(position.x, position.y, position.z) ?? 0
    return new PoiKeystoneBlockEntity(position, metadata)
  }
}
