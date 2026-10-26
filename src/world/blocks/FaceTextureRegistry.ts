import { BlockIds } from './BlockIds.ts'

/**
 * Texture IDs for greedy meshing face grouping.
 * Faces with different texture IDs cannot be merged together.
 *
 * Each unique texture gets a unique sequential ID.
 * IMPORTANT: When adding a new texture, add it here with a unique ID.
 * Faces with the same texture (e.g., dirt and grass bottom) should share the same ID.
 */
export enum TextureId {
  // Sequential IDs for each unique texture asset
  AIR = 0,         // Not rendered, but defined
  STONE = 1,       // stone.webp
  DIRT = 2,        // dirt.webp (also used by grass bottom)
  GRASS_TOP = 3,   // grass.webp
  GRASS_SIDE = 4,  // grass-dirt.webp
  OAK_LOG_SIDE = 5,  // oak-log.webp
  OAK_LOG_END = 6,   // oak-log-top.webp
  OAK_LEAVES = 7,
  IRON_BLOCK = 8,
  COPPER_BLOCK = 9,
  COAL_BLOCK = 10,
  GOLD_BLOCK = 11,
  DIAMOND_BLOCK = 12,
  TORCH = 13,        // Non-greedy, but defined
  FORGE_FRONT = 14,
  FORGE_SIDE = 55,
  FORGE_TOP = 56,
  WATER = 15,        // Non-greedy, transparent liquid
  WATER_THREE_QUARTER = 16,  // Non-greedy, partial liquid (3/4 height)
  WATER_HALF = 17,           // Non-greedy, partial liquid (1/2 height)
  WATER_QUARTER = 18,        // Non-greedy, partial liquid (1/4 height)
  WATER_EIGHTH = 19,         // Non-greedy, evaporating liquid (1/8 height)
  WATER_SEVEN_EIGHTH = 20,   // Non-greedy, partial liquid (7/8 height)
  WATER_FIVE_EIGHTH = 21,    // Non-greedy, partial liquid (5/8 height)
  WATER_THREE_EIGHTH = 22,   // Non-greedy, partial liquid (3/8 height)
  LAVA = 23,                 // Non-greedy, transparent liquid (full height)
  LAVA_SEVEN_EIGHTH = 24,    // Non-greedy, partial liquid (7/8 height)
  LAVA_THREE_QUARTER = 25,   // Non-greedy, partial liquid (3/4 height)
  LAVA_FIVE_EIGHTH = 26,     // Non-greedy, partial liquid (5/8 height)
  LAVA_HALF = 27,            // Non-greedy, partial liquid (1/2 height)
  LAVA_THREE_EIGHTH = 28,    // Non-greedy, partial liquid (3/8 height)
  LAVA_QUARTER = 29,         // Non-greedy, partial liquid (1/4 height)
  LAVA_EIGHTH = 30,          // Non-greedy, evaporating liquid (1/8 height)
  SAND = 31,                 // sand.webp
  SANDSTONE = 32,            // sandstone.webp
  CACTUS = 33,               // cactus.webp
  VINE = 34,                 // vine.webp
  BASALT = 35,               // basalt.webp
  MAGMA = 36,                // magma.webp
  MUD = 37,                  // mud.webp
  CLAY = 38,                 // clay.webp
  MUSHROOM = 39,             // mushroom.webp
  MUSHROOM_CAP = 40,         // mushroom-cap.webp
  SWAMP_WATER = 41,          // swamp-water.webp
  SWAMP_WATER_SEVEN_EIGHTH = 42,
  SWAMP_WATER_THREE_QUARTER = 43,
  SWAMP_WATER_FIVE_EIGHTH = 44,
  SWAMP_WATER_HALF = 45,
  SWAMP_WATER_THREE_EIGHTH = 46,
  SWAMP_WATER_QUARTER = 47,
  SWAMP_WATER_EIGHTH = 48,
  MUDDY_GRASS_TOP = 49,
  MUDDY_GRASS_SIDE = 50,
  BLUE_MUSHROOM = 51,
  BLUE_MUSHROOM_CAP = 52,
  PURPLE_MUSHROOM = 53,
  PURPLE_MUSHROOM_CAP = 54,
  WHEAT_1 = 57,              // wheat-1.webp (seedling)
  WHEAT_2 = 58,              // wheat-2.webp (growing)
  WHEAT_3 = 59,              // wheat-3.webp (mature)
  HELL_ROCK = 60,            // hell-rock.webp
  HELL_MAGMA = 61,           // hell-magma.webp
  CORRUPTED_HELL_ROCK = 62,  // corrupted-hell-rock.webp
  GLASS = 63,                // glass.webp
  HERB_1 = 64,               // herb-1.webp (seedling)
  HERB_2 = 65,               // herb-2.webp (growing)
  HERB_3 = 66,               // herb-3.webp (mature)
  APOTHECARY_FRONT = 67,     // apothecary-front.webp
  APOTHECARY_SIDE = 68,      // apothecary-side.webp
  APOTHECARY_TOP = 69,       // apothecary-top.webp
  YELLOW_FLOWER = 70,        // yellow-flower.webp
  BLUE_FLOWER = 71,          // blue-flower.webp
  RED_FLOWER = 72,           // red-flower.webp
  JUNGLE_FERN = 73,          // jungle-fern.webp
  LADDER = 74,               // ladder.webp
  HEMP_1 = 75,               // hemp-1.webp (seedling)
  HEMP_2 = 76,               // hemp-2.webp (growing)
  HEMP_3 = 77,               // hemp-3.webp (mature)
  BED_HEAD_TOP = 78,         // bed-head-top.webp (pillow/blanket from above)
  BED_HEAD_FRONT = 79,       // bed-head-front.webp (headboard with pillow)
  BED_SIDE = 80,             // bed-side.webp (wood frame with blue blanket)
  BED_FOOT_TOP = 81,         // bed-foot-top.webp (blanket from above)
  BED_FOOT_END = 82,         // bed-foot-end.webp (foot of bed)
  BED_BOTTOM = 83,           // bed-bottom.webp (wood underside)
  ROPE_LADDER = 84,          // rope_ladder.webp
  WOODWORKING_BENCH_FRONT = 85,  // woodworking-bench-front.webp
  WOODWORKING_BENCH_SIDE = 86,   // woodworking-bench-side.webp
  WOODWORKING_BENCH_TOP = 87,    // woodworking-bench-top.webp
  DIVINING_STICK = 88,           // divining-stick.webp
  CHEST_FRONT = 89,              // chest-front.webp
  CHEST_SIDE = 90,               // chest-side.webp
  CHEST_TOP = 91,                // chest-top.webp
  PINE_LOG_SIDE = 92,            // pine-log.webp
  PINE_LOG_END = 93,             // pine-log-top.webp
  PINE_NEEDLES = 94,             // pine-needles.webp
  PODZOL = 95,                   // podzol.webp
  REDWOOD_LOG_SIDE = 96,         // redwood-log.webp
  REDWOOD_LOG_END = 97,          // redwood-log-top.webp
  REDWOOD_LEAVES = 98,           // redwood-leaves.webp
  MOSS = 99,                     // moss.webp
  MOSSY_STONE = 100,             // mossy-stone.webp
  COASTAL_FERN = 101,            // coastal-fern.webp (bottom half)
  COASTAL_FERN_TOP = 102,        // coastal-fern-top.webp (top half)
  SEA_SHELL = 103,               // sea-shell.webp (decor block face map entry)
  CRAB_SHELL = 104,              // crab-shell.webp (decor block face map entry)
  RESIN_TORCH = 105,             // custom geometry, colored materials (like TORCH)
  SEA_STAR = 106,                // sea-star.webp (decor block face map entry)
  OAK_PLANKS = 107,              // oak-planks.webp (shared by oak slab/stairs/fence/gate/table/chair/shelf)
  PINE_PLANKS = 108,             // pine-planks.webp (shared by pine carpentry blocks)
  REDWOOD_PLANKS = 109,          // redwood-planks.webp (shared by redwood carpentry blocks)
  OAK_DOOR_LOWER = 110,          // oak-door-lower.webp
  OAK_DOOR_UPPER = 111,          // oak-door-upper.webp
  PINE_DOOR_LOWER = 112,         // pine-door-lower.webp
  PINE_DOOR_UPPER = 113,         // pine-door-upper.webp
  REDWOOD_DOOR_LOWER = 114,      // redwood-door-lower.webp
  REDWOOD_DOOR_UPPER = 115,      // redwood-door-upper.webp
  OAK_TRAPDOOR = 116,            // oak-trapdoor.webp
  PINE_TRAPDOOR = 117,           // pine-trapdoor.webp
  REDWOOD_TRAPDOOR = 118,        // redwood-trapdoor.webp
  OAK_WINDOW = 119,              // oak-window.webp (transparent)
  PINE_WINDOW = 120,             // pine-window.webp (transparent)
  REDWOOD_WINDOW = 121,          // redwood-window.webp (transparent)

