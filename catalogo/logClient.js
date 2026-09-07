const LOG_SERVICE_URL = process.env.LOG_SERVICE_URL

// Dispara o evento pro log-service sem bloquear quem chamou (fire-and-forget).
// Uma falha aqui (log-service fora do ar, Redis indisponível, etc.) NUNCA
// pode impedir a ação principal do usuário -- por isso não é usado com
// `await` nas rotas, e qualquer erro é só logado no console do serviço.
function registrarEvento({ usuario_id, acao, ip_origem, detalhe } = {}) {
  if (!LOG_SERVICE_URL) {
    console.error('LOG_SERVICE_URL não configurada -- evento não registrado:', acao)
    return
  }

  try {
    fetch(`${LOG_SERVICE_URL}/eventos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario_id, acao, ip_origem, detalhe })
    }).catch(err => {
      // erro de rede/timeout na chamada -- não propaga
      console.error(`Falha ao registrar evento "${acao}" no log-service:`, err.message)
    })
  } catch (err) {
    // erro síncrono (ex: JSON.stringify de algo inválido) -- também não propaga
    console.error(`Erro inesperado ao tentar registrar evento "${acao}":`, err.message)
  }
}

module.exports = { registrarEvento }