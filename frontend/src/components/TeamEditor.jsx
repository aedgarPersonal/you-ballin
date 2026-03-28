/**
 * TeamEditor — Mobile-friendly drag-and-drop team editor for admins.
 * All changes are local until the admin clicks Save.
 */

import { useState, useEffect, useRef } from "react";
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay, rectIntersection } from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import toast from "react-hot-toast";
import { moveTeamAssignment, removeTeamAssignment, addTeamAssignment } from "../api/games";
import { listPlayers } from "../api/players";
import { AvatarBadge } from "./AvatarPicker";

function DraggableCard({ assignment, onRemove, otherTeams, onMoveTo }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `assignment-${assignment.id}`,
    data: { assignment },
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.4 : 1 }
    : {};

  const player = assignment.user;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg group ${
        isDragging ? "shadow-lg ring-2 ring-cyan-400" : ""
      }`}
    >
      {/* Drag handle — hidden on mobile */}
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 touch-none hidden sm:block">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
        </svg>
      </div>
      {player?.avatar_url ? (
        <AvatarBadge avatarId={player.avatar_url} size="sm" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">
          {player?.full_name?.charAt(0) || "?"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{player?.full_name}</p>
        <p className="text-[10px] text-gray-400">
          {((player?.jordan_factor || 0.5) * 100).toFixed(0)}% W
        </p>
      </div>
      {/* Mobile: move-to buttons */}
      <div className="flex items-center gap-1 sm:hidden">
        {otherTeams.map(([tid, tname], i) => (
          <button
            key={tid}
            onClick={(e) => { e.stopPropagation(); onMoveTo(tid); }}
            className="text-[9px] font-bold px-1.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
            title={`Move to ${tname}`}
          >
            → {tname.split(" ")[0]}
          </button>
        ))}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="text-red-400 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1"
        title="Mark as no-show"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function DroppableColumn({ teamId, teamName, color, children, onAddClick, playerCount }) {
  const { isOver, setNodeRef } = useDroppable({ id: teamId });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl overflow-hidden border-2 transition-colors ${
        isOver ? "border-cyan-400 bg-cyan-950/20" : ""
      }`}
      style={{ borderColor: isOver ? "#22d3ee" : color }}
    >
      <div className="py-2 px-4 text-center" style={{ background: `linear-gradient(135deg, ${color}22, ${color}44)` }}>
        <h3 className="text-sm font-black uppercase tracking-[0.15em]" style={{ color }}>
          {teamName}
        </h3>
        <p className="text-[10px] text-gray-500">{playerCount} player{playerCount !== 1 ? "s" : ""}</p>
      </div>

      <div className="p-3 bg-gray-900 space-y-2 min-h-[100px]">
        {children}
        {playerCount === 0 && (
          <p className="text-xs text-gray-600 text-center py-4 italic">Drop players here</p>
        )}
        <button
          onClick={onAddClick}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-gray-600 rounded-lg text-gray-500 hover:text-gray-300 hover:border-gray-400 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
          </svg>
          Add Player
        </button>
      </div>
    </div>
  );
}