  // Pine forest expansion (fallen logs / stumps reuse PINE_LOG_SIDE/END)
  SNOWY_GRASS_TOP = 122,         // snowy-grass.webp
  SNOWY_GRASS_SIDE = 123,        // snowy-grass-side.webp
  SNOWY_PINE_NEEDLES = 124,      // snowy-pine-needles.webp (transparent)
  PINECONE = 125,                // pinecone.webp (transparent)
  PINE_SAPLING = 126,            // pine-sapling.webp (transparent)
  BERRY_BUSH = 127,              // berry-bush.webp (transparent)
  BERRY_BUSH_BERRIES = 128,      // berry-bush-berries.webp (transparent)
  MOREL_MUSHROOM = 129,          // morel-mushroom.webp (transparent)
  RESIN_TAP = 130,               // resin-tap.webp
  CAMPFIRE = 131,                // campfire.webp

  // Jungle expansion
  CATTAIL = 132,                 // cattail-bottom.webp (transparent)
  CATTAIL_TOP = 133,             // cattail-top.webp (transparent)

  // Volcanic expansion
  OBSIDIAN = 134,                // obsidian.webp
  SULFUR_ORE = 135,              // sulfur_ore.webp
  GEYSER = 136,                  // geyser.webp
  GEYSER_ACTIVE = 137,           // geyser_active.webp
  CHARRED_LOG = 138,             // charred_log.webp
  TNT = 139,                     // tnt.webp
  SMOLDERING_STONE = 140,        // smoldering_stone.webp
  COLUMNAR_BASALT_SIDE = 141,    // columnar-basalt-side.webp
  COLUMNAR_BASALT_TOP = 142,     // columnar-basalt-top.webp

