import * as THREE from 'three'
import type { IItem } from '../../../items/Item.ts'

// Constants for extruded tool meshes
const TOOL_TOTAL_SIZE = 0.7 // Large tool size
const TARGET_RESOLUTION = 32 // Downsample to 32x32 for better detail
const EXTRUSION_DEPTH = 0.03 // Thin like a tool blade
const ALPHA_THRESHOLD = 25

// Geometry cache keyed by icon URL
const geometryCache = new Map<string, THREE.BufferGeometry>()

// Shared material for all extruded tools
let sharedToolMaterial: THREE.MeshStandardMaterial | null = null

interface PixelData {
  width: number
  height: number
  data: Uint8ClampedArray
}

/**
 * Load an image and extract its pixel data using canvas.
 * Downsamples to TARGET_RESOLUTION for proper voxel appearance.
 */
async function loadImagePixelData(url: string): Promise<PixelData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      // Downsample to target resolution
      const canvas = document.createElement('canvas')
      canvas.width = TARGET_RESOLUTION
      canvas.height = TARGET_RESOLUTION
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas 2D context'))
        return
      }
      // Disable image smoothing for pixelated downscale
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, TARGET_RESOLUTION, TARGET_RESOLUTION)
      const imageData = ctx.getImageData(0, 0, TARGET_RESOLUTION, TARGET_RESOLUTION)
      resolve({
        width: TARGET_RESOLUTION,
        height: TARGET_RESOLUTION,
        data: imageData.data,
      })
    }

    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Add 36 vertices (6 faces × 2 triangles × 3 vertices) for a single box.
 */
function addBoxVertices(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  startVertex: number,
  cx: number,
  cy: number,
  cz: number,
  size: number,
  depth: number,
  r: number,
  g: number,
  b: number
): void {
  const hs = size / 2
  const hd = depth / 2

  let idx = startVertex * 3

  const addVertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number
  ) => {
    positions[idx] = x
    positions[idx + 1] = y
    positions[idx + 2] = z
    normals[idx] = nx
    normals[idx + 1] = ny
    normals[idx + 2] = nz
    colors[idx] = r
    colors[idx + 1] = g
    colors[idx + 2] = b
    idx += 3
  }

  const x0 = cx - hs,
    x1 = cx + hs
  const y0 = cy - hs,
    y1 = cy + hs
  const z0 = cz - hd,
    z1 = cz + hd

  // +X face
  addVertex(x1, y0, z0, 1, 0, 0)
  addVertex(x1, y1, z0, 1, 0, 0)
  addVertex(x1, y1, z1, 1, 0, 0)
  addVertex(x1, y0, z0, 1, 0, 0)
  addVertex(x1, y1, z1, 1, 0, 0)
  addVertex(x1, y0, z1, 1, 0, 0)

  // -X face
  addVertex(x0, y0, z1, -1, 0, 0)
  addVertex(x0, y1, z1, -1, 0, 0)
  addVertex(x0, y1, z0, -1, 0, 0)
  addVertex(x0, y0, z1, -1, 0, 0)
  addVertex(x0, y1, z0, -1, 0, 0)
  addVertex(x0, y0, z0, -1, 0, 0)

  // +Y face (top)
  addVertex(x0, y1, z0, 0, 1, 0)
  addVertex(x0, y1, z1, 0, 1, 0)
  addVertex(x1, y1, z1, 0, 1, 0)
  addVertex(x0, y1, z0, 0, 1, 0)
  addVertex(x1, y1, z1, 0, 1, 0)
  addVertex(x1, y1, z0, 0, 1, 0)

  // -Y face (bottom)
  addVertex(x0, y0, z1, 0, -1, 0)
  addVertex(x0, y0, z0, 0, -1, 0)
  addVertex(x1, y0, z0, 0, -1, 0)
  addVertex(x0, y0, z1, 0, -1, 0)
  addVertex(x1, y0, z0, 0, -1, 0)
  addVertex(x1, y0, z1, 0, -1, 0)

  // +Z face (front)
  addVertex(x0, y0, z1, 0, 0, 1)
  addVertex(x1, y0, z1, 0, 0, 1)
  addVertex(x1, y1, z1, 0, 0, 1)
  addVertex(x0, y0, z1, 0, 0, 1)
  addVertex(x1, y1, z1, 0, 0, 1)
  addVertex(x0, y1, z1, 0, 0, 1)

  // -Z face (back)
  addVertex(x1, y0, z0, 0, 0, -1)
  addVertex(x0, y0, z0, 0, 0, -1)
  addVertex(x0, y1, z0, 0, 0, -1)
  addVertex(x1, y0, z0, 0, 0, -1)
  addVertex(x0, y1, z0, 0, 0, -1)
  addVertex(x1, y1, z0, 0, 0, -1)
}

