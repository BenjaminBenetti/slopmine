#!/bin/bash

# Convert PNG to WebP
# Usage: ./png-to-webp.sh input.png [quality]
# Quality: 0-100 (default: 80)

if [ -z "$1" ]; then
  echo "Usage: $0 <input.png> [quality]"
  echo "  quality: 0-100 (default: 80)"
  exit 1
fi

INPUT="$1"
QUALITY="${2:-80}"
OUTPUT="${INPUT%.png}.webp"

if [ ! -f "$INPUT" ]; then
  echo "Error: File '$INPUT' not found"
  exit 1
fi

cwebp -q "$QUALITY" "$INPUT" -o "$OUTPUT"

if [ $? -eq 0 ]; then
  INPUT_SIZE=$(stat -f%z "$INPUT" 2>/dev/null || stat -c%s "$INPUT")
  OUTPUT_SIZE=$(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT")
  SAVINGS=$((100 - (OUTPUT_SIZE * 100 / INPUT_SIZE)))
  echo "Converted: $INPUT -> $OUTPUT"
  echo "Size: $(numfmt --to=iec $INPUT_SIZE) -> $(numfmt --to=iec $OUTPUT_SIZE) ($SAVINGS% smaller)"
fi
