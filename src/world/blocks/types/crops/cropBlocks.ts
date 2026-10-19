import { BlockIds } from '../../BlockIds.ts'
import { CropBlock, rollCount, type CropDefinition } from './CropBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { CarrotItem } from '../../../../items/food/carrot/CarrotItem.ts'
import { PotatoItem } from '../../../../items/food/potato/PotatoItem.ts'
import { TomatoItem } from '../../../../items/food/tomato/TomatoItem.ts'
import { OnionItem } from '../../../../items/food/onion/OnionItem.ts'
import { StrawberryItem } from '../../../../items/food/strawberry/StrawberryItem.ts'
import { TomatoSeedsItem } from '../../../../items/materials/tomato_seeds/TomatoSeedsItem.ts'
import { StrawberrySeedsItem } from '../../../../items/materials/strawberry_seeds/StrawberrySeedsItem.ts'
import { PumpkinSeedsItem } from '../../../../items/materials/pumpkin_seeds/PumpkinSeedsItem.ts'
import { PumpkinItem } from '../../../../items/materials/pumpkin/PumpkinItem.ts'
import { Wheat1BlockItem } from '../../../../items/blocks/wheat/Wheat1BlockItem.ts'
import { Hemp1BlockItem } from '../../../../items/blocks/hemp/Hemp1BlockItem.ts'
import { Herb1BlockItem } from '../../../../items/blocks/herb/Herb1BlockItem.ts'
import { WheatItem } from '../../../../items/food/wheat/WheatItem.ts'
import { HempFiberItem } from '../../../../items/materials/hemp_fiber/HempFiberItem.ts'
import { HerbItem } from '../../../../items/materials/herb/HerbItem.ts'
import wheat1Url from '../wheat/assets/wheat-1.webp'
import wheat2Url from '../wheat/assets/wheat-2.webp'
import wheat3Url from '../wheat/assets/wheat-3.webp'
import hemp1Url from '../hemp/assets/hemp-1.webp'
import hemp2Url from '../hemp/assets/hemp-2.webp'
import hemp3Url from '../hemp/assets/hemp-3.webp'
import herb1Url from '../herb/assets/herb-1.webp'
import herb2Url from '../herb/assets/herb-2.webp'
import herb3Url from '../herb/assets/herb-3.webp'
import carrot1Url from './assets/carrot_1.webp'
import carrot2Url from './assets/carrot_2.webp'
import carrot3Url from './assets/carrot_3.webp'
import carrot4Url from './assets/carrot_4.webp'
import potato1Url from './assets/potato_1.webp'
import potato2Url from './assets/potato_2.webp'
import potato3Url from './assets/potato_3.webp'
import potato4Url from './assets/potato_4.webp'
import tomato1Url from './assets/tomato_1.webp'
import tomato2Url from './assets/tomato_2.webp'
import tomato3Url from './assets/tomato_3.webp'
import tomato4Url from './assets/tomato_4.webp'
import onion1Url from './assets/onion_1.webp'
import onion2Url from './assets/onion_2.webp'
import onion3Url from './assets/onion_3.webp'
import onion4Url from './assets/onion_4.webp'
import strawberry1Url from './assets/strawberry_1.webp'
import strawberry2Url from './assets/strawberry_2.webp'
import strawberry3Url from './assets/strawberry_3.webp'
import strawberry4Url from './assets/strawberry_4.webp'
import pumpkin1Url from './assets/pumpkin_1.webp'
import pumpkin2Url from './assets/pumpkin_2.webp'
import pumpkin3Url from './assets/pumpkin_3.webp'
import pumpkin4Url from './assets/pumpkin_4.webp'

function repeat(count: number, make: () => IItem): IItem[] {
  return Array.from({ length: count }, make)
}

/**
 * The farm crops (see CropBlock): wheat, hemp and herb (three stages, the
 * original crops - their seed items place stage 1), and the Nature Update's
 * four-stage crops: carrots, potatoes and onions are replanted from the
 * harvest itself; tomatoes, strawberries and pumpkins from their seeds (the
 * ripe crop drops some; a pumpkin cuts into four).
 */
