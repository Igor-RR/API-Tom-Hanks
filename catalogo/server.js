require('dotenv').config() // Lê o arquivo com as variáveis de ambiente

const express = require('express')
const session = require('express-session')
const path = require('path') // Possibiliat montar caminhos de arquivo e montar o fronted de outra pasta
const routes = require('./routes.js') //Importa as rotas

const app = express()

const PORTA = process.env.PORT || 3000

app.use(express.json()) //Converte todo arquivo enviado em cada requisição (devidamento marcada com o COntentType) em Json, acessível via req.body

app.use(session({
  secret: process.env.SESSION_SECRET, // acessa a chave secreta em .env para marcar a sessão
  resave: false, // evita regravar sessão sem mudança
  saveUninitialized: false // não permite criar sessão para usuário anônimo
}))

// Função para verificar se exite usuário id na sessão, caso contrário enviando para página de login
function exigirLogin(req, res, next) {
  if (!req.session.usuario_id) {
    return res.redirect('/login.html')
  }
  next()
} 

// Se tiver id, vai para catalogo.html, se não, voulta a tela de login
app.get('/', (req, res) => {
  res.redirect(req.session.usuario_id ? '/catalogo.html' : '/login.html')
})

// Aplicamos a função de verificação
app.get('/catalogo.html', exigirLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'catalogo.html'))
})

app.use(express.static(path.join(__dirname, 'public'))) // Serve os arquivos estáticos em public

app.use('/api', routes) // Consome as rotas em routes

app.listen(PORTA, () => {
  console.log(`Servidor rodando na porta ${PORTA}`)
})