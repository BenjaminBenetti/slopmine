---
name: generate-texture
description: Generate seamless block textures. You must use this skill when creating game assets / textures / art.
allowed-tools: mcp__art-gen__generate_image, Bash, Read
---

# Generate Block Texture

Generate seamless block textures for the Slopmine voxel game with an image generator (the art-gen
MCP or the Codex CLI's built-in one), then downscale, check, and review them before they go in the
repo.

## Terrain Style Statement (binding for terrain, foliage and liquids)

- Crisp 64×64 pixel art, 6–10 colors, with details at least 2 px across (roughly a 32 px detail grid).
  No 1 px static noise.
- **Brightness**: terrain averages 35–55% luma. Dark rocks (hell rock, basalt, mud) sit at 15–25%.
  Sand and snow stay at or below 80%.
- **Saturation**: at most 45% (HSL) for earth, stone and foliage, and at most 60% for water. Wood
  families follow their own planks palette.
- **No black outlines, bevels or embossed stones.** Nothing big enough to be recognized on a single
  block, since anything recognizable repeats like wallpaper when tiled.
- **Top faces** (grass, snow, sand, dirt, podzol, mud) must be isotropic and look the same when
  rotated by 90°.
- **Greens share one family.** Grass is ≈95° hue, oak leaves ≈98°, redwood foliage ≈115° and pine
  needles ≈125°. A new plant or leaf picks a hue inside that range.
- **Browns share one warm ramp.** Dirt (#7a5536 family) is also the dirt under grass and snow sides.
  Podzol and mud are darker and less saturated steps of the same ramp.
- **Wood**: each family shares one palette anchored to its LOG texture. Oak bark (`oak-log.webp`)
  anchors the whole oak family, so never change it without Ben's OK. Keep knots and other features
  subtle; Ben rejected over-stylized knots and "too golden" pine.
- **Stone** is natural rock, not cobblestone. Ores are flush mineral flecks composited onto the
  current stone (or basalt), never a different matrix.
- Measure every texture, don't eyeball it:
  `convert x.webp -colorspace gray -format "%[fx:mean]" info:` gives luma.
  `convert x.webp -colorspace HSL -format "%[fx:mean.g]" info:` gives saturation.

Current reference values (luma / sat):

| Texture | Luma / sat |
|---|---|
| stone | 0.47 / 0.03 |
| grass top | 0.48 / 0.40 |
| dirt | 0.36 / 0.38 |
| snow | 0.80 / 0.11 |
| water | 0.35 / 0.54 |
| oak leaves | 0.41 / 0.47 |
| pine needles | 0.29 / 0.30 |
| mud | 0.25 / 0.29 |
| hell rock | 0.20 / 0.51 |
| moss | 0.36 / 0.41 |
| mossy stone | 0.42 / 0.19 |

## Base Prompt Template

Always combine this base with the texture description. It is deliberately calmer than a "rich
detail / dithering" prompt, which pushes the generator toward busy noise.

```
Seamless tileable square texture for a voxel game block face (like a Minecraft block texture), viewed
straight-on, orthographic, flat even lighting, no perspective, no cast shadows. Crisp retro pixel art
drawn on a coarse 32x32 grid of large square pixels so each art pixel is clearly visible. Limited
palette of 6-10 colors, low contrast, muted natural colors. No black outlines, no bevels, no embossing,
no borders or frames, no text. Details are small and evenly distributed over the whole square with no
single large or eye-catching feature, so it does not look like wallpaper when repeated. Must tile
seamlessly on all four edges. Fill the entire square edge to edge. Subject: {description with hex palette}
```

Always name the palette as hex values, and name the failure modes to avoid ("NOT cobblestone: no
individual stones, no mortar", "no diamond lattice", "not mustard"). For foliage, add "Chunky
low-resolution pixel art like a 64x64 Minecraft texture ... No fine detail smaller than one art
pixel". Without it, conifer needles come out too fine and turn to mush at 64 px.

## Generating

Two generators produce usable raw images; the post-processing below is the same for both.

- **art-gen MCP** (`mcp__art-gen__generate_image`, Gemini; server in `script/art-gen`, configured
  in `.mcp.json`). Use it when it is connected. It needs `pnpm install` in `script/art-gen` and
  `GEMINI_API_KEY` (launch.sh reads it from `~/.bashrc`). Pass the prompt, and optionally a
  `filename`; the reply names the saved PNG (under `script/art-gen/output/`).
- **Codex CLI** (below): use it when art-gen is not connected.

### Codex CLI

Use Codex's built-in `image_gen` tool, always with the **read-only** sandbox. Never pass
`--full-auto` or any writable sandbox; they are blocked by policy.

```bash
mkdir -p "$OUT" && cd "$OUT" && codex exec --skip-git-repo-check --sandbox read-only \
  "Use your built-in image_gen tool to generate ONE image: <base prompt + description>. Do not run shell commands. After generating, reply with the path where the image was stored." \
  > gen.log 2>&1
cp "$(grep -oE '/home/node/\.codex/generated_images/[^ )`"'"'"']*\.png' gen.log | tail -1)" raw.png
```

- Each image takes about 40 s. It lands under `/home/node/.codex/generated_images/<session>/*.png`
  as a 1254×1254 PNG, and the reply contains the path. Copy it out yourself.
- You can run up to ~6 `codex exec` jobs concurrently (background them or use `xargs -P 6`).
  Generate 2 variants of anything important and pick the better one on the review sheet.
- Keep scratch work (raw PNGs, review sheets, helper scripts) outside the repo.

## Post-processing Pitfalls (check every raw image)

1. **Alpha**: the generator sometimes emits real alpha, either semi-transparent everywhere or real
   holes. Check with `identify -format "%[channels]" raw.png`. For an opaque texture, flatten first:
   `convert raw.png -background "<darkest palette colour>" -alpha remove -alpha off raw_rgb.png`.
2. **Pixel grid**: most Codex outputs sit on a ~64-cell grid (≈19.6 px per cell), so
   `-filter box -resize 64x64!` maps one art pixel to one texel. Only use
   `-resize 32x32! -filter point -resize 64x64` if the 32 px version reads better on the review
   sheet. It usually loses contrast.
3. **Internal repetition**: the generator sometimes paints a 2×2 repeat of a smaller tile (one water
   render and one snow render did). That doubles the wallpaper frequency. Compare the image with
   itself shifted by (32,0), (0,32) **and (32,32)**; a near-zero difference at any of them means it
   repeats. The snow repeated only diagonally, so a half-width check alone passed it:
   ```bash
   for d in +32+0 +0+32 +32+32 +17+9; do convert x.png \( x.png -roll $d \) -compose difference -composite \
     -colorspace gray -format "$d %[fx:mean]\n" info:; done   # the +17+9 line is the baseline
   ```
   Reject it and regenerate with "the square is ONE single tile, do not repeat the pattern inside it,
   no 2x2 repetition, no diagonal lattice".
4. **Seams**: the raw outputs are usually already seamless. Check with a 3×3 tiled review and fix by
   regenerating. **Never** make a 64 px texture tileable by rolling it half a tile and cutting it back
   into itself: the result contains every region twice (a hidden 2×2 repeat).
5. **Hue shifts**: use `-define modulate:colorspace=HSB -modulate B,S,H`. The default HSL modulate
   clips saturated dark pixels to pure black.
6. **Encoding**: always use lossless WebP, and encode with **cwebp**, not ImageMagick:
   `cwebp -quiet -lossless -exact -z 9 -metadata none in.png -o out.webp`. Lossy WebP's 4:2:0
   chroma subsampling smears pixel-art colour edges. `-exact` keeps the RGB under alpha-0 pixels.
   ImageMagick 6's webp coder silently ignores `-define webp:exact=true` and writes black under
   every hole, which undoes the step-4 foliage bleed (three.js uploads un-premultiplied, so the
   black is sampled at mip levels). Verify with
   `dwebp -quiet out.webp -pam -o t.pam && convert t.pam -depth 8 txt:- | grep -c 'none$'`, which
   counts holes stored as black (ImageMagick prints them as `none`). It must print 0 for foliage and
   sprites. Files stay around 3–9 KB at 64×64.
7. **Sprites** (flowers, shells, ladders): ship them at 64×64, never 1024 px. Downscale with
   `-filter box -resize 64x64!` (alpha-weighted, so there's no halo). Plain point sampling picks up
   the soft edge pixels as stray white specks. Then binarise alpha at 50%, which matches
   `alphaTest: 0.5`, and bleed the RGB into the holes. Keep sprites of one family at one scale:
   the three flowers are about 57 px tall, head about 22–38 px wide, stem reaching the bottom edge.
   The old poppy filled the whole square and read as a blob twice the size of the others.

## Face-Specific Design Rules

- **Log/pillar END textures (top/bottom faces)**: never accept a circular ring motif floating inside
  the square; the corners read as a "pasted-on circle" on the cube face. Prompt for rings that FILL the
  square edge-to-edge, e.g. "concentric squarish growth rings following the square shape of the face,
  filling it edge-to-edge, with a bark rim 3-4 pixels wide running along all four edges". Take the ring
  palette from the family's planks and the rim palette from its bark.
- **Grass/snow/mud sides**: compose these; don't generate them. The side is the block's bottom
  texture (dirt, or mud for muddy grass) with a fringe copied pixel-for-pixel from the top texture's
  own rows, so the palette matches the top face exactly. Rules for the fringe:
  - 10–15 px deep (8–11 px for snow).
  - Irregular drip edge stepping in 2 px columns, with a few longer drips.
  - The depth profile must wrap horizontally so the side tiles.
  - Last fringe row darkened ~15%.
  Re-compose every side whenever its top or bottom texture changes.
- **Ores**: composite onto the current stone (basalt for sulfur).
  - Use 5–6 clusters placed with wrap-aware Poisson-disc spacing (no grid).
  - Each cluster is 2–3 accreted blobs, ≈13% total coverage. Keep them similar in size: one big
    body cluster (tried in review) becomes the recognisable per-block feature that repeats when
    tiled.
  - Shade subtly: mostly the mid tone, lighter at upper-left edges, darker at lower-right, a few
    sparkle pixels, no outline.
  - Palettes:

    | Ore | Colours |
    |---|---|
    | iron | #9a6e52 / #b88a6c / #d8af93 |
    | gold | #a87a1e / #c99a2e / #f2c94c |
    | copper | #8e4a26 / #c26b3c / #de8a55 + 15% #4fa38a patina |
    | coal | #1c1c1c / #2a2a2a / #3d3d3d |
    | diamond | #2a8a9a / #3fb0c0 / #6fe0e0 |
    | sulfur | #a8902a / #c9b02e / #e8d44a |

  Redo all ores whenever stone changes.
- **Mossy stone**: compose it; don't generate it. Take the moss block's own pixels and grow them over
  the current stone in irregular patches (~40% coverage). Build the patch mask from wrap-aware
  low-frequency value noise, biased a little toward the stone's darker cracks. Clean the mask so no
  1 px specks remain, and darken the moss pixels on the lower/right edge of each patch ~28% as a
  contact shadow, not an outline. Redo it whenever stone or moss changes.
- **Liquids**: water must tile on both axes and stay calm with no lattice, because the renderer
  scrolls it. Each liquid family has ONE canonical texture that every level block shares (through
  the family's shared material): `water/assets/water.webp`, `swamp_water/assets/swamp-water.webp`,
  `lava/assets/lava.webp`. The level blocks (`water_half/` etc.) have no textures of their own.
- **Foliage/leaf textures** must ship with REAL alpha holes (TrueColorAlpha; leaf materials use
  `alphaTest`). The generator cannot reliably output real transparency, so use the dense-foliage +
  luma-knockout method:
  1. Prompt for DENSE, fully opaque foliage with "small darker shadow gaps #xxxxxx between the
     clusters covering about a fifth of the area". Never say "transparent"; that makes the generator
     paint a fake checkerboard.
  2. Downscale to 64×64 first, then apply any hue/tone shift (HSB modulate).
  3. Knock the darkest pixels out as holes. Blur the luma slightly first so the holes gather in the
     shadow gaps instead of 1 px speckle. Tune the threshold until the solid fraction lands in
     0.70–0.90 (≈0.80 is right for all current leaves):
     ```bash
     convert dense64.png \( +clone -colorspace gray -virtual-pixel tile -blur 0x0.8 -threshold 32% \) \
       -alpha off -compose CopyOpacity -composite ko.png
     convert ko.png -alpha extract -threshold 50% -format "%[fx:mean]" info:   # solid fraction
     ```
  4. Set the RGB under the holes to the leaf's average colour so mips never average in black:
     `convert ko.png -background "$(convert ko.png -alpha off -scale 1x1! -format '#%[hex:u]' info:)" -alpha background out.png`
  5. Verify that `identify -format "%[type]" out.webp` says `TrueColorAlpha`.
  6. For snowy variants, prompt for the snow explicitly ("snow clumps 5-10 px cover about 40% of the
     area"). The knockout only removes dark pixels, so snow survives. A thin procedural snow rim
     reads as a highlight, not snow.

## Workflow

1. **Generate** 1–2 variants with art-gen or the Codex CLI as described above.
2. **Process**: flatten alpha if needed, box-downscale to 64×64, apply HSB tone/hue shifts to hit
   the style targets, then do the foliage knockout or composition step. Encode lossless WebP with
   the same file name and path as the file it replaces, so no code changes are needed.
3. **REVIEW — mandatory, never skip.** Inspect every texture before placing it, and regenerate it
   (with an adjusted prompt) if it fails any check:
   1. Build a review sheet with OLD vs NEW, each shown solo and tiled 3×3 (tiling is where seams
      and repetition show up). Use point filtering, and a sky-blue background for alpha textures:
      ```bash
      convert new.webp \( +clone +clone \) +append \( +clone +clone \) -append -filter point -resize 384x384 tiled.png
      montage old.webp tiled_old.png new.webp tiled.png -tile 4x -geometry 384x384+6+6 -filter point -background gray25 review.png
      ```
   2. Build a **neighbour sheet** that places the texture next to what it meets in the world, for
      example:
      - grass top (tiled, randomly rotated by 90°) above grass side, above dirt, above stone with
        ores
      - leaves around a log with its top face
      - swamp: muddy grass, mud, swamp water
      - hell: hell rock, magma, lava
   3. View both sheets with the Read tool and check ALL of:
      - it tiles seamlessly, with no grid lines, edge discontinuities, or conspicuous repeating
        feature
      - the design fills the square face (see the face-specific rules)
      - foliage shows real transparent holes in the tiled view
      - it reads correctly at block scale: not muddy, not one flat colour
      - luma and saturation are within the style targets (measure them), and the palette sits in
        the same family as its neighbours
   4. If any check fails, adjust the prompt to name the failure explicitly (e.g. "rings must reach
      the square edges", "no diagonal alignment") and regenerate. Do not place a failing texture,
      and re-review after every regeneration.
4. **Place** in `src/world/blocks/types/{block_name}/assets/`. Update every identical copy
   (e.g. `dirt.webp` also lives in `grass/` and `snowy_grass/`; liquids have one file per family).
5. **In-game check**: run the verify skill's screenshot tour and compare against a baseline. Judge
   only the textures, since lighting changes elsewhere also affect the result.

---

# Generate Item Icons

For inventory item icons (food, tools, ores, etc.), the workflow is different from block textures.

## CRITICAL: Background Removal

**Item icons MUST have transparent backgrounds.** The AI generator does NOT create true transparency.

### Prompt Rules

**ALWAYS request a WHITE background, NEVER say "transparent":**
- If you say "transparent background", the AI generates a fake gray checkered pattern that is NOT
  transparent and is hard to remove.
- WHITE backgrounds are solid and easy to remove cleanly.

### Item Icon Workflow

1. **Generate** with art-gen or the Codex CLI (as above) and a WHITE background:
   ```
   A pixel art icon of {item_description} for a Minecraft-style game inventory.
   32x32 pixel art style, simple blocky aesthetic. On a plain solid WHITE background.
   ```

2. **Remove the background with a magic select from the corner** (REQUIRED), binarise alpha at
   50%, bleed the icon's average colour under the holes (icons are also drawn as 3D items, so their
   mips must not average in black), and encode with cwebp like every other texture (pitfall 6):
   ```bash
   convert "{output}.png" -fuzz 10% -fill none -draw "color 0,0 floodfill" -filter box -resize 64x64! icon.png
   convert icon.png -channel A -threshold 50% +channel \
     -background "$(convert icon.png -scale 1x1! -alpha off -format '#%[hex:u]' info:)" -alpha background icon.png
   cwebp -quiet -lossless -exact -z 9 -metadata none icon.png -o "{name}.webp"
   ```
   The floodfill selects the contiguous white pixels starting from corner (0,0) with 10% tolerance.
   White pixels INSIDE the item (bones, highlights, etc.) are preserved. (`-scale` averages
   alpha-weighted, so the bleed colour is the item's own average.)

3. **Verify transparency**:
   ```bash
   identify -format "%[type]\n" "{name}.webp"
   # Must show "TrueColorAlpha" ("PaletteAlpha" for an icon with few colours is fine too)
   dwebp -quiet "{name}.webp" -pam -o t.pam && convert t.pam -depth 8 txt:- | grep -c 'none$'
   # Must print 0 (no hole stored as black)
   ```

4. **Place** in `src/items/{category}/{item_name}/assets/`.

### Why This Approach

- **Magic select from the corner + fuzz** removes only the CONTIGUOUS background, not white pixels
  inside the item.
- **DO NOT use `-transparent white`** alone. It removes ALL white pixels, including bones,
  highlights, teeth and eyes.
- **DO NOT say "transparent" in prompts.** The AI generates non-transparent checkerboard patterns.

## Example Descriptions

- **Stone**: "natural solid rock face, medium cool gray #7c7f80/#6b6e70/#8f9294/#5a5d5f, faint irregular
  hairline cracks and subtle horizontal strata, sparse light mineral flecks, NOT cobblestone"
- **Grass top**: "short lawn from directly above, tiny 1px blade strokes 2-3px long pointing in all
  directions, isotropic, yellow-green #6a9a3a/#5b8a32/#7aab45/#4d7a2b, not neon"
- **Water**: "calm lake surface from above, deep blue #2f5f8f/#3a6d9e/#2a557f, sparse soft highlights
  #5d8fbf, broad gentle irregular ripples, the square is ONE tile, no diamond lattice"
- **Obsidian**: "dark purple-black volcanic glass with subtle reflective highlights"
- **Packed Ice**: "compressed blue-white ice with crystalline structures and air bubbles"
