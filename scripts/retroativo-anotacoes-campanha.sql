-- Retroativo: anotações das campanhas já marcadas ANTES da migration
-- 2026-10-26-campanha-registra-anotacao.sql (correção de dados única, NÃO é migration).
-- Rodar DEPOIS dessa migration (precisa da origem 'campanha' no check).
-- Para cada envio com contato (enviado, respondeu, agendou, nao_quer; 'pulado' fica de fora)
-- grava em cliente_anotacoes o mesmo texto que registrar_envio_campanha grava hoje:
--   enviado:   «campanha»: mensagem enviada em dd/mm/aaaa às hh:mm (horário de Brasília). Texto enviado: <mensagem>
--   respondeu / agendou: também a linha "mensagem enviada" (se há hora de envio) + "respondeu." / "agendou."
--   nao_quer:  «campanha»: pediu para não receber campanhas.
-- created_at da anotação = momento real (enviado_em; sem ele, atualizado_em) para o histórico sair na ordem certa.
-- created_by = autor da campanha (campanhas.created_by), pois o envio não guarda autor.
-- Idempotente: não insere se a cliente já tem anotação origem 'campanha' com o mesmo texto.
-- Sem registrar_movimentacao de propósito: é histórico de algo que já foi registrado, não ação nova.

insert into public.cliente_anotacoes (client_id, texto, origem, created_by, created_at)
select x.client_id, x.texto, 'campanha', x.created_by, x.momento
from (
  select e.client_id, c.created_by,
         coalesce(e.enviado_em, e.atualizado_em) as momento,
         case when length(t) > 2000 then left(t, 1999) || '…' else t end as texto
  from public.campanha_envios e
  join public.campanhas c on c.id = e.campanha_id
  cross join lateral (
    -- linha do envio da mensagem
    select 'Campanha «' || c.nome || '»: mensagem enviada em '
           || to_char(coalesce(e.enviado_em, e.atualizado_em) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
           || ' às ' || to_char(coalesce(e.enviado_em, e.atualizado_em) at time zone 'America/Sao_Paulo', 'HH24:MI')
           || ' (horário de Brasília). Texto enviado: ' || coalesce(e.mensagem, '') as t
  ) env
  where e.status = 'enviado' or (e.status in ('respondeu', 'agendou') and e.enviado_em is not null)
  union all
  select e.client_id, c.created_by, e.atualizado_em,
         'Campanha «' || c.nome || '»: ' || case e.status
           when 'respondeu' then 'respondeu.'
           when 'agendou' then 'agendou.'
           else 'pediu para não receber campanhas.' end
  from public.campanha_envios e
  join public.campanhas c on c.id = e.campanha_id
  where e.status in ('respondeu', 'agendou', 'nao_quer')
) x
where not exists (
  select 1 from public.cliente_anotacoes a
  where a.client_id = x.client_id and a.origem = 'campanha' and a.texto = x.texto
)
order by x.momento;
