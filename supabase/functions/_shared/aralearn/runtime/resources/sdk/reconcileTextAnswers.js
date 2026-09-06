function responseFieldPath(value) {
  return String(value || "").split(":", 1)[0].trim();
}

function locateUniqueResponseAnswers(value, entries) {
  const source = String(value ?? "");
  const locations = entries.map((entry) => {
    const answer = String(entry?.answer ?? "");
    const start = answer ? source.indexOf(answer) : -1;
    if (start < 0 || source.indexOf(answer, start + 1) >= 0) return null;
    return { entry, start, end: start + answer.length };
  });
  if (locations.some((location) => !location)) return null;
  const ordered = locations.sort((left, right) => left.start - right.start);
  if (ordered.some((location, index) => index > 0 &&
      location.start < ordered[index - 1].end)) return null;
  return ordered;
}

function anchoredReplacements(oldValue, newValue, entries) {
  const source = String(oldValue ?? "");
  const replacement = String(newValue ?? "");
  const locations = locateUniqueResponseAnswers(source, entries);
  if (!locations) return null;
  const anchors = [
    source.slice(0, locations[0].start),
    ...locations.slice(0, -1).map((location, index) =>
      source.slice(location.end, locations[index + 1].start)
    ),
    source.slice(locations.at(-1).end)
  ];
  if (anchors.slice(1, -1).some((anchor) => !anchor)) return null;
  const prefix = anchors[0];
  const suffix = anchors.at(-1);
  if (!replacement.startsWith(prefix) || !replacement.endsWith(suffix) ||
      replacement.length < prefix.length + suffix.length) return null;
  const contentEnd = suffix ? replacement.length - suffix.length : replacement.length;
  let cursor = prefix.length;
  const values = [];
  for (const anchor of anchors.slice(1, -1)) {
    const index = replacement.indexOf(anchor, cursor);
    const repeatedIndex = index < 0 ? -1 : replacement.indexOf(anchor, index + anchor.length);
    if (index < cursor || (repeatedIndex >= 0 && repeatedIndex < contentEnd)) {
      return null;
    }
    values.push(replacement.slice(cursor, index));
    cursor = index + anchor.length;
  }
  values.push(replacement.slice(cursor, contentEnd));
  if (values.some((value) => !value.trim())) return null;
  return locations.map((location, index) => ({
    entry: location.entry,
    oldAnswer: location.entry.answer,
    newAnswer: values[index]
  }));
}

export function reconcilePackageTextAnswers(targets, { instanceId, path, oldValue, newValue }, applyReplacement) {
  if (oldValue === newValue) return;
  const entries = targets.filter((entry) =>
    entry?.targetInstanceId === instanceId &&
    responseFieldPath(entry.targetPath) === path
  );
  if (!entries.length) return;
  if (entries.some((entry) => typeof entry.answer !== "string")) {
    throw new Error("A resposta associada não pode ser atualizada de forma inequívoca.");
  }
  const answerCounts = entries.map((entry) => {
    const answer = String(entry.answer || "");
    let count = 0;
    let cursor = 0;
    while (answer && (cursor = String(newValue).indexOf(answer, cursor)) >= 0) {
      count += 1;
      cursor += Math.max(1, answer.length);
    }
    return count;
  });
  if (answerCounts.some((count) => count > 1)) {
    throw new Error("A resposta associada não pode ser atualizada de forma inequívoca.");
  }
  const unchangedLocations = locateUniqueResponseAnswers(newValue, entries);
  if (unchangedLocations) return;
  if (answerCounts.every((count) => count === 1)) {
    throw new Error("A resposta associada não pode ser atualizada de forma inequívoca.");
  }
  const replacements = anchoredReplacements(oldValue, newValue, entries);
  if (!replacements) {
    throw new Error("Preserve o contexto do trecho praticado para atualizar o texto.");
  }
  replacements.forEach(applyReplacement);
}
