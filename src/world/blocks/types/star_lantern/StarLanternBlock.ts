import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { FLOOR as F } from '../molten_decor/DecorGeometry.ts'
import { PoiDecorBlock } from '../poi_shared/PoiDecorBlock.ts'

/**
 * Star Lantern - a silver-framed lantern around a core of pale starlight
 * swirled with stardust. The brightest light there is (15). Crafted from
 * four stardust, glass and an iron bar.
 */
export class StarLanternBlock extends PoiDecorBlock {
  constructor() {
    super({
      id: BlockIds.STAR_LANTERN, name: 'star_lantern', displayName: 'Star Lantern', textureId: TextureId.STAR_LANTERN,
      // 0 silver frame, 1 starlight core, 2 stardust swirl, 3 dark trim
      colors: [{ color: 0x9aa3b4 }, { color: 0xeaf2ff, glow: true }, { color: 0x9ab8ff, glow: true }, { color: 0x3a3e4a }],
      boxes: [
        { w: 0.44, h: 0.06, d: 0.44, x: 0, y: F, z: 0, m: 3 }, // base
        { w: 0.36, h: 0.04, d: 0.36, x: 0, y: F + 0.06, z: 0, m: 0 },
        { w: 0.26, h: 0.4, d: 0.26, x: 0, y: F + 0.1, z: 0, m: 1 }, // core
        { w: 0.28, h: 0.06, d: 0.28, x: 0, y: F + 0.2, z: 0, m: 2, ry: 0.4 }, // stardust swirls
        { w: 0.28, h: 0.06, d: 0.28, x: 0, y: F + 0.36, z: 0, m: 2, ry: -0.3 },
        { w: 0.05, h: 0.44, d: 0.05, x: 0.16, y: F + 0.08, z: 0.16, m: 0 }, // corner posts
        { w: 0.05, h: 0.44, d: 0.05, x: -0.16, y: F + 0.08, z: 0.16, m: 0 },
        { w: 0.05, h: 0.44, d: 0.05, x: 0.16, y: F + 0.08, z: -0.16, m: 0 },
        { w: 0.05, h: 0.44, d: 0.05, x: -0.16, y: F + 0.08, z: -0.16, m: 0 },
        { w: 0.42, h: 0.06, d: 0.42, x: 0, y: F + 0.52, z: 0, m: 3 }, // roof
        { w: 0.28, h: 0.06, d: 0.28, x: 0, y: F + 0.58, z: 0, m: 0 },
        { w: 0.12, h: 0.06, d: 0.12, x: 0, y: F + 0.64, z: 0, m: 0 },
        // Finial: a little glowing gem, set diagonally
        { w: 0.06, h: 0.04, d: 0.06, x: 0, y: F + 0.7, z: 0, m: 2, ry: Math.PI / 4 },
        { w: 0.1, h: 0.06, d: 0.1, x: 0, y: F + 0.74, z: 0, m: 1, ry: Math.PI / 4 },
        { w: 0.05, h: 0.04, d: 0.05, x: 0, y: F + 0.8, z: 0, m: 1, ry: Math.PI / 4 },
      ],
      hardness: 0.6, force: 0, tags: [], lightLevel: 15,
      interaction: [0.27, 0, 0.27, 0.73, 0.84, 0.73],
    })
  }
}
