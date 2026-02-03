const dbPool = require("../config/database");

const date = require("date-and-time");
const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
const tanggal2 = date.format(new Date(), "YYYY-MM-DD");
const tanggalinput = date.format(new Date(), "YYYYMMDD");
const tahun = date.format(new Date(), "YY");
const { generateFromEmail } = require("unique-username-generator");

const productsSales = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
  const datas = [];
  console.log(body)
  if (body.query != "all") {
    var [query_produk] = await connection.query(
      `SELECT * FROM tb_produk WHERE id_produk LIKE '%${body.query}%' OR produk LIKE '%${body.query}%' GROUP BY id_produk ORDER BY id`
    );
    var [query_nota] = await connection.query(
      `SELECT *, SUM(qty) as qty FROM tb_notabarang WHERE produk LIKE '%${body.query}%'  AND status_pesanan != "SEDANG DIKIRIM" AND status_pesanan != "SELESAI" GROUP BY id_nota,produk,size,id_sup ORDER BY id DESC`
    );
  } else {
    var [query_produk] = await connection.query(
      `SELECT * FROM tb_produk GROUP BY id_produk ORDER BY id DESC LIMIT 24`
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

    for (let index = 0; index < query_nota.length; index++) {
      datas.push({
        id: query_nota[index].id,
        id_produk: query_nota[index].id_nota,
        id_ware: query_nota[index].id_ware,
        id_brand: query_nota[index].id_brand,
        id_category: query_nota[index].id_category,
        tanggal_upload: query_nota[index].tanggal_upload,
        produk: query_nota[index].produk,
        deskripsi: query_nota[index].deskripsi,
        quality: query_nota[index].quality,
        n_price: query_nota[index].m_price,
        r_price: query_nota[index].m_price,
        g_price: query_nota[index].m_price,
        img: "box.png",
        users: query_nota[index].users,
        variation_sales: [
          {
            size: query_nota[index].size,
            qty: query_nota[index].qty,
          },
        ],
        variationcount: 1,
        stok: "External",
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

const salesProductbarcode = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  const datas = [];
  try {
    await connection.beginTransaction();

    const [get_product] = await connection.query(
      `SELECT * FROM tb_produk WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}'`
    );
    const [get_size] = await connection.query(
      `SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}' AND size='${body.size}' GROUP BY id_produk,size`
    );

    for (let index = 0; index < get_product.length; index++) {
      datas.push({
        produk: get_product[index].produk,
        id_produk: get_product[index].id_produk,
        qty_ready: get_size[0].qty,
        img: get_product[index].img,
        n_price: get_product[index].n_price,
        r_price: get_product[index].r_price,
        g_price: get_product[index].g_price,
      });
    }

    const [get_po] = await connection.query(
      `SELECT m_price FROM tb_purchaseorder WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}'`
    );

    const [get_hargajual] = await connection.query(
      `SELECT r_price FROM tb_produk WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}'`
    );


    await connection.commit();
    await connection.release();

    if (get_size[0].qty > 0) {
      return {
        produk: get_product[0].produk,
        qty_ready: get_size[0].qty,
        img: get_product[0].img,
        id_ware: get_product[0].id_ware,
        get_hargajual,
        datas,
      };
    } else {
      return "sold_out";
    }
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const inputSales = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const { data, id_pesanan, tanggal: tanggalOrder, id_store, total_amount, users } = body;

  try {
    await connection.beginTransaction();

    // Check Order ID yang sudah ada di database
    const [cekPesananGlobal] = await connection.query(
      `SELECT id_pesanan 
       FROM tb_order 
       WHERE id_pesanan = '${id_pesanan}' 
       GROUP BY id_pesanan`
    );

    if (cekPesananGlobal.length > 0) {
      return {
        status: "failed ID",
        message: "Order ID already exists in the database.",
      };
    }

    // Hitung total harga_jual * qty dari data
    // const requiredTotal = data.reduce((acc, item) => acc + item.harga_jual * item.qty, 0);

    var total_modal = 0;
    for (let x = 0; x < data.length; x++) {
      if (data[x].source === "Barang Luar") {
        total_modal = total_modal + parseInt(data[x].harga_beli);
      } else {
        var [get_purchaseorder] = await connection.query(
          `SELECT AVG(g_price) as g_price FROM tb_produk WHERE id_produk='${data[x].idproduk}' AND id_ware='${data[x].id_ware}'`
        );
        total_modal = total_modal + Math.round(get_purchaseorder[0].g_price) * data[x].qty;

        // var [get_purchaseorder] = await connection.query(
        //   `SELECT AVG(g_price) as g_price FROM tb_produk WHERE id_produk='${data[x].idproduk}' AND id_ware='${data[x].id_ware}'`
        // );
        // total_modal = total_modal + (parseInt(Math.round(get_purchaseorder[0].g_price)) - parseInt(50000)) * data[x].qty;
      }
    }

    if (total_amount < total_modal) {
      return {
        status: "failed price",
        message: "Total amount from frontend is less than the calculated selling price.",
        data: {
          frontendTotalAmount: total_amount,
          total_modal,
        },
      };
    }

    // Generate Mutasi ID
    const [cekMutasi] = await connection.query(`SELECT MAX(id_mutasi) as id_mutasi FROM tb_mutasistock`);
    let lastMutasi = cekMutasi[0].id_mutasi
      ? parseInt(cekMutasi[0].id_mutasi.slice(-8))
      : 0;

    // Proses setiap item
    for (const item of data) {
      const { idproduk, id_ware, size, harga_jual, qty, img, produk, source } = item;

      // Fetch Product
      const [getProduk] = await connection.query(
        `SELECT * FROM tb_produk WHERE id_produk='${idproduk}' AND id_ware='${id_ware}'`
      );

      let qtySales = qty;

      // Fetch variations
      const [variations] = await connection.query(
        `SELECT * FROM tb_variation WHERE id_produk='${idproduk}' AND id_ware='${id_ware}' AND size='${size}' AND qty > 0 ORDER BY id ASC`
      );

      if (variations.length === 0) continue;

      for (const variation of variations) {
        const qtyBaru = variation.qty - qtySales;
        const qtyToProcess = qtyBaru >= 0 ? qtySales : variation.qty;

        const [getModal] = await connection.query(
          `SELECT m_price FROM tb_purchaseorder WHERE idpo='${variation.idpo}' AND id_produk='${idproduk}'`
        );

        const subtotal = harga_jual * qtyToProcess;

        // Insert into tb_order
        await connection.query(
          `INSERT INTO tb_order (tanggal_order, id_pesanan, id_store, id_produk, source, img, produk, id_brand, id_ware, idpo, quality, size, qty, m_price, selling_price, diskon_item, subtotal, users, created_at, updated_at)
           VALUES ('${tanggalOrder}', '${id_pesanan}', '${id_store}', '${idproduk}', 'Barang Gudang', '${img}', '${produk}', '${getProduk[0].id_brand}', '${id_ware}', '${variation.idpo}', '${getProduk[0].quality}', '${size}', '${qtyToProcess}', '${getModal[0].m_price}', '${harga_jual}', '0', '${subtotal}', '${users}', '${tanggal}', '${tanggal}')`
        );

        // Generate Mutasi ID
        lastMutasi += 1;
        const idMutasi = `MT-${lastMutasi.toString().padStart(8, "0")}`;

        // Insert into tb_mutasistock
        await connection.query(
          `INSERT INTO tb_mutasistock (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
           VALUES ('${idMutasi}', '${tanggalOrder}', '${id_pesanan}', '${id_ware}', '${id_store}', '${idproduk}', '${produk}', '${variation.idpo}', '${size}', '${qtyToProcess}', '${source}', '-', 'SALES ONLINE', '${users}', '${tanggal}', '${tanggal}')`
        );

        // Update tb_variation
        await connection.query(
          `UPDATE tb_variation SET qty='${Math.max(0, qtyBaru)}', updated_at='${tanggal}' WHERE id_produk='${idproduk}' AND id_ware='${id_ware}' AND size='${size}' AND idpo='${variation.idpo}'`
        );

        qtySales -= qtyToProcess;
        if (qtySales <= 0) break;
      }
    }

    // Generate Invoice
    const [cekInvoice] = await connection.query(`SELECT MAX(id_invoice) as id_invoice FROM tb_invoice`);
    let lastInvoice = cekInvoice[0].id_invoice
      ? parseInt(cekInvoice[0].id_invoice.slice(-9))
      : 0;

    const [get_store] = await connection.query(
      `SELECT * FROM tb_store WHERE id_store='${id_store}'`
    );

    lastInvoice += 1;
    const idInvoice = `INV-${lastInvoice.toString().padStart(9, "0")}`;

    await connection.query(
      `INSERT INTO tb_invoice (tanggal_order, id_invoice, id_pesanan, customer, type_customer, sales_channel, amount, diskon_nota, biaya_lainnya, total_amount, selisih, status_pesanan, payment, reseller, users, created_at, updated_at)
       VALUES ('${tanggalOrder}', '${idInvoice}', '${id_pesanan}', '${id_store}', '${get_store[0].channel}', '${get_store[0].channel}', '${total_amount}', '0', '0', '${total_amount}', '0', 'SELESAI', 'PAID', '-', '${users}', '${tanggal}', '${tanggal}')`
    );

    // Commit transaction
    await connection.commit();

    return {
      status: "success",
      message: "All orders processed successfully.",
    };
  } catch (error) {
    console.error(error);
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const order = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
  var status = body.status_pesanan;
  var query = body.query;
  var store = body.store;
  var users = body.users;

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
        var [get_orders] = await connection.query(
          `SELECT id,tanggal_order,type_customer,created_at,id_pesanan,users FROM tb_invoice WHERE sales_channel != 'OFFLINE STORE' AND status_pesanan='${status}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [header] = await connection.query(
          `SELECT COUNT(tb_invoice.id_pesanan) as countsales,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as omzet,SUM(tb_order.diskon_item) as total_diskon,SUM(tb_order.subtotal) as subtotals FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT SUM(tb_invoice.total_amount) as omzet FROM tb_invoice WHERE sales_channel != 'OFFLINE STORE' AND status_pesanan='${status}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      } else {
        var [get_orders] = await connection.query(
          `SELECT tb_invoice.id,tb_invoice.tanggal_order,tb_invoice.type_customer,tb_invoice.created_at,tb_invoice.id_pesanan,tb_invoice.users FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.status_pesanan='${status}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_invoice.id_pesanan`
        );
        var [header] = await connection.query(
          `SELECT COUNT(tb_invoice.id_pesanan) as countsales,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as omzet,SUM(tb_order.diskon_item) as total_diskon,SUM(tb_order.subtotal) as subtotals FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.status_pesanan='${status}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT SUM(tb_invoice.total_amount) as omzet FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      }
    } else if (store === "all_area") {
      if (query === "all") {
        var [get_orders] = await connection.query(
          `SELECT tb_invoice.id,tb_invoice.tanggal_order,tb_invoice.type_customer,tb_invoice.created_at,tb_invoice.id_pesanan,tb_invoice.users FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.id_store = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_store.id_area='${body.area}' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [header] = await connection.query(
          `SELECT COUNT(tb_invoice.id_pesanan) as countsales,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as omzet,SUM(tb_order.diskon_item) as total_diskon,SUM(tb_order.subtotal) as subtotals FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan LEFT JOIN tb_store ON tb_invoice.id_store = tb_store.id_area WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_store.id_area='${body.area}' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT SUM(tb_invoice.total_amount) as omzet FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.id_store = tb_store.id_area WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      } else {
        var [get_orders] = await connection.query(
          `SELECT tb_invoice.id,tb_invoice.tanggal_order,tb_invoice.type_customer,tb_invoice.created_at,tb_invoice.id_pesanan,tb_invoice.users FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan LEFT JOIN tb_store ON tb_invoice.id_store = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_store.id_area='${body.area}' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_invoice.id_pesanan`
        );
        var [header] = await connection.query(
          `SELECT COUNT(tb_invoice.id_pesanan) as countsales,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as omzet,SUM(tb_order.diskon_item) as total_diskon,SUM(tb_order.subtotal) as subtotals FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan LEFT JOIN tb_store ON tb_invoice.id_store = tb_store.id_area WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_store.id_area='${body.area}' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT SUM(tb_invoice.total_amount) as omzet FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan LEFT JOIN tb_store ON tb_invoice.id_store = tb_store.id_area WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      }
    } else {
      if (query === "all") {
        var [get_orders] = await connection.query(
          `SELECT id,tanggal_order,type_customer,created_at,id_pesanan,users FROM tb_invoice WHERE sales_channel != 'OFFLINE STORE' AND customer='${store}' AND status_pesanan='${status}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [header] = await connection.query(
          `SELECT COUNT(tb_invoice.id_pesanan) as countsales,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as omzet,SUM(tb_order.diskon_item) as total_diskon,SUM(tb_order.subtotal) as subtotals FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.customer='${store}' AND tb_invoice.status_pesanan='${status}'  AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT SUM(tb_invoice.total_amount) as omzet FROM tb_invoice WHERE sales_channel != 'OFFLINE STORE' AND status_pesanan='${status}' AND customer='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      } else {
        var [get_orders] = await connection.query(
          `SELECT tb_invoice.id,tb_invoice.tanggal_order,tb_invoice.type_customer,tb_invoice.created_at,tb_invoice.id_pesanan,tb_invoice.users FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.customer='${store}' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_invoice.id_pesanan`
        );
        var [header] = await connection.query(
          `SELECT COUNT(tb_invoice.id_pesanan) as countsales,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as omzet,SUM(tb_order.diskon_item) as total_diskon,SUM(tb_order.subtotal) as subtotals FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.customer='${store}' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        var [omzet] = await connection.query(
          `SELECT SUM(tb_invoice.total_amount) as omzet FROM tb_invoice LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.customer='${store}' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
      }
    }

    for (let i = 0; i < get_orders.length; i++) {
      var [details_order] = await connection.query(
        `SELECT tb_order.id,tb_order.id_pesanan,tb_order.id_produk,tb_order.source,tb_order.img,tb_order.id_ware,tb_order.idpo,tb_order.produk,tb_order.size,tb_order.qty,tb_order.m_price,tb_order.selling_price,tb_order.diskon_item,tb_order.subtotal,SUM(tb_order.qty) as qty,SUM(tb_order.m_price*tb_order.qty) as m_price,SUM(tb_order.subtotal) as subtotal,SUM(tb_order.m_price*tb_order.qty) as modalsatuan,tb_store.store,tb_invoice.selisih FROM tb_order LEFT JOIN tb_invoice ON tb_invoice.id_pesanan = tb_order.id_pesanan LEFT JOIN tb_store ON tb_store.id_store = tb_order.id_store LEFT JOIN tb_payment ON tb_payment.id_invoice = tb_order.id_pesanan WHERE tb_invoice.id_pesanan='${get_orders[i].id_pesanan}' GROUP BY tb_order.size,tb_order.id_produk,tb_invoice.id_pesanan`
      );
      var [totaltotal] = await connection.query(
        `SELECT SUM(tb_order.m_price*tb_order.qty) as modalsatuan,SUM(tb_order.subtotal) as subtotalakhir,SUM(tb_invoice.total_amount) as totalakhir,SUM(tb_order.diskon_item) as total_diskon,SUM(tb_order.qty) as hasilqty,tb_invoice.selisih FROM tb_order LEFT JOIN tb_invoice ON tb_invoice.id_pesanan = tb_order.id_pesanan WHERE tb_invoice.id_pesanan='${get_orders[i].id_pesanan}' GROUP BY tb_invoice.id_pesanan`
      );
      var [total_payment] = await connection.query(
        `SELECT amount FROM tb_invoice WHERE id_pesanan='${get_orders[i].id_pesanan}'`
      );

      datas.push({
        id: get_orders[i].id,
        tanggal_order: get_orders[i].tanggal_order,
        type_customer: get_orders[i].type_customer,
        created_at: get_orders[i].created_at,
        id_pesanan: get_orders[i].id_pesanan,
        users: get_orders[i].users,
        modalakhir: totaltotal[0].modalsatuan,
        subtotalakhir: totaltotal[0].subtotalakhir,
        subtotalstandar: total_payment[0].amount,
        qty: totaltotal[0].hasilqty,
        store: details_order[0].store,
        selisih: details_order[0].selisih,
        details_order: details_order,
      });

    }

    // console.log("sales=", get_orders.length);
    // console.log("qty_sales=", Math.round(header[0].totalqty));
    // console.log("subtotal=", Math.round(header[0].subtotals));
    // console.log("omzet=", Math.round(omzet[0].omzet));
    // console.log("modal=", Math.round(header[0].total_modal));
    // console.log("net_sales=", parseInt(header[0].omzet ? header[0].omzet : 0) - parseInt(header[0].total_modal ? header[0].total_modal : 0));

    await connection.commit();
    await connection.release();

    return {
      datas,
      selesai: get_orders.length,
      sales: get_orders.length,
      qty_sales: Math.round(header[0].totalqty ? header[0].totalqty : 0),
      subtotal: Math.round(header[0].subtotals ? header[0].subtotals : 0),
      omzet: Math.round(omzet[0].omzet ? omzet[0].omzet : 0),
      modal: Math.round(header[0].total_modal ? header[0].total_modal : 0),
      net_sales: parseInt(omzet[0].omzet ? omzet[0].omzet : 0) - parseInt(header[0].total_modal ? header[0].total_modal : 0),
    };

  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const orderCount = async (body) => {
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
          `SELECT * FROM tb_invoice WHERE sales_channel != 'OFFLINE STORE' AND payment='PAID' AND status_pesanan = 'SEDANG DIKIRIM' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT * FROM tb_invoice WHERE sales_channel != 'OFFLINE STORE' AND payment='PAID' AND status_pesanan = 'SELESAI' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT * FROM tb_invoice WHERE sales_channel != 'OFFLINE STORE' AND payment='PAID' AND status_pesanan = 'CANCEL' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
      } else {
        var [dikirim] = await connection.query(
          `SELECT tb_invoice.id_pesanan FROM tb_invoice LEFT JOIN tb_order ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_invoice.reseller LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.status_pesanan = 'SEDANG DIKIRIM' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT tb_invoice.id_pesanan FROM tb_invoice LEFT JOIN tb_order ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_invoice.reseller LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.status_pesanan = 'SELESAI' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT tb_invoice.id_pesanan FROM tb_invoice LEFT JOIN tb_order ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_invoice.reseller LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.status_pesanan = 'CANCEL' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
      }
    } else if (store === "all_area") {
      if (query === "all") {
        var [dikirim] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan = 'SEDANG DIKIRIM' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan = 'SELESAI' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT tb_invoice.*,tb_store.id_area FROM tb_invoice LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan = 'CANCEL' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
      } else {
        var [dikirim] = await connection.query(
          `SELECT tb_invoice.id_pesanan FROM tb_invoice LEFT JOIN tb_order ON tb_order.id_pesanan = tb_invoice.id_pesanan LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_invoice.reseller LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_store.id_area='${body.area}' AND tb_invoice.status_pesanan = 'SEDANG DIKIRIM' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT tb_invoice.id_pesanan FROM tb_invoice LEFT JOIN tb_order ON tb_order.id_pesanan = tb_invoice.id_pesanan LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_invoice.reseller LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_store.id_area='${body.area}' AND tb_invoice.status_pesanan = 'SELESAI' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT tb_invoice.id_pesanan FROM tb_invoice LEFT JOIN tb_order ON tb_order.id_pesanan = tb_invoice.id_pesanan LEFT JOIN tb_store ON tb_invoice.customer = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_invoice.reseller LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_store.id_area='${body.area}' AND tb_invoice.status_pesanan = 'CANCEL' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
      }
    } else {
      if (query === "all") {
        var [dikirim] = await connection.query(
          `SELECT * FROM tb_invoice WHERE sales_channel != 'OFFLINE STORE' AND status_pesanan = 'SEDANG DIKIRIM' AND customer='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT * FROM tb_invoice WHERE sales_channel != 'OFFLINE STORE' AND status_pesanan = 'SELESAI' AND customer='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT * FROM tb_invoice WHERE sales_channel != 'OFFLINE STORE' AND status_pesanan = 'CANCEL' AND customer='${store}' AND tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
        );
      } else {
        var [dikirim] = await connection.query(
          `SELECT tb_invoice.id_pesanan FROM tb_invoice LEFT JOIN tb_order ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_invoice.reseller LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.customer='${store}' AND tb_invoice.status_pesanan = 'SEDANG DIKIRIM' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [selesai] = await connection.query(
          `SELECT tb_invoice.id_pesanan FROM tb_invoice LEFT JOIN tb_order ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_invoice.reseller LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.customer='${store}' AND tb_invoice.status_pesanan = 'SELESAI' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
        );
        var [cancel] = await connection.query(
          `SELECT tb_invoice.id_pesanan FROM tb_invoice LEFT JOIN tb_order ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_invoice.reseller LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.customer='${store}' AND tb_invoice.status_pesanan = 'CANCEL' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_invoice.id DESC`
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

    return datas;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const getHeaderpesanan = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  var status = body.status_pesanan;
  var store = body.store;
  var users = body.users;
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
        if (users === "all") {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        } else {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.users='${users}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        }
      } else {
        if (users === "all") {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        } else {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.users='${users}' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        }
      }
    } else if (store === "all_area") {
      if (query === "all") {
        if (users === "all") {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan LEFT JOIN tb_store ON tb_order.id_store = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        } else {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan LEFT JOIN tb_store ON tb_order.id_store = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.users='${users}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        }
      } else {
        if (users === "all") {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan LEFT JOIN tb_store ON tb_order.id_store = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        } else {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan LEFT JOIN tb_store ON tb_order.id_store = tb_store.id_store WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_store.id_area='${body.area}' AND tb_invoice.users='${users}' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        }
      }
    } else {
      if (query === "all") {
        if (users === "all") {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.customer='${store}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        } else {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.customer='${store}' AND tb_invoice.users='${users}' AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        }
      } else {
        if (users === "all") {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.customer='${store}' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        } else {
          var [header] = await connection.query(
            `SELECT COUNT(tb_invoice.id_invoice) as countsales,SUM(tb_order.subtotal) as subtotals,SUM(tb_order.qty) as totalqty,SUM(tb_order.m_price*tb_order.qty) as total_modal,SUM(tb_invoice.total_amount) as amount FROM tb_order LEFT JOIN tb_invoice ON tb_order.id_pesanan = tb_invoice.id_pesanan WHERE tb_invoice.sales_channel != 'OFFLINE STORE' AND tb_invoice.status_pesanan='${status}' AND tb_invoice.customer='${store}' AND tb_invoice.users='${users}' AND (tb_invoice.id_pesanan LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%' OR tb_order.produk LIKE '%${query}%') AND tb_invoice.tanggal_order BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
          );
        }
      }
    }

    datas.push({
      sales: header[0].countsales,
      qty_sales: Math.round(header[0].totalqty),
      subtotal: Math.round(header[0].subtotals),
      omzet: Math.round(header[0].amount),
      modal: Math.round(header[0].total_modal),
      net_sales: parseInt(header[0].amount) - parseInt(header[0].total_modal),
    });

    await connection.commit();
    await connection.release();

    return datas;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const refund = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  const [cek_mutasi] = await connection.query(
    `SELECT MAX(id_mutasi) as id_mutasi FROM tb_mutasistock`
  );
  if (cek_mutasi[0].id_mutasi === null) {
    var id_mutasi = "MT-" + "00000001";
  } else {
    const get_last2 = cek_mutasi[0].id_mutasi;
    const data_2 = get_last2.toString().slice(-8);
    const hasil = parseInt(data_2) + 1;
    var id_mutasi = "MT-" + String(hasil).padStart(8, "0");
  }

  const [get_dataorder] = await connection.query(
    `SELECT * FROM tb_order WHERE id_pesanan='${body.id_pesanan}' AND id_produk='${body.id_produk}' AND size='${body.size}' AND source='${body.source}' ORDER BY idpo ASC`
  );

  const [get_data_invoice] = await connection.query(
    `SELECT * FROM tb_invoice WHERE id_pesanan='${body.id_pesanan}'`
  );

  const [get_pesanan_awal] = await connection.query(
    `SELECT *,SUM(qty) as totalqty,SUM(subtotal) as hitung_subtotal FROM tb_order WHERE id_pesanan='${body.id_pesanan}'`
  );

  for (let forx = 0; forx < get_pesanan_awal.length; forx++) {
    var qtypesananawal = get_pesanan_awal[forx].totalqty;
    var hitung_subtotal = get_pesanan_awal[forx].hitung_subtotal;
    var subtotalawal = parseInt(get_pesanan_awal[forx].selling_price) * parseInt(qty_refund);
  }
  var amountawal = parseInt(get_data_invoice[0].amount) - parseInt(hitung_subtotal);
  // var bagiamountawal = parseInt(amountawal) / parseInt(qtypesananawal);

  var qty_refund = body.qty_refund;
  var qty_sisa = 0;

  try {
    await connection.beginTransaction();

    for (let i = 0; i < get_dataorder.length; i++) {
      var getdiskonini = parseInt(get_dataorder[i].diskon_item) / parseInt(get_dataorder[i].qty);
      var get_harga_jual = parseInt(get_dataorder[i].selling_price) * parseInt(body.qty_refund) - (parseInt(getdiskonini) * parseInt(body.qty_refund));
      var hitungpersentase = (parseInt(get_harga_jual) / parseInt(get_data_invoice[0].amount)) * 100;
      var hitungpersentase2 = (parseInt(amountawal) * hitungpersentase) / 100;

      var sisabagiamountawal = parseInt(get_harga_jual) + parseInt(hitungpersentase2);

      if (get_dataorder[i].diskon_item === 0) {
        var get_diskonitem = 0;
      } else {
        var get_diskonitem = parseInt(get_dataorder[i].diskon_item) / parseInt(get_dataorder[i].qty);
      }
      // var get_subtotal = parseInt(get_dataorder[0].subtotal) - parseInt(get_harga_jual);

      var amount_sisa = parseInt(get_data_invoice[0].amount) / parseInt(qtypesananawal);
      // var amount_hasil = parseInt(amount_sisa) * parseInt(qty_refund);

      if (get_dataorder[i].source === "Barang Gudang") {
        qty_sisa = parseInt(qty_refund) - parseInt(get_dataorder[i].qty);
        var sisa_qty_order = parseInt(get_dataorder[i].qty) - qty_refund;


        if (qty_sisa > 0) {
          await connection.query(
            `INSERT INTO tb_mutasistock
                    (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                    VALUES ('${id_mutasi}','${tanggal_skrg}','${get_dataorder[i].id_pesanan}','${get_dataorder[i].id_ware}','${get_dataorder[i].id_store}','${get_dataorder[i].id_produk}','${get_dataorder[i].produk}','${get_dataorder[i].idpo}','${get_dataorder[i].size}','${get_dataorder[i].qty}','${get_dataorder[i].source}','${get_dataorder[i].source}','REFUND','${body.users}','${tanggal}','${tanggal}')`
          );

          var [get_qty_old] = await connection.query(
            `SELECT * FROM tb_variation WHERE id_produk='${body.id_produk}' AND id_ware='${get_dataorder[i].id_ware}' AND size='${get_dataorder[i].size}' AND qty > 0 ORDER BY id DESC LIMIT 1`
          );

          await connection.query(
            `UPDATE tb_variation SET qty='${parseInt(get_qty_old[0].qty) + parseInt(get_dataorder[i].qty)
            }',updated_at='${tanggal}' WHERE id_produk='${body.id_produk
            }' AND id_ware='${get_dataorder[i].id_ware}' AND size='${get_dataorder[i].size
            }' AND idpo='${get_qty_old[0].idpo}'`
          );

          if (sisa_qty_order > 0) {
            await connection.query(
              `UPDATE tb_order SET qty='${sisa_qty_order}',diskon_item='${parseInt(get_diskonitem) * (parseInt(get_dataorder[i].qty) - parseInt(body.qty_refund))}',subtotal='${parseInt(get_dataorder[i].subtotal) - parseInt(get_harga_jual)
              }',updated_at='${tanggal}' WHERE id='${get_dataorder[i].id}'`
            );
          } else {
            await connection.query(
              `DELETE FROM tb_order WHERE id='${get_dataorder[i].id}'`
            );
          }
          qty_refund = parseInt(qty_refund) - parseInt(get_dataorder[i].qty);
        } else {
          await connection.query(
            `INSERT INTO tb_mutasistock
                    (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                    VALUES ('${id_mutasi}','${tanggal_skrg}','${get_dataorder[i].id_pesanan}','${get_dataorder[i].id_ware}','${get_dataorder[i].id_store}','${get_dataorder[i].id_produk}','${get_dataorder[i].produk}','${get_dataorder[i].idpo}','${get_dataorder[i].size}','${qty_refund}','${get_dataorder[i].source}','${get_dataorder[i].source}','REFUND','${body.users}','${tanggal}','${tanggal}')`
          );
          var [get_qty_old] = await connection.query(
            `SELECT * FROM tb_variation WHERE id_produk='${body.id_produk}' AND id_ware='${get_dataorder[i].id_ware}' AND size='${get_dataorder[i].size}' AND qty > 0 ORDER BY id DESC LIMIT 1`
          );

          if (get_qty_old.length > 0) {
            await connection.query(
              `UPDATE tb_variation SET qty='${parseInt(get_qty_old[0].qty) + parseInt(qty_refund)
              }',updated_at='${tanggal}' WHERE id_produk='${body.id_produk
              }' AND id_ware='${get_dataorder[i].id_ware}' AND size='${get_dataorder[i].size
              }' AND idpo='${get_qty_old[0].idpo}'`
            );
          } else {
            await connection.query(
              `UPDATE tb_variation SET qty='${qty_refund
              }',updated_at='${tanggal}' WHERE id_produk='${body.id_produk
              }' AND id_ware='${get_dataorder[i].id_ware}' AND size='${get_dataorder[i].size
              }' AND idpo='${get_dataorder[i].idpo}'`
            );
          }
          if (sisa_qty_order > 0) {
            await connection.query(
              `UPDATE tb_order SET qty='${sisa_qty_order}',diskon_item='${parseInt(get_diskonitem) * (parseInt(get_dataorder[i].qty) - parseInt(body.qty_refund))}',subtotal='${parseInt(get_dataorder[i].subtotal) - parseInt(get_harga_jual)
              }',updated_at='${tanggal}' WHERE id='${get_dataorder[i].id}'`
            );
          } else {
            await connection.query(
              `DELETE FROM tb_order WHERE id='${get_dataorder[i].id}'`
            );
          }
        }
      }
    }

    var [get_pesanan] = await connection.query(
      `SELECT * FROM tb_order WHERE id_pesanan='${body.id_pesanan}'`
    );

    await connection.query(
      `INSERT INTO tb_refund (tanggal_refund, id_pesanan, id_produk, id_store, produk, source, idpo, size, qty, keterangan, users, created_at, updated_at)
            VALUES ('${tanggal_skrg}','${body.id_pesanan}','${body.id_produk}','${get_pesanan_awal[0].id_store}','${body.produk}','${body.source}','${body.idpo}','${body.size}','${body.qty_refund}','Refund','${body.users}','${tanggal}','${tanggal}')`);

    await connection.query(
      `UPDATE tb_invoice SET amount='${parseInt(get_data_invoice[0].amount) - parseInt(sisabagiamountawal)
      }',total_amount='${parseInt(get_data_invoice[0].amount) - parseInt(sisabagiamountawal)
      }',updated_at='${tanggal}' WHERE id_pesanan='${body.id_pesanan}'`
    );

    if (get_pesanan.length < 1) {
      await connection.query(
        `DELETE FROM tb_invoice WHERE id_pesanan='${body.id_pesanan}'`
      );
    }
    if (get_data_invoice[0].type_customer === "Retail" || get_data_invoice[0].type_customer === "Reseller" || get_data_invoice[0].type_customer === "Grosir") {
      var [getpayment] = await connection.query(
        `SELECT * FROM tb_payment WHERE id_invoice='${body.id_pesanan}'`
      );
      for (let yyy = 0; yyy < getpayment.length; yyy++) {
        console.log(getpayment.length)
        if (getpayment.length > 1) {

          await connection.query(
            `DELETE FROM tb_payment WHERE id_invoice='${body.id_pesanan}'`
          );

          await connection.query(
            `INSERT INTO tb_payment
                  (tanggal_pembayaran, id_invoice, total_payment, metode_payment, bank, id_store, id_area, deskripsi, created_at, updated_at)
                  VALUES ('${getpayment[yyy].tanggal_pembayaran}','${getpayment[yyy].id_invoice}','${parseInt(get_data_invoice[0].amount) - parseInt(sisabagiamountawal)}','DEBIT','BCA','${getpayment[yyy].id_store}','${getpayment[yyy].id_area}','-','${getpayment[yyy].created_at}','${getpayment[yyy].updated_at}')`
          );
        } else {
          await connection.query(
            `UPDATE tb_payment SET total_payment='${parseInt(get_data_invoice[0].amount) - parseInt(sisabagiamountawal)
            }',updated_at='${tanggal}' WHERE id_invoice='${body.id_pesanan}'`
          );
        }
      }

      if (getpayment.length < 1) {
        await connection.query(
          `DELETE FROM tb_payment WHERE id_pesanan='${body.id_pesanan}'`
        );
      }
    }

    if (get_pesanan.length < 1) {
      await connection.query(
        `DELETE FROM tb_payment WHERE id_invoice='${body.id_pesanan}'`
      );
    }

    await connection.commit();
    await connection.release();
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const getSizeretur = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
  try {
    await connection.beginTransaction();

    const [data] = await connection.query(
      `SELECT *,SUM(qty)as qty FROM tb_variation WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}'  AND size != '${body.size}' GROUP BY size`
    );

    await connection.commit();
    await connection.release();

    return data;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const retur = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  const [cek_mutasi] = await connection.query(
    `SELECT MAX(id_mutasi) as id_mutasi FROM tb_mutasistock`
  );
  if (cek_mutasi[0].id_mutasi === null) {
    var id_mutasi = "MT-" + "00000001";
  } else {
    const get_last2 = cek_mutasi[0].id_mutasi;
    const data_2 = get_last2.toString().slice(-8);
    const hasil = parseInt(data_2) + 1;
    var id_mutasi = "MT-" + String(hasil).padStart(8, "0");
  }


  try {
    await connection.beginTransaction();

    // PROSES PENAMBAHAN BARANG RETUR
    const [get_produk_grup] = await connection.query(
      `SELECT * FROM tb_order WHERE id_pesanan='${body.id_pesanan}' AND id_produk='${body.id_produk}' AND size='${body.size_old}' GROUP BY id_produk,size`
    );
    var tanggal_order = get_produk_grup[0].tanggal_order;
    var id_pesanan = get_produk_grup[0].id_pesanan;
    var id_brand = get_produk_grup[0].id_brand;
    var id_store = get_produk_grup[0].id_store;
    var id_produk = get_produk_grup[0].id_produk;
    var produk = get_produk_grup[0].produk;
    var img = get_produk_grup[0].img;
    var quality = get_produk_grup[0].quality;
    var harga_jual = get_produk_grup[0].selling_price;
    var diskon_item = get_produk_grup[0].diskon_item;
    var qty_default = get_produk_grup[0].qty;
    var harga_modal = get_produk_grup[0].m_price;

    var bagi_diskon = parseInt(diskon_item) / parseInt(qty_default)
    var hasil_diskon = parseInt(bagi_diskon) * parseInt(body.qty_new)
    console.log(body)
    console.log(diskon_item, '/', qty_default);
    console.log(bagi_diskon);
    console.log(bagi_diskon, '*', body.qty_new);
    console.log(hasil_diskon);

    // CEK STOK VARIASI
    const [get_var] = await connection.query(
      `SELECT * FROM tb_variation WHERE id_produk='${body.id_produk}' AND id_ware='${body.new_id_ware}' AND size='${body.size_new}' AND qty > '0' ORDER BY idpo ASC`
    );
    // END CEK STOK VARIASI

    const [get_pesanan_awal] = await connection.query(
      `SELECT * FROM tb_order WHERE id_pesanan='${body.id_pesanan}'`
    );

    var qty_sales = body.qty_new;

    for (let i = 0; i < get_var.length; i++) {
      var get_qty = get_var[i].qty;
      var qty_baru = parseInt(get_qty) - parseInt(qty_sales);

      var [get_modal] = await connection.query(
        `SELECT m_price FROM tb_purchaseorder WHERE idpo='${body.idpo}' AND id_produk='${body.id_produk}'`
      );
      if (qty_baru >= 0) {
        await connection.query(
          `INSERT INTO tb_order
                (tanggal_order, id_pesanan, id_store, id_produk, source, img, produk, id_brand, id_ware, idpo, quality, size, qty, m_price, selling_price, diskon_item, subtotal, users, created_at, updated_at)
                VALUES ('${tanggal_order}','${id_pesanan}','${id_store}','${id_produk}','Barang Gudang','${img}','${produk}','${id_brand}','${get_var[i].id_ware
          }','${get_var[i].idpo}','${quality}','${body.size_new
          }','${qty_sales}','${harga_modal}','${harga_jual}','${hasil_diskon}','${(parseInt(harga_jual) * parseInt(qty_sales)) - parseInt(hasil_diskon)
          }','${body.users}','${tanggal}','${tanggal}')`
        );

        await connection.query(
          `INSERT INTO tb_mutasistock
                (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                VALUES ('${id_mutasi}','${tanggal_skrg}','${id_pesanan}','${get_var[i].id_ware}','${id_store}','${id_produk}','${produk}','${get_var[i].idpo}','${body.size_new}','${qty_sales}','Barang Gudang','-','RETUR_OUT','${body.users}','${tanggal}','${tanggal}')`
        );

        // Update Variation Old QTY
        await connection.query(
          `UPDATE tb_variation SET qty='${qty_baru}',updated_at='${tanggal}' WHERE id_produk='${id_produk}' AND id_ware='${get_var[i].id_ware}' AND size='${body.size_new}' AND idpo='${get_var[i].idpo}'`
        );
        //
      } else {
        if (qty_baru < 0) {
          var qty_sisa = 0;
        }

        await connection.query(
          `INSERT INTO tb_order
                (tanggal_order, id_pesanan, id_store, id_produk, source, img, produk, id_brand, id_ware, idpo, quality, size, qty, m_price, selling_price, diskon_item, subtotal, users, created_at, updated_at)
                VALUES ('${tanggal_order}','${id_pesanan}','${id_store}','${id_produk}','Barang Gudang','${img}','${produk}','${id_brand}','${get_var[i].id_ware
          }','${get_var[i].idpo}','${quality}','${body.size_new}','${get_var[i].qty
          }','${harga_modal}','${harga_jual}','${hasil_diskon}','${(parseInt(harga_jual) * parseInt(get_var[i].qty)) - parseInt(hasil_diskon)
          }','${body.users}','${tanggal}','${tanggal}')`
        );

        await connection.query(
          `INSERT INTO tb_mutasistock
                (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                VALUES ('${id_mutasi}','${tanggal_skrg}','${id_pesanan}','${get_var[i].id_ware}','${id_store}','${id_produk}','${produk}','${get_var[i].idpo}','${body.size_new}','${get_var[i].qty}','Barang Gudang','-','RETUR_OUT','${body.users}','${tanggal}','${tanggal}')`
        );

        // Update Variation Old QTY
        await connection.query(
          `UPDATE tb_variation SET qty='${qty_sisa}',updated_at='${tanggal}' WHERE id_produk='${id_produk}' AND id_ware='${get_var[i].id_ware}' AND size='${body.size_new}' AND idpo='${get_var[i].idpo}'`
        );
        //
        qty_sales = parseInt(qty_sales) - parseInt(get_var[i].qty);
      }
    }
    // END PROSES PENAMBAHAN BARANG RETUR
    //
    // PROSES PENGEMBALIAN BARANG RETUR KE GUDANG
    const [get_dataorder] = await connection.query(
      `SELECT * FROM tb_order WHERE id_pesanan='${body.id_pesanan}' AND id_produk='${body.id_produk}' AND size='${body.size_old}' AND source='${body.source}' ORDER BY idpo ASC`
    );

    var qty_retur = body.qty_new;
    var qty_sisa = 0;

    for (let x = 0; x < get_dataorder.length; x++) {
      if (get_dataorder[x].source === "Barang Gudang") {
        qty_sisa = parseInt(qty_retur) - parseInt(get_dataorder[x].qty);
        var sisa_qty_order =
          parseInt(get_dataorder[x].qty) - parseInt(qty_retur);
        if (qty_sisa > 0) {
          await connection.query(
            `INSERT INTO tb_mutasistock
                    (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                    VALUES ('${id_mutasi}','${tanggal_skrg}','${get_dataorder[x].id_pesanan}','${get_dataorder[x].id_ware}','${get_dataorder[x].id_store}','${get_dataorder[x].id_produk}','${get_dataorder[x].produk}','${get_dataorder[x].idpo}','${get_dataorder[x].size}','${get_dataorder[x].qty}','${get_dataorder[x].source}','-','RETUR_IN','${body.users}','${tanggal}','${tanggal}')`
          );

          var [get_qty_old] = await connection.query(
            `SELECT * FROM tb_variation WHERE id_produk='${body.id_produk}' AND id_ware='${get_dataorder[x].id_ware}' AND size='${get_dataorder[x].size}' AND idpo='${get_dataorder[x].idpo}'`
          );

          // Update Variation Old QTY
          await connection.query(
            `UPDATE tb_variation SET qty='${parseInt(get_qty_old[0].qty) + parseInt(get_dataorder[x].qty)
            }',updated_at='${tanggal}' WHERE id_produk='${body.id_produk
            }' AND id_ware='${get_dataorder[x].id_ware}' AND size='${get_dataorder[x].size
            }' AND idpo='${get_dataorder[x].idpo}'`
          );
          //
          if (sisa_qty_order > 0) {
            await connection.query(
              `UPDATE tb_order SET qty='${sisa_qty_order}',diskon_item='${parseInt(get_dataorder[x].diskon_item) - parseInt(hasil_diskon)}',subtotal='${(parseInt(get_dataorder[x].selling_price) * parseInt(sisa_qty_order)) - (parseInt(get_dataorder[x].diskon_item) - parseInt(hasil_diskon))
              }',updated_at='${tanggal}' WHERE id='${get_dataorder[x].id}'`
            );
          } else {
            await connection.query(
              `DELETE FROM tb_order WHERE id='${get_dataorder[x].id}'`
            );
          }

          qty_retur = parseInt(qty_retur) - parseInt(get_dataorder[x].qty);
        } else {
          await connection.query(
            `INSERT INTO tb_mutasistock
                    (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                    VALUES ('${id_mutasi}','${tanggal_skrg}','${get_dataorder[x].id_pesanan}','${get_dataorder[x].id_ware}','${get_dataorder[x].id_store}','${get_dataorder[x].id_produk}','${get_dataorder[x].produk}','${get_dataorder[x].idpo}','${get_dataorder[x].size}','${qty_retur}','Barang Gudang','-','RETUR_IN','${body.users}','${tanggal}','${tanggal}')`
          );

          var [get_qty_old] = await connection.query(
            `SELECT * FROM tb_variation WHERE id_produk='${body.id_produk}' AND id_ware='${get_dataorder[x].id_ware}' AND size='${get_dataorder[x].size}' AND idpo='${get_dataorder[x].idpo}'`
          );

          // Update Variation Old QTY
          await connection.query(
            `UPDATE tb_variation SET qty='${parseInt(get_qty_old[0].qty) + parseInt(qty_retur)
            }',updated_at='${tanggal}' WHERE id_produk='${body.id_produk
            }' AND id_ware='${get_dataorder[x].id_ware}' AND size='${get_dataorder[x].size
            }' AND idpo='${get_dataorder[x].idpo}'`
          );
          //

          if (sisa_qty_order > 0) {
            await connection.query(
              `UPDATE tb_order SET qty='${sisa_qty_order}',diskon_item='${parseInt(get_dataorder[x].diskon_item) - parseInt(hasil_diskon)}',subtotal='${(parseInt(get_dataorder[x].selling_price) * parseInt(sisa_qty_order)) - (parseInt(get_dataorder[x].diskon_item) - parseInt(hasil_diskon))
              }',updated_at='${tanggal}' WHERE id='${get_dataorder[x].id}'`
            );
          } else {
            await connection.query(
              `DELETE FROM tb_order WHERE id='${get_dataorder[x].id}'`
            );
          }
        }
      }
    }
    await connection.query(
      `INSERT INTO tb_retur (tanggal_retur, id_pesanan, id_produk, id_store, produk, source, idpo, size_lama, size_baru, qty_retur, keterangan, users, created_at, updated_at)
            VALUES ('${tanggal_skrg}','${id_pesanan}','${id_produk}','${get_pesanan_awal[0].id_store}','${produk}','${body.source}','${get_var[0].idpo}','${body.size_old}','${body.size_new}','${body.qty_new}','Tukar Size','${body.users}','${tanggal}','${tanggal}')`);

    await connection.commit();
    await connection.release();
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const returLuar = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  const [cek_mutasi] = await connection.query(
    `SELECT MAX(id_mutasi) as id_mutasi FROM tb_mutasistock`
  );
  if (cek_mutasi[0].id_mutasi === null) {
    var id_mutasi = "MT-" + "00000001";
  } else {
    const get_last2 = cek_mutasi[0].id_mutasi;
    const data_2 = get_last2.toString().slice(-8);
    const hasil = parseInt(data_2) + 1;
    var id_mutasi = "MT-" + String(hasil).padStart(8, "0");
  }

  const [cek_notabarang] = await connection.query(
    `SELECT MAX(id_nota) as id_nota FROM tb_notabarang`
  );
  if (cek_notabarang[0].id_nota === null) {
    var id_nota = "EXT-" + "0000001";
  } else {
    const get_last2 = cek_notabarang[0].id_nota;
    const data_2 = get_last2.toString().slice(-7);
    const hasil = parseInt(data_2) + 1;
    var id_nota = "EXT-" + String(hasil).padStart(7, "0");
  }
  try {
    await connection.beginTransaction();

    const [get_produk] = await connection.query(
      `SELECT * FROM tb_order WHERE id_pesanan='${body.LuarIdPesanan}' AND id_produk='${body.LuarIdProduk}'`
    );

    var qty_sisa = parseInt(body.LuarOldQty) - parseInt(body.LuarQtyNew);

    const [get_store] = await connection.query(
      `SELECT * FROM tb_store WHERE id_store='${get_produk[0].id_store}'`
    );

    if (qty_sisa === 0) {
      var [get_produk_grup] = await connection.query(
        `SELECT * FROM tb_order WHERE id_pesanan='${body.LuarIdPesanan}' AND id_produk='${body.LuarIdProduk}'`
      );
      // Add Nota Barang Baru
      await connection.query(
        `INSERT INTO tb_notabarang
            (id_nota, id_ware, id_brand, id_category, id_sup, tanggal_upload, produk, size, qty, deskripsi, quality, status_pesanan, m_price, selling_price, payment, img, users, created_at, updated_at)
            VALUES ('${id_nota}','EXTERNAL','-','-','${body.LuarSupplier
        }','${tanggal_skrg}','${body.LuarProduk}','${body.LuarSize}','${body.LuarQtyNew
        }','${get_produk_grup[0].id_pesanan +
        " - " +
        get_store[0].store +
        " -SALES "
        }','-','SEDANG DIKIRIM','${body.LuarHargaBeli}','${body.LuarHargaBeli
        }','${body.LuarPayment
        }','box.png','ADMIN-NEXTJS','${tanggal}','${tanggal}')`
      );

      var [get_supp] = await connection.query(
        `SELECT * FROM tb_supplier WHERE id_sup='${body.LuarSupplier}'`
      );

      await connection.query(
        `INSERT INTO tb_mutasistock
            (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, created_at, updated_at)
            VALUES ('${id_mutasi}','${tanggal_skrg}','${body.LuarIdPesanan}','EXTERNAL','${get_produk[0].id_store}','${id_nota}','${body.LuarProduk}','${id_nota}','${body.LuarSize}','${body.LuarQtyNew}','Barang Luar','${get_supp[0].supplier}','RETUR_OUT','${tanggal}','${tanggal}')`
      );
      // End Add Nota Barang Baru
      //
      // Update Nota Barang Lama
      if (body.StatusBarangRetur === "STOKAN") {
        await connection.query(
          `UPDATE tb_notabarang SET status_pesanan='RETUR',updated_at='${tanggal}' WHERE id_nota='${body.LuarIdProduk}' AND deskripsi LIKE '%${body.LuarIdPesanan}%'`
        );

        var [get_nota] = await connection.query(
          `SELECT * FROM tb_notabarang WHERE id_nota='${body.LuarIdProduk}' AND deskripsi LIKE '%${body.LuarIdPesanan}%'`
        );

        var [get_supp] = await connection.query(
          `SELECT * FROM tb_supplier WHERE id_sup='${get_nota[0].id_sup}'`
        );

        await connection.query(
          `INSERT INTO tb_mutasistock
                (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, created_at, updated_at)
                VALUES ('${id_mutasi}','${tanggal_skrg}','${body.LuarIdPesanan}','EXTERNAL','${get_produk[0].id_store}','${body.LuarIdProduk}','${body.LuarProduk}','${body.LuarIdProduk}','${get_nota[0].size}','${body.LuarQtyNew}','Barang Luar','${get_supp[0].supplier}','RETUR_IN','${tanggal}','${tanggal}')`
        );
      } else {
        var [get_nota] = await connection.query(
          `SELECT * FROM tb_notabarang WHERE id_nota='${body.LuarIdProduk}' AND deskripsi LIKE '%${body.LuarIdPesanan}%'`
        );

        var [get_supp] = await connection.query(
          `SELECT * FROM tb_supplier WHERE id_sup='${get_nota[0].id_sup}'`
        );

        await connection.query(
          `INSERT INTO tb_mutasistock
                (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, created_at, updated_at)
                VALUES ('${id_mutasi}','${tanggal_skrg}','${body.LuarIdPesanan}','EXTERNAL','${get_produk[0].id_store}','${body.LuarIdProduk}','${body.LuarProduk}','${body.LuarIdProduk}','${get_nota[0].size}','${body.LuarQtyNew}','Barang Luar','${get_supp[0].supplier}','RETUR_IN','${tanggal}','${tanggal}')`
        );

        await connection.query(
          `DELETE FROM tb_notabarang WHERE id_nota='${body.LuarIdProduk}' AND deskripsi LIKE '%${body.LuarIdPesanan}%'`
        );

        await connection.query(
          `UPDATE tb_order SET size='${body.LuarSize
          }',id_produk='${id_nota}',idpo='${id_nota}',m_price='${body.LuarHargaBeli
          }',selling_price='${body.LuarHargaBeli}',subtotal='${parseInt(body.LuarHargaBeli) * parseInt(body.LuarQtyNew)
          }',updated_at='${tanggal}' WHERE id_pesanan='${body.LuarIdPesanan
          }' AND id_produk='${body.LuarIdProduk}'`
        );
      }
    } else {
      var [get_produk_grup] = await connection.query(
        `SELECT * FROM tb_order WHERE id_pesanan='${body.LuarIdPesanan}' AND id_produk='${body.LuarIdProduk}'`
      );

      var tanggal_order = get_produk_grup[0].tanggal_order;
      var id_pesanan = get_produk_grup[0].id_pesanan;
      var id_brand = get_produk_grup[0].id_brand;
      var id_store = get_produk_grup[0].id_store;
      var id_produk = get_produk_grup[0].id_produk;
      var produk = get_produk_grup[0].produk;
      var img = get_produk_grup[0].img;
      var quality = get_produk_grup[0].quality;

      await connection.query(
        `INSERT INTO tb_notabarang
            (id_nota, id_ware, id_brand, id_category, id_sup, tanggal_upload, produk, size, qty, deskripsi, quality, status_pesanan, m_price, selling_price, payment, img, users, created_at, updated_at)
            VALUES ('${id_nota}','EXTERNAL','-','-','${body.LuarSupplier
        }','${tanggal_skrg}','${body.LuarProduk}','${body.LuarSize}','${body.LuarQtyNew
        }','${get_produk_grup[0].id_pesanan +
        " - " +
        get_store[0].store +
        " -SALES "
        }','-','SEDANG DIKIRIM','${body.LuarHargaBeli}','${body.LuarHargaBeli
        }','${body.LuarPayment
        }','box.png','ADMIN-NEXTJS','${tanggal}','${tanggal}')`
      );

      await connection.query(
        `INSERT INTO tb_order
            (tanggal_order, id_pesanan, id_store, id_produk, source, img, produk, id_brand, id_ware, idpo, quality, size, qty, m_price, selling_price, diskon_item, subtotal, users, created_at, updated_at)
            VALUES ('${tanggal_order}','${id_pesanan}','${id_store}','${id_produk}','Barang Luar','box.png','${produk}','${id_brand}','EXTERNAL','${id_nota}','${quality}','${body.LuarSize
        }','${body.LuarQtyNew}','${body.LuarHargaBeli}','${body.LuarHargaBeli
        }','0','${parseInt(body.LuarHargaBeli) * parseInt(body.LuarQtyNew)
        }','ADMIN-NEXTJS','${tanggal}','${tanggal}')`
      );

      var [get_supp] = await connection.query(
        `SELECT * FROM tb_supplier WHERE id_sup='${body.LuarSupplier}'`
      );

      await connection.query(
        `INSERT INTO tb_mutasistock
            (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, created_at, updated_at)
            VALUES ('${id_mutasi}','${tanggal_skrg}','${id_pesanan}','EXTERNAL','${id_store}','${id_nota}','${produk}','${id_nota}','${body.LuarSize}','${body.LuarQtyNew}','Barang Luar','${get_supp[0].supplier}','RETUR_OUT','${tanggal}','${tanggal}')`
      );

      var [get_nota] = await connection.query(
        `SELECT * FROM tb_notabarang WHERE id_nota='${body.LuarIdProduk}' AND deskripsi LIKE '%${body.LuarIdPesanan}%'`
      );

      if (body.StatusBarangRetur === "STOKAN") {
        await connection.query(
          `INSERT INTO tb_notabarang
                (id_nota, id_ware, id_brand, id_category, id_sup, tanggal_upload, produk, size, qty, deskripsi, quality, status_pesanan, m_price, selling_price, payment, img, users, created_at, updated_at)
                VALUES ('${get_nota[0].id_nota}','EXTERNAL','-','-','${get_nota[0].id_sup}','${get_nota[0].tanggal_upload}','${get_nota[0].produk}','${get_nota[0].size}','${body.LuarQtyNew}','${get_nota[0].deskripsi}','-','RETUR','${get_nota[0].m_price}','${get_nota[0].selling_price}','${get_nota[0].payment}','${get_nota[0].img}','${get_nota[0].users}','${tanggal}','${tanggal}')`
        );

        var [get_supp] = await connection.query(
          `SELECT * FROM tb_supplier WHERE id_sup='${get_nota[0].id_sup}'`
        );

        await connection.query(
          `INSERT INTO tb_mutasistock
                (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, created_at, updated_at)
                VALUES ('${id_mutasi}','${tanggal_skrg}','${id_pesanan}','EXTERNAL','${id_store}','${get_nota[0].id_nota}','${get_nota[0].produk}','${get_nota[0].id_nota}','${get_nota[0].size}','${body.LuarQtyNew}','Barang Luar','${get_supp[0].supplier}','RETUR_IN','${tanggal}','${tanggal}')`
        );
      } else {
        var [get_supp] = await connection.query(
          `SELECT * FROM tb_supplier WHERE id_sup='${get_nota[0].id_sup}'`
        );

        await connection.query(
          `INSERT INTO tb_mutasistock
                (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, created_at, updated_at)
                VALUES ('${id_mutasi}','${tanggal_skrg}','${id_pesanan}','EXTERNAL','${id_store}','${get_nota[0].id_nota}','${get_nota[0].produk}','${get_nota[0].id_nota}','${get_nota[0].size}','${body.LuarQtyNew}','Barang Luar','${get_supp[0].supplier}','RETUR_IN','${tanggal}','${tanggal}')`
        );
      }

      await connection.query(
        `UPDATE tb_notabarang SET qty='${parseInt(get_nota[0].qty) - parseInt(body.LuarQtyNew)
        }',updated_at='${tanggal}' WHERE id_nota='${body.LuarIdProduk
        }' AND deskripsi LIKE '%${body.LuarIdPesanan
        }%' AND status_pesanan='SEDANG DIKIRIM'`
      );

      await connection.query(
        `UPDATE tb_order SET qty='${parseInt(get_produk_grup[0].qty) - parseInt(body.LuarQtyNew)
        }',subtotal='${parseInt(get_nota[0].m_price) *
        (parseInt(get_produk_grup[0].qty) - parseInt(body.LuarQtyNew))
        }',updated_at='${tanggal}' WHERE id_pesanan='${body.LuarIdPesanan
        }' AND id_produk='${body.LuarIdProduk}' AND idpo='${body.LuarIdProduk}'`
      );

      // console.log('tb_notabarang', get_nota[0].qty, '-', body.LuarQtyNew)
      // console.log(
      //   "tb_order",
      //   parseInt(get_produk_grup[0].qty) - parseInt(body.LuarQtyNew)
      // );
    }

    await connection.commit();
    await connection.release();
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const deletePesanan = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  const [cek_mutasi] = await connection.query(
    `SELECT MAX(id_mutasi) as id_mutasi FROM tb_mutasistock`
  );
  if (cek_mutasi[0].id_mutasi === null) {
    var id_mutasi = "MT-" + "00000001";
  } else {
    const get_last2 = cek_mutasi[0].id_mutasi;
    const data_2 = get_last2.toString().slice(-8);
    const hasil = parseInt(data_2) + 1;
    var id_mutasi = "MT-" + String(hasil).padStart(8, "0");
  }


  var id_pesanan = body.id_pesanan;
  var status = body.status;
  try {
    await connection.beginTransaction();

    if (status != "CANCEL") {
      var [get_pesanan] = await connection.query(
        `SELECT * FROM tb_order WHERE id_pesanan='${id_pesanan}'`
      );

      for (let i = 0; i < get_pesanan.length; i++) {
        if (get_pesanan[i].source === "Barang Gudang") {
          var [get_qty_old] = await connection.query(
            `SELECT * FROM tb_variation WHERE id_produk='${get_pesanan[i].id_produk}' AND id_ware='${get_pesanan[i].id_ware}' AND size='${get_pesanan[i].size}' AND idpo='${get_pesanan[i].idpo}'`
          );

          // Update Variation Old QTY
          await connection.query(
            `UPDATE tb_variation SET qty='${parseInt(get_qty_old[0].qty) + parseInt(get_pesanan[i].qty)
            }',updated_at='${tanggal}' WHERE id_produk='${get_pesanan[i].id_produk
            }' AND id_ware='${get_pesanan[i].id_ware}' AND size='${get_pesanan[i].size
            }' AND idpo='${get_pesanan[i].idpo}'`
          );
          //
          await connection.query(
            `INSERT INTO tb_mutasistock
                    (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                    VALUES ('${id_mutasi}','${tanggal_skrg}','${get_pesanan[i].id_pesanan}','${get_pesanan[i].id_ware}','${get_pesanan[i].id_store}','${get_pesanan[i].id_produk}','${get_pesanan[i].produk}','${get_pesanan[i].idpo}','${get_pesanan[i].size}','${get_pesanan[i].qty}','${get_pesanan[i].source}','-','DELETE_ORDER','${body.users}','${tanggal}','${tanggal}')`
          );
        } else {
          await connection.query(
            `UPDATE tb_notabarang SET status_pesanan='CANCEL',updated_at='${tanggal}' WHERE id_nota='${get_pesanan[i].idpo}'`
          );

          var [get_nota] = await connection.query(
            `SELECT * FROM tb_notabarang WHERE id_nota='${get_pesanan[i].idpo}'`
          );

          var [get_supp] = await connection.query(
            `SELECT * FROM tb_supplier WHERE id_sup='${get_nota[0].id_sup}'`
          );

          await connection.query(
            `INSERT INTO tb_mutasistock
                    (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                    VALUES ('${id_mutasi}','${tanggal_skrg}','${get_pesanan[i].id_pesanan}','${get_pesanan[i].id_ware}','${get_pesanan[i].id_store}','${get_pesanan[i].id_produk}','${get_pesanan[i].produk}','${get_pesanan[i].idpo}','${get_pesanan[i].size}','${get_pesanan[i].qty}','Barang Luar','${get_supp[0].supplier}','DELETE_ORDER','${body.users}','${tanggal}','${tanggal}')`
          );
        }
      }
    }

    await connection.query(
      `DELETE FROM tb_invoice WHERE id_pesanan='${id_pesanan}'`
    );

    await connection.query(
      `DELETE FROM tb_order WHERE id_pesanan='${id_pesanan}'`
    );

    await connection.query(
      `DELETE FROM tb_payment WHERE id_invoice='${id_pesanan}'`
    );

    await connection.query(
      `DELETE FROM tb_history_payment WHERE id_invoice='${id_pesanan}'`
    );

    await connection.commit();
    await connection.release();
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const updatePesanan = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");

  const [cek_mutasi] = await connection.query(
    `SELECT MAX(id_mutasi) as id_mutasi FROM tb_mutasistock`
  );
  if (cek_mutasi[0].id_mutasi === null) {
    var id_mutasi = "MT-" + "00000001";
  } else {
    const get_last2 = cek_mutasi[0].id_mutasi;
    const data_2 = get_last2.toString().slice(-8);
    const hasil = parseInt(data_2) + 1;
    var id_mutasi = "MT-" + String(hasil).padStart(8, "0");
  }

  var id_pesanan = body.id_pesanan;
  var status = body.status;

  await connection.query(
    `UPDATE tb_invoice SET status_pesanan='${status}',tanggal_update='${tanggal_skrg}',updated_at='${tanggal}' WHERE id_pesanan='${id_pesanan}'`
  );

  const [get_pesanan] = await connection.query(
    `SELECT * FROM tb_order WHERE id_pesanan='${id_pesanan}'`
  );
  try {
    await connection.beginTransaction();

    if (status === "CANCEL") {
      for (let i = 0; i < get_pesanan.length; i++) {
        if (get_pesanan[i].source === "Barang Gudang") {
          var [get_qty_old] = await connection.query(
            `SELECT * FROM tb_variation WHERE id_produk='${get_pesanan[i].id_produk}' AND id_ware='${get_pesanan[i].id_ware}' AND size='${get_pesanan[i].size}' AND idpo='${get_pesanan[i].idpo}'`
          );

          // Update Variation Old QTY
          await connection.query(
            `UPDATE tb_variation SET qty='${parseInt(get_qty_old[0].qty) + parseInt(get_pesanan[i].qty)
            }',updated_at='${tanggal}' WHERE id_produk='${get_pesanan[i].id_produk
            }' AND id_ware='${get_pesanan[i].id_ware}' AND size='${get_pesanan[i].size
            }' AND idpo='${get_pesanan[i].idpo}'`
          );
          //
          await connection.query(
            `INSERT INTO tb_mutasistock
                    (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, created_at, updated_at)
                    VALUES ('${id_mutasi}','${tanggal_skrg}','${get_pesanan[i].id_pesanan}','${get_pesanan[i].id_ware}','${get_pesanan[i].id_store}','${get_pesanan[i].id_produk}','${get_pesanan[i].produk}','${get_pesanan[i].idpo}','${get_pesanan[i].size}','${get_pesanan[i].qty}','${get_pesanan[i].source}','-','CANCEL_ORDER','${tanggal}','${tanggal}')`
          );
        } else {
          await connection.query(
            `UPDATE tb_notabarang SET status_pesanan='CANCEL',updated_at='${tanggal}' WHERE id_nota='${get_pesanan[i].idpo}'`
          );

          var [get_nota] = await connection.query(
            `SELECT * FROM tb_notabarang WHERE id_nota='${get_pesanan[i].idpo}'`
          );

          var [get_supp] = await connection.query(
            `SELECT * FROM tb_supplier WHERE id_sup='${get_nota[0].id_sup}'`
          );

          await connection.query(
            `INSERT INTO tb_mutasistock
                    (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, created_at, updated_at)
                    VALUES ('${id_mutasi}','${tanggal_skrg}','${get_pesanan[i].id_pesanan}','${get_pesanan[i].id_ware}','${get_pesanan[i].id_store}','${get_pesanan[i].id_produk}','${get_pesanan[i].produk}','${get_pesanan[i].idpo}','${get_pesanan[i].size}','${get_pesanan[i].qty}','Barang Luar','${get_supp[0].supplier}','CANCEL_ORDER','${tanggal}','${tanggal}')`
          );
        }
      }
    } else if (status === "SELESAI") {
      for (let x = 0; x < get_pesanan.length; x++) {
        if (get_pesanan[x].source === "Barang Gudang") {
        } else {
          await connection.query(
            `UPDATE tb_notabarang SET status_pesanan='SELESAI',updated_at='${tanggal}' WHERE id_nota='${get_pesanan[x].idpo}'`
          );
        }
      }
    }

    await connection.commit();
    await connection.release();
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const gudangretur = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
  try {
    await connection.beginTransaction();

    const [data_role] = await connection.query(
      `SELECT * FROM tb_karyawan WHERE role='${body.role}'`
    );

    if (body.role === 'SUPER-ADMIN') {
      var [data_ware] = await connection.query(
        `SELECT * FROM tb_warehouse`
      );
    } else if (body.role === 'HEAD-AREA') {
      var [data_ware] = await connection.query(
        `SELECT * FROM tb_warehouse WHERE id_area='${body.area}'`
      );
    } else {
      var [list_data_role] = await connection.query(
        `SELECT * FROM tb_karyawan WHERE role='${body.role}' AND id_store='${body.area}'`
      );
      var [data_ware] = await connection.query(
        `SELECT tb_store.*,tb_warehouse.* FROM tb_store LEFT JOIN tb_warehouse ON tb_store.id_ware = tb_warehouse.id_ware WHERE tb_store.id_store='${list_data_role[0].id_store}'`
      );
    }

    // console.log(body)
    await connection.commit();
    await connection.release();

    return data_ware;
  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

const cekbarcode = async (body) => {
  const connection = await dbPool.getConnection();
  const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
  const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
  try {
    await connection.beginTransaction();

    const [cek_ketersediaan] = await connection.query(
      `SELECT id_ware,qty FROM tb_variation WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}' AND size='${body.size}' GROUP BY id_ware`
    );
    for (let index = 0; index < cek_ketersediaan.length; index++) {
      if (cek_ketersediaan[index].id_ware === body.idware) {
        var hasil_cekbarcode = "GO";
      }
    }

    const [cek_produk] = await connection.query(
      `SELECT img,produk,id_produk,g_price,r_price,n_price FROM tb_produk WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}'`
    );
    console.log(hasil_cekbarcode)

    await connection.commit();
    await connection.release();

    return {
      cek_produk,
      hasil_cekbarcode
    };


  } catch (error) {
    console.log(error);
    await connection.release();
  }
};

module.exports = {
  productsSales,
  salesProductbarcode,
  inputSales,
  order,
  orderCount,
  getHeaderpesanan,
  refund,
  getSizeretur,
  retur,
  returLuar,
  deletePesanan,
  updatePesanan,
  gudangretur,
  cekbarcode,
};
