function stableUuid(prefix, index) {
  return `${prefix}0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

export function homeTrailSnapshotForProject(project, {
  groupId = "90000000-0000-4000-8000-000000000001",
  groupTitle = "Trilhas",
  permissions = {}
} = {}) {
  return {
    space: "trails",
    groups: [{ id: groupId, title: groupTitle, position: 0 }],
    items: (project?.courses || []).map((course, index) => {
      const access = permissions[course.id] || {};
      return {
        trailItemId: stableUuid("a", index),
        workspaceId: null,
        courseKey: course.id,
        courseId: stableUuid("b", index),
        selectionId: stableUuid("c", index),
        kind: "course",
        source: "selection",
        origin: access.origin === "catalog" ? "catalog" : "private",
        title: course.title || "Curso",
        description: course.goal || "",
        moduleCount: (course.modules || []).length,
        lessonCount: (course.modules || []).reduce(
          (total, moduleValue) => total + (moduleValue.lessons || []).length,
          0
        ),
        microsequenceCount: 0,
        cardCount: Math.max(1, Number(access.cardCount) || 0),
        completedCardCount: 0,
        contentHash: "a".repeat(64),
        revision: null,
        canEdit: access.canEdit === true,
        canDelete: access.canDelete === true,
        canRemove: access.canRemove === true,
        pathId: groupId,
        pathTitle: groupTitle,
        pathPosition: 0,
        itemPosition: index,
        updatedAt: "2026-08-07T12:00:00Z"
      };
    }),
    hasMore: false,
    nextCursor: null,
    capabilities: { organize: true, catalogManage: false, catalogReview: false }
  };
}
