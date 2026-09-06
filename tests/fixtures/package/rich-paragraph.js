export const richParagraphData = {
  format: "rich", languageTag: "pt-BR", textDirection: "ltr",
  blocks: [
    { kind: "paragraph", inlines: [
      { kind: "text", text: "Uma razão compara duas grandezas. Em " },
      { kind: "math", notation: "mathematics", accessibleText: "três dividido por quatro", expression: {
        type: "fraction", numerator: { type: "number", value: "3" }, denominator: { type: "number", value: "4" }
      } },
      { kind: "text", text: ", três partes correspondem a um total de quatro partes iguais. A escrita 0,75 representa a mesma quantidade." }
    ] },
    { kind: "math", notation: "mathematics", accessibleText: "A soma de um meio e um quarto é três quartos.", expression: {
      type: "row", children: [
        { type: "fraction", numerator: { type: "number", value: "1" }, denominator: { type: "number", value: "2" } },
        { type: "operator", value: "+" },
        { type: "fraction", numerator: { type: "number", value: "1" }, denominator: { type: "number", value: "4" } },
        { type: "operator", value: "=" },
        { type: "fraction", numerator: { type: "number", value: "3" }, denominator: { type: "number", value: "4" } }
      ]
    } },
    { kind: "paragraph", languageTag: "zh-Hans", inlines: [
      { kind: "ruby", base: "学习", reading: "xuéxí" },
      { kind: "text", text: "：学而时习之，不亦说乎？" }
    ] },
    { kind: "paragraph", languageTag: "ja", inlines: [
      { kind: "ruby", base: "学校", reading: "がっこう" },
      { kind: "text", text: "で日本語を学びます。" }
    ] },
    { kind: "paragraph", inlines: [
      { kind: "text", text: "Compare ação, órgão, avó e avô; IPA: [ɐ̃], /ʁ/, /tʃ/. Preserve as diferenças entre sílabas e sinais." }
    ] },
    { kind: "paragraph", languageTag: "ar", textDirection: "rtl", inlines: [
      { kind: "text", text: "قارن النسبة " },
      { kind: "text", text: "3/4 = 0.75", languageTag: "en", textDirection: "ltr" },
      { kind: "text", text: " مع الكمية الكاملة؛ اتجاه النص لا يغيّر مقدارها." }
    ] },
    { kind: "paragraph", inlines: [
      { kind: "text", text: "A notação literal `x + y` conserva os símbolos. HTML como <script>alert(1)</script> aqui é texto de exemplo, sem execução." }
    ] }
  ]
};

export const richParagraphInstance = {
  id: "rich-explanation", package: "aralearn.resource.paragraph", version: "1.0.0", data: richParagraphData
};

export const richParagraphStudyUnit = {
  id: "rich-notation", position: 1, title: "Prosa, notação e escrita", role: "theory",
  content: [richParagraphInstance], response: null, feedback: [], topics: []
};
