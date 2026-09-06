import { flattenCourseDocument } from "../../../src/domain/courseEntities.js";
import { wrapGeminiPcmAsWav } from "../../../src/generation/providers/geminiSpeechProvider.js";

export const AUDIO_COURSE_TITLE = "Escuta e cálculo — ensaio sintético";
export const AUDIO_UNIT_ID = "audio-synthetic-unit";
export const CALCULATOR_UNIT_ID = "calculator-synthetic-unit";
export const AUDIO_ALTERNATIVE = "Alternativa após responder: tom periódico constante de 440 Hz.";
export const audioStudyPath = (courseId, unitId = AUDIO_UNIT_ID) =>
  `/#/estudo/${courseId}/audio-synthetic-module/audio-synthetic-lesson/audio-synthetic-micro/${unitId}`;

export function createSyntheticWave({ frequency = 440, seconds = 1 } = {}) {
  const count = Math.round(24000 * seconds);
  const pcm = new Uint8Array(count * 2);
  const view = new DataView(pcm.buffer);
  for (let index = 0; index < count; index++) view.setInt16(index * 2,
    Math.round(Math.sin(index * 2 * Math.PI * frequency / 24000) * 1200), true);
  return wrapGeminiPcmAsWav(pcm);
}
// MPEG-1 Layer III: empty side information declares zero spectral coefficients.
// The browser integration test checks whether this synthetic silence decodes.
export function createSyntheticMp3() {
  const bytes = new Uint8Array(417 * 20);
  for (let frame = 0; frame < 20; frame++) bytes.set([255, 251, 144, 0], frame * 417);
  return bytes;
}
export function createAudioCourseRows(courseId, waveMedia, mp3Media) {
  const resource = (id, name, data) => ({ id, package: `aralearn.resource.${name}`, version: "1.0.0", data });
  const guide = { goal: "Conferir escuta, consulta e cálculo em uma sequência sintética.", include: [], exclude: [], notation: [], avoid: [] };
  const units = [{ id: AUDIO_UNIT_ID, position: 1, title: "Escuta, escrita chinesa e pinyin", role: "practice", topics: [],
    content: [resource("audio-prose", "paragraph", { format: "rich", languageTag: "pt-BR", textDirection: "ltr", blocks: [
      { kind: "paragraph", inlines: [{ kind: "text", text: "As faixas separam a fala em chinês dos sinais sintéticos de calibração. Abra a ferramenta para escolher o som que deseja escutar." }] },
      { kind: "paragraph", languageTag: "zh-Hans", inlines: [{ kind: "ruby", base: "木", reading: "mù" }, { kind: "text", text: "表示树。两个木组成" }, { kind: "ruby", base: "林", reading: "lín" }, { kind: "text", text: "。" }] }
    ] }), resource("audio-tracks", "audio", { tracks: [
      { id: "native-chinese", label: "Fala em chinês", locale: "zh-CN", kind: "native", text: "木表示树。两个木组成林。", alternative: { text: "木 representa árvore; dois 木 formam 林.", visibility: "on_request" } },
      { id: "tone-wave", label: "Sinal de calibração WAV", locale: "pt-BR", kind: "file", media: waveMedia, alternative: { text: AUDIO_ALTERNATIVE, visibility: "after_response" } },
      { id: "silence-mp3", label: "Silêncio de calibração MP3", locale: "pt-BR", kind: "file", media: mp3Media, alternative: { text: "Trecho sintético sem som, usado para verificar a leitura do formato MP3.", visibility: "always" } }
    ] }), resource("grammar-consultation", "grammar", { title: "Duas consultas sobre a frase", items: [
      { id: "grammar-composition", label: "Composição da frase", languageTag: "zh-Hans", description: "Recurso sintético de apoio à análise da ordem.", target: { kind: "url", url: "https://example.test/grammar/order" } },
      { id: "grammar-classifier", label: "Numeral e classificador", languageTag: "zh-Hans", description: "Recurso sintético de apoio à leitura de 两个.", target: { kind: "url", url: "https://example.test/grammar/classifier" } }
    ] })], response: { id: "audio-response", package: "aralearn.response.choice", version: "1.0.0", data: {
      question: "Como varia a altura do sinal de calibração WAV?", selectionMode: "single", selectionCriterion: "correct",
      options: [{ id: "constant", text: "A altura permanece constante." }, { id: "changing", text: "A altura sobe continuamente." }], answerIds: ["constant"]
    } }, feedback: [resource("tone-explanation", "paragraph", { text: "O sinal sintético mantém a frequência de 440 Hz. A altura constante contrasta com um sinal cuja frequência varia continuamente. A alternativa textual da faixa pode agora ser consultada." })] },
  { id: CALCULATOR_UNIT_ID, position: 2, title: "Fórmula e apoio ao cálculo", role: "theory", topics: [], response: null, feedback: [], content: [
    resource("formula-prose", "paragraph", { text: "Estime a diagonal de um retângulo com lados 3 e 4. A calculadora permite conferir a raiz da soma dos quadrados." }),
    resource("formula-expression", "formula", { notation: "mathematics", accessibleText: "A raiz quadrada da soma de três ao quadrado e quatro ao quadrado.", expression: {
      type: "root", radicand: { type: "row", children: [
        { type: "superscript", base: { type: "number", value: "3" }, exponent: { type: "number", value: "2" } },
        { type: "operator", value: "+" }, { type: "superscript", base: { type: "number", value: "4" }, exponent: { type: "number", value: "2" } }
      ] }
    } }), resource("calculator-tool", "calculator", { title: "Conferir a estimativa", angleUnit: "radians", initialExpression: "sqrt(3^2+4^2)" })
  ] }];
  return flattenCourseDocument({ contract: "aralearn.course.v1", courses: [{ id: courseId, title: AUDIO_COURSE_TITLE, goal: guide.goal,
    modules: [{ id: "audio-synthetic-module", title: "Recursos para estudar", guide, lessons: [{ id: "audio-synthetic-lesson", title: "Escuta e cálculo", guide, topics: [],
      microsequences: [{ id: "audio-synthetic-micro", title: "Som, escrita e expressão", goal: guide.goal, role: "explain", dependsOn: [], covers: [], checks: [], errors: [], studyUnits: units }]
    }] }] }] }).rows;
}
