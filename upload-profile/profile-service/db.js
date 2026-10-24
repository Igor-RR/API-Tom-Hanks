const mysql = require('mysql2/promise');

// Mesma instância de MariaDB já usada pelo catálogo e pelo auth-service — este serviço só
// enxerga (e só tem permissão de tocar) a tabela `perfis`.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;