  // Progression (journal, recipe sinks)
  SLIME = 300,                   // slime.webp

  // Weapons, tool tiers 6-7 and the Hellforge
  // Hellforge faces (non-greedy instanced block: no texture-array layers)
  HELLFORGE_FRONT = 330,         // hellforge-front.webp
  HELLFORGE_SIDE = 331,          // hellforge-side.webp
  HELLFORGE_TOP = 332,           // hellforge-top.webp

  // Dungeons (guardian spawners, Sigil Compass)
  GUARDIAN_SPAWNER_TOP = 310,        // guardian-spawner-top.webp (glowing summoning circle)
  GUARDIAN_SPAWNER_SIDE = 311,       // guardian-spawner-side.webp (glowing rune band; also the bottom)
  GUARDIAN_SPAWNER_SPENT_TOP = 312,  // guardian-spawner-spent-top.webp (cold, cracked)
  GUARDIAN_SPAWNER_SPENT_SIDE = 313, // guardian-spawner-spent-side.webp (cold, cracked; also the bottom)
  GARRISON_SPAWNER_TOP = 314,        // garrison-spawner-top.webp (iron floor grate, embers below)
  GARRISON_SPAWNER_SIDE = 315,       // garrison-spawner-side.webp (iron-bound stone; also the bottom)

