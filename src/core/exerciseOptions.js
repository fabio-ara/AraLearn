function optionShuffleHash(seed, value, index) {
  const text = String(seed || "") + "::" + String(value || "") + "::" + String(index || 0);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createShuffleRng(seed) {
  let state = optionShuffleHash(seed, "rng", 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function getExerciseOptionStableId(option, index = 0) {
  const candidate = option && typeof option === "object" && !Array.isArray(option) ? option.id : null;
  return String(candidate || `exercise-option-${index}`);
}

export function shuffleExerciseOptions(list, seed) {
  const source = Array.isArray(list) ? list.slice() : [];
  if (source.length <= 1) {
    return source;
  }

  const rng = createShuffleRng(seed);
  for (let index = source.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [source[index], source[swapIndex]] = [source[swapIndex], source[index]];
  }

  const unchanged = source.every((item, index) => item === list[index]);
  if (unchanged) {
    source.push(source.shift());
  }

  return source;
}
