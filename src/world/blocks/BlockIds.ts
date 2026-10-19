/**
 * Central registry of all block IDs.
 * 0 is reserved for AIR.
 */
export enum BlockIds {
  AIR = 0,
  STONE = 1,
  DIRT = 2,
  GRASS = 3,
  OAK_LOG = 4,
  OAK_LEAVES = 5,
  IRON_BLOCK = 6,
  COPPER_BLOCK = 7,
  COAL_BLOCK = 8,
  GOLD_BLOCK = 9,
  DIAMOND_BLOCK = 10,
  TORCH = 11,
  FORGE = 12,
  WATER = 13,
  WATER_THREE_QUARTER = 14,
  WATER_HALF = 15,
  WATER_QUARTER = 16,
  WATER_EIGHTH = 17,
  WATER_SEVEN_EIGHTH = 18,
  WATER_FIVE_EIGHTH = 19,
  WATER_THREE_EIGHTH = 20,
  LAVA = 21,
  LAVA_SEVEN_EIGHTH = 22,
  LAVA_THREE_QUARTER = 23,
  LAVA_FIVE_EIGHTH = 24,
  LAVA_HALF = 25,
  LAVA_THREE_EIGHTH = 26,
  LAVA_QUARTER = 27,
  LAVA_EIGHTH = 28,
  SAND = 29,
  SANDSTONE = 30,
  CACTUS = 31,
  VINE = 32,
  BASALT = 33,
  MAGMA = 34,
  MUD = 35,
  CLAY = 36,
  MUSHROOM = 37,
  MUSHROOM_CAP = 38,
  SWAMP_WATER = 39,
  SWAMP_WATER_SEVEN_EIGHTH = 40,
  SWAMP_WATER_THREE_QUARTER = 41,
  SWAMP_WATER_FIVE_EIGHTH = 42,
  SWAMP_WATER_HALF = 43,
  SWAMP_WATER_THREE_EIGHTH = 44,
  SWAMP_WATER_QUARTER = 45,
  SWAMP_WATER_EIGHTH = 46,
  MUDDY_GRASS = 47,
  BLUE_MUSHROOM = 48,
  BLUE_MUSHROOM_CAP = 49,
  PURPLE_MUSHROOM = 50,
  PURPLE_MUSHROOM_CAP = 51,
  WHEAT_1 = 52,
  WHEAT_2 = 53,
  WHEAT_3 = 54,
  HELL_ROCK = 55,
  HELL_MAGMA = 56,
  CORRUPTED_HELL_ROCK = 57,
  GLASS = 58,
  HERB_1 = 59,
  HERB_2 = 60,
  HERB_3 = 61,
  APOTHECARY_WORKBENCH = 62,
  YELLOW_FLOWER = 63,
  BLUE_FLOWER = 64,
  RED_FLOWER = 65,
  JUNGLE_FERN = 66,
  LADDER = 67,
  HEMP_1 = 68,
  HEMP_2 = 69,
  HEMP_3 = 70,
  BED_HEAD = 71,
  BED_FOOT = 72,
  WOODWORKING_BENCH = 73,
  ROPE_LADDER = 74,
  DIVINING_STICK = 75,
  CHEST = 76,
  WATER_FALLING = 77,
  LAVA_FALLING = 78,
  SWAMP_WATER_FALLING = 79,
  PINE_LOG = 80,
  PINE_NEEDLES = 81,
  PODZOL = 82,
  REDWOOD_LOG = 83,
  REDWOOD_LEAVES = 84,
  MOSS = 85,
  MOSSY_STONE = 86,
  COASTAL_FERN = 87,
  COASTAL_FERN_TOP = 88,
  SEA_SHELL = 89,
  CRAB_SHELL = 90,
  RESIN_TORCH = 91,
  SEA_STAR = 92,
  // Carpentry — oak
  OAK_PLANKS = 93,
  OAK_SLAB = 94,
  OAK_STAIRS = 95,
  OAK_FENCE = 96,
  OAK_FENCE_GATE = 97,
  OAK_FENCE_GATE_OPEN = 98,
  OAK_DOOR = 99,
  OAK_DOOR_UPPER = 100,
  OAK_DOOR_OPEN = 101,
  OAK_DOOR_UPPER_OPEN = 102,
  OAK_TRAPDOOR = 103,
  OAK_TRAPDOOR_OPEN = 104,
  OAK_TABLE = 105,
  OAK_CHAIR = 106,
  OAK_SHELF = 107,
  OAK_WINDOW = 108,
  // Carpentry — pine
  PINE_PLANKS = 109,
  PINE_SLAB = 110,
  PINE_STAIRS = 111,
  PINE_FENCE = 112,
  PINE_FENCE_GATE = 113,
  PINE_FENCE_GATE_OPEN = 114,
  PINE_DOOR = 115,
  PINE_DOOR_UPPER = 116,
  PINE_DOOR_OPEN = 117,
  PINE_DOOR_UPPER_OPEN = 118,
  PINE_TRAPDOOR = 119,
  PINE_TRAPDOOR_OPEN = 120,
  PINE_TABLE = 121,
  PINE_CHAIR = 122,
  PINE_SHELF = 123,
  PINE_WINDOW = 124,
  // Carpentry — redwood
  REDWOOD_PLANKS = 125,
  REDWOOD_SLAB = 126,
  REDWOOD_STAIRS = 127,
  REDWOOD_FENCE = 128,
  REDWOOD_FENCE_GATE = 129,
  REDWOOD_FENCE_GATE_OPEN = 130,
  REDWOOD_DOOR = 131,
  REDWOOD_DOOR_UPPER = 132,
  REDWOOD_DOOR_OPEN = 133,
  REDWOOD_DOOR_UPPER_OPEN = 134,
  REDWOOD_TRAPDOOR = 135,
  REDWOOD_TRAPDOOR_OPEN = 136,
  REDWOOD_TABLE = 137,
  REDWOOD_CHAIR = 138,
  REDWOOD_SHELF = 139,
  REDWOOD_WINDOW = 140,

