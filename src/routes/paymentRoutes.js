const express = require("express");
const { createPayment, getCollectionList, getPayments, getPaymentSummary } = require("../controllers/paymentController");

const router = express.Router();

router.get("/collection", getCollectionList);
router.get("/summary", getPaymentSummary);
router.route("/").get(getPayments).post(createPayment);

module.exports = router;
