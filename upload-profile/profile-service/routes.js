const express = require('express');
const router = express.Router();

const db = require('./db');
const { upload, validarImagemPerfil, tratarErroUpload } = require('./middleware/upload');
const { uploadFotoPerfil, apagarFotoPerfil, baixarFotoPerfil } = require('./garageClient');
const logClient = require('./logClient');

// ------------------------------------------------------------------------------------------
// IMPORTANTE — limite de confiança deste serviço:
// Este serviço é interno (sem porta publicada no docker-compose, só acessível pela rede
// interna do Docker) e, assim como o log-service, NUNCA decodifica JWT nem sabe o que é
// um papel de usuário. Ele confia que o `usuarioId` na URL é de fato o usuário logado.
//
// Quem garante isso é o catálogo: o catálogo decodifica o JWT do cookie httpOnly com seu
// middleware `exigirLogin`, pega o id de dentro do token (nunca do corpo da requisição do
// navegador) e só então chama as rotas abaixo, usando esse id já validado.
// ------------------------------------------------------------------------------------------

// GET /perfis/:usuarioId — dados do perfil (nome, bio, e SE existe foto, não a URL dela)
router.get('/:usuarioId', async (req, res) => {
  try {
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
      temFoto: Boolean(perfil.foto_key),
    });
  } catch (erro) {
    console.error('[perfil-service] Erro ao buscar perfil:', erro);
    res.status(500).json({ erro: 'Erro ao buscar perfil.' });
  }
});

// GET /perfis/:usuarioId/foto-arquivo — serve os BYTES da foto, buscando no Garage pela
// rede interna. Não é pra o navegador chamar direto: o catalogo é quem repassa essa
// resposta pro navegador (ver GET /api/perfil/:usuario_id/foto no catalogo).
router.get('/:usuarioId/foto-arquivo', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const [linhas] = await db.query('SELECT foto_key FROM perfis WHERE usuario_id = ?', [usuarioId]);
    const fotoKey = linhas[0]?.foto_key;

    if (!fotoKey) {
      return res.status(404).json({ erro: 'Usuário sem foto de perfil.' });
    }

    const objeto = await baixarFotoPerfil(fotoKey);
    res.set('Content-Type', objeto.ContentType || 'image/jpeg');
    objeto.Body.pipe(res);
  } catch (erro) {
    console.error('[perfil-service] Erro ao servir arquivo da foto:', erro);
    res.status(500).json({ erro: 'Erro ao buscar a foto.' });
  }
});

// PATCH /perfis/:usuarioId/nome — sincroniza só o nome (denormalizado a partir do JWT que
// o catalogo decodifica). Nunca mexe em bio/foto_key.
router.patch('/:usuarioId/nome', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const nome = String(req.body.nome || '').slice(0, 100) || null;

    await db.query(
      `INSERT INTO perfis (usuario_id, nome) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE nome = VALUES(nome)`,
      [usuarioId, nome]
    );

    res.json({ ok: true });
  } catch (erro) {
    console.error('[perfil-service] Erro ao sincronizar nome:', erro);
    res.status(500).json({ erro: 'Erro ao sincronizar nome.' });
  }
});

// PUT /perfis/:usuarioId — cria/atualiza a bio
router.put('/:usuarioId', async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const bio = String(req.body.bio ?? '').slice(0, 280);

    await db.query(
      `INSERT INTO perfis (usuario_id, bio) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE bio = VALUES(bio)`,
      [usuarioId, bio]
    );

    res.json({ ok: true, bio });
  } catch (erro) {
    console.error('[perfil-service] Erro ao atualizar bio:', erro);
    res.status(500).json({ erro: 'Erro ao atualizar bio.' });
  }
});

// POST /perfis/:usuarioId/foto — SEMPRE multipart/form-data, campo "foto". upload.single()
// extrai o arquivo; validarImagemPerfil confere os bytes reais (magic numbers) e o tamanho
// (multer.limits.fileSize) ANTES de qualquer upload pro Garage.
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

    if (fotoAntiga && fotoAntiga !== novaKey) {
      await apagarFotoPerfil(fotoAntiga);
    }

    logClient.registrar({ usuario_id: Number(usuarioId), acao: 'foto_perfil_atualizada' });

    res.json({ ok: true, temFoto: true });
  } catch (erro) {
    console.error('[perfil-service] Erro ao processar upload de foto:', erro);
    res.status(500).json({ erro: 'Falha ao salvar a imagem. Tente novamente.' });
  }
});

router.use(tratarErroUpload);

module.exports = router;