/**
 * Pixel Art Avatar — 16-Bit Style
 * ================================
 * Renders SVG pixel art basketball player sprites inspired by
 * NBA Jam and 16-bit era sports games. Each player gets a unique
 * look with proper shading, anatomy, and dynamic basketball stance.
 *
 * Grid: 22 wide x 30 tall with multi-level shading.
 * Material codes use hex digits for richer color mapping.
 */

import { memo } from "react";
import { getPlayerById } from "../data/legacyPlayers";

// --- Color Palettes ---

const SKIN = [
  { hi: "#FFE8CC", base: "#FDDCB5", mid: "#E8C49A", shadow: "#C4956A", dark: "#A07050" }, // 0: light
  { hi: "#F5D6AA", base: "#E8B88A", mid: "#D4A070", shadow: "#B08050", dark: "#8C6040" }, // 1: med-light
  { hi: "#DCA060", base: "#C68642", mid: "#A87038", shadow: "#8A5830", dark: "#6E4428" }, // 2: medium
  { hi: "#A87040", base: "#8D5524", mid: "#7A4820", shadow: "#5C3618", dark: "#442810" }, // 3: med-dark
  { hi: "#8A5A38", base: "#6B4226", mid: "#5A3620", shadow: "#3E2818", dark: "#2A1C10" }, // 4: dark
];

