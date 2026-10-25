import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { CaveSolidBlock } from '../cave_shared/CaveSolidBlock.ts'
import { FulguriteItem } from '../../../../items/weather/fulgurite/FulguriteItem.ts'
import fulguriteUrl from './assets/fulgurite.webp'

const fulgurites = (): FulguriteItem[] => Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => new FulguriteItem())

/**
 * Fulgurite - sand fused into veins of smoky glass where lightning struck a
 * beach or a dune. Only lightning makes it (weather/Lightning.ts turns the
 * struck sand block into this); mining it gives 1-2 fulgurite.
 */
export class FulguriteBlock extends CaveSolidBlock {
  constructor() {
    super({
      id: BlockIds.FULGURITE, name: 'fulgurite', displayName: 'Fulgurite', textureId: TextureId.FULGURITE,
      texture: fulguriteUrl, hardness: 1.2, force: 1, tags: [BlockTags.ROCK], drops: fulgurites,
    })
  }
}
