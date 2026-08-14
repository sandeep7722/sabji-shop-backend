require("dotenv").config();

const connectDB = require("../config/db");
const Product = require("../models/Product");

async function seedProducts() {
  await connectDB();

  const products = ["Potato", "Onion"];

  for (const name of products) {
    await Product.updateOne(
      { name },
      {
        $setOnInsert: {
          name,
          isActive: true
        }
      },
      { upsert: true }
    );
  }

  console.log("Seeded products: Potato, Onion");
  process.exit(0);
}

seedProducts().catch((error) => {
  console.error(error);
  process.exit(1);
});
