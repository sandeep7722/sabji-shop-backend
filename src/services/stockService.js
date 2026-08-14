const mongoose = require("mongoose");
const Product = require("../models/Product");
const Party = require("../models/Party");
const Payment = require("../models/Payment");
const StockMovement = require("../models/StockMovement");

const ADD_TYPES = ["IN", "ADJUSTMENT_IN"];
const SUBTRACT_TYPES = ["OUT", "ADJUSTMENT_OUT"];
const MOVEMENT_TYPES = [...ADD_TYPES, ...SUBTRACT_TYPES];

function toNumber(value, fieldName) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    const error = new Error(`${fieldName} must be a positive number or zero`);
    error.statusCode = 400;
    throw error;
  }

  return numberValue;
}

function toOptionalNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  return toNumber(value, fieldName);
}

function requirePositiveQuantity(packets, weight) {
  if (packets <= 0 && weight <= 0) {
    const error = new Error("Either packets or weight must be greater than zero");
    error.statusCode = 400;
    throw error;
  }
}

async function getProductOrThrow(productId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error("Invalid productId");
    error.statusCode = 400;
    throw error;
  }

  const product = await Product.findOne({ _id: productId, isActive: true });

  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }

  return product;
}

function addSignedQuantities(type, packets, weight) {
  const multiplier = ADD_TYPES.includes(type) ? 1 : -1;

  return {
    packets: packets * multiplier,
    weight: weight * multiplier
  };
}

function getStockBalanceImpact(type, totalAmount) {
  if (type === "OUT") {
    return totalAmount;
  }

  if (type === "IN") {
    return totalAmount * -1;
  }

  return 0;
}

function getAutoPaymentType(movementType) {
  if (movementType === "IN") {
    return "PAID";
  }

  if (movementType === "OUT") {
    return "RECEIVED";
  }

  return null;
}

async function getPartyOrThrow(partyId) {
  if (!partyId) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(partyId)) {
    const error = new Error("Invalid partyId");
    error.statusCode = 400;
    throw error;
  }

  const party = await Party.findOne({ _id: partyId, isActive: true });

  if (!party) {
    const error = new Error("Party not found");
    error.statusCode = 404;
    throw error;
  }

  return party;
}

async function calculateCurrentStock(productId) {
  const match = {};

  if (productId) {
    match.productId = new mongoose.Types.ObjectId(productId);
  }

  const rows = await StockMovement.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$productId",
        packets: {
          $sum: {
            $cond: [{ $in: ["$type", ADD_TYPES] }, "$packets", { $multiply: ["$packets", -1] }]
          }
        },
        weight: {
          $sum: {
            $cond: [{ $in: ["$type", ADD_TYPES] }, "$weight", { $multiply: ["$weight", -1] }]
          }
        }
      }
    }
  ]);

  if (productId) {
    return rows[0] || { _id: productId, packets: 0, weight: 0 };
  }

  return rows;
}

async function getCurrentStock() {
  const products = await Product.find({ isActive: true }).sort({ name: 1 }).lean();
  const stockRows = await calculateCurrentStock();
  const stockByProduct = new Map(stockRows.map((row) => [row._id.toString(), row]));

  return products.map((product) => {
    const stock = stockByProduct.get(product._id.toString()) || { packets: 0, weight: 0 };

    return {
      product,
      packets: stock.packets,
      weight: stock.weight
    };
  });
}

async function ensureAvailable(productId, packets, weight) {
  const current = await calculateCurrentStock(productId);

  if (current.packets < packets || current.weight < weight) {
    const error = new Error("Insufficient stock");
    error.statusCode = 400;
    error.details = {
      availablePackets: current.packets,
      availableWeight: current.weight,
      requestedPackets: packets,
      requestedWeight: weight
    };
    throw error;
  }
}

