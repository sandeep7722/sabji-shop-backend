const mongoose = require("mongoose");

const partyTypes = ["SUPPLIER", "CUSTOMER", "BOTH"];

const partySchema = new mongoose.Schema(
  {
    partyCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 30
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    type: {
      type: String,
      enum: partyTypes,
      default: "BOTH"
    },
    phone: {
      type: String,
      trim: true,
      default: ""
    },
    address: {
      type: String,
      trim: true,
      default: ""
    },
    note: {
      type: String,
      trim: true,
      default: ""
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

partySchema.index(
  { partyCode: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 }
  }
);

partySchema.index({ name: 1 });

module.exports = mongoose.model("Party", partySchema);
