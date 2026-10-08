export class AuthoringApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "AuthoringApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Enum FECHADO e explícito dos nomes de RPC que o adapter chama pelo helper
// `rpc()`. É a fonte única do vocabulário: adapter e handler MCP usam
// `closedAuthoringRpcName`, sem listas divergentes. Um nome com forma válida mas
// fora desta lista vira null ('segredo_do_curso_abc' não passa). A lista é mantida
// neste arquivo — não é gerada em build — e deve ser atualizada ao adicionar ou
// renomear um `rpc(...)`, no adapter ou em quem chama `adapter.rpc(...)`; os testes
// focais exercitam alguns desses nomes, não a lista inteira.
const AUTHORING_RPC_NAMES = new Set([
  "apply_course_authoring_profile_for_actor_v1",
  "apply_course_design_command_for_actor_v3",
  "approve_authoring_action_oauth_authorization_v4",
  "approve_course_curricular_map_for_actor_v1",
  "authorize_current_orphan_removal_for_actor_v1",
  "cancel_course_source_pdf_ingestion_for_actor_v1",
  "claim_course_media_delete_for_actor_v1",
  "claim_course_source_pdf_delete_for_actor_v1",
  "claim_pending_course_pdf_delete_for_actor_v1",
  "claim_pending_course_source_pdf_delete_for_source_for_actor_v1",
  "commit_course_composition_for_actor_v1",
  "commit_course_observation_corrections_for_actor_v1",
  "complete_course_media_delete_for_actor_v1",
  "complete_course_source_pdf_delete_for_actor_v1",
  "complete_current_orphan_removal_for_actor_v1",
  "confirm_course_observation_correction_for_actor_v1",
  "copy_course_for_actor_v1",
  "create_authoring_action_oauth_authorization_v4",
  "create_authoring_action_oauth_client_setup_v4",
  "create_course_anchored_annotations_for_actor_v1",
  "create_course_for_actor_v1",
  "delete_authoring_profile_for_actor_v1",
  "deny_authoring_action_oauth_authorization_v4",
  "exchange_authoring_action_oauth_code_v4",
  "exchange_authoring_action_oauth_refresh_v4",
  "execute_course_anchored_annotation_command_for_actor_v1",
  "execute_course_media_for_actor_v1",
  "execute_course_source_bundle_for_actor_v1",
  "execute_course_source_command_for_actor_v1",
  "get_authoring_action_oauth_authorization_v4",
  "get_authoring_process_preferences_for_actor_v1",
  "get_course_ai_inspection_for_actor_v1",
  "get_course_ai_inspection_receipt_for_actor_v1",
  "get_course_change_receipt_for_actor_v1",
  "get_course_content_review_for_actor_v1",
  "get_course_explanation_media_download_for_actor_v1",
  "get_course_media_download_for_actor_v1",
  "get_course_media_for_actor_v1",
  "get_course_observation_comparison_for_actor_v1",
  "get_course_observation_correction_for_actor_v1",
  "get_course_source_pdf_download_for_actor_v1",
  "get_course_source_pdf_ingestion_receipt_for_actor_v1",
  "get_current_maintenance_for_actor_v1",
  "get_owned_course_anchored_annotations_for_actor_v1",
  "get_owned_course_authoring_analytics_for_actor_v4",
  "get_owned_course_curricular_map_for_actor_v1",
  "get_owned_course_design_for_actor_v3",
  "get_owned_course_for_actor_v1",
  "get_owned_course_instructional_plan_for_actor_v4",
  "get_owned_course_sources_for_actor_v1",
  "get_person_profile_for_actor_v2",
  "ingest_course_source_pdf_for_actor_v1",
  "link_authoring_action_oauth_client_v4",
  "list_authoring_profiles_for_actor_v1",
  "list_copyable_courses_for_actor_v1",
  "list_course_access_for_actor_v3",
  "list_owned_course_entities_for_actor_v1",
  "list_owned_course_study_units_for_actor_v2",
  "list_owned_courses_for_actor_v1",
  "maintain_course_for_actor_v1",
  "manage_course_access_for_actor_v3",
  "materialize_course_authoring_part_for_actor_v2",
  "mutate_course_structure_for_actor_v1",
  "prepare_course_audio_for_actor_v1",
  "prepare_course_source_pdf_ingestion_for_actor_v1",
  "preview_course_authoring_profile_for_actor_v1",
  "record_course_ai_inspection_for_actor_v1",
  "recover_owned_course_copy_for_actor_v1",
  "remove_course_source_pdf_for_actor_v1",
  "reorder_course_study_units_for_actor_v1",
  "resolve_authoring_action_oauth_principal_v4",
  "resolve_mcp_oauth_principal_v1",
  "run_current_retention_for_actor_v1",
  "save_authoring_process_preferences_for_actor_v1",
  "save_authoring_profile_for_actor_v1",
  "save_course_authoring_part_for_actor_v1",
  "save_course_curricular_map_for_actor_v1",
  "search_course_access_people_for_actor_v1",
  "set_course_content_review_for_actor_v1",
  "set_course_content_review_policy_for_actor_v1",
  "set_course_source_file_access_for_actor_v1",
  "set_course_visibility_for_actor_v1",
  "update_person_profile_for_actor_v2"
]);

