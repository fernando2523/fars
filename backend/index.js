require("dotenv").config();
process.env.TZ = "Asia/Jakarta";
// const PORT = process.env.PORT || 4000;
const PORT = 8181;
const express = require("express");
const cors = require("cors");

const app = express();

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use("/assets/img", express.static("public/images"));
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

const Salesretail = require("./src/routes/salesretail.js");
const Sales = require("./src/routes/sales.js");
const ProdukRoutes = require("./src/routes/produkRoutes.js");
const ExpenseRoutes = require("./src/routes/expenseRoute.js");
const Routes = require("./src/routes/webroutes.js");

app.use("/v1", Salesretail);
app.use("/v1", Sales);
app.use("/v1", Routes);
app.use("/v1", ExpenseRoutes);
app.use("/v1", ProdukRoutes);
app.use("/public/images", express.static("public/images"));

app.get("/", (req, res) => {
  res.send("This Is Page Api Fars");
});

app.use((err, req, res, next) => {
  res.json({
    message: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`Running di Port ${PORT}`);
});

// ── DB Migrations ─────────────────────────────────────────────────────────────
const dbPool = require("./src/config/database");
(async () => {
  try {
    const conn = await dbPool.getConnection();
    // Tambah kolom resi ke tb_picking_list (jika belum ada)
    await conn.query(
      `ALTER TABLE tb_picking_list
         ADD COLUMN IF NOT EXISTS resi VARCHAR(255) DEFAULT NULL AFTER no_pesanan`
    );
    conn.release();
    console.log("[Migration] tb_picking_list.resi: OK");
  } catch (e) {
    console.log("[Migration] Note:", e.message);
  }
})();