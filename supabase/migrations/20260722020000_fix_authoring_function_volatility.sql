-- The functions consult auth/session state through require_service_role() and
-- authorization helpers.  PostgreSQL must not cache them as STABLE.
alter function public.get_authoring_run(uuid, uuid) volatile;
alter function public.get_authoring_run_summary(uuid, uuid) volatile;
alter function public.authoring_storage_diagnostics(uuid) volatile;
