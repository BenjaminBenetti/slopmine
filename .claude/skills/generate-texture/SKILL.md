---
name: generate-texture
description: Generate seamless block textures. You must use this skill when creating game assets / textures / art.
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

---

# Generate Item Icons

For inventory item icons (food, tools, ores, etc.), the workflow is different from block textures.

## CRITICAL: Background Removal

**Item icons MUST have transparent backgrounds.** The AI generator does NOT create true transparency.

### Prompt Rules

**ALWAYS request a WHITE background, NEVER say "transparent":**
- If you say "transparent background", the AI generates a fake gray checkered pattern that is NOT transparent and is hard to remove
- WHITE backgrounds are solid and easy to remove cleanly

### Item Icon Workflow

1. **Generate** with WHITE background:
   ```
   A pixel art icon of {item_description} for a Minecraft-style game inventory.
   32x32 pixel art style, simple blocky aesthetic. On a plain solid WHITE background.
   ```

2. **Remove background using magic select from corner** (REQUIRED):
   ```bash
   convert "{output}.png" -fuzz 10% -fill none -draw "color 0,0 floodfill" -quality 90 "{name}.webp"
   ```
   This selects contiguous white pixels starting from corner (0,0) with 10% tolerance, preserving any white pixels INSIDE the item (like bones, highlights, etc.)

3. **Verify transparency**:
   ```bash
   identify -verbose "{name}.webp" | grep "Type:"
   # Must show "TrueColorAlpha"
   ```

4. **Place** in `src/items/{category}/{item_name}/assets/`

### Why This Approach

- **Magic select from corner + fuzz** = only removes the CONTIGUOUS background, not white pixels inside the item
- **DO NOT use `-transparent white`** alone - this removes ALL white pixels including bones, highlights, teeth, eyes, etc.
- **DO NOT say "transparent" in prompts** - AI generates non-transparent checkerboard patterns

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
