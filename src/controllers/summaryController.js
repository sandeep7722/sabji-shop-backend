const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const StockMovement = require("../models/StockMovement");
const asyncHandler = require("../utils/asyncHandler");

function validateObjectId(id, fieldName) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.statusCode = 400;
    throw error;
  }
}

function addDateRange(query, from, to) {
  if (from || to) {
    query.date = {};
  }

  if (from) {
    query.date.$gte = new Date(from);
  }

  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    query.date.$lte = toDate;
  }
}

const getSummary = asyncHandler(async (req, res) => {
  const movementQuery = { partyId: { $ne: null } };
  const paymentQuery = { partyId: { $ne: null } };

  if (req.query.partyId) {
    validateObjectId(req.query.partyId, "partyId");
    movementQuery.partyId = req.query.partyId;
    paymentQuery.partyId = req.query.partyId;
  }

  addDateRange(movementQuery, req.query.from, req.query.to);
  addDateRange(paymentQuery, req.query.from, req.query.to);

  const movements = await StockMovement.find(movementQuery).select("partyId type packets weight totalAmount").lean();
  const payments = await Payment.find(paymentQuery).select("partyId type amount").lean();
  const summaryByParty = new Map();

  const totals = {
    purchaseAmount: 0,
    saleAmount: 0,
    buyPackets: 0,
    buyWeight: 0,
    sellPackets: 0,
    sellWeight: 0,
    paidAmount: 0,
    receivedAmount: 0,
    payableAmount: 0,
    receivableAmount: 0
  };

  function getPartySummary(partyId) {
    const key = partyId.toString();

    if (!summaryByParty.has(key)) {
      summaryByParty.set(key, { balance: 0 });
    }

    return summaryByParty.get(key);
  }

  movements.forEach((movement) => {
    const partySummary = getPartySummary(movement.partyId);
    const amount = movement.totalAmount || 0;

    if (movement.type === "IN") {
      totals.purchaseAmount += amount;
      totals.buyPackets += movement.packets || 0;
      totals.buyWeight += movement.weight || 0;
      partySummary.balance -= amount;
    }

    if (movement.type === "OUT") {
      totals.saleAmount += amount;
      totals.sellPackets += movement.packets || 0;
      totals.sellWeight += movement.weight || 0;
      partySummary.balance += amount;
    }
  });

  payments.forEach((payment) => {
    const partySummary = getPartySummary(payment.partyId);

    if (payment.type === "PAID") {
      totals.paidAmount += payment.amount;
      partySummary.balance += payment.amount;
    }

    if (payment.type === "RECEIVED") {
      totals.receivedAmount += payment.amount;
      partySummary.balance -= payment.amount;
    }
  });

  summaryByParty.forEach((partySummary) => {
    if (partySummary.balance > 0) {
      totals.receivableAmount += partySummary.balance;
    }

    if (partySummary.balance < 0) {
      totals.payableAmount += Math.abs(partySummary.balance);
    }
  });

  res.json(totals);
});

module.exports = {
  getSummary
};
