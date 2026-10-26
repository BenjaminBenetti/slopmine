import type * as THREE from 'three'
import type { IBlock, IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { PlantBlockItem } from '../../../../items/blocks/plants/PlantBlockItem.ts'
import { SubmergedPlantBlock, SUBMERGED_SUPPORT_TICK_INTERVAL } from '../submerged_shared/SubmergedPlantBlock.ts'
import { createGroundCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import { createWaterPlantMaterial } from './waterPlantMaterial.ts'
import kelpTexUrl from './assets/kelp.webp'

registerTextureUrl(TextureId.KELP, kelpTexUrl)

/** Full-cell cross: stacked segments join into one strand (stalk on the cell axis). */
export const kelpGeometry = createGroundCrossGeometry(1.0, 1.0)
/** Sea kelp sways more than the swamp's: the sea moves. */
export const KELP_SWAY = { amplitude: 0.12, speed: 0.75 }
const kelpMaterial = createWaterPlantMaterial(kelpTexUrl, KELP_SWAY)

/** Whether a block is part of a sea kelp strand (a segment holds up the next). */
export function isKelp(block: IBlock): boolean {
  const id = block.properties.id
  return id === BlockIds.KELP || id === BlockIds.KELP_TOP
}

/**
 * Sea kelp - golden-brown ribbon kelp rising in strands from the beds of
 * the seas and the deeper coastal waters to a crown (KELP_TOP) that often
 * reaches the surface: whole kelp forests sway in the swell. Stands in water
 * (`submergedIn`), so its cell is water to everything else; cut the base and
 * the strand floats loose a segment at a time.
 */
export class KelpBlock extends SubmergedPlantBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.KELP,
    name: 'kelp',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
    submergedIn: 'water',
    tickInterval: SUBMERGED_SUPPORT_TICK_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.KELP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return kelpGeometry
  }

  protected getMaterials(): THREE.Material {
    return kelpMaterial
  }

  protected override isSupport(below: IBlock): boolean {
    return below.properties.isSolid || isKelp(below)
  }

  /** A placed segment is a fresh strand end: it grows a crown, and a crown it lands on becomes stalk. */
  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    if (world.getBlock(x, y - 1n, z).properties.id === BlockIds.KELP_TOP) {
      world.setBlock(x, y - 1n, z, BlockIds.KELP)
    }
    world.setBlock(x, y, z, BlockIds.KELP_TOP)
  }

  getDrops(): IItem[] {
    return [new PlantBlockItem('kelp', 'Kelp')]
  }
}
