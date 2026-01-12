---
description: Update CLAUDE.md with comprehensive system documentation using parallel exploration agents
---

## Task: Update CLAUDE.md Documentation

You need to update the CLAUDE.md file with detailed, high-level documentation of all game systems and how they interact.

## Current Documentation

Review the existing documentation:

@/workspaces/slopmine/CLAUDE.md

## Exploration Strategy

Use **parallel exploration agents** (Task tool with subagent_type=Explore) to analyze each major system in the codebase simultaneously. Launch all agents in a single message for maximum efficiency.

### Systems to Explore

Launch exploration agents for each of these directories/systems:

1. **src/core/** - Engine fundamentals (game loop, frame budget, task scheduler)
2. **src/renderer/** - Three.js rendering, camera, lighting, mesh building, culling
3. **src/world/** - Chunk management, voxel data, lighting, liquid physics (excluding blocks/ and generate/)
4. **src/world/blocks/** - Block definitions, registry, face textures
5. **src/world/generate/** - World generation, biomes, caves, features, structures
6. **src/workers/** - Web Workers for chunk generation, meshing, lighting, occlusion
7. **src/physics/** - Collision detection, physics bodies, AABB
8. **src/player/** - Player state, controls, input handling, block interactions
9. **src/items/** - Items, tools, tags
10. **src/ui/** - HUD, menus, overlays, debug displays
11. **src/settings/** - User-configurable settings
12. **src/main.ts** - Application entry point and system initialization

For each system, the exploration agent should identify:
- All files and their purposes
- Key classes/functions and their responsibilities
- How the module interacts with other modules (imports/exports)
- Important patterns and design decisions

## Documentation Update

After all exploration agents complete, update /workspaces/slopmine/CLAUDE.md with:

1. **System Overview** - High-level architecture diagram and initialization flow
2. **Core Modules** - Detailed documentation for each module including:
   - Key files and their purposes
   - Important classes, interfaces, and patterns
   - Data flow and system interactions
3. **Web Workers** - Worker communication patterns and constraints
4. **Key Interfaces** - Important TypeScript interfaces for module boundaries
5. **Performance Patterns** - Optimization techniques used throughout

Preserve the existing sections (Tech Stack, Commands, Design Principles, Code Quality Standards) and enhance them with the detailed system information gathered by the exploration agents.

## Output

The updated CLAUDE.md should serve as a comprehensive reference for understanding the codebase architecture, system interactions, and implementation patterns.
