const Stripe = require('stripe')
const db = require('./db')
const { registrarEvento } = require('./logClient') // LOG: helper de auditoria (cópia do auth-service)

// planos vendáveis, em ordem crescente de nível. 'espectador' é gratuito (sem Stripe)
// e 'admin' nunca é vendido.
const PLANOS_PAGOS = ['fan', 'cinefilo', 'stalker']

// assinaturas que dão acesso ao plano (past_due = renovação falhou, mas o Stripe ainda
// está tentando cobrar). 'unpaid' também entra na limpeza de assinaturas antigas.
const STATUS_COM_ACESSO = ['active', 'trialing', 'past_due']
const STATUS_A_CANCELAR = [...STATUS_COM_ACESSO, 'unpaid']

// Cliente criado só no primeiro uso: sem STRIPE_SECRET_KEY (ex: no CI) o serviço
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

// ---------- o Stripe é a fonte da verdade sobre o plano ----------
// O banco só guarda QUEM é o cliente no Stripe (clientes_stripe). Quais assinaturas ele
// tem, e de que plano, é sempre perguntado ao Stripe.

async function listarAssinaturas(clienteId) {
  const lista = await getStripe().subscriptions.list({ customer: clienteId, status: 'all', limit: 100 })
  return lista.data
}

// Maior papel pago entre as assinaturas COM ACESSO do cliente; 'espectador' se não houver.
// `ignorarId` tira uma assinatura da conta (a que acabou de ser cancelada).
async function papelPagoAtual(clienteId, ignorarId = null) {
  const assinaturas = await listarAssinaturas(clienteId)
  let melhor = 'espectador'

  for (const assinatura of assinaturas) {
    if (assinatura.id === ignorarId) continue
    if (!STATUS_COM_ACESSO.includes(assinatura.status)) continue

    const role = planoDoPrice(assinatura.items.data[0].price.id)
    if (role && PLANOS_PAGOS.indexOf(role) > PLANOS_PAGOS.indexOf(melhor)) {
      melhor = role
    }
  }
  return melhor
}

// ---------- chamada interna ao auth-service (dono da tabela usuarios) ----------

// Retorna true se aplicou; false se o caso não tem como dar certo nem com retry
// (usuário inexistente ou admin). Qualquer outra falha lança erro -> webhook responde 500
// e o Stripe tenta de novo.
async function definirRoleNoAuth(usuarioId, role) {
  const resposta = await fetch(`${process.env.AUTH_SERVICE_URL}/internos/usuarios/${usuarioId}/role`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': process.env.INTERNAL_API_KEY
    },
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

// ---------- webhook ----------

// Cancela toda assinatura do cliente que NÃO seja a nova. Stateless de propósito: se uma
// tentativa anterior falhou no meio, o retry do Stripe simplesmente encontra o que ainda
// sobrou. Qualquer falha diferente de "não existe" lança erro (cobrança em dobro não pode
// ser engolida em silêncio).
async function cancelarAssinaturasAnteriores(clienteId, assinaturaAtualId) {
  const stripe = getStripe()

  for (const assinatura of await listarAssinaturas(clienteId)) {
    if (assinatura.id === assinaturaAtualId) continue
    if (!STATUS_A_CANCELAR.includes(assinatura.status)) continue

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

  // 1) guarda o vínculo usuário <-> cliente do Stripe (único dado nosso sobre pagamento)
  await db.query(
    `INSERT INTO clientes_stripe (usuario_id, stripe_customer_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE stripe_customer_id = VALUES(stripe_customer_id)`,
    [usuarioId, sessao.customer]
  )

  // 2) promove e 3) cancela as assinaturas anteriores. Cada passo é idempotente: se o
  // Stripe reenviar o evento, refaz sem efeito colateral.
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
  const [linhas] = await db.query(
    'SELECT usuario_id FROM clientes_stripe WHERE stripe_customer_id = ?',
    [assinatura.customer]
  )
  const cliente = linhas[0]
  if (!cliente) return // cliente que não conhecemos (ex: promovido manualmente)

  // Em vez de olhar um status guardado, pergunta ao Stripe o que SOBROU. Num upgrade, a
  // assinatura antiga é cancelada mas a nova continua ativa: o papel resultante é o do
  // plano novo, e ninguém é rebaixado por engano. Sem nenhuma assinatura ativa -> espectador.
  const role = await papelPagoAtual(assinatura.customer, assinatura.id)
  await definirRoleNoAuth(cliente.usuario_id, role)

  if (role === 'espectador') {
    registrarEvento({
      usuario_id: cliente.usuario_id,
      acao: 'assinatura_cancelada',
      ip_origem: ip,
      detalhe: `subscription=${assinatura.id}`
    })
  }
}

// Recebe o corpo CRU (Buffer), repassado byte a byte pelo catalogo: a assinatura do Stripe
// é calculada sobre os bytes exatos. A rota usa express.raw() em vez de express.json().
async function webhookHandler(req, res) {
  let evento

  try {
    evento = getStripe().webhooks.constructEvent(
      req.body,
      req.get('stripe-signature'),
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook com assinatura inválida:', err.message)
    return res.status(400).send('Assinatura inválida.')
  }

  // o catalogo repassa o IP de quem chamou (o Stripe), pra auditoria
  const ip = req.get('x-origem-ip') || req.ip

  try {
    if (evento.type === 'checkout.session.completed') {
      await tratarCheckoutConcluido(evento.data.object, ip)
    } else if (evento.type === 'customer.subscription.deleted') {
      await tratarAssinaturaCancelada(evento.data.object, ip)
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
  papelPagoAtual,
  webhookHandler
}