function AddPlayerModal({ teamName, players, onAdd, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = players.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl max-w-sm w-full shadow-2xl border border-gray-600">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-bold text-white">Add Player to {teamName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-4">
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm border border-gray-600 rounded-lg px-3 py-2 mb-3 bg-gray-900 text-white focus:border-cyan-500 focus:outline-none"
            autoFocus
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">No available players</p>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => onAdd(p.id, p)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors text-left"
              >
                {p.avatar_url ? (
                  <AvatarBadge avatarId={p.avatar_url} size="sm" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-gray-300">
                    {p.full_name.charAt(0)}
                  </div>
                )}
                <span className="text-sm text-white">{p.full_name}</span>
                <span className="text-xs text-gray-500 ml-auto">{p.player_status}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const TEAM_COLORS = [
  "#f97316", "#3b82f6", "#10b981", "#a855f7",
  "#ef4444", "#eab308", "#06b6d4", "#ec4899",
];

export default function TeamEditor({ teams, runId, gameId, onSave, onCancel }) {
  // Capture the original team structure (team IDs + names) so empty teams persist
  const teamStructure = useRef({});
  if (Object.keys(teamStructure.current).length === 0) {
    for (const a of teams) {
      if (!teamStructure.current[a.team]) {
        teamStructure.current[a.team] = a.team_name;
      }
    }
  }

  const [localTeams, setLocalTeams] = useState(teams);
  const [removedIds, setRemovedIds] = useState([]); // assignment IDs to delete on save
  const [addedPlayers, setAddedPlayers] = useState([]); // { user_id, team, user } objects to add on save
  const [movedPlayers, setMovedPlayers] = useState({}); // { assignmentId: newTeam } moves to apply on save
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [addingTeam, setAddingTeam] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 8 } }),
  );

  // Fetch available players
  useEffect(() => {
    const assignedIds = new Set(localTeams.map((t) => t.user_id));
    listPlayers(runId, { include_inactive: false })
      .then(({ data }) => {
        const available = data.users.filter((p) => !assignedIds.has(p.id));
        setAvailablePlayers(available);
      })
      .catch(() => setAvailablePlayers([]));
  }, [runId, localTeams]);

  // Build team groups using the fixed structure (so empty teams always appear)
  const teamGroups = {};
  for (const [teamId, teamName] of Object.entries(teamStructure.current)) {
    teamGroups[teamId] = { name: teamName, players: [] };
  }
  for (const a of localTeams) {
    if (!teamGroups[a.team]) teamGroups[a.team] = { name: a.team_name, players: [] };
    teamGroups[a.team].players.push(a);
  }
  const teamEntries = Object.entries(teamGroups);

  const hasChanges = removedIds.length > 0 || addedPlayers.length > 0 || Object.keys(movedPlayers).length > 0;

  const handleDragStart = (event) => setActiveId(event.active.id);

  const teamOnlyCollision = (args) => {
    const collisions = rectIntersection(args);
    return collisions.filter((c) => !String(c.id).startsWith("assignment-"));
  };

  // Find original team for an assignment (what the DB currently has)
  const originalTeamFor = (assignmentId) => {
    const orig = teams.find((t) => t.id === assignmentId);
    return orig ? orig.team : null;
  };

  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const assignmentId = active.data.current.assignment.id;
    const targetTeam = over.id;

    // Use current local state to check current team (not stale drag data)
    const current = localTeams.find((t) => t.id === assignmentId);
    if (!current || current.team === targetTeam) return;

    // Local-only move
    setLocalTeams((prev) =>
      prev.map((t) =>
        t.id === assignmentId
          ? { ...t, team: targetTeam, team_name: teamStructure.current[targetTeam] || targetTeam }
          : t
      )
    );

    // Track the move for original assignments
    if (typeof assignmentId === "number") {
      const origTeam = originalTeamFor(assignmentId);
      if (origTeam === targetTeam) {
        // Moved back to original position — remove from pending moves
        setMovedPlayers((prev) => { const n = { ...prev }; delete n[assignmentId]; return n; });
      } else {
        setMovedPlayers((prev) => ({ ...prev, [assignmentId]: targetTeam }));
      }
    } else {
      // For added players, update their team in addedPlayers
      setAddedPlayers((prev) =>
        prev.map((p) => p._tempId === assignmentId ? { ...p, team: targetTeam } : p)
      );
    }
  };

  const handleRemove = (assignment) => {
    setLocalTeams((prev) => prev.filter((t) => t.id !== assignment.id));
    toast.success(`${assignment.user.full_name} removed from team`);

    if (typeof assignment.id === "number") {
      setRemovedIds((prev) => [...prev, assignment.id]);
      // Remove from moves if it was moved
      setMovedPlayers((prev) => { const n = { ...prev }; delete n[assignment.id]; return n; });
    } else {
      // Remove from added players
      setAddedPlayers((prev) => prev.filter((p) => p._tempId !== assignment.id));
    }
  };

  const handleAdd = (userId, playerData) => {
    const team = addingTeam;
    setAddingTeam(null);

    // Check not already in local teams
    if (localTeams.some((t) => t.user_id === userId)) {
      toast.error("Player is already on a team");
      return;
    }

    const tempId = `temp-${Date.now()}-${userId}`;
    const fakeAssignment = {
      id: tempId,
      game_id: gameId,
      user_id: userId,
      team,
      team_name: teamStructure.current[team] || team,
      user: playerData,
    };

    setLocalTeams((prev) => [...prev, fakeAssignment]);
    setAddedPlayers((prev) => [...prev, { _tempId: tempId, user_id: userId, team }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Remove no-shows
      for (const id of removedIds) {
        await removeTeamAssignment(runId, gameId, id);
      }
      // 2. Move players
      for (const [assignmentId, newTeam] of Object.entries(movedPlayers)) {
        await moveTeamAssignment(runId, gameId, parseInt(assignmentId), newTeam);
      }
      // 3. Add new players
      for (const p of addedPlayers) {
        await addTeamAssignment(runId, gameId, p.user_id, p.team);
      }
      toast.success("Team changes saved!");
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const activeAssignment = activeId
    ? localTeams.find((t) => `assignment-${t.id}` === activeId)
    : null;

  return (
    <div className="rounded-2xl p-1 bg-gradient-to-b from-cyan-500 via-cyan-600 to-cyan-700 shadow-2xl shadow-cyan-500/20">
      <div className="bg-gray-950 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-cyan-400 uppercase tracking-wider">
            Edit Teams
          </h2>
          <div className="flex gap-2">
            <button onClick={onCancel} className="text-sm text-gray-400 hover:text-white px-3 py-1.5">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`text-sm font-semibold px-4 py-1.5 rounded-lg ${
                saving || !hasChanges
                  ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
              }`}
            >
              {saving ? "Saving..." : hasChanges ? "Save Changes" : "No Changes"}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          <span className="hidden sm:inline">Drag players between teams.</span>
          <span className="sm:hidden">Tap the arrow buttons to move players.</span>
          {" "}Changes are saved when you click Save.
        </p>

        {hasChanges && (
          <div className="text-xs text-cyan-400 mb-3">
            {Object.keys(movedPlayers).length > 0 && <span>{Object.keys(movedPlayers).length} moved </span>}
            {removedIds.length > 0 && <span>{removedIds.length} removed </span>}
            {addedPlayers.length > 0 && <span>{addedPlayers.length} added </span>}
            — unsaved
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={teamOnlyCollision}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className={`grid grid-cols-1 ${
            teamEntries.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"
          } gap-4`}>
            {teamEntries.map(([teamId, group], idx) => {
              const otherTeams = teamEntries
                .filter(([tid]) => tid !== teamId)
                .map(([tid, g]) => [tid, g.name]);
              return (
              <DroppableColumn
                key={teamId}
                teamId={teamId}
                teamName={group.name}
                color={TEAM_COLORS[idx % TEAM_COLORS.length]}
                onAddClick={() => setAddingTeam(teamId)}
                playerCount={group.players.length}
              >
                {group.players.map((assignment) => (
                  <DraggableCard
                    key={assignment.id}
                    assignment={assignment}
                    onRemove={() => handleRemove(assignment)}
                    otherTeams={otherTeams}
                    onMoveTo={(targetTeam) => {
                      // Reuse drag-end logic for mobile move
                      setLocalTeams((prev) =>
                        prev.map((t) =>
                          t.id === assignment.id
                            ? { ...t, team: targetTeam, team_name: teamStructure.current[targetTeam] || targetTeam }
                            : t
                        )
                      );
                      if (typeof assignment.id === "number") {
                        const origTeam = originalTeamFor(assignment.id);
                        if (origTeam === targetTeam) {
                          setMovedPlayers((prev) => { const n = { ...prev }; delete n[assignment.id]; return n; });
                        } else {
                          setMovedPlayers((prev) => ({ ...prev, [assignment.id]: targetTeam }));
                        }
                      } else {
                        setAddedPlayers((prev) =>
                          prev.map((p) => p._tempId === assignment.id ? { ...p, team: targetTeam } : p)
                        );
                      }
                    }}
                  />
                ))}
              </DroppableColumn>
              );
            })}
          </div>

          <DragOverlay>
            {activeAssignment && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-2 border-cyan-400 rounded-lg shadow-xl shadow-cyan-500/30">
                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white">
                  {activeAssignment.user?.full_name?.charAt(0)}
                </div>
                <span className="text-sm font-semibold text-white">{activeAssignment.user?.full_name}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {addingTeam && (
        <AddPlayerModal
          teamName={teamGroups[addingTeam]?.name || addingTeam}
          players={availablePlayers}
          onAdd={handleAdd}
          onClose={() => setAddingTeam(null)}
        />
      )}
    </div>
  );
}
