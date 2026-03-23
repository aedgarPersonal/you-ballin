/**
 * 8-Bit Pixel Art Avatar
 * ======================
 * Renders an SVG pixel art basketball player sprite.
 * Each player gets a unique look based on their traits
 * (skin tone, hair style, build, accessories) colored
 * in their team colors.
 */

import { memo } from "react";
import { getPlayerById } from "../data/legacyPlayers";

// --- Color Palettes ---

const SKIN_TONES = [
  { base: "#FDDCB5", shadow: "#D4A574" },  // 0: light
  { base: "#E8B88A", shadow: "#C4956A" },  // 1: medium-light
  { base: "#C68642", shadow: "#A0673A" },  // 2: medium
  { base: "#8D5524", shadow: "#6B3E1A" },  // 3: medium-dark
  { base: "#6B4226", shadow: "#4A2E1B" },  // 4: dark
];

const HAIR_COLOR = "#1a1a1a";
const OUTLINE = "#111111";
const WHITE = "#FFFFFF";
const SHOE_COLOR = "#222222";

// --- Sprite Materials ---
// . = transparent, O = outline, S = skin, D = skin shadow,
// J = jersey primary, K = jersey secondary, T = shorts,
// H = hair, W = white (eyes/accents), X = shoe, B = headband, G = goggles
// N = number on jersey

// --- Base Body Templates ---
// 14 wide x 20 tall

const BODY_NORMAL = [
  //0 1 2 3 4 5 6 7 8 9 0 1 2 3
  "......OOO.....",  // 0  head top
  ".....OHHHO....",  // 1  hair
  "....OHHHHHO...",  // 2  hair
  "....OSSSSO....",  // 3  face top
  "....OWSWSO....",  // 4  eyes
  "....OSSSSO....",  // 5  mouth
  ".....OSSO.....",  // 6  neck
  "..OOOJJJJOOO..",  // 7  shoulders
  "..OSOJJJJOSO..",  // 8  torso
  "..OSOJJJJOSO..",  // 9  torso
  "..OOOJJJJOOO..",  // 10 torso bottom
  ".....OSSO.....",  // 11 waist
  "....OTTTTO....",  // 12 shorts
  "....OTTTTO....",  // 13 shorts
  "....OTTTTO....",  // 14 shorts bottom
  ".....OSSO.....",  // 15 legs
  ".....OSSO.....",  // 16 legs
  "....OOSOO.....",  // 17 ankles
  "....OXXXO.....",  // 18 shoes
  ".....OOO......",  // 19 shoe sole
];

const BODY_BIG = [
  //0 1 2 3 4 5 6 7 8 9 0 1 2 3
  ".....OOOO.....",  // 0
  "....OHHHHO....",  // 1
  "...OHHHHHO....",  // 2
  "...OSSSSSO....",  // 3
  "...OWSWSSO....",  // 4
  "...OSSSSSO....",  // 5
  "....OSSSO.....",  // 6
  ".OOOOJJJJOOOO.",  // 7
  ".OSOSJJJJSOSO.",  // 8
  ".OSOSJJJJSOSO.",  // 9
  ".OOOOJJJJOOOO.",  // 10
  ".....OSSO.....",  // 11
  "...OTTTTTO....",  // 12
  "...OTTTTTO....",  // 13
  "...OTTTTTO....",  // 14
  "....OOSOO.....",  // 15
  ".....OSSO.....",  // 16
  "....OOSOO.....",  // 17
  "...OOXXXOO....",  // 18
  "....OOOOO.....",  // 19
];

// --- Hair Style Overlays ---
// Each returns an array of {row, col, material} to paint over the base

