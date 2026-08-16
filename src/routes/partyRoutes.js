const express = require("express");
const { getParties, createParty, updateParty, getPartyDetails } = require("../controllers/partyController");

const router = express.Router();

router.route("/").get(getParties).post(createParty);
router.patch("/:id", updateParty);
router.get("/:id", getPartyDetails);

module.exports = router;