  // Hell: Molten Wastes
  INFERNIUM_ORE = 400,              // infernium-ore.webp
  INFERNAL_BRICKS = 401,            // infernal-bricks.webp
  CRACKED_INFERNAL_BRICKS = 402,    // cracked-infernal-bricks.webp
  INFERNAL_BRICK_PILLAR_SIDE = 403, // infernal-brick-pillar-side.webp
  INFERNAL_BRICK_PILLAR_TOP = 404,  // infernal-brick-pillar-top.webp
  EMBER_GLYPH = 405,                // ember-glyph.webp
  INFERNAL_BRAZIER = 406,           // custom geometry, coloured materials (no texture layer)
  HELL_ASH = 407,                   // hell-ash.webp
  INFERNAL_TILES = 408,             // infernal-tiles.webp
  OBSIDIAN_BRICKS = 409,            // obsidian-bricks.webp
  GILDED_INFERNAL_BRICKS = 410,     // gilded-infernal-bricks.webp
  MAGMA_BRICKS = 411,               // magma-bricks.webp (emissive mortar)
  SCORCHED_INFERNAL_BRICKS = 412,   // scorched-infernal-bricks.webp
  CHARRED_PLANKS = 413,             // charred-planks.webp
  // Custom geometry (no texture-array layer; stairs/slab reuse INFERNAL_BRICKS)
  INFERNAL_IRON_BARS = 414,
  INFERNAL_CHAIN = 415,
  EMBER_LANTERN = 416,
  INFERNAL_BANNER = 417,            // infernal-banner.webp (material map, not the array)
  INFERNAL_ANVIL = 418,
  WEAPON_RACK = 419,
  INFERNAL_THRONE = 420,
  INFERNAL_HOARD = 421,

  // Hell: The Ossuary
  // Greedy layers (10): 440-449
  BONE_ASH = 440,                // bone-ash.webp
  OSSIFIED_ROCK = 441,           // ossified-rock.webp
  BONE_BLOCK_SIDE = 442,         // bone-block-side.webp
  BONE_BLOCK_TOP = 443,          // bone-block-top.webp
  SOUL_VEIN = 444,               // soul-vein.webp (emissive veins)
  CATACOMB_BRICK = 445,          // catacomb-brick.webp
  CATACOMB_SKULL_BRICK = 446,    // catacomb-skull-brick.webp
  SOUL_LANTERN = 447,            // soul-lantern.webp (emissive)
  SARCOPHAGUS_TOP = 448,         // sarcophagus-top.webp
  SARCOPHAGUS_SIDE = 449,        // sarcophagus-side.webp
  // Non-greedy (no array layer)
  SOUL_TORCH = 450,              // custom geometry, colored materials (like TORCH)
  BONE_PILE = 451,               // bone-pile.webp (transparent sprite)
  SOUL_BLOOM = 452,              // soul-bloom.webp (transparent sprite)
  // Catacombs kit (round 2): greedy layers 453-460 (8)
  CRACKED_CATACOMB_BRICK = 453,  // cracked-catacomb-brick.webp
  CATACOMB_TILE = 454,           // catacomb-tile.webp (also the altar's top)
  CARVED_BONE_PILLAR = 455,      // carved-bone-pillar.webp (top/bottom reuse BONE_BLOCK_TOP)
  BURIAL_NICHE = 456,            // burial-niche.webp
  CRYPT_GRATE = 457,             // crypt-grate.webp (cutout)
  CRYPT_ALTAR = 458,             // crypt-altar.webp
  GILDED_RELIQUARY = 459,        // gilded-reliquary.webp
  CATACOMB_FRIEZE = 460,         // catacomb-frieze.webp (top/bottom reuse CATACOMB_BRICK)
  // Non-greedy (no array layer)
  FUNERARY_URN = 461,            // custom geometry, coloured materials
  SOUL_CANDELABRA = 462,         // custom geometry, coloured materials
  CRYPT_COBWEB = 463,            // crypt-cobweb.webp (transparent sprite)
  GRAVE_CANDLES = 464,           // custom geometry, coloured materials

