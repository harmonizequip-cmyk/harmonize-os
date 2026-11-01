// Termo de consentimento esclarecido do HIPRO, mostrado ao paciente em
// "Colher assinaturas" antes de ele assinar (caixinha "Li e concordo").
// Baseado no e-book do HIPRO (cap. 8, 23 e 24). O texto fica aqui para o
// dono aprovar ou editar: ao mudar o texto, suba TERMO_VERSAO, porque cada
// assinatura guarda a versão e o texto que o paciente leu (triagem da
// assinatura, assinaturas_sessao.triagem).

export const TERMO_VERSAO = "2026-11-01";

export const TERMO_TITULO = "Termo de consentimento esclarecido";

/** Parágrafos do termo, na ordem em que aparecem na tela. */
export const TERMO_PARAGRAFOS: readonly string[] = [
  "Fui informado(a) de que o ultrassom microfocado (HIPRO) produz um efeito de lifting biológico progressivo: a pele firma aos poucos, com melhora perceptível entre 30 e 60 dias e pico de consolidação entre 90 e 180 dias. Não é um facelift cirúrgico e o resultado varia de pessoa para pessoa.",
  "Sei que são esperados efeitos leves e passageiros, como vermelhidão (algumas horas), inchaço leve (1 a 3 dias) e sensibilidade ao toque (2 a 7 dias). Mais raramente podem ocorrer manchas roxas, formigamento passageiro ou queimadura superficial.",
  "Declarei com verdade minhas condições de saúde, medicamentos e procedimentos anteriores na triagem, e sei que omitir informação aumenta os riscos.",
  "Recebi as orientações de cuidados depois da sessão: protetor solar FPS 50 ou mais reaplicado a cada 3 horas, nas primeiras 48 horas evitar sauna, banho muito quente, sol direto e treino intenso, e suspender ácidos na pele por 3 a 5 dias.",
  "Tive a chance de tirar minhas dúvidas e autorizo a realização do procedimento.",
];

/** Texto inteiro (é o que fica guardado junto da assinatura). */
export const TERMO_TEXTO = TERMO_PARAGRAFOS.join("\n\n");

/** Versão curta para a ficha impressa e o prontuário. */
export const TERMO_RESUMO =
  "O paciente leu e concordou com o termo de consentimento: lifting biológico progressivo (pico entre 90 e 180 dias), não é facelift cirúrgico; efeitos leves e passageiros (vermelhidão, inchaço, sensibilidade) e riscos raros; cuidados depois da sessão recebidos.";
