import * as THREE from 'three'

/**
 * Weather you can see coming: the weather map (weather/WeatherSkyMap.ts, a
 * world-anchored texture of the weather around the player) read along each
 * view ray, so a storm two kilometres off is a grey wall of rain on the
 * horizon, a sandstorm a rolling brown wall swallowing the land, a fog bank
 * a white sea over the lowlands - on the sky dome (Skybox) and on the land
 * (DistanceFog's fog_fragment) alike, the two reading the same rays so the
 * land's edge melts into the same weather as the sky behind it.
 *
 * The near SLOP_WX_NEAR blocks are the weather where the player stands (the
 * live look's haze, in the fog colour); beyond, the map: haze extinction and
 * ground fog per cell, coloured like that cell's sky (overcast grey, storm
 * dim, sand or ash tint) under the horizon's colour.
 *
 * The uniforms are shared by reference by every fogged material (see
 * DistanceFog): the textures hand themselves out instead of being cloned per
 * material, the parameters are plain objects.
 */

/** A DataTexture all materials share: three clones texture uniforms per material, this one returns itself. */
export class SharedDataTexture extends THREE.DataTexture {
  override clone(): this {
    return this
  }
}

/** Map A: r = haze extinction / HAZE_SCALE, g = ground fog / FOG_SCALE, b = storm darkness, a = cloud cover (COVER_BIAS/RANGE). */
export const WEATHER_HAZE_SCALE = 0.032
export const WEATHER_FOG_SCALE = 0.12
/** Map B: rgb = the weather's sky tint / TINT_SCALE, a = how grey (overcast) its sky is. */
export const WEATHER_TINT_SCALE = 1.25
/** The near part of every ray: the weather here (blocks). */
export const WEATHER_NEAR = 80
/** Rays read the map out to here at most (blocks; the map reaches about 2050 each way). */
export const WEATHER_MARCH_MAX = 2000
/** Distant fog banks lie below this height. */
export const WEATHER_FOG_TOP = 262
/**
 * The weather's cloud base above the camera (blocks): a ray reads weather
 * until it rises through it, so a storm a kilometre off is a wall up to ~12°
 * with its dark deck above, a near one fills half the sky. A flat deck (the
 * dome's cloud shapes keep their own, lower-looking deck), within the map.
 */
export const WEATHER_DECK_HEIGHT = 260
const WEATHER_DECK_FLATTEN = 0.03

/** The weather map: MAP_SIZE² cells, repeat-wrapped (world-anchored), filled by weather/WeatherSkyMap.ts. */
export const WEATHER_MAP_SIZE = 64

