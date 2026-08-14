const Product = require("../models/Product");
const asyncHandler = require("../utils/asyncHandler");

const getProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ isActive: true }).sort({ name: 1 });
  res.json(products);
});

const createProduct = asyncHandler(async (req, res) => {
  const { name, isActive } = req.body;

  if (typeof name !== "string" || !name.trim()) {
    res.status(400);
    throw new Error("Product name is required");
  }

  const normalizedName = name.trim();
  const existingProduct = await Product.findOne({ name: normalizedName }).collation({
    locale: "en",
    strength: 2
  });

  if (existingProduct) {
    res.status(409);
    throw new Error("Product already exists");
  }

  const product = await Product.create({
    name: normalizedName,
    isActive: typeof isActive === "boolean" ? isActive : true
  });

  res.status(201).json(product);
});

module.exports = {
  getProducts,
  createProduct
};
