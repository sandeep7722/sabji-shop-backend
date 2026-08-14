const mongoose = require("mongoose");

const paymentTypes = ["PAID", "RECEIVED"];

const paymentSchema = new mongoose.Schema(
  {
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: paymentTypes,
      required: true,
      index: true
    },
    date: {
      type: Date,
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    mode: {
      type: String,
      trim: true,
      default: "Cash"
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
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Payment", paymentSchema);
