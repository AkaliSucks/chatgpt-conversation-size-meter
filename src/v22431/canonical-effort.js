function pressureEffort(value) {
  const effort=typeof value==='string' ? value.trim().slice(0,120).toLowerCase().replace(/\s+/g,' ') || null : null;
  // Paired UI/backend evidence only: Extra High/max and High/extended.
  // Preserve other labels without guessing aliases or merging effort levels.
  return effort==='extra high' ? 'max' : effort==='extended' ? 'high' : effort;
}
