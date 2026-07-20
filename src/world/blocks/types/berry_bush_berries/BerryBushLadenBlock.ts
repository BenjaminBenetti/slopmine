import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { createBushCrossGeometry } from '../berry_bush/BerryBushBlock.ts'
import { BerriesItem } from '../../../../items/food/berries/BerriesItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import berryBushBerriesTexUrl from './assets/berry-bush-berries.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.BERRY_BUSH_BERRIES, berryBushBerriesTexUrl, true)

const berryBushBerriesTexture = loadBlockTexture(berryBushBerriesTexUrl)

// Same cross geometry as the picked-clean variant so the id swap is seamless
const ladenCrossGeometry = createBushCrossGeometry(0.8, 0.9)

const berryBushBerriesMaterial = new THREE.MeshLambertMaterial({
  map: berryBushBerriesTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Harvest a laden berry bush without breaking it: swaps the block to the
 * picked-clean BERRY_BUSH variant and returns the berries to give the player.
 *
 * The setBlock swap omits the metadata arg, so existing metadata (including
 * persistent bit 7 on player-placed bushes) is preserved, and the runtime
 * setBlock change automatically schedules the empty bush's regrow tick.
 *
 * Wired to the E key via blockActionRegistry in main.ts; drops are scattered
 * there via world.spawnBlockDrops.
 *
 * @returns The harvested items (empty if the block is no longer a laden bush)
 */
export function harvestBerryBush(world: IWorld, x: bigint, y: bigint, z: bigint): IItem[] {
  const blockId = world.getBlockId
    ? world.getBlockId(x, y, z)
    : world.getBlock(x, y, z).properties.id
  if (blockId !== BlockIds.BERRY_BUSH_BERRIES) return []

  world.setBlock(x, y, z, BlockIds.BERRY_BUSH)
  return [new BerriesItem(), new BerriesItem()]
}

/**
 * Berry bush laden with ripe berries. Harvest with E (swaps to the
 * picked-clean variant, which regrows), or break it for the berries.
 * No scheduled tick - only the picked-clean variant ticks.
 */
export class BerryBushLadenBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BERRY_BUSH_BERRIES,
    name: 'berry_bush_berries',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.BERRY_BUSH_BERRIES
  }

  protected getGeometry(): THREE.BufferGeometry {
    return ladenCrossGeometry
  }

  protected getMaterials(): THREE.Material {
    return berryBushBerriesMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Matches the bush cross geometry (height=0.8, width=0.9).
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.05, 0, 0.05),
      new THREE.Vector3(0.95, 0.8, 0.95)
    )
  }

  getDrops(): IItem[] {
    return [new BerriesItem(), new BerriesItem()]
  }
}
