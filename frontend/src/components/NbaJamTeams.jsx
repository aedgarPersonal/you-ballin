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
import useAuthStore from "../stores/authStore";
import { getPlayerById } from "../data/legacyPlayers";
import PixelAvatar from "./PixelAvatar";

/**
 * Calculate a player's composite score using the same weights as team_balancer.py
 */
function playerComposite(user) {
  const scr = (user.avg_scoring || 3) / 5;
  const def = (user.avg_defense || 3) / 5;
  const ovr = (user.avg_overall || 3) / 5;
  const ath = (user.avg_athleticism || 3) / 5;
  const fit = (user.avg_fitness || 3) / 5;
  const jf = user.win_rate || 0.5;
  const height = Math.min((user.height_inches || 70) / 84, 1);
  const age = 1 - Math.min(Math.max((user.age || 30) - 18, 0) / 32, 1);
  return ovr * 0.35 + jf * 0.20 + scr * 0.15 + def * 0.15 + ath * 0.05 + fit * 0.05 + height * 0.03 + age * 0.02;
}

/**
 * Calculate Vegas-style odds from two team composite averages.
 * Returns { favoriteIdx, spread, moneyline, winProb } for each team.
 */
function calculateOdds(teamEntries) {
  if (teamEntries.length !== 2) return null;

  const teamScores = teamEntries.map(([, group]) => {
    const players = group.players.map((t) => t.user).filter(Boolean);
    if (players.length === 0) return 0;
    return players.reduce((sum, u) => sum + playerComposite(u), 0) / players.length;
  });

  const diff = teamScores[0] - teamScores[1];
  // Convert composite difference to implied win probability (sigmoid-like)
  const prob0 = 1 / (1 + Math.exp(-diff * 8)); // scale factor for sensitivity
  const prob1 = 1 - prob0;

  // Convert to American moneyline
  const toMoneyline = (prob) => {
    if (prob >= 0.5) return Math.round(-prob / (1 - prob) * 100);
    return "+" + Math.round((1 - prob) / prob * 100);
  };

  // Spread (points-style, scaled to ~5pt range for fun)
  const spread = (diff * 15).toFixed(1);

  return [
    { winProb: prob0, moneyline: toMoneyline(prob0), spread: diff >= 0 ? `-${Math.abs(spread)}` : `+${Math.abs(spread)}` },
    { winProb: prob1, moneyline: toMoneyline(prob1), spread: diff <= 0 ? `-${Math.abs(spread)}` : `+${Math.abs(spread)}` },
  ];
}

export { calculateOdds, playerComposite };

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

