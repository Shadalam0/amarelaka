const mongoose = require('mongoose');

// Photos are stored inside MongoDB (not on disk) because free hosts such as
// Render wipe the server's disk on every restart.
const photoSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
    size: Number,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Photo', photoSchema);
