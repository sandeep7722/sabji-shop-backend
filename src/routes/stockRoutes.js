const express = require("express");
const {
  stockIn,
  stockOut,
  stockAdjustment,
  getCurrentStock,
  getHistory
} = require("../controllers/stockController");

const router = express.Router();

router.post("/in", stockIn);
router.post("/out", stockOut);
router.post("/adjustment", stockAdjustment);
router.get("/current", getCurrentStock);
router.get("/history", getHistory);

module.exports = router;
