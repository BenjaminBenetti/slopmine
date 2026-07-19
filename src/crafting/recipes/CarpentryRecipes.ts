import type { IRecipe } from '../RecipeRegistry.ts'
import type { IWoodworkingRecipe } from '../../woodworking/interfaces/IWoodworkingRecipe.ts'
import type { IItem } from '../../items/Item.ts'
import { StickItem } from '../../items/materials/stick/StickItem.ts'
import { OakPlanksBlockItem } from '../../items/blocks/oak_planks/OakPlanksBlockItem.ts'
import { OakSlabBlockItem } from '../../items/blocks/oak_slab/OakSlabBlockItem.ts'
import { OakStairsBlockItem } from '../../items/blocks/oak_stairs/OakStairsBlockItem.ts'
import { OakFenceBlockItem } from '../../items/blocks/oak_fence/OakFenceBlockItem.ts'
import { OakFenceGateBlockItem } from '../../items/blocks/oak_fence_gate/OakFenceGateBlockItem.ts'
import { OakDoorBlockItem } from '../../items/blocks/oak_door/OakDoorBlockItem.ts'
import { OakTrapdoorBlockItem } from '../../items/blocks/oak_trapdoor/OakTrapdoorBlockItem.ts'
import { OakTableBlockItem } from '../../items/blocks/oak_table/OakTableBlockItem.ts'
import { OakChairBlockItem } from '../../items/blocks/oak_chair/OakChairBlockItem.ts'
import { OakShelfBlockItem } from '../../items/blocks/oak_shelf/OakShelfBlockItem.ts'
import { OakWindowBlockItem } from '../../items/blocks/oak_window/OakWindowBlockItem.ts'
import { PinePlanksBlockItem } from '../../items/blocks/pine_planks/PinePlanksBlockItem.ts'
import { PineSlabBlockItem } from '../../items/blocks/pine_slab/PineSlabBlockItem.ts'
import { PineStairsBlockItem } from '../../items/blocks/pine_stairs/PineStairsBlockItem.ts'
import { PineFenceBlockItem } from '../../items/blocks/pine_fence/PineFenceBlockItem.ts'
import { PineFenceGateBlockItem } from '../../items/blocks/pine_fence_gate/PineFenceGateBlockItem.ts'
import { PineDoorBlockItem } from '../../items/blocks/pine_door/PineDoorBlockItem.ts'
import { PineTrapdoorBlockItem } from '../../items/blocks/pine_trapdoor/PineTrapdoorBlockItem.ts'
import { PineTableBlockItem } from '../../items/blocks/pine_table/PineTableBlockItem.ts'
import { PineChairBlockItem } from '../../items/blocks/pine_chair/PineChairBlockItem.ts'
import { PineShelfBlockItem } from '../../items/blocks/pine_shelf/PineShelfBlockItem.ts'
import { PineWindowBlockItem } from '../../items/blocks/pine_window/PineWindowBlockItem.ts'
import { RedwoodPlanksBlockItem } from '../../items/blocks/redwood_planks/RedwoodPlanksBlockItem.ts'
import { RedwoodSlabBlockItem } from '../../items/blocks/redwood_slab/RedwoodSlabBlockItem.ts'
import { RedwoodStairsBlockItem } from '../../items/blocks/redwood_stairs/RedwoodStairsBlockItem.ts'
import { RedwoodFenceBlockItem } from '../../items/blocks/redwood_fence/RedwoodFenceBlockItem.ts'
import { RedwoodFenceGateBlockItem } from '../../items/blocks/redwood_fence_gate/RedwoodFenceGateBlockItem.ts'
import { RedwoodDoorBlockItem } from '../../items/blocks/redwood_door/RedwoodDoorBlockItem.ts'
import { RedwoodTrapdoorBlockItem } from '../../items/blocks/redwood_trapdoor/RedwoodTrapdoorBlockItem.ts'
import { RedwoodTableBlockItem } from '../../items/blocks/redwood_table/RedwoodTableBlockItem.ts'
import { RedwoodChairBlockItem } from '../../items/blocks/redwood_chair/RedwoodChairBlockItem.ts'
import { RedwoodShelfBlockItem } from '../../items/blocks/redwood_shelf/RedwoodShelfBlockItem.ts'
import { RedwoodWindowBlockItem } from '../../items/blocks/redwood_window/RedwoodWindowBlockItem.ts'

/** Item factories for each carpentry product, per wood. */
interface IWoodItemFactories {
  /** Kebab-case recipe id prefix and Title Case name prefix source, e.g. 'oak'. */
  readonly wood: string
  /** Title Case wood name, e.g. 'Oak'. */
  readonly woodName: string
  readonly planks: () => IItem
  readonly slab: () => IItem
  readonly stairs: () => IItem
  readonly fence: () => IItem
  readonly fenceGate: () => IItem
  readonly door: () => IItem
  readonly trapdoor: () => IItem
  readonly table: () => IItem
  readonly chair: () => IItem
  readonly shelf: () => IItem
  readonly window: () => IItem
}

const woods: IWoodItemFactories[] = [
  {
    wood: 'oak',
    woodName: 'Oak',
    planks: () => new OakPlanksBlockItem(),
    slab: () => new OakSlabBlockItem(),
    stairs: () => new OakStairsBlockItem(),
    fence: () => new OakFenceBlockItem(),
    fenceGate: () => new OakFenceGateBlockItem(),
    door: () => new OakDoorBlockItem(),
    trapdoor: () => new OakTrapdoorBlockItem(),
    table: () => new OakTableBlockItem(),
    chair: () => new OakChairBlockItem(),
    shelf: () => new OakShelfBlockItem(),
    window: () => new OakWindowBlockItem(),
  },
  {
    wood: 'pine',
    woodName: 'Pine',
    planks: () => new PinePlanksBlockItem(),
    slab: () => new PineSlabBlockItem(),
    stairs: () => new PineStairsBlockItem(),
    fence: () => new PineFenceBlockItem(),
    fenceGate: () => new PineFenceGateBlockItem(),
    door: () => new PineDoorBlockItem(),
    trapdoor: () => new PineTrapdoorBlockItem(),
    table: () => new PineTableBlockItem(),
    chair: () => new PineChairBlockItem(),
    shelf: () => new PineShelfBlockItem(),
    window: () => new PineWindowBlockItem(),
  },
  {
    wood: 'redwood',
    woodName: 'Redwood',
    planks: () => new RedwoodPlanksBlockItem(),
    slab: () => new RedwoodSlabBlockItem(),
    stairs: () => new RedwoodStairsBlockItem(),
    fence: () => new RedwoodFenceBlockItem(),
    fenceGate: () => new RedwoodFenceGateBlockItem(),
    door: () => new RedwoodDoorBlockItem(),
    trapdoor: () => new RedwoodTrapdoorBlockItem(),
    table: () => new RedwoodTableBlockItem(),
    chair: () => new RedwoodChairBlockItem(),
    shelf: () => new RedwoodShelfBlockItem(),
    window: () => new RedwoodWindowBlockItem(),
  },
]

function makeWoodworkingRecipes(w: IWoodItemFactories): IWoodworkingRecipe[] {
  const planksId = `${w.wood}_planks_block`
  return [
    {
      id: `${w.wood}-planks`,
      name: `${w.woodName} Planks`,
      inputItemId: `${w.wood}_log_block`,
      inputCount: 1,
      createResult: w.planks,
      resultCount: 4,
    },
    {
      id: `${w.wood}-slab`,
      name: `${w.woodName} Slab`,
      inputItemId: planksId,
      inputCount: 1,
      createResult: w.slab,
      resultCount: 2,
    },
    {
      id: `${w.wood}-stairs`,
      name: `${w.woodName} Stairs`,
      inputItemId: planksId,
      inputCount: 3,
      createResult: w.stairs,
      resultCount: 2,
    },
    {
      id: `${w.wood}-fence`,
      name: `${w.woodName} Fence`,
      inputItemId: planksId,
      inputCount: 2,
      createResult: w.fence,
      resultCount: 2,
    },
    {
      id: `${w.wood}-fence-gate`,
      name: `${w.woodName} Fence Gate`,
      inputItemId: planksId,
      inputCount: 2,
      createResult: w.fenceGate,
      resultCount: 1,
    },
    {
      id: `${w.wood}-door`,
      name: `${w.woodName} Door`,
      inputItemId: planksId,
      inputCount: 3,
      createResult: w.door,
      resultCount: 1,
    },
    {
      id: `${w.wood}-trapdoor`,
      name: `${w.woodName} Trapdoor`,
      inputItemId: planksId,
      inputCount: 2,
      createResult: w.trapdoor,
      resultCount: 1,
    },
    {
      id: `${w.wood}-table`,
      name: `${w.woodName} Table`,
      inputItemId: planksId,
      inputCount: 3,
      createResult: w.table,
      resultCount: 1,
    },
    {
      id: `${w.wood}-chair`,
      name: `${w.woodName} Chair`,
      inputItemId: planksId,
      inputCount: 2,
      createResult: w.chair,
      resultCount: 1,
    },
    {
      id: `${w.wood}-shelf`,
      name: `${w.woodName} Shelf`,
      inputItemId: planksId,
      inputCount: 2,
      createResult: w.shelf,
      resultCount: 1,
    },
    {
      id: `${w.wood}-stick`,
      name: `${w.woodName} Stick`,
      inputItemId: planksId,
      inputCount: 1,
      createResult: () => new StickItem(),
      resultCount: 4,
    },
  ]
}

function makeWindowRecipe(w: IWoodItemFactories): IRecipe {
  return {
    id: `${w.wood}-window`,
    name: `${w.woodName} Window`,
    ingredients: [
      { itemId: `${w.wood}_planks_block`, count: 2 },
      { itemId: 'glass_block', count: 1 },
    ],
    createResult: w.window,
    resultCount: 1,
  }
}

/** All carpentry recipes crafted at the woodworking bench (11 per wood). */
export const carpentryWoodworkingRecipes: IWoodworkingRecipe[] =
  woods.flatMap(makeWoodworkingRecipes)

/** Hand-crafted carpentry recipes (windows). */
export const carpentryHandRecipes: IRecipe[] = woods.map(makeWindowRecipe)
