const FOCUSABLE_CONTROL_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

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
  )];
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
