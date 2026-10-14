// Apps Script da planilha "CADASTRO CONTOURLINE ACADEMY (respostas)".
// Manda cada resposta nova do formulário para o Harmonize (Clientes >
// Cadastros recebidos). Colar em Extensões > Apps Script, trocar o SEGREDO
// pelo que está no cofre do Supabase (formulario_cadastro_segredo) e rodar
// instalar() uma vez. O segredo nunca vai para o git.

const URL_HARMONIZE = 'https://vidnlzbxaxjlmzncqhxw.supabase.co/functions/v1/cadastro-formulario';
const SEGREDO = 'COLE_AQUI_O_SEGREDO';

function enviar_(linhas, avisar) {
  const resposta = UrlFetchApp.fetch(URL_HARMONIZE, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ segredo: SEGREDO, linhas: linhas, avisar: avisar }),
    muteHttpExceptions: true,
  });
  Logger.log(resposta.getResponseCode() + ' ' + resposta.getContentText());
}

// Roda sozinho a cada envio do formulário.
function aoEnviar(e) {
  const linha = {};
  for (const coluna in e.namedValues) linha[coluna] = e.namedValues[coluna].join(', ');
  enviar_([linha], true);
}

// Rodar UMA vez: liga o envio automático (e pede a autorização do Google).
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('aoEnviar').forSpreadsheet(SpreadsheetApp.getActive()).onFormSubmit().create();
  Logger.log('Pronto: cada resposta nova vai para o Harmonize.');
}

// Opcional, uma vez: manda as respostas que já estão na planilha (sem aviso no celular).
function enviarAntigos() {
  const valores = SpreadsheetApp.getActive().getSheets()[0].getDataRange().getDisplayValues();
  const cabecalho = valores[0];
  const linhas = valores.slice(1).map(function (r) {
    const o = {};
    cabecalho.forEach(function (c, i) { o[c] = r[i]; });
    return o;
  });
  enviar_(linhas, false);
}
