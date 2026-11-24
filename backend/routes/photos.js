const express = require('express');
const mongoose = require('mongoose');
const Photo = require('../models/Photo');

const router = express.Router();

// GET /api/photos/:id  -> the image itself
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
    const photo = await Photo.findById(req.params.id);
    if (!photo) return res.status(404).end();
    res.set('Content-Type', photo.contentType);
    res.set('Cache-Control', 'public, max-age=604800, immutable');
    res.send(photo.data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
