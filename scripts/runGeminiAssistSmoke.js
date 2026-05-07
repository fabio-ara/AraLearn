import { runGeminiAssist } from "../src/assist/geminiAssist.js";

const apiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_AI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const prompts = [
  "explique os comandos git init, git add, git commit e git push",
  "explique a diferença entre modelos incremental e iterativo, no contexto da engenharia de software",
  "diferencie missão, visão e valores, no contexto de administração de empresas",
  "monte um fluxograma para decidir se um número inteiro é par ou ímpar",
  "explique ponteiros em linguagem C para quem conhece variáveis comuns",
  "explique modus ponens em lógica proposicional com uma tabela verdade pequena",
  "explique ls, cd, mkdir e chmod no shell Linux"
];

function fail(message) {
  throw new Error(message);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getCardKind(card) {
  if (card?.ask) return "ask";
  if (card?.code) return "code";
  if (card?.table) return "table";
  if (card?.flow) return "flow";
  if (card?.tree) return "tree";
  return "say";
}

function getCardBody(card) {
  if (card?.say) return card.say;
  if (card?.ask) return card.ask;
  if (card?.code) return card.code;
  if (card?.table) return JSON.stringify(card.table);
  if (card?.flow) return JSON.stringify(card.flow);
  if (card?.tree) return JSON.stringify(card.tree);
  return "";
}

function assessMicrosequence(result) {
  const issues = [];
  const cards = Array.isArray(result?.cards) ? result.cards : [];
  if (cards.length < 3 || cards.length > 5) {
    issues.push(`quantidade inválida de cards: ${cards.length}`);
  }

  const kinds = new Set(cards.map(getCardKind));
  if (kinds.size < 2) {
    issues.push("variedade insuficiente de contêineres");
  }

  cards.forEach((card, index) => {
    const body = normalizeText(getCardBody(card));
    if (!normalizeText(card?.title)) {
      issues.push(`card ${index + 1} sem título`);
    }
    if (body.length < 20) {
      issues.push(`card ${index + 1} com conteúdo insuficiente`);
    }
    if (/Resposta correta|Distrator \d|complete o exemplo/i.test(body)) {
      issues.push(`card ${index + 1} parece genérico demais`);
    }
    if (card?.ask && (!normalizeText(card.answer) || !Array.isArray(card.wrong) || card.wrong.length < 2)) {
      issues.push(`card ${index + 1} tem múltipla escolha incompleta`);
    }
  });

  return issues;
}

function summarizeMicrosequence(result) {
  const cards = Array.isArray(result?.cards) ? result.cards : [];
  return [
    `Título: ${result.microsequenceTitle}`,
    `Tags: ${(result.tags || []).join(", ") || "sem tags"}`,
    ...cards.map((card, index) => {
      const kind = getCardKind(card);
      const body = normalizeText(getCardBody(card)).replace(/\s+/g, " ");
      return `${index + 1}. ${kind} · ${card.title || "Card"} · ${body.slice(0, 120)}`;
    })
  ].join("\n");
}

if (!apiKey) {
  fail(
    "Defina GEMINI_API_KEY, GOOGLE_API_KEY ou GOOGLE_AI_API_KEY no ambiente antes de rodar este teste."
  );
}

let failures = 0;

for (const promptText of prompts) {
  console.log(`\n## Pedido\n${promptText}`);
  try {
    const result = await runGeminiAssist({
      apiKey,
      model,
      mode: "compose-microsequence",
      microsequence: { title: "Gerador", tags: [], cards: [] },
      promptText
    });
    const issues = assessMicrosequence(result);
    console.log(summarizeMicrosequence(result));
    if (issues.length) {
      failures += 1;
      console.log(`Problemas: ${issues.join("; ")}`);
    } else {
      console.log("Resultado: aceitável");
    }
  } catch (error) {
    failures += 1;
    console.log(`Falha: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures) {
  process.exitCode = 1;
  console.log(`\n${failures} pedido(s) precisam de ajuste.`);
} else {
  console.log("\nTodos os pedidos produziram microssequências aceitáveis pelos critérios automáticos.");
}
