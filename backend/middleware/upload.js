const multer = require('multer');

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

// Keep uploaded images in memory; they are then saved into MongoDB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB
  fileFilter(req, file, cb) {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('শুধু JPG, PNG বা WEBP ছবি দেওয়া যাবে।'), { status: 400 }));
  },
});

module.exports = upload;
