// Creates (or upgrades) the first admin account.
// Usage:  npm run create-admin
// Reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD from .env
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  const name = process.env.ADMIN_NAME || 'Admin';
  const email = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 6) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (6+ characters) in .env first.');
    process.exit(1);
  }
  await connectDB();
  let user = await User.findOne({ email }).select('+password');
  if (user) {
    user.role = 'admin';
    user.emailVerified = true;
    user.name = name;
    user.password = password;
    await user.save();
    console.log('Existing account upgraded to admin:', email);
  } else {
    user = await User.create({ name, email, password, role: 'admin', emailVerified: true });
    console.log('Admin account created:', email);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
