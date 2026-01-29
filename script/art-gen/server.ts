import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.join(import.meta.dirname, "output");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_ID = "gemini-2.0-flash-exp-image-generation";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const GenerateImageSchema = z.object({
  prompt: z.string().describe("Text description of the image to generate"),
  filename: z
    .string()
    .optional()
    .describe("Optional filename (without extension). Defaults to timestamp."),
});

async function generateImage(
  prompt: string,
  filename?: string
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Find the image data in the response
  let imageData: string | null = null;
  let mimeType = "image/png";

  for (const candidate of data.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        imageData = part.inlineData.data;
        mimeType = part.inlineData.mimeType || "image/png";
        break;
      }
    }
    if (imageData) break;
  }

  if (!imageData) {
    throw new Error("No image data found in Gemini response");
  }

  // Determine file extension from mime type
  const extMap: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const ext = extMap[mimeType] || ".png";

  // Generate filename
  const finalFilename = filename || `image_${Date.now()}`;
  const outputPath = path.join(OUTPUT_DIR, `${finalFilename}${ext}`);

  // Decode base64 and save
  const buffer = Buffer.from(imageData, "base64");
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}

// Create MCP server
const server = new Server(
  {
    name: "art-gen",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_image",
        description:
          "Generate an image using Gemini AI based on a text prompt. Returns the path to the saved image file.",
        inputSchema: {
          type: "object" as const,
          properties: {
            prompt: {
              type: "string",
              description: "Text description of the image to generate",
            },
            filename: {
              type: "string",
              description:
                "Optional filename (without extension). Defaults to timestamp-based name.",
            },
          },
          required: ["prompt"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "generate_image") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = GenerateImageSchema.parse(request.params.arguments);

  try {
    const imagePath = await generateImage(args.prompt, args.filename);
    return {
      content: [
        {
          type: "text" as const,
          text: `Image generated successfully!\nSaved to: ${imagePath}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error generating image: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Art generation MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