function getHairOverlay(style, isBig) {
  const off = isBig ? 0 : 0;
  switch (style) {
    case "bald":
      return [ // Remove hair, show skin on top
        ..._rowCells(1, isBig ? "....OSSSSO...." : ".....OSSSO...."),
        ..._rowCells(2, isBig ? "...OSSSSSO...." : "....OSSSSO...."),
      ];
    case "flat":
      return []; // default template already has flat hair
    case "fade": {
      // Taller hair on top
      const r = isBig ? 0 : 0;
      return [
        ..._rowCells(r, isBig ? "....OHHHHO...." : ".....OHHO....."),
      ];
    }
    case "afro":
      return [
        ..._rowCells(0, isBig ? "....OHHHO....." : ".....OHHO....."),
        ..._rowCells(1, isBig ? "...OHHHHHO...." : "....OHHHO....."),
        ..._rowCells(2, isBig ? "..OHHHHHHHHO.." : "...OHHHHHO...."),
        ..._rowCells(3, isBig ? "..OHSSSSSOHO.." : "..OHSSSSOHO..."),
      ];
    case "mohawk":
      return [
        ..._rowCells(0, isBig ? "......OHO....." : "......OHO....."),
        ..._rowCells(1, isBig ? ".....OHHHO...." : ".....OHHHO...."),
      ];
    case "cornrows":
      return [
        ..._rowCells(1, isBig ? "....OHHHHO...." : ".....OHHHO...."),
        ..._rowCells(2, isBig ? "...OHSHSHHO..." : "....OHSHHO...."),
      ];
    case "long":
      return [
        ..._rowCells(0, isBig ? "....OHHHHO...." : ".....OHHO....."),
        ..._rowCells(1, isBig ? "...OHHHHHO...." : "....OHHHO....."),
        ..._rowCells(2, isBig ? "...OHHHHHO...." : "....OHHHO....."),
        ..._rowCells(6, isBig ? "...OHSSSOHO..." : "...OHSSOHO...."),
      ];
    default:
      return [];
  }
}

function getAccessoryOverlay(accessory, isBig) {
  switch (accessory) {
    case "headband":
      return [
        ..._rowCells(3, isBig ? "...OBBBBBO...." : "....OBBBO....."),
      ];
    case "goggles":
      return [
        ..._rowCells(4, isBig ? "...OGSGSO....." : "....OGSGO....."),
      ];
    case "wristband":
      return [
        { row: 10, col: isBig ? 2 : 3, mat: "K" },
        { row: 10, col: isBig ? 11 : 10, mat: "K" },
      ];
    default:
      return [];
  }
}

// Helper: convert a row string to [{row, col, mat}]
function _rowCells(row, str) {
  const result = [];
  for (let c = 0; c < str.length; c++) {
    if (str[c] !== ".") {
      result.push({ row, col: c, mat: str[c] });
    }
  }
  return result;
}

// --- Sprite Builder ---

function buildSprite(player) {
  if (!player) return null;

  const sprite = player.sprite || {};
  const isBig = sprite.build === "big";
  const template = isBig ? BODY_BIG : BODY_NORMAL;

  // Parse template into 2D grid
  const grid = template.map((row) => row.split(""));

  // Apply hair overlay
  const hairOverlay = getHairOverlay(sprite.hair || "flat", isBig);
  for (const { row, col, mat } of hairOverlay) {
    if (row < grid.length && col < grid[0].length) {
      grid[row][col] = mat;
    }
  }

  // Apply accessories
  const accessories = sprite.accessories || [];
  for (const acc of accessories) {
    const overlay = getAccessoryOverlay(acc, isBig);
    for (const { row, col, mat } of overlay) {
      if (row < grid.length && col < grid[0].length) {
        grid[row][col] = mat;
      }
    }
  }

  return grid;
}

function getMaterialColor(mat, colors, skinIdx) {
  const skin = SKIN_TONES[skinIdx] || SKIN_TONES[3];
  switch (mat) {
    case "O": return OUTLINE;
    case "S": return skin.base;
    case "D": return skin.shadow;
    case "J": return colors[0] || "#666";
    case "K": return colors[1] || "#999";
    case "N": return colors[1] || "#FFF";
    case "T": return colors[1] || "#333";
    case "H": return HAIR_COLOR;
    case "W": return WHITE;
    case "X": return SHOE_COLOR;
    case "B": return colors[1] || "#FF0000";  // headband uses secondary color
    case "G": return "#FFD700";  // goggles gold
    default: return null; // transparent
  }
}

// --- React Component ---

const PixelAvatar = memo(function PixelAvatar({ playerId, size = 64, className = "" }) {
  const player = getPlayerById(playerId);
  if (!player) {
    return (
      <div
        className={`bg-gray-600 rounded-lg flex items-center justify-center text-gray-400 font-bold ${className}`}
        style={{ width: size, height: size }}
      >
        ?
      </div>
    );
  }

  const grid = buildSprite(player);
  if (!grid) return null;

  const rows = grid.length;
  const cols = grid[0].length;
  const skinIdx = player.sprite?.skin ?? 3;

  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mat = grid[r][c];
      const color = getMaterialColor(mat, player.colors, skinIdx);
      if (color) {
        rects.push(
          <rect
            key={`${r}-${c}`}
            x={c}
            y={r}
            width={1}
            height={1}
            fill={color}
          />
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      width={size}
      height={Math.round(size * (rows / cols))}
      className={className}
      style={{ imageRendering: "pixelated" }}
    >
      {rects}
    </svg>
  );
});

export default PixelAvatar;
