const mongoose = require("mongoose");
const Party = require("../models/Party");
const Payment = require("../models/Payment");
const StockMovement = require("../models/StockMovement");
const asyncHandler = require("../utils/asyncHandler");

const PAYMENT_TYPES = ["PAID", "RECEIVED"];

function validateObjectId(id, fieldName) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.statusCode = 400;
    throw error;
  }
}

function parseAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error("amount must be greater than zero");
    error.statusCode = 400;
    throw error;
  }

  return amount;
}

const createPayment = asyncHandler(async (req, res) => {
  const { partyId, type, date, amount, mode, note } = req.body;

  validateObjectId(partyId, "partyId");

  if (!PAYMENT_TYPES.includes(type)) {
    res.status(400);
    throw new Error("type must be PAID or RECEIVED");
  }

  const party = await Party.findOne({ _id: partyId, isActive: true });

  if (!party) {
    res.status(404);
    throw new Error("Party not found");
  }

  const paymentDate = date ? new Date(date) : new Date();

  if (Number.isNaN(paymentDate.getTime())) {
    res.status(400);
    throw new Error("Invalid date");
  }

  const payment = await Payment.create({
    partyId: party._id,
    type,
    date: paymentDate,
    amount: parseAmount(amount),
    mode: mode || "Cash",
    note: note || ""
  });

  await payment.populate("partyId", "partyCode name type phone");
  res.status(201).json(payment);
});

const getPayments = asyncHandler(async (req, res) => {
  const query = {};

  if (req.query.partyId) {
    validateObjectId(req.query.partyId, "partyId");
    query.partyId = req.query.partyId;
  }

  if (req.query.type) {
    if (!PAYMENT_TYPES.includes(req.query.type)) {
      res.status(400);
      throw new Error("Invalid payment type");
    }

    query.type = req.query.type;
  }

  if (req.query.from || req.query.to) {
    query.date = {};
  }

  if (req.query.from) {
    query.date.$gte = new Date(req.query.from);
  }

  if (req.query.to) {
    const toDate = new Date(req.query.to);
    toDate.setHours(23, 59, 59, 999);
    query.date.$lte = toDate;
  }

  const payments = await Payment.find(query)
    .populate("partyId", "partyCode name type phone")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  res.json(payments);
});

const getPaymentSummary = asyncHandler(async (req, res) => {
  const movements = await StockMovement.find({ partyId: { $ne: null } }).select("partyId type totalAmount").lean();
  const payments = await Payment.find({ partyId: { $ne: null } }).select("partyId type amount").lean();
  const summaryByParty = new Map();

  function getPartySummary(partyId) {
    const key = partyId.toString();

    if (!summaryByParty.has(key)) {
      summaryByParty.set(key, {
        purchaseAmount: 0,
        saleAmount: 0,
        paidAmount: 0,
        receivedAmount: 0,
        balance: 0
      });
    }

    return summaryByParty.get(key);
  }

  movements.forEach((movement) => {
    const summary = getPartySummary(movement.partyId);
    const amount = movement.totalAmount || 0;

    if (movement.type === "IN") {
      summary.purchaseAmount += amount;
      summary.balance -= amount;
    }

    if (movement.type === "OUT") {
      summary.saleAmount += amount;
      summary.balance += amount;
    }
  });

  payments.forEach((payment) => {
    const summary = getPartySummary(payment.partyId);

    if (payment.type === "PAID") {
      summary.paidAmount += payment.amount;
      summary.balance += payment.amount;
    }

    if (payment.type === "RECEIVED") {
      summary.receivedAmount += payment.amount;
      summary.balance -= payment.amount;
    }
  });

  const totals = Array.from(summaryByParty.values()).reduce(
    (result, partySummary) => {
      result.purchaseAmount += partySummary.purchaseAmount;
      result.saleAmount += partySummary.saleAmount;
      result.paidAmount += partySummary.paidAmount;
      result.receivedAmount += partySummary.receivedAmount;

      if (partySummary.balance > 0) {
        result.receivableAmount += partySummary.balance;
      }

      if (partySummary.balance < 0) {
        result.payableAmount += Math.abs(partySummary.balance);
      }

      return result;
    },
    {
      purchaseAmount: 0,
      saleAmount: 0,
      paidAmount: 0,
      receivedAmount: 0,
      receivableAmount: 0,
      payableAmount: 0
    }
  );

  res.json(totals);
});

const getCollectionList = asyncHandler(async (req, res) => {
  const movements = await StockMovement.find({ partyId: { $ne: null } }).select("partyId type totalAmount").lean();
  const payments = await Payment.find({ partyId: { $ne: null } }).select("partyId type amount").lean();
  const balanceByParty = new Map();

  function addBalance(partyId, amount) {
    const key = partyId.toString();
    balanceByParty.set(key, (balanceByParty.get(key) || 0) + amount);
  }

  movements.forEach((movement) => {
    const amount = movement.totalAmount || 0;

    if (movement.type === "IN") {
      addBalance(movement.partyId, amount * -1);
    }

    if (movement.type === "OUT") {
      addBalance(movement.partyId, amount);
    }
  });

  payments.forEach((payment) => {
    if (payment.type === "PAID") {
      addBalance(payment.partyId, payment.amount || 0);
    }

    if (payment.type === "RECEIVED") {
      addBalance(payment.partyId, (payment.amount || 0) * -1);
    }
  });

  const receivablePartyIds = Array.from(balanceByParty.entries())
    .filter(([, balance]) => balance > 0)
    .map(([partyId]) => partyId);

  if (!receivablePartyIds.length) {
    res.json([]);
    return;
  }

  const parties = await Party.find({ _id: { $in: receivablePartyIds }, isActive: true })
    .select("partyCode name phone address")
    .sort({ name: 1 })
    .lean();

  const rows = parties
    .map((party) => ({
      _id: party._id,
      partyCode: party.partyCode,
      name: party.name,
      phone: party.phone || "",
      address: party.address || "",
      collectionAmount: balanceByParty.get(party._id.toString()) || 0
    }))
    .filter((party) => party.collectionAmount > 0)
    .sort((first, second) => second.collectionAmount - first.collectionAmount || first.name.localeCompare(second.name));

  res.json(rows);
});

module.exports = {
  createPayment,
  getPayments,
  getPaymentSummary,
  getCollectionList
};
