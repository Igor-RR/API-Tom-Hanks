const express = require('express')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const db = require('./db')

const router = express.Router()

// validação simples de formato de e-mail -- feita sempre no back, nunca confiando só no <input type="email">
function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// transportador de e-mail (Mailtrap em dev)
const transportador = nodemailer.createTransport({
  host: process.env.MAILTRAP_HOST,
  port: process.env.MAILTRAP_PORT,
  auth: {
    user: process.env.MAILTRAP_USER,
    pass: process.env.MAILTRAP_PASS
  }
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
    const senhaHash = await bcrypt.hash(senha, 10) //Encriptografa a senha antes de salvar no banco

    // todo usuário novo nasce com o papel padrão "usuario"
    await db.query(
      'INSERT INTO usuarios (nome, email, senha_hash, role) VALUES (?, ?, ?, ?)',
      [nome, email, senhaHash, 'usuario']
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
// não cria sessão aqui -- só valida e devolve os dados que o catálogo precisa
// pra decidir se abre sessão e com qual papel
router.post('/login', async (req, res) => {
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

    // devolve só o que o catálogo precisa pra montar a sessão -- nunca o hash da senha
    res.json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ mensagem: 'Erro ao fazer login.' })
  }
})

// ---------- ESQUECI MINHA SENHA ----------
router.post('/esqueci-senha', async (req, res) => {
  const { email } = req.body

  if (!email || !emailValido(email)) {
    return res.status(400).json({ mensagem: 'Informe um e-mail válido.' })
  }

  try {
    const [linhas] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email])
    const usuario = linhas[0]

    // mesmo se o e-mail não existir, respondemos como se tivesse dado certo --
    // isso evita que alguém use essa rota pra descobrir quais e-mails estão cadastrados
    if (!usuario) {
      return res.json({ mensagem: 'Se esse e-mail existir, um link de redefinição foi enviado.' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const criadoEm = new Date()
    const expiraEm = new Date(criadoEm.getTime() + 30 * 60 * 1000) // +30 minutos

    await db.query(
      'INSERT INTO reset_tokens (token, usuario_id, criado_em, expira_em, usado) VALUES (?, ?, ?, ?, ?)',
      [token, usuario.id, criadoEm, expiraEm, false]
    )

    // o link aponta pro CATÁLOGO (único ponto público), não pro auth-service
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

    // as três checagens exigidas pela spec, nessa ordem
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