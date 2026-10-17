/** Size of a biome region in blocks (16 chunks × 32). */
export const REGION_SIZE_BLOCKS = 512

/**
 * True if the square [x - reach, x + reach] × [z - reach, z + reach] lies in
 * a single 512-block biome region.
 *
 * Why structures need this: the generation worker computes blended terrain
 * heights from the blend data of the CHUNK being generated (its region and
 * that region's 8 neighbours). A column in another region seen from here
 * can blend against different neighbours than it does from its own chunks,
 * so a structure spanning two regions could get two different base heights
 * - one per side. Keeping every structure inside one region makes all of
 * its slices agree. Pure function of position: the dungeon locator can
 * replicate it exactly.
 */
export function staysInOneRegion(x: number, z: number, reach: number): boolean {
  return (
    Math.floor((x - reach) / REGION_SIZE_BLOCKS) === Math.floor((x + reach) / REGION_SIZE_BLOCKS) &&
    Math.floor((z - reach) / REGION_SIZE_BLOCKS) === Math.floor((z + reach) / REGION_SIZE_BLOCKS)
  )
}
