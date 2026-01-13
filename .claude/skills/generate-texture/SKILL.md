---
name: generate-texture
description: Generate seamless block textures for the Slopmine voxel game. Use when creating new block textures, game assets, or when the user asks to generate a texture for a block.
allowed-tools: mcp__art-gen__generate_image, Bash, Read
---

# Generate Block Texture

Generate 16-bit style seamless block textures for the Slopmine voxel game using the art-gen MCP.

## Base Prompt Template

When generating textures, ALWAYS use this base prompt combined with the user's description:

```
Seamless tileable square texture for a voxel game block: {user_description}.

Style requirements:
- 16-bit retro pixel art aesthetic with crisp, visible pixelation
- Classic 16-bit era color depth and dithering techniques
- Rich surface detail using color variation and subtle noise patterns
- Natural organic feel, not flat or uniform
- Cohesive limited color palette (4-8 main colors with subtle gradients, 16-bit style)
- Must tile seamlessly on all edges (critical for 3D cube faces)
- Top-down orthographic view, no perspective or 3D shading
- No text, no logos, no borders, no frames
- Square 1:1 aspect ratio
- Inspired by 16-bit era games and modern voxel games like Minecraft but with more textural detail
```

## Workflow

1. **Generate** using `mcp__art-gen__generate_image` with the combined base prompt + user description
2. **Convert** to 64x64 WebP: `convert "{output}.png" -resize 64x64 -quality 60 "{name}.webp"`
3. **Place** in `src/world/blocks/types/{block_name}/assets/`

## Example Descriptions

- **Stone**: "dark gray rock with brown speckling and grainy organic noise texture"
- **Obsidian**: "dark purple-black volcanic glass with subtle reflective highlights"
- **Marble**: "white and gray veined marble stone with elegant swirling patterns"
- **Moss Stone**: "gray cobblestone with patches of vibrant green moss in crevices"
- **Packed Ice**: "compressed blue-white ice with crystalline structures and air bubbles"

## Style Reference

The game uses 16-bit pixel art textures at 64x64 resolution with these characteristics:
- Vibrant but natural colors
- Visible pixelation with refined detail
- Organic noise patterns (not flat/uniform)
- Seamless tiling for cube faces