  // Pine forest expansion
  FALLEN_PINE_LOG_X = 141,   // fallen log lying along the X axis
  FALLEN_PINE_LOG_Z = 142,   // fallen log lying along the Z axis
  PINE_STUMP = 143,
  SNOWY_GRASS = 144,
  SNOWY_PINE_NEEDLES = 145,
  PINECONE = 146,            // hangs under pine canopies
  PINE_SAPLING = 147,
  BERRY_BUSH = 148,          // picked-clean bush
  BERRY_BUSH_BERRIES = 149,  // bush laden with berries
  MOREL_MUSHROOM = 150,
  RESIN_TAP = 151,
  CAMPFIRE = 152,

  // Jungle expansion
  CATTAIL = 153,             // waterside reed plant, lower half
  CATTAIL_TOP = 154,         // waterside reed plant, upper half (seed heads)

  // Volcanic expansion
  OBSIDIAN = 155,            // very hard volcanic glass, diamond pickaxe only
  SULFUR_ORE = 156,          // basalt with sulfur deposits, drops sulfur
  GEYSER = 157,              // dormant basalt vent with dim glowing cracks
  GEYSER_ACTIVE = 158,       // erupting vent, bright emissive cracks
  CHARRED_LOG = 159,         // burnt log with ember cracks (charred mining camps)
  TNT = 160,                 // craftable explosive crate, E-interact to ignite
  SMOLDERING_STONE = 161,    // dark rock with ember cracks + ash, smokes near player
  COLUMNAR_BASALT = 162,     // hexagonal basalt column block (Giant's Causeway pillars)

  // Progression (journal, recipe sinks)
  SLIME = 163,               // springy slime block: cancels fall damage, bounces

  // Weapons, tool tiers 6-7 and the Hellforge
  HELLFORGE = 180,           // infernal crafting station (infernium/hellbane gear), directional, glows

  // Dungeons (guardian spawners, Sigil Compass)
  GUARDIAN_SPAWNER = 170,        // dungeon guardian altar; metadata = guardian index (see src/dungeons)
  GUARDIAN_SPAWNER_SPENT = 171,  // altar after its guardian was defeated
  GARRISON_SPAWNER = 172,        // dungeon garrison grate; metadata = garrison index (see src/dungeons/GarrisonRegistry.ts)

