require('dotenv').config()

const express = require('express')
const cookieParser = require('cookie-parser')
const path = require('path')
const routes = require('./routes.js')

const app = express()

const PORTA = process.env.PORT_CATALOGO || 3000

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