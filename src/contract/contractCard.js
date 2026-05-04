function fail(message) {
  throw new Error(message);
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  return value.trim();
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeStringArray(value, fieldName, { required = false } = {}) {
  if (value === undefined) {
    if (required) {
      fail(`Campo obrigatório inválido: "${fieldName}".`);
    }
    return [];
  }

  if (!Array.isArray(value) || !value.length) {
    fail(`Campo ${required ? "obrigatório" : "opcional"} inválido: "${fieldName}".`);
  }

  return value.map((item) => normalizeRequiredString(item, fieldName));
}

function normalizeTableRows(value) {
  if (!Array.isArray(value) || !value.length) {
    fail('Campo obrigatório inválido: "rows".');
  }

  return value.map((row) => {
    if (!Array.isArray(row) || !row.length) {
      fail('Campo obrigatório inválido: "rows".');
    }

    return row.map((cell) => normalizeRequiredString(cell, "rows"));
  });
}

function normalizeFlow(value) {
  if (!Array.isArray(value) || !value.length) {
    fail('Campo obrigatório inválido: "flow".');
  }

  return value.map((step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      fail('Campo obrigatório inválido: "flow".');
    }

    const entries = Object.entries(step);
    if (entries.length !== 1) {
      fail('Campo obrigatório inválido: "flow".');
    }

    const [kind, label] = entries[0];
    return {
      [normalizeRequiredString(kind, "flow.kind")]: normalizeRequiredString(label, "flow.label")
    };
  });
}

function withOptionalTitle(card, title) {
  return title ? { ...card, title } : card;
}

export function sanitizeContractCard(input, fallbackType = "text") {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("Card inválido.");
  }

  const type = normalizeRequiredString(input.type ?? fallbackType, "type");
  const key = normalizeOptionalString(input.key);
  const title = normalizeOptionalString(input.title);
  const baseCard = withOptionalTitle(
    {
      ...(key ? { key } : {}),
      type
    },
    title
  );

  if (type === "text") {
    return {
      ...baseCard,
      text: normalizeRequiredString(input.text, "text")
    };
  }

  if (type === "choice") {
    return {
      ...baseCard,
      ask: normalizeRequiredString(input.ask, "ask"),
      answer: normalizeStringArray(input.answer, "answer", { required: true }),
      wrong: normalizeStringArray(input.wrong, "wrong", { required: true })
    };
  }

  if (type === "complete") {
    return {
      ...baseCard,
      text: normalizeRequiredString(input.text, "text"),
      answer: normalizeStringArray(input.answer, "answer", { required: true }),
      wrong: normalizeStringArray(input.wrong, "wrong", { required: true })
    };
  }

  if (type === "editor") {
    const language = normalizeOptionalString(input.language);
    return {
      ...baseCard,
      code: normalizeRequiredString(input.code, "code"),
      ...(language ? { language } : {})
    };
  }

  if (type === "table") {
    return {
      ...baseCard,
      columns: normalizeStringArray(input.columns, "columns", { required: true }),
      rows: normalizeTableRows(input.rows)
    };
  }

  if (type === "flow") {
    return {
      ...baseCard,
      flow: normalizeFlow(input.flow)
    };
  }

  if (type === "image") {
    const alt = normalizeOptionalString(input.alt);
    return {
      ...baseCard,
      src: normalizeRequiredString(input.src, "src"),
      ...(alt ? { alt } : {})
    };
  }

  fail(`Tipo de card desconhecido: "${type}".`);
}

export function createStarterContractCard(type = "text") {
  if (type === "text") {
    return {
      type: "text",
      title: "Novo card",
      text: "Descreva a ideia central desta microssequência."
    };
  }

  if (type === "choice") {
    return {
      type: "choice",
      title: "Nova escolha",
      ask: "Qual alternativa é a mais adequada?",
      answer: ["Alternativa correta"],
      wrong: ["Distrator 1", "Distrator 2"]
    };
  }

  if (type === "complete") {
    return {
      type: "complete",
      title: "Completar",
      text: "Preencha o trecho [[correto]].",
      answer: ["correto"],
      wrong: ["incorreto", "parcial"]
    };
  }

  if (type === "editor") {
    return {
      type: "editor",
      title: "Trecho de código",
      language: "text",
      code: "console.log('AraLearn');"
    };
  }

  if (type === "table") {
    return {
      type: "table",
      title: "Tabela",
      columns: ["Coluna A", "Coluna B"],
      rows: [["Valor 1", "Valor 2"]]
    };
  }

  if (type === "flow") {
    return {
      type: "flow",
      title: "Fluxo",
      flow: [
        { start: "Início" },
        { process: "Etapa principal" },
        { end: "Fim" }
      ]
    };
  }

  if (type === "image") {
    return {
      type: "image",
      title: "Imagem",
      src: "public/example.png",
      alt: "Imagem de exemplo"
    };
  }

  fail(`Tipo de card desconhecido: "${type}".`);
}