export const CROP_DEFINITIONS: readonly CropDefinition[] = [
  // The original three-stage crops (full-square sprites)
  {
    name: 'wheat',
    displayName: 'Wheat',
    stageSeconds: 150,
    stages: [
      { id: BlockIds.WHEAT_1, sprite: wheat1Url, height: 0.4, width: 0.7, spriteHeight: 1 },
      { id: BlockIds.WHEAT_2, sprite: wheat2Url, height: 0.7, width: 0.8, spriteHeight: 1 },
      { id: BlockIds.WHEAT_3, sprite: wheat3Url, height: 1.0, width: 0.85, spriteHeight: 1 },
    ],
    seed: () => new Wheat1BlockItem(),
    harvest: () => [...repeat(rollCount(1, 3), () => new Wheat1BlockItem()), ...repeat(rollCount(1, 5), () => new WheatItem())],
  },
  {
    name: 'hemp',
    displayName: 'Hemp',
    stageSeconds: 150,
    baseHeight: -0.1,
    stages: [
      { id: BlockIds.HEMP_1, sprite: hemp1Url, height: 0.4, width: 0.7, spriteHeight: 1 },
      { id: BlockIds.HEMP_2, sprite: hemp2Url, height: 0.7, width: 0.8, spriteHeight: 1 },
      { id: BlockIds.HEMP_3, sprite: hemp3Url, height: 1.1, width: 0.85, spriteHeight: 1 },
    ],
    seed: () => new Hemp1BlockItem(),
    harvest: () => [...repeat(rollCount(1, 3), () => new Hemp1BlockItem()), ...repeat(rollCount(1, 5), () => new HempFiberItem())],
  },
  {
    name: 'herb',
    displayName: 'Herb',
    stageSeconds: 150,
    stages: [
      { id: BlockIds.HERB_1, sprite: herb1Url, height: 0.4, width: 0.7, spriteHeight: 1 },
      { id: BlockIds.HERB_2, sprite: herb2Url, height: 0.7, width: 0.8, spriteHeight: 1 },
      { id: BlockIds.HERB_3, sprite: herb3Url, height: 1.0, width: 0.85, spriteHeight: 1 },
    ],
    seed: () => new Herb1BlockItem(),
    harvest: () => [...repeat(rollCount(1, 3), () => new Herb1BlockItem()), ...repeat(rollCount(1, 2), () => new HerbItem())],
  },
  {
    name: 'carrot',
    displayName: 'Carrot',
    stageSeconds: 110,
    stages: [
      { id: BlockIds.CARROT_1, sprite: carrot1Url, height: 0.35 },
      { id: BlockIds.CARROT_2, sprite: carrot2Url, height: 0.55 },
      { id: BlockIds.CARROT_3, sprite: carrot3Url, height: 0.75 },
      { id: BlockIds.CARROT_4, sprite: carrot4Url, height: 0.9 },
    ],
    seed: () => new CarrotItem(),
    harvest: () => [...repeat(rollCount(2, 4), () => new CarrotItem())],
  },
  {
    name: 'potato',
    displayName: 'Potato',
    stageSeconds: 110,
    stages: [
      { id: BlockIds.POTATO_1, sprite: potato1Url, height: 0.3 },
      { id: BlockIds.POTATO_2, sprite: potato2Url, height: 0.5 },
      { id: BlockIds.POTATO_3, sprite: potato3Url, height: 0.65 },
      { id: BlockIds.POTATO_4, sprite: potato4Url, height: 0.75 },
    ],
    seed: () => new PotatoItem(),
    harvest: () => [...repeat(rollCount(2, 4), () => new PotatoItem())],
  },
  {
    name: 'tomato',
    displayName: 'Tomato',
    stageSeconds: 130,
    stages: [
      { id: BlockIds.TOMATO_1, sprite: tomato1Url, height: 0.35 },
      { id: BlockIds.TOMATO_2, sprite: tomato2Url, height: 0.6 },
      { id: BlockIds.TOMATO_3, sprite: tomato3Url, height: 0.85 },
      { id: BlockIds.TOMATO_4, sprite: tomato4Url, height: 1.0 },
    ],
    seed: () => new TomatoSeedsItem(),
    harvest: () => [...repeat(rollCount(2, 4), () => new TomatoItem()), ...repeat(rollCount(1, 2), () => new TomatoSeedsItem())],
  },
  {
    name: 'onion',
    displayName: 'Onion',
    stageSeconds: 100,
    stages: [
      { id: BlockIds.ONION_1, sprite: onion1Url, height: 0.35 },
      { id: BlockIds.ONION_2, sprite: onion2Url, height: 0.55 },
      { id: BlockIds.ONION_3, sprite: onion3Url, height: 0.7 },
      { id: BlockIds.ONION_4, sprite: onion4Url, height: 0.8 },
    ],
    seed: () => new OnionItem(),
    harvest: () => [...repeat(rollCount(2, 3), () => new OnionItem())],
  },
  {
    name: 'strawberry',
    displayName: 'Strawberry',
    stageSeconds: 120,
    stages: [
      { id: BlockIds.STRAWBERRY_1, sprite: strawberry1Url, height: 0.25 },
      { id: BlockIds.STRAWBERRY_2, sprite: strawberry2Url, height: 0.35 },
      { id: BlockIds.STRAWBERRY_3, sprite: strawberry3Url, height: 0.45 },
      { id: BlockIds.STRAWBERRY_4, sprite: strawberry4Url, height: 0.5 },
    ],
    seed: () => new StrawberrySeedsItem(),
    harvest: () => [...repeat(rollCount(2, 4), () => new StrawberryItem()), ...repeat(rollCount(1, 2), () => new StrawberrySeedsItem())],
  },
  {
    name: 'pumpkin',
    displayName: 'Pumpkin',
    stageSeconds: 150,
    stages: [
      { id: BlockIds.PUMPKIN_1, sprite: pumpkin1Url, height: 0.3 },
      { id: BlockIds.PUMPKIN_2, sprite: pumpkin2Url, height: 0.45 },
      { id: BlockIds.PUMPKIN_3, sprite: pumpkin3Url, height: 0.55 },
      { id: BlockIds.PUMPKIN_4, sprite: pumpkin4Url, height: 0.7 },
    ],
    seed: () => new PumpkinSeedsItem(),
    harvest: () => [new PumpkinItem(), ...repeat(rollCount(1, 2), () => new PumpkinSeedsItem())],
  },
]

/** Every stage block of every crop. */
export function createCropBlocks(): CropBlock[] {
  return CROP_DEFINITIONS.flatMap((crop) => crop.stages.map((_, stage) => new CropBlock(crop, stage)))
}
