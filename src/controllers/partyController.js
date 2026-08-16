const mongoose = require("mongoose");
const Party = require("../models/Party");
const Payment = require("../models/Payment");
const StockMovement = require("../models/StockMovement");
const asyncHandler = require("../utils/asyncHandler");
const { addSignedQuantities, getStockBalanceImpact } = require("../services/stockService");

function validateObjectId(id, fieldName) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.statusCode = 400;
    throw error;
  }
}

const getParties = asyncHandler(async (req, res) => {
  const query = {};

  if (req.query.type) {
    query.type = req.query.type;
  }

  if (req.query.search) {
    query.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { partyCode: { $regex: req.query.search, $options: "i" } },
      { phone: { $regex: req.query.search, $options: "i" } }
    ];
  }

  const parties = await Party.find(query).sort({ name: 1 }).lean();
  res.json(parties);
});

const createParty = asyncHandler(async (req, res) => {
  const { partyCode, name, type, phone, address, note, isActive } = req.body;

  if (typeof partyCode !== "string" || !partyCode.trim()) {
    res.status(400);
    throw new Error("Party code is required");
  }

  if (typeof name !== "string" || !name.trim()) {
    res.status(400);
    throw new Error("Party name is required");
  }

  const party = await Party.create({
    partyCode: partyCode.trim().toUpperCase(),
    name: name.trim(),
    type: type || "BOTH",
    phone: phone || "",
    address: address || "",
    note: note || "",
    isActive: typeof isActive === "boolean" ? isActive : true
  });

  res.status(201).json(party);
});

const updateParty = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "partyId");

  const { partyCode, name, type, phone, address, note, isActive } = req.body;

  if (typeof partyCode !== "string" || !partyCode.trim()) {
    res.status(400);
    throw new Error("Party code is required");
  }

  if (typeof name !== "string" || !name.trim()) {
    res.status(400);
    throw new Error("Party name is required");
  }

  const party = await Party.findById(req.params.id);

  if (!party) {
    res.status(404);
    throw new Error("Party not found");
  }

  const normalizedPartyCode = partyCode.trim().toUpperCase();
  const existingParty = await Party.findOne({
    _id: { $ne: party._id },
    partyCode: normalizedPartyCode
  }).collation({
    locale: "en",
    strength: 2
  });

  if (existingParty) {
    res.status(409);
    throw new Error("Party code already exists");
  }

  party.partyCode = normalizedPartyCode;
  party.name = name.trim();
  party.type = type || "BOTH";
  party.phone = phone || "";
  party.address = address || "";
  party.note = note || "";

  if (typeof isActive === "boolean") {
    party.isActive = isActive;
  }

  await party.save();
  res.json(party);
});

const getPartyDetails = asyncHandler(async (req, res) => {
  validateObjectId(req.params.id, "partyId");

  const party = await Party.findById(req.params.id).lean();

  if (!party) {
    res.status(404);
    throw new Error("Party not found");
  }

  const movements = await StockMovement.find({ partyId: party._id })
    .populate("productId", "name isActive")
    .populate("partyId", "partyCode name type phone")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const payments = await Payment.find({ partyId: party._id })
    .populate("partyId", "partyCode name type phone")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const totals = movements.reduce(
    (summary, movement) => {
      const signed = addSignedQuantities(movement.type, movement.packets, movement.weight);
      const amount = movement.totalAmount || 0;
      summary.packets += signed.packets;
      summary.weight += signed.weight;
      summary.stockBalance += getStockBalanceImpact(movement.type, amount);

      if (movement.type === "IN" || movement.type === "ADJUSTMENT_IN") {
        summary.inPackets += movement.packets;
        summary.inWeight += movement.weight;
        summary.purchaseAmount += amount;
      }

      if (movement.type === "OUT" || movement.type === "ADJUSTMENT_OUT") {
        summary.outPackets += movement.packets;
        summary.outWeight += movement.weight;
        summary.saleAmount += amount;
      }

      return summary;
    },
    {
      packets: 0,
      weight: 0,
      inPackets: 0,
      inWeight: 0,
      outPackets: 0,
      outWeight: 0,
      purchaseAmount: 0,
      saleAmount: 0,
      paidAmount: 0,
      receivedAmount: 0,
      stockBalance: 0,
      paymentBalance: 0,
      balance: 0
    }
  );

  payments.forEach((payment) => {
    if (payment.type === "PAID") {
      totals.paidAmount += payment.amount;
      totals.paymentBalance += payment.amount;
    }

    if (payment.type === "RECEIVED") {
      totals.receivedAmount += payment.amount;
      totals.paymentBalance -= payment.amount;
    }
  });

  totals.balance = totals.stockBalance + totals.paymentBalance;

  res.json({
    party,
    totals,
    movements: movements.map((movement) => {
      const signed = addSignedQuantities(movement.type, movement.packets, movement.weight);

      return {
        ...movement,
        signedPackets: signed.packets,
        signedWeight: signed.weight,
        balanceImpact: getStockBalanceImpact(movement.type, movement.totalAmount || 0)
      };
    }),
    payments
  });
});

module.exports = {
  getParties,
  createParty,
  updateParty,
  getPartyDetails
};
