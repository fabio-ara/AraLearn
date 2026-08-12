export function escapePackageHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapePackageAttribute(value) {
  return escapePackageHtml(value).replace(/\r?\n/g, "&#10;");
}

export function packageTextAttributes(value) {
  const languageTag = typeof value?.languageTag === "string" ? value.languageTag.trim() : "";
  const direction = ["auto", "ltr", "rtl"].includes(value?.textDirection)
    ? value.textDirection
    : "auto";
  return (languageTag ? ` lang="${escapePackageAttribute(languageTag)}"` : "") + ` dir="${direction}"`;
}

function renderInlineMarkup(value) {
  return escapePackageHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

export function renderPackageInline(value) {
  const segments = String(value || "").split("`");
  let inCode = false;
  let html = "";
  segments.forEach((segment, index) => {
    html += inCode ? escapePackageHtml(segment).replace(/\n/g, "<br>") : renderInlineMarkup(segment);
    if (index < segments.length - 1) {
      html += inCode ? "</code>" : "<code>";
      inCode = !inCode;
    }
  });
  return html + (inCode ? "</code>" : "");
}

export function renderPackageProse(value, metadata = {}) {
  const source = String(value || "").replace(/\r/g, "");
  const blocks = [];
  let paragraph = [];
  let activeList = null;
  const attrs = packageTextAttributes(metadata);
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p class="runtime-markdown-paragraph"${attrs}>${renderPackageInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!activeList) return;
    blocks.push(`<${activeList.tag} class="runtime-markdown-list"${attrs}>${activeList.items.map((item) => `<li${attrs}>${renderPackageInline(item)}</li>`).join("")}</${activeList.tag}>`);
    activeList = null;
  };
  source.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }
    const unordered = trimmed.match(/^[-*+]\s+(.+)$/u);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/u);
    const tag = unordered ? "ul" : ordered ? "ol" : "";
    if (tag) {
      flushParagraph();
      if (activeList?.tag !== tag) {
        flushList();
        activeList = { tag, items: [] };
      }
      activeList.items.push(unordered?.[1] || ordered?.[1] || "");
      return;
    }
    flushList();
    paragraph.push(trimmed);
  });
  flushParagraph();
  flushList();
  return blocks.join("") || `<p class="runtime-markdown-paragraph"${attrs}></p>`;
}