  // Hell: Molten Wastes
  INFERNIUM_ORE = 200,           // Molten Wastes ore: dark hell rock with glowing molten-gold veins (tier 6 metal)
  INFERNAL_BRICKS = 201,         // Infernal Bastion masonry (force 6)
  CRACKED_INFERNAL_BRICKS = 202, // weathered Infernal Bastion masonry (force 6)
  INFERNAL_BRICK_PILLAR = 203,   // fluted Infernal Bastion column (force 6)
  EMBER_GLYPH = 204,             // glowing rune stone (Infernal Bastion glyph floors, spire spine)
  INFERNAL_BRAZIER = 205,        // iron fire basket, light 15 (custom geometry)
  HELL_ASH = 206,                // cinder ash topsoil of the Molten Wastes badlands
  CRAFTED_INFERNAL_BRICKS = 207, // player-laid infernal bricks (normal force; same texture as 201)
  INFERNAL_TILES = 208,          // bastion floor flagstones (force 6)
  OBSIDIAN_BRICKS = 209,         // bastion keep / vault / throne-ring masonry (force 6)
  GILDED_INFERNAL_BRICKS = 210,  // gold-inlaid masonry - bastion treasury loot signature (force 6)
  MAGMA_BRICKS = 211,            // bricks in glowing lava mortar, light 6 (force 6)
  SCORCHED_INFERNAL_BRICKS = 212, // soot-blackened bastion masonry (force 6)
  CHARRED_PLANKS = 213,          // scorched timber floors (normal wood)
  INFERNAL_BRICK_STAIRS = 214,   // bastion stairs (custom geometry, force 6)
  INFERNAL_BRICK_SLAB = 215,     // bastion slab (custom geometry, force 6)
  INFERNAL_IRON_BARS = 216,      // cell fronts, window grilles, portcullis (custom geometry, force 6)
  INFERNAL_CHAIN = 217,          // hanging chain (custom geometry)
  EMBER_LANTERN = 218,           // hanging ember lantern, light 14 (custom geometry)
  INFERNAL_BANNER = 219,         // wall banner (custom geometry, textured cloth)
  INFERNAL_ANVIL = 220,          // forge anvil decor (custom geometry)
  WEAPON_RACK = 221,             // armament rack - bastion armory/barracks decor (custom geometry)
  INFERNAL_THRONE = 222,         // the Pyre Tyrant's throne (custom geometry, force 6)
  INFERNAL_HOARD = 223,          // vault treasure heap - bastion vault decor, drops a gold bar (custom geometry)

  // Hell: The Ossuary
  BONE_ASH = 230,              // pale bone-ash soil (Ossuary dunes)
  OSSIFIED_ROCK = 231,         // grey-olive fossil rock under the ash
  BONE_BLOCK = 232,            // packed-bone building block (name 'bone', item 'bone_block')
  SOUL_VEIN = 233,             // ossified rock with glowing soul veins, drops soul shards
  CATACOMB_BRICK = 234,        // Catacombs structural brick (force 6)
  CATACOMB_SKULL_BRICK = 235,  // skull-packed crypt wall (Catacombs only: loot signature)
  SOUL_LANTERN = 236,          // bone-framed lantern of green soul fire
  SOUL_TORCH = 237,            // bone torch with a green soul flame
  SARCOPHAGUS = 238,           // stone tomb block (Catacombs decoration)
  BONE_PILE = 239,             // small heap of bones and a skull, drops bones
  SOUL_BLOOM = 240,            // ghostly glowing flower on the bone ash
  // Catacombs kit (round 2)
  CRACKED_CATACOMB_BRICK = 241, // aged/collapsing catacomb brick (force 6)
  CATACOMB_TILE = 242,          // crypt floor flagstones (force 6)
  CARVED_BONE_PILLAR = 243,     // carved vertebra column (decor)
  BURIAL_NICHE = 244,           // loculus wall block with a skull on a shelf (force 6)
  CRYPT_GRATE = 245,            // wrought-iron bars (cutout, force 3)
  CRYPT_ALTAR = 246,            // carved altar with soul runes (shrine loot signature)
  GILDED_RELIQUARY = 247,       // gold-trimmed bone reliquary (vault loot signature)
  CATACOMB_FRIEZE = 248,        // skull-and-crossbones relief band (force 6)
  FUNERARY_URN = 249,           // ceramic burial urn (custom geometry)
  SOUL_CANDELABRA = 250,        // iron candelabra with three soul flames (custom geometry)
  CRYPT_COBWEB = 251,           // dusty cobweb (cross sprite)
  GRAVE_CANDLES = 252,          // cluster of soul candles (custom geometry)

