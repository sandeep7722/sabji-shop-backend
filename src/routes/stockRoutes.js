const express = require("express");
const {
  stockIn,
  stockOut,
  stockAdjustment,
  getCurrentStock,
  getHistory,
  getSourceSalesReport,
  getCustomerSalesReport,
  updateHistoryEntry
} = require("../controllers/stockController");

const router = express.Router();

router.post("/in", stockIn);
router.post("/out", stockOut);
router.post("/adjustment", stockAdjustment);
router.get("/current", getCurrentStock);
router.get("/source-sales", getSourceSalesReport);
router.get("/customer-sales", getCustomerSalesReport);
router.get("/history", getHistory);
router.patch("/history/:id", updateHistoryEntry);

module.exports = router;
