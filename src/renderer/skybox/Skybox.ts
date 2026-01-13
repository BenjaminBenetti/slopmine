import * as THREE from 'three'
import cloudTextureUrl from './assets/cloud.webp'

export interface SkyboxOptions {
  skyRadius?: number
  zenithColor?: THREE.Color
  horizonColor?: THREE.Color
  sunColor?: THREE.Color
  sunSize?: number
  cloudCount?: number
}

export class Skybox {
  readonly skyMesh: THREE.Mesh
  readonly sunMesh: THREE.Mesh
  readonly cloudGroup: THREE.Group
  private readonly skyRadius: number
  /** Local sun direction (before applying camera offset) */
  private sunDirection = new THREE.Vector3(0, 1, 0)
  /** Pre-allocated for update() to avoid GC pressure */
  private readonly tempSunPos = new THREE.Vector3()

  // References for Y-based darkness updates
  private readonly skyMaterial: THREE.ShaderMaterial
  private readonly sunMaterial: THREE.MeshBasicMaterial
  private readonly sunGlowMaterial: THREE.MeshBasicMaterial
  private readonly cloudBaseOpacities: number[] = []

  // Darkness transition thresholds
  private readonly darknessStartY = 180
  private readonly darknessEndY = 150

  // Biome-based skybox modifiers (0-1 range)
  private biomeBrightness = 1.0
  private biomeTint = { r: 1.0, g: 1.0, b: 1.0 }

  // Target values for smooth interpolation
  private targetBiomeBrightness = 1.0
  private targetBiomeTint = { r: 1.0, g: 1.0, b: 1.0 }
  private readonly BIOME_BLEND_SPEED = 2.0 // units per second

  constructor(options: SkyboxOptions = {}) {
    const {
      skyRadius = 500,
      zenithColor = new THREE.Color(0x1e90ff), // Deep blue at top
      horizonColor = new THREE.Color(0x87ceeb), // Light sky blue at horizon
      sunColor = new THREE.Color(0xffff80), // Bright yellow-white
      sunSize = 30,
      cloudCount = 20,
    } = options

    this.skyRadius = skyRadius

    // Create sky dome with gradient shader
    this.skyMesh = this.createSkyDome(zenithColor, horizonColor, skyRadius)

    // Create sun disc
    this.sunMesh = this.createSunDisc(sunColor, sunSize)

    // Create cloud group
    this.cloudGroup = this.createClouds(cloudCount, skyRadius * 0.8)

    // Set negative renderOrder so skybox renders first (behind everything)
    // and disable depth test so it never occludes world geometry
    const skyRenderOrder = -1000
    this.skyMesh.renderOrder = skyRenderOrder
    this.sunMesh.renderOrder = skyRenderOrder + 1
    this.cloudGroup.renderOrder = skyRenderOrder + 2
    this.cloudGroup.children.forEach((child) => {
      child.renderOrder = skyRenderOrder + 2
    })

    // Store material references for Y-based darkness updates
    this.skyMaterial = this.skyMesh.material as THREE.ShaderMaterial
    this.sunMaterial = this.sunMesh.material as THREE.MeshBasicMaterial
    this.sunGlowMaterial = (this.sunMesh.children[0] as THREE.Mesh)
      .material as THREE.MeshBasicMaterial

    // Store base cloud opacities
    this.cloudGroup.children.forEach((child) => {
      if (child instanceof THREE.Sprite) {
        this.cloudBaseOpacities.push(child.material.opacity)
      }
    })
  }

