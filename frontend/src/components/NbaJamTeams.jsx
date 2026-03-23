/**
 * NBA Jam Style Teams Display
 * ===========================
 * TEACHING NOTE:
 *   Renders the two teams in a retro NBA Jam arcade style:
 *   - Dark background with cyan/teal border accents
 *   - Player cards showing their legacy NBA avatar, name, and stat bars
 *   - Stat bars for Offense, Defense, Overall, and Jordan Factor
 *   - Starters shown prominently, subs smaller below
 *
 *   The component maps each user's `avatar_url` field to a legacy
 *   NBA player's team colors and jersey number for the visual display.
 */

import { Link } from "react-router-dom";
import { getPlayerById } from "../data/legacyPlayers";
import PixelAvatar from "./PixelAvatar";

function StatBar({ label, value, max = 5.0, color = "#22d3ee" }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider w-12 text-right shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2.5 bg-gray-800 rounded-sm overflow-hidden border border-gray-600">
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function JamPlayerCard({ player, isStarter }) {
  const legacy = getPlayerById(player.avatar_url);
  const initial = player.full_name?.charAt(0) || "?";

  const bgGradient = legacy
    ? `linear-gradient(160deg, ${legacy.colors[0]}dd, ${legacy.colors[1]}dd)`
    : "linear-gradient(160deg, #374151, #1f2937)";

  return (
    <Link
      to={`/players/${player.id}`}
      className={`block rounded-lg overflow-hidden transition-transform hover:scale-[1.03] ${
        isStarter ? "" : "opacity-80 scale-95"
      }`}
    >
      <div className="bg-gray-800 border border-gray-600 rounded-lg overflow-hidden">
        {/* Player visual */}
        <div
          className="relative flex items-center justify-center py-3"
          style={{ background: bgGradient }}
        >
          {/* 8-bit pixel avatar */}
          {legacy ? (
            <PixelAvatar playerId={player.avatar_url} size={56} />
          ) : (
            <div className="w-14 h-14 rounded-full bg-black/30 border-2 border-white/30 flex items-center justify-center">
              <span className="text-2xl font-black text-white leading-none">
                {initial}
              </span>
            </div>
          )}
          {/* Starter badge */}
          {isStarter && (
            <div className="absolute top-1 right-1 text-[8px] font-bold bg-yellow-400 text-gray-900 px-1.5 py-0.5 rounded">
              START
            </div>
          )}
        </div>

        {/* Name plate */}
        <div className="bg-gray-900 px-2 py-1.5 border-t border-gray-600">
          <p className="text-xs font-black text-white uppercase tracking-wide truncate text-center">
            {player.full_name}
          </p>
          {legacy && (
            <p className="text-[9px] text-gray-500 text-center truncate">
              {legacy.name} — {legacy.team}
            </p>
          )}
        </div>

        {/* Stat bars */}
        <div className="bg-gray-900 px-2 pb-2 space-y-1">
          <StatBar label="OFF" value={player.avg_offense || 3} max={5} color="#4ade80" />
          <StatBar label="DEF" value={player.avg_defense || 3} max={5} color="#60a5fa" />
          <StatBar label="OVR" value={player.avg_overall || 3} max={5} color="#facc15" />
          <StatBar
            label="JF"
            value={(player.jordan_factor || 0.5) * 100}
            max={100}
            color="#f97316"
          />
        </div>
      </div>
    </Link>
  );
}

export default function NbaJamTeams({ teamA, teamB }) {
  const startersA = teamA.filter((t) => t.is_starter);
  const subsA = teamA.filter((t) => !t.is_starter);
  const startersB = teamB.filter((t) => t.is_starter);
  const subsB = teamB.filter((t) => !t.is_starter);

  return (
    <div className="jam-container rounded-2xl p-1 bg-gradient-to-b from-cyan-500 via-cyan-600 to-cyan-700 shadow-2xl shadow-cyan-500/20">
      <div className="bg-gray-950 rounded-xl p-4">
        {/* Title Bar */}
        <div className="text-center mb-4">
          <h2 className="text-2xl font-black text-cyan-400 uppercase tracking-[0.3em]">
            Tonight's Matchup
          </h2>
          <div className="flex items-center justify-center gap-4 mt-1">
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              {startersA.length + subsA.length} Players
            </span>
            <span className="text-lg font-black text-gray-600">VS</span>
            <span className="text-xs text-gray-500 uppercase tracking-wider">
              {startersB.length + subsB.length} Players
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Team A */}
          <JamTeamPanel
            name="Team A"
            color="#f97316"
            starters={startersA}
            subs={subsA}
          />

          {/* Team B */}
          <JamTeamPanel
            name="Team B"
            color="#3b82f6"
            starters={startersB}
            subs={subsB}
          />
        </div>
      </div>
    </div>
  );
}

function JamTeamPanel({ name, color, starters, subs }) {
  return (
    <div
      className="rounded-xl overflow-hidden border-2"
      style={{ borderColor: color }}
    >
      {/* Team Header */}
      <div
        className="py-2 px-4 text-center"
        style={{ background: `linear-gradient(135deg, ${color}22, ${color}44)` }}
      >
        <h3 className="text-lg font-black uppercase tracking-[0.2em]" style={{ color }}>
          {name}
        </h3>
      </div>

      {/* Starters Grid */}
      <div className="p-3 bg-gray-900">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 text-center">
          Starters
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {starters.map((t) => (
            <JamPlayerCard key={t.id} player={t.user} isStarter={true} />
          ))}
        </div>

        {/* Subs */}
        {subs.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-4 mb-2 text-center">
              Bench
            </p>
            <div className="grid grid-cols-3 gap-2">
              {subs.map((t) => (
                <JamPlayerCard key={t.id} player={t.user} isStarter={false} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
