require('dotenv').config() // Lê as variáveis de ambiente

const express = require('express')
const routes = require('./routes.js')
const { conectar } = require('./redisClient')
const { iniciarWorker } = require('./queue')

const app = express()

const PORTA = process.env.PORT_LOG || 5000

app.use(express.json())

app.use('/', routes) // Monta as rotas do log-service direto na raiz

// Só sobe o servidor HTTP (e o worker da fila) depois de garantir a conexão
// com o Redis -- evita aceitar requisições que vão empilhar indefinidamente
// sem nunca conseguir drenar
conectar()
  .then(() => {
    iniciarWorker() // começa a drenar a fila em background (queue.js)

    app.listen(PORTA, () => {
      console.log(`Serviço de log rodando na porta ${PORTA}`)
    })
  })
  .catch(err => {
    console.error('Não foi possível conectar ao Redis:', err.message)
    process.exit(1)
  })
  