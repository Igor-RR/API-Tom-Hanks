const express = require('express')
const crypto = require('crypto')
const db = require('./db')
const billing = require('./billing')
const { registrarEvento } = require('./logClient') // LOG: helper de auditoria (cópia do auth-service)

const router = express.Router()

// mesma hierarquia do catalogo (usada só pra impedir "downgrade por compra")
const HIERARQUIA = ['espectador', 'fan', 'cinefilo', 'stalker', 'admin']

function nivelDe(role) {
  return HIERARQUIA.indexOf(role)
}

// Serviço de uso interno: só o catalogo chama (rede interna, sem porta pública), e mesmo
// assim exige o segredo compartilhado INTERNAL_API_KEY. Fail closed: sem a variável, nada passa.
function exigirChaveInterna(req, res, next) {
  const esperada = process.env.INTERNAL_API_KEY
  const recebida = req.get('x-internal-key')

  if (!esperada || !recebida) {
    return res.status(403).json({ mensagem: 'Acesso interno negado.' })
  }

  const a = Buffer.from(esperada)
  const b = Buffer.from(recebida)

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ mensagem: 'Acesso interno negado.' })
  }

  next()
}

router.use(exigirChaveInterna)

// ---------- WEBHOOK DO STRIPE ----------
// O catalogo (único serviço público) repassa o corpo cru + o header Stripe-Signature.
// A proteção real é a verificação dessa assinatura, feita dentro do webhookHandler.
router.post('/webhook', express.raw({ type: 'application/json' }), billing.webhookHandler)

// ---------- CHECKOUT ----------
// Cria uma Checkout Session e devolve a URL hospedada pelo Stripe. O cartão é digitado lá:
// este serviço nunca vê número, CVV ou validade. usuario_id e role vêm do JWT já validado
// pelo catalogo; o cliente só escolhe o plano, e o price_id é decidido aqui.
router.post('/checkout', express.json(), async (req, res) => {
  const { usuario_id, role, plano, ip } = req.body
  const usuarioId = Number(usuario_id)

  if (!Number.isInteger(usuarioId) || usuarioId <= 0 || nivelDe(role) === -1) {
    return res.status(400).json({ mensagem: 'Dados inválidos.' })
  }

  const priceId = billing.priceDoPlano(plano)
  if (!priceId) {
    return res.status(400).json({ mensagem: 'Plano inválido.' })
  }

  // admin não é plano vendável: não assina, e o webhook também nunca o rebaixa
  if (role === 'admin') {
    registrarEvento({
      usuario_id: usuarioId,
      acao: 'acesso_negado',
      ip_origem: ip,
      detalhe: `rota=POST /checkout role_atual=admin plano=${plano}`
    })
    return res.status(403).json({ mensagem: 'Contas admin não assinam planos.' })
  }

  try {
    const [linhas] = await db.query('SELECT * FROM assinaturas WHERE usuario_id = ?', [usuarioId])
    const assinatura = linhas[0]

    // só permite upgrade. O JWT pode estar defasado logo após um pagamento, então o nível
    // efetivo considera também a assinatura ativa registrada no banco (evita cobrar em dobro)
    const nivelPago = assinatura && assinatura.status === 'ativa' ? nivelDe(assinatura.role_pago) : -1
    const nivelAtual = Math.max(nivelDe(role), nivelPago)

    if (nivelDe(plano) <= nivelAtual) {
      return res.status(409).json({ mensagem: 'Você já tem esse plano ou um superior.' })
    }

    const sessao = await billing.getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: String(usuarioId), // o webhook usa isso pra achar o usuário
      ...(assinatura ? { customer: assinatura.stripe_customer_id } : {}), // reaproveita o cliente
      success_url: `${process.env.APP_URL}/assinatura-sucesso.html`,
      cancel_url: `${process.env.APP_URL}/planos.html?cancelado=1`,
      locale: 'pt-BR'
    })

    res.json({ url: sessao.url })
  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao iniciar o pagamento.' })
  }
})

module.exports = router