  private createSkyDome(
    zenithColor: THREE.Color,
    horizonColor: THREE.Color,
    radius: number
  ): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius, 32, 32)

    // Custom shader for gradient from horizon to zenith
    const material = new THREE.ShaderMaterial({
      uniforms: {
        zenithColor: { value: zenithColor },
        horizonColor: { value: horizonColor },
        darkness: { value: 0.0 },
        biomeBrightness: { value: 1.0 },
        biomeTint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      },
      vertexShader: `
        varying vec3 vLocalPosition;
        void main() {
          // Use local position so gradient is relative to sphere center (camera), not world origin
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 zenithColor;
        uniform vec3 horizonColor;
        uniform float darkness;
        uniform float biomeBrightness;
        uniform vec3 biomeTint;
        varying vec3 vLocalPosition;
        void main() {
          float h = normalize(vLocalPosition).y;
          // Clamp to 0-1 range (horizon at y=0, zenith at y=1)
          float t = clamp(h, 0.0, 1.0);
          // Smooth transition
          t = pow(t, 0.5);
          vec3 color = mix(horizonColor, zenithColor, t);
          // Apply biome tint
          color *= biomeTint;
          // Apply biome brightness
          color *= biomeBrightness;
          // Apply Y-based darkness factor (underground)
          color *= (1.0 - darkness);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide, // Render inside of sphere
      depthWrite: false,
    })

    return new THREE.Mesh(geometry, material)
  }

  private createSunDisc(color: THREE.Color, size: number): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(size, 32)
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })

    const mesh = new THREE.Mesh(geometry, material)
    // Add a glow effect with a slightly larger, more transparent circle
    const glowGeometry = new THREE.CircleGeometry(size * 1.5, 32)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffffcc),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    })
    const glow = new THREE.Mesh(glowGeometry, glowMaterial)
    glow.position.z = -0.1 // Slightly behind the sun
    mesh.add(glow)

    return mesh
  }

  private createClouds(count: number, radius: number): THREE.Group {
    const group = new THREE.Group()

    // Load cloud texture from asset
    const textureLoader = new THREE.TextureLoader()
    const texture = textureLoader.load(cloudTextureUrl)
    texture.colorSpace = THREE.SRGBColorSpace

    for (let i = 0; i < count; i++) {
      // Vary opacity per cloud for soft, natural look
      const baseOpacity = 0.5 + Math.random() * 0.4

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: baseOpacity,
        alphaTest: 0.01, // Discard nearly-transparent pixels
        depthWrite: false,
      })

      const sprite = new THREE.Sprite(material)

      // Position clouds in upper hemisphere
      const phi = Math.random() * Math.PI * 0.4 + Math.PI * 0.1
      const theta = Math.random() * Math.PI * 2

      const x = radius * Math.cos(phi) * Math.cos(theta)
      const y = radius * Math.sin(phi)
      const z = radius * Math.cos(phi) * Math.sin(theta)

      sprite.position.set(x, y, z)
      sprite.scale.set(80 + Math.random() * 60, 30 + Math.random() * 20, 1)

      group.add(sprite)
    }

    return group
  }

  /** Update sun direction (normalized) to match directional light */
  setSunPosition(position: THREE.Vector3): void {
    this.sunDirection.copy(position).normalize()
  }

  /**
   * Set the biome-based skybox modifiers.
   * These values will be smoothly interpolated towards.
   * @param brightness - Brightness multiplier (0-1, default 1)
   * @param tint - Color tint multiplier (RGB 0-1, default white)
   */
  setBiomeModifiers(
    brightness: number = 1.0,
    tint: { r: number; g: number; b: number } = { r: 1, g: 1, b: 1 }
  ): void {
    this.targetBiomeBrightness = Math.max(0, Math.min(1, brightness))
    this.targetBiomeTint = {
      r: Math.max(0, Math.min(1, tint.r)),
      g: Math.max(0, Math.min(1, tint.g)),
      b: Math.max(0, Math.min(1, tint.b)),
    }
  }

  /** Call each frame to keep skybox centered on the camera */
  update(camera: THREE.Camera, deltaTime: number = 0.016): void {
    const cameraPos = camera.position

    // Move all skybox elements to follow the camera
    this.skyMesh.position.copy(cameraPos)
    this.cloudGroup.position.copy(cameraPos)

    // Position sun relative to camera (using pre-allocated vector)
    this.tempSunPos
      .copy(this.sunDirection)
      .multiplyScalar(this.skyRadius * 0.95)
      .add(cameraPos)
    this.sunMesh.position.copy(this.tempSunPos)
    // Make sun face the camera
    this.sunMesh.lookAt(cameraPos)

    // Apply Y-based darkness (dark below darknessEndY, normal above darknessStartY)
    const y = cameraPos.y
    const darkness = Math.max(
      0,
      Math.min(1, (this.darknessStartY - y) / (this.darknessStartY - this.darknessEndY))
    )

    // Smoothly interpolate biome modifiers towards target values
    const blendFactor = Math.min(1, this.BIOME_BLEND_SPEED * deltaTime)
    this.biomeBrightness += (this.targetBiomeBrightness - this.biomeBrightness) * blendFactor
    this.biomeTint.r += (this.targetBiomeTint.r - this.biomeTint.r) * blendFactor
    this.biomeTint.g += (this.targetBiomeTint.g - this.biomeTint.g) * blendFactor
    this.biomeTint.b += (this.targetBiomeTint.b - this.biomeTint.b) * blendFactor

    // Update sky shader uniforms
    this.skyMaterial.uniforms.darkness.value = darkness
    this.skyMaterial.uniforms.biomeBrightness.value = this.biomeBrightness
    const tintUniform = this.skyMaterial.uniforms.biomeTint.value as THREE.Vector3
    tintUniform.set(this.biomeTint.r, this.biomeTint.g, this.biomeTint.b)

    // Update sun opacity (affected by both Y-darkness and biome brightness)
    const combinedBrightness = (1 - darkness) * this.biomeBrightness
    this.sunMaterial.opacity = 0.95 * combinedBrightness
    this.sunGlowMaterial.opacity = 0.3 * combinedBrightness
    // Apply biome tint to sun (subtle tinting)
    const avgTint = (this.biomeTint.r + this.biomeTint.g + this.biomeTint.b) / 3
    this.sunMaterial.color.setRGB(
      1.0 * (0.7 + 0.3 * this.biomeTint.r),
      0.95 * (0.7 + 0.3 * this.biomeTint.g),
      0.5 * (0.7 + 0.3 * avgTint)
    )

    // Update cloud opacities (affected by both Y-darkness and biome brightness)
    let i = 0
    this.cloudGroup.children.forEach((child) => {
      if (child instanceof THREE.Sprite) {
        child.material.opacity = this.cloudBaseOpacities[i] * combinedBrightness
        i++
      }
    })
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.skyMesh)
    scene.add(this.sunMesh)
    scene.add(this.cloudGroup)
  }

  removeFrom(scene: THREE.Scene): void {
    scene.remove(this.skyMesh)
    scene.remove(this.sunMesh)
    scene.remove(this.cloudGroup)
  }

  dispose(): void {
    this.skyMesh.geometry.dispose()
    ;(this.skyMesh.material as THREE.Material).dispose()
    this.sunMesh.geometry.dispose()
    ;(this.sunMesh.material as THREE.Material).dispose()

    this.cloudGroup.children.forEach((child) => {
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose()
        child.material.dispose()
      }
    })
  }
}
