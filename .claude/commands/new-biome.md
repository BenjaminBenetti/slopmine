# New Biome Creation

Create a new biome for the Slopmine voxel game with all required blocks, textures, items, and biome generator.

## User Input Required
Ask the user for:
1. **Biome name** (e.g., "desert", "tundra", "swamp")
2. **Surface block** (e.g., sand, snow, mud) - name and color description
3. **Subsurface block** (e.g., sandstone, packed ice) - name and color description
4. **Decoration/plant** (e.g., cactus, dead bush, mushroom) - name and color description
5. **Water settings** - enabled/disabled, liquid type if enabled
6. **Terrain style** - flat, hilly, mountainous, etc.

## Process Overview

### Step 1: Generate Textures
Use Google AI Studio at https://aistudio.google.com/prompts/1-PQryQheH_G5HOEB-AwA6VU7AJqG4qH2 to generate textures:
- Reference existing textures in the chat (water, lava style)
- Don't mention "minecraft" in prompts
- Generate each texture with appropriate colors and style
- Download each texture
- Convert to 64x64 webp at 60% quality:
  ```bash
  convert "downloaded.jpeg" -resize 64x64 -quality 60 output.webp
  ```

### Step 2: Add Block IDs
Edit `src/world/blocks/BlockIds.ts`:
- Add new enum values for each block (find next available ID after existing ones)

### Step 3: Add Texture IDs
Edit `src/world/blocks/FaceTextureRegistry.ts`:
- Add new TextureId enum values for each texture

### Step 4: Add Block Tags (if needed)
Edit `src/world/blocks/tags/BlockTags.ts`:
- Add new tag if the surface block needs special tool effectiveness (e.g., SAND for shovel)

### Step 5: Create Block Classes
For each new block, create directory structure:
```
src/world/blocks/types/{block_name}/
├── {BlockName}Block.ts
└── assets/
    └── {block_name}.webp
```

Block class template (SolidBlock):
```typescript
import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { {BlockName}BlockItem } from '../../../../items/blocks/{block_name}/{BlockName}BlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/{block_name}.webp'

registerTextureUrl(TextureId.{BLOCK_NAME}, texUrl)

const texture = loadBlockTexture(texUrl)
const material = new THREE.MeshLambertMaterial({ map: texture })

export class {BlockName}Block extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.{BLOCK_NAME},
    name: '{block_name}',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: {hardness}, // 0.4-2.0 typical
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: {force}, // 0=any tool, 1=pickaxe required
    tags: [{tags}],
  }

  protected get defaultTextureId(): number {
    return TextureId.{BLOCK_NAME}
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new {BlockName}BlockItem()]
  }
}
```

### Step 6: Create Item Classes
For each block, create item:
```
src/items/blocks/{block_name}/
├── {BlockName}BlockItem.ts
└── assets/
    └── {block_name}-block-icon.webp  (copy from block texture)
```

Item class template:
```typescript
import { Item } from '../../Item.ts'

export class {BlockName}BlockItem extends Item {
  readonly id = '{block_name}_block'
  readonly name = '{block_name}_block'

  override get displayName(): string {
    return '{Block Name} Block'
  }

  override get iconUrl(): string {
    return new URL('./assets/{block_name}-block-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return []
  }
}
```

### Step 7: Register Blocks
Edit `src/world/blocks/registerDefaultBlocks.ts`:
- Add imports for new block classes
- Add registerBlock() calls with properties

### Step 8: Add Biome Type
Edit `src/world/generate/GenerationConfig.ts`:
- Add new biome name to BiomeType union type

### Step 9: Create Biome Generator
Create `src/world/generate/biomes/{BiomeName}Generator.ts`:

Key sections to customize:
- `properties.name` - biome identifier
- `properties.frequency` - spawn weight (0.5-4.0)
- `properties.treeDensity` - decoration density
- `properties.features` - CliffFeature, OreFeature configurations
- `properties.caves` - cave generation settings
- `properties.water` - water/liquid settings
- `properties.terrainConfig` - noise layers for terrain shape
- `fillChunk()` - layer generation (surface, subsurface, base blocks)
- Decoration methods - place plants/decorations

Reference existing biomes:
- `PlainsGenerator.ts` - grass/dirt/stone layers, trees
- `GrassyHillsGenerator.ts` - more dramatic terrain
- `DesertGenerator.ts` - sand/sandstone layers, cacti

### Step 10: Register Biome
Edit `src/world/generate/biomes/BiomeRegistry.ts`:
- Add import for new generator
- Add registration in `registerDefaultBiomes()`

### Step 11: Build and Test
```bash
pnpm build
pnpm dev
```

Explore the world to find the new biome. Biome regions are 16x16 chunks (512x512 blocks).

## Example Biomes to Create
- **Tundra**: Snow surface, packed ice subsurface, dead bushes
- **Swamp**: Mud surface, clay subsurface, mushrooms, murky water
- **Jungle**: Grass surface, dirt subsurface, tall trees, vines
- **Volcanic**: Basalt surface, magma subsurface, lava pools
- **Beach**: Sand surface, sandstone subsurface, palm trees, ocean water
