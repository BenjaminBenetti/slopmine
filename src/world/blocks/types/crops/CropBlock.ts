import type { BlockId, IGrowableBlock, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { FoliageBlock } from '../foliage_shared/FoliageBlock.ts'
import { RANDOM_TICK_INTERVAL } from '../../../blocktick/RandomBlockTicks.ts'

/** One growth stage of a crop: its block and sprite (bottom-aligned, `height` of the sprite used). */
export interface CropStage {
  readonly id: BlockId
  readonly sprite: string
  readonly height: number
  /** Plane width (default 0.9, 1 = corner to corner). */
  readonly width?: number
  /** Share of the sprite drawn (default `height`; 1 for full-square sprites). */
  readonly spriteHeight?: number
}

export interface CropDefinition {
  /** Crop name: stage blocks are `<name>_1` .. `<name>_<n>`. */
  readonly name: string
  readonly displayName: string
  readonly stages: readonly CropStage[]
  /** Seconds per stage on moist farmland, on average (dry farmland is slower, wild ground slower still). */
  readonly stageSeconds: number
  /** What a young crop gives back when broken: its seed (or the planted vegetable). */
  readonly seed: () => IItem
  /** What the ripe crop gives (produce + seeds). */
  readonly harvest: () => IItem[]
  /** Plane base above the cell floor (hemp sits a little low). */
  readonly baseHeight?: number
}

/** Growth speed by the soil under a crop. */
const SOIL_GROWTH: ReadonlyMap<BlockId, number> = new Map([
  [BlockIds.FARMLAND_MOIST, 1.0],
  [BlockIds.FARMLAND, 0.6],
])
const WILD_GROWTH = 0.35

/** Between a and b inclusive. */
export function rollCount(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1))
}

/**
 * One stage of a farm crop (carrots, potatoes, tomatoes, onions,
 * strawberries, pumpkins): a foliage block planted only on farmland (its
 * seed item is an IPlantable), grown a stage at a time by random ticks -
 * fastest on moist farmland - and by bone meal. Breaking a young crop gives
 * its seed back; the ripe stage gives the harvest. Wild crops (worldgen,
 * ripe, on grass) can be harvested for the first seeds. Not replaceable: a
 * placed block never tramples a crop.
 */
export class CropBlock extends FoliageBlock implements IGrowableBlock {
  private readonly next: BlockId | null

  constructor(private readonly crop: CropDefinition, private readonly stage: number) {
    const s = crop.stages[stage]
    const ripe = stage === crop.stages.length - 1
    super({
      id: s.id,
      name: `${crop.name}_${stage + 1}`,
      displayName: crop.displayName,
      foliage: {
        sprites: [s.sprite],
        shape: 'cross',
        width: s.width ?? 0.9,
        height: s.height,
        spriteHeight: s.spriteHeight,
        baseHeight: crop.baseHeight,
        sway: 0.35,
        jitter: 0.06,
        scaleVariation: 0.08,
        viewDistance: 96,
      },
      tags: ['crop'],
      replaceable: false,
      drops: ripe ? crop.harvest : () => [crop.seed()],
    })
    this.next = ripe ? null : crop.stages[stage + 1].id
  }

  /** Crops are planted on farmland only (wild ones are placed by worldgen). */
  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    if (world.getBlock(x, y, z).properties.id !== 0 && !world.getBlock(x, y, z).properties.replaceable) return false
    return SOIL_GROWTH.has(world.getBlock(x, y - 1n, z).properties.id)
  }

  onRandomTick(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    if (this.next === null) return
    const soil = SOIL_GROWTH.get(world.getBlock(x, y - 1n, z).properties.id) ?? WILD_GROWTH
    if (Math.random() < (RANDOM_TICK_INTERVAL / this.crop.stageSeconds) * soil) {
      world.setBlock(x, y, z, this.next)
    }
  }

  grow(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    if (this.next === null) return false
    world.setBlock(x, y, z, this.next)
    return true
  }

  /** Whether this is the crop's last (harvestable) stage. */
  get isRipe(): boolean {
    return this.stage === this.crop.stages.length - 1
  }
}