  // Hell: Ember Grove
  EMBERWOOD_STEM = 260,          // giant hell-fungus stem (Ember Grove wood, axe)
  EMBERWOOD_PLANKS = 261,        // planks crafted from emberwood stems
  EMBER_CAP = 262,               // giant fungus cap skin, crimson with glowing ember spots
  EMBER_GILLS = 263,             // teal bioluminescent cap underside (light source)
  CRIMSON_MYCELIUM = 264,        // nylium-like Ember Grove floor soil
  GLOWCAP = 265,                 // small glowing mushroom cluster (plant, light, drops glowcap)
  SHELF_FUNGUS = 266,            // bracket fungus growing from giant stems (climbable steps)
  SPORE_STRAND = 267,            // hanging spore threads under caps (no collision)
  CRIMSON_SPROUTS = 268,         // crimson fungal ground cover (no collision)
  HIVE_ROOTBRICK = 269,          // Sporeheart Hive packed root brick (force 6, loot signature)
  HIVE_ROOT = 270,               // Sporeheart Hive woven root mass (force 6)
  SPORE_SAC = 271,               // glowing spore sac (Sporeheart Hive light source)
  EMBER_GILLS_LIT = 272,         // the sparse subset of cap gills that cast real light
  // Sporeheart Hive (procedural dungeon kit)
  CHITIN_PLATE = 273,            // armoured carapace plates (force 6, pickaxe)
  HIVE_MEMBRANE = 274,           // fleshy partition wall with glowing veins (force 6, axe)
  BROOD_COMB = 275,              // hexagonal brood comb with glowing larvae (force 6, axe)
  GILL_WALL = 276,               // wall of glowing gill lamellae (force 6, axe)
  ROOT_PILLAR = 277,             // column of twisted roots (force 6, axe)
  ROOT_LATTICE = 278,            // woven root grate, cutout (force 6, axe; vault loot signature)
  OVERGROWN_ROOTBRICK = 279,     // rootbrick grown over with mycelium (force 6, pickaxe)
  MYCELIAL_CARPET = 280,         // woven mycelium floor mat
  GLOWING_SAP = 281,             // luminous fungal sap (pools, troughs; light 9)
  EGG_POD_CLUSTER = 282,         // brood egg pods (cross sprite, faint glow)
  HANGING_TENDRILS = 283,        // hanging root tendrils (hanging cross sprite, climbable)
  GLOW_BULB = 284,               // hanging bioluminescent lamp (custom geometry, light 12)
  EMBERWOOD_STAIRS = 285,        // emberwood planks stairs (hive ramps, carpentry)

  // Hell: Crystal Abyss
  ABYSSAL_STONE = 290,            // near-black violet bedrock of the Crystal Abyss
  PRISM_CRYSTAL = 291,            // the minable glowing crystal, drops prism shards (force 5)
  SPIRE_CRYSTAL = 292,            // deep violet spire crystal (decorative, glows)
  ROSE_CRYSTAL = 293,             // magenta spire crystal (decorative, glows)
  GLITTERING_ABYSSAL_STONE = 294, // abyssal stone flecked with tiny glowing crystals
  GEODE_CRUST = 295,              // pale calcite shell of crystal geodes
  POLISHED_ABYSSAL_STONE = 296,   // crafted decorative stone
  ABYSSAL_BRICKS = 297,           // crafted decorative bricks
  SANCTUM_BRICK = 298,            // Prism Sanctum walls (structural, force 6, glowing seams)
  SANCTUM_TILE = 299,             // Prism Sanctum floors (structural, force 6)
  CRYSTAL_LAMP = 300,             // craftable light block (light 15)
  PRISM_CLUSTER = 301,            // small shard cluster on the ground (cross sprite)
  HANGING_PRISM_CLUSTER = 302,    // shard cluster hanging from a ceiling (cross sprite)
  // Non-emitting "core" variants for crystal cells buried inside spires,
  // geode linings and stalactites (same look; light comes from the shell)
  SPIRE_CRYSTAL_CORE = 303,
  ROSE_CRYSTAL_CORE = 304,
  PRISM_CRYSTAL_CORE = 305,
  // Prism Sanctum (round 2 kit): structural pieces (force 6) and decor
  INLAID_SANCTUM_TILE = 306,      // floor tile with glowing prism inlay (structural)
  CARVED_SANCTUM_BRICK = 307,     // carved octagon/prism relief brick (structural)
  SANCTUM_PILLAR = 308,           // fluted polished column (structural)
  GILDED_SANCTUM_TRIM = 309,      // polished stone with a gold band: cornices, capitals (structural)
  MIRROR_PANEL = 310,             // gold-framed mirror panel for galleries (structural)
  PRISM_ROOF_TILE = 311,          // violet glazed roof tiles (structural)
  CRYSTAL_ARCHIVE = 312,          // shelf of glowing crystal tablets (decor)
  CRYSTAL_GLASS = 313,            // violet stained crystal window (structural, blended)
  PRISM_PEDESTAL = 314,           // pedestal with a floating prism (decor, light 9)
  PRISM_LANTERN = 315,            // hanging gold-caged crystal lantern (decor, light 14)
  LENS_APPARATUS = 316,           // gold lens ring on a stand (decor)
  SANCTUM_BANNER = 317,           // hanging violet banner, 2 blocks tall (decor)
  SANCTUM_STAIRS = 318,           // polished abyssal stairs (structural)