  // Hell: Ember Grove
  EMBERWOOD_STEM_SIDE = 480,     // emberwood-stem.webp
  EMBERWOOD_STEM_END = 481,      // emberwood-stem-end.webp
  EMBERWOOD_PLANKS = 482,        // emberwood-planks.webp
  EMBER_CAP = 483,               // ember-cap.webp (emissive spots)
  EMBER_GILLS = 484,             // ember-gills.webp (emissive)
  CRIMSON_MYCELIUM_TOP = 485,    // crimson-mycelium.webp
  CRIMSON_MYCELIUM_SIDE = 486,   // crimson-mycelium-side.webp (bottom face = HELL_ROCK)
  SHELF_FUNGUS = 487,            // shelf-fungus.webp
  HIVE_ROOTBRICK = 488,          // hive-rootbrick.webp
  HIVE_ROOT = 489,               // hive-root.webp
  SPORE_SAC = 490,               // spore-sac.webp (emissive)
  GLOWCAP = 491,                 // glowcap.webp (non-greedy sprite)
  SPORE_STRAND = 492,            // spore-strand.webp (non-greedy sprite)
  CRIMSON_SPROUTS = 493,         // crimson-sprouts.webp (non-greedy sprite)
  // Sporeheart Hive kit
  CHITIN_PLATE = 494,            // chitin-plate.webp
  HIVE_MEMBRANE = 495,           // hive-membrane.webp (emissive veins)
  BROOD_COMB = 496,              // brood-comb.webp (emissive larvae)
  GILL_WALL = 497,               // gill-wall.webp (emissive)
  ROOT_PILLAR_SIDE = 498,        // root-pillar.webp
  ROOT_PILLAR_END = 499,         // root-pillar-end.webp
  ROOT_LATTICE = 500,            // root-lattice.webp (cutout)
  OVERGROWN_ROOTBRICK = 501,     // overgrown-rootbrick.webp
  MYCELIAL_CARPET = 502,         // mycelial-carpet.webp
  GLOWING_SAP = 503,             // glowing-sap.webp (emissive)
  EGG_POD_CLUSTER = 504,         // egg-pods.webp (non-greedy sprite)
  HANGING_TENDRILS = 505,        // hanging-tendrils.webp (non-greedy sprite)
  GLOW_BULB = 506,               // non-greedy custom geometry, coloured materials (no texture)

  // Hell: Crystal Abyss
  ABYSSAL_STONE = 520,            // abyssal-stone.webp
  PRISM_CRYSTAL = 521,            // prism-crystal.webp (emissive)
  SPIRE_CRYSTAL = 522,            // spire-crystal.webp (emissive)
  ROSE_CRYSTAL = 523,             // rose-crystal.webp (emissive)
  GLITTERING_ABYSSAL_STONE = 524, // glittering-abyssal-stone.webp (emissive flecks)
  GEODE_CRUST = 525,              // geode-crust.webp
  POLISHED_ABYSSAL_STONE = 526,   // polished-abyssal-stone.webp (also sanctum tile)
  ABYSSAL_BRICKS = 527,           // abyssal-bricks.webp
  SANCTUM_BRICK = 528,            // sanctum-brick.webp (emissive seams)
  CRYSTAL_LAMP = 529,             // crystal-lamp.webp (emissive)
  PRISM_CLUSTER = 530,            // prism-cluster.webp (sprite, both cluster blocks)
  INLAID_SANCTUM_TILE = 531,      // inlaid-sanctum-tile.webp (emissive inlay)
  CARVED_SANCTUM_BRICK = 532,     // carved-sanctum-brick.webp (emissive gem)
  SANCTUM_PILLAR_SIDE = 533,      // sanctum-pillar-side.webp (top/bottom: polished abyssal)
  GILDED_SANCTUM_TRIM = 534,      // gilded-sanctum-trim.webp
  MIRROR_PANEL = 535,             // mirror-panel.webp
  PRISM_ROOF_TILE = 536,          // prism-roof-tile.webp
  CRYSTAL_ARCHIVE = 537,          // crystal-archive.webp (emissive tablets)
  CRYSTAL_GLASS = 538,            // crystal-glass.webp (non-greedy, blended)
  SANCTUM_BANNER = 539,           // sanctum-banner.webp (non-greedy sprite)
  PRISM_PEDESTAL = 540,           // non-greedy model (polished stone + crystal)
  PRISM_LANTERN = 541,            // non-greedy model
  LENS_APPARATUS = 542,           // non-greedy model

