/**
 * Legacy NBA Players (Pre-2015)
 * =============================
 * TEACHING NOTE:
 *   Users pick a legacy NBA player as their avatar/identity within
 *   the app. Each entry includes the player's name, iconic team,
 *   jersey number, and team colors for rendering NBA Jam style cards.
 *
 *   Players are grouped by era for easier browsing.
 */

const LEGACY_PLAYERS = [
  // === 80s / Early 90s Legends ===
  { id: "jordan", name: "Michael Jordan", team: "Bulls", number: 23, colors: ["#CE1141", "#000000"], era: "80s-90s" },
  { id: "magic", name: "Magic Johnson", team: "Lakers", number: 32, colors: ["#552583", "#FDB927"], era: "80s-90s" },
  { id: "bird", name: "Larry Bird", team: "Celtics", number: 33, colors: ["#007A33", "#FFFFFF"], era: "80s-90s" },
  { id: "isiah", name: "Isiah Thomas", team: "Pistons", number: 11, colors: ["#C8102E", "#1D42BA"], era: "80s-90s" },
  { id: "drexler", name: "Clyde Drexler", team: "Blazers", number: 22, colors: ["#E03A3E", "#000000"], era: "80s-90s" },
  { id: "wilkins", name: "Dominique Wilkins", team: "Hawks", number: 21, colors: ["#E03A3E", "#C1D32F"], era: "80s-90s" },
  { id: "ewing", name: "Patrick Ewing", team: "Knicks", number: 33, colors: ["#006BB6", "#F58426"], era: "80s-90s" },
  { id: "barkley", name: "Charles Barkley", team: "Suns", number: 34, colors: ["#1D1160", "#E56020"], era: "80s-90s" },
  { id: "malone", name: "Karl Malone", team: "Jazz", number: 32, colors: ["#002B5C", "#00471B"], era: "80s-90s" },
  { id: "stockton", name: "John Stockton", team: "Jazz", number: 12, colors: ["#002B5C", "#00471B"], era: "80s-90s" },
  { id: "hakeem", name: "Hakeem Olajuwon", team: "Rockets", number: 34, colors: ["#CE1141", "#000000"], era: "80s-90s" },
  { id: "robinson", name: "David Robinson", team: "Spurs", number: 50, colors: ["#C4CED4", "#000000"], era: "80s-90s" },
  { id: "pippen", name: "Scottie Pippen", team: "Bulls", number: 33, colors: ["#CE1141", "#000000"], era: "80s-90s" },

  // === Mid 90s / Early 2000s ===
  { id: "shaq", name: "Shaquille O'Neal", team: "Lakers", number: 34, colors: ["#552583", "#FDB927"], era: "90s-00s" },
  { id: "iverson", name: "Allen Iverson", team: "76ers", number: 3, colors: ["#006BB6", "#ED174C"], era: "90s-00s" },
  { id: "kobe", name: "Kobe Bryant", team: "Lakers", number: 24, colors: ["#552583", "#FDB927"], era: "90s-00s" },
  { id: "duncan", name: "Tim Duncan", team: "Spurs", number: 21, colors: ["#C4CED4", "#000000"], era: "90s-00s" },
  { id: "kg", name: "Kevin Garnett", team: "Timberwolves", number: 21, colors: ["#0C2340", "#236192"], era: "90s-00s" },
  { id: "penny", name: "Penny Hardaway", team: "Magic", number: 1, colors: ["#0077C0", "#000000"], era: "90s-00s" },
  { id: "payton", name: "Gary Payton", team: "Sonics", number: 20, colors: ["#00653A", "#FFC200"], era: "90s-00s" },
  { id: "kidd", name: "Jason Kidd", team: "Nets", number: 5, colors: ["#002A60", "#FFFFFF"], era: "90s-00s" },
  { id: "carter", name: "Vince Carter", team: "Raptors", number: 15, colors: ["#CE1141", "#000000"], era: "90s-00s" },
  { id: "tmac", name: "Tracy McGrady", team: "Magic", number: 1, colors: ["#0077C0", "#000000"], era: "90s-00s" },
  { id: "nash", name: "Steve Nash", team: "Suns", number: 13, colors: ["#1D1160", "#E56020"], era: "90s-00s" },
  { id: "dirk", name: "Dirk Nowitzki", team: "Mavericks", number: 41, colors: ["#00538C", "#002B5E"], era: "90s-00s" },
  { id: "reggie", name: "Reggie Miller", team: "Pacers", number: 31, colors: ["#002D62", "#FDBB30"], era: "90s-00s" },
  { id: "ray", name: "Ray Allen", team: "Sonics", number: 34, colors: ["#00653A", "#FFC200"], era: "90s-00s" },
  { id: "pierce", name: "Paul Pierce", team: "Celtics", number: 34, colors: ["#007A33", "#FFFFFF"], era: "90s-00s" },
  { id: "yao", name: "Yao Ming", team: "Rockets", number: 11, colors: ["#CE1141", "#000000"], era: "90s-00s" },
  { id: "benwallace", name: "Ben Wallace", team: "Pistons", number: 3, colors: ["#C8102E", "#1D42BA"], era: "90s-00s" },

  // === Late 2000s / Early 2010s ===
  { id: "lebron", name: "LeBron James", team: "Heat", number: 6, colors: ["#98002E", "#000000"], era: "00s-10s" },
  { id: "wade", name: "Dwyane Wade", team: "Heat", number: 3, colors: ["#98002E", "#000000"], era: "00s-10s" },
  { id: "cp3", name: "Chris Paul", team: "Hornets", number: 3, colors: ["#1D1160", "#00788C"], era: "00s-10s" },
  { id: "melo", name: "Carmelo Anthony", team: "Nuggets", number: 15, colors: ["#0E2240", "#FEC524"], era: "00s-10s" },
  { id: "dwight", name: "Dwight Howard", team: "Magic", number: 12, colors: ["#0077C0", "#000000"], era: "00s-10s" },
  { id: "pau", name: "Pau Gasol", team: "Lakers", number: 16, colors: ["#552583", "#FDB927"], era: "00s-10s" },
  { id: "tony", name: "Tony Parker", team: "Spurs", number: 9, colors: ["#C4CED4", "#000000"], era: "00s-10s" },
  { id: "manu", name: "Manu Ginobili", team: "Spurs", number: 20, colors: ["#C4CED4", "#000000"], era: "00s-10s" },
  { id: "rondo", name: "Rajon Rondo", team: "Celtics", number: 9, colors: ["#007A33", "#FFFFFF"], era: "00s-10s" },
  { id: "billups", name: "Chauncey Billups", team: "Pistons", number: 1, colors: ["#C8102E", "#1D42BA"], era: "00s-10s" },
  { id: "westbrook", name: "Russell Westbrook", team: "Thunder", number: 0, colors: ["#007AC1", "#EF6100"], era: "00s-10s" },
  { id: "durant", name: "Kevin Durant", team: "Thunder", number: 35, colors: ["#007AC1", "#EF6100"], era: "00s-10s" },
  { id: "drose", name: "Derrick Rose", team: "Bulls", number: 1, colors: ["#CE1141", "#000000"], era: "00s-10s" },
  { id: "bosh", name: "Chris Bosh", team: "Heat", number: 1, colors: ["#98002E", "#000000"], era: "00s-10s" },
  { id: "davis", name: "Baron Davis", team: "Hornets", number: 1, colors: ["#1D1160", "#00788C"], era: "00s-10s" },
  { id: "frazier", name: "Walt Frazier", team: "Knicks", number: 10, colors: ["#006BB6", "#F58426"], era: "80s-90s" },
  { id: "ljohnson", name: "Larry Johnson", team: "Hornets", number: 2, colors: ["#1D1160", "#00788C"], era: "80s-90s" },
];

export const ERAS = [
  { id: "80s-90s", label: "80s & 90s Legends" },
  { id: "90s-00s", label: "Late 90s & 2000s" },
  { id: "00s-10s", label: "2000s & Early 2010s" },
];

export function getPlayerById(id) {
  return LEGACY_PLAYERS.find((p) => p.id === id) || null;
}

export function getPlayersByEra(era) {
  return LEGACY_PLAYERS.filter((p) => p.era === era);
}

export default LEGACY_PLAYERS;
