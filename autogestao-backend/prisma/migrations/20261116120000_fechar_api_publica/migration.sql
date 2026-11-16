-- Segurança: o AutoGestão acessa o banco só pelo backend (Prisma).
-- A API pública do Supabase (chaves "anon" e "authenticated") não é usada pelo sistema,
-- então fica fechada: RLS ligado em todas as tabelas, sem nenhuma política,
-- e nenhuma permissão para essas chaves.
-- O backend não é afetado: ele conecta como dono das tabelas, que ignora o RLS.
--
-- Tabela nova em migração futura: termine a migração com
--   ALTER TABLE "nome_da_tabela" ENABLE ROW LEVEL SECURITY;
-- (o teste test/seguranca-banco.test.cjs avisa se alguma ficar de fora)
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;

  -- Esses papéis só existem no Supabase (em banco local/de teste este bloco é pulado)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    -- Tabelas criadas no futuro também nascem sem permissão para a API pública
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
