export function applyProjectPatch(project, patch) {
  if (!project || typeof project !== "object") {
    throw new Error("Projeto inválido para patch.");
  }
  if (!patch || typeof patch !== "object") {
    throw new Error("Patch inválido.");
  }
  if (patch.kind !== "upsert-course") {
    throw new Error(`Patch não suportado: ${String(patch.kind || "")}.`);
  }

  const nextCourses = Array.isArray(project.courses) ? [...project.courses] : [];
  const index = nextCourses.findIndex((course) => course?.key === patch.course?.key);
  if (index >= 0) {
    nextCourses[index] = patch.course;
  } else {
    nextCourses.push(patch.course);
  }
  return {
    ...project,
    courses: nextCourses
  };
}

