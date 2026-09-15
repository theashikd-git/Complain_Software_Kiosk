// Handles saving voice-complaint recordings to disk. Files are named with a
// timestamp + random suffix so two patients submitting at the same second
// never collide. Files stay on this server's disk and are served back to
// admin over the LAN via a static route (see server.js).
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const VOICE_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'voice');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VOICE_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `voice-${uniqueSuffix}${ext}`);
  }
});

// Only accept audio files, cap size at 15MB so someone can't fill the disk.
function fileFilter(req, file, cb) {
  if (file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed for voice complaints.'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }
});

module.exports = upload;
