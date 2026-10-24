const express = require('express')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const db = require('./db')

const router = express.Router()

// papéis que o fluxo de pagamento pode atribuir -- 'admin' fica de fora de propósito:
// não é um plano vendável e nunca pode ser concedido (nem retirado) por aqui
const ROLES_PAGOS = ['espectador', 'fan', 'cinefilo', 'stalker']

// Essas rotas mudam permissão, então além de não terem porta pública exigem um
// segredo compartilhado entre catalogo e auth-service (INTERNAL_API_KEY).
// Fail closed: sem a variável configurada, nada passa.
function exigirChaveInterna(req, res, next) {
  const esperada = process.env.INTERNAL_API_KEY
  const recebida = req.get('x-internal-key')

  if (!esperada || !recebida) {
    return res.status(403).json({ mensagem: 'Acesso interno negado.' })
  }

  const a = Buffer.from(esperada)
  const b = Buffer.from(recebida)

  // timingSafeEqual exige buffers do mesmo tamanho
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ mensagem: 'Acesso interno negado.' })
  }

  next()
}

router.use(exigirChaveInterna)

// ---------- DEFINIR ROLE ----------
// chamado pelo catalogo (webhook do Stripe) depois de confirmar pagamento/cancelamento
router.put('/usuarios/:id/role', async (req, res) => {
  const usuarioId = Number(req.params.id)
  const { role } = req.body

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({ mensagem: 'Id inválido.' })
  }
  if (!ROLES_PAGOS.includes(role)) {
    return res.status(400).json({ mensagem: 'Papel inválido.' })
  }

  try {
    const [linhas] = await db.query('SELECT id, role FROM usuarios WHERE id = ?', [usuarioId])
    const usuario = linhas[0]

    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' })
    }
    if (usuario.role === 'admin') {
      return res.status(409).json({ mensagem: 'O papel de admin não pode ser alterado por aqui.' })
    }

    await db.query('UPDATE usuarios SET role = ? WHERE id = ? AND role <> ?', [role, usuarioId, 'admin'])

    res.json({ usuario_id: usuarioId, role })

  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao atualizar papel.' })
  }
})

// ---------- REEMITIR TOKEN ----------
// lê o role ATUAL do banco e assina um JWT novo, no mesmo formato do login.
// o catalogo só chama isso com o usuario_id vindo do JWT do próprio usuário logado.
router.post('/usuarios/:id/token', async (req, res) => {
  const usuarioId = Number(req.params.id)

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({ mensagem: 'Id inválido.' })
  }

  try {
    const [linhas] = await db.query('SELECT id, nome, role FROM usuarios WHERE id = ?', [usuarioId])
    const usuario = linhas[0]

    if (!usuario) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado.' })
    }

    const token = jwt.sign(
      { usuario_id: usuario.id, nome: usuario.nome, role: usuario.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    )

    res.json({ token, role: usuario.role })

  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao reemitir token.' })
  }
})

module.exports = router