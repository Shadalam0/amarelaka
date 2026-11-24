const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { auth, signToken } = require('../middleware/auth');

const router = express.Router();

// Slow down password guessing: 20 attempts per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'অনেকবার চেষ্টা করা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register
router.post('/register', limiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');

    if (name.length < 2) return res.status(400).json({ message: 'নাম লিখুন।' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'সঠিক ইমেইল দিন।' });
    if (password.length < 6) return res.status(400).json({ message: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
    if (await User.exists({ email })) return res.status(409).json({ message: 'এই ইমেইলে আগেই অ্যাকাউন্ট আছে।' });

    // Everyone who registers is a normal user. Admins are created with "npm run create-admin".
    const user = await User.create({ name, email, phone, password, role: 'user' });
    res.status(201).json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.checkPassword(password))) {
      return res.status(401).json({ message: 'ইমেইল বা পাসওয়ার্ড ভুল।' });
    }
    res.json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ message: 'অ্যাকাউন্ট পাওয়া যায়নি।' });
    res.json({ user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
