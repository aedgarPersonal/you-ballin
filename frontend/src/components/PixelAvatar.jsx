/**
 * Pixel Art Avatar — Enhanced 32-Bit Style
 * =========================================
 * Renders SVG pixel art basketball player sprites inspired by
 * NBA Jam and 16-bit era sports games. Higher resolution (32x44)
 * with detailed facial features, visible jersey numbers, and
 * team-colored shoes.
 *
 * Grid: 32 wide x 44 tall with multi-level shading.
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

function shade(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r * factor).toString(16).padStart(2, "0")}${clamp(g * factor).toString(16).padStart(2, "0")}${clamp(b * factor).toString(16).padStart(2, "0")}`;
}

/*
 * Material Legend:
 *  . = transparent
 *  0 = outline (near-black)
 *  1 = skin base
 *  2 = skin shadow
 *  3 = skin highlight
 *  4 = jersey primary
 *  5 = jersey primary shadow
 *  6 = jersey secondary / accent / number
 *  7 = shorts (secondary color)
 *  8 = shorts shadow
 *  9 = hair base
 *  a = hair highlight
 *  b = white (eyes, teeth, shoe accent)
 *  c = shoe base
 *  d = headband / accessory color
 *  e = skin mid-tone
 *  f = sole / darkest
 *  g = jersey trim (lighter primary)
 *  h = shoe team color accent
 */

// --- 32x44 Sprite Templates ---

const BODY_NORMAL = [
  //0         1         2         3
  //01234567890123456789012345678901
  "........0000000000..............", // 0  head top
  ".......0999999999900............", // 1  hair top
  "......099999999999900...........", // 2  hair
  "......099999999999900...........", // 3  hair sides
  "......099999999999900...........", // 4  hair bottom
  "......011111111111100...........", // 5  forehead
  "......0b110b110111100...........", // 6  eyes (pupils)
  "......011111111111100...........", // 7  nose bridge
  "......0e1111e1111e00............", // 8  cheeks
  ".......01111111111100............", // 9  mouth area
  "........0011111100...............", // 10 chin
  ".........00111100................", // 11 neck
  ".........00111100................", // 12 neck base
  ".......0004444440000............", // 13 shoulders
  "......044444444444440...........", // 14 upper chest
  ".....0114044444440411...........", // 15 arms + chest
  ".....0114044666404411...........", // 16 arms + jersey number
  ".....0114044666404411...........", // 17 arms + jersey number
  ".....0e14044444404410...........", // 18 mid torso
  "......014044444404410...........", // 19 lower torso
  ".......01044444401100...........", // 20 waist
  "........004444440000............", // 21 waist bottom
  ".........00011000................", // 22 belt
  "........007777777700............", // 23 shorts top
  "........007777777700............", // 24 shorts
  "........007788877700............", // 25 shorts detail
  "........007788877700............", // 26 shorts shadow
  "........007777777700............", // 27 shorts bottom
  ".........00700070................", // 28 leg gap
  ".........01200120................", // 29 upper legs
  ".........01200120................", // 30 legs
  ".........01200120................", // 31 legs
  ".........01200120................", // 32 lower legs
  ".........00100010................", // 33 ankles
  "........00cc00cc00...............", // 34 shoe top
  "........0cccc0cccc0..............", // 35 shoes
  ".......0chccc0chccc0.............", // 36 shoes detail
  "........0fff0..0fff0.............", // 37 soles
  "................................", // 38
  "................................", // 39
  "................................", // 40
  "................................", // 41
  "................................", // 42
  "................................", // 43
];

