/* Common species, offered as suggestions. Anglers can type any other species too. */
export const SPECIES = [
  "Largemouth Bass", "Smallmouth Bass", "Spotted Bass", "Striped Bass", "White Bass", "Rock Bass",
  "Walleye", "Sauger", "Northern Pike", "Muskie", "Tiger Muskie", "Chain Pickerel",
  "Yellow Perch", "White Perch", "Black Crappie", "White Crappie", "Bluegill", "Pumpkinseed", "Sunfish",
  "Channel Catfish", "Blue Catfish", "Flathead Catfish", "Brown Bullhead",
  "Common Carp", "Freshwater Drum", "Lake Sturgeon", "Bowfin", "Longnose Gar", "Burbot", "Goldeye",
  "Rainbow Trout", "Steelhead", "Brown Trout", "Brook Trout", "Lake Trout", "Splake", "Cutthroat Trout", "Arctic Char",
  "Chinook Salmon", "Coho Salmon", "Atlantic Salmon", "Pink Salmon", "Sockeye Salmon",
  "Lake Whitefish", "Cisco", "American Shad",
  "Redfish", "Speckled Trout", "Snook", "Flounder", "Bluefish", "Tarpon", "Mahi-mahi", "Halibut",
];

const BY_KEY = new Map(SPECIES.map(s => [key(s), s]));
const ALIASES = { muskellunge: "Muskie", musky: "Muskie", pike: "Northern Pike", carp: "Common Carp", perch: "Yellow Perch",
  sheepshead: "Freshwater Drum", "lake herring": "Cisco", whitefish: "Lake Whitefish", sturgeon: "Lake Sturgeon",
  largemouth: "Largemouth Bass", smallmouth: "Smallmouth Bass", "red drum": "Redfish", "speckled sea trout": "Speckled Trout" };

function key(s) { return String(s || "").toLowerCase().replace(/[^a-z]+/g, " ").trim(); }

/* Puts a typed species into one consistent spelling, so "largemouth bass " and "Largemouth Bass" rank together. */
export function normalizeSpecies(s) {
  const k = key(s);
  if (!k) return "";
  if (BY_KEY.has(k)) return BY_KEY.get(k);
  if (ALIASES[k]) return ALIASES[k];
  return String(s).trim().replace(/\s+/g, " ").slice(0, 40).replace(/\b\p{L}/gu, c => c.toUpperCase());
}
