require('dotenv').config()

const express = require('express')
const cookieParser = require('cookie-parser')
const path = require('path')
const routes = require('./routes.js')

const app = express()

const PORTA = process.env.PORT_CATALOGO || 3000

// WEBHOOK DO STRIPE: o catalogo é o único serviço público, então o Stripe chama ele e ele
// repassa tudo ao serviço pagamentos (que valida a assinatura). O corpo precisa seguir CRU
// (Buffer), byte a byte, senão a verificação da assinatura falha -- por isso esta rota vem
// ANTES do express.json(). Sem cookie/JWT e sem rate limit: quem protege é a assinatura.
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const resposta = await fetch(`${process.env.PAGAMENTOS_SERVICE_URL}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': req.headers['stripe-signature'] || '',
        'x-internal-key': process.env.INTERNAL_API_KEY,
        'x-origem-ip': req.ip
      },
      body: req.body
    })
    // devolve o mesmo status: 5xx faz o Stripe reenviar o evento depois
    res.status(resposta.status).send(await resposta.text())
  } catch (err) {
    console.error('Falha ao repassar webhook ao serviço de pagamentos:', err.message)
    res.status(502).send('Serviço de pagamentos indisponível.')
  }
})

app.use(express.json())
app.use(cookieParser())

function exigirLogin(req, res, next) {
  const jwt = require('jsonwebtoken')
  const token = req.cookies.token
  if (!token) {
    return res.redirect('/login.html')
  }
  try {
    jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch (err) {
    return res.redirect('/login.html')
  }
}

app.get('/', (req, res) => {
  res.redirect(req.cookies.token ? '/catalogo.html' : '/login.html')
})

app.get('/catalogo.html', exigirLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'catalogo.html'))
})

app.use(express.static(path.join(__dirname, 'public')))

app.use('/api', routes)

app.listen(PORTA, () => {
  console.log(`Catálogo rodando na porta ${PORTA}`)
})