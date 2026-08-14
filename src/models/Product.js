const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
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

productSchema.index(
  { name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 }
  }
);

module.exports = mongoose.model("Product", productSchema);
