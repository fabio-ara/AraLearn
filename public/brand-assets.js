(() => {
  const legacyMark = "assets/brand/aralearn-mark.png";
  const monochromeMark = "assets/brand/aralearn-mark-monochrome.svg";

  function updateMarks(root) {
    if (!(root instanceof Element || root instanceof Document)) return;
    const marks = root.matches?.(`img[src="${legacyMark}"]`)
      ? [root]
      : root.querySelectorAll?.(`img[src="${legacyMark}"]`) || [];
    for (const mark of marks) {
      mark.setAttribute("src", monochromeMark);
    }
  }

  updateMarks(document);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) updateMarks(node);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