  // Hell: Cocytus
  BLACK_ICE = 560,               // black-ice.webp
  RIMESTONE = 561,               // rimestone.webp
  FROSTED_RIMESTONE_TOP = 562,   // frosted-rimestone.webp
  FROSTED_RIMESTONE_SIDE = 563,  // frosted-rimestone-side.webp
  ASH_SNOW = 564,                // ash-snow.webp
  GLACIAL_ICE = 565,             // glacial-ice.webp
  POLISHED_ICE = 566,            // polished-ice.webp
  GLACIAL_BRICK = 567,           // glacial-brick.webp
  RIME_CRYSTAL_ORE = 568,        // rime-crystal-ore.webp (emissive)
  FROZEN_MAGMA = 569,            // frozen-magma.webp (emissive)
  ENTOMBED_UPPER = 570,          // entombed-upper.webp (figure head half on black ice)
  ENTOMBED_LOWER = 571,          // entombed-lower.webp (figure legs half on black ice)
  FROST_CRYSTAL = 572,           // Non-greedy sprite (no texture-array layer)
  ICICLE = 573,                  // Non-greedy sprite (no texture-array layer)
  FROST_LANTERN = 574,           // Non-greedy model
  RIME_BRAZIER = 575,            // Non-greedy model
  CARVED_GLACIAL_BRICK = 576,    // carved-glacial-brick.webp
  FROSTED_GLACIAL_BRICK = 577,   // frosted-glacial-brick.webp
  ICE_PILLAR_SIDE = 578,         // ice-pillar-side.webp
  ICE_PILLAR_END = 579,          // ice-pillar-end.webp
  GLACIAL_TILES = 580,           // glacial-tiles.webp
  RIME_GRATE = 581,              // rime-grate.webp (cutout)
  RIME_GLYPH = 582,              // rime-glyph.webp (emissive)
  FROSTBOUND_PLANKS = 583,       // frostbound-planks.webp
  FROZEN_BOOKSHELF = 584,        // frozen-bookshelf.webp
  FROZEN_BANNER = 585,           // Non-greedy sprite (no texture-array layer)
  HANGING_FROST_LANTERN = 586,   // Non-greedy model
  ICE_KNIGHT_STATUE = 587,       // Non-greedy model

  // Day and night
  WARD_LANTERN = 588,            // Non-greedy model
  FOXFIRE_MUSHROOM = 589,        // foxfire_mushroom.webp
  FOXFIRE_MUSHROOM_CAP = 590,    // foxfire_mushroom_cap.webp (emissive)
  AMBER_MUSHROOM = 591,          // amber_mushroom.webp
  AMBER_MUSHROOM_CAP = 592,      // amber_mushroom_cap.webp (emissive)
  GLOWMOSS_TOP = 593,            // glowmoss_top.webp (emissive specks)
  GLOWMOSS_SIDE = 594,           // glowmoss_side.webp (emissive specks)
  GLIMMERCAP = 595,              // Non-greedy sprite (no texture-array layer)
  LUMEN_FERN = 596,              // Non-greedy sprite (no texture-array layer)
  GLOWKELP = 597,                // Non-greedy sprite (no texture-array layer)
  GLOWKELP_TOP = 598,            // Non-greedy sprite (no texture-array layer)
  LANTERNWEED = 599,             // Non-greedy sprite (no texture-array layer)

  // Nature
  FARMLAND_TOP = 600,            // farmland.webp (sides and bottom: dirt)
  FARMLAND_MOIST_TOP = 601,      // farmland_moist.webp

