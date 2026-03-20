'use strict';
const { Router } = require('express');
const { getLyrics } = require('../services/lyrics');
const router = Router();

router.get('/', async (req, res) => {
  const { title, artist='', source='auto' } = req.query;
  if (!title) return res.status(400).json({ error: '缺少 title 参数' });

  try {
    const result = await getLyrics({ title, artist, source });
    if (!result) {
      // Return null data silently — frontend handles empty state display
      return res.json({ success: false, data: null });
    }
    res.json({
      success: true,
      data: {
        source:      result.source,
        lrc:         result.lrc         || null,
        tlyric:      result.translation || null,
        plain:       result.plain       || null,
        title,
        artist,
      },
    });
  } catch (e) {
    console.error('[Lyrics]', e.message);
    res.status(500).json({ success:false, data: null });
  }
});

module.exports = router;
