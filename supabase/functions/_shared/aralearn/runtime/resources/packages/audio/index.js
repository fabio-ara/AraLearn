import { escapePackageAttribute, renderPackageLiteral, renderPackageActionIcon } from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";
import { COURSE_AUDIO_MEDIA_TYPES, COURSE_MEDIA_MAX_BYTES, normalizeCourseMediaReference } from "../../../domain/courseMedia.js";
import { bindAudioTool } from "./interaction.js";

const alternative = { type: "object", additionalProperties: false, required: ["text", "visibility"], properties: {
  text: { type: "string", minLength: 1, maxLength: 20000 },
  reading: { type: "string", minLength: 1, maxLength: 20000 },
  translation: { type: "string", minLength: 1, maxLength: 20000 },
  visibility: { enum: ["always", "on_request", "after_response"] }
} };
const shared = { id: { type: "string", minLength: 1, maxLength: 240 },
  label: { type: "string", minLength: 1, maxLength: 300 },
  locale: { type: "string", minLength: 2, maxLength: 63 }, alternative };
const text = value => String(value ?? "");
const canReveal = (track, options) => track.alternative.visibility === "always" ||
  options.manualEditing === true || options.revealPracticeAnswers === true ||
  track.alternative.visibility === "after_response" && options.canRevealAnswers === true;

