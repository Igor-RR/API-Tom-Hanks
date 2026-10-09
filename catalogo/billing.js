const Stripe = require('stripe')
const db = require('./db')
const { registrarEvento } = require('./logClient') // LOG: helper de auditoria

// planos vendáveis. 'espectador' é gratuito (sem Stripe) e 'admin' nunca é vendido.
const PLANOS_PAGOS = ['fan', 'cinefilo', 'stalker']

// Cliente criado só no primeiro uso: sem STRIPE_SECRET_KEY (ex: no CI) o catálogo
// continua subindo normalmente; só falha quando alguém tenta de fato cobrar.
let clienteStripe = null
function getStripe() {
  if (!clienteStripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY não configurada.')
    }
    clienteStripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return clienteStripe
}

// plano -> price_id do Stripe (vem do servidor, nunca do cliente)
function priceDoPlano(plano) {
  if (!PLANOS_PAGOS.includes(plano)) return null

  const precos = {
    fan: process.env.STRIPE_PRICE_FAN,
    cinefilo: process.env.STRIPE_PRICE_CINEFILO,
    stalker: process.env.STRIPE_PRICE_STALKER
  }
  return precos[plano] || null
}

// price_id -> papel. O papel é deduzido do que foi realmente cobrado.
function planoDoPrice(priceId) {
  return PLANOS_PAGOS.find(plano => priceDoPlano(plano) === priceId) || null
}

// ---------- chamadas internas ao auth-service (dono da tabela usuarios) ----------

function cabecalhosInternos() {
  return {
    'Content-Type': 'application/json',
    'x-internal-key': process.env.INTERNAL_API_KEY
  }
}

// Retorna true se aplicou; false se o caso não tem como dar certo nem com retry
// (usuário inexistente ou admin). Qualquer outra falha lança erro -> webhook responde 500
// e o Stripe tenta de novo.
async function definirRoleNoAuth(usuarioId, role) {
  const resposta = await fetch(`${process.env.AUTH_SERVICE_URL}/internos/usuarios/${usuarioId}/role`, {
    method: 'PUT',
    headers: cabecalhosInternos(),
    body: JSON.stringify({ role })
  })

  if (resposta.status === 404 || resposta.status === 409) {
    console.error(`auth-service recusou definir role=${role} para usuario ${usuarioId} (status ${resposta.status})`)
    return false
  }
  if (!resposta.ok) {
    throw new Error(`auth-service respondeu ${resposta.status} ao definir role`)
  }
  return true
}

async function reemitirTokenNoAuth(usuarioId) {
  const resposta = await fetch(`${process.env.AUTH_SERVICE_URL}/internos/usuarios/${usuarioId}/token`, {
    method: 'POST',
    headers: cabecalhosInternos()
  })

  if (!resposta.ok) {
    throw new Error(`auth-service respondeu ${resposta.status} ao reemitir token`)
  }
  return resposta.json() // { token, role }
}

// ---------- webhook ----------

// Cancela toda assinatura ativa do cliente que NÃO seja a nova. Stateless de propósito:
// se uma tentativa anterior falhou no meio, o retry do Stripe simplesmente encontra o que
// ainda sobrou. Qualquer falha diferente de "não existe" lança erro (cobrança em dobro
// não pode ser engolida em silêncio).
async function cancelarAssinaturasAnteriores(clienteId, assinaturaAtualId) {
  const stripe = getStripe()
  const lista = await stripe.subscriptions.list({ customer: clienteId, status: 'all', limit: 100 })

  for (const assinatura of lista.data) {
    if (assinatura.id === assinaturaAtualId) continue
    if (!['active', 'trialing', 'past_due', 'unpaid'].includes(assinatura.status)) continue

    try {
      await stripe.subscriptions.cancel(assinatura.id)
    } catch (err) {
      if (err.code !== 'resource_missing') throw err
    }
  }
}

