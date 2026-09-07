const { client } = require('./redisClient')

const STREAM_KEY = 'logs:eventos'
const MAX_TENTATIVAS = 3

// Fila em memória -- simples de propósito. Limitação conhecida: se o
// processo do log-service cair antes de drenar, os eventos ainda na fila
// se perdem (não sobrevivem a restart). Para o escopo deste projeto, o
// ganho (resposta imediata ao chamador, sem nunca bloquear a ação do
// usuário por causa do log) compensa esse risco -- ver README.
const fila = []

let workerRodando = false

function enfileirar(evento) {
  fila.push({ ...evento, tentativas: 0 })
}

function tamanhoFila() {
  return fila.length
}

async function gravarNoStream(evento) {
  const { usuario_id, acao, timestamp, ip_origem, detalhe } = evento

  const campos = {
    usuario_id: usuario_id != null ? String(usuario_id) : '',
    acao,
    timestamp,
    ip_origem: ip_origem || '',
    detalhe: detalhe || ''
  }

  await client.xAdd(STREAM_KEY, '*', campos)
}

// Loop do worker: processa um evento por vez, sem sobrepor gravações.
// Fica dormindo (poll curto) quando a fila está vazia, em vez de consumir
// CPU num loop apertado.
async function processarFila() {
  if (workerRodando) return // evita duas instâncias do loop rodando ao mesmo tempo
  workerRodando = true

  while (true) {
    if (fila.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 50))
      continue
    }

    const evento = fila.shift()

    try {
      await gravarNoStream(evento)
    } catch (err) {
      evento.tentativas += 1
      console.error(
        `Falha ao gravar evento "${evento.acao}" no Redis (tentativa ${evento.tentativas}):`,
        err.message
      )

      if (evento.tentativas < MAX_TENTATIVAS) {
        // volta pro fim da fila pra tentar de novo, sem travar os próximos eventos
        fila.push(evento)
      } else {
        console.error(
          `Evento "${evento.acao}" descartado após ${MAX_TENTATIVAS} tentativas:`,
          evento
        )
      }
    }
  }
}

function iniciarWorker() {
  processarFila().catch(err => {
    // não deveria acontecer (o while true nunca resolve/rejeita sozinho),
    // mas se acontecer, não deixamos o worker morrer silenciosamente
    console.error('Worker da fila de logs encerrou inesperadamente:', err)
  })
}

module.exports = { enfileirar, iniciarWorker, tamanhoFila }