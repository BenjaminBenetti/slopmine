import * as THREE from 'three'
import type { BiomeAtmosphere } from './BiomeAtmosphere.ts'
import { DEFAULT_CLOUD_COVERAGE, SKY_ZENITH_HEX } from './BiomeAtmosphere.ts'
import { createCloudNoiseTexture } from './cloudNoise.ts'

export interface SkyboxOptions {
  skyRadius?: number
  zenithColor?: THREE.Color
  sunColor?: THREE.Color
  /** Fraction of the sky covered by clouds (0-1) until the atmosphere sets it. */
  cloudCoverage?: number
}

/** Cloud drift in cloud-texture UV units per second (shape and detail layers). */
const CLOUD_WIND_SHAPES = new THREE.Vector2(0.0036, 0.0012)
const CLOUD_WIND_DETAIL = new THREE.Vector2(0.0062, 0.0021)

/**
 * Sky dome: horizon-to-zenith gradient, sun disc + glow and a drifting cloud
 * layer, all computed per pixel in a single draw call. Biome atmosphere
 * (tint, brightness, horizon haze) comes from the shared BiomeAtmosphere, and
 * the horizon color doubles as the distance-fog color (see getHorizonColor).
 */
export class Skybox {
  readonly skyMesh: THREE.Mesh
  private readonly atmosphere: BiomeAtmosphere
  private readonly skyMaterial: THREE.ShaderMaterial
  private readonly cloudTexture: THREE.DataTexture

  /** Current underground darkness factor (0 = open sky, 1 = underground). */
  private darkness = 0

  // Darkness transition thresholds
  private readonly darknessStartY = 180
  private readonly darknessEndY = 150

  constructor(atmosphere: BiomeAtmosphere, options: SkyboxOptions = {}) {
    const {
      skyRadius = 500,
      zenithColor = new THREE.Color(SKY_ZENITH_HEX),
      sunColor = new THREE.Color(1.0, 0.93, 0.8),
      cloudCoverage = DEFAULT_CLOUD_COVERAGE,
    } = options

    this.atmosphere = atmosphere
    this.cloudTexture = createCloudNoiseTexture()
    this.skyMaterial = this.createSkyMaterial(zenithColor, sunColor, cloudCoverage)
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(skyRadius, 32, 16), this.skyMaterial)

