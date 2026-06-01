function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function compactRef(ref = {}) {
  return {
    title: text(ref?.title),
    goal: text(ref?.goal),
    role: text(ref?.role),
    covers: unique(ref?.covers),
    checks: unique(ref?.checks),
    ...(ref?.dependency === true ? { dependency: true } : {}),
    ...(ref?.selected === true ? { selected: true } : {})
  };
}

export function buildBranchMicrosequenceContract({
  selectedCourse,
  selectedModule,
  selectedLesson,
  currentMicrosequence,
  userPrompt = "",
  contextPacket = {}
} = {}) {
  return {
    task: "plan_branch_microsequence",
    language: "pt-BR",
    path: {
      course: text(selectedCourse?.title),
      module: text(selectedModule?.title),
      lesson: text(selectedLesson?.title),
      microsequence: text(currentMicrosequence?.title)
    },
    guide: structuredClone(contextPacket?.guide || selectedLesson?.guide || selectedModule?.guide || { goal: "", include: [], exclude: [], notation: [], avoid: [] }),
    current: {
      title: text(currentMicrosequence?.title),
      goal: text(currentMicrosequence?.goal),
      role: text(currentMicrosequence?.role),
      covers: unique(currentMicrosequence?.covers),
      checks: unique(currentMicrosequence?.checks)
    },
    context: {
      selectedRefs: unique(contextPacket?.refs?.selected),
      refs: (Array.isArray(contextPacket?.refs?.items) ? contextPacket.refs.items : []).map(compactRef).filter((item) => item.title),
      next: contextPacket?.next && typeof contextPacket.next === "object"
        ? {
            title: text(contextPacket.next.title),
            goal: text(contextPacket.next.goal),
            role: text(contextPacket.next.role),
            covers: unique(contextPacket.next.covers),
            checks: unique(contextPacket.next.checks)
          }
        : null
    },
    request: {
      prompt: text(userPrompt)
    },
    allowedRoles: ["explain", "practice", "review", "support"],
    rules: [
      "Return only valid JSON.",
      "Plan exactly one new microsequence after current.",
      "Do not generate cards.",
      "Keep the new microsequence inside guide.include and away from guide.exclude.",
      "Use support only when the new step is clearly auxiliary to the main trail."
    ]
  };
}
