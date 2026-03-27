/**
 * Legacy NBA Players (Pre-2015)
 * =============================
 * TEACHING NOTE:
 *   Users pick a legacy NBA player as their avatar/identity within
 *   the app. Each entry includes the player's name, iconic team,
 *   jersey number, and team colors for rendering NBA Jam style cards.
 *
 *   The `sprite` field controls the 8-bit pixel art appearance:
 *   - skin: index 0-4 (light to dark)
 *   - hair: "bald", "flat", "fade", "afro", "mohawk", "cornrows", "long"
 *   - build: "normal" or "big"
 *   - accessories: array of "headband", "goggles", "wristband"
 */

const LEGACY_PLAYERS = [
  // === 80s / Early 90s Legends ===
  { id: "jordan", name: "Michael Jordan", team: "Bulls", number: 23, colors: ["#CE1141", "#000000"], era: "80s-90s",
    sprite: { skin: 4, hair: "bald", build: "normal", accessories: [] } },
  { id: "magic", name: "Magic Johnson", team: "Lakers", number: 32, colors: ["#552583", "#FDB927"], era: "80s-90s",
    sprite: { skin: 4, hair: "fade", build: "big", accessories: [] } },
  { id: "bird", name: "Larry Bird", team: "Celtics", number: 33, colors: ["#007A33", "#FFFFFF"], era: "80s-90s",
    sprite: { skin: 0, hair: "flat", build: "big", accessories: [], hairColor: "#C4A24A" } },
  { id: "isiah", name: "Isiah Thomas", team: "Pistons", number: 11, colors: ["#C8102E", "#1D42BA"], era: "80s-90s",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: [] } },
  { id: "drexler", name: "Clyde Drexler", team: "Blazers", number: 22, colors: ["#E03A3E", "#000000"], era: "80s-90s",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: [] } },
  { id: "wilkins", name: "Dominique Wilkins", team: "Hawks", number: 21, colors: ["#E03A3E", "#C1D32F"], era: "80s-90s",
    sprite: { skin: 4, hair: "fade", build: "normal", accessories: [] } },
  { id: "ewing", name: "Patrick Ewing", team: "Knicks", number: 33, colors: ["#006BB6", "#F58426"], era: "80s-90s",
    sprite: { skin: 4, hair: "bald", build: "big", accessories: ["wristband"] } },
  { id: "barkley", name: "Charles Barkley", team: "Suns", number: 34, colors: ["#1D1160", "#E56020"], era: "80s-90s",
    sprite: { skin: 4, hair: "bald", build: "big", accessories: [] } },
  { id: "malone", name: "Karl Malone", team: "Jazz", number: 32, colors: ["#002B5C", "#00471B"], era: "80s-90s",
    sprite: { skin: 4, hair: "bald", build: "big", accessories: [] } },
  { id: "stockton", name: "John Stockton", team: "Jazz", number: 12, colors: ["#002B5C", "#00471B"], era: "80s-90s",
    sprite: { skin: 0, hair: "flat", build: "normal", accessories: [], hairColor: "#5A3A1A" } },
  { id: "hakeem", name: "Hakeem Olajuwon", team: "Rockets", number: 34, colors: ["#CE1141", "#000000"], era: "80s-90s",
    sprite: { skin: 4, hair: "bald", build: "big", accessories: [] } },
  { id: "robinson", name: "David Robinson", team: "Spurs", number: 50, colors: ["#C4CED4", "#000000"], era: "80s-90s",
    sprite: { skin: 4, hair: "fade", build: "big", accessories: [] } },
  { id: "pippen", name: "Scottie Pippen", team: "Bulls", number: 33, colors: ["#CE1141", "#000000"], era: "80s-90s",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: [] } },

  // === Mid 90s / Early 2000s ===
  { id: "shaq", name: "Shaquille O'Neal", team: "Lakers", number: 34, colors: ["#552583", "#FDB927"], era: "90s-00s",
    sprite: { skin: 4, hair: "bald", build: "big", accessories: [] } },
  { id: "iverson", name: "Allen Iverson", team: "76ers", number: 3, colors: ["#006BB6", "#ED174C"], era: "90s-00s",
    sprite: { skin: 3, hair: "cornrows", build: "normal", accessories: ["headband", "wristband"] } },
  { id: "kobe", name: "Kobe Bryant", team: "Lakers", number: 24, colors: ["#552583", "#FDB927"], era: "90s-00s",
    sprite: { skin: 3, hair: "bald", build: "normal", accessories: [] } },
  { id: "duncan", name: "Tim Duncan", team: "Spurs", number: 21, colors: ["#C4CED4", "#000000"], era: "90s-00s",
    sprite: { skin: 4, hair: "flat", build: "big", accessories: [] } },
  { id: "kg", name: "Kevin Garnett", team: "Timberwolves", number: 21, colors: ["#0C2340", "#236192"], era: "90s-00s",
    sprite: { skin: 4, hair: "bald", build: "big", accessories: ["headband"] } },
  { id: "penny", name: "Penny Hardaway", team: "Magic", number: 1, colors: ["#0077C0", "#000000"], era: "90s-00s",
    sprite: { skin: 4, hair: "fade", build: "normal", accessories: [] } },
  { id: "payton", name: "Gary Payton", team: "Sonics", number: 20, colors: ["#00653A", "#FFC200"], era: "90s-00s",
    sprite: { skin: 4, hair: "bald", build: "normal", accessories: [] } },
  { id: "kidd", name: "Jason Kidd", team: "Nets", number: 5, colors: ["#002A60", "#FFFFFF"], era: "90s-00s",
    sprite: { skin: 2, hair: "bald", build: "normal", accessories: [] } },
  { id: "carter", name: "Vince Carter", team: "Raptors", number: 15, colors: ["#CE1141", "#000000"], era: "90s-00s",
    sprite: { skin: 4, hair: "fade", build: "normal", accessories: ["headband"] } },
  { id: "tmac", name: "Tracy McGrady", team: "Magic", number: 1, colors: ["#0077C0", "#000000"], era: "90s-00s",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: [] } },
  { id: "nash", name: "Steve Nash", team: "Suns", number: 13, colors: ["#1D1160", "#E56020"], era: "90s-00s",
    sprite: { skin: 0, hair: "long", build: "normal", accessories: [], hairColor: "#8B6914" } },
  { id: "dirk", name: "Dirk Nowitzki", team: "Mavericks", number: 41, colors: ["#00538C", "#002B5E"], era: "90s-00s",
    sprite: { skin: 0, hair: "flat", build: "big", accessories: [], hairColor: "#C4A24A" } },
  { id: "reggie", name: "Reggie Miller", team: "Pacers", number: 31, colors: ["#002D62", "#FDBB30"], era: "90s-00s",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: [] } },
  { id: "ray", name: "Ray Allen", team: "Sonics", number: 34, colors: ["#00653A", "#FFC200"], era: "90s-00s",
    sprite: { skin: 4, hair: "bald", build: "normal", accessories: [] } },
  { id: "pierce", name: "Paul Pierce", team: "Celtics", number: 34, colors: ["#007A33", "#FFFFFF"], era: "90s-00s",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: ["headband"] } },
  { id: "yao", name: "Yao Ming", team: "Rockets", number: 11, colors: ["#CE1141", "#000000"], era: "90s-00s",
    sprite: { skin: 1, hair: "flat", build: "big", accessories: [] } },
  { id: "benwallace", name: "Ben Wallace", team: "Pistons", number: 3, colors: ["#C8102E", "#1D42BA"], era: "90s-00s",
    sprite: { skin: 4, hair: "afro", build: "big", accessories: ["headband"] } },

  // === Late 2000s / Early 2010s ===
  { id: "lebron", name: "LeBron James", team: "Heat", number: 6, colors: ["#98002E", "#000000"], era: "00s-10s",
    sprite: { skin: 4, hair: "flat", build: "big", accessories: ["headband"] } },
  { id: "wade", name: "Dwyane Wade", team: "Heat", number: 3, colors: ["#98002E", "#000000"], era: "00s-10s",
    sprite: { skin: 4, hair: "fade", build: "normal", accessories: [] } },
  { id: "cp3", name: "Chris Paul", team: "Hornets", number: 3, colors: ["#1D1160", "#00788C"], era: "00s-10s",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: [] } },
  { id: "melo", name: "Carmelo Anthony", team: "Nuggets", number: 15, colors: ["#0E2240", "#FEC524"], era: "00s-10s",
    sprite: { skin: 3, hair: "flat", build: "normal", accessories: ["headband"] } },
  { id: "dwight", name: "Dwight Howard", team: "Magic", number: 12, colors: ["#0077C0", "#000000"], era: "00s-10s",
    sprite: { skin: 4, hair: "fade", build: "big", accessories: [] } },
  { id: "pau", name: "Pau Gasol", team: "Lakers", number: 16, colors: ["#552583", "#FDB927"], era: "00s-10s",
    sprite: { skin: 1, hair: "long", build: "big", accessories: [], hairColor: "#3A2A1A" } },
  { id: "tony", name: "Tony Parker", team: "Spurs", number: 9, colors: ["#C4CED4", "#000000"], era: "00s-10s",
    sprite: { skin: 2, hair: "flat", build: "normal", accessories: [] } },
  { id: "manu", name: "Manu Ginobili", team: "Spurs", number: 20, colors: ["#C4CED4", "#000000"], era: "00s-10s",
    sprite: { skin: 1, hair: "bald", build: "normal", accessories: [] } },
  { id: "rondo", name: "Rajon Rondo", team: "Celtics", number: 9, colors: ["#007A33", "#FFFFFF"], era: "00s-10s",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: ["headband"] } },
  { id: "billups", name: "Chauncey Billups", team: "Pistons", number: 1, colors: ["#C8102E", "#1D42BA"], era: "00s-10s",
    sprite: { skin: 4, hair: "bald", build: "normal", accessories: [] } },
  { id: "westbrook", name: "Russell Westbrook", team: "Thunder", number: 0, colors: ["#007AC1", "#EF6100"], era: "00s-10s",
    sprite: { skin: 4, hair: "mohawk", build: "normal", accessories: [] } },
  { id: "durant", name: "Kevin Durant", team: "Thunder", number: 35, colors: ["#007AC1", "#EF6100"], era: "00s-10s",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: [] } },
  { id: "drose", name: "Derrick Rose", team: "Bulls", number: 1, colors: ["#CE1141", "#000000"], era: "00s-10s",
    sprite: { skin: 4, hair: "mohawk", build: "normal", accessories: [] } },
  { id: "bosh", name: "Chris Bosh", team: "Heat", number: 1, colors: ["#98002E", "#000000"], era: "00s-10s",
    sprite: { skin: 4, hair: "flat", build: "big", accessories: [] } },
  { id: "davis", name: "Baron Davis", team: "Hornets", number: 1, colors: ["#1D1160", "#00788C"], era: "00s-10s",
    sprite: { skin: 4, hair: "afro", build: "normal", accessories: ["headband"] } },
  { id: "frazier", name: "Walt Frazier", team: "Knicks", number: 10, colors: ["#006BB6", "#F58426"], era: "80s-90s",
    sprite: { skin: 4, hair: "afro", build: "normal", accessories: [] } },
  { id: "ljohnson", name: "Larry Johnson", team: "Hornets", number: 2, colors: ["#1D1160", "#00788C"], era: "80s-90s",
    sprite: { skin: 4, hair: "fade", build: "big", accessories: [] } },
  // === Bench Warmers — Biggest Busts by Era ===
  { id: "bensimmons", name: "Ben Simmons", team: "76ers", number: 25, colors: ["#006BB6", "#ED174C"], era: "bench-warmers",
    sprite: { skin: 3, hair: "flat", build: "big", accessories: [] } },
  { id: "bennett", name: "Anthony Bennett", team: "Cavaliers", number: 15, colors: ["#6F263D", "#FFB81C"], era: "bench-warmers",
    sprite: { skin: 4, hair: "flat", build: "big", accessories: [] } },
  { id: "sambowie", name: "Sam Bowie", team: "Blazers", number: 31, colors: ["#E03A3E", "#000000"], era: "bench-warmers",
    sprite: { skin: 4, hair: "flat", build: "big", accessories: [] } },
  { id: "washburn", name: "Chris Washburn", team: "Warriors", number: 54, colors: ["#1D428A", "#FFC72C"], era: "bench-warmers",
    sprite: { skin: 4, hair: "fade", build: "big", accessories: [] } },
  { id: "olowokandi", name: "Michael Olowokandi", team: "Clippers", number: 34, colors: ["#C8102E", "#1D42BA"], era: "bench-warmers",
    sprite: { skin: 4, hair: "bald", build: "big", accessories: [] } },
  { id: "kwame", name: "Kwame Brown", team: "Wizards", number: 5, colors: ["#002B5C", "#E31837"], era: "bench-warmers",
    sprite: { skin: 4, hair: "bald", build: "big", accessories: [] } },
  { id: "darko", name: "Darko Milicic", team: "Pistons", number: 31, colors: ["#C8102E", "#1D42BA"], era: "bench-warmers",
    sprite: { skin: 1, hair: "flat", build: "big", accessories: [] } },
  { id: "morrison", name: "Adam Morrison", team: "Bobcats", number: 35, colors: ["#F26532", "#1D1160"], era: "bench-warmers",
    sprite: { skin: 0, hair: "long", build: "normal", accessories: [], hairColor: "#5A3A1A" } },
  { id: "thabeet", name: "Hasheem Thabeet", team: "Grizzlies", number: 34, colors: ["#5D76A9", "#12173F"], era: "bench-warmers",
    sprite: { skin: 4, hair: "bald", build: "big", accessories: [] } },
  { id: "fultz", name: "Markelle Fultz", team: "76ers", number: 20, colors: ["#006BB6", "#ED174C"], era: "bench-warmers",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: [] } },
  { id: "laruemartin", name: "LaRue Martin", team: "Blazers", number: 44, colors: ["#E03A3E", "#000000"], era: "bench-warmers",
    sprite: { skin: 4, hair: "afro", build: "big", accessories: [] } },

  // === Additional NBA Players (user-requested) ===
  { id: "rodman", name: "Dennis Rodman", team: "Bulls", number: 91, colors: ["#CE1141", "#000000"], era: "80s-90s",
    sprite: { skin: 4, hair: "mohawk", build: "normal", accessories: ["headband"], hairColor: "#ef4444" } },
  { id: "bogues", name: "Muggsy Bogues", team: "Hornets", number: 1, colors: ["#1D1160", "#00788C"], era: "80s-90s",
    sprite: { skin: 4, hair: "fade", build: "normal", accessories: [] } },
  { id: "abdulrauf", name: "Mahmoud Abdul-Rauf", team: "Nuggets", number: 1, colors: ["#0E2240", "#FEC524"], era: "80s-90s",
    sprite: { skin: 3, hair: "fade", build: "normal", accessories: [] } },
  { id: "eaton", name: "Mark Eaton", team: "Jazz", number: 53, colors: ["#002B5C", "#00471B"], era: "80s-90s",
    sprite: { skin: 0, hair: "flat", build: "big", accessories: [], hairColor: "#5A3A1A" } },
  { id: "olivermiller", name: "Oliver Miller", team: "Suns", number: 25, colors: ["#1D1160", "#E56020"], era: "90s-00s",
    sprite: { skin: 4, hair: "bald", build: "big", accessories: [] } },
  { id: "camby", name: "Marcus Camby", team: "Raptors", number: 21, colors: ["#CE1141", "#000000"], era: "90s-00s",
    sprite: { skin: 4, hair: "bald", build: "normal", accessories: ["wristband"] } },
  { id: "cassell", name: "Sam Cassell", team: "Bucks", number: 10, colors: ["#00471B", "#EEE1C6"], era: "90s-00s",
    sprite: { skin: 4, hair: "bald", build: "normal", accessories: [], hairColor: "#22c55e" } },
  { id: "artest", name: "Ron Artest", team: "Pacers", number: 23, colors: ["#002D62", "#FDBB30"], era: "00s-10s",
    sprite: { skin: 4, hair: "fade", build: "big", accessories: ["headband"] } },
  { id: "kirilenko", name: "Andrei Kirilenko", team: "Jazz", number: 47, colors: ["#002B5C", "#00471B"], era: "00s-10s",
    sprite: { skin: 0, hair: "flat", build: "normal", accessories: [], hairColor: "#C4A24A" } },
  { id: "prince", name: "Tayshaun Prince", team: "Pistons", number: 22, colors: ["#C8102E", "#1D42BA"], era: "00s-10s",
    sprite: { skin: 4, hair: "cornrows", build: "normal", accessories: [] } },
  { id: "kawhi", name: "Kawhi Leonard", team: "Spurs", number: 2, colors: ["#C4CED4", "#000000"], era: "00s-10s",
    sprite: { skin: 4, hair: "cornrows", build: "big", accessories: [] } },

  // === WNBA Legends ===
  { id: "taurasi", name: "Diana Taurasi", team: "Mercury", number: 3, colors: ["#E56020", "#1D1160"], era: "wnba",
    sprite: { skin: 1, hair: "long", build: "normal", accessories: [], hairColor: "#5A3A1A" } },
  { id: "suebird", name: "Sue Bird", team: "Storm", number: 10, colors: ["#2C5234", "#FFC200"], era: "wnba",
    sprite: { skin: 0, hair: "long", build: "normal", accessories: [], hairColor: "#C4A24A" } },
  { id: "lisaleslie", name: "Lisa Leslie", team: "Sparks", number: 9, colors: ["#552583", "#FDB927"], era: "wnba",
    sprite: { skin: 4, hair: "flat", build: "big", accessories: [] } },
  { id: "swoopes", name: "Sheryl Swoopes", team: "Comets", number: 22, colors: ["#CE1141", "#002B5C"], era: "wnba",
    sprite: { skin: 4, hair: "cornrows", build: "normal", accessories: [] } },
  { id: "candaceparker", name: "Candace Parker", team: "Sparks", number: 3, colors: ["#552583", "#FDB927"], era: "wnba",
    sprite: { skin: 3, hair: "long", build: "normal", accessories: [] } },
  { id: "mayamoore", name: "Maya Moore", team: "Lynx", number: 23, colors: ["#0C2340", "#78BE20"], era: "wnba",
    sprite: { skin: 3, hair: "long", build: "normal", accessories: [] } },
  { id: "catchings", name: "Tamika Catchings", team: "Fever", number: 24, colors: ["#002D62", "#E03A3E"], era: "wnba",
    sprite: { skin: 4, hair: "cornrows", build: "normal", accessories: ["headband"] } },
  { id: "cynthiacooper", name: "Cynthia Cooper", team: "Comets", number: 14, colors: ["#CE1141", "#002B5C"], era: "wnba",
    sprite: { skin: 4, hair: "flat", build: "normal", accessories: [] } },
  { id: "laurenjackson", name: "Lauren Jackson", team: "Storm", number: 15, colors: ["#2C5234", "#FFC200"], era: "wnba",
    sprite: { skin: 0, hair: "long", build: "normal", accessories: [], hairColor: "#C4A24A" } },
  { id: "tinathompson", name: "Tina Thompson", team: "Comets", number: 7, colors: ["#CE1141", "#002B5C"], era: "wnba",
    sprite: { skin: 4, hair: "cornrows", build: "normal", accessories: [] } },
  { id: "stewie", name: "Breanna Stewart", team: "Liberty", number: 30, colors: ["#86CEBC", "#000000"], era: "wnba",
    sprite: { skin: 0, hair: "long", build: "normal", accessories: [], hairColor: "#5A3A1A" } },
  { id: "ajawilson", name: "A'ja Wilson", team: "Aces", number: 22, colors: ["#000000", "#C8102E"], era: "wnba",
    sprite: { skin: 4, hair: "long", build: "normal", accessories: [] } },
  { id: "caitlinclark", name: "Caitlin Clark", team: "Fever", number: 22, colors: ["#002D62", "#E03A3E"], era: "wnba",
    sprite: { skin: 0, hair: "long", build: "normal", accessories: [], hairColor: "#5A3A1A" } },
  { id: "griner", name: "Brittney Griner", team: "Mercury", number: 42, colors: ["#E56020", "#1D1160"], era: "wnba",
    sprite: { skin: 4, hair: "flat", build: "big", accessories: [] } },
  { id: "angelreese", name: "Angel Reese", team: "Sky", number: 5, colors: ["#C8102E", "#041E42"], era: "wnba",
    sprite: { skin: 4, hair: "long", build: "normal", accessories: [] } },
];

export const ERAS = [
  { id: "80s-90s", label: "80s & 90s Legends" },
  { id: "90s-00s", label: "Late 90s & 2000s" },
  { id: "00s-10s", label: "2000s & Early 2010s" },
  { id: "wnba", label: "WNBA Legends" },
  { id: "bench-warmers", label: "Bench Warmers" },
];

export function getPlayerById(id) {
  return LEGACY_PLAYERS.find((p) => p.id === id) || null;
}

export function getPlayersByEra(era) {
  return LEGACY_PLAYERS.filter((p) => p.era === era);
}

export function getRandomPlayerId() {
  return LEGACY_PLAYERS[Math.floor(Math.random() * LEGACY_PLAYERS.length)].id;
}

export default LEGACY_PLAYERS;
