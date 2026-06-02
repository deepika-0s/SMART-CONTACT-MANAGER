/**
 * models/Contact.js — Mongoose schema for a Contact document.
 */

const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      match: [/^[+\d\s\-().]{7,20}$/, 'Invalid phone number format'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    tags: {
      type: [String],
      default: [],
    },
    // Graph relationships: stores related contact IDs and relationship labels
    relationships: [
      {
        contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
        type: { type: String, enum: ['friend', 'work', 'family', 'other'], default: 'other' },
      },
    ],
  },
  { timestamps: true }
);

// Index on name for faster DB queries (Trie handles in-memory prefix search)
contactSchema.index({ name: 1 });

module.exports = mongoose.model('Contact', contactSchema);
