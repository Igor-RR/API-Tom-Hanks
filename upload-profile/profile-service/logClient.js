const LOG_SERVICE_URL = process.env.LOG_SERVICE_URL;

/**
 * Fire-and-forget: nunca usa await bloqueando a resposta ao chamador, e qualquer falha
 * (log-service ou Redis fora do ar) só é registrada no console — jamais pode derrubar
 * o upload de foto ou a atualização de bio.
 */
function registrar(evento) {
  if (!LOG_SERVICE_URL) return;

  fetch(`${LOG_SERVICE_URL}/eventos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(evento),
  }).catch((erro) => {
    console.error('[perfil-service] Falha ao registrar evento de auditoria:', erro.message);
  });
}

module.exports = { registrar };