  // Hell: Cocytus
  BLACK_ICE = 320,               // Cocytus frozen lake: dark glassy ice (solid)
  RIMESTONE = 321,               // Cocytus bedrock: frost-crusted dark hell rock
  FROSTED_RIMESTONE = 322,       // rimestone with a hoarfrost crust on top (shores)
  ASH_SNOW = 323,                // grey ash-snow drifts
  GLACIAL_ICE = 324,             // pale packed glacier ice (spires, stalagmites)
  POLISHED_ICE = 325,            // crafted smooth ice building block
  GLACIAL_BRICK = 326,           // Frozen Citadel walls (dungeon structural, force 6)
  RIME_CRYSTAL_ORE = 327,        // glowing cyan crystal ore, drops rime_crystal
  FROZEN_MAGMA = 328,            // lava frozen mid-fall (frozen lavafalls), dim embers
  ENTOMBED_UPRIGHT_UPPER = 329,  // black ice with a standing figure (head half, sides)
  ENTOMBED_UPRIGHT_LOWER = 330,  // black ice with a standing figure (legs half, sides)
  ENTOMBED_LYING_HEAD = 331,     // lake ice, figure lying face-up along Z (head, at +Z)
  ENTOMBED_LYING_FEET = 332,     // lake ice, figure lying face-up along Z (legs)
  CARVED_GLACIAL_BRICK = 333,    // Frozen Citadel: glacial brick with a carved frost rune (force 6)
  FROSTED_GLACIAL_BRICK = 334,   // Frozen Citadel: frost-crept glacial brick (force 6)
  FROST_CRYSTAL = 335,           // glowing frost crystal cluster (light 10, cross sprite)
  ICICLE = 336,                  // hanging icicles (cross sprite, no collision)
  FROST_LANTERN = 337,           // craftable cold-light lantern (light 15)
  RIME_BRAZIER = 338,            // Frozen Citadel brazier (light 15)
  ICE_PILLAR = 339,              // Frozen Citadel: fluted glacial-ice column (force 6)
  GLACIAL_TILES = 340,           // Frozen Citadel: checkered polished/black ice floor (force 6)
  RIME_GRATE = 341,              // frost-rimed iron grate (cutout; cells, windows, portcullis)
  RIME_GLYPH = 342,              // Frozen Citadel: glowing rune floor inlay (force 6, vault loot signature)
  FROSTBOUND_PLANKS = 343,       // frozen dark timber (drawbridge, walkways, furniture)
  FROZEN_BOOKSHELF = 344,        // Frozen Citadel library shelves
  GLACIAL_BRICK_STAIRS = 345,    // glacial brick stairs (force 6, facing metadata)
  GLACIAL_BRICK_SLAB = 346,      // glacial brick slab (force 6)
  FROZEN_BANNER = 347,           // hanging frozen banner (2 tall, facing metadata)
  HANGING_FROST_LANTERN = 348,   // frost lantern on a chain, hangs from the block above (light 15)
  ICE_KNIGHT_STATUE = 349,       // kneeling ice-knight statue (decor)

  // Day and night (350-359)
  WARD_LANTERN = 350,            // lantern hung with night trophies: no night creature rises within 32 blocks (light 15)
  FOXFIRE_MUSHROOM = 351,        // swamp giant mushroom stem, green family (light 2)
  FOXFIRE_MUSHROOM_CAP = 352,    // glowing lime-spotted cap (light 15, emissive)
  AMBER_MUSHROOM = 353,          // swamp giant mushroom stem, amber family (light 2)
  AMBER_MUSHROOM_CAP = 354,      // glowing gold-freckled cap (light 15, emissive)
  GLOWMOSS = 355,                // swamp floor moss with twinkling spore specks (emissive, no block light)
  GLIMMERCAP = 356,              // tuft of tiny pink-glowing mushrooms (plant, light 5)
  LUMEN_FERN = 357,              // fern with glowing cyan fiddleheads (plant, light 4)
  GLOWKELP = 358,                // swamp pool kelp stalk, stands in swamp water; blue-glowing bladders (plant)
  GLOWKELP_TOP = 359,            // glowkelp crown, the end of a strand (plant)
  LANTERNWEED = 360,             // pond-bed weed in swamp water with gold-glowing pods (plant, light 4)
}
