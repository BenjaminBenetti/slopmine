/**
 * sRGB transfer function (IEC 61966-2-1) for LOD colours, shared by the
 * palette builder (exact) and the mesher (lookup tables built from the same
 * functions). Pure math: runs in the LOD worker. LodMaterial's GLSL decodes
 * palette colours with the same constants.
 */

/** sRGB-encoded channel (0-1) → linear. */
export function srgbToLinearChannel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Linear channel (0-1) → sRGB-encoded. */
export function linearToSrgbChannel(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

/** sRGB byte (0-255) → linear 0-1. */
export function srgbByteToLinear(value: number): number {
  return srgbToLinearChannel(value / 255)
}

/** Linear value (clamped to 0-1) → sRGB byte (0-255). */
export function linearToSrgbByte(value: number): number {
  return Math.round(linearToSrgbChannel(Math.max(0, Math.min(1, value))) * 255)
}
