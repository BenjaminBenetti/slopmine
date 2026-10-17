import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { ShelfFungusBlockItem } from '../../../../items/blocks/shelf_fungus/ShelfFungusBlockItem.ts'
import shelfTexUrl from './assets/shelf-fungus.webp'

registerTextureUrl(TextureId.SHELF_FUNGUS, shelfTexUrl)

/** A bracket fungus is a thick plate in the upper half of its cell. */
const shelfGeometry = new THREE.BoxGeometry(1, 0.375, 1).translate(0, 0.3125, 0)

const shelfMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(shelfTexUrl) })

/**
 * Shelf fungus - woody bracket fungi growing out of giant emberwood stems,
 * often in a spiral: one block up per step, so they make a natural
 * staircase to the caps.
 */
export class ShelfFungusBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SHELF_FUNGUS,
    name: 'shelf_fungus',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 0.8,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.SHELF_FUNGUS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return shelfGeometry
  }

  protected getMaterials(): THREE.Material {
    return shelfMaterial
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0, 0.625, 0), new THREE.Vector3(1, 1, 1))
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0, 0.625, 0), new THREE.Vector3(1, 1, 1))
  }

  getDrops(): IItem[] {
    return [new ShelfFungusBlockItem()]
  }
}
