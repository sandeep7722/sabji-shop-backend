require("dotenv").config();

const connectDB = require("../config/db");
const Party = require("../models/Party");
const StockMovement = require("../models/StockMovement");

function makeCode(name, index) {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);

  return `${base || "PARTY"}${String(index).padStart(3, "0")}`;
}

async function migratePartiesFromMovements() {
  await connectDB();

  const partyNames = await StockMovement.distinct("partyName", {
    partyId: null,
    partyName: { $nin: ["", null] }
  });

  let index = 1;

  for (const partyName of partyNames) {
    let party = await Party.findOne({ name: partyName }).collation({ locale: "en", strength: 2 });

    if (!party) {
      let partyCode = makeCode(partyName, index);

      while (await Party.findOne({ partyCode }).collation({ locale: "en", strength: 2 })) {
        index += 1;
        partyCode = makeCode(partyName, index);
      }

      party = await Party.create({
        partyCode,
        name: partyName,
        type: "BOTH"
      });
    }

    await StockMovement.updateMany({ partyId: null, partyName }, { $set: { partyId: party._id } });
    index += 1;
  }

  console.log(`Migrated ${partyNames.length} party names from stock movements`);
  process.exit(0);
}

migratePartiesFromMovements().catch((error) => {
  console.error(error);
  process.exit(1);
});
