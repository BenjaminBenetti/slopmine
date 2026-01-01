import * as THREE from 'three'
import type { IItem } from '../../../items/Item.ts'
import { loadBlockTexture } from '../../TextureLoader.ts'

/**
 * Creates a flat plane mesh for tool items.
 * The tool icon is rendered as a 2D sprite rotated 45 degrees.
 */
export function createToolMesh(item: IItem): THREE.Object3D {
  const group = new THREE.Group()

  if (!item.iconUrl) {
    // Fallback: colored plane if no icon
    const geometry = new THREE.PlaneGeometry(0.35, 0.35)
    const material = new THREE.MeshBasicMaterial({
      color: 0x888888,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geometry, material)
    group.add(mesh)
    return group
  }

  // Load icon texture with pixelated filtering
  const texture = loadBlockTexture(item.iconUrl)

  const geometry = new THREE.PlaneGeometry(0.35, 0.35)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)

  // Rotate 45 degrees around Z-axis (tilt like holding a sword/pickaxe)
  mesh.rotation.z = Math.PI / 4

  // Slight tilt forward for depth
  mesh.rotation.x = -Math.PI / 8

  group.add(mesh)

  return group
}
