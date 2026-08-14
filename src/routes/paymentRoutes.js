const express = require("express");
const { createPayment, getPayments, getPaymentSummary } = require("../controllers/paymentController");

const router = express.Router();

router.get("/summary", getPaymentSummary);
router.route("/").get(getPayments).post(createPayment);

module.exports = router;
