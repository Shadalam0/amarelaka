// Video storage on Cloudinary (free plan). No SDK needed: the browser uploads the video
// straight to Cloudinary with a signature from us, so videos never pass through Render.
const crypto = require('crypto');

const cfg = () => ({
  cloud: process.env.CLOUDINARY_CLOUD_NAME,
  key: process.env.CLOUDINARY_API_KEY,
  secret: process.env.CLOUDINARY_API_SECRET,
});
const FOLDER = 'amarelaka/videos';
const MAX_SECONDS = 120; // 2 minutes
const MAX_BYTES = 100 * 1024 * 1024; // Cloudinary free plan limit: 100 MB per video

const isEnabled = () => { const c = cfg(); return Boolean(c.cloud && c.key && c.secret); };

// Cloudinary signature: sorted "a=1&b=2" + api_secret, SHA-1
function sign(params) {
  const str = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(str + cfg().secret).digest('hex');
}

function uploadSignature() {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder: FOLDER, timestamp };
  return {
    cloudName: cfg().cloud,
    apiKey: cfg().key,
    folder: FOLDER,
    timestamp,
    signature: sign(params),
    maxSeconds: MAX_SECONDS,
    maxBytes: MAX_BYTES,
  };
}

// Ask Cloudinary for the real facts of an uploaded video (length, size), so users can't fake them
async function getVideo(publicId) {
  const c = cfg();
  const url = `https://api.cloudinary.com/v1_1/${c.cloud}/resources/video/upload/${publicId.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, { headers: { Authorization: 'Basic ' + Buffer.from(`${c.key}:${c.secret}`).toString('base64') } });
  if (!res.ok) return null;
  return res.json();
}

async function destroyVideo(publicId) {
  if (!publicId || !isEnabled()) return;
  const c = cfg();
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({
    public_id: publicId, timestamp: String(timestamp), api_key: c.key,
    signature: sign({ public_id: publicId, timestamp }),
  });
  try {
    await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/video/destroy`, { method: 'POST', body });
  } catch (err) {
    console.error('Cloudinary delete failed:', err.message);
  }
}

// Picture of the video's middle frame, used as its thumbnail
const posterOf = (url) => (url ? url.replace(/\.[a-z0-9]+$/i, '.jpg') : null);

module.exports = { isEnabled, uploadSignature, getVideo, destroyVideo, posterOf, FOLDER, MAX_SECONDS, MAX_BYTES };