  // Caves and dark places
  DRIPSTONE_BLOCK = 602,         // dripstone_block.webp
  CALCITE = 603,                 // calcite.webp
  DAMP_SLATE = 604,              // damp_slate.webp
  CELESTITE_BLOCK = 605,         // celestite_block.webp (emissive)
  PALE_MYCELIUM = 606,           // pale_mycelium.webp (emissive specks)
  FROSTED_STONE = 607,           // frosted_stone.webp
  PALE_MUSHROOM_STEM = 608,      // pale_mushroom_stem.webp
  PALE_MUSHROOM_CAP = 609,       // pale_mushroom_cap.webp (emissive spots)
  CELESTITE_LAMP = 610,          // celestite_lamp.webp (emissive)
  ORE_CRATE = 611,               // ore_crate.webp
  GRAVEL = 612,                  // gravel.webp
  ANDESITE = 613,                // andesite.webp
  GRANITE = 614,                 // granite.webp
  // Underground points of interest
  ANCIENT_BRICKS = 615,          // ancient_bricks.webp
  MOSSY_ANCIENT_BRICKS = 616,    // mossy_ancient_bricks.webp
  CRACKED_ANCIENT_BRICKS = 617,  // cracked_ancient_bricks.webp
  CARVED_ANCIENT_BRICKS = 618,   // carved_ancient_bricks.webp
  ANCIENT_TILES = 619,           // ancient_tiles.webp
  RUNESTONE = 620,               // runestone.webp (emissive runes)
  ANCIENT_BOOKSHELF = 621,       // ancient_bookshelf.webp (sides; top and bottom are oak planks)
  PETRIFIED_WOOD = 622,          // petrified_wood.webp (sides)
  PETRIFIED_WOOD_TOP = 623,      // petrified_wood_top.webp
  HEAPED_GOLD = 624,             // heaped_gold.webp
  TREASURE_HOARD = 625,          // decor models (coloured materials, no texture layer)
  GOLD_COINS = 626,
  DRAGON_EGG = 627,
  SKULL = 628,
  BARREL = 629,                  // barrel_side.webp (a textured full block since the points-of-interest feedback)
  BEDROLL = 630,
  RUNE_PEDESTAL = 631,
  BOOK_PILE = 632,
  GOLDEN_IDOL = 633,
  SILK_COCOON = 634,
  MINERS_LANTERN = 635,
  DUSTY_BOTTLES = 636,
  FOSSIL_BONE = 637,             // fossil_bone.webp
  BARREL_TOP = 638,              // barrel_top.webp
  SANDSTONE_BRICKS = 639,        // sandstone_bricks.webp
  CARVED_SANDSTONE = 640,        // carved_sandstone.webp (sides; top is sandstone)
  IRON_BARS = 641,               // decor models (coloured materials, no texture layer)
  MINECART = 642,
  TELESCOPE = 643,
  STONE_BUST = 644,
  TANKARDS = 645,
  // Weather
  LIGHTNING_ROD = 646,           // decor models (coloured materials, no texture layer)
  WEATHERVANE = 647,
  FULGURITE = 648,               // fulgurite.webp
  STAR_FRAGMENT = 649,           // decor models (coloured materials, no texture layer)
  STAR_LANTERN = 650,
  // Water
  KELP = 651,                    // Non-greedy sprites (no texture-array layer)
  KELP_TOP = 652,
  SEAGRASS = 653,
}

// Cache for the face texture map
let cachedFaceTextureMap: Map<number, number> | null = null

/**
 * Build face texture map from all registered blocks.
 * This queries each block's getTextureForFace() method.
 *
 * @param getBlock Function to get block by ID (from BlockRegistry)
 * @param allBlockIds Array of all registered block IDs
 */
export function buildFaceTextureMap(
  getBlock: (id: number) => { getTextureForFace: (face: number) => number },
  allBlockIds: number[]
): Map<number, number> {
  const map = new Map<number, number>()

  for (const blockId of allBlockIds) {
    const block = getBlock(blockId)
    for (let face = 0; face < 6; face++) {
      const textureId = block.getTextureForFace(face)
      map.set(blockId * 6 + face, textureId)
    }
  }

  cachedFaceTextureMap = map
  return map
}

/**
 * Get the cached face texture map, or build it if not yet created.
 * For use in workers where BlockRegistry isn't available.
 */
export function getCachedFaceTextureMap(): Map<number, number> | null {
  return cachedFaceTextureMap
}

/**
 * Set the face texture map directly (for use in workers).
 */
export function setFaceTextureMap(map: Map<number, number>): void {
  cachedFaceTextureMap = map
}

/**
 * Create face texture map from serialized array (for worker transfer).
 */
export function deserializeFaceTextureMap(entries: Array<[number, number]>): Map<number, number> {
  const map = new Map(entries)
  cachedFaceTextureMap = map
  return map
}

/**
 * Get texture ID for a block face.
 * @param blockId Block ID
 * @param faceIndex Face index (TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5)
 * @param faceTextureMap Pre-created face texture map
 * @returns Texture ID for greedy mesh grouping
 */
export function getFaceTextureId(
  blockId: number,
  faceIndex: number,
  faceTextureMap: Map<number, number>
): number {
  const key = blockId * 6 + faceIndex
  return faceTextureMap.get(key) ?? blockId
}

/**
 * Block IDs that should NOT use greedy meshing (custom geometry or rotation).
 */
