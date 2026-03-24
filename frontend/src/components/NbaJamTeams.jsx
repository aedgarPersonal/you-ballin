/**
 * NBA Jam Style Teams Display
 * ===========================
 * TEACHING NOTE:
 *   Renders N teams in a retro NBA Jam arcade style:
 *   - Dark background with cyan/teal border accents
 *   - Player cards showing their legacy NBA avatar, name, and stat bars
 *   - Stat bars for Offense, Defense, Overall, and Win Rate
 *   - Each team has a fun randomly-assigned basketball name
 *   - Supports any number of teams (2, 3, 4, etc.)
 *   - All players are starters — no bench distinction
 *
 *   The component groups team assignments by their `team` field and
 *   displays each group as a panel with the team's fun name.
 */

import { Link } from "react-router-dom";
import { getPlayerById } from "../data/legacyPlayers";
import PixelAvatar from "./PixelAvatar";

// Color palette for team panels — cycles if more teams than colors
const TEAM_COLORS = [
  "#f97316", // orange
  "#3b82f6", // blue
  "#10b981", // emerald
  "#a855f7", // purple
  "#ef4444", // red
  "#eab308", // yellow
  "#06b6d4", // cyan
  "#ec4899", // pink
];

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

function JamPlayerCard({ player }) {
  const legacy = getPlayerById(player.avatar_url);
  const initial = player.full_name?.charAt(0) || "?";

  const bgGradient = legacy
    ? `linear-gradient(160deg, ${legacy.colors[0]}dd, ${legacy.colors[1]}dd)`
    : "linear-gradient(160deg, #374151, #1f2937)";

  return (
    <Link
      to={`/players/${player.id}`}
      className="block rounded-lg overflow-hidden transition-transform hover:scale-[1.03]"
    >
      <div className="bg-gray-800 border border-gray-600 rounded-lg overflow-hidden">
        {/* Player visual */}
        <div
          className="relative flex items-center justify-center py-3"
          style={{ background: bgGradient }}
        >
          {legacy ? (
            <PixelAvatar playerId={player.avatar_url} size={56} />
          ) : (
            <div className="w-14 h-14 rounded-full bg-black/30 border-2 border-white/30 flex items-center justify-center">
              <span className="text-2xl font-black text-white leading-none">
                {initial}
              </span>
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
            label="WIN"
            value={(player.jordan_factor || 0.5) * 100}
            max={100}
            color="#f97316"
          />
        </div>
      </div>
    </Link>
  );
}

export default function NbaJamTeams({ teams }) {
  // Group assignments by team identifier and collect team names
  const teamGroups = {};
  for (const assignment of teams) {
    if (!teamGroups[assignment.team]) {
      teamGroups[assignment.team] = {
        name: assignment.team_name || assignment.team,
        players: [],
      };
    }
    teamGroups[assignment.team].players.push(assignment);
  }

  const teamEntries = Object.entries(teamGroups);

  // Build matchup header
  const teamCounts = teamEntries.map(
    ([, group]) => `${group.players.length} Players`
  );

  return (
    <div className="jam-container rounded-2xl p-1 bg-gradient-to-b from-cyan-500 via-cyan-600 to-cyan-700 shadow-2xl shadow-cyan-500/20">
      <div className="bg-gray-950 rounded-xl p-4">
        {/* Title Bar */}
        <div className="text-center mb-4">
          <h2 className="text-2xl font-black text-cyan-400 uppercase tracking-[0.3em]">
            Tonight's Matchup
          </h2>
          <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
            {teamCounts.map((count, i) => (
              <span key={i} className="flex items-center gap-3">
                {i > 0 && <span className="text-lg font-black text-gray-600">VS</span>}
                <span className="text-xs text-gray-500 uppercase tracking-wider">
                  {count}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className={`grid grid-cols-1 ${
          teamEntries.length === 2 ? "lg:grid-cols-2" :
          teamEntries.length === 3 ? "lg:grid-cols-3" :
          "lg:grid-cols-2 xl:grid-cols-4"
        } gap-4`}>
          {teamEntries.map(([teamId, group], idx) => (
            <JamTeamPanel
              key={teamId}
              name={group.name}
              color={TEAM_COLORS[idx % TEAM_COLORS.length]}
              players={group.players}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function JamTeamPanel({ name, color, players }) {
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

      {/* Players Grid */}
      <div className="p-3 bg-gray-900">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {players.map((t) => (
            <JamPlayerCard key={t.id} player={t.user} />
          ))}
        </div>
      </div>
    </div>
  );
}
