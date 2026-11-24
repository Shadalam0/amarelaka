const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { auth, signToken } = require('../middleware/auth');
const { sendMail, codeEmail } = require('../utils/mail');

const router = express.Router();

// Slow down password / code guessing: 20 attempts per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'অনেকবার চেষ্টা করা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;

// LOGIN_OTP=true  -> a code is emailed on EVERY login
// LOGIN_OTP=false -> a code is emailed only until the email is verified (after sign-up)
const loginOtpAlways = () => String(process.env.LOGIN_OTP || '').toLowerCase() === 'true';

const hashCode = (code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(String(code)).digest('hex');

// Create a 6-digit code, save its hash on the user, and email it
async function issueCode(user, purpose) {
  const code = String(crypto.randomInt(100000, 1000000));
  user.otpHash = hashCode(code);
  user.otpExpires = new Date(Date.now() + CODE_MINUTES * 60 * 1000);
  user.otpAttempts = 0;
  user.otpSentAt = new Date();
  await user.save();
  const mail = codeEmail(user.name, code, purpose);
  try {
    await sendMail({ to: user.email, ...mail });
  } catch (err) {
    console.error(err.message);
    throw Object.assign(new Error('কোড ইমেইল করা যায়নি। একটু পরে আবার চেষ্টা করুন।'), { status: 503, expose: true });
  }
}

const needCode = (res, user) =>
  res.json({
    needCode: true,
    email: user.email,
    message: `${user.email} ঠিকানায় ৬ অঙ্কের একটি কোড পাঠানো হয়েছে।`,
  });

// POST /api/auth/register  -> creates the account and emails a code
router.post('/register', limiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');

    if (name.length < 2) return res.status(400).json({ message: 'নাম লিখুন।' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'সঠিক ইমেইল দিন।' });
    if (password.length < 6) return res.status(400).json({ message: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });

    const existing = await User.findOne({ email }).select('+password');
    if (existing && existing.emailVerified) {
      return res.status(409).json({ message: 'এই ইমেইলে আগেই অ্যাকাউন্ট আছে। লগইন করুন।' });
    }

    // Unverified sign-up with the same email: replace its details and send a new code
    const user = existing || new User({ email, role: 'user' });
    user.name = name;
    user.phone = phone;
    user.password = password;
    user.emailVerified = false;
    await issueCode(user, 'verify');
    needCode(res.status(201), user);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login  -> token, or { needCode: true } when an email code is required
router.post('/login', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email }).select('+password +otpSentAt');
    if (!user || !(await user.checkPassword(password))) {
      return res.status(401).json({ message: 'ইমেইল বা পাসওয়ার্ড ভুল।' });
    }
    if (!user.emailVerified || loginOtpAlways()) {
      await issueCode(user, user.emailVerified ? 'login' : 'verify');
      return needCode(res, user);
    }
    res.json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// Checks a code against the user's saved hash. Returns an error message, or null when it is right.
async function checkCode(user, rawCode) {
  const code = String(rawCode || '').replace(/\D/g, '');
  if (!user || !user.otpHash) return 'কোডটি সঠিক নয়। নতুন কোড পাঠান।';
  if (user.otpExpires < new Date()) return 'কোডের মেয়াদ শেষ। নতুন কোড পাঠান।';
  if (user.otpAttempts >= MAX_ATTEMPTS) return 'অনেকবার ভুল কোড দেওয়া হয়েছে। নতুন কোড পাঠান।';
  const ok =
    code.length === 6 &&
    crypto.timingSafeEqual(Buffer.from(hashCode(code)), Buffer.from(user.otpHash));
  if (!ok) {
    user.otpAttempts += 1;
    await user.save();
    return `কোডটি সঠিক নয়। আর ${MAX_ATTEMPTS - user.otpAttempts} বার চেষ্টা করা যাবে।`;
  }
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;
  return null;
}

// POST /api/auth/verify  { email, code }  -> token
router.post('/verify', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email }).select('+otpHash +otpExpires +otpAttempts');
    const error = await checkCode(user, req.body.code);
    if (error) return res.status(400).json({ message: error });
    user.emailVerified = true;
    await user.save();
    res.json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot  { email }  -> emails a reset code (same answer whether or not the account exists)
router.post('/forgot', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'সঠিক ইমেইল দিন।' });
    const generic = { ok: true, message: 'এই ইমেইলে অ্যাকাউন্ট থাকলে ৬ অঙ্কের একটি কোড পাঠানো হয়েছে।' };
    const user = await User.findOne({ email }).select('+otpSentAt');
    if (!user) return res.json(generic);
    const wait = user.otpSentAt ? RESEND_SECONDS - (Date.now() - user.otpSentAt.getTime()) / 1000 : 0;
    if (wait > 0) return res.status(429).json({ message: `${Math.ceil(wait)} সেকেন্ড পর আবার চেষ্টা করুন।` });
    await issueCode(user, 'reset');
    res.json(generic);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset  { email, code, password }  -> sets the new password and logs in
router.post('/reset', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (password.length < 6) return res.status(400).json({ message: 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
    const user = await User.findOne({ email }).select('+password +otpHash +otpExpires +otpAttempts');
    const error = await checkCode(user, req.body.code);
    if (error) return res.status(400).json({ message: error });
    user.password = password;
    user.emailVerified = true; // the code proved they own this email
    await user.save();
    res.json({ token: signToken(user), user: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/resend  { email }  -> sends a new code (once a minute at most)
router.post('/resend', limiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email }).select('+otpHash +otpSentAt');
    // Same answer whether or not the account exists, so emails can't be probed
    const generic = { ok: true, message: 'কোড আবার পাঠানো হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন।' };
    if (!user || !user.otpHash) return res.json(generic);
    const wait = user.otpSentAt ? RESEND_SECONDS - (Date.now() - user.otpSentAt.getTime()) / 1000 : 0;
    if (wait > 0) {
      return res.status(429).json({ message: `${Math.ceil(wait)} সেকেন্ড পর আবার চেষ্টা করুন।` });
    }
    await issueCode(user, user.emailVerified ? 'login' : 'verify');
    res.json(generic);
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
