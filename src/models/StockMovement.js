const mongoose = require("mongoose");

const movementTypes = ["IN", "OUT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"];

const stockMovementSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
      index: true
    },
    sourcePartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
      index: true
    },
    type: {
      type: String,
      enum: movementTypes,
      required: true,
      index: true
    },
    date: {
      type: Date,
      required: true,
      index: true
    },
    packets: {
      type: Number,
      required: true,
      min: 0
    },
    weight: {
      type: Number,
      required: true,
      min: 0
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    ratePerKg: {
      type: Number,
      default: 0,
      min: 0
    },
    otherExpense: {
      type: Number,
      default: 0,
      min: 0
    },
    partyName: {
      type: String,
      trim: true,
      default: ""
    },
    reason: {
      type: String,
      trim: true,
      default: ""
    },
    note: {
      type: String,
      trim: true,
      default: ""
    },
    referenceType: {
      type: String,
      trim: true,
      default: ""
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    isEdited: {
      type: Boolean,
      default: false,
      index: true
    },
    editedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("StockMovement", stockMovementSchema);
