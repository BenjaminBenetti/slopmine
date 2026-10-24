import * as THREE from 'three'
import type { BlockFace, BlockId, IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { PlantBlockItem } from '../../../../items/blocks/plants/PlantBlockItem.ts'
import { buildDecorGeometry, type DecorBox } from '../molten_decor/DecorGeometry.ts'

/** A material of a decor model: a Lambert colour, or a self-lit one (`glow`). */
export interface DecorColor {
  readonly color: number
  readonly glow?: boolean
}

/** Box in cell space 0..1: [x0, y0, z0, x1, y1, z1]. */
export type CellBounds = readonly [number, number, number, number, number, number]

export interface PoiDecorSpec {
  readonly id: BlockId
  readonly name: string
  readonly displayName: string
  readonly textureId: number
  /** The model (cell space -0.5..0.5, canonical front facing +Z); `m` indexes `colors`. */
  readonly boxes: readonly DecorBox[]
  readonly colors: readonly DecorColor[]
  readonly hardness: number
  readonly force: number
  readonly tags: readonly string[]
  readonly lightLevel?: number
  /** Collision box (cell space 0..1); omitted = walk-through. */
  readonly collision?: CellBounds
  /** Targeting box (cell space 0..1). */
  readonly interaction: CellBounds
  /** Default: the block's own item. */
  readonly drops?: () => IItem[]
}

const toBox = (b: CellBounds): THREE.Box3 => new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5]))

/**
 * A small box-modelled decoration of the points of interest (hoards, coins,
 * skulls, barrels, lanterns, idols...): instanced, coloured materials, no
 * texture layer. Built from a data spec (poiDecorBlocks.ts).
 */
export class PoiDecorBlock extends TransparentBlock {
  readonly properties: IBlockProperties
  private readonly geometry: THREE.BufferGeometry
  private readonly materials: THREE.Material[]
  private readonly collision: THREE.Box3 | null
  private readonly interaction: THREE.Box3

  constructor(private readonly spec: PoiDecorSpec) {
    super()
    this.properties = {
      id: spec.id,
      name: spec.name,
      isOpaque: false,
      isSolid: spec.collision !== undefined,
      isLiquid: false,
      hardness: spec.hardness,
      lightLevel: spec.lightLevel ?? 0,
      lightBlocking: 0,
      demolitionForceRequired: spec.force,
      tags: spec.tags,
    }
    this.geometry = buildDecorGeometry(spec.boxes)
    this.materials = spec.colors.map((c) =>
      c.glow ? new THREE.MeshBasicMaterial({ color: c.color }) : new THREE.MeshLambertMaterial({ color: c.color })
    )
    this.collision = spec.collision ? toBox(spec.collision) : null
    this.interaction = toBox(spec.interaction)
  }

  protected get defaultTextureId(): number {
    return this.spec.textureId
  }

  protected getGeometry(): THREE.BufferGeometry {
    return this.geometry
  }

  protected getMaterials(): THREE.Material[] {
    return this.materials
  }

  isGreedyMeshable(): boolean {
    return false
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  getCollisionBox(): THREE.Box3 | null {
    return this.collision
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return this.interaction
  }

  getDrops(): IItem[] {
    return this.spec.drops ? this.spec.drops() : [new PlantBlockItem(this.spec.name, this.spec.displayName)]
  }
}
