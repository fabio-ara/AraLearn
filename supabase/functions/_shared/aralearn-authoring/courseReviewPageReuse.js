// Reuso do recorte materializado de `preparar_revisao` entre fragmentos da MESMA
// página lógica.
//
// Um recorte auditado de 493.684 caracteres exige cerca de 42 fragmentos de 12.000
// caracteres. Sem reuso, cada fragmento reexecuta o fanout por alvo — revisão,
// inspeção e Fontes do mesmo material —, e o trabalho cresce com o número de
// fragmentos em vez de crescer com o recorte entregue.
//
// O que fica guardado é só o material caro de auditoria por alvo. A estrutura da
// página (plano e unidades) não é guardada: o seu resumo (`planDigest`,
// `unitPageDigest`) é conferido contra a releitura da própria requisição, que
// continua acontecendo em toda chamada. Assim, mudança de conteúdo é detectada mesmo
// quando nada incrementa a revisão do curso.
//
// Validade: o recorte só é reutilizado quando (1) o resumo do literal guardado é
// exatamente o que o cliente está continuando, (2) os resumos do plano e da página de
// unidades releem o mesmo estado materializado e (3) uma leitura fresca do Curso,
// após os digests, confirma a revisão e a versão corrente do conjunto de observações.
// O banco separa esse estado em duas versões
// independentes, e o comentário da coluna confirma a separação:
//   - `public.courses.revision` governa conteúdo, fontes, plano, revisão e inspeção;
//   - `public.courses.annotation_set_version` governa as observações, que por contrato
//     NÃO alteram a revisão do curso.
// O carimbo das duas é lido por uma leitura fresca do Curso depois dos digests, que
// valida a revisão e devolve a versão. Sem correspondência exata, o chamador volta ao caminho
// completo, que recompõe o literal do zero e deixa o 409 corrente decidir.
//
// O processo guarda um repositório por adapter. Cada ponto de entrada do produto cria o
// seu `CourseSupabaseAdapter` uma única vez por módulo, antes de servir; escopar por
// identidade do adapter mantém o reuso de produção e isola configurações e testes sem
// introduzir chave de inquilino nem token novo.
//
// O reuso entre chamadas é oportunista: warm start não é garantido. Perder o repositório
// (processo novo), não encontrar a entrada ou descartá-la por idade, teto de entradas ou
// teto de tamanho sempre leva ao caminho completo — nunca a conteúdo incompleto, e nunca
// a juntar trechos de estados diferentes.

import { AuthoringApiError } from './errors.js';

const MAX_ENTRIES = 6;
// Teto conservador da representação serializada retida. É um limite do que o processo
// guarda em JSON, não uma medida de heap.
const MAX_SERIALIZED_CHARACTERS = 12 * 1024 * 1024;
// Idade máxima como defesa em profundidade: as duas versões cobrem o estado observado
// nas leituras, e o limite restringe divergências que as leituras não vejam.
const MAX_AGE_MS = 15 * 60 * 1000;
const LEGITIMATE_STALE_READ_CODE = 'stale_course_state';

const repositories = new WeakMap();

function repositoryFor(adapter) {
  let repository = repositories.get(adapter);
  if (!repository) {
    repository = { pages: new Map(), characters: 0 };
    repositories.set(adapter, repository);
  }
  return repository;
}

function identityKey({ actorId, courseId, revision, queryHash, page }) {
  return [actorId, courseId, revision, queryHash, page ?? ""].join("\u0000");
}

function forget(repository, key) {
  const entry = repository.pages.get(key);
  if (!entry) return;
  repository.pages.delete(key);
  repository.characters -= entry.characters;
}

// Um recorte só volta se a identidade inteira (ator, curso, revisão, consulta e página)
// coincidir, se quem chama confirmar o estado corrente e se a versão do conjunto de
// observações confirmada for exatamente a do materializado. `claim` recebe a entrada
// guardada, confirma os resumos e as versões e devolve o recorte pronto para
// apresentação; null (ou versão divergente) significa caminho completo.
export async function reusedReviewPage(adapter, identity, claim) {
  const repository = repositoryFor(adapter);
  const key = identityKey(identity);
  const entry = repository.pages.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt >= MAX_AGE_MS) { forget(repository, key); return null; }
  const claimed = await claim(entry);
  if (!claimed || claimed.annotationSetVersion !== entry.annotationSetVersion) return null;
  // `claim` aguarda leitura: a entrada pode ter sido descartada ou substituída nesse
  // intervalo. Só a MESMA entrada ainda presente descreve o estado corrente; qualquer
  // outra coisa é ausência, e nada volta ao repositório por conta desta chamada.
  if (repository.pages.get(key) !== entry) return null;
  // Uso recente vai para o fim da ordem de inserção do Map (despejo do início).
  repository.pages.delete(key);
  repository.pages.set(key, entry);
  return claimed;
}

export function rememberReviewPage(adapter, identity, { annotationSetVersion, characters, digest, planDigest,
  unitPageDigest, record }) {
  const repository = repositoryFor(adapter);
  const key = identityKey(identity);
  forget(repository, key);
  if (!Number.isSafeInteger(characters) || characters <= 0) return;
  // Entrada que sozinha excede o teto serializado não é guardada: ela não seria servível
  // e despejar as vizinhas para caber não traria reuso nenhum.
  if (characters > MAX_SERIALIZED_CHARACTERS) return;
  repository.pages.set(key, { storedAt: Date.now(), annotationSetVersion, characters, digest,
    planDigest, unitPageDigest, record });
  repository.characters += characters;
  while (repository.pages.size > MAX_ENTRIES || repository.characters > MAX_SERIALIZED_CHARACTERS) {
    const oldest = repository.pages.keys().next().value;
    forget(repository, oldest);
    if (oldest === key) return;
  }
}

// O recorte recomposto pode divergir do que o cliente leu (409 corrente) ou a estrutura
// pode ter mudado; nesse caso a entrada guardada não descreve mais o estado corrente.
export function forgetReviewPage(adapter, identity) {
  forget(repositoryFor(adapter), identityKey(identity));
}

// A leitura estável do Curso valida novamente ACL/revisão e devolve a versão
// independente das observações sem executar a rotina de limpeza da lista.
// Resultado ausente ou incompatível impede o reuso; erro de dependência ou
// autorização mantém o tipo e propaga.
export async function readReviewPageStateStamp({ adapter, principal, courseId, revision,
  deadlineAt = null }) {
  if (typeof adapter?.getCourse !== "function") return null;
  try {
    const course = await adapter.getCourse({ principal, courseId, includeOutline: false, deadlineAt });
    if (course?.courseId !== courseId || !Number.isSafeInteger(course?.revision) ||
        course.revision !== revision) return null;
    const annotationSetVersion = course?.annotationSetVersion;
    if (!Number.isSafeInteger(annotationSetVersion) || annotationSetVersion < 0) return null;
    return annotationSetVersion;
  } catch (error) {
    // O CAS do Curso (40001/PT409) confirma que a revisão avançou: o caminho
    // completo recompõe e aplica a confirmação final de coerência. Demais falhas
    // mantêm o tipo e não podem virar cache miss dentro do mesmo pedido.
    if (error instanceof AuthoringApiError && error.code === LEGITIMATE_STALE_READ_CODE) return null;
    throw error;
  }
}

