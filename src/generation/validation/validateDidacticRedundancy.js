function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value, limit = 8) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item))
    .filter((item) => {
      if (!item) {
        return false;
      }
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function comparable(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function signature(microsequence) {
  return JSON.stringify({
    domainRefs: list(microsequence?.domainRefs).sort(),
    practiceVariantRefs: list(microsequence?.practiceVariantRefs).sort(),
    coverageRole: text(microsequence?.coverageRole),
    didacticPurpose: comparable(microsequence?.didacticPurpose),
    title: comparable(microsequence?.title),
    description: comparable(microsequence?.description),
    tags: list(microsequence?.tags).map(comparable).sort()
  });
}

function hasMeaningfulVariation(candidate, existing) {
  if (text(candidate?.coverageRole) !== text(existing?.coverageRole)) {
    return true;
  }
  if (comparable(candidate?.didacticPurpose) !== comparable(existing?.didacticPurpose)) {
    return true;
  }

  const candidateVariants = list(candidate?.practiceVariantRefs).sort().join("|");
  const existingVariants = list(existing?.practiceVariantRefs).sort().join("|");
  if (candidateVariants !== existingVariants) {
    return true;
  }

  const candidateTags = list(candidate?.tags).map(comparable).sort().join("|");
  const existingTags = list(existing?.tags).map(comparable).sort().join("|");
  return candidateTags !== existingTags;
}

export function validateDidacticRedundancy({ microsequence, existingMicrosequences = [] } = {}) {
  const redundancyWarnings = [];
  const candidate = microsequence && typeof microsequence === "object" ? microsequence : {};
  const candidateDomainRefs = list(candidate.domainRefs).sort().join("|");
  const candidateSignature = signature(candidate);

  (Array.isArray(existingMicrosequences) ? existingMicrosequences : []).forEach((existing) => {
    if (!existing || existing === microsequence) {
      return;
    }

    const sameDomainRefs = candidateDomainRefs && candidateDomainRefs === list(existing.domainRefs).sort().join("|");
    const sameSignature = candidateSignature === signature(existing);
    const sameTitle = comparable(candidate.title) && comparable(candidate.title) === comparable(existing.title);

    if (!(sameSignature || (sameDomainRefs && sameTitle))) {
      return;
    }
    if (hasMeaningfulVariation(candidate, existing)) {
      return;
    }

    redundancyWarnings.push({
      type: "duplicate_microsequence_without_new_function",
      target: text(candidate.key) || text(candidate.title) || "microsequence",
      existingTarget: text(existing.key) || text(existing.title) || "microsequence",
      message: "A microssequência repete cobertura, formato e finalidade sem acrescentar contraste novo."
    });
  });

  return {
    ok: redundancyWarnings.length === 0,
    redundancyWarnings
  };
}
