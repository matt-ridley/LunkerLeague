/* Estimated weight from length, for fish that were measured but not weighed. For show only: an estimate is never
   saved, and never counts for a personal best, a record, a derby or a bet.
   Uses the standard weight (Ws) equations fisheries biologists use: log10(grams) = a + b * log10(total length in mm),
   the weight of a typical fish in good condition at that length. From the FSA package's table of published equations
   (fishR-Core-Team/FSA, WSlit). Each applies from a minimum length (and some up to a maximum). */
import { isStringer } from "./stats.js";

// species -> [a, b, min mm, max mm (optional)]
const WS = {
  "Largemouth Bass": [-5.528, 3.273, 150],
  "Smallmouth Bass": [-5.329, 3.200, 150],
  "Spotted Bass": [-5.392, 3.215, 100],
  "Striped Bass": [-4.924, 3.007, 150],
  "White Bass": [-5.066, 3.081, 115],
  "Rock Bass": [-4.827, 3.074, 80],
  "Walleye": [-5.453, 3.180, 150],
  "Sauger": [-5.492, 3.187, 70],
  "Northern Pike": [-5.437, 3.096, 100],
  "Muskie": [-6.066, 3.325, 380],
  "Tiger Muskie": [-6.126, 3.337, 240],
  "Chain Pickerel": [-5.824, 3.243, 150],
  "Yellow Perch": [-5.386, 3.230, 100],
  "White Perch": [-5.122, 3.136, 80],
  "Black Crappie": [-5.618, 3.345, 100],
  "White Crappie": [-5.642, 3.332, 100],
  "Bluegill": [-5.374, 3.316, 80],
  "Pumpkinseed": [-5.179, 3.237, 50],
  "Channel Catfish": [-5.800, 3.294, 70],
  "Blue Catfish": [-6.067, 3.400, 160],
  "Flathead Catfish": [-5.542, 3.230, 130],
  "Brown Bullhead": [-5.076, 3.105, 130],
  "Common Carp": [-4.639, 2.920, 200],
  "Freshwater Drum": [-5.419, 3.204, 100],
  "Longnose Gar": [-6.811, 3.449, 200],
  "Burbot": [-4.868, 2.898, 200],
  "Goldeye": [-5.151, 3.049, 160, 470],
  "Rainbow Trout": [-4.898, 2.990, 120],     // lakes
  "Steelhead": [-5.023, 3.024, 120],         // rainbow trout, rivers
  "Brown Trout": [-5.422, 3.194, 140],       // lakes
  "Brook Trout": [-5.186, 3.103, 120],
  "Lake Trout": [-5.681, 3.246, 280],
  "Cutthroat Trout": [-5.192, 3.086, 130],   // lakes
  "Chinook Salmon": [-4.661, 2.901, 200],
  "Cisco": [-5.517, 3.224, 100],
};

const GRAMS_PER_OZ = 28.349523125;

/* Ounces for a fish of this species and length in inches, or null when there's no formula or the length is outside it.
   Whole ounces (tenths under an ounce): it's an estimate, so no false precision. */
export function estimateWeightOz(species, lengthIn) {
  const eq = WS[species];
  if (!eq || !(lengthIn > 0)) return null;
  const [a, b, min, max] = eq;
  const mm = lengthIn * 25.4;
  if (mm < min || (max && mm > max)) return null;
  const oz = 10 ** (a + b * Math.log10(mm)) / GRAMS_PER_OZ;
  return oz >= 1 ? Math.round(oz) : Math.round(oz * 10) / 10;
}

/* The estimate for a catch: only a single fish that was measured and not weighed. */
export function estimatedWeight(c) {
  if (!c || isStringer(c) || c.weightOz > 0) return null;
  return estimateWeightOz(c.species, c.lengthIn);
}

export const hasEstimate = species => species in WS;
export const ESTIMATED_SPECIES = Object.keys(WS);
