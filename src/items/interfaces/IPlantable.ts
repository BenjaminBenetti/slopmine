import type { IItem } from '../Item.ts'

/**
 * An item that is planted as a crop (seeds, a carrot, a potato): right-click
 * on farmland places `plantsBlock` (a block name) above it. An edible
 * plantable is planted when aimed at farmland and eaten otherwise.
 */
export interface IPlantable {
  readonly plantsBlock: string
}

export function isPlantable(item: IItem): item is IItem & IPlantable {
  return typeof (item as Partial<IPlantable>).plantsBlock === 'string'
}