const BODY_BIG = [
  //0         1         2         3
  //01234567890123456789012345678901
  ".......00000000000................", // 0
  "......09999999999900..............", // 1
  ".....0999999999999900.............", // 2
  ".....0999999999999900.............", // 3
  ".....0999999999999900.............", // 4
  ".....0111111111111100.............", // 5
  ".....0b110b110111110..............", // 6
  ".....0111111111111100.............", // 7
  ".....0e1111e11111e00..............", // 8
  "......011111111111100.............", // 9
  ".......001111111100...............", // 10
  "........001111100.................", // 11
  "........001111100.................", // 12
  ".....000044444444000..............", // 13
  "....04444444444444440.............", // 14
  "...011404444444440411.............", // 15
  "...011404466664404411.............", // 16
  "...011404466664404411.............", // 17
  "...0e1404444444404410.............", // 18
  "....01404444444404410.............", // 19
  ".....010444444440110..............", // 20
  "......0044444444000...............", // 21
  ".........000110000................", // 22
  ".......00777777777700.............", // 23
  ".......00777777777700.............", // 24
  ".......00778888877700.............", // 25
  ".......00778888877700.............", // 26
  ".......00777777777700.............", // 27
  "........0070000700................", // 28
  "........0120001200................", // 29
  "........0120001200................", // 30
  "........0120001200................", // 31
  "........0120001200................", // 32
  "........0010000100................", // 33
  ".......00cc000cc00................", // 34
  "......0ccccc0ccccc0...............", // 35
  ".....0chcccc0chcccc0..............", // 36
  "......0ffff0..0ffff0..............", // 37
  "................................", // 38
  "................................", // 39
  "................................", // 40
  "................................", // 41
  "................................", // 42
  "................................", // 43
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
        push(0, ".......00000000000................");
        push(1, "......01111111111100..............");
        push(2, ".....0111111111111100.............");
        push(3, ".....0111111111111100.............");
        push(4, ".....0111111111111100.............");
        break;
      case "fade":
        push(0, ".......009a9a90000................");
        push(1, "......09a9a99999900..............");
        push(2, ".....0111111111111100.............");
        push(3, ".....0111111111111100.............");
        push(4, ".....0111111111111100.............");
        break;
      case "afro":
        push(0, ".....00999999990000..............");
        push(1, "....099999999999990..............");
        push(2, "...09999999999999990.............");
        push(3, "...09999999999999990.............");
        push(4, "...09111111111111990.............");
        break;
      case "mohawk":
        push(0, "..........009900..................");
        push(1, ".........09999900................");
        push(2, ".....0999999999999900.............");
        push(3, ".....0111111111111100.............");
        push(4, ".....0111111111111100.............");
        break;
      case "cornrows":
        push(1, "......09a9a9a9a99900..............");
        push(2, ".....09a9a9a9a999900.............");
        push(3, ".....0999999999999900.............");
        push(4, ".....0999999999999900.............");
        break;
      case "long":
        push(0, "......00999999900000..............");
        push(1, ".....099999999999990..............");
        push(2, "....09999999999999990.............");
        push(3, "....09999999999999990.............");
        push(9, "....090111111111190..............");
        push(10, "....09001111111190...............");
        break;
      default: break;
    }
  } else {
    switch (style) {
      case "bald":
        push(0, "........0000000000..............");
        push(1, ".......0111111111100............");
        push(2, "......011111111111100...........");
        push(3, "......011111111111100...........");
        push(4, "......011111111111100...........");
        break;
      case "fade":
        push(0, "........009a9a0000..............");
        push(1, ".......09a9a999900..............");
        push(2, "......011111111111100...........");
        push(3, "......011111111111100...........");
        push(4, "......011111111111100...........");
        break;
      case "afro":
        push(0, "......009999990000..............");
        push(1, ".....09999999999900.............");
        push(2, "....0999999999999900............");
        push(3, "....0999999999999900............");
        push(4, "....0911111111111990............");
        break;
      case "mohawk":
        push(0, "..........009900................");
        push(1, ".........09999900...............");
        push(2, "......099999999999900...........");
        push(3, "......011111111111100...........");
        push(4, "......011111111111100...........");
        break;
      case "cornrows":
        push(1, ".......09a9a9a999900............");
        push(2, "......09a9a9a9999900............");
        push(3, "......099999999999900...........");
        push(4, "......099999999999900...........");
        break;
      case "long":
        push(0, ".......0099999900000............");
        push(1, "......0999999999999.0...........");
        push(2, ".....099999999999990............");
        push(3, ".....099999999999990............");
        push(9, ".....0901111111119.0............");
        push(10, ".....090011111190...............");
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
          push(5, ".....0ddddddddddddd0............");
        } else {
          push(5, "......0dddddddddddd0............");
        }
        break;
      case "goggles":
        if (isBig) {
          push(6, ".....0b110b1101111100.............");
          push(7, ".....00f000f00111100..............");
        } else {
          push(6, "......0b110b11011100...............");
          push(7, "......00f000f0011100...............");
        }
        break;
      case "wristband":
        if (isBig) {
          push(19, "....0d404444444404d0.............");
        } else {
          push(19, "......0d4044444404d0.............");
        }
        break;
      default: break;
    }
  }
  return overlays;
}

