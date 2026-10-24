const { createClient } = require('redis')

const client = createClient({
  url: `redis://${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || 6379}`
})

client.on('error', (err) => {
  console.error('Erro de conexão com o Redis:', err.message)
})

let conectado = false

async function conectar() {
  if (!conectado) {
    await client.connect()
    conectado = true
    console.log('log-service conectado ao Redis')
  }
}

module.exports = { client, conectar }