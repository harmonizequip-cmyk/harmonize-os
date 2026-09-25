-- ============================================================
-- ACERTO: parceiros, taxas que não serão cobradas, e o cadastro de teste
--
-- CONTEXTO
-- O acerto da C3c marcou como pendente todo agendamento futuro de
-- cliente não parceiro, seguindo a regra geral. Na conferência ficou
-- claro que nenhuma dessas 21 datas será cobrada: são reservas
-- anteriores à taxa existir, combinadas sem ela.
--
-- O QUE ESTE ARQUIVO FAZ
-- 1. Marca como parceiro quem reserva sem pagar taxa.
-- 2. Devolve para nao_aplica as taxas pendentes que não serão cobradas.
-- 3. Marca o cadastro de teste como teste, para ele sair dos números.
--
-- DAQUI PARA FRENTE
-- Reserva nova de cliente comum continua nascendo com taxa pendente,
-- que é a regra da casa. Reserva de parceiro nasce isenta sozinha, sem
-- ninguém precisar lembrar. Este arquivo acerta só o passado.
--
-- PODE RODAR MAIS DE UMA VEZ: tudo aqui é update condicional.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Parceiros
--
-- A busca é por trecho do nome (ilike) porque o cadastro pode ter
-- sufixo que não veio na conversa. O relatório no fim mostra quem foi
-- encontrado, e um padrão com zero acertos aparece ali para você
-- corrigir o nome em vez de descobrir pelo uso.
-- ------------------------------------------------------------
update public.clients c
   set parceiro = true
  from (values
    ('%CLAUDETE%'),
    ('%FERNANDA MAIA%'),
    ('%ROG_RIO URTIGA%'),   -- underline casa com o acento do Ê
    ('%MAYARA%INSTITUTO%'),
    ('%LASER DREAM%')
  ) as p(padrao)
 where c.name ilike p.padrao
   and c.parceiro is distinct from true;

-- ------------------------------------------------------------
-- 2) As taxas pendentes voltam para nao_aplica
--
-- Só mexe em pendente. Taxa paga continua paga, e taxa perdida continua
-- perdida: essas duas representam dinheiro que existiu de verdade, e
-- apagá-las tiraria receita do caixa.
-- ------------------------------------------------------------
update public.calendar_events
   set taxa_status = 'nao_aplica',
       taxa_valor = null
 where taxa_status = 'pendente';

-- ------------------------------------------------------------
-- 3) O cadastro de teste sai dos números
--
-- is_test = true esconde o registro de todas as telas e relatórios, sem
-- apagar nada: dá para voltar atrás. A marca desce para os
-- agendamentos, locações e lançamentos dele, senão o cliente sumiria
-- mas o dinheiro dele continuaria contando, que é pior do que não ter
-- feito nada.
-- ------------------------------------------------------------
update public.clients set is_test = true
 where name ilike '%EDER CAMPOS%' and is_test = false;

update public.calendar_events set is_test = true
 where client_id in (select id from public.clients where is_test)
   and is_test = false;

update public.rentals set is_test = true
 where client_id in (select id from public.clients where is_test)
   and is_test = false;

update public.transactions set is_test = true
 where (client_id in (select id from public.clients where is_test)
        or rental_id in (select id from public.rentals where is_test))
   and is_test = false;

commit;

-- ============================================================
-- CONFERÊNCIA
-- ============================================================
select 'PARCEIROS' as bloco, c.name as detalhe, '' as extra
  from public.clients c where c.parceiro
union all
select 'TESTE', c.name, ''
  from public.clients c where c.is_test
union all
select 'TAXAS', coalesce(ev.taxa_status, 'sem taxa'), count(*)::text
  from public.calendar_events ev
 where ev.equipment_id is not null and ev.status <> 'cancelada' and ev.is_test = false
 group by ev.taxa_status
union all
select 'CLIENTES ATIVOS', 'total que aparece nas telas', count(*)::text
  from public.clients where is_test = false
 order by 1, 2;