// --- Jersey Number Overlay ---

// Simple 3x5 digit font for jersey numbers
const DIGITS = {
  0: ["666","6.6","6.6","6.6","666"],
  1: [".6.",".6.",".6.",".6.",".6."],
  2: ["666","..6","666","6..","666"],
  3: ["666","..6","666","..6","666"],
  4: ["6.6","6.6","666","..6","..6"],
  5: ["666","6..","666","..6","666"],
  6: ["666","6..","666","6.6","666"],
  7: ["666","..6","..6","..6","..6"],
  8: ["666","6.6","666","6.6","666"],
  9: ["666","6.6","666","..6","666"],
};

function getNumberOverlay(number, isBig) {
  if (number == null) return [];
  const overlays = [];
  const numStr = String(number);
  const startRow = 16;
  // Center the number on the jersey
  const baseCol = isBig ? (numStr.length === 1 ? 12 : 10) : (numStr.length === 1 ? 11 : 9);

  for (let d = 0; d < numStr.length; d++) {
    const digit = DIGITS[numStr[d]];
    if (!digit) continue;
    for (let r = 0; r < digit.length; r++) {
      for (let c = 0; c < digit[r].length; c++) {
        if (digit[r][c] !== ".") {
          overlays.push({ row: startRow + r, col: baseCol + d * 4 + c, mat: "6" });
        }
      }
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

  const maxLen = Math.max(...template.map((r) => r.length));
  const grid = template.map((row) => row.padEnd(maxLen, ".").split(""));

  // Apply hair style
  for (const { row, col, mat } of getHairOverlay(sprite.hair || "flat", isBig)) {
    if (row < grid.length && col < grid[0].length) grid[row][col] = mat;
  }

  // Apply accessories
  for (const { row, col, mat } of getAccessoryOverlays(sprite.accessories || [], isBig)) {
    if (row < grid.length && col < grid[0].length) grid[row][col] = mat;
  }

  // Apply jersey number
  for (const { row, col, mat } of getNumberOverlay(player.number, isBig)) {
    if (row < grid.length && col < grid[0].length) grid[row][col] = mat;
  }

  return grid;
}

function getMaterialColor(mat, colors, skinIdx, hairColor) {
  const s = SKIN[skinIdx] || SKIN[3];
  const j1 = colors[0] || "#666666";
  const j2 = colors[1] || "#999999";
  const hc = hairColor || "#1a1a1a";

  switch (mat) {
    case "0": return "#0a0a0a";
    case "1": return s.base;
    case "2": return s.shadow;
    case "3": return s.hi;
    case "e": return s.mid;
    case "4": return j1;
    case "5": return shade(j1, 0.65);
    case "6": return j2;
    case "g": return shade(j1, 1.3);
    case "7": return j2;
    case "8": return shade(j2, 0.6);
    case "9": return hc;
    case "a": return shade(hc, 1.6);
    case "b": return "#FFFFFF";
    case "c": return "#2a2a2a";
    case "h": return j1;           // shoe accent = team primary
    case "d": return j2;
    case "f": return "#111111";
    default:  return null;
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
  const hairColor = player.sprite?.hairColor || "#1a1a1a";

  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mat = grid[r][c];
      const color = getMaterialColor(mat, player.colors, skinIdx, hairColor);
      if (color) {
        rects.push(
          <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill={color} />
        );
      }
    }
  }

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
