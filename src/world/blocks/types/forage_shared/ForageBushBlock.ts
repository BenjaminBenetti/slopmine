import type { BlockId, IGrowableBlock, IHarvestableBlock, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { FoliageBlock } from '../foliage_shared/FoliageBlock.ts'
import { RANDOM_TICK_INTERVAL } from '../../../blocktick/RandomBlockTicks.ts'
import { PlantBlockItem } from '../../../../items/blocks/plants/PlantBlockItem.ts'
import { BlueberriesItem } from '../../../../items/food/blueberries/BlueberriesItem.ts'
import { PricklyPearFruitItem } from '../../../../items/food/prickly_pear_fruit/PricklyPearFruitItem.ts'
import { PineappleItem } from '../../../../items/food/pineapple/PineappleItem.ts'
import blueberryUrl from './assets/blueberry_bush.webp'
import blueberryPickedUrl from './assets/blueberry_bush_picked.webp'
import pricklyPearUrl from './assets/prickly_pear.webp'
import pricklyPearPickedUrl from './assets/prickly_pear_picked.webp'
import pineappleUrl from './assets/pineapple.webp'
import pineapplePickedUrl from './assets/pineapple_picked.webp'

/** A wild plant that fruits, is picked (E) and fruits again. */
export interface ForageBushDefinition {
  /** Block name of the picked bush (its item places it); the ripe one is `<name>_ripe`. */
  readonly name: string
  readonly displayName: string
  readonly pickedId: BlockId
  readonly ripeId: BlockId
  readonly ripeSprite: string
  readonly pickedSprite: string
  readonly height: number
  readonly width: number
  readonly sway: number
  readonly ground: readonly BlockId[]
  /** Average seconds from picked to ripe again. */
  readonly regrowSeconds: number
  /** What picking the ripe bush gives. */
  readonly fruit: () => IItem[]
}

/** Bushes grown from seeds stand on farmland. */
const FARMLANDS = [BlockIds.FARMLAND, BlockIds.FARMLAND_MOIST]

function many(count: number, make: () => IItem): IItem[] {
  return Array.from({ length: count }, make)
}

export const FORAGE_BUSHES: readonly ForageBushDefinition[] = [
  {
    name: 'blueberry_bush', displayName: 'Blueberry Bush',
    pickedId: BlockIds.BLUEBERRY_BUSH, ripeId: BlockIds.BLUEBERRY_BUSH_RIPE,
    ripeSprite: blueberryUrl, pickedSprite: blueberryPickedUrl, height: 0.6, width: 1.0, sway: 0.2,
    ground: [BlockIds.GRASS, BlockIds.PODZOL, BlockIds.DIRT, BlockIds.SNOWY_GRASS, ...FARMLANDS],
    regrowSeconds: 150,
    fruit: () => many(2 + Math.floor(Math.random() * 2), () => new BlueberriesItem()),
  },
  {
    name: 'prickly_pear', displayName: 'Prickly Pear',
    pickedId: BlockIds.PRICKLY_PEAR, ripeId: BlockIds.PRICKLY_PEAR_RIPE,
    ripeSprite: pricklyPearUrl, pickedSprite: pricklyPearPickedUrl, height: 0.95, width: 1.0, sway: 0,
    ground: [BlockIds.SAND, ...FARMLANDS],
    regrowSeconds: 200,
    fruit: () => many(2 + Math.floor(Math.random() * 2), () => new PricklyPearFruitItem()),
  },
  {
    name: 'pineapple_plant', displayName: 'Pineapple Plant',
    pickedId: BlockIds.PINEAPPLE_PLANT, ripeId: BlockIds.PINEAPPLE_PLANT_RIPE,
    ripeSprite: pineappleUrl, pickedSprite: pineapplePickedUrl, height: 0.7, width: 1.0, sway: 0.15,
    ground: [BlockIds.GRASS, BlockIds.DIRT, ...FARMLANDS],
    regrowSeconds: 240,
    fruit: () => [new PineappleItem()],
  },
]

/**
 * A forage bush in one of its two states (blueberry bush, prickly pear,
 * pineapple plant), like the berry bush: the ripe bush is picked with E or
 * right-click (setupFarming) - the fruit goes to the player and it becomes the picked
 * bush, which ripens again by random ticks (or bone meal). Mining a picked
 * bush gives the bush itself (to replant), a ripe one only its fruit.
 */
export class ForageBushBlock extends FoliageBlock implements IGrowableBlock, IHarvestableBlock {
  constructor(private readonly def: ForageBushDefinition, readonly ripe: boolean) {
    super({
      id: ripe ? def.ripeId : def.pickedId,
      name: ripe ? `${def.name}_ripe` : def.name,
      displayName: def.displayName,
      foliage: {
        sprites: [ripe ? def.ripeSprite : def.pickedSprite],
        shape: 'cross',
        width: def.width,
        height: def.height,
        sway: def.sway,
        jitter: 0.15,
        scaleVariation: 0.12,
        viewDistance: 112,
      },
      ground: def.ground,
      replaceable: false,
      drops: ripe ? def.fruit : () => [new PlantBlockItem(def.name, def.displayName)],
    })
  }

  /** Pick a ripe bush: its fruit, and the bush left picked. Null if not ripe. */
  harvest(world: IWorld, x: bigint, y: bigint, z: bigint): IItem[] | null {
    if (!this.ripe) return null
    world.setBlock(x, y, z, this.def.pickedId)
    return this.def.fruit()
  }

  onRandomTick(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    if (this.ripe) return
    if (Math.random() < RANDOM_TICK_INTERVAL / this.def.regrowSeconds) world.setBlock(x, y, z, this.def.ripeId)
  }

  grow(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    if (this.ripe) return false
    world.setBlock(x, y, z, this.def.ripeId)
    return true
  }
}

/** Both states of every forage bush. */
export function createForageBushBlocks(): ForageBushBlock[] {
  return FORAGE_BUSHES.flatMap((def) => [new ForageBushBlock(def, false), new ForageBushBlock(def, true)])
}
