const express = require('express')
const { client } = require('./redisClient.js')

const router = express.Router()

// Stream único -- facilita reconstruir a ordem cronológica de eventos vindos
// de serviços diferentes (auth-service e catálogo) numa única consulta.
const STREAM_KEY = 'logs:eventos'

const ACOES_VALIDAS = [
  'login',
  'logout',
  'favoritar',
  'comentar',
  'comentario_deletado_moderacao',
  'acesso_negado'
]

// ---------- REGISTRAR EVENTO ----------
// Chamado internamente pelo auth-service e pelo catálogo. Nunca deve ser
// exposto à internet -- esse container não tem porta publicada.
router.post('/eventos', async (req, res) => {
  const { usuario_id, acao, ip_origem, detalhe } = req.body

  if (!acao || !ACOES_VALIDAS.includes(acao)) {
    return res.status(400).json({ mensagem: 'Ação inválida ou não informada.' })
  }

  try {
    // XADD exige campos como string; timestamp é gerado aqui, no momento
    // real da gravação, não no serviço de origem (evita divergência de relógio)
    const campos = {
      usuario_id: usuario_id != null ? String(usuario_id) : '',
      acao,
      timestamp: new Date().toISOString(),
      ip_origem: ip_origem || '',
      detalhe: detalhe || ''
    }

    const id = await client.xAdd(STREAM_KEY, '*', campos)

    res.status(201).json({ mensagem: 'Evento registrado.', id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao registrar evento.' })
  }
})

// ---------- CONSULTAR ÚLTIMOS N EVENTOS ----------
// Sem controle de acesso aqui -- quem protege essa informação é o proxy do
// catálogo (exigirLogin + exigirNivel('stalker')), já que o log-service nunca
// é chamado diretamente pelo navegador.
router.get('/eventos', async (req, res) => {
  const limite = Math.min(parseInt(req.query.limit, 10) || 50, 500)

  try {
    // XREVRANGE devolve do mais recente pro mais antigo; invertemos no fim
    // pra apresentar em ordem cronológica (o que aconteceu primeiro, primeiro)
    const entradas = await client.xRevRange(STREAM_KEY, '+', '-', { COUNT: limite })

    const eventos = entradas
      .map(entrada => ({
        id: entrada.id,
        ...entrada.message
      }))
      .reverse()

    res.json(eventos)
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao consultar eventos.' })
  }
})

module.exports = router