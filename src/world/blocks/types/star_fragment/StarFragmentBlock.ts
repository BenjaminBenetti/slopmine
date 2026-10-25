import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { FLOOR as F } from '../molten_decor/DecorGeometry.ts'
import { PoiDecorBlock } from '../poi_shared/PoiDecorBlock.ts'
import { StardustItem } from '../../../../items/weather/stardust/StardustItem.ts'

const stardust = (): StardustItem[] => Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => new StardustItem())

/**
 * Star Fragment - a fallen star: a rough lump of dark meteoric rock split by
 * glowing blue-violet cracks, still warm where it landed. Meteor showers
 * drop them on the ground near the player (the weather's meteor code places
 * the block on open ground). Mines into 2-4 stardust; glows (light 10).
 */
export class StarFragmentBlock extends PoiDecorBlock {
  constructor() {
    super({
      id: BlockIds.STAR_FRAGMENT, name: 'star_fragment', displayName: 'Star Fragment', textureId: TextureId.STAR_FRAGMENT,
      // 0 dark rock, 1 lighter rock, 2 violet glow, 3 blue-white glow, 4 scorched ground
      colors: [{ color: 0x403a4a }, { color: 0x5a5266 }, { color: 0xa98cff, glow: true }, { color: 0xc8ecff, glow: true }, { color: 0x2c2826 }],
      boxes: [
        // Scorched ground around it
        { w: 0.86, h: 0.012, d: 0.82, x: 0, y: F + 0.004, z: 0, m: 4 },
        // The lump: overlapping, turned chunks
        { w: 0.6, h: 0.24, d: 0.54, x: 0, y: F, z: 0, m: 0, ry: 0.3 },
        { w: 0.48, h: 0.22, d: 0.44, x: -0.04, y: F + 0.2, z: 0.03, m: 1, ry: -0.4 },
        { w: 0.32, h: 0.16, d: 0.3, x: 0.05, y: F + 0.38, z: -0.02, m: 0, ry: 0.9 },
        { w: 0.24, h: 0.14, d: 0.22, x: 0.2, y: F + 0.1, z: 0.2, m: 1, ry: 0.2 },
        { w: 0.22, h: 0.12, d: 0.2, x: -0.22, y: F + 0.06, z: -0.18, m: 0, ry: -0.7 },
        // Glowing cracks: thin slabs through the lump, showing on several faces
        { w: 0.05, h: 0.2, d: 0.62, x: 0.1, y: F + 0.04, z: 0, m: 2, ry: 0.3 },
        { w: 0.56, h: 0.05, d: 0.05, x: -0.03, y: F + 0.3, z: 0.2, m: 2, ry: -0.4 },
        { w: 0.5, h: 0.05, d: 0.05, x: 0, y: F + 0.18, z: -0.22, m: 3, ry: 0.3 },
        { w: 0.05, h: 0.18, d: 0.36, x: -0.12, y: F + 0.34, z: 0, m: 3, ry: 0.9 },
        // Hot core breaking through on top, and a spark of it at the foot
        { w: 0.12, h: 0.07, d: 0.12, x: 0.03, y: F + 0.5, z: -0.01, m: 3, ry: 0.5 },
        { w: 0.06, h: 0.06, d: 0.06, x: 0.3, y: F + 0.1, z: 0.27, m: 2 },
      ],
      hardness: 3, force: 2, tags: [BlockTags.ROCK], lightLevel: 10,
      collision: [0.18, 0, 0.18, 0.82, 0.62, 0.82],
      interaction: [0.12, 0, 0.12, 0.88, 0.66, 0.88],
      drops: stardust,
    })
  }
}