async function tratarCheckoutConcluido(sessao, ip) {
  // só promove com pagamento confirmado
  if (sessao.mode !== 'subscription' || sessao.payment_status !== 'paid') return

  const usuarioId = Number(sessao.client_reference_id)
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    console.error('checkout.session.completed sem client_reference_id válido:', sessao.id)
    return
  }

  const stripe = getStripe()
  const assinatura = await stripe.subscriptions.retrieve(sessao.subscription)
  const priceId = assinatura.items.data[0].price.id
  const role = planoDoPrice(priceId)

  if (!role) {
    console.error('price desconhecido no checkout:', priceId)
    return
  }

  // ORDEM IMPORTA: 1) grava a nova assinatura como a atual, 2) promove, 3) só então cancela
  // a antiga. Assim o customer.subscription.deleted da antiga chega depois e é ignorado
  // (ela já não é a atual). Cada passo é idempotente: se o Stripe reenviar o evento, refaz.
  await db.query(
    `INSERT INTO assinaturas (usuario_id, stripe_customer_id, stripe_subscription_id, role_pago, status)
     VALUES (?, ?, ?, ?, 'ativa')
     ON DUPLICATE KEY UPDATE
       stripe_customer_id = VALUES(stripe_customer_id),
       stripe_subscription_id = VALUES(stripe_subscription_id),
       role_pago = VALUES(role_pago),
       status = 'ativa'`,
    [usuarioId, sessao.customer, assinatura.id, role]
  )

  await definirRoleNoAuth(usuarioId, role)
  await cancelarAssinaturasAnteriores(sessao.customer, assinatura.id)

  registrarEvento({
    usuario_id: usuarioId,
    acao: 'assinatura_ativada',
    ip_origem: ip,
    detalhe: `plano=${role} subscription=${assinatura.id}`
  })
}

async function tratarAssinaturaCancelada(assinatura, ip) {
  // só age se for a assinatura ATUAL do usuário. Cancelamento de uma assinatura já
  // substituída por upgrade não rebaixa ninguém.
  const [linhas] = await db.query(
    "SELECT * FROM assinaturas WHERE stripe_subscription_id = ? AND status = 'ativa'",
    [assinatura.id]
  )
  const registro = linhas[0]
  if (!registro) return

  // papel primeiro, status depois: se o segundo passo falhar, o retry refaz o primeiro
  // (idempotente) em vez de deixar o usuário premium pra sempre
  await definirRoleNoAuth(registro.usuario_id, 'espectador')

  await db.query(
    "UPDATE assinaturas SET status = 'cancelada' WHERE stripe_subscription_id = ?",
    [assinatura.id]
  )

  registrarEvento({
    usuario_id: registro.usuario_id,
    acao: 'assinatura_cancelada',
    ip_origem: ip,
    detalhe: `plano=${registro.role_pago} subscription=${assinatura.id}`
  })
}

// Recebe o corpo CRU (Buffer): a assinatura é calculada sobre os bytes exatos, então esta
// rota é registrada no server.js ANTES do express.json(). Sem cookie/JWT -- quem protege
// a rota é a verificação da assinatura do Stripe.
async function webhookHandler(req, res) {
  let evento

  try {
    evento = getStripe().webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook com assinatura inválida:', err.message)
    return res.status(400).send('Assinatura inválida.')
  }

  try {
    if (evento.type === 'checkout.session.completed') {
      await tratarCheckoutConcluido(evento.data.object, req.ip)
    } else if (evento.type === 'customer.subscription.deleted') {
      await tratarAssinaturaCancelada(evento.data.object, req.ip)
    }
    // demais eventos: reconhece e ignora

    res.json({ received: true })
  } catch (err) {
    // 500 faz o Stripe reenviar o evento mais tarde
    console.error(`Erro ao processar evento ${evento.type}:`, err)
    res.status(500).send('Erro ao processar evento.')
  }
}

module.exports = {
  getStripe,
  priceDoPlano,
  reemitirTokenNoAuth,
  webhookHandler
}