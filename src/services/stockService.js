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

async function calculateCurrentStock(productId, excludeMovementId = null) {
  const match = {};

  if (productId) {
    match.productId = new mongoose.Types.ObjectId(productId);
  }

  if (excludeMovementId) {
    match._id = { $ne: new mongoose.Types.ObjectId(excludeMovementId) };
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

async function ensureAvailable(productId, packets, weight, excludeMovementId = null) {
  const current = await calculateCurrentStock(productId, excludeMovementId);

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

async function ensureEditKeepsStockNonNegative(originalMovement, nextProductId, nextType, packets, weight) {
  const affectedProductIds = new Set([originalMovement.productId.toString(), nextProductId.toString()]);
  const nextSigned = addSignedQuantities(nextType, packets, weight);

  for (const productId of affectedProductIds) {
    const currentWithoutMovement = await calculateCurrentStock(productId, originalMovement._id);
    const appliesToProduct = productId === nextProductId.toString();
    const finalPackets = currentWithoutMovement.packets + (appliesToProduct ? nextSigned.packets : 0);
    const finalWeight = currentWithoutMovement.weight + (appliesToProduct ? nextSigned.weight : 0);

    if (finalPackets < 0 || finalWeight < 0) {
      const error = new Error("Insufficient stock after edit");
      error.statusCode = 400;
      error.details = {
        availablePackets: Math.max(0, currentWithoutMovement.packets),
        availableWeight: Math.max(0, currentWithoutMovement.weight),
        requestedPackets: packets,
        requestedWeight: weight
      };
      throw error;
    }
  }
}

async function createMovement(input) {
  const product = await getProductOrThrow(input.productId);
  const party = await getPartyOrThrow(input.partyId);
  const sourceParty = input.type === "OUT" ? await getPartyOrThrow(input.sourcePartyId) : null;
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
    sourcePartyId: sourceParty ? sourceParty._id : null,
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
  await movement.populate("sourcePartyId", "partyCode name type phone");

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

function parseMovementDate(value) {
  const movementDate = value ? new Date(value) : new Date();

  if (Number.isNaN(movementDate.getTime())) {
    const error = new Error("Invalid date");
    error.statusCode = 400;
    throw error;
  }

  return movementDate;
}

async function syncMovementPayment(movement, paymentAmount, paymentMode, paymentNote) {
  const paymentType = getAutoPaymentType(movement.type);
  const linkedPayment = await Payment.findOne({
    referenceType: "STOCK_MOVEMENT",
    referenceId: movement._id
  });

  if (!movement.partyId || !paymentType || paymentAmount <= 0) {
    if (linkedPayment) {
      await linkedPayment.deleteOne();
    }

    return;
  }

  const paymentData = {
    partyId: movement.partyId,
    type: paymentType,
    date: movement.date,
    amount: paymentAmount,
    mode: paymentMode || (linkedPayment ? linkedPayment.mode : "Cash"),
    note: paymentNote || (linkedPayment ? linkedPayment.note : `Auto payment for stock ${movement.type}`),
    referenceType: "STOCK_MOVEMENT",
    referenceId: movement._id
  };

  if (linkedPayment) {
    Object.assign(linkedPayment, paymentData);
    await linkedPayment.save();
    return;
  }

  await Payment.create(paymentData);
}

async function updateMovement(movementId, input) {
  if (!mongoose.Types.ObjectId.isValid(movementId)) {
    const error = new Error("Invalid movement id");
    error.statusCode = 400;
    throw error;
  }

  const movement = await StockMovement.findById(movementId);

  if (!movement) {
    const error = new Error("Movement not found");
    error.statusCode = 404;
    throw error;
  }

  const nextType = input.type || movement.type;

  if (!MOVEMENT_TYPES.includes(nextType)) {
    const error = new Error("Invalid movement type");
    error.statusCode = 400;
    throw error;
  }

  const product = await getProductOrThrow(input.productId || movement.productId);
  const party = await getPartyOrThrow(input.partyId);
  const sourceParty = nextType === "OUT" ? await getPartyOrThrow(input.sourcePartyId) : null;
  const packets = toNumber(input.packets, "packets");
  const weight = toNumber(input.weight, "weight");
  const totalAmount = toOptionalNumber(input.totalAmount, "totalAmount");
  const paymentAmount = toOptionalNumber(input.paymentAmount, "paymentAmount");
  const movementDate = parseMovementDate(input.date);
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

  await ensureEditKeepsStockNonNegative(movement, product._id, nextType, packets, weight);

  movement.productId = product._id;
  movement.partyId = party ? party._id : null;
  movement.sourcePartyId = sourceParty ? sourceParty._id : null;
  movement.type = nextType;
  movement.date = movementDate;
  movement.packets = packets;
  movement.weight = weight;
  movement.totalAmount = totalAmount;
  movement.partyName = party ? party.name : input.partyName || "";
  movement.reason = input.reason || movement.reason || "";
  movement.note = input.note || "";
  movement.isEdited = true;
  movement.editedAt = new Date();

  await movement.save();
  await syncMovementPayment(movement, paymentAmount, input.paymentMode, input.paymentNote);

  await movement.populate("productId", "name isActive");
  await movement.populate("partyId", "partyCode name type phone");
  await movement.populate("sourcePartyId", "partyCode name type phone");

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
    .populate("sourcePartyId", "partyCode name type phone")
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

  const movementRows = movements.map((movement) => {
    const signed = addSignedQuantities(movement.type, movement.packets, movement.weight);
    const syncedPayment = paymentsByMovement.get(movement._id.toString()) || null;

    return {
      entryType: "STOCK",
      ...movement,
      signedPackets: signed.packets,
      signedWeight: signed.weight,
      paymentAmount: syncedPayment ? syncedPayment.amount : 0,
      paymentType: syncedPayment ? syncedPayment.type : "",
      paymentMode: syncedPayment ? syncedPayment.mode : "",
      balanceImpact: getStockBalanceImpact(movement.type, movement.totalAmount || 0)
    };
  });

  let paymentRows = [];

  if (!filters.productId && !filters.type) {
    const paymentQuery = { referenceType: { $ne: "STOCK_MOVEMENT" } };

    if (filters.partyId) {
      paymentQuery.partyId = filters.partyId;
    }

    if (filters.from || filters.to) {
      paymentQuery.date = {};
    }

    if (filters.from) {
      paymentQuery.date.$gte = new Date(filters.from);
    }

    if (filters.to) {
      const toDate = new Date(filters.to);
      toDate.setHours(23, 59, 59, 999);
      paymentQuery.date.$lte = toDate;
    }

    const standalonePayments = await Payment.find(paymentQuery)
      .populate("partyId", "partyCode name type phone")
      .sort({ date: -1, createdAt: -1 })
      .lean();

    paymentRows = standalonePayments.map((payment) => ({
      _id: payment._id,
      entryType: "PAYMENT",
      productId: null,
      partyId: payment.partyId,
      sourcePartyId: null,
      type: payment.type === "PAID" ? "PAYMENT_PAID" : "PAYMENT_RECEIVED",
      date: payment.date,
      packets: 0,
      weight: 0,
      signedPackets: 0,
      signedWeight: 0,
      totalAmount: 0,
      paymentAmount: payment.amount || 0,
      paymentType: payment.type,
      paymentMode: payment.mode || "",
      balanceImpact: payment.type === "PAID" ? payment.amount || 0 : (payment.amount || 0) * -1,
      note: payment.note || "",
      reason: "",
      partyName: "",
      referenceType: payment.referenceType || "",
      referenceId: payment.referenceId || null,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt
    }));
  }

  return [...movementRows, ...paymentRows].sort((first, second) => {
    const dateDiff = new Date(second.date).getTime() - new Date(first.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime();
  });
}

async function getSourceSalesReport(filters) {
  const query = { type: "OUT", sourcePartyId: { $ne: null } };

  if (filters.sourcePartyId) {
    if (!mongoose.Types.ObjectId.isValid(filters.sourcePartyId)) {
      const error = new Error("Invalid sourcePartyId");
      error.statusCode = 400;
      throw error;
    }

    query.sourcePartyId = filters.sourcePartyId;
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
    .populate("sourcePartyId", "partyCode name type phone")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const movementIds = movements.map((movement) => movement._id);
  const syncedPayments = await Payment.find({
    referenceType: "STOCK_MOVEMENT",
    referenceId: { $in: movementIds }
  }).lean();
  const paymentsByMovement = new Map(syncedPayments.map((payment) => [payment.referenceId.toString(), payment]));

  const rows = movements.map((movement) => {
    const syncedPayment = paymentsByMovement.get(movement._id.toString()) || null;

    return {
      ...movement,
      paymentAmount: syncedPayment ? syncedPayment.amount : 0,
      paymentType: syncedPayment ? syncedPayment.type : "",
      paymentMode: syncedPayment ? syncedPayment.mode : ""
    };
  });

  const sourcePartyIds = filters.sourcePartyId
    ? [new mongoose.Types.ObjectId(filters.sourcePartyId)]
    : Array.from(new Set(rows.map((movement) => movement.sourcePartyId?._id?.toString() || movement.sourcePartyId?.toString()).filter(Boolean))).map(
        (partyId) => new mongoose.Types.ObjectId(partyId)
      );

  const sourcePurchaseQuery = { type: "IN", partyId: { $in: sourcePartyIds } };
  const sourcePaymentQuery = { type: "PAID", partyId: { $in: sourcePartyIds } };

  if (filters.from || filters.to) {
    sourcePurchaseQuery.date = {};
    sourcePaymentQuery.date = {};
  }

  if (filters.from) {
    sourcePurchaseQuery.date.$gte = new Date(filters.from);
    sourcePaymentQuery.date.$gte = new Date(filters.from);
  }

  if (filters.to) {
    const toDate = new Date(filters.to);
    toDate.setHours(23, 59, 59, 999);
    sourcePurchaseQuery.date.$lte = toDate;
    sourcePaymentQuery.date.$lte = toDate;
  }

  const sourcePurchases = sourcePartyIds.length
    ? await StockMovement.find(sourcePurchaseQuery).select("packets weight totalAmount").lean()
    : [];
  const sourcePayments = sourcePartyIds.length ? await Payment.find(sourcePaymentQuery).select("amount").lean() : [];

  const totals = rows.reduce(
    (result, movement) => {
      result.salePackets += movement.packets || 0;
      result.saleWeight += movement.weight || 0;
      result.saleAmount += movement.totalAmount || 0;
      result.receivedAmount += movement.paymentType === "RECEIVED" ? movement.paymentAmount || 0 : 0;
      return result;
    },
    {
      buyPackets: 0,
      buyWeight: 0,
      buyAmount: 0,
      paidAmount: 0,
      salePackets: 0,
      saleWeight: 0,
      saleAmount: 0,
      receivedAmount: 0
    }
  );

  sourcePurchases.forEach((purchase) => {
    totals.buyPackets += purchase.packets || 0;
    totals.buyWeight += purchase.weight || 0;
    totals.buyAmount += purchase.totalAmount || 0;
  });

  sourcePayments.forEach((payment) => {
    totals.paidAmount += payment.amount || 0;
  });

  return { totals, rows };
}

function applyDateRange(query, filters) {
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
}

async function getCustomerSalesReport(filters) {
  const query = { type: "OUT", partyId: { $ne: null } };

  if (filters.customerId) {
    if (!mongoose.Types.ObjectId.isValid(filters.customerId)) {
      const error = new Error("Invalid customerId");
      error.statusCode = 400;
      throw error;
    }

    query.partyId = filters.customerId;
  }

  applyDateRange(query, filters);

  const movements = await StockMovement.find(query)
    .populate("productId", "name isActive")
    .populate("partyId", "partyCode name type phone")
    .populate("sourcePartyId", "partyCode name type phone")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const movementIds = movements.map((movement) => movement._id);
  const syncedPayments = await Payment.find({
    referenceType: "STOCK_MOVEMENT",
    referenceId: { $in: movementIds }
  }).lean();
  const paymentsByMovement = new Map(syncedPayments.map((payment) => [payment.referenceId.toString(), payment]));

  const rows = movements.map((movement) => {
    const syncedPayment = paymentsByMovement.get(movement._id.toString()) || null;

    return {
      ...movement,
      paymentAmount: syncedPayment ? syncedPayment.amount : 0,
      paymentType: syncedPayment ? syncedPayment.type : "",
      paymentMode: syncedPayment ? syncedPayment.mode : ""
    };
  });

  const customerIds = filters.customerId
    ? [new mongoose.Types.ObjectId(filters.customerId)]
    : Array.from(new Set(rows.map((movement) => movement.partyId?._id?.toString() || movement.partyId?.toString()).filter(Boolean))).map(
        (partyId) => new mongoose.Types.ObjectId(partyId)
      );

  const paymentQuery = { type: "RECEIVED", partyId: { $in: customerIds } };
  applyDateRange(paymentQuery, filters);
  const customerPayments = customerIds.length ? await Payment.find(paymentQuery).select("amount").lean() : [];

  const totals = rows.reduce(
    (result, movement) => {
      result.sellPackets += movement.packets || 0;
      result.sellWeight += movement.weight || 0;
      result.sellAmount += movement.totalAmount || 0;
      return result;
    },
    { sellPackets: 0, sellWeight: 0, sellAmount: 0, paidAmount: 0, balanceAmount: 0 }
  );

  customerPayments.forEach((payment) => {
    totals.paidAmount += payment.amount || 0;
  });

  totals.balanceAmount = Math.max(0, totals.sellAmount - totals.paidAmount);

  return { totals, rows };
}

module.exports = {
  addSignedQuantities,
  getStockBalanceImpact,
  getAutoPaymentType,
  createMovement,
  updateMovement,
  getCurrentStock,
  getHistory,
  getSourceSalesReport,
  getCustomerSalesReport,
  MOVEMENT_TYPES
};