async function createMovement(input) {
  const product = await getProductOrThrow(input.productId);
  const party = await getPartyOrThrow(input.partyId);
  const packets = toNumber(input.packets, "packets");
  const weight = toNumber(input.weight, "weight");
  const totalAmount = toOptionalNumber(input.totalAmount, "totalAmount");
  const paymentAmount = toOptionalNumber(input.paymentAmount, "paymentAmount");
  requirePositiveQuantity(packets, weight);

  if (paymentAmount > 0 && !party) {
    const error = new Error("partyId is required when paymentAmount is greater than zero");
    error.statusCode = 400;
    throw error;
  }

  if (paymentAmount > totalAmount) {
    const error = new Error("paymentAmount cannot be greater than totalAmount");
    error.statusCode = 400;
    throw error;
  }

  const movementDate = input.date ? new Date(input.date) : new Date();

  if (Number.isNaN(movementDate.getTime())) {
    const error = new Error("Invalid date");
    error.statusCode = 400;
    throw error;
  }

  if (SUBTRACT_TYPES.includes(input.type)) {
    await ensureAvailable(product._id, packets, weight);
  }

  const movement = await StockMovement.create({
    productId: product._id,
    partyId: party ? party._id : null,
    type: input.type,
    date: movementDate,
    packets,
    weight,
    totalAmount,
    partyName: party ? party.name : input.partyName || "",
    reason: input.reason || "",
    note: input.note || "",
    referenceType: input.referenceType || "",
    referenceId: input.referenceId || null
  });

  await movement.populate("productId", "name isActive");
  await movement.populate("partyId", "partyCode name type phone");

  const paymentType = getAutoPaymentType(input.type);

  if (party && paymentType && paymentAmount > 0) {
    await Payment.create({
      partyId: party._id,
      type: paymentType,
      date: movementDate,
      amount: paymentAmount,
      mode: input.paymentMode || "Cash",
      note: input.paymentNote || `Auto payment for stock ${input.type}`,
      referenceType: "STOCK_MOVEMENT",
      referenceId: movement._id
    });
  }

  return movement;
}

async function getHistory(filters) {
  const query = {};

  if (filters.productId) {
    if (!mongoose.Types.ObjectId.isValid(filters.productId)) {
      const error = new Error("Invalid productId");
      error.statusCode = 400;
      throw error;
    }

    query.productId = filters.productId;
  }

  if (filters.partyId) {
    if (!mongoose.Types.ObjectId.isValid(filters.partyId)) {
      const error = new Error("Invalid partyId");
      error.statusCode = 400;
      throw error;
    }

    query.partyId = filters.partyId;
  }

  if (filters.type) {
    if (!MOVEMENT_TYPES.includes(filters.type)) {
      const error = new Error("Invalid movement type");
      error.statusCode = 400;
      throw error;
    }

    query.type = filters.type;
  }

  if (filters.from || filters.to) {
    query.date = {};
  }

  if (filters.from) {
    query.date.$gte = new Date(filters.from);
  }

  if (filters.to) {
    const toDate = new Date(filters.to);
    toDate.setHours(23, 59, 59, 999);
    query.date.$lte = toDate;
  }

  const movements = await StockMovement.find(query)
    .populate("productId", "name isActive")
    .populate("partyId", "partyCode name type phone")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const movementIds = movements.map((movement) => movement._id);
  const syncedPayments = await Payment.find({
    referenceType: "STOCK_MOVEMENT",
    referenceId: { $in: movementIds }
  }).lean();
  const paymentsByMovement = new Map(
    syncedPayments.map((payment) => [
      payment.referenceId.toString(),
      {
        amount: payment.amount,
        type: payment.type,
        mode: payment.mode
      }
    ])
  );

  return movements.map((movement) => {
    const signed = addSignedQuantities(movement.type, movement.packets, movement.weight);
    const syncedPayment = paymentsByMovement.get(movement._id.toString()) || null;

    return {
      ...movement,
      signedPackets: signed.packets,
      signedWeight: signed.weight,
      paymentAmount: syncedPayment ? syncedPayment.amount : 0,
      paymentType: syncedPayment ? syncedPayment.type : "",
      paymentMode: syncedPayment ? syncedPayment.mode : "",
      balanceImpact: getStockBalanceImpact(movement.type, movement.totalAmount || 0)
    };
  });
}

module.exports = {
  addSignedQuantities,
  getStockBalanceImpact,
  getAutoPaymentType,
  createMovement,
  getCurrentStock,
  getHistory,
  MOVEMENT_TYPES
};
