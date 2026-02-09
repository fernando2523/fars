const dbPool = require("../config/database");

const date = require("date-and-time");
const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
const tanggal2 = date.format(new Date(), "YYYY-MM-DD");
const tanggalinput = date.format(new Date(), "YYYYMMDD");
const tahun = date.format(new Date(), "YY");
const { generateFromEmail } = require("unique-username-generator");

const getStore_salesretail = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  try {
    await connection.beginTransaction();

    const [data_role] = await connection.query(
      `SELECT * FROM tb_karyawan WHERE role='${body.role}'`
    );

    if (body.role === 'SUPER-ADMIN') {
      var [data_store] = await connection.query(
        `SELECT * FROM tb_store WHERE channel='OFFLINE STORE'`
      );
    } else if (body.role === 'HEAD-AREA') {
      var [data_store] = await connection.query(
        `SELECT * FROM tb_store WHERE id_area='${data_role[0].id_store}' AND channel='OFFLINE STORE'`
      );
    } else {
      var [list_data_role] = await connection.query(
        `SELECT * FROM tb_karyawan WHERE role='${body.role}' AND id_store='${body.store}'`
      );
      for (let x = 0; x < list_data_role.length; x++) {
        var [data_store] = await connection.query(
          `SELECT * FROM tb_store WHERE id_store='${list_data_role[x].id_store}' AND channel='OFFLINE STORE' GROUP BY id_store`
        );
      }
    }

    // console.log(data_store)
    await connection.commit();
    await connection.release();

    return data_store;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const getKasir = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
  try {
    await connection.beginTransaction();
    const [data_kasir] = await connection.query(
      `SELECT * FROM tb_karyawan WHERE status_account='ACTIVE' AND id_store='${body.idstore}' AND name='${body.users}'`
    );

    await connection.commit();
    await connection.release();

    return data_kasir;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const getResellersales = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
  try {
    await connection.beginTransaction();

    const [data_kasir] = await connection.query(`SELECT * FROM tb_reseller`);

    await connection.commit();
    await connection.release();

    return data_kasir;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const productsSalesretail = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  const datas = [];

  if (body.query != "all") {
    var [query_produk] = await connection.query(
      `SELECT * FROM tb_produk WHERE id_produk LIKE '%${body.query}%' OR produk LIKE '%${body.query}%' GROUP BY id_produk ORDER BY id DESC LIMIT 24`
    );
    var [query_nota] = await connection.query(
      `SELECT *, SUM(qty) as qty FROM tb_notabarang WHERE produk LIKE '%${body.query}%' AND status_pesanan != "SEDANG DIKIRIM" AND status_pesanan != "SELESAI" GROUP BY id_nota,produk,size,id_sup ORDER BY id DESC`
    );
  } else {
    var [query_produk] = await connection.query(
      `SELECT * FROM tb_produk GROUP BY id_produk ORDER BY id DESC  LIMIT 24`
    );
    var [query_nota] = await connection.query(
      `SELECT *, SUM(qty) as qty FROM tb_notabarang WHERE status_pesanan != "SEDANG DIKIRIM" AND status_pesanan != "SELESAI" GROUP BY id_nota,produk,size,id_sup ORDER BY id DESC`
    );
  }

  try {
    await connection.beginTransaction();

    for (let i = 0; i < query_produk.length; i++) {
      var [variation_sales] = await connection.query(
        `SELECT *, SUM(qty) as qty FROM tb_variation WHERE id_produk='${query_produk[i].id_produk}' GROUP BY size,id_produk`
      );

      var [variationcount] = await connection.query(
        `SELECT id_produk, SUM(qty) as total_qty, id_ware FROM tb_variation WHERE id_produk='${query_produk[i].id_produk}' GROUP BY id_produk,id_ware`
      );

      datas.push({
        id: query_produk[i].id,
        id_produk: query_produk[i].id_produk,
        id_ware: query_produk[i].id_ware,
        id_brand: query_produk[i].id_brand,
        id_category: query_produk[i].id_category,
        tanggal_upload: query_produk[i].tanggal_upload,
        produk: query_produk[i].produk,
        deskripsi: query_produk[i].deskripsi,
        quality: query_produk[i].quality,
        n_price: query_produk[i].n_price,
        r_price: query_produk[i].r_price,
        g_price: query_produk[i].g_price,
        img: query_produk[i].img,
        users: query_produk[i].users,
        variation_sales: variation_sales,
        variationcount: variationcount,
        stok: "Internal",
      });
    }

    await connection.commit();
    await connection.release();

    return datas;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const inputSalesretail = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY-MM-DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
  let datas = [];
  let transactionStarted = false;

  try {
    // Generate id_mutasi
    const [cek_mutasi] = await connection.query(
      `SELECT MAX(id_mutasi) as id_mutasi FROM tb_mutasistock`
    );
    let id_mutasi = cek_mutasi[0].id_mutasi === null
      ? "MT-00000001"
      : "MT-" + String(parseInt(cek_mutasi[0].id_mutasi.toString().slice(-8)) + 1).padStart(8, "0");

    // Generate id_invoice
    const [cek_invoice] = await connection.query(
      `SELECT MAX(id_invoice) as id_invoice FROM tb_invoice`
    );
    let id_invoice = cek_invoice[0].id_invoice === null
      ? "INV-000000001"
      : "INV-" + String(parseInt(cek_invoice[0].id_invoice.toString().slice(-9)) + 1).padStart(9, "0");

    // Get store data
    const [get_store] = await connection.query(
      `SELECT * FROM tb_store WHERE id_store=?`, [body.id_store]
    );
    const data = body.data;

    // Mulai transaksi
    await connection.beginTransaction();
    transactionStarted = true;

    // Loop produk yang dijual
    for (let index = 0; index < data.length; index++) {
      if (body.status_display === 'display_true') {
        await connection.query(
          `DELETE FROM displays WHERE id_produk=? AND id_ware=?`, [data[index].idproduk, data[index].id_ware]
        );
      }

      const [get_produk] = await connection.query(
        `SELECT * FROM tb_produk WHERE id_produk=? AND id_ware=?`, [data[index].idproduk, data[index].id_ware]
      );

      let [get_var] = await connection.query(
        `SELECT * FROM tb_variation WHERE id_produk=? AND id_ware=? AND size=? AND qty > 0 ORDER BY id ASC`,
        [data[index].idproduk, data[index].id_ware, data[index].size]
      );

      let qty_sales = data[index].qty;

      for (let b = 0; b < get_var.length; b++) {
        let get_qty = get_var[b].qty;
        let qty_baru = parseInt(get_qty) - parseInt(qty_sales);

        const [get_modal] = await connection.query(
          `SELECT m_price FROM tb_purchaseorder WHERE idpo=? AND id_produk=?`,
          [get_var[b].idpo, data[index].idproduk]
        );

        const [get_modal_area] = await connection.query(
          `SELECT tb_area.m_price FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware=?`,
          [data[index].id_ware]
        );

        let m_price = parseInt(get_modal[0]?.m_price || 0) + parseInt(get_modal_area[0]?.m_price || 0);

        if (qty_baru >= 0) {
          let subtotal = data[index].diskon_item === "" ?
            parseInt(data[index].harga_jual) * parseInt(qty_sales) :
            (parseInt(data[index].harga_jual) * parseInt(qty_sales)) - (parseInt(data[index].diskon_item) * parseInt(qty_sales));

          await connection.query(
            `INSERT INTO tb_order (tanggal_order, id_pesanan, id_store, id_produk, source, img, produk, id_brand, id_ware, idpo, quality, size, qty, m_price, selling_price, diskon_item, subtotal, users, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              body.tanggal, id_invoice, body.id_store, data[index].idproduk, 'Barang Gudang', data[index].img, data[index].produk, get_produk[0].id_brand, data[index].id_ware, get_var[b].idpo,
              get_produk[0].quality, data[index].size, qty_sales, m_price, data[index].harga_jual, parseInt(data[index].diskon_item) * parseInt(qty_sales), subtotal, body.kasir, tanggal, tanggal
            ]
          );

          await connection.query(
            `INSERT INTO tb_mutasistock (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id_mutasi, body.tanggal, id_invoice, data[index].id_ware, body.id_store, data[index].idproduk, data[index].produk, get_var[b].idpo, data[index].size, qty_sales,
              'Barang Gudang', '-', 'SALES RETAIL', body.kasir, tanggal, tanggal
            ]
          );

          await connection.query(
            `UPDATE tb_variation SET qty=?, updated_at=? WHERE id_produk=? AND id_ware=? AND size=? AND idpo=?`,
            [qty_baru, tanggal, data[index].idproduk, data[index].id_ware, data[index].size, get_var[b].idpo]
          );
          break;
        } else {
          let qty_sisa = 0;
          let subtotal = data[index].diskon_item === "" ?
            parseInt(data[index].harga_jual) * parseInt(get_var[b].qty) :
            (parseInt(data[index].harga_jual) * parseInt(get_var[b].qty)) - (parseInt(data[index].diskon_item) * parseInt(get_var[b].qty));

          await connection.query(
            `INSERT INTO tb_order (tanggal_order, id_pesanan, id_store, id_produk, source, img, produk, id_brand, id_ware, idpo, quality, size, qty, m_price, selling_price, diskon_item, subtotal, users, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              body.tanggal, id_invoice, body.id_store, data[index].idproduk, 'Barang Gudang', data[index].img, data[index].produk, get_produk[0].id_brand, data[index].id_ware, get_var[b].idpo,
              get_produk[0].quality, data[index].size, get_var[b].qty, m_price, data[index].harga_jual, parseInt(data[index].diskon_item) * parseInt(qty_sales), subtotal, body.kasir, tanggal, tanggal
            ]
          );

          await connection.query(
            `INSERT INTO tb_mutasistock (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id_mutasi, body.tanggal, id_invoice, data[index].id_ware, body.id_store, data[index].idproduk, data[index].produk, get_var[b].idpo, data[index].size, get_var[b].qty,
              'Barang Gudang', '-', 'SALES RETAIL', body.kasir, tanggal, tanggal
            ]
          );

          await connection.query(
            `UPDATE tb_variation SET qty=?, updated_at=? WHERE id_produk=? AND id_ware=? AND size=? AND idpo=?`,
            [qty_sisa, tanggal, data[index].idproduk, data[index].id_ware, data[index].size, get_var[b].idpo]
          );

          qty_sales = parseInt(qty_sales) - parseInt(get_var[b].qty);
        }
      }
    }

    // Insert invoice
    const invoiceParams = [
      body.tanggal, id_invoice, id_invoice, get_store[0].id_store, body.customer, get_store[0].channel, body.total_amount,
      body.diskon_nota, body.biayalain, body.total_amount, 0, 'SELESAI', body.payment_method,
      body.customer != "Retail" ? body.reseller : '-', body.kasir, tanggal, tanggal
    ];
    await connection.query(
      `INSERT INTO tb_invoice (tanggal_order, id_invoice, id_pesanan, customer, type_customer, sales_channel, amount, diskon_nota, biaya_lainnya, total_amount, selisih, status_pesanan, payment, reseller, users, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      invoiceParams
    );

    // Insert payments jika ada
    if (body.payment_method === "PAID") {
      if (body.cash && parseFloat(body.cash) > 0) {
        await connection.query(
          `INSERT INTO tb_payment (tanggal_pembayaran, id_invoice, total_payment, metode_payment, bank, id_store, id_area, deskripsi, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tanggal_skrg, id_invoice, body.cash, 'CASH', 'CASH', get_store[0].id_store, get_store[0].id_area, '-', tanggal, tanggal]
        );
      }
      if (body.bca && parseFloat(body.bca) > 0) {
        await connection.query(
          `INSERT INTO tb_payment (tanggal_pembayaran, id_invoice, total_payment, metode_payment, bank, id_store, id_area, deskripsi, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tanggal_skrg, id_invoice, body.bca, 'DEBIT', 'DEBIT', get_store[0].id_store, get_store[0].id_area, '-', tanggal, tanggal]
        );
      }
      if (body.qris && parseFloat(body.qris) > 0) {
        await connection.query(
          `INSERT INTO tb_payment (tanggal_pembayaran, id_invoice, total_payment, metode_payment, bank, id_store, id_area, deskripsi, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tanggal_skrg, id_invoice, body.qris, 'TRANSFER', 'QRIS', get_store[0].id_store, get_store[0].id_area, '-', tanggal, tanggal]
        );
      }
    }

    // Prepare print data
    const [print_store] = await connection.query(
      `SELECT tb_order.id_store, tb_store.* FROM tb_order LEFT JOIN tb_store ON tb_order.id_store = tb_store.id_store WHERE tb_order.id_pesanan=?`, [id_invoice]
    );

    const [print_detail] = await connection.query(
      `SELECT tb_invoice.*, SUM(subtotal) as subtotal, tb_order.*, SUM(qty) as qty
      FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan
      WHERE tb_invoice.id_pesanan=? GROUP BY tb_invoice.id_pesanan, tb_order.id_produk, tb_order.size`, [id_invoice]
    );

    const [print_amount] = await connection.query(
      `SELECT *, SUM(qty) as qty FROM tb_order WHERE id_pesanan=?`, [id_invoice]
    );

    const [print_grandtotal] = await connection.query(
      `SELECT *, SUM(qty) as qty FROM tb_order WHERE id_pesanan=? GROUP BY id_pesanan`, [id_invoice]
    );

    datas.push({
      print_detail,
      print_amount,
      print_grandtotal,
      print_store,
      id_invoice,
    });

    await connection.commit();
    await connection.release();

    return datas;

  } catch (error) {
    if (transactionStarted) await connection.rollback();
    await connection.release();
    console.log(error);
    throw error; // biar bisa dihandle FE kalau mau
  }
};

const orderresellerpaid = async (body) => {
  const connection = await dbPool.getConnection();

  try {
    const {
      status_pesanan,
      query,
      store,
      date,
      area,
      tipe_sales,
    } = body;

    const formatPayment = "PAID";

    const [tanggal_start, tanggal_end] =
      date.includes(" to ") ? date.split(" to ") : [date, date];

    const where = [];
    const params = [];

    // status
    where.push(`inv.status_pesanan = ?`);
    params.push(status_pesanan);

    // payment (FIX)
    where.push(`inv.payment = ?`);
    params.push(formatPayment);

    // tanggal
    where.push(`inv.tanggal_order BETWEEN ? AND ?`);
    params.push(tanggal_start, tanggal_end);

    // tipe sales
    if (tipe_sales !== "all") {
      where.push(`inv.type_customer = ?`);
      params.push(tipe_sales);
    } else {
      where.push(`inv.type_customer IN ('Reseller','Grosir','Retail')`);
    }

    // store / area
    if (store === "all_area") {
      where.push(`st.id_area = ?`);
      params.push(area);
    } else if (store !== "all") {
      where.push(`inv.customer = ?`);
      params.push(store);
    }

    // search
    if (query !== "all") {
      where.push(`
        (
          inv.id_pesanan LIKE ?
          OR inv.reseller LIKE ?
          OR ord.produk LIKE ?
          OR ord.id_produk LIKE ?
          OR CONCAT(ord.id_produk,'.',ord.size) LIKE ?
          OR CONCAT(ord.produk,'.',ord.size) LIKE ?
        )
      `);
      params.push(
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
        `%${query}%`
      );
    }

    // ===== ORDERS =====
    const [orders] = await connection.query(
      `
      SELECT
        inv.id,
        inv.id_pesanan,
        inv.tanggal_order,
        inv.type_customer,
        inv.created_at,
        inv.users,
        st.store,
        st.address,
        inv.reseller,
        inv.selisih
      FROM tb_invoice inv
      LEFT JOIN tb_order ord ON ord.id_pesanan = inv.id_pesanan
      LEFT JOIN tb_store st ON inv.customer = st.id_store
      WHERE ${where.join(" AND ")}
      GROUP BY inv.id_pesanan
      ORDER BY inv.id DESC
      `,
      params
    );

    // ===== HEADER =====
    const [header] = await connection.query(
      `
      SELECT
        COUNT(DISTINCT inv.id_pesanan) as countsales,
        SUM(ord.qty) as totalqty,
        SUM(ord.subtotal) as omzet,
        SUM(ord.m_price * ord.qty) as total_modal,
        SUM(ord.diskon_item) as total_diskon
      FROM tb_invoice inv
      LEFT JOIN tb_order ord ON ord.id_pesanan = inv.id_pesanan
      LEFT JOIN tb_store st ON inv.customer = st.id_store
      WHERE ${where.join(" AND ")}
      `,
      params
    );

    // ===== PAYMENT =====
    const [payments] = await connection.query(
      `
      SELECT pay.bank, SUM(pay.total_payment) as total
      FROM tb_payment pay
      LEFT JOIN tb_invoice inv ON pay.id_invoice = inv.id_pesanan
      LEFT JOIN tb_store st ON inv.customer = st.id_store
      WHERE
        inv.status_pesanan = ?
        AND inv.tanggal_order BETWEEN ? AND ?
        ${tipe_sales !== "all" ? "AND inv.type_customer = ?" : ""}
        ${store === "all_area" ? "AND st.id_area = ?" : ""}
        ${store !== "all" && store !== "all_area" ? "AND inv.customer = ?" : ""}
      GROUP BY pay.bank
      `,
      params.filter(p => p !== `%${query}%`) // ← penting
    );

    let total_cash = 0;
    let total_bca = 0;

    payments.forEach(p => {
      if (p.bank === "CASH") total_cash = Number(p.total || 0);
      if (p.bank === "DEBIT") total_bca = Number(p.total || 0);
    });

    // ===== DETAILS =====
    const ids = orders.map(o => o.id_pesanan);

    const [details] = ids.length
      ? await connection.query(
        `
          SELECT
            ord.*,
            SUM(ord.qty) as qty,
            SUM(ord.subtotal) as subtotal,
            SUM(ord.m_price * ord.qty) as modal
          FROM tb_order ord
          WHERE ord.id_pesanan IN (?)
          GROUP BY ord.id_pesanan, ord.id_produk, ord.size
          `,
        [ids]
      )
      : [[]];

    const detailMap = {};
    details.forEach(d => {
      if (!detailMap[d.id_pesanan]) detailMap[d.id_pesanan] = [];
      detailMap[d.id_pesanan].push(d);
    });

    const [paymentDetails] = ids.length
      ? await connection.query(
        `
      SELECT
        id_invoice,
        bank,
        SUM(total_payment) as total_payment
      FROM tb_payment
      WHERE id_invoice IN (?)
      GROUP BY id_invoice, bank
      `,
        [ids]
      )
      : [[]];

    const paymentMap = {};
    paymentDetails.forEach(p => {
      if (!paymentMap[p.id_invoice]) {
        paymentMap[p.id_invoice] = [];
      }
      paymentMap[p.id_invoice].push(p);
    });

    const datas = orders.map(o => {
      const details = detailMap[o.id_pesanan] || [];
      const payments = paymentMap[o.id_pesanan] || [];

      const modalakhir = details.reduce(
        (sum, d) => sum + Number(d.modal || 0),
        0
      );

      const subtotalakhir = details.reduce(
        (sum, d) => sum + Number(d.subtotal || 0),
        0
      );

      const total_diskon = details.reduce(
        (sum, d) => sum + Number(d.diskon_item || 0),
        0
      );

      const subtotalstandar = payments.reduce(
        (sum, p) => sum + Number(p.total_payment || 0),
        0
      );

      return {
        ...o,
        modalakhir,
        subtotalakhir,
        subtotalstandar,
        total_diskon,
        details_order: details,
        data_payment: payments
      };
    });

    await connection.commit();
    await connection.release();

    return {
      datas,
      selesai: orders.length,
      sales: orders.length,
      qty_sales: Math.round(header[0]?.totalqty || 0),
      omzet: Math.round(header[0]?.omzet || 0),
      modal: Math.round(header[0]?.total_modal || 0),
      total_diskon: Math.round(header[0]?.total_diskon || 0),
      net_sales:
        Number(header[0]?.omzet || 0) -
        Number(header[0]?.total_diskon || 0),
      payment_cash: total_cash,
      payment_bca: total_bca
    };

  } catch (error) {
    console.error(error);
    await connection.release();
    throw error;
  }
};
// END RESELLER PAID
//
//
// RESELLER PENDING
const orderresellerpending = async (body) => {
  const connection = await dbPool.getConnection();

  try {
    const {
      status_pesanan,
      query,
      store,
      date,
      area,
      tipe_sales,
    } = body;

    const formatPayment = "PENDING";

    const [tanggal_start, tanggal_end] =
      date.includes(" to ") ? date.split(" to ") : [date, date];

    const where = [];
    const params = [];

    // status
    where.push(`inv.status_pesanan = ?`);
    params.push(status_pesanan);

    // payment (FIX)
    where.push(`inv.payment = ?`);
    params.push(formatPayment);

    // tanggal
    where.push(`inv.tanggal_order BETWEEN ? AND ?`);
    params.push(tanggal_start, tanggal_end);

    // tipe sales
    if (tipe_sales !== "all") {
      where.push(`inv.type_customer = ?`);
      params.push(tipe_sales);
    } else {
      where.push(`inv.type_customer IN ('Reseller','Grosir','Retail')`);
    }

    // store / area
    if (store === "all_area") {
      where.push(`st.id_area = ?`);
      params.push(area);
    } else if (store !== "all") {
      where.push(`inv.customer = ?`);
      params.push(store);
    }

    // search
    if (query !== "all") {
      where.push(`
        (
          inv.id_pesanan LIKE ?
          OR inv.reseller LIKE ?
          OR ord.produk LIKE ?
          OR ord.id_produk LIKE ?
          OR CONCAT(ord.id_produk,'.',ord.size) LIKE ?
          OR CONCAT(ord.produk,'.',ord.size) LIKE ?
        )
      `);
      params.push(
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
        `%${query}%`
      );
    }

    // ===== ORDERS =====
    const [orders] = await connection.query(
      `
      SELECT
        inv.id,
        inv.id_pesanan,
        inv.tanggal_order,
        inv.type_customer,
        inv.created_at,
        inv.users,
        st.store,
        st.address,
        inv.reseller,
        inv.selisih
      FROM tb_invoice inv
      LEFT JOIN tb_order ord ON ord.id_pesanan = inv.id_pesanan
      LEFT JOIN tb_store st ON inv.customer = st.id_store
      WHERE ${where.join(" AND ")}
      GROUP BY inv.id_pesanan
      ORDER BY inv.id DESC
      `,
      params
    );

    // ===== HEADER =====
    const [header] = await connection.query(
      `
      SELECT
        COUNT(DISTINCT inv.id_pesanan) as countsales,
        SUM(ord.qty) as totalqty,
        SUM(ord.subtotal) as omzet,
        SUM(ord.m_price * ord.qty) as total_modal,
        SUM(ord.diskon_item) as total_diskon
      FROM tb_invoice inv
      LEFT JOIN tb_order ord ON ord.id_pesanan = inv.id_pesanan
      LEFT JOIN tb_store st ON inv.customer = st.id_store
      WHERE ${where.join(" AND ")}
      `,
      params
    );

    // ===== PAYMENT =====
    const [payments] = await connection.query(
      `
      SELECT pay.bank, SUM(pay.total_payment) as total
      FROM tb_payment pay
      LEFT JOIN tb_invoice inv ON pay.id_invoice = inv.id_pesanan
      LEFT JOIN tb_store st ON inv.customer = st.id_store
      WHERE
        inv.status_pesanan = ?
        AND inv.tanggal_order BETWEEN ? AND ?
        ${tipe_sales !== "all" ? "AND inv.type_customer = ?" : ""}
        ${store === "all_area" ? "AND st.id_area = ?" : ""}
        ${store !== "all" && store !== "all_area" ? "AND inv.customer = ?" : ""}
      GROUP BY pay.bank
      `,
      params.filter(p => p !== `%${query}%`) // ← penting
    );

    let total_cash = 0;
    let total_bca = 0;

    payments.forEach(p => {
      if (p.bank === "CASH") total_cash = Number(p.total || 0);
      if (p.bank === "DEBIT") total_bca = Number(p.total || 0);
    });

    // ===== DETAILS =====
    const ids = orders.map(o => o.id_pesanan);

    const [details] = ids.length
      ? await connection.query(
        `
          SELECT
            ord.*,
            SUM(ord.qty) as qty,
            SUM(ord.subtotal) as subtotal,
            SUM(ord.m_price * ord.qty) as modal
          FROM tb_order ord
          WHERE ord.id_pesanan IN (?)
          GROUP BY ord.id_pesanan, ord.id_produk, ord.size
          `,
        [ids]
      )
      : [[]];

    const detailMap = {};
    details.forEach(d => {
      if (!detailMap[d.id_pesanan]) detailMap[d.id_pesanan] = [];
      detailMap[d.id_pesanan].push(d);
    });

    const [paymentDetails] = ids.length
      ? await connection.query(
        `
      SELECT
        id_invoice,
        bank,
        SUM(total_payment) as total_payment
      FROM tb_payment
      WHERE id_invoice IN (?)
      GROUP BY id_invoice, bank
      `,
        [ids]
      )
      : [[]];

    const paymentMap = {};
    paymentDetails.forEach(p => {
      if (!paymentMap[p.id_invoice]) {
        paymentMap[p.id_invoice] = [];
      }
      paymentMap[p.id_invoice].push(p);
    });

    const datas = orders.map(o => {
      const details = detailMap[o.id_pesanan] || [];
      const payments = paymentMap[o.id_pesanan] || [];

      const modalakhir = details.reduce(
        (sum, d) => sum + Number(d.modal || 0),
        0
      );

      const subtotalakhir = details.reduce(
        (sum, d) => sum + Number(d.subtotal || 0),
        0
      );

      const total_diskon = details.reduce(
        (sum, d) => sum + Number(d.diskon_item || 0),
        0
      );

      const subtotalstandar = payments.reduce(
        (sum, p) => sum + Number(p.total_payment || 0),
        0
      );

      return {
        ...o,
        modalakhir,
        subtotalakhir,
        subtotalstandar,
        total_diskon,
        details_order: details,
        data_payment: payments
      };
    });

    await connection.commit();
    await connection.release();

    return {
      datas,
      selesai: orders.length,
      sales: orders.length,
      qty_sales: Math.round(header[0]?.totalqty || 0),
      omzet: Math.round(header[0]?.omzet || 0),
      modal: Math.round(header[0]?.total_modal || 0),
      total_diskon: Math.round(header[0]?.total_diskon || 0),
      net_sales:
        Number(header[0]?.omzet || 0) -
        Number(header[0]?.total_diskon || 0),
      payment_cash: total_cash,
      payment_bca: total_bca
    };

  } catch (error) {
    console.error(error);
    await connection.release();
    throw error;
  }
};

// END RESELLER PENDING
//
//
// RETAIL
const orderresellerretail = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
  // console.log(body);
  var status = body.status_pesanan;
  var query = body.query;
  var store = body.store;

  const tanggal = body.date;
  const myArray = tanggal.split(" to ");

  if (tanggal.length > 10) {
    var tanggal_start = myArray[0];
    var tanggal_end = myArray[1];
  } else {
    var tanggal_start = tanggal;
    var tanggal_end = tanggal;
  }

  const datas = [];

  if (store === "all") {
    if (query === "all") {
      var [get_orders] = await connection.query(
        `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND status_pesanan='${status}' AND payment='PAID' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
      );
    } else {
      var [get_orders] = await connection.query(
        `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND status_pesanan='${status}' AND payment='PAID' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
      );
    }
  } else if (store === "all_area") {
    if (query === "all") {
      var [get_orders] = await connection.query(
        `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
      );
    } else {
      var [get_orders] = await connection.query(
        `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
      );
    }
  } else {
    if (query === "all") {
      var [get_orders] = await connection.query(
        `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND status_pesanan='${status}' AND payment='PAID' AND customer='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
      );
    } else {
      var [get_orders] = await connection.query(
        `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND status_pesanan='${status}' AND payment='PAID' AND customer='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
      );
    }
  }
  try {
    await connection.beginTransaction();

    for (let i = 0; i < get_orders.length; i++) {
      var [details_order] = await connection.query(
        `SELECT tb_order.*,SUM(tb_order.qty) as qty,tb_warehouse.warehouse FROM tb_order LEFT JOIN tb_warehouse ON tb_order.id_ware = tb_warehouse.id_ware WHERE tb_order.id_pesanan='${get_orders[i].id_pesanan}' GROUP BY tb_order.size,tb_order.id_produk,tb_order.id_pesanan`
      );

      var [sumqty] = await connection.query(
        `SELECT SUM(qty) as hasilqty FROM tb_order WHERE id_pesanan='${get_orders[i].id_pesanan}'`
      );

      var [data_payment] = await connection.query(
        `SELECT * FROM tb_payment WHERE id_invoice='${get_orders[i].id_invoice}'`
      );
      var [data_store] = await connection.query(
        `SELECT * FROM tb_store WHERE id_store='${get_orders[i].customer}'`
      );
      var [data_payment] = await connection.query(
        `SELECT *,SUM(total_payment) as total_payment FROM tb_payment WHERE id_invoice='${get_orders[i].id_invoice}' GROUP BY bank`
      );

      var [modalakhir] = await connection.query(
        `SELECT SUM(m_price * qty) as modalsatuan,SUM(subtotal) as subtotalakhir FROM tb_order WHERE id_pesanan='${get_orders[i].id_pesanan}' GROUP BY id_pesanan`
      );

      datas.push({
        id: get_orders[i].id,
        tanggal_order: get_orders[i].tanggal_order,
        tanggal_update: get_orders[i].tanggal_update,
        id_invoice: get_orders[i].id_invoice,
        id_pesanan: get_orders[i].id_pesanan,
        customer: get_orders[i].customer,
        type_customer: get_orders[i].type_customer,
        sales_channel: get_orders[i].sales_channel,
        amount: get_orders[i].amount,
        diskon_nota: get_orders[i].diskon_nota,
        biaya_lainnya: get_orders[i].biaya_lainnya,
        total_amount: get_orders[i].total_amount,
        selisih: get_orders[i].selisih,
        status_pesanan: get_orders[i].status_pesanan,
        payment: get_orders[i].payment,
        reseller: get_orders[i].reseller,
        users: get_orders[i].users,
        details_order: details_order,
        data_payment: data_payment,
        data_store: data_store,
        data_payment: data_payment,
        qty: sumqty[0].hasilqty,
        modalakhir: modalakhir[0].modalsatuan,
        subtotalakhir: modalakhir[0].subtotalakhir,
      });
    }
    await connection.commit();
    await connection.release();
    // console.log(datas)
    return datas;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const orderCountresellerretail = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  var store = body.store;
  var query = body.query;

  const tanggal = body.date;
  const myArray = tanggal.split(" to ");

  if (tanggal.length > 10) {
    var tanggal_start = myArray[0];
    var tanggal_end = myArray[1];
  } else {
    var tanggal_start = tanggal;
    var tanggal_end = tanggal;
  }
  const datas = [];

  try {
    await connection.beginTransaction();

    if (store === "all") {
      if (query === "all") {
        var [dikirim] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND payment='PAID' AND status_pesanan = 'SEDANG DIKIRIM' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND payment='PAID' AND status_pesanan = 'SELESAI' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND payment='PAID' AND status_pesanan = 'CANCEL' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
      } else {
        var [dikirim] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND payment='PAID' AND status_pesanan = 'SEDANG DIKIRIM' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND payment='PAID' AND status_pesanan = 'SELESAI' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND payment='PAID' AND status_pesanan = 'CANCEL' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
      }
    } else if (store === "all_area") {
      if (query === "all") {
        var [dikirim] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan = 'SEDANG DIKIRIM' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan = 'SELESAI' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan = 'CANCEL' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
      } else {
        var [dikirim] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.status_pesanan = 'SEDANG DIKIRIM' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.status_pesanan = 'SELESAI' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.status_pesanan = 'CANCEL' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
      }
    } else {
      if (query === "all") {
        var [dikirim] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND payment='PAID' AND status_pesanan = 'SEDANG DIKIRIM' AND store='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND payment='PAID' AND status_pesanan = 'SELESAI' AND store='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND payment='PAID' AND status_pesanan = 'CANCEL' AND store='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
      } else {
        var [dikirim] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND payment='PAID' AND status_pesanan = 'SEDANG DIKIRIM' AND store='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND payment='PAID' AND status_pesanan = 'SELESAI' AND store='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND payment='PAID' AND status_pesanan = 'CANCEL' AND store='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
      }
    }

    datas.push({
      dikirim: dikirim.length,
      selesai: selesai.length,
      cancel: cancel.length,
    });

    await connection.commit();
    await connection.release();
    // console.log(datas)
    return datas;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const getHeaderpesananresellerretail = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  var status = body.status_pesanan;
  var store = body.store;
  var query = body.query;

  const tanggal = body.date;
  const myArray = tanggal.split(" to ");

  if (tanggal.length > 10) {
    var tanggal_start = myArray[0];
    var tanggal_end = myArray[1];
  } else {
    var tanggal_start = tanggal;
    var tanggal_end = tanggal;
  }
  const datas = [];

  try {
    await connection.beginTransaction();

    if (store === "all") {
      if (query === "all") {
        var [sales] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND status_pesanan='${status}' AND payment='PAID' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [qty_sales] = await connection.query(
          `SELECT tb_order.*,tb_invoice.*,SUM(qty) as total FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND payment='PAID' AND tb_order.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT *,SUM(total_amount) as amount FROM tb_invoice WHERE type_customer='Retail' AND status_pesanan='${status}' AND payment='PAID' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [modal] = await connection.query(
          `SELECT tb_order.*,tb_invoice.*,SUM(m_price) as total_modal FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND payment='PAID' AND tb_order.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      } else {
        var [sales] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND status_pesanan='${status}' AND payment='PAID' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [qty_sales] = await connection.query(
          `SELECT tb_order.*,tb_invoice.*,SUM(qty) as total FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.type_customer='Retail' AND tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.status_pesanan='${status}' AND payment='PAID' AND tb_order.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT *,SUM(total_amount) as amount FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND status_pesanan='${status}' AND payment='PAID' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [modal] = await connection.query(
          `SELECT tb_order.*,tb_invoice.*,SUM(m_price) as total_modal FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.type_customer='Retail' AND tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.status_pesanan='${status}' AND payment='PAID' AND tb_order.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      }
    } else if (store === "all_area") {
      if (query === "all") {
        var [sales] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [qty_sales] = await connection.query(
          `SELECT tb_invoice.*,SUM(qty) as total,tb_order.* FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT tb_invoice.*,SUM(total_amount) as amount,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [modal] = await connection.query(
          `SELECT tb_invoice.*,SUM(m_price) as total_modal,tb_order.* FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      } else {
        var [sales] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`

        );
        var [qty_sales] = await connection.query(
          `SELECT tb_invoice.*,SUM(qty) as total,tb_order.* FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT tb_invoice.*,SUM(total_amount) as amount,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [modal] = await connection.query(
          `SELECT tb_invoice.*,SUM(m_price) as total_modal,tb_order.* FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.payment='PAID' AND tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      }
    } else {
      if (query === "all") {
        var [sales] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND status_pesanan='${status}' AND payment='PAID' AND customer='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [qty_sales] = await connection.query(
          `SELECT tb_order.*,tb_invoice.*,SUM(qty) as total FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND payment='PAID' AND tb_order.id_store='${store}' AND tb_order.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT *,SUM(total_amount) as amount FROM tb_invoice WHERE type_customer='Retail' AND status_pesanan='${status}' AND payment='PAID' AND customer='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [modal] = await connection.query(
          `SELECT tb_order.*,tb_invoice.*,SUM(m_price) as total_modal FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.type_customer='Retail' AND tb_invoice.status_pesanan='${status}' AND payment='PAID' AND tb_order.id_store='${store}' AND tb_order.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      } else {
        var [sales] = await connection.query(
          `SELECT * FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND status_pesanan='${status}' AND payment='PAID' AND customer='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [qty_sales] = await connection.query(
          `SELECT tb_order.*,tb_invoice.*,SUM(qty) as total FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.type_customer='Retail' AND tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.status_pesanan='${status}' AND payment='PAID' AND tb_order.id_store='${store}' AND tb_order.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT *,SUM(total_amount) as amount FROM tb_invoice WHERE type_customer='Retail' AND id_pesanan LIKE '%${query}%' AND status_pesanan='${status}' AND payment='PAID' AND customer='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [modal] = await connection.query(
          `SELECT tb_order.*,tb_invoice.*,SUM(m_price) as total_modal FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.type_customer='Retail' AND tb_invoice.id_pesanan LIKE '%${query}%' AND tb_invoice.status_pesanan='${status}' AND payment='PAID' AND tb_order.id_store='${store}' AND tb_order.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      }
    }

    datas.push({
      sales: sales.length,
      qty_sales: Math.round(qty_sales[0].total),
      omzet: Math.round(omzet[0].amount),
      modal: Math.round(modal[0].total_modal),
      net_sales: parseInt(omzet[0].amount) - parseInt(modal[0].total_modal),
    });

    await connection.commit();
    await connection.release();
    // console.log(datas)
    return datas;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};
// END RETAIL

const gethistorypay = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
  // console.log(body);

  try {
    await connection.beginTransaction();

    var [gethistorypay] = await connection.query(
      `SELECT * FROM tb_history_payment WHERE id_invoice='${body.id_invoice}' AND id_produk='${body.id_produk}' AND size='${body.size}'`
    );

    await connection.commit();
    await connection.release();
    return gethistorypay;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};


module.exports = {
  getStore_salesretail,
  getKasir,
  getResellersales,
  productsSalesretail,
  inputSalesretail,
  orderresellerpaid,
  orderresellerpending,
  orderresellerretail,
  orderCountresellerretail,
  getHeaderpesananresellerretail,
  gethistorypay,
};
