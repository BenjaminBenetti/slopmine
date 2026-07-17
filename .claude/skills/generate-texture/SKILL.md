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

## Face-Specific Design Rules

- **Log/pillar END textures (top/bottom faces)**: never accept a circular ring
  motif floating inside the square — corners read as a "pasted-on circle" on the
  cube face. Prompt for rings that FILL the square edge-to-edge, e.g. "concentric
  squarish growth rings following the square shape of the face, filling it
  edge-to-edge, with a bark rim running along all four edges".
- **Foliage/leaf textures**: must ship with REAL alpha holes (the game standard —
  e.g. oak-leaves.webp is TrueColorAlpha; leaf materials use `alphaTest: 0.5`).
  The AI generator cannot output true transparency, so:
  1. Prompt for foliage "on a plain solid WHITE background, with small white
     gaps showing through between the leaf clusters" (never say "transparent" —
     the AI paints a fake checkerboard).
  2. Punch out ALL white (including interior gaps — unlike icons, do NOT
     floodfill from the corner):
     `convert in.png -fuzz 12% -transparent white -resize 64x64 -quality 60 out.webp`
  3. Verify: `identify -verbose out.webp | grep Type:` must say `TrueColorAlpha`,
     and measure what `alphaTest: 0.5` will actually keep:
     `convert out.webp -alpha extract -threshold 50% -format "%[fx:mean]" info:`
     — aim for 0.70-0.90 solid (10-30% holes).
  4. **Proven fallback** (use when the white-background prompt yields sparse
     foliage that ends up mostly holes — it often does): generate the foliage
     DENSE and fully opaque (no white background in the prompt), then knock the
     darkest shadow pixels out as holes, tuning the luminance threshold until
     the solid fraction lands in 0.70-0.90:
     `convert dense.webp \( +clone -colorspace gray -threshold 15% \) -alpha off -compose CopyOpacity -composite out.webp`
     The holes land in the shadowed gaps between leaf clumps, which reads
     naturally in-game.

## Workflow

1. **Generate** using `mcp__art-gen__generate_image` with the combined base prompt + user description
2. **Convert** to 64x64 WebP: `convert "{output}.png" -resize 64x64 -quality 60 "{name}.webp"`
   (foliage: use the alpha punch-out command from the design rules above instead)
3. **REVIEW — mandatory, never skip.** Every generated texture must be visually
   inspected before it is placed, and regenerated (with an adjusted prompt) if it
   fails any check:
   1. Build a review sheet showing the texture solo AND tiled 2x2 (tiling is
      where seams and repeating artifacts show up):
      ```bash
      montage tex.webp tex.webp tex.webp tex.webp -tile 2x2 -geometry +0+0 tiled.png
      montage tex.webp tiled.png -tile 2x1 -geometry 256x256+8+8 -background gray20 review.png
      ```
   2. View review.png with the Read tool and check ALL of:
      - tiles seamlessly — no visible grid lines, edge discontinuities, or one
        conspicuous feature that repeats like wallpaper
      - the design fills the square face (see face-specific rules: no circle-in-
        square log ends, no vignettes, no borders)
      - foliage shows real transparent holes in the tiled view
      - reads correctly at block scale (64px) — not muddy, not one flat color
      - palette and pixelation match the existing textures in
        src/world/blocks/types/*/assets/
   3. If any check fails: adjust the prompt to name the failure explicitly
      (e.g. "rings must reach the square edges") and regenerate. Do not place a
      failing texture, and do not stop reviewing after the first success —
      re-review after every regeneration.
4. **Place** in `src/world/blocks/types/{block_name}/assets/`

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
