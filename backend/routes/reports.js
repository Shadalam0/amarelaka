const express = require('express');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const { CATEGORIES, OPEN_STATUSES } = Report;
const { auth, optionalAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { savePhoto, makeCode, weightMap, toPublic, isNum } = require('../utils/helpers');

const router = express.Router();
const LIST_FIELDS = '-history -description';

// GET /api/reports?category=&status=&mine=1&includeResolved=1
// Public list for the map (merged duplicates and rejected reports are hidden).
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const all = await Report.find({}).select(LIST_FIELDS).sort({ createdAt: -1 }).limit(2000).lean();
    const weights = weightMap(all);
    const uid = req.user?.id;
    let list = all;

    if (req.query.mine === '1') {
      if (!uid) return res.status(401).json({ message: 'অনুগ্রহ করে লগইন করুন।' });
      list = list.filter(
        (r) => String(r.createdBy) === uid || (r.supporters || []).some((s) => String(s) === uid)
      );
    } else {
      list = list.filter((r) => !['merged', 'rejected'].includes(r.status));
      if (req.query.includeResolved === '0') list = list.filter((r) => r.status !== 'resolved');
    }
    if (CATEGORIES.includes(req.query.category)) list = list.filter((r) => r.category === req.query.category);
    if (req.query.status) list = list.filter((r) => r.status === req.query.status);

    res.json({ reports: list.map((r) => toPublic(r, weights.get(String(r._id)), uid)) });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/nearby?lat=&lng=&category=
// Open reports of the same category close to a point — used to suggest "I have this problem too".
router.get('/nearby', optionalAuth, async (req, res, next) => {
  try {
    const { lat, lng, category } = req.query;
    if (!isNum(lat, -90, 90) || !isNum(lng, -180, 180) || !CATEGORIES.includes(category)) {
      return res.json({ reports: [] });
    }
    const meters = Number(process.env.NEARBY_METERS) || 100;
    const near = await Report.find({
      category,
      status: { $in: OPEN_STATUSES },
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          $maxDistance: meters,
        },
      },
    })
      .select(LIST_FIELDS)
      .limit(3)
      .lean();
    const children = await Report.find({ mergedInto: { $in: near.map((r) => r._id) } })
      .select('status mergedInto supporters')
      .lean();
    const weights = weightMap([...near, ...children]);
    res.json({ reports: near.map((r) => toPublic(r, weights.get(String(r._id)), req.user?.id)) });
  } catch (err) {
    next(err);
  }
});

async function detail(report, userId) {
  const children = await Report.find({ mergedInto: report._id }).select('status mergedInto supporters code').lean();
  const weights = weightMap([report, ...children]);
  const out = toPublic(report, weights.get(String(report._id)), userId);
  out.mergedCount = children.filter((c) => c.status === 'merged').length;
  out.history = (report.history || []).map((h) => ({ status: h.status, note: h.note, at: h.at }));
  if (report.mergedInto) {
    const parent = await Report.findById(report.mergedInto).select('code').lean();
    out.mergedIntoCode = parent?.code || null;
  }
  return out;
}

// GET /api/reports/code/AE-XXXXX  -> track by tracking code
router.get('/code/:code', optionalAuth, async (req, res, next) => {
  try {
    const code = String(req.params.code).trim().toUpperCase();
    const report = await Report.findOne({ code }).lean();
    if (!report) return res.status(404).json({ message: 'এই কোডে কোনো রিপোর্ট পাওয়া যায়নি।' });
    res.json({ report: await detail(report, req.user?.id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:id
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'রিপোর্ট পাওয়া যায়নি।' });
    const report = await Report.findById(req.params.id).lean();
    if (!report) return res.status(404).json({ message: 'রিপোর্ট পাওয়া যায়নি।' });
    res.json({ report: await detail(report, req.user?.id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports  (multipart form: category, title, description, area, landmark, lat, lng, photo)
router.post('/', auth, upload.single('photo'), async (req, res, next) => {
  try {
    const b = req.body;
    const title = String(b.title || '').trim();
    const area = String(b.area || '').trim();
    if (!CATEGORIES.includes(b.category)) return res.status(400).json({ message: 'সমস্যার ধরন বেছে নিন।' });
    if (title.length < 3) return res.status(400).json({ message: 'সমস্যাটি সংক্ষেপে লিখুন।' });
    if (area.length < 2) return res.status(400).json({ message: 'এলাকার নাম লিখুন।' });
    if (!isNum(b.lat, -90, 90) || !isNum(b.lng, -180, 180)) {
      return res.status(400).json({ message: 'ম্যাপে লোকেশন বেছে নিন।' });
    }

    const photo = await savePhoto(req.file, req.user.id);
    const report = await Report.create({
      code: await makeCode(),
      category: b.category,
      title: title.slice(0, 100),
      description: String(b.description || '').trim().slice(0, 1000),
      area: area.slice(0, 80),
      landmark: String(b.landmark || '').trim().slice(0, 100),
      location: { type: 'Point', coordinates: [Number(b.lng), Number(b.lat)] },
      photo,
      createdBy: req.user.id,
      history: [{ status: 'new', note: 'অভিযোগ জমা দেওয়া হয়েছে', by: req.user.id }],
    });
    res.status(201).json({ report: toPublic(report.toObject(), 1, req.user.id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/:id/support  -> "I have this problem too"
router.post('/:id/support', auth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'রিপোর্ট পাওয়া যায়নি।' });
    const report = await Report.findById(req.params.id).select('createdBy status');
    if (!report) return res.status(404).json({ message: 'রিপোর্ট পাওয়া যায়নি।' });
    if (String(report.createdBy) === req.user.id) {
      return res.status(400).json({ message: 'এটি আপনার নিজের রিপোর্ট।' });
    }
    if (!OPEN_STATUSES.includes(report.status)) {
      return res.status(400).json({ message: 'এই রিপোর্টটি আর খোলা নেই।' });
    }
    await Report.updateOne({ _id: report._id }, { $addToSet: { supporters: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
