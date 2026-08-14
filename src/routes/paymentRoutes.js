const express = require("express");
const { createPayment, getPayments } = require("../controllers/paymentController");

const router = express.Router();

router.route("/").get(getPayments).post(createPayment);

module.exports = router;
