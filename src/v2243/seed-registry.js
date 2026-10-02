// Only the accepted model/effort has evidence. Future entries use this same
// immutable shape; no thresholds are supplied for unobserved combinations.
const ANONYMOUS_PRESSURE_SEEDS = Object.freeze([
  Object.freeze({model:PRESSURE_SEED.model,canonicalEffort:PRESSURE_SEED.canonicalEffort,
    seedVersion:PRESSURE_SEED.version,profiles:PRESSURE_SEED.profiles})
]);