function createMap(): SharedDataTexture {
  const texture = new SharedDataTexture(new Uint8Array(WEATHER_MAP_SIZE * WEATHER_MAP_SIZE * 4), WEATHER_MAP_SIZE, WEATHER_MAP_SIZE)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

/**
 * The two map textures. Created once and written in place (a material
 * keeps the uniform it was given: these objects must never be replaced).
 */
export const weatherMapA = createMap()
export const weatherMapB = createMap()

/** Shared uniform values (by reference) - see the module comment. */
export const weatherFieldParams = {
  /** 1 / the map's span in blocks (WeatherSkyMap sets it). */
  x: 1 / 4096,
  /** 0-1: reading the map at all (none in caves, underwater, or with no weather on it). */
  y: 0,
  /** Extinction per block of the weather here (the near part). */
  z: 0,
  /** A clock (seconds, wrapping): the billows drift. */
  w: 0,
}
/** The horizon's colour without the weather (display linear): the map's cells colour their weather from it. */
export const weatherFieldSky = { x: 0.6, y: 0.7, z: 0.85, w: 0 }

/**
 * Every fogged material carries these (DistanceFog adds them to three's fog
 * uniforms). A material without them would leave its samplers on texture
 * unit 0, which WebGL refuses to draw when another sampler type sits there.
 */
export const weatherFieldUniforms: Record<string, THREE.IUniform> = {
  slopWxMapA: { value: weatherMapA },
  slopWxMapB: { value: weatherMapB },
  slopWxParams: { value: weatherFieldParams },
  slopWxSky: { value: weatherFieldSky },
}

function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`
}

/**
 * GLSL: the weather field's uniforms and functions.
 * - slopWeatherReach(dir): where a ray rises into the weather's cloud deck
 *   (WEATHER_DECK_HEIGHT): the horizon the whole map, straight up here. The
 *   dome reads its clouds' cover and darkness there.
 * - slopWeatherFar(cam, dir, end): the weather from WEATHER_NEAR to `end`
 *   blocks along a ray (rain and dust under the deck, cloud towers above it):
 *   rgb = the light it adds (premultiplied), a = how much it hides of what
 *   lies behind.
 * - slopWeatherNear(dist): opacity of the weather here over a ray's first
 *   stretch (all of it when the map is off: Hell, caves).
 */
export const WEATHER_FIELD_GLSL = /* glsl */ `
#ifndef SLOP_WX_STEPS
	#define SLOP_WX_STEPS 12
#endif
uniform sampler2D slopWxMapA;
uniform sampler2D slopWxMapB;
uniform vec4 slopWxParams;
uniform vec4 slopWxSky;
// Value noise for billows (hash12 by Dave Hoskins on a wrapped lattice)
float slopWxHash( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
float slopWxNoise( vec2 p ) {
	vec2 i = mod( floor( p ), 289.0 );
	vec2 f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( slopWxHash( i ), slopWxHash( i + vec2( 1.0, 0.0 ) ), f.x ),
		mix( slopWxHash( i + vec2( 0.0, 1.0 ) ), slopWxHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float slopWeatherReach( vec3 dir ) {
	return min( ${glslFloat(WEATHER_DECK_HEIGHT)} * length( dir.xz ) / ( max( dir.y, 0.0 ) + ${glslFloat(WEATHER_DECK_FLATTEN)} ), ${glslFloat(WEATHER_MARCH_MAX)} );
}
vec4 slopWeatherFar( vec3 cam, vec3 dir, float end ) {
	const float nearDist = ${glslFloat(WEATHER_NEAR)};
	if ( slopWxParams.y <= 0.0 || end <= nearDist ) return vec4( 0.0 );
	// Log-spaced steps (short ones near, long ones far: SLOP_WX_STEPS, 12 for the land and 16 for the sky),
	// each sampled at a per-pixel jittered point so the map's cells never band
	const int steps = SLOP_WX_STEPS;
	float grow = pow( end / nearDist, 1.0 / float( steps ) );
	float jitter = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
	float s0 = nearDist;
	float trans = 1.0;
	vec3 light = vec3( 0.0 );
	vec3 base = slopWxSky.rgb;
	vec3 grey = vec3( dot( base, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * vec3( 0.97, 0.99, 1.03 );
	for ( int i = 0; i < steps; i++ ) {
		float s1 = s0 * grow;
		vec3 p = cam + dir * mix( s0, s1, jitter );
		vec2 uv = p.xz * slopWxParams.x;
		vec4 a = texture2D( slopWxMapA, uv );
		if ( a.r + a.g > 0.002 ) {
			vec4 b = texture2D( slopWxMapB, uv );
			// The weather's column: rain shafts and dust walls under the deck (thinning toward it), the cloud
			// body above it as tall as the weather is stormy, with a soft top - a storm far off is a dark
			// tower over a grey wall of rain
			// Billows drifting through it: lumpy tops, curdled walls (fair haze is smooth: no noise to pay for)
			float lumps = 0.5;
			float curdle = 0.5;
			if ( max( b.a, a.b ) > 0.05 ) {
				vec2 drift = vec2( slopWxParams.w * 0.9, slopWxParams.w * 0.4 );
				lumps = slopWxNoise( ( p.xz + drift ) / 150.0 );
				curdle = 0.6 * slopWxNoise( ( p.xz - drift ) / 47.0 + vec2( p.y / 38.0, 0.0 ) ) + 0.4 * lumps;
			}
			const float deck = ${glslFloat(WEATHER_DECK_HEIGHT)};
			float rise = p.y - cam.y;
			float tower = deck * ( 0.15 + 1.3 * a.b ) * ( 0.6 + 0.8 * lumps );
			float column = rise < deck
				? 1.0 - 0.4 * smoothstep( 0.0, deck, rise )
				: ( 1.4 + 2.0 * a.b ) * ( 1.0 - smoothstep( deck + tower * 0.25, deck + tower, rise ) );
			column *= 0.5 + curdle;
			// Beyond the land, a fair weather's haze (humid, murky air: no grey, no storm) thins out, so it
			// never hides the storms on the horizon behind it
			float fair = mix( 1.0, 0.25 + 0.75 * max( b.a, a.b ), smoothstep( 450.0, 900.0, s0 ) );
			float fogTop = ${glslFloat(WEATHER_FOG_TOP)};
			float sigma = a.r * ${glslFloat(WEATHER_HAZE_SCALE)} * column * fair
				+ a.g * ${glslFloat(WEATHER_FOG_SCALE)} * ( 1.0 - smoothstep( fogTop - 6.0, fogTop + 6.0, p.y ) );
			// Lit from under the deck: the stormier, the darker (a thunderstorm is a slate wall, fog stays
			// bright); the cloud body brightens toward its sunlit top
			vec3 tint = b.rgb * ${glslFloat(WEATHER_TINT_SCALE)};
			vec3 c = mix( base, grey, b.a ) * ( 1.0 - 0.72 * a.b ) * tint;
			c = mix( c, mix( base, grey, 0.5 ) * 1.1 * tint, 0.7 * smoothstep( deck, deck + tower, rise ) );
			// Shaded low down, lit higher up, and mottled by its billows
			c *= ( 0.84 + 0.16 * smoothstep( -40.0, deck, rise ) ) * ( 0.88 + 0.24 * curdle );
			float stepTrans = exp( - sigma * ( s1 - s0 ) );
			light += trans * ( 1.0 - stepTrans ) * c;
			trans *= stepTrans;
			if ( trans < 0.004 ) break;
		}
		s0 = s1;
	}
	return vec4( light, 1.0 - trans ) * slopWxParams.y;
}
float slopWeatherNear( float dist ) {
	float reach = slopWxParams.y > 0.0 ? min( dist, ${glslFloat(WEATHER_NEAR)} ) : dist;
	return 1.0 - exp( - slopWxParams.z * reach );
}
`
