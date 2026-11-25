const express = require('express');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const User = require('../models/User');
const Photo = require('../models/Photo');
const { CATEGORIES, OPEN_STATUSES } = Report;
const { auth, adminOnly } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { savePhoto, weightMap, toPublic } = require('../utils/helpers');

const router = express.Router();
router.use(auth, adminOnly);

// GET /api/admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const [byStatus, byCategory, byArea, resolveTime, users] = await Promise.all([
      Report.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Report.aggregate([
        { $match: { status: { $in: OPEN_STATUSES } } },
        { $group: { _id: '$category', n: { $sum: 1 } } },
      ]),
      Report.aggregate([
        { $match: { status: { $in: OPEN_STATUSES } } },
        { $group: { _id: '$area', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 8 },
      ]),
      Report.aggregate([
        { $match: { status: 'resolved', resolvedAt: { $ne: null } } },
        { $group: { _id: null, avgMs: { $avg: { $subtract: ['$resolvedAt', '$createdAt'] } } } },
      ]),
      User.countDocuments(),
    ]);
    const status = Object.fromEntries(byStatus.map((s) => [s._id, s.n]));
    res.json({
      status,
      byCategory: Object.fromEntries(CATEGORIES.map((c) => [c, byCategory.find((x) => x._id === c)?.n || 0])),
      byArea: byArea.map((a) => ({ area: a._id, n: a.n })),
      avgResolveDays: resolveTime[0] ? +(resolveTime[0].avgMs / 86400000).toFixed(1) : null,
      users,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/reports?status=open|all|new|...&category=&sort=severity|oldest|newest
router.get('/reports', async (req, res, next) => {
  try {
    const all = await Report.find({}).select('-history').populate('createdBy', 'name phone email').lean();
    const weights = weightMap(all);
    const { status = 'open', category, sort = 'severity' } = req.query;
    let list = all.filter((r) => r.status !== 'merged');
    if (status === 'open') list = list.filter((r) => OPEN_STATUSES.includes(r.status));
    else if (status !== 'all') list = list.filter((r) => r.status === status);
    if (CATEGORIES.includes(category)) list = list.filter((r) => r.category === category);

    const w = (r) => weights.get(String(r._id));
    if (sort === 'oldest') list.sort((a, b) => a.createdAt - b.createdAt);
    else if (sort === 'newest') list.sort((a, b) => b.createdAt - a.createdAt);
    else list.sort((a, b) => w(b) - w(a) || a.createdAt - b.createdAt);

    res.json({
      reports: list.map((r) => ({
        ...toPublic(r, w(r), req.user.id),
        reporter: r.createdBy ? { name: r.createdBy.name, phone: r.createdBy.phone, email: r.createdBy.email } : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/reports/:id/merge-candidates -> same category, nearest first
router.get('/reports/:id/merge-candidates', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'রিপোর্ট পাওয়া যায়নি।' });
    const r = await Report.findById(req.params.id).lean();
    if (!r) return res.status(404).json({ message: 'রিপোর্ট পাওয়া যায়নি।' });
    const list = await Report.find({
      _id: { $ne: r._id },
      category: r.category,
      status: { $nin: ['merged', 'rejected'] },
      location: { $near: { $geometry: r.location, $maxDistance: 2000 } },
    })
      .select('code title area status')
      .limit(10)
      .lean();
    res.json({ reports: list.map((x) => ({ id: x._id, code: x.code, title: x.title, area: x.area, status: x.status })) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/reports/:id/status  (multipart: status, note, mergedInto, afterPhoto)
router.patch('/reports/:id/status', upload.single('afterPhoto'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'রিপোর্ট পাওয়া যায়নি।' });
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'রিপোর্ট পাওয়া যায়নি।' });

    const status = String(req.body.status || '');
    let note = String(req.body.note || '').trim().slice(0, 500);
    if (!['new', 'verified', 'progress', 'resolved', 'rejected', 'merged'].includes(status)) {
      return res.status(400).json({ message: 'সঠিক অবস্থা বেছে নিন।' });
    }
    if (status === 'rejected' && !note) return res.status(400).json({ message: 'বাতিলের কারণ লিখুন।' });

    if (status === 'merged') {
      const targetId = String(req.body.mergedInto || '');
      if (!mongoose.isValidObjectId(targetId) || targetId === String(report._id)) {
        return res.status(400).json({ message: 'মূল রিপোর্ট বেছে নিন।' });
      }
      const target = await Report.findById(targetId).select('status code');
      if (!target || ['merged', 'rejected'].includes(target.status)) {
        return res.status(400).json({ message: 'এই রিপোর্টের সাথে একত্র করা যাবে না।' });
      }
      report.mergedInto = target._id;
      note = note || `একই সমস্যার রিপোর্ট ${target.code} এর সাথে একত্র করা হয়েছে`;
      // Anything previously merged into this report now points to the new main report
      await Report.updateMany({ mergedInto: report._id }, { $set: { mergedInto: target._id } });
    } else {
      report.mergedInto = null;
    }

    if (status === 'resolved') {
      report.resolvedAt = new Date();
      if (req.file) report.afterPhoto = await savePhoto(req.file, req.user.id);
    } else {
      report.resolvedAt = undefined;
    }

    report.status = status;
    report.history.push({ status, note, by: req.user.id, at: new Date() });
    await report.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/reports/:id  -> removes a fake/spam report for good, with its photos.
// Reports that had been merged into it become separate open reports again.
router.delete('/reports/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'রিপোর্ট পাওয়া যায়নি।' });
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'রিপোর্ট পাওয়া যায়নি।' });

    const children = await Report.find({ mergedInto: report._id });
    for (const c of children) {
      c.mergedInto = null;
      c.status = 'new';
      c.history.push({ status: 'new', note: 'মূল রিপোর্টটি মুছে ফেলায় এটি আবার আলাদা রিপোর্ট হয়েছে', by: req.user.id, at: new Date() });
      await c.save();
    }
    const photos = [report.photo, report.afterPhoto].filter(Boolean);
    if (photos.length) await Photo.deleteMany({ _id: { $in: photos } });
    await report.deleteOne();
    console.log(`Report ${report.code} deleted by admin ${req.user.id}`);
    res.json({ ok: true, code: report.code, unmerged: children.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).limit(500).lean();
    const counts = await Report.aggregate([{ $group: { _id: '$createdBy', n: { $sum: 1 } } }]);
    const cmap = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({
      users: users.map((u) => ({
        id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role,
        createdAt: u.createdAt, reports: cmap.get(String(u._id)) || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/role  { role: "admin" | "user" }
router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const role = req.body.role;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ message: 'সঠিক ভূমিকা দিন।' });
    if (req.params.id === req.user.id) return res.status(400).json({ message: 'নিজের ভূমিকা বদলানো যাবে না।' });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'ব্যবহারকারী পাওয়া যায়নি।' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ message: 'ব্যবহারকারী পাওয়া যায়নি।' });
    res.json({ user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
