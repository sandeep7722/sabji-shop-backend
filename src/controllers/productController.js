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

const updateProduct = asyncHandler(async (req, res) => {
  const { name } = req.body;

  if (typeof name !== "string" || !name.trim()) {
    res.status(400);
    throw new Error("Product name is required");
  }

  const product = await Product.findOne({ _id: req.params.id, isActive: true });

  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  const normalizedName = name.trim();
  const existingProduct = await Product.findOne({
    _id: { $ne: product._id },
    name: normalizedName
  }).collation({
    locale: "en",
    strength: 2
  });

  if (existingProduct) {
    res.status(409);
    throw new Error("Product already exists");
  }

  product.name = normalizedName;
  await product.save();

  res.json(product);
});

module.exports = {
  getProducts,
  createProduct,
  updateProduct
};
