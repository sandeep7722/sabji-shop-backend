const asyncHandler = require("../utils/asyncHandler");
const stockService = require("../services/stockService");

const stockIn = asyncHandler(async (req, res) => {
  const movement = await stockService.createMovement({
    ...req.body,
    type: "IN"
  });

  res.status(201).json(movement);
});

const stockOut = asyncHandler(async (req, res) => {
  const movement = await stockService.createMovement({
    ...req.body,
    type: "OUT"
  });

  res.status(201).json(movement);
});

const stockAdjustment = asyncHandler(async (req, res) => {
  const { adjustmentType } = req.body;

  if (!["IN", "OUT"].includes(adjustmentType)) {
    res.status(400);
    throw new Error("adjustmentType must be IN or OUT");
  }

  const type = adjustmentType === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";

  const movement = await stockService.createMovement({
    ...req.body,
    type
  });

  res.status(201).json(movement);
});

const getCurrentStock = asyncHandler(async (req, res) => {
  const stock = await stockService.getCurrentStock();
  res.json(stock);
});

const getHistory = asyncHandler(async (req, res) => {
  const history = await stockService.getHistory(req.query);
  res.json(history);
});

const updateHistoryEntry = asyncHandler(async (req, res) => {
  const movement = await stockService.updateMovement(req.params.id, req.body);
  res.json(movement);
});

module.exports = {
  stockIn,
  stockOut,
  stockAdjustment,
  getCurrentStock,
  getHistory,
  updateHistoryEntry
};
