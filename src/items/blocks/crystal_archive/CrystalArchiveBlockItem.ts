import { BlockItem } from '../../BlockItem.ts'

/** Crystal Archive block item (Prism Sanctum). */
export class CrystalArchiveBlockItem extends BlockItem {
  readonly id = 'crystal_archive_block'
  readonly name = 'crystal_archive_block'
  readonly blockName = 'crystal_archive'

  override get displayName(): string {
    return 'Crystal Archive'
  }
}