function JamPlayerCard({ player, isAdmin }) {
  const legacy = getPlayerById(player.avatar_url);
  const initial = player.full_name?.charAt(0) || "?";

  const bgGradient = legacy
    ? `linear-gradient(160deg, ${legacy.colors[0]}dd, ${legacy.colors[1]}dd)`
    : "linear-gradient(160deg, #374151, #1f2937)";

  const winPct = ((player.win_rate || 0.5) * 100).toFixed(0);

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

        {/* Player info — visible to all */}
        <div className="bg-gray-900 px-2 pb-2">
          <div className="flex justify-between text-[10px] text-gray-400 py-1">
            {player.height_inches && (
              <span>{Math.floor(player.height_inches / 12)}'{player.height_inches % 12}"</span>
            )}
            {player.age && <span>Age {player.age}</span>}
            <span className="text-court-500 font-bold">{winPct}% W</span>
          </div>

          {/* Admin-only stat bars */}
          {isAdmin && (
            <div className="space-y-1 mt-1 pt-1 border-t border-gray-700">
              <StatBar label="SCR" value={player.avg_scoring || 3} max={5} color="#4ade80" />
              <StatBar label="DEF" value={player.avg_defense || 3} max={5} color="#60a5fa" />
              <StatBar label="OVR" value={player.avg_overall || 3} max={5} color="#facc15" />
              <StatBar label="ATH" value={player.avg_athleticism || 3} max={5} color="#a78bfa" />
              <StatBar label="FIT" value={player.avg_fitness || 3} max={5} color="#f472b6" />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function NbaJamTeams({ teams, gameResult, onEditTeams, onGenerateTeams, isTeamsSet }) {
  const userRole = useAuthStore((s) => s.user?.role);
  const isAdmin = userRole === "super_admin" || userRole === "admin";

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
  const odds = calculateOdds(teamEntries);

  // Determine winning team from game result
  let winningTeamId = null;
  if (gameResult?.team_scores?.length >= 2) {
    const sorted = [...gameResult.team_scores].sort((a, b) => b.wins - a.wins);
    if (sorted[0].wins > sorted[1].wins) {
      winningTeamId = sorted[0].team;
    }
  }

  // Build matchup header
  const teamCounts = teamEntries.map(
    ([, group]) => `${group.players.length} Players`
  );

  return (
    <div className="jam-container rounded-2xl p-1 bg-gradient-to-b from-cyan-500 via-cyan-600 to-cyan-700 shadow-2xl shadow-cyan-500/20">
      <div className="bg-gray-950 rounded-xl p-4">
        {/* Title Bar */}
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-3">
            <h2 className="text-2xl font-black text-cyan-400 uppercase tracking-[0.3em]">
              Tonight's Matchup
            </h2>
            {isAdmin && (onEditTeams || onGenerateTeams) && (
              <div className="flex gap-2">
                {onGenerateTeams && (
                  <button
                    onClick={onGenerateTeams}
                    className="text-xs bg-court-500 hover:bg-court-400 text-white font-bold px-3 py-1 rounded-lg uppercase tracking-wider"
                  >
                    {isTeamsSet ? "Regenerate" : "Generate"}
                  </button>
                )}
                {onEditTeams && (
                  <button
                    onClick={onEditTeams}
                    className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-1 rounded-lg uppercase tracking-wider"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>
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

          {/* Odds moved to team panels */}
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
              isAdmin={isAdmin}
              odds={odds ? odds[idx] : null}
              isWinner={teamId === winningTeamId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function JamTeamPanel({ name, color, players, isAdmin, odds, isWinner }) {
  const isFav = odds && odds.winProb > 0.5;
  const isUnderdog = odds && odds.winProb < 0.5;

  return (
    <div
      className={`rounded-xl overflow-hidden border-2 ${isWinner ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-950" : ""}`}
      style={{ borderColor: isWinner ? "#facc15" : color }}
    >
      {/* Team Header */}
      <div
        className="py-2 px-4 text-center relative"
        style={{ background: isWinner
          ? "linear-gradient(135deg, #facc1522, #facc1544)"
          : `linear-gradient(135deg, ${color}22, ${color}44)` }}
      >
        <div className="flex items-center justify-center gap-2">
          {isWinner && <span className="text-xl">🏆</span>}
          <h3 className="text-lg font-black uppercase tracking-[0.2em]" style={{ color: isWinner ? "#facc15" : color }}>
            {name}
          </h3>
          {isWinner && <span className="text-xl">🏆</span>}
        </div>
        {isWinner && (
          <div className="mt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
              Winner
            </span>
          </div>
        )}
        {!isWinner && odds && (isFav || isUnderdog) && (
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              isFav ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
            }`}>
              {isFav ? "Favorite" : "Underdog"}
            </span>
            <span className={`font-mono text-[11px] font-bold ${isFav ? "text-green-400" : "text-red-400"}`}>
              {odds.moneyline}
            </span>
            <span className="text-[10px] text-gray-500">
              ({(odds.winProb * 100).toFixed(0)}%)
            </span>
          </div>
        )}
      </div>

      {/* Players Grid */}
      <div className="p-3 bg-gray-900">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {players.map((t) => (
            <JamPlayerCard key={t.id} player={t.user} isAdmin={isAdmin} />
          ))}
        </div>
      </div>
    </div>
  );
}
