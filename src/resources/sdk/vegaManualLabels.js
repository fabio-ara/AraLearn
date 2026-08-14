function axisTitle(group) {
  return group?.querySelector?.(".role-axis-title text") || null;
}

function axisOrientation(group, title) {
  const ariaLabel = String(group?.getAttribute?.("aria-label") || "").trim();
  if (/^X-axis\b/iu.test(ariaLabel)) return "x";
  if (/^Y-axis\b/iu.test(ariaLabel)) return "y";
  const transform = [
    group?.getAttribute?.("transform"),
    title?.getAttribute?.("transform")
  ].filter(Boolean).join(" ");
  return /rotate\(\s*-?90(?:[\s,)])/iu.test(transform) ? "y" : "x";
}

function consumeDescriptor(canvas, descriptor) {
  const path = String(descriptor?.path || "");
  if (!path) return;
  const candidates = [...canvas.querySelectorAll("g.role-axis")]
    .map((group) => ({ group, title: axisTitle(group) }))
    .filter(({ title }) => Boolean(title));
  const match = candidates.find(({ group, title }) =>
    axisOrientation(group, title) === descriptor.axis
  );
  if (!match) return;
  match.title.dataset.packageManualSvgPath = encodeURIComponent(path);
  if (descriptor.suffix) {
    match.title.dataset.packageManualSvgSuffix = encodeURIComponent(descriptor.suffix);
  }
}

export function annotateVegaManualAxisTitles(canvas, descriptors = []) {
  if (!canvas?.querySelectorAll) return;
  descriptors.forEach((descriptor) => consumeDescriptor(canvas, descriptor));
}