export const audioPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.audio", version: "1.0.0", label: "Áudio",
    purpose: "Escutar e comparar falas ou gravações quando o som participa da aprendizagem.",
    slots: ["content"], tool: { label: "Áudio", icon: "audio" },
    taskOperations: ["listen", "compare-pronunciation", "identify-sound", "listen-and-respond"],
    academic: academicProfile({ domains: ["linguagens", "música", "comunicação"],
      knowledgeObjects: ["fala", "pronúncia", "contraste sonoro", "gravação"],
      conventions: ["faixas identificadas", "idioma explícito", "alternativa textual com condição de apresentação"],
      appropriateWhen: ["o som fornece informação necessária à tarefa"],
      avoidWhen: ["ler a prosa oferece toda a informação necessária"],
      technologies: ["Web Speech API", "HTML Audio", "Storage privado"],
      practiceModes: ["exposition", "selection", "typing"] }),
    limitations: ["Voz nativa depende do dispositivo e não gera arquivo exportável.",
      "Arquivo precisa estar autorizado e disponível no dispositivo.",
      "Síntese remota só ocorre por escolha explícita do proprietário antes da materialização."],
    accessibility: "Faixas têm nome e idioma; transcrição ou alternativa obedece à condição declarada, sem antecipar resposta auditiva."
  }),
  authoringContract: Object.freeze({
    intent: "Ofereça faixas identificadas e oriente a tarefa no texto da unidade. Para materializar ou publicar, use gravação já verificada e guardada no curso; voz nativa é apenas ensaio dependente do dispositivo.",
    required: ["tracks"], optional: [],
    rules: ["Cada faixa tem identidade e idioma BCP47.", "Arquivo usa referência lógica conferida pelo AraLearn, nunca URL.",
      "Para exercício auditivo, apresente a alternativa após a resposta ou por escolha explícita.",
      "Não coloque a resposta no nome da faixa.", "Até 32 faixas por pacote; não corte o conteúdo para caber numa faixa.",
      "Leitura/transliteração (alternative.reading) e tradução (alternative.translation) são textos separados e seguem a mesma condição de revelação da alternativa.",
      "Se não conseguir produzir a voz requerida, forneça um arquivo próprio ou ajuste a estratégia antes de publicar. Nunca invente um contentHash."],
    example: { tracks: [{ id: "greeting", label: "Saudação em inglês", locale: "en-US", kind: "file",
      media: { contentHash: "2884adedf324fda1a7a2ad4cdf4d34df27e998d3a89d7cbf7f7001ca9b5aa0d6", byteSize: 133416, mediaType: "audio/wav" },
      alternative: { text: "Good morning. How are you?", visibility: "on_request" } }] }
  }),
  schema: Object.freeze({ type: "object", additionalProperties: false, required: ["tracks"], properties: {
    tracks: { type: "array", minItems: 1, maxItems: 32, items: { oneOf: [
      { type: "object", additionalProperties: false, required: ["id", "label", "locale", "kind", "text", "alternative"],
        properties: { ...shared, kind: { const: "native" }, text: { type: "string", minLength: 1, maxLength: 16000 } } },
      { type: "object", additionalProperties: false, required: ["id", "label", "locale", "kind", "media", "alternative"],
        properties: { ...shared, kind: { const: "file" }, media: { type: "object", additionalProperties: false,
          required: ["contentHash", "byteSize", "mediaType"], properties: {
            contentHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
            byteSize: { type: "integer", minimum: 1, maximum: COURSE_MEDIA_MAX_BYTES },
            mediaType: { enum: [...COURSE_AUDIO_MEDIA_TYPES] }
          } } } }
    ] } }
  } }),
  normalize(data) {
    return { tracks: (data?.tracks || []).map(track => ({
      id: text(track.id).trim(), label: text(track.label).trim(), locale: text(track.locale).trim(), kind: track.kind,
      ...(track.kind === "native" ? { text: text(track.text) } : { media: normalizeCourseMediaReference(track.media) }),
      alternative: { text: text(track.alternative?.text), visibility: track.alternative?.visibility,
        ...(track.alternative?.reading ? { reading: text(track.alternative.reading) } : {}),
        ...(track.alternative?.translation ? { translation: text(track.alternative.translation) } : {}) }
    })) };
  },
  validate(data) {
    const errors = [];
    const ids = new Set();
    for (const track of data.tracks || []) {
      if (ids.has(track.id)) errors.push("Faixas precisam de identidades distintas.");
      ids.add(track.id);
      if (!track.id.trim() || !track.label.trim() || !track.alternative.text.trim() ||
          track.kind === "native" && !track.text.trim()) errors.push("Identificação e conteúdo da faixa não podem ficar vazios.");
      if ([...track.id].some(character => { const point = character.codePointAt(0); return point <= 31 || point >= 127 && point <= 159; })) errors.push("Identidade de faixa inválida.");
      try { if (!Intl.getCanonicalLocales(track.locale).length) throw new Error(); }
      catch { errors.push("A faixa precisa de um idioma BCP47 válido."); }
      if (track.kind === "file") {
        try { normalizeCourseMediaReference(track.media); } catch { errors.push("Referência de arquivo de áudio inválida."); }
      }
    }
    return errors;
  },
  render(data, options = {}) {
    return '<section class="runtime-block package-audio-tool"><p data-audio-configuration-status role="status">Preparando áudio…</p>' +
      `<button type="button" class="icon-ghost" data-audio-action="retry-configuration" aria-label="Consultar configuração novamente" title="Consultar configuração novamente" hidden>${renderPackageActionIcon("retry")}</button>` +
      '<ol class="package-audio-tracks">' + data.tracks.map(track =>
        `<li data-audio-track="${escapePackageAttribute(track.id)}" lang="${escapePackageAttribute(track.locale)}" dir="auto">` +
        `<header class="package-audio-heading"><h3>${renderPackageLiteral(track.label)}</h3>` +
        `<div class="package-audio-controls"><button class="icon-ghost" type="button" data-audio-action="play" disabled title="Reproduzir" aria-label="${escapePackageAttribute(`Reproduzir ${track.label}`)}">${renderPackageActionIcon("play")}</button>` +
        `<button class="icon-ghost" type="button" data-audio-action="stop" disabled title="Parar" aria-label="${escapePackageAttribute(`Parar ${track.label}`)}">${renderPackageActionIcon("stop")}</button></div></header>` +
        (track.kind === "native" ? '<label class="package-audio-remote-consent" hidden><input type="checkbox" data-audio-remote-consent><span></span></label>' : "") +
        (track.kind === "file" ? '<audio preload="none" hidden></audio>' : "") +
        `<div class="package-audio-timeline"><input type="range" data-audio-progress min="0" max="1" step="0.01" value="0" disabled aria-label="${escapePackageAttribute(`Posição em ${track.label}`)}"><span class="package-audio-time"><span data-audio-elapsed>0:00</span> / <span data-audio-duration>duração desconhecida</span></span></div>` +
        '<p data-audio-track-status role="status"></p>' +
        (options.manualEditing && track.kind === "native" ? `<p class="package-audio-script">${renderPackageLiteral(track.text)}</p>` : "") +
        (canReveal(track, options) ? `<div class="package-audio-alternative"><p>${renderPackageLiteral(track.alternative.text)}</p>${track.alternative.reading ? `<p class="package-audio-reading">${renderPackageLiteral(track.alternative.reading)}</p>` : ""}${track.alternative.translation ? `<p class="package-audio-translation">${renderPackageLiteral(track.alternative.translation)}</p>` : ""}</div>` :
          track.alternative.visibility === "on_request" ? `<button class="icon-ghost" type="button" data-audio-action="show-alternative" title="Mostrar alternativa textual" aria-label="Mostrar alternativa textual">${renderPackageActionIcon("transcript")}</button><div data-audio-alternative></div>` :
            '<p data-audio-alternative>Alternativa textual disponível após responder.</p>') + "</li>"
      ).join("") + "</ol></section>";
  },
  accessibleText(data) {
    return data.tracks.map(track => `${track.label}. Idioma ${track.locale}. ${track.alternative.visibility === "always"
      ? [track.alternative.text, track.alternative.reading, track.alternative.translation].filter(Boolean).join(" ")
      : track.alternative.visibility === "on_request" ? "Alternativa textual por escolha." : "Alternativa textual após responder."}`).join(" ");
  },
  editableTargets(data) {
    return data.tracks.flatMap((track, index) => [
      { path: `tracks[${index}].label`, label: `Editar nome da faixa ${index + 1}` },
      ...(track.kind === "native" ? [{ path: `tracks[${index}].text`, label: `Editar fala ${index + 1}`, preserveWhitespace: true }] : []),
      { path: `tracks[${index}].alternative.text`, label: `Editar alternativa ${index + 1}`, preserveWhitespace: true },
      ...(track.alternative.reading ? [{ path: `tracks[${index}].alternative.reading`, label: `Editar leitura ${index + 1}` }] : []),
      ...(track.alternative.translation ? [{ path: `tracks[${index}].alternative.translation`, label: `Editar tradução ${index + 1}` }] : [])
    ]);
  },
  practiceTargets() { return []; },
  toolInteraction: Object.freeze({ bind: bindAudioTool })
});
