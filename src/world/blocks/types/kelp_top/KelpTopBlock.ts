import type * as THREE from 'three'
import type { IBlock, IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { PlantBlockItem } from '../../../../items/blocks/plants/PlantBlockItem.ts'
import { SubmergedPlantBlock, SUBMERGED_SUPPORT_TICK_INTERVAL } from '../submerged_shared/SubmergedPlantBlock.ts'
import { createWaterPlantMaterial } from '../kelp/waterPlantMaterial.ts'
import { isKelp, kelpGeometry, KELP_SWAY } from '../kelp/KelpBlock.ts'
import kelpTopTexUrl from './assets/kelp_top.webp'

registerTextureUrl(TextureId.KELP_TOP, kelpTopTexUrl)

const kelpTopMaterial = createWaterPlantMaterial(kelpTopTexUrl, KELP_SWAY)

/** Sea kelp's crown: a float bulb and a fan of ribbons streaming up (see KelpBlock). */
export class KelpTopBlock extends SubmergedPlantBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.KELP_TOP,
    name: 'kelp_top',
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
    return TextureId.KELP_TOP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return kelpGeometry
  }

  protected getMaterials(): THREE.Material {
    return kelpTopMaterial
  }

  protected override isSupport(below: IBlock): boolean {
    return below.properties.isSolid || isKelp(below)
  }

  getDrops(): IItem[] {
    return [new PlantBlockItem('kelp', 'Kelp')]
  }
}
