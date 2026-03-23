/**
 * Avatar Picker Component
 * =======================
 * TEACHING NOTE:
 *   Lets users choose a legacy NBA player (pre-2015) as their in-app
 *   avatar. The selection is stored as the player's `id` in the
 *   `avatar_url` field on the User model.
 *
 *   The picker renders as a modal grid organized by era, with each
 *   player shown as an 8-bit pixel art sprite in their team colors.
 */

import { useState } from "react";
import LEGACY_PLAYERS, { ERAS, getPlayerById } from "../data/legacyPlayers";
import PixelAvatar from "./PixelAvatar";

export function AvatarBadge({ avatarId, size = "md", className = "" }) {
  const player = getPlayerById(avatarId);
  const pxSizes = { sm: 28, md: 40, lg: 64, xl: 96 };
  const px = pxSizes[size] || pxSizes.md;

  if (!player) {
    const fallbackSizes = {
      sm: "w-8 h-8 text-xs",
      md: "w-12 h-12 text-sm",
      lg: "w-20 h-20 text-2xl",
      xl: "w-28 h-28 text-3xl",
    };
    return (
      <div className={`${fallbackSizes[size]} rounded-lg bg-gray-300 flex items-center justify-center text-gray-600 font-bold ${className}`}>
        ?
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      title={`${player.name} - ${player.team} #${player.number}`}
    >
      <PixelAvatar playerId={avatarId} size={px} />
    </div>
  );
}

export function AvatarWithName({ avatarId, fallbackInitial = "?" }) {
  const player = getPlayerById(avatarId);

  if (!player) {
    return (
      <div className="w-20 h-20 rounded-lg bg-court-100 flex items-center justify-center text-court-600 font-bold text-3xl">
        {fallbackInitial}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <PixelAvatar playerId={avatarId} size={72} />
      <span className="text-xs text-gray-500 mt-1">{player.name}</span>
    </div>
  );
}

export default function AvatarPicker({ value, onChange, onClose }) {
  const [eraFilter, setEraFilter] = useState(ERAS[0].id);
  const selected = getPlayerById(value);

  const filteredPlayers = LEGACY_PLAYERS.filter((p) => p.era === eraFilter);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border-4 border-cyan-400 shadow-2xl shadow-cyan-500/20">
        {/* Header */}
        <div className="px-6 py-4 border-b border-cyan-800 bg-gradient-to-r from-gray-900 via-cyan-950 to-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-cyan-400 uppercase tracking-widest">
              Choose Your Player
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">
              &times;
            </button>
          </div>
          {selected && (
            <p className="text-sm text-cyan-300 mt-1">
              Selected: <span className="font-bold text-white">{selected.name}</span> — {selected.team} #{selected.number}
            </p>
          )}
        </div>

        {/* Era Tabs */}
        <div className="flex border-b border-cyan-900 bg-gray-950">
          {ERAS.map((era) => (
            <button
              key={era.id}
              onClick={() => setEraFilter(era.id)}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                eraFilter === era.id
                  ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-950/30"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {era.label}
            </button>
          ))}
        </div>

        {/* Player Grid */}
        <div className="p-4 overflow-y-auto max-h-[55vh] grid grid-cols-3 sm:grid-cols-4 gap-3">
          {filteredPlayers.map((player) => {
            const isSelected = value === player.id;
            return (
              <button
                key={player.id}
                onClick={() => onChange(player.id)}
                className={`relative rounded-xl p-3 text-center transition-all border-2 ${
                  isSelected
                    ? "border-cyan-400 bg-cyan-950/40 shadow-lg shadow-cyan-500/20 scale-105"
                    : "border-gray-700 bg-gray-800 hover:border-gray-500 hover:bg-gray-750"
                }`}
              >
                {/* Pixel Art Avatar */}
                <div className="flex justify-center mb-2">
                  <PixelAvatar playerId={player.id} size={48} />
                </div>
                <p className="text-xs font-bold text-white leading-tight truncate">{player.name}</p>
                <p className="text-[10px] text-gray-400">{player.team}</p>
                {isSelected && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-cyan-400 rounded-full flex items-center justify-center text-gray-900 text-xs font-bold">
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-cyan-900 bg-gray-950 flex justify-between items-center">
          <button
            onClick={() => { onChange(null); onClose(); }}
            className="text-sm text-gray-400 hover:text-white"
          >
            Clear Selection
          </button>
          <button
            onClick={onClose}
            className="bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-bold py-2 px-6 rounded-lg text-sm uppercase tracking-wider"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
