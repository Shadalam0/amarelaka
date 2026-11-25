const mongoose = require('mongoose');
const { Schema } = mongoose;

const CATEGORIES = ['pothole', 'light', 'garbage', 'water', 'drain', 'other'];
const STATUSES = ['new', 'verified', 'progress', 'resolved', 'rejected', 'merged'];
const OPEN_STATUSES = ['new', 'verified', 'progress'];

const historySchema = new Schema(
  {
    status: { type: String, enum: STATUSES },
    note: { type: String, maxlength: 500, default: '' },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const reportSchema = new Schema(
  {
    code: { type: String, required: true, unique: true }, // tracking code, e.g. AE-7KQ2M
    category: { type: String, enum: CATEGORIES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    area: { type: String, required: true, trim: true, maxlength: 80 },
    landmark: { type: String, trim: true, maxlength: 100, default: '' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
    },
    photo: { type: Schema.Types.ObjectId, ref: 'Photo' },
    afterPhoto: { type: Schema.Types.ObjectId, ref: 'Photo' },
    // Optional video (up to 2 min) stored on Cloudinary
    video: {
      publicId: String,
      url: String,
      duration: Number, // seconds
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: STATUSES, default: 'new', index: true },
    history: [historySchema],
    mergedInto: { type: Schema.Types.ObjectId, ref: 'Report', default: null, index: true },
    supporters: [{ type: Schema.Types.ObjectId, ref: 'User' }], // "I have this problem too"
    resolvedAt: Date,
  },
  { timestamps: true }
);

reportSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Report', reportSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUSES = STATUSES;
module.exports.OPEN_STATUSES = OPEN_STATUSES;