/**
 * Build extruded pixel geometry from image pixel data.
 * Each non-transparent pixel becomes a small 3D box.
 */
function buildExtrudedPixelGeometry(pixelData: PixelData): THREE.BufferGeometry {
  const { width, height, data } = pixelData

  const pixelSize = TOOL_TOTAL_SIZE / Math.max(width, height)
  const depth = EXTRUSION_DEPTH

  // Collect visible pixels
  const visiblePixels: Array<{
    x: number
    y: number
    r: number
    g: number
    b: number
  }> = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = data[i + 3]

      if (a > ALPHA_THRESHOLD) {
        visiblePixels.push({
          x,
          y,
          r: data[i] / 255,
          g: data[i + 1] / 255,
          b: data[i + 2] / 255,
        })
      }
    }
  }

  if (visiblePixels.length === 0) {
    return new THREE.BufferGeometry()
  }

  const verticesPerBox = 36
  const vertexCount = visiblePixels.length * verticesPerBox

  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)

  for (let i = 0; i < visiblePixels.length; i++) {
    const pixel = visiblePixels[i]

    // Center the mesh and flip Y (image coords are top-down)
    const px = (pixel.x - width / 2 + 0.5) * pixelSize
    const py = (height / 2 - pixel.y - 0.5) * pixelSize
    const pz = 0

    addBoxVertices(
      positions,
      normals,
      colors,
      i * verticesPerBox,
      px,
      py,
      pz,
      pixelSize,
      depth,
      pixel.r,
      pixel.g,
      pixel.b
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()

  return geometry
}

/**
 * Get the shared material for extruded tool meshes.
 */
function getToolMaterial(): THREE.MeshStandardMaterial {
  if (!sharedToolMaterial) {
    sharedToolMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.1,
    })
  }
  return sharedToolMaterial
}

/**
 * Build an extruded tool mesh asynchronously.
 */
async function buildExtrudedToolMesh(iconUrl: string): Promise<THREE.Mesh> {
  let geometry = geometryCache.get(iconUrl)

  if (!geometry) {
    const pixelData = await loadImagePixelData(iconUrl)
    geometry = buildExtrudedPixelGeometry(pixelData)
    geometryCache.set(iconUrl, geometry)
  }

  return new THREE.Mesh(geometry, getToolMaterial())
}

/**
 * Create a fallback mesh when icon loading fails.
 */
function createFallbackMesh(): THREE.Group {
  const geometry = new THREE.BoxGeometry(0.15, 0.3, 0.05)
  const material = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.8,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = 0.15

  const pivot = new THREE.Group()
  pivot.add(mesh)
  pivot.rotation.y = -1.25
  pivot.rotation.z = Math.PI / 8
  pivot.rotation.x = -Math.PI / 12
  pivot.position.set(0.15, -0.2, -0.1)
  return pivot
}

/**
 * Creates an extruded 3D pixel mesh for tool items.
 * Each non-transparent pixel in the icon becomes a small voxel.
 */
export function createToolMesh(item: IItem): THREE.Object3D {
  const group = new THREE.Group()

  if (!item.iconUrl) {
    group.add(createFallbackMesh())
    return group
  }

  // Start async mesh building
  buildExtrudedToolMesh(item.iconUrl)
    .then(mesh => {
      // Create pivot group for rotation around lower point
      const pivot = new THREE.Group()

      // Offset mesh up from pivot so rotation happens at handle
      mesh.position.y = 0.15
      pivot.add(mesh)

      // Apply rotations to pivot
      pivot.rotation.y = -1.25 // ~70 degrees to show side profile
      pivot.rotation.z = Math.PI / 8 // Slight tilt
      pivot.rotation.x = -Math.PI / 12 // Slight forward lean

      // Position pivot so tool is visible
      pivot.position.set(0.15, -0.2, -0.1)
      group.add(pivot)
    })
    .catch(err => {
      console.warn('Failed to build extruded tool mesh:', err)
      group.add(createFallbackMesh())
    })

  return group
}
