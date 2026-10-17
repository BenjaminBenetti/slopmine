import { Item } from '../../Item.ts'

/**
 * Bone meal: ground bone (1 bone makes 3). Right-click a growing crop
 * (wheat, hemp, herb) to grow it a stage, or a picked berry bush to ripen
 * it (see src/progression/BoneMeal.ts).
 */
export class BoneMealItem extends Item {
  readonly id = 'bone_meal'
  readonly name = 'bone_meal'

  override get displayName(): string {
    return 'Bone Meal'
  }

  override get iconUrl(): string {
    return new URL('./assets/bone-meal-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'fertilizer']
  }
}
