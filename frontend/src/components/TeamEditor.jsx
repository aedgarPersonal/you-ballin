/**
 * TeamEditor — Mobile-friendly drag-and-drop team editor for admins.
 * Allows moving players between teams, removing no-shows, and adding players.
 */

import { useState, useEffect } from "react";
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay } from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import toast from "react-hot-toast";
import { moveTeamAssignment, removeTeamAssignment, addTeamAssignment } from "../api/games";
import { listPlayers } from "../api/players";
import { AvatarBadge } from "./AvatarPicker";

function DraggableCard({ assignment, onRemove }) {
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
      {/* Drag handle */}
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 touch-none">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
        </svg>
      </div>

      {/* Avatar */}
      {player?.avatar_url ? (
        <AvatarBadge avatarId={player.avatar_url} size="sm" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">
          {player?.full_name?.charAt(0) || "?"}
        </div>
      )}

      {/* Name + stats */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{player?.full_name}</p>
        <p className="text-[10px] text-gray-400">
          {((player?.jordan_factor || 0.5) * 100).toFixed(0)}% W
        </p>
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity p-1"
        title="Mark as no-show"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function DroppableColumn({ teamId, teamName, color, children, onAddClick }) {
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
      </div>

      <div className="p-3 bg-gray-900 space-y-2 min-h-[80px]">
        {children}

        {/* Add Player button */}
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
                onClick={() => onAdd(p.id)}
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
  const [localTeams, setLocalTeams] = useState(teams);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [addingTeam, setAddingTeam] = useState(null); // team_id or null
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 8 } }),
  );

  // Fetch available players (run members not already assigned)
  useEffect(() => {
    const assignedIds = new Set(localTeams.map((t) => t.user_id));
    listPlayers(runId, { include_inactive: false })
      .then(({ data }) => {
        const available = data.users.filter((p) => !assignedIds.has(p.id));
        setAvailablePlayers(available);
      })
      .catch(() => setAvailablePlayers([]));
  }, [runId, localTeams]);

  // Group by team
  const teamGroups = {};
  for (const a of localTeams) {
    if (!teamGroups[a.team]) teamGroups[a.team] = { name: a.team_name, players: [] };
    teamGroups[a.team].players.push(a);
  }
  const teamEntries = Object.entries(teamGroups);

  const handleDragStart = (event) => setActiveId(event.active.id);

  const handleDragEnd = async (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const assignment = active.data.current.assignment;

    // Determine target team: if dropped on a droppable column, use its ID directly.
    // If dropped on another draggable card, find what team that card belongs to.
    let targetTeam = over.id;
    if (String(targetTeam).startsWith("assignment-")) {
      // Dropped on a player card — find their team
      const targetAssignment = localTeams.find((t) => `assignment-${t.id}` === targetTeam);
      if (targetAssignment) targetTeam = targetAssignment.team;
      else return;
    }

    if (assignment.team === targetTeam) return;

    // Optimistic update
    setLocalTeams((prev) =>
      prev.map((t) =>
        t.id === assignment.id
          ? { ...t, team: targetTeam, team_name: teamGroups[targetTeam]?.name || targetTeam }
          : t
      )
    );

    try {
      await moveTeamAssignment(runId, gameId, assignment.id, targetTeam);
      toast.success(`${assignment.user.full_name} moved`);
    } catch (err) {
      // Revert
      setLocalTeams((prev) =>
        prev.map((t) => (t.id === assignment.id ? assignment : t))
      );
      toast.error(err.response?.data?.detail || "Move failed");
    }
  };

  const handleRemove = async (assignment) => {
    if (!confirm(`Mark ${assignment.user.full_name} as a no-show? They won't get game stats.`)) return;

    setLocalTeams((prev) => prev.filter((t) => t.id !== assignment.id));
    try {
      await removeTeamAssignment(runId, gameId, assignment.id);
      toast.success(`${assignment.user.full_name} removed`);
    } catch (err) {
      setLocalTeams((prev) => [...prev, assignment]);
      toast.error(err.response?.data?.detail || "Remove failed");
    }
  };

  const handleAdd = async (userId) => {
    const team = addingTeam;
    setAddingTeam(null);

    try {
      const { data } = await addTeamAssignment(runId, gameId, userId, team);
      setLocalTeams((prev) => [...prev, data]);
      toast.success(`${data.user.full_name} added`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Add failed");
    }
  };

  const activeAssignment = activeId
    ? localTeams.find((t) => `assignment-${t.id}` === activeId)
    : null;

  return (
    <div className="rounded-2xl p-1 bg-gradient-to-b from-cyan-500 via-cyan-600 to-cyan-700 shadow-2xl shadow-cyan-500/20">
      <div className="bg-gray-950 rounded-xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-cyan-400 uppercase tracking-wider">
            Edit Teams
          </h2>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="text-sm text-gray-400 hover:text-white px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="text-sm bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-4 py-1.5 rounded-lg"
            >
              Done
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Drag players between teams. Use X to remove no-shows. Use + to add players.
        </p>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className={`grid grid-cols-1 ${
            teamEntries.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"
          } gap-4`}>
            {teamEntries.map(([teamId, group], idx) => (
              <DroppableColumn
                key={teamId}
                teamId={teamId}
                teamName={group.name}
                color={TEAM_COLORS[idx % TEAM_COLORS.length]}
                onAddClick={() => setAddingTeam(teamId)}
              >
                {group.players.map((assignment) => (
                  <DraggableCard
                    key={assignment.id}
                    assignment={assignment}
                    onRemove={() => handleRemove(assignment)}
                  />
                ))}
              </DroppableColumn>
            ))}
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

      {/* Add Player Modal */}
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
