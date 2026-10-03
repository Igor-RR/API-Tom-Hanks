const express = require('express');
const router = express.Router();

const db = require('./db');
const { upload, validarImagemPerfil, tratarErroUpload } = require('./middleware/upload');
const { uploadFotoPerfil, apagarFotoPerfil, gerarUrlFotoPerfil } = require('./garageClient');
const logClient = require('./logClient');

// ------------------------------------------------------------------------------------------
// IMPORTANTE — limite de confiança deste serviço:
// Este serviço é interno (sem porta publicada no docker-compose, só acessível pela rede
// interna do Docker) e, assim como o log-service, NUNCA decodifica JWT nem sabe o que é
// um papel de usuário. Ele confia que o `usuarioId` na URL é de fato o usuário logado.
//
// Quem garante isso é o catálogo: o catálogo decodifica o JWT do cookie httpOnly com seu
// middleware `exigirLogin`, pega o id de dentro do token (nunca do corpo da requisição do
// navegador) e só então chama `PUT /perfis/:usuarioId` ou `POST /perfis/:usuarioId/foto`
// aqui, usando esse id já validado. Nunca exponha este serviço direto pra internet — se ele
// ficasse público, qualquer um poderia editar o perfil de qualquer usuarioId.
// ------------------------------------------------------------------------------------------

// GET /perfis/:usuarioId — dados do perfil (nome + bio + URL assinada da foto, se houver)
router.get('/:usuarioId', async (req, res) => {
  const { usuarioId } = req.params;

  const [linhas] = await db.query(
    'SELECT usuario_id, nome, bio, foto_key FROM perfis WHERE usuario_id = ?',
    [usuarioId]
  );
  const perfil = linhas[0] || { usuario_id: Number(usuarioId), nome: null, bio: null, foto_key: null };

  res.json({
    usuarioId: perfil.usuario_id,
    nome: perfil.nome,
    bio: perfil.bio,
    fotoUrl: await gerarUrlFotoPerfil(perfil.foto_key),
  });
});

// PATCH /perfis/:usuarioId/nome — sincroniza só o nome (denormalizado a partir do JWT que o
// catalogo decodifica). Nunca mexe em bio/foto_key. Chamado pelo catalogo toda vez que o
// dono do perfil abre a própria página — ver nota de limitação no migration_perfis.sql.
router.patch('/:usuarioId/nome', async (req, res) => {
  const { usuarioId } = req.params;
  const nome = String(req.body.nome || '').slice(0, 100) || null;

  await db.query(
    `INSERT INTO perfis (usuario_id, nome) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE nome = VALUES(nome)`,
    [usuarioId, nome]
  );

  res.json({ ok: true });
});

// PUT /perfis/:usuarioId — cria/atualiza a bio
router.put('/:usuarioId', async (req, res) => {
  const { usuarioId } = req.params;
  const bio = String(req.body.bio ?? '').slice(0, 280);

  await db.query(
    `INSERT INTO perfis (usuario_id, bio) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE bio = VALUES(bio)`,
    [usuarioId, bio]
  );

  res.json({ ok: true, bio });
});

// POST /perfis/:usuarioId/foto — flexível: aceita tanto o multer multipart quanto o buffer cru enviado pelo Catálogo
router.post('/:usuarioId/foto', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    
    let buffer;
    let mimeType;
    let nomeOriginal;

    // Se passou pelo multer (multipart/form-data)
    if (req.file) {
      buffer = req.file.buffer;
      mimeType = req.file.mimetype;
      nomeOriginal = req.file.originalname;
    } 
    // Se veio como buffer cru no body (enviado pelo Catálogo atualizado)
    else if (req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
      buffer = req.body;
      mimeType = req.headers['content-type'] || 'image/jpeg';
      nomeOriginal = decodeURIComponent(req.headers['x-original-filename'] || 'foto.jpg');
    } 
    // Fallback: lê o stream diretamente da requisição
    else {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks);
      mimeType = req.headers['content-type'] || 'image/jpeg';
      nomeOriginal = decodeURIComponent(req.headers['x-original-filename'] || 'foto.jpg');
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ mensagem: 'Nenhum arquivo enviado. Use o campo "foto".' });
    }

    const extensao = (nomeOriginal.split('.').pop() || 'jpg').toLowerCase();
    const mimeValido = ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) ? mimeType : 'image/jpeg';

    const [linhas] = await db.query('SELECT foto_key FROM perfis WHERE usuario_id = ?', [usuarioId]);
    const fotoAntiga = linhas[0]?.foto_key;

    // 1ª gravação: o arquivo vai pro Garage
    const novaKey = await uploadFotoPerfil(usuarioId, buffer, extensao, mimeValido);

    // 2ª gravação: só a referência (chave) vai pro MariaDB
    await db.query(
      `INSERT INTO perfis (usuario_id, foto_key) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE foto_key = VALUES(foto_key)`,
      [usuarioId, novaKey]
    );

    if (fotoAntiga && fotoAntiga !== novaKey) {
      await apagarFotoPerfil(fotoAntiga);
    }

    logClient.registrar({ usuario_id: Number(usuarioId), acao: 'foto_perfil_atualizada' });

    res.json({ ok: true, fotoUrl: await gerarUrlFotoPerfil(novaKey) });
  } catch (erro) {
    console.error('[perfil-service] Erro ao processar upload de foto:', erro);
    res.status(500).json({ erro: 'Falha ao salvar a imagem. Tente novamente.' });
  }
});

router.use(tratarErroUpload);

module.exports = router;