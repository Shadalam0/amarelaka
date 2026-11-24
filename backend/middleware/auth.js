const jwt = require('jsonwebtoken');
const User = require('../models/User');

function readToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// Login required
function auth(req, res, next) {
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ message: 'অনুগ্রহ করে লগইন করুন।' });
  req.user = payload; // { id, role, name }
  next();
}

// Login optional (used for public pages that show extra info to logged-in users)
function optionalAuth(req, res, next) {
  req.user = readToken(req);
  next();
}

// Admin only — role is re-checked in the database, so a removed admin loses access immediately
async function adminOnly(req, res, next) {
  try {
    const user = await User.findById(req.user?.id).select('role');
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'শুধু অ্যাডমিনদের জন্য।' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

function signToken(user) {
  return jwt.sign(
    { id: String(user._id), role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { auth, optionalAuth, adminOnly, signToken };
