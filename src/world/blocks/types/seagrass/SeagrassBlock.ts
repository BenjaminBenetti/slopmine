import type * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { PlantBlockItem } from '../../../../items/blocks/plants/PlantBlockItem.ts'
import { SubmergedPlantBlock, SUBMERGED_SUPPORT_TICK_INTERVAL } from '../submerged_shared/SubmergedPlantBlock.ts'
import { createGroundCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import { createWaterPlantMaterial } from '../kelp/waterPlantMaterial.ts'
import seagrassTexUrl from './assets/seagrass.webp'

registerTextureUrl(TextureId.SEAGRASS, seagrassTexUrl)

const seagrassGeometry = createGroundCrossGeometry(0.95, 0.9)
const seagrassMaterial = createWaterPlantMaterial(seagrassTexUrl, { amplitude: 0.07, speed: 1.0 })

/**
 * Seagrass - meadows of bright green blades on the sandy beds of the seas,
 * rivers and lakes, waving in the water. Stands in water (`submergedIn`).
 */
export class SeagrassBlock extends SubmergedPlantBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SEAGRASS,
    name: 'seagrass',
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
    return TextureId.SEAGRASS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return seagrassGeometry
  }

  protected getMaterials(): THREE.Material {
    return seagrassMaterial
  }

  getDrops(): IItem[] {
    return [new PlantBlockItem('seagrass', 'Seagrass')]
  }
}
