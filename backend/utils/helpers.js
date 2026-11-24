const Photo = require('../models/Photo');
const Report = require('../models/Report');

async function savePhoto(file, userId) {
  if (!file) return null;
  const photo = await Photo.create({
    data: file.buffer,
    contentType: file.mimetype,
    size: file.size,
    uploadedBy: userId,
  });
  return photo._id;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
async function makeCode() {
  for (let i = 0; i < 10; i++) {
    let code = 'AE-';
    for (let j = 0; j < 5; j++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!(await Report.exists({ code }))) return code;
  }
  throw new Error('Could not create a unique tracking code');
}

// "Weight" = how many people reported this problem:
// 1 (the original) + supporters + every duplicate merged into it (and their supporters).
function weightMap(reports) {
  const map = new Map();
  for (const r of reports) map.set(String(r._id), 1 + (r.supporters?.length || 0));
  for (const r of reports) {
    if (r.status === 'merged' && r.mergedInto) {
      const parent = String(r.mergedInto);
      if (map.has(parent)) map.set(parent, map.get(parent) + 1 + (r.supporters?.length || 0));
    }
  }
  return map;
}

function severity(weight) {
  if (weight >= 7) return 'urgent';
  if (weight >= 4) return 'high';
  if (weight >= 2) return 'medium';
  return 'normal';
}

// Shape a report for the API (never sends raw supporter ids to the public)
function toPublic(r, weight, userId) {
  const [lng, lat] = r.location?.coordinates || [0, 0];
  const uid = userId ? String(userId) : null;
  return {
    id: r._id,
    code: r.code,
    category: r.category,
    title: r.title,
    description: r.description,
    area: r.area,
    landmark: r.landmark,
    lat,
    lng,
    status: r.status,
    weight,
    severity: severity(weight),
    photo: r.photo || null,
    afterPhoto: r.afterPhoto || null,
    mergedInto: r.mergedInto || null,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt || null,
    isMine: uid ? String(r.createdBy?._id || r.createdBy) === uid : false,
    supported: uid ? (r.supporters || []).some((s) => String(s) === uid) : false,
  };
}

const isNum = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max;
};

module.exports = { savePhoto, makeCode, weightMap, severity, toPublic, isNum };
