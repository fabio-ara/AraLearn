function optionShuffleHash(seed, value, index) {
  const text = String(seed || "") + "::" + String(value || "") + "::" + String(index || 0);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash;
}

export function getExerciseOptionStableId(option, index = 0) {
  const candidate = option && typeof option === "object" && !Array.isArray(option) ? option.id : null;
  return String(candidate || `exercise-option-${index}`);
}

export function shuffleExerciseOptions(list, seed) {
  return (Array.isArray(list) ? list : [])
    .map((item, index) => {
      const value =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item.value !== undefined ? item.value : item.id)
          : item;
      return {
        item,
        index,
        hash: optionShuffleHash(seed, value, index)
      };
    })
    .sort((a, b) => {
      if (a.hash === b.hash) {
        return a.index - b.index;
      }
      return a.hash - b.hash;
    })
    .map((entry) => entry.item);
}
