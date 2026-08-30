const express = require('express')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const nodemailer = require('nodemailer')
const rateLimit = require('express-rate-limit')
const db = require('./db')

const router = express.Router()

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const transportador = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

const limitadorSensivel = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { mensagem: 'Muitas tentativas. Tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false
})

// ---------- CADASTRO ----------
router.post('/cadastro', async (req, res) => {
  const { nome, email, senha } = req.body

  if (!nome || !email || !senha) {
    return res.status(400).json({ mensagem: 'Preencha nome, e-mail e senha.' })
  }
  if (!emailValido(email)) {
    return res.status(400).json({ mensagem: 'E-mail inválido.' })
  }
  if (senha.length < 6) {
    return res.status(400).json({ mensagem: 'A senha precisa ter pelo menos 6 caracteres.' })
  }

  try {
    const senhaHash = await bcrypt.hash(senha, 10)

    // todo usuário novo nasce no papel mais baixo da hierarquia
    await db.query(
      'INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (?, ?, ?, ?)',
      [nome, email, senhaHash, 'espectador']
    )

    res.status(201).json({ mensagem: 'Conta criada com sucesso.' })

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensagem: 'Esse e-mail já está cadastrado.' })
    }
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao criar conta.' })
  }
})

// ---------- LOGIN ----------
// não cria sessão -- assina um JWT com os dados que o catálogo precisa
router.post('/login', limitadorSensivel, async (req, res) => {
  const { email, senha } = req.body

  if (!email || !senha) {
    return res.status(400).json({ mensagem: 'Preencha e-mail e senha.' })
  }

  try {
    const [linhas] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email])
    const usuario = linhas[0]

    if (!usuario) {
      return res.status(401).json({ mensagem: 'E-mail ou senha inválidos.' })
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash)
    if (!senhaCorreta) {
      return res.status(401).json({ mensagem: 'E-mail ou senha inválidos.' })
    }

    const token = jwt.sign(
      { usuario_id: usuario.id,nome: usuario.nome, role: usuario.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    )

    res.json({ token })

  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao fazer login.' })
  }
})

// ---------- ESQUECI MINHA SENHA ----------
router.post('/esqueci-senha', limitadorSensivel, async (req, res) => {
  const { email } = req.body

  if (!email || !emailValido(email)) {
    return res.status(400).json({ mensagem: 'Informe um e-mail válido.' })
  }

  try {
    const [linhas] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email])
    const usuario = linhas[0]

    if (!usuario) {
      return res.json({ mensagem: 'Se esse e-mail existir, um link de redefinição foi enviado.' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const criadoEm = new Date()
    const expiraEm = new Date(criadoEm.getTime() + 30 * 60 * 1000)

    await db.query(
      'INSERT INTO reset_tokens (token, usuario_id, criado_em, expira_em, usado) VALUES (?, ?, ?, ?, ?)',
      [token, usuario.id, criadoEm, expiraEm, false]
    )

    const link = `${process.env.APP_URL}/redefinir-senha.html?token=${token}`

    await transportador.sendMail({
      from: '"Catálogo Tom Hanks" <no-reply@catalogo.com>',
      to: usuario.email,
      subject: 'Redefinição de senha',
      html: `<p>Clique no link abaixo para redefinir sua senha. Ele expira em 30 minutos:</p>
             <p><a href="${link}">${link}</a></p>`
    })

    res.json({ mensagem: 'Se esse e-mail existir, um link de redefinição foi enviado.' })

  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao processar solicitação.' })
  }
})

// ---------- REDEFINIR SENHA ----------
router.post('/redefinir-senha', async (req, res) => {
  const { token, novaSenha } = req.body

  if (!token || !novaSenha) {
    return res.status(400).json({ mensagem: 'Dados incompletos.' })
  }
  if (novaSenha.length < 6) {
    return res.status(400).json({ mensagem: 'A senha precisa ter pelo menos 6 caracteres.' })
  }

  try {
    const [linhas] = await db.query('SELECT * FROM reset_tokens WHERE token = ?', [token])
    const registroToken = linhas[0]

    if (!registroToken) {
      return res.status(400).json({ mensagem: 'Link inválido.' })
    }
    if (registroToken.usado) {
      return res.status(400).json({ mensagem: 'Esse link já foi utilizado.' })
    }
    if (new Date() > new Date(registroToken.expira_em)) {
      return res.status(400).json({ mensagem: 'Esse link expirou. Solicite um novo.' })
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10)

    await db.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [senhaHash, registroToken.usuario_id])
    await db.query('UPDATE reset_tokens SET usado = ? WHERE token = ?', [true, token])

    res.json({ mensagem: 'Senha redefinida com sucesso.' })

  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao redefinir senha.' })
  }
})

module.exports = router