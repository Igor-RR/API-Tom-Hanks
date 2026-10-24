require('dotenv').config() // Lê as variáveis de ambiente

const express = require('express')
const routes = require('./routes.js')

const app = express()

const PORTA = process.env.PORT_PAGAMENTOS || 5000

// SEM express.json() global: o webhook precisa do corpo CRU (Buffer) pra verificar a
// assinatura do Stripe, então cada rota em routes.js declara o parser que usa.
app.use('/', routes)

app.listen(PORTA, () => {
  console.log(`Serviço de pagamentos rodando na porta ${PORTA}`)
})
