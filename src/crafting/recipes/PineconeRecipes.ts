import type { IRecipe } from '../RecipeRegistry.ts'
import { PineSaplingBlockItem } from '../../items/blocks/pine_sapling/PineSaplingBlockItem.ts'

/**
 * Pine sapling: crafted from a single pinecone gathered beneath pine
 * canopies. Plant it on grass/dirt/podzol/snowy grass to regrow felled
 * forests - it matures into a full pine after a couple of minutes.
 */
export const pineSaplingRecipe: IRecipe = {
  id: 'pine_sapling',
  name: 'Pine Sapling',
  ingredients: [{ itemId: 'pinecone', count: 1 }],
  createResult: () => new PineSaplingBlockItem(),
  resultCount: 1,
}

export const pineconeRecipes: IRecipe[] = [pineSaplingRecipe]
