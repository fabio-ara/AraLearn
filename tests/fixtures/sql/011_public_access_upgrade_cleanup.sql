-- Lista literal do ensaio; não selecionar por prefixo nem apagar outros registros.
begin;
delete from public.courses where id in ('92000000-0000-4000-8000-000000000101','92000000-0000-4000-8000-000000000102');
delete from auth.users where id in ('92000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000002');
commit;
