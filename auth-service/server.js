require('dotenv').config() // Lê as variáveis de ambiente

const express = require('express')
const routes = require('./routes.js')

const app = express()

const PORTA = process.env.PORT_AUTH || 4000

app.use(express.json()) // Converte o corpo das requisições em JSON, acessível via req.body

app.use('/', routes) // Monta as rotas de auth direto na raiz (esse serviço inteiro é o auth)

app.listen(PORTA, () => {
  console.log(`Serviço de autenticação rodando na porta ${PORTA}`)
})