    // Render after the world's opaque geometry (renderOrder 0) but before
    // debug overlays (999+) that skip depth writes; transparent meshes still
    // blend over it. At the far plane it only shades uncovered pixels.
    this.skyMesh.renderOrder = 500
    this.skyMesh.frustumCulled = false
  }

  private createSkyMaterial(
    zenithColor: THREE.Color,
    sunColor: THREE.Color,
    cloudCoverage: number
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        zenithColor: { value: zenithColor },
        horizonColor: { value: new THREE.Color() },
        undergroundColor: { value: new THREE.Color() },
        skyTint: { value: new THREE.Color(1, 1, 1) },
        skyBrightness: { value: 1.0 },
        darkness: { value: 0.0 },
        fogOverrideColor: { value: new THREE.Color() },
        fogOverride: { value: 0.0 },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: sunColor },
        cloudNoise: { value: this.cloudTexture },
        cloudOffsetShapes: { value: new THREE.Vector2() },
        cloudOffsetDetail: { value: new THREE.Vector2() },
        cloudCoverage: { value: cloudCoverage },
        cloudTint: { value: new THREE.Color(1, 1, 1) },
        cloudOpacity: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocalPosition;
        void main() {
          // Local position: the dome is centered on the camera, so this is the view direction
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          // Pin to the far plane: drawn after the terrain, the depth test then
          // skips every pixel already covered, and no dome radius can clip it.
          gl_Position.z = gl_Position.w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 zenithColor;
        uniform vec3 horizonColor;
        uniform vec3 undergroundColor;
        uniform vec3 skyTint;
        uniform float skyBrightness;
        uniform float darkness;
        uniform vec3 fogOverrideColor;
        uniform float fogOverride;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        uniform sampler2D cloudNoise;
        uniform vec2 cloudOffsetShapes;
        uniform vec2 cloudOffsetDetail;
        uniform float cloudCoverage;
        uniform vec3 cloudTint;
        uniform float cloudOpacity;
        varying vec3 vLocalPosition;
        #include <common>
        #include <dithering_pars_fragment>

        void main() {
          vec3 dir = normalize(vLocalPosition);
          float h = dir.y;

          // Gradient: horizon color at and below the horizon (matches the fog)
          vec3 color = mix(horizonColor, zenithColor * skyTint, pow(clamp(h, 0.0, 1.0), 0.5));

          // Sun: broad atmospheric glow, tight halo and a soft-edged disc
          float sunDot = max(dot(dir, sunDirection), 0.0);
          color += sunColor * (pow(sunDot, 12.0) * 0.16 + pow(sunDot, 180.0) * 0.55);
          color += sunColor * 3.0 * smoothstep(0.99885, 0.99925, sunDot);

          // Clouds: a flat deck intersected by the view ray. Large drifting
          // shapes, eroded at their thin edges by two finer noise layers.
          if (h > 0.0) {
            vec2 deck = dir.xz / (h + 0.12);
            float shapes = texture2D(cloudNoise, deck * 0.22 + cloudOffsetShapes).r;
            float detail = texture2D(cloudNoise, deck * 1.0 + cloudOffsetDetail).g * 0.65
                         + texture2D(cloudNoise, deck * 2.3 - cloudOffsetDetail).r * 0.35;
            float edge = 1.0 - cloudCoverage;
            float n = shapes - (1.0 - shapes) * detail * 0.4 + 0.10;
            // Soft edges: a wide coverage ramp, never narrower than ~2 px on
            // screen (fwidth), so thin parts are translucent wisps rather than
            // hard cut-outs with a stepped, posterized rim
            float ramp = 0.18 + 1.5 * fwidth(n);
            float density = smoothstep(edge - 0.04, edge - 0.04 + ramp, n);
            // Fade toward the horizon (tiny, aliased features; aerial haze)
            density *= smoothstep(0.03, 0.28, h) * 0.96 * cloudOpacity;
            // White thin parts, grey thick bases with a little billow texture;
            // a silver lining toward the sun, mostly on the thin parts
            float thick = smoothstep(edge, edge + 0.32, n);
            vec3 cloudColor = mix(vec3(1.0), vec3(0.70, 0.73, 0.80), thick * (0.8 + 0.2 * detail));
            cloudColor *= mix(vec3(1.0), skyTint, 0.5);
            cloudColor += sunColor * pow(sunDot, 8.0) * 0.35 * (1.0 - 0.6 * thick);
            // Biome cloud colour: grey overcast, dark volcanic ash
            cloudColor *= cloudTint;
            color = mix(color, cloudColor, density);
          }

          color *= skyBrightness;
          // Underground: fade to the (biome) underground color
          color = mix(color, undergroundColor, darkness);
          // Inside a liquid the sky is beyond the (short) liquid fog's far end
          color = mix(color, fogOverrideColor, fogOverride);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          // Sub-LSB noise: smooth, dim gradients (overcast or hazy skies) band
          // visibly in 8 bits otherwise
          #include <dithering_fragment>
        }
      `,
      side: THREE.BackSide, // Render inside of sphere
      depthWrite: false,
      fog: false,
      dithering: true,
    })
  }

  /**
   * While the distance fog is overridden (camera inside a liquid), show the
   * override's fog color instead of the sky: everything beyond the liquid
   * fog's far end is fog, and the sky seen up through a water surface would
   * otherwise stay bright and unfogged. Null restores the sky.
   */
  setFogOverride(color: THREE.Color | null): void {
    const u = this.skyMaterial.uniforms
    u.fogOverride.value = color ? 1 : 0
    if (color) (u.fogOverrideColor.value as THREE.Color).copy(color)
  }

  /** Set the sun direction (normalized internally) to match the directional light. */
  setSunDirection(direction: THREE.Vector3): void {
    ;(this.skyMaterial.uniforms.sunDirection.value as THREE.Vector3).copy(direction).normalize()
  }

  /**
   * The final displayed horizon color (linear): the tinted/hazed horizon with
   * biome brightness and underground darkness applied - exactly what the dome
   * shows at and below the horizon, so distance fog blends into the sky.
   */
  getHorizonColor(target: THREE.Color): THREE.Color {
    const a = this.atmosphere
    return target
      .copy(a.horizonColor)
      .multiplyScalar(a.skyBrightness)
      .lerp(a.undergroundColor, this.darkness)
  }

  /** Call each frame to keep the dome centered on the camera and apply the atmosphere. */
  update(camera: THREE.Camera, deltaTime: number = 0.016): void {
    const cameraPos = camera.position
    this.skyMesh.position.copy(cameraPos)

    // Y-based darkness (dark below darknessEndY, normal above darknessStartY)
    this.darkness = Math.max(
      0,
      Math.min(1, (this.darknessStartY - cameraPos.y) / (this.darknessStartY - this.darknessEndY))
    )

    const u = this.skyMaterial.uniforms
    const a = this.atmosphere
    u.darkness.value = this.darkness
    u.skyBrightness.value = a.skyBrightness
    ;(u.skyTint.value as THREE.Color).copy(a.skyTint)
    ;(u.horizonColor.value as THREE.Color).copy(a.horizonColor)
    ;(u.undergroundColor.value as THREE.Color).copy(a.undergroundColor)
    u.cloudCoverage.value = a.cloudCoverage
    u.cloudOpacity.value = a.cloudOpacity
    ;(u.cloudTint.value as THREE.Color).copy(a.cloudTint)

    // Drift the cloud layers; offsets wrap (the noise tiles) to keep precision
    const shapes = u.cloudOffsetShapes.value as THREE.Vector2
    const detail = u.cloudOffsetDetail.value as THREE.Vector2
    shapes.addScaledVector(CLOUD_WIND_SHAPES, deltaTime)
    detail.addScaledVector(CLOUD_WIND_DETAIL, deltaTime)
    shapes.set(shapes.x % 1, shapes.y % 1)
    detail.set(detail.x % 1, detail.y % 1)
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.skyMesh)
  }

  removeFrom(scene: THREE.Scene): void {
    scene.remove(this.skyMesh)
  }

  dispose(): void {
    this.skyMesh.geometry.dispose()
    this.skyMaterial.dispose()
    this.cloudTexture.dispose()
  }
}
