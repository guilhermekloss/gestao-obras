-- Teto por sessão para o usuário do app: query presa não segura conexão do pool (5 por instância) e não
-- derruba as rotas rápidas em cascata. 15 s cobre as leituras analíticas (dashboard, Curva S/ABC); as
-- rápidas falham antes pelo pool_timeout (5 s) e pelo timeout das transações (5 s, src/lib/prisma.ts).
-- Vale para conexões novas. O job de migração usa o mesmo usuário: migração demorada começa com
-- `SET statement_timeout = 0;`.
ALTER ROLE CURRENT_USER SET statement_timeout = '15s';
ALTER ROLE CURRENT_USER SET lock_timeout = '5s';
ALTER ROLE CURRENT_USER SET idle_in_transaction_session_timeout = '15s';
