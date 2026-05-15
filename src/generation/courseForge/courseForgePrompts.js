function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildCourseForgePrompt({
  role = "",
  sourcePack = "",
  policyPack = "",
  task = "",
  output = ""
} = {}) {
  return [
    `ROLE:\n${text(role)}`,
    `CONTENT RULE:\nUse somente SOURCE PACK como fonte de conteúdo.`,
    `SOURCE PACK:\n${text(sourcePack) || "(sem fontes adicionais)"}`,
    `POLICY PACK:\n${text(policyPack) || "Aluno leigo absoluto; sem vocabulário de bastidor."}`,
    `TASK:\n${text(task)}`,
    `OUTPUT:\n${text(output) || "Responda somente JSON válido."}`
  ].join("\n\n");
}