export function closedAuthoringRpcName(value) {
  try {
    return typeof value === "string" && AUTHORING_RPC_NAMES.has(value) ? value : null;
  } catch {
    return null;
  }
}

// Diagnóstico interno da dependência que falhou. Viaja na PRÓPRIA exceção, nunca
// em estado do adapter (que é compartilhado entre requisições concorrentes). É não
// enumerável: não aparece em JSON.stringify, spread nem no erro público, e existe
// só para o log fechado de diagnóstico. O caminho até o log relança a mesma
// instância (normalizeTaskError), sem re-embrulhar, então o campo sobrevive.
const DEPENDENCY_FIELD = "aralearnDependency";

export function withDependencyDiagnostic(error, dependency) {
  if (error && typeof error === "object" && dependency && typeof dependency === "object") {
    try {
      Object.defineProperty(error, DEPENDENCY_FIELD, {
        value: dependency,
        enumerable: false,
        writable: true,
        configurable: true
      });
    } catch {
      // O diagnóstico nunca pode derrubar a resposta da ferramenta.
    }
  }
  return error;
}

export function readDependencyDiagnostic(error) {
  // Leitura best-effort: um getter hostil não pode derrubar a resposta.
  try {
    const value = error && typeof error === "object" ? error[DEPENDENCY_FIELD] : null;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function asAuthoringApiError(error) {
  if (error instanceof AuthoringApiError) return error;
  return new AuthoringApiError(
    500,
    "internal_error",
    "A operação de autoria não pôde ser concluída."
  );
}

const UNCERTAIN_WRITE_CODES = new Set([
  "course_write_uncertain",
  "course_source_pdf_write_uncertain",
  "course_media_write_uncertain"
]);

const TRANSIENT_ERROR_CODES = new Set([
  "temporarily_unavailable",
  "service_timeout",
  "request_timeout",
  "network_error",
  "course_service_unavailable",
  "oauth_verification_unavailable"
]);

// Escrita incerta nunca é repetida às cegas: a orientação é reler o estado salvo.
// `internal_error` é falha inesperada, sem causa classificada, então também fica
// fora da repetição automática; repetir o mesmo pedido não é decisão segura.
export function authoringErrorIsRetryable(error) {
  const code = String(error?.code || "");
  if (UNCERTAIN_WRITE_CODES.has(code)) return false;
  if (code === "internal_error") return false;
  const status = Number(error?.status);
  if (status === 408 || status === 429 || status >= 500) return true;
  return TRANSIENT_ERROR_CODES.has(code);
}

// Separa indisponibilidade transitória, conflito de base, entrada inválida,
// recusa de autorização, escrita incerta e falha interna. A classe orienta o log
// de diagnóstico; não substitui o código estável apresentado ao cliente.
export function authoringErrorClass(error) {
  const code = String(error?.code || "");
  const status = Number(error?.status);
  if (UNCERTAIN_WRITE_CODES.has(code)) return "incerto";
  if (code === "internal_error") return "interno";
  if (authoringErrorIsRetryable(error)) return "transitorio";
  if (status === 409 || status === 412) return "conflito";
  if (status === 401 || status === 403) return "autorizacao";
  if (status === 400 || status === 422) return "entrada";
  return "definitivo";
}