// Darken/lighten a hex color by a factor
function shade(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = factor;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r * f).toString(16).padStart(2, "0")}${clamp(g * f).toString(16).padStart(2, "0")}${clamp(b * f).toString(16).padStart(2, "0")}`;
}

/*
 * Material Legend (hex chars for 16 unique materials):
 *  . = transparent
 *  0 = outline (black)
 *  1 = skin base
 *  2 = skin shadow
 *  3 = skin highlight
 *  4 = jersey primary
 *  5 = jersey primary shadow (darker)
 *  6 = jersey secondary / accent
 *  7 = shorts (secondary color)
 *  8 = shorts shadow
 *  9 = hair base
 *  a = hair highlight
 *  b = white (eyes, teeth, shoe accent)
 *  c = shoe dark
 *  d = headband / accessory color
 *  e = skin mid-tone
 *  f = shoe sole / dark accent
 */

// --- 22x30 Sprite Templates ---
// Dynamic basketball stance — slightly crouched, arms out

const BODY_NORMAL = [
  // 0         1         2
  // 0123456789012345678901
  "......00000000........", // 0  head outline top
  ".....099999990........", // 1  hair top
  "....09999999990.......", // 2  hair full
  "....09999999990.......", // 3  hair sides
  "....01111111110.......", // 4  forehead
  "....0b1e0b1e010.......", // 5  eyes (b=white, e=iris area)
  "....01111111110.......", // 6  nose bridge
  "....0e111111e0........", // 7  cheeks
  ".....011111110........", // 8  mouth/chin
  "......0011100.........", // 9  neck
  "......0011100.........", // 10 neck base
  "...000044444000.......", // 11 shoulders
  "..01100444440011.......", // 12 upper arms + chest
  "..01100445440011.......", // 13 arms + jersey detail
  "..0e100444440010.......", // 14 mid torso
  "..01100466640011.......", // 15 jersey number area
  "...0110444440110.......", // 16 lower torso
  "....000444440000......", // 17 torso/waist
  ".....00011000.........", // 18 waist
  "....0077777770........", // 19 shorts top
  "....0077777770........", // 20 shorts
  "....0077887770........", // 21 shorts shadow
  "....0077887770........", // 22 shorts bottom
  ".....007007700........", // 23 leg gap
  ".....012001200........", // 24 upper legs
  ".....012001200........", // 25 legs
  ".....001001100........", // 26 ankles
  "....00cc00cc00........", // 27 shoes top
  "....0cccc0cccc0.......", // 28 shoes
  ".....0ff00.0ff0.......", // 29 soles
];

const BODY_BIG = [
  // 0         1         2
  // 0123456789012345678901
  ".....000000000........", // 0
  "....0999999990........", // 1
  "...09999999999........", // 2  -- note: intentionally asymmetric is fine
  "...099999999990.......", // 3
  "...0111111111100......", // 4
  "...0b1e0b1e01100......", // 5
  "...0111111111100......", // 6
  "...0e11111111e0.......", // 7
  "....01111111110.......", // 8
  ".....001111000........", // 9
  "......00110.0.........", // 10
  "..00000444440000......", // 11
  ".011100444444001100...", // 12
  ".011100445544001100...", // 13
  ".0e1100444444001e00...", // 14
  ".011100466664001100...", // 15
  "..01100444444001100...", // 16
  "...0000444444000......", // 17
  "......001110.0........", // 18
  "....00777777770.......", // 19
  "....00777777770.......", // 20
  "....00778887770.......", // 21
  "....00778887770.......", // 22
  ".....0070007700.......", // 23
  ".....0120001200.......", // 24
  ".....0120001200.......", // 25
  ".....00100011.........", // 26
  "....00cc000cc00.......", // 27
  "...0ccccc0ccccc0......", // 28
  "....0fff0..0fff0......", // 29
];

// --- Hair Style Overlays ---

function getHairOverlay(style, isBig) {
  const overlays = [];
  const push = (r, str) => {
    for (let c = 0; c < str.length; c++) {
      if (str[c] !== ".") overlays.push({ row: r, col: c, mat: str[c] });
    }
  };

  if (isBig) {
    switch (style) {
      case "bald":
        push(0, ".....000000000........");
        push(1, "....0111111110........");
        push(2, "...0111111111100......");
        push(3, "...011111111110.......");
        break;
      case "fade":
        push(0, ".....09a9a9000........");
        push(1, "....09a9a99990........");
        push(2, "...0111111111100......");
        push(3, "...011111111110.......");
        break;
      case "afro":
        push(0, "...0099999990.........");
        push(1, "..099999999999........");
        push(2, ".09999999999990.......");
        push(3, ".09999999999990.......");
        push(4, ".091111111111900......");
        break;
      case "mohawk":
        push(0, "......009900..........");
        push(1, ".....099999990........");
        push(2, "...0111111111100......");
        push(3, "...011111111110.......");
        break;
      case "cornrows":
        push(1, "....09a9a9a990........");
        push(2, "...09a9a9a99990.......");
        push(3, "...099999999990.......");
        break;
      case "long":
        push(0, "....0099999000........");
        push(1, "...099999999990.......");
        push(2, "..0999999999990.......");
        push(3, "..0999999999990.......");
        push(8, "..09011111110090......");
        push(9, "...900111100090.......");
        break;
      default: break; // "flat" uses template default
    }
  } else {
    switch (style) {
      case "bald":
        push(0, "......00000000........");
        push(1, ".....011111110........");
        push(2, "....0111111110........");
        push(3, "....01111111110.......");
        break;
      case "fade":
        push(0, "......09a9a000........");
        push(1, ".....09a9a9990........");
        push(2, "....01111111110.......");
        push(3, "....01111111110.......");
        break;
      case "afro":
        push(0, "....009999990.........");
        push(1, "...0999999999.........");
        push(2, "..099999999990........");
        push(3, "..099999999990........");
        push(4, "..0911111111900.......");
        break;
      case "mohawk":
        push(0, ".......09900..........");
        push(1, "......099990..........");
        push(2, "....09999999990.......");
        push(3, "....01111111110.......");
        break;
      case "cornrows":
        push(1, ".....09a9a990.........");
        push(2, "....09a9a99990........");
        push(3, "....09999999990.......");
        break;
      case "long":
        push(0, ".....009999000........");
        push(1, "....09999999990.......");
        push(2, "...099999999990.......");
        push(3, "...099999999990.......");
        push(8, "...0901111110090......");
        push(9, "....900111000090......");
        break;
      default: break;
    }
  }
  return overlays;
}

function getAccessoryOverlays(accessories, isBig) {
  const overlays = [];
  const push = (r, str) => {
    for (let c = 0; c < str.length; c++) {
      if (str[c] !== ".") overlays.push({ row: r, col: c, mat: str[c] });
    }
  };

  for (const acc of accessories) {
    switch (acc) {
      case "headband":
        if (isBig) {
          push(4, "...0dddddddd00......");
        } else {
          push(4, "....0ddddddd0........");
        }
        break;
      case "goggles":
        if (isBig) {
          push(5, "...0b1e0b1e01100......");
          push(6, "...00f00f0011100......");
        } else {
          push(5, "....0b1e0b1e010.......");
          push(6, "....00f00f01110.......");
        }
        break;
      case "wristband":
        if (isBig) {
          push(16, "..0d100444444001d0...");
        } else {
          push(16, "...0d10444440d10.....");
        }
        break;
      default: break;
    }
  }
  return overlays;
}

// --- Sprite Builder ---

function buildSprite(player) {
  if (!player) return null;

  const sprite = player.sprite || {};
  const isBig = sprite.build === "big";
  const template = isBig ? BODY_BIG : BODY_NORMAL;

  // Parse template into 2D grid — pad all rows to same width
  const maxLen = Math.max(...template.map((r) => r.length));
  const grid = template.map((row) => row.padEnd(maxLen, ".").split(""));

  // Apply hair style
  const hairOverlay = getHairOverlay(sprite.hair || "flat", isBig);
  for (const { row, col, mat } of hairOverlay) {
    if (row < grid.length && col < grid[0].length) {
      grid[row][col] = mat;
    }
  }

  // Apply accessories
  const accOverlays = getAccessoryOverlays(sprite.accessories || [], isBig);
  for (const { row, col, mat } of accOverlays) {
    if (row < grid.length && col < grid[0].length) {
      grid[row][col] = mat;
    }
  }

  return grid;
}

function getMaterialColor(mat, colors, skinIdx) {
  const s = SKIN[skinIdx] || SKIN[3];
  const j1 = colors[0] || "#666666";
  const j2 = colors[1] || "#999999";

  switch (mat) {
    case "0": return "#0a0a0a";              // outline
    case "1": return s.base;                  // skin
    case "2": return s.shadow;                // skin shadow
    case "3": return s.hi;                    // skin highlight
    case "e": return s.mid;                   // skin mid
    case "4": return j1;                      // jersey primary
    case "5": return shade(j1, 0.65);         // jersey shadow
    case "6": return j2;                      // jersey secondary/number
    case "7": return j2;                      // shorts
    case "8": return shade(j2, 0.6);          // shorts shadow
    case "9": return "#1a1a1a";               // hair
    case "a": return "#3a3a3a";               // hair highlight
    case "b": return "#FFFFFF";               // white (eyes)
    case "c": return "#2a2a2a";               // shoe base
    case "d": return j2;                      // headband (secondary color)
    case "f": return "#111111";               // sole / darkest
    default:  return null;                    // transparent
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
          <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={color} />
        );
      }
    }
  }

  // Aspect ratio: width=cols, height=rows
  const aspectH = Math.round(size * (rows / cols));

  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      width={size}
      height={aspectH}
      className={className}
      style={{ imageRendering: "pixelated" }}
    >
      {rects}
    </svg>
  );
});

export default PixelAvatar;
