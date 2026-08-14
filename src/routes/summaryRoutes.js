const express = require("express");
const { getSummary } = require("../controllers/summaryController");

const router = express.Router();

router.get("/", getSummary);

module.exports = router;
