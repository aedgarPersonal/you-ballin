import { create } from "zustand";
import { listRuns } from "../api/runs";

const useRunStore = create((set, get) => ({
  runs: [],
  currentRun: JSON.parse(localStorage.getItem("currentRun") || "null"),
  loading: false,

  /** Whether the current user is an admin of the current run */
  isRunAdmin: JSON.parse(localStorage.getItem("currentRun") || "null")?.is_admin || false,

  fetchRuns: async () => {
    set({ loading: true });
    try {
      const { data } = await listRuns();
      set({ runs: data, loading: false });
      // Auto-select first run if none selected
      const current = get().currentRun;
      if (!current && data.length > 0) {
        get().setCurrentRun(data[0]);
      } else if (current) {
        // Refresh current run data from the fetched list
        const updated = data.find(r => r.id === current.id);
        if (updated) {
          get().setCurrentRun(updated);
        }
      }
    } catch (err) {
      set({ loading: false });
      console.error("Failed to fetch runs:", err);
    }
  },

  setCurrentRun: (run) => {
    localStorage.setItem("currentRun", JSON.stringify(run));
    set({ currentRun: run, isRunAdmin: run?.is_admin || false });
  },

  clearRun: () => {
    localStorage.removeItem("currentRun");
    set({ currentRun: null, isRunAdmin: false });
  },
}));

export default useRunStore;