export const NON_GREEDY_BLOCK_IDS = new Set<number>([
  11, // Torch - custom slim geometry
  12, // Forge - directional block with rotation
  32, // Vine - directional flat plane with rotation
  58, // Glass - needs blended transparency (not alphaTest)
  62, // Apothecary Workbench - directional block with rotation
  67, // Ladder - directional flat plane with rotation
  71, // Bed Head - half-height directional block
  72, // Bed Foot - half-height directional block
  73, // Woodworking Bench - directional block with rotation
  74, // Rope Ladder - directional flat plane with rotation
  75, // Divining Stick - custom Y-shaped geometry
  76, // Chest - directional block with rotation
  // Water (13-16) is now greedy-meshed to eliminate internal face z-fighting
  // Carpentry (oak 94-108, pine 110-124, redwood 126-140): everything except
  // planks is custom geometry/rotation; windows need blended transparency like glass
  94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
  110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124,
  126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140,

  // Weapons, tool tiers 6-7 and the Hellforge
  BlockIds.HELLFORGE, // Hellforge - directional block with rotation

  // Hell: Molten Wastes
  205, // Infernal Brazier - custom fire-basket geometry
  214, // Infernal brick stairs - custom stepped geometry
  215, // Infernal brick slab - half-height geometry
  216, // Infernal iron bars - thin grate geometry
  217, // Infernal chain - hanging links
  218, // Ember lantern - hanging cage
  219, // Infernal banner - wall plate
  220, // Infernal anvil
  221, // Weapon rack
  222, // Infernal throne
  223, // Infernal hoard - floor heap

  // Hell: The Ossuary
  237, // Soul torch - custom slim geometry
  239, // Bone pile - cross-billboard sprite
  240, // Soul bloom - cross-billboard sprite
  249, // Funerary urn - custom geometry
  250, // Soul candelabra - custom geometry
  251, // Crypt cobweb - cross-billboard sprite
  252, // Grave candles - custom geometry

  // Hell: Ember Grove
  265, // Glowcap - cross billboard
  266, // Shelf fungus - bracket plate
  267, // Spore strand - hanging cross
  268, // Crimson sprouts - cross billboard
  282, // Egg pod cluster - cross billboard
  283, // Hanging tendrils - hanging cross
  284, // Glow bulb - hanging lamp geometry
  285, // Emberwood stairs - stair geometry with rotation

  // Hell: Crystal Abyss
  301, 302, // Prism clusters - cross sprites
  313, // Crystal glass - blended transparency
  314, 315, 316, // Prism pedestal, prism lantern, lens apparatus - custom models
  317, // Sanctum banner - hanging plane
  318, // Sanctum stairs - custom geometry

  // Hell: Cocytus
  335, // Frost crystal - cross sprite
  336, // Icicle - cross sprite
  337, // Frost lantern - custom model
  338, // Rime brazier - custom model
  345, // Glacial brick stairs - stepped shape with facing
  346, // Glacial brick slab - half height
  347, // Frozen banner - hanging sprite with facing
  348, // Hanging frost lantern - custom model
  349, // Ice knight statue - custom model
])

/**
 * Greedy block faces (blockId * 6 + face) whose texture is laid a quarter
 * turn: the texture's vertical axis runs along the face's horizontal (u)
 * axis instead of up the face (or toward +Z on top/bottom faces). For
 * textures with a direction, like bark grain, on blocks lying on their side.
 * Faces: TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5.
 * Their item displays must turn the same faces (quarterTurnedCube in
 * blocks/QuarterTurnedCube.ts) so the held block matches the world.
 */
export const QUARTER_TURN_FACES: ReadonlySet<number> = new Set<number>([
  // Fallen pine log along X: bark grain along X on top, bottom, north, south
  BlockIds.FALLEN_PINE_LOG_X * 6 + 0,
  BlockIds.FALLEN_PINE_LOG_X * 6 + 1,
  BlockIds.FALLEN_PINE_LOG_X * 6 + 2,
  BlockIds.FALLEN_PINE_LOG_X * 6 + 3,
  // Fallen pine log along Z: top/bottom grain already runs along Z; turn the sides
  BlockIds.FALLEN_PINE_LOG_Z * 6 + 4,
  BlockIds.FALLEN_PINE_LOG_Z * 6 + 5,
])

/**
 * Check if a block can be greedy-meshed.
 */
export function isGreedyMeshable(blockId: number): boolean {
  return !NON_GREEDY_BLOCK_IDS.has(blockId)
}
