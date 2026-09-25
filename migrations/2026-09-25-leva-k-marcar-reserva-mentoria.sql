-- ============================================================
-- LEVA K: marcar reserva de HIPRO como mentoria
--
-- CONTEXTO
-- event_type já serve dois papéis ao mesmo tempo: "qual equipamento
-- está reservado" (hipro_1/hipro_2, usado pela constraint
-- no_equipment_double_booking e por toda tela que filtra por
-- equipamento) e "que tipo de uso é esse" (mentoria/outros, sem
-- equipamento vinculado). Isso trava o usuário: reservar uma data de
-- HIPRO de verdade (com equipment_id, protegido contra
-- duplo-agendamento) e ao mesmo tempo marcar "isso aqui é mentoria,
-- não locação de cliente" não é possível hoje, porque os dois usam o
-- mesmo campo.
--
-- O QUE ESTA LEVA FAZ
-- Adiciona is_mentoria, independente de event_type. Uma reserva de
-- HIPRO 1/HIPRO 2 continua sendo hipro_1/hipro_2 (mantém a proteção de
-- agenda e todo filtro por equipamento), e is_mentoria=true liga o
-- destaque visual (cor/etiqueta "Mentoria") que já existe hoje para o
-- event_type 'mentoria' avulso. Nenhuma trava, nenhuma constraint nova
-- na agenda em si — continua sendo só um marcador na pré-reserva.
--
-- Financeiro: ao contrário do que essa leva assumiu na primeira versão,
-- mentoria TEM cobrança (por paciente modelo — ver leva M para os
-- valores e leva N para o cálculo). is_mentoria não gera nada sozinho
-- na criação da "Reservar HIPRO Day" (isso continua igual: só trava a
-- data, sem transação), mas é lido por finalize_rental_reservation
-- (leva N) na hora de finalizar, para categorizar o lançamento como
-- "Mentoria" em vez de "Locação".
-- ============================================================

alter table public.calendar_events add column if not exists is_mentoria boolean not null default false;

comment on column public.calendar_events.is_mentoria is
  'true = esta reserva de equipamento (hipro_1/hipro_2) é para mentoria, não para locação de cliente. Não muda event_type nem a proteção contra duplo-agendamento; na "Reservar HIPRO Day" só é um marcador (sem transação ainda), mas finalize_rental_reservation (leva N) usa este campo para categorizar e calcular a cobrança por paciente modelo ao finalizar.';
