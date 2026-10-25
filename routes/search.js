// 3. Стриминг (с поддержкой перемотки и правильной длительностью)
router.get('/stream', async (req, res) => {
  try {
    const trackUrl = req.query.url;
    if (!trackUrl) throw new Error('Ссылка на трек не передана');

    // Получаем информацию о треке
    const info = await scdl.getInfo(trackUrl);
    let streamUrl = null;

    // Ищем прямую ссылку на MP3
    if (info.formats) {
      const prog = info.formats.find(f => f.format.protocol === 'progressive');
      if (prog) streamUrl = prog.url;
    }

    if (!streamUrl && info.media && info.media.transcodings) {
      const trans = info.media.transcodings.find(t => t.format.protocol === 'progressive');
      if (trans) {
        const tRes = await axios.get(trans.url, { params: { client_id: scdl.client_id } });
        streamUrl = tRes.data.url;
      }
    }

    if (streamUrl) {
      // Передаем заголовок Range для перемотки
      const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' };
      if (req.headers.range) headers['Range'] = req.headers.range;

      // Скачиваем с CDN SoundCloud
      const response = await axios({
        method: 'get',
        url: streamUrl,
        responseType: 'stream',
        headers: headers,
        validateStatus: status => status >= 200 && status < 400
      });

      // Передаем ВСЕ нужные заголовки браузеру (это чинит ползунок!)
      res.status(response.status);
      if (response.headers['content-range']) res.setHeader('Content-Range', response.headers['content-range']);
      if (response.headers['accept-ranges']) res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
      if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
      res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mpeg');

      return response.data.pipe(res);
    }

    // Резервный вариант, если прямую ссылку найти не удалось
    const stream = await scdl.download(trackUrl);
    res.setHeader('Content-Type', 'audio/mpeg');
    stream.pipe(res);

  } catch (err) {
    console.error('Ошибка стриминга:', err.message);
    if (!res.headersSent) res.status(500).send('Ошибка стриминга');
  }
});