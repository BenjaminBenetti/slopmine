import { BlockItem } from '../../BlockItem.ts'

/** Mirror Panel block item (Prism Sanctum). */
export class MirrorPanelBlockItem extends BlockItem {
  readonly id = 'mirror_panel_block'
  readonly name = 'mirror_panel_block'
  readonly blockName = 'mirror_panel'

  override get displayName(): string {
    return 'Mirror Panel'
  }
}
