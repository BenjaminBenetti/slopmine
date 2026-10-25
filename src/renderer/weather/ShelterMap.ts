import * as THREE from 'three'

/**
 * Where weather can fall: a world-anchored height map around the camera of
 * the highest cell each column's precipitation reaches down to (its floor) -
 * the ground, a roof, a leaf canopy, the water's surface. The particle shader
 * hides every particle below its column's floor, so nothing falls indoors, in
 * caves or under overhangs, and splashes land on the floor.
 *
 * SIZE × SIZE columns, repeat-wrapped (texel = world x/z mod SIZE): a moving
 * camera only needs the columns entering the window refreshed. Columns are
 * rebuilt a slice per frame (COLUMNS_PER_FRAME) straight from the chunk
 * arrays; a full sweep takes SIZE² / COLUMNS_PER_FRAME frames.
 */

export const SHELTER_SIZE = 128
const COLUMNS_PER_FRAME = 1024

/** A loaded chunk column as the shelter scan reads it (ChunkColumn fits). */
export interface ShelterColumn {
  /** Per column (z * 32 + x): the lowest Y with direct sky (CHUNK_HEIGHT when covered from the top). */
  readonly skyFloor: Int16Array
  getSubChunk(subY: number): { getBlockData(): Uint16Array } | null
}

export interface ShelterWorld {
  getColumn(cx: number, cz: number): ShelterColumn | undefined
}

export class ShelterMap {
  readonly texture: THREE.DataTexture
  private readonly data: Float32Array
  /** Next column of the sweep (index into the window). */
  private cursor = 0
  private camX = 0
  private camZ = 0
  private top = 0
  private bottom = 0
  private cavern = false

  /**
   * @param world chunk access
   * @param blocksWeather per block id: 1 if weather stops on it (solid, liquid, leaves)
   */
  constructor(private readonly world: ShelterWorld, private readonly blocksWeather: Uint8Array) {
    this.data = new Float32Array(SHELTER_SIZE * SHELTER_SIZE).fill(1e4)
    this.texture = new THREE.DataTexture(this.data, SHELTER_SIZE, SHELTER_SIZE, THREE.RedFormat, THREE.FloatType)
    this.texture.wrapS = THREE.RepeatWrapping
    this.texture.wrapT = THREE.RepeatWrapping
    this.texture.magFilter = THREE.NearestFilter
    this.texture.minFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
  }

  /**
   * Refresh the next slice of columns around the camera.
   * @param top highest Y weather falls from (the particle box top)
   * @param bottom lowest Y anything is drawn at (the box bottom)
   * @param cavern in the Hell cavern: no sky - scan down from `top` for the first cell weather stops on
   */
  update(camX: number, camZ: number, top: number, bottom: number, cavern: boolean): void {
    this.camX = Math.floor(camX)
    this.camZ = Math.floor(camZ)
    this.top = Math.floor(top)
    this.bottom = Math.floor(bottom)
    if (cavern !== this.cavern) {
      this.cavern = cavern
      this.cursor = 0
    }
    const half = SHELTER_SIZE / 2
    const total = SHELTER_SIZE * SHELTER_SIZE
    for (let n = 0; n < COLUMNS_PER_FRAME; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % total
      const wx = this.camX - half + (i % SHELTER_SIZE)
      const wz = this.camZ - half + Math.floor(i / SHELTER_SIZE)
      const tx = ((wx % SHELTER_SIZE) + SHELTER_SIZE) % SHELTER_SIZE
      const tz = ((wz % SHELTER_SIZE) + SHELTER_SIZE) % SHELTER_SIZE
      this.data[tz * SHELTER_SIZE + tx] = this.columnFloor(wx, wz)
    }
    this.texture.needsUpdate = true
  }

  /** Floor of a column (cached value from the last sweep). */
  floorAt(x: number, z: number): number {
    const tx = ((Math.floor(x) % SHELTER_SIZE) + SHELTER_SIZE) % SHELTER_SIZE
    const tz = ((Math.floor(z) % SHELTER_SIZE) + SHELTER_SIZE) % SHELTER_SIZE
    return this.data[tz * SHELTER_SIZE + tx]
  }

  /**
   * Share of the sky open around a point (0-1): columns within `radius` whose
   * floor is at or below `y` (no roof between them and the weather).
   */
  openness(x: number, y: number, z: number, radius = 4): number {
    let open = 0
    let count = 0
    for (let dz = -radius; dz <= radius; dz += 2) {
      for (let dx = -radius; dx <= radius; dx += 2) {
        if (this.floorAt(x + dx, z + dz) <= y + 1) open++
        count++
      }
    }
    return open / count
  }

  private columnFloor(x: number, z: number): number {
    const column = this.world.getColumn(x >> 5, z >> 5)
    const top = this.top
    if (!column) return top + 1
    const lx = x & 31
    const lz = z & 31
    if (this.cavern) return this.scan(column, lx, lz, top, this.bottom) ?? this.bottom - 1
    const sky = column.skyFloor[(lz << 5) | lx]
    // Covered above the box (a cave roof, a tall building): nothing falls here
    if (sky > top) return top + 1
    // Cells above the sky floor are all light-clear; only glass and the like stop weather there
    return this.scan(column, lx, lz, top, Math.max(sky, this.bottom)) ?? sky
  }

  /** First cell weather stops on from `from` down to `to` (inclusive): its top (y + 1), or null. */
  private scan(column: ShelterColumn, lx: number, lz: number, from: number, to: number): number | null {
    const table = this.blocksWeather
    const local = (lz << 5) | lx
    let subY = -1
    let blocks: Uint16Array | null = null
    for (let y = from; y >= to; y--) {
      if (y < 0) break
      const s = y >> 5
      if (s !== subY) {
        subY = s
        const sub = column.getSubChunk(s)
        blocks = sub ? sub.getBlockData() : null
        if (!blocks) {
          // An unloaded sub-chunk: skip it
          y = s * 32
          continue
        }
      }
      const id = blocks![((y & 31) << 10) | local]
      if (id !== 0 && table[id] === 1) return y + 1
    }
    return null
  }

  dispose(): void {
    this.texture.dispose()
  }
}
