const express = require("express");
const { getParties, createParty, getPartyDetails } = require("../controllers/partyController");

const router = express.Router();

router.route("/").get(getParties).post(createParty);
router.get("/:id", getPartyDetails);

module.exports = router;
