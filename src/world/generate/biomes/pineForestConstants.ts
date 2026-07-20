/**
 * Shared pine-forest generation constants.
 *
 * Lives in its own tiny module (rather than PineForestGenerator.ts) because
 * PineTreeFeature runs inside ChunkGenerationWorker: both the biome generator
 * and the worker-side feature import this one source of truth, so surface
 * snow (fillChunk) and canopy snow (PineTreeFeature) always agree on the
 * same line.
 */

/**
 * World Y at and above which the pine forest is snow-dusted: surface grass
 * becomes SNOWY_GRASS and pine canopies become SNOWY_PINE_NEEDLES.
 *
 * Math (see PineForestGenerator terrainConfig): terrain height =
 * seaLevel(240) + baseHeight(6) + combinedNoise × heightScale(14). The two
 * rolling fractal layers give heights ~232..260; the clamped ridged mountain
 * layer adds up to ~24 more on ridge crests, for peaks near 284. Measured
 * offline against the real noise: ~28% of terrain sits above 252 (snowy
 * foothills and mountains), ~8% above 265 (proper peaks).
 */
export const SNOW_LINE_Y = 252

/**
 * Canopy snow is a probabilistic dusting, not a hard cut: each leaf rolls
 * against a chance that ramps from 0 at SNOW_DUSTING_START_Y to 1 at
 * SNOW_DUSTING_FULL_Y, so canopies whiten gradually with altitude instead of
 * showing a solid horizontal line.
 *
 * The band sits well above the ground snow line on purpose: valley trees on
 * rolling terrain (surface ~243..260, canopies up to ~263) stay mostly green
 * with only their tips catching flecks, while trees on mountain slopes
 * (surface 260+, canopies to ~295) whiten fully. The 50% point lands at ~263.
 */
export const SNOW_DUSTING_START_Y = SNOW_LINE_Y + 4
export const SNOW_DUSTING_FULL_Y = SNOW_LINE_Y + 18
