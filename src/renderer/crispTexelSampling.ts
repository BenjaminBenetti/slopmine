/**
 * Pixel-crisp texture magnification that doesn't depend on the sampler.
 *
 * Block textures are pixel art: up close every texel must stay a hard-edged
 * square. NEAREST magnification gives that on most backends, but not with
 * anisotropic filtering on ANGLE's Direct3D 11 backend (the default WebGL
 * path of Chrome, Edge and Firefox on Windows): any sampler with max
 * anisotropy > 1 becomes D3D11's ANISOTROPIC filter, which interpolates for
 * magnification too and ignores GL's min/mag filters. That is why three.js
 * never applies `texture.anisotropy` to a NEAREST-magnified texture.
 *
 * slopCrispTexel() samples at the centre of the level-0 texel the UV falls in
 * and passes the true UV derivatives to textureGrad: any bilinear or
 * anisotropic magnification at an exact texel centre returns just that texel,
 * so magnification is crisp on every backend, while mip selection and
 * anisotropic minification still see the real pixel footprint. Textures
 * sampled this way use LinearFilter magnification, so three.js applies their
 * anisotropy through its normal path.
 *
 * Call from uniform control flow only (it takes screen-space derivatives).
 */
export const CRISP_TEXEL_SAMPLING_GLSL = /* glsl */ `
vec4 slopCrispTexel( sampler2D tex, vec2 uv ) {
  vec2 texelCount = vec2( textureSize( tex, 0 ) );
  return textureGrad( tex, ( floor( uv * texelCount ) + 0.5 ) / texelCount, dFdx( uv ), dFdy( uv ) );
}
vec4 slopCrispTexel( sampler2DArray tex, vec3 uvLayer ) {
  vec2 texelCount = vec2( textureSize( tex, 0 ).xy );
  vec2 uv = ( floor( uvLayer.xy * texelCount ) + 0.5 ) / texelCount;
  return textureGrad( tex, vec3( uv, uvLayer.z ), dFdx( uvLayer.xy ), dFdy( uvLayer.xy ) );
}
`
