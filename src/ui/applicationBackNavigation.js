export function dispatchApplicationBack({
  closeOverlay = () => false,
  returnToAuthoring = () => false,
  handleAuthoringBack = () => false,
  handleStudyBack = () => false
} = {}) {
  if (closeOverlay()) return "overlay";
  if (returnToAuthoring()) return "authoring-reader";
  if (handleAuthoringBack()) return "authoring";
  if (handleStudyBack()) return "study";
  return "exit";
}
