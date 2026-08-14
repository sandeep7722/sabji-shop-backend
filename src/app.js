const express = require("express");
const cors = require("cors");
require("dotenv").config();

const productRoutes = require("./routes/productRoutes");
const partyRoutes = require("./routes/partyRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const summaryRoutes = require("./routes/summaryRoutes");
const stockRoutes = require("./routes/stockRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/products", productRoutes);
app.use("/api/parties", partyRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/stock", stockRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
