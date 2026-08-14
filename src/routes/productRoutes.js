const express = require("express");
const { getProducts, createProduct, updateProduct } = require("../controllers/productController");

const router = express.Router();

router.route("/").get(getProducts).post(createProduct);
router.patch("/:id", updateProduct);

module.exports = router;
