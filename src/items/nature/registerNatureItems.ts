import type { IItem } from '../Item.ts'
import { PlantBlockItem } from '../blocks/plants/PlantBlockItem.ts'
import { WILD_PLANT_ITEMS } from '../../world/blocks/types/wild_plants/wildPlantBlocks.ts'
import { FORAGE_BUSHES } from '../../world/blocks/types/forage_shared/ForageBushBlock.ts'
import { CarrotItem } from '../food/carrot/CarrotItem.ts'
import { PotatoItem } from '../food/potato/PotatoItem.ts'
import { BakedPotatoItem } from '../food/baked_potato/BakedPotatoItem.ts'
import { TomatoItem } from '../food/tomato/TomatoItem.ts'
import { OnionItem } from '../food/onion/OnionItem.ts'
import { StrawberryItem } from '../food/strawberry/StrawberryItem.ts'
import { PumpkinPieItem } from '../food/pumpkin_pie/PumpkinPieItem.ts'
import { MushroomStewItem } from '../food/mushroom_stew/MushroomStewItem.ts'
import { VegetableStewItem } from '../food/vegetable_stew/VegetableStewItem.ts'
import { BlueberriesItem } from '../food/blueberries/BlueberriesItem.ts'
import { PricklyPearFruitItem } from '../food/prickly_pear_fruit/PricklyPearFruitItem.ts'
import { AloeLeafItem } from '../food/aloe_leaf/AloeLeafItem.ts'
import { PineappleItem } from '../food/pineapple/PineappleItem.ts'
import { TomatoSeedsItem } from '../materials/tomato_seeds/TomatoSeedsItem.ts'
import { StrawberrySeedsItem } from '../materials/strawberry_seeds/StrawberrySeedsItem.ts'
import { PumpkinSeedsItem } from '../materials/pumpkin_seeds/PumpkinSeedsItem.ts'
import { PumpkinItem } from '../materials/pumpkin/PumpkinItem.ts'
import { BowlItem } from '../materials/bowl/BowlItem.ts'
import { BlueberrySeedsItem } from '../materials/blueberry_seeds/BlueberrySeedsItem.ts'
import { PricklyPearSeedsItem } from '../materials/prickly_pear_seeds/PricklyPearSeedsItem.ts'
import { PineappleSeedsItem } from '../materials/pineapple_seeds/PineappleSeedsItem.ts'
import { AloeSeedsItem } from '../materials/aloe_seeds/AloeSeedsItem.ts'
import { BerrySeedsItem } from '../materials/berry_seeds/BerrySeedsItem.ts'
import { WoodHoeItem } from '../tools/hoe/WoodHoeItem.ts'
import { StoneHoeItem } from '../tools/hoe/StoneHoeItem.ts'
import { IronHoeItem } from '../tools/hoe/IronHoeItem.ts'
import { SteelHoeItem } from '../tools/hoe/SteelHoeItem.ts'
import { DiamondHoeItem } from '../tools/hoe/DiamondHoeItem.ts'
import { InferniumHoeItem } from '../tools/hoe/InferniumHoeItem.ts'
import { HellbaneHoeItem } from '../tools/hoe/HellbaneHoeItem.ts'

/**
 * Register the Nature Update's items with the persistence item registry
 * (the registrar is ItemRegistry's registerItemFactory, passed in to keep
 * this module free of a circular import): a PlantBlockItem per wild plant
 * that drops itself, the forage bushes and the oak sapling, crops' produce
 * and seeds, the new foods, the bowl and the hoes.
 */
export function registerNatureItems(register: (id: string, factory: () => IItem) => void): void {
  for (const [blockName, label] of WILD_PLANT_ITEMS) {
    register(`${blockName}_block`, () => new PlantBlockItem(blockName, label))
  }
  for (const bush of FORAGE_BUSHES) {
    register(`${bush.name}_block`, () => new PlantBlockItem(bush.name, bush.displayName))
  }
  register('oak_sapling_block', () => new PlantBlockItem('oak_sapling', 'Oak Sapling'))
  register('carrot', () => new CarrotItem())
  register('potato', () => new PotatoItem())
  register('baked_potato', () => new BakedPotatoItem())
  register('tomato', () => new TomatoItem())
  register('onion', () => new OnionItem())
  register('strawberry', () => new StrawberryItem())
  register('pumpkin_pie', () => new PumpkinPieItem())
  register('mushroom_stew', () => new MushroomStewItem())
  register('vegetable_stew', () => new VegetableStewItem())
  register('blueberries', () => new BlueberriesItem())
  register('prickly_pear_fruit', () => new PricklyPearFruitItem())
  register('aloe_leaf', () => new AloeLeafItem())
  register('pineapple', () => new PineappleItem())
  register('tomato_seeds', () => new TomatoSeedsItem())
  register('strawberry_seeds', () => new StrawberrySeedsItem())
  register('pumpkin_seeds', () => new PumpkinSeedsItem())
  register('pumpkin', () => new PumpkinItem())
  register('bowl', () => new BowlItem())
  register('blueberry_seeds', () => new BlueberrySeedsItem())
  register('prickly_pear_seeds', () => new PricklyPearSeedsItem())
  register('pineapple_seeds', () => new PineappleSeedsItem())
  register('aloe_seeds', () => new AloeSeedsItem())
  register('berry_seeds', () => new BerrySeedsItem())
  register('wood_hoe', () => new WoodHoeItem())
  register('stone_hoe', () => new StoneHoeItem())
  register('iron_hoe', () => new IronHoeItem())
  register('steel_hoe', () => new SteelHoeItem())
  register('diamond_hoe', () => new DiamondHoeItem())
  register('infernium_hoe', () => new InferniumHoeItem())
  register('hellbane_hoe', () => new HellbaneHoeItem())
}
