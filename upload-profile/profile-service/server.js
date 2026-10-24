const express = require('express');
const perfilRoutes = require('./routes');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/perfis', perfilRoutes);

const PORT = process.env.PORT_PROFILE || 4100;
app.listen(PORT, () => {
  console.log(`profile-service ouvindo na porta ${PORT} (rede interna do Docker)`);
});