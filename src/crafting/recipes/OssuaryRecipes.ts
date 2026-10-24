import type { IRecipe } from '../RecipeRegistry.ts'
import { BoneItem } from '../../items/materials/bone/BoneItem.ts'
import { BoneBlockItem } from '../../items/blocks/bone_block/BoneBlockItem.ts'
import { SoulTorchBlockItem } from '../../items/blocks/soul_torch/SoulTorchBlockItem.ts'
import { SoulLanternBlockItem } from '../../items/blocks/soul_lantern/SoulLanternBlockItem.ts'

/**
 * The Ossuary's hand recipes: bone blocks (6 bones, reversible) and the
 * soul-fire lights made from soul shards.
 */
export const boneBlockRecipe: IRecipe = {
  id: 'bone_block',
  name: 'Bone Block',
  ingredients: [{ itemId: 'bone', count: 6 }],
  createResult: () => new BoneBlockItem(),
  resultCount: 1,
}

export const bonesFromBoneBlockRecipe: IRecipe = {
  id: 'bone_from_bone_block',
  name: 'Bone',
  ingredients: [{ itemId: 'bone_block', count: 1 }],
  createResult: () => new BoneItem(),
  resultCount: 6,
}

export const soulTorchRecipe: IRecipe = {
  id: 'soul_torch',
  name: 'Soul Torch',
  ingredients: [
    { itemId: 'bone', count: 1 },
    { itemId: 'soul_shard', count: 1 },
  ],
  createResult: () => new SoulTorchBlockItem(),
  resultCount: 4,
}

export const soulLanternRecipe: IRecipe = {
  id: 'soul_lantern',
  name: 'Soul Lantern',
  ingredients: [
    { itemId: 'bone_block', count: 2 },
    { itemId: 'soul_shard', count: 1 },
  ],
  createResult: () => new SoulLanternBlockItem(),
  resultCount: 2,
}

export const ossuaryHandRecipes: IRecipe[] = [
  boneBlockRecipe,
  bonesFromBoneBlockRecipe,
  soulTorchRecipe,
  soulLanternRecipe,
]
