const FOCUSABLE_CONTROL_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "summary",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

function isVisibleControl(control) {
  if (typeof control.getClientRects === 'function' && control.getClientRects().length === 0) return false;
  // Chromium can retain layout boxes for controls hidden by a closed details.
  // Only its summary belongs to the keyboard path until the section is opened.
  for (let parent = control.parentElement; parent; parent = parent.parentElement) {
    if (parent.matches?.('details:not([open])') &&
        !parent.querySelector(':scope > summary')?.contains(control)) return false;
  }
  return true;
}

export function trapAuthoringConfirmationTab({
  event,
  root,
  confirmationSelector,
  documentValue = root?.ownerDocument || globalThis.document || null
} = {}) {
  if (event?.key !== "Tab" || !confirmationSelector ||
      typeof root?.querySelectorAll !== "function") return false;
  const controls = [...root.querySelectorAll(
    `${confirmationSelector} :is(${FOCUSABLE_CONTROL_SELECTOR})`
  )].filter(isVisibleControl);
  if (controls.length === 0) return false;

  const first = controls[0];
  const last = controls.at(-1);
  const active = documentValue?.activeElement;
  let destination = null;
  if (!controls.includes(active)) destination = event.shiftKey ? last : first;
  else if (event.shiftKey && active === first) destination = last;
  else if (!event.shiftKey && active === last) destination = first;
  if (!destination) return false;

  destination.focus?.({ preventScroll: true });
  event.preventDefault?.();
  return true;
}
