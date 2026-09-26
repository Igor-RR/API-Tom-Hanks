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

// POST /perfis/:usuarioId/foto — recebe o arquivo (campo "foto"), valida e sobe pro Garage
router.post('/:usuarioId/foto', upload.single('foto'), validarImagemPerfil, async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const { extensao, mimeType } = req.imagemValidada;

    const [linhas] = await db.query('SELECT foto_key FROM perfis WHERE usuario_id = ?', [usuarioId]);
    const fotoAntiga = linhas[0]?.foto_key;

    // 1ª gravação: o arquivo em si vai pro Garage
    const novaKey = await uploadFotoPerfil(usuarioId, req.file.buffer, extensao, mimeType);

    // 2ª gravação: só a referência (chave do objeto) vai pro MariaDB
    await db.query(
      `INSERT INTO perfis (usuario_id, foto_key) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE foto_key = VALUES(foto_key)`,
      [usuarioId, novaKey]
    );

    // Só apaga o objeto antigo depois que o novo já está salvo e referenciado — se a
    // exclusão falhar, o perfil continua consistente (a referência aponta pro objeto novo,
    // que já existe); só sobra um arquivo órfão no bucket, não um perfil quebrado.
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