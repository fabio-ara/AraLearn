if (globalThis.top !== globalThis.self) {
  document.documentElement.hidden = true;
  document.documentElement.dataset.aralearnFramed = "blocked";
  try {
    globalThis.top.location.replace(globalThis.location.href);
  } catch {
    // Em iframe com navegação superior bloqueada, o documento permanece oculto.
  }
}
