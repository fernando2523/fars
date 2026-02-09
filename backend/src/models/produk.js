const { log } = require("console");
const dbPool = require("../config/database");

const date = require("date-and-time");
const { stringify } = require("querystring");
const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
const tanggal2 = date.format(new Date(), "YYYY-MM-DD");
const tanggalinput = date.format(new Date(), "YYYYMMDD");
const tahun = date.format(new Date(), "YY");
const { generateFromEmail } = require("unique-username-generator");

const getProduk = async (body) => {
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
        const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
        const tahun = date.format(new Date(), "YY");
        console.log("body produk ini", body);

        /** 
         * 1. Setup variabel awal dan filter dinamis 
         */
        let productFilters = [];
        let variationFilters = [];
        let output_area_ware = null;
        let areas;

        // Penentuan 'areas' berdasarkan role
        if (body.role === "SUPER-ADMIN" || body.role === "HEAD-AREA") {
            areas = body.area;
        } else if (body.role === "HEAD-WAREHOUSE") {
            const [cek_area] = await connection.query(
                `SELECT id_area FROM tb_warehouse WHERE id_ware=? GROUP BY id_area`,
                [body.area]
            );
            areas = cek_area[0]?.id_area;
        } else {
            const [cek_area] = await connection.query(`SELECT id_area FROM tb_store LIMIT 1`);
            areas = cek_area[0]?.id_area;
        }

        // ✅ WAJIB: filter area harus dipasang DI AWAL sebelum query dibangun
        // Super-admin boleh lihat semua, jadi jangan dipaksa filter area
        if (body.role !== "SUPER-ADMIN" && areas) {
            productFilters.push(`tb_produk.id_ware IN (
                SELECT id_ware FROM tb_warehouse WHERE id_area='${areas}'
            )`);
        }

        const limit = parseInt(body.limit) || 20;
        const page = parseInt(body.page) || 1;
        const offset = (page - 1) * limit;

        // Jika id_ware = "all_area", tentukan output_area_ware
        if (body.id_ware === "all_area") {
            const areaPrefix = body.area.split("-")[0];
            if (areaPrefix === "WARE") {
                const [data_get_ware] = await connection.query(
                    `SELECT id_area FROM tb_warehouse WHERE id_ware=? GROUP BY id_area`,
                    [body.area]
                );
                output_area_ware = data_get_ware[0]?.id_area;
            } else if (areaPrefix === "AREA") {
                output_area_ware = body.area;
            }
        }

        if (body.query !== "all") {
            productFilters.push(`
                (tb_produk.produk LIKE '%${body.query}%'
                OR tb_produk.id_produk LIKE '%${body.query}%')
            `);
        }

        if (body.id_ware !== "all" && body.id_ware !== "all_area") {
            productFilters.push(`tb_produk.id_ware='${body.id_ware}'`);
        }

        if (body.brand !== "all") {
            variationFilters.push(`tb_variation.id_area='${body.brand}'`);
        }
        // khusus all_area tapi brand = all
        if (body.id_ware === "all_area" && body.brand === "all" && output_area_ware) {
            variationFilters.push(`tb_variation.id_area='${output_area_ware}'`);
        }

        // Urutan (sorting)
        let orderBy = "";
        if (body.urutan === "all") {
            orderBy = "tb_produk.id DESC";
        } else if (body.urutan === "desc") {
            orderBy = "SUM(tb_variation.qty) DESC";
        } else {
            orderBy = "SUM(tb_variation.qty) ASC";
        }


        /**
         * 2. Membangun query utama secara dinamis
         */
        let baseQuery = `
            SELECT 
                tb_produk.*,
                SUM(tb_variation.qty) AS total_qty
            FROM tb_produk
            LEFT JOIN tb_variation
                ON tb_produk.id_produk = tb_variation.id_produk
                AND tb_produk.id_ware = tb_variation.id_ware
            ${productFilters.length ? "WHERE " + productFilters.join(" AND ") : ""}
            GROUP BY tb_produk.id_produk, tb_produk.id_ware
            ORDER BY ${body.urutan === "desc"
                ? "total_qty DESC"
                : body.urutan === "asc"
                    ? "total_qty ASC"
                    : "tb_produk.id DESC"
            }
            LIMIT ${limit}
            OFFSET ${offset}
        `;



        const [data_produk] = await connection.query(baseQuery);

        /**
         * 3. Menghitung total produk dan jumlah qty (sum_artikel) 
         *    dengan query yang mengacu pada filter yang sama
         */
        let countQuery = `
            SELECT COUNT(*) AS totals
            FROM (
                SELECT tb_produk.id_produk, tb_produk.id_ware
                FROM tb_produk
                LEFT JOIN tb_variation
                    ON tb_produk.id_produk = tb_variation.id_produk
                    AND tb_produk.id_ware = tb_variation.id_ware
                ${productFilters.length
                ? "WHERE " + productFilters.join(" AND ") + " AND "
                : "WHERE "
            }
                tb_produk.produk NOT REGEXP 'PaperBag|Double Box|Kaos Kaki'
                GROUP BY tb_produk.id_produk
            ) x
        `;

        const [totalCountResult] = await connection.query(countQuery);
        const total_artikel = totalCountResult.length ? totalCountResult[0].totals : 0;
        const total_pages = Math.ceil(total_artikel / limit);

        let sumQuery = `
            SELECT SUM(tb_variation.qty) AS sumqty
            FROM tb_produk
            ${variationFilters.length ? "JOIN" : "LEFT JOIN"} tb_variation
                ON tb_produk.id_produk = tb_variation.id_produk
                AND tb_produk.id_ware = tb_variation.id_ware
                ${variationFilters.length ? "AND " + variationFilters.join(" AND ") : ""}
            ${productFilters.length
                ? "WHERE " + productFilters.join(" AND ") + " AND "
                : "WHERE "
            }
            tb_produk.produk NOT REGEXP 'PaperBag|Double Box|Kaos Kaki'
        `;


        const [sumResult] = await connection.query(sumQuery);
        const sum_artikel = sumResult[0]?.sumqty || 0;

        /**
         * 4. Memproses tiap produk untuk mengambil detail-detail terkait
         */
        const datas = [];
        for (let index = 0; index < data_produk.length; index++) {
            const produkItem = data_produk[index];

            const [details] = await connection.query(
                `SELECT *, SUM(qty) as qty, COUNT(size) as totalqty 
           FROM tb_variation 
           WHERE id_produk=? AND id_ware=? 
           GROUP BY id_ware`,
                [produkItem.id_produk, produkItem.id_ware]
            );
            const countqty = details[0]?.qty || 0;

            const [detail_variation] = await connection.query(
                `SELECT tb_variation.*, SUM(tb_variation.qty) as qty, displays.size as sizes, 
                  displays.qty as qtyss, displays.id_ware as id_waress 
           FROM tb_variation 
           LEFT JOIN displays ON tb_variation.id_produk = displays.id_produk 
           WHERE tb_variation.id_produk=? AND tb_variation.id_ware=? 
           GROUP BY tb_variation.id_ware, tb_variation.size 
           ORDER BY tb_variation.id ASC`,
                [produkItem.id_produk, produkItem.id_ware]
            );

            const [data_category] = await connection.query(
                `SELECT category FROM tb_category WHERE id_category=?`,
                [produkItem.id_category]
            );

            const [data_warehouse] = await connection.query(
                `SELECT tb_warehouse.id_ware, tb_warehouse.warehouse
           FROM tb_warehouse 
           LEFT JOIN tb_store ON tb_store.id_ware = tb_warehouse.id_ware 
           WHERE tb_warehouse.id_ware=?`,
                [produkItem.id_ware]
            );

            const [data_brand] = await connection.query(
                `SELECT brand FROM tb_brand WHERE id_brand=?`,
                [produkItem.id_brand]
            );

            const [data_area] = await connection.query(
                `SELECT tb_area.*, tb_warehouse.id_area, id_ware 
           FROM tb_area 
           LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area 
           WHERE tb_warehouse.id_ware=?`,
                [produkItem.id_ware]
            );

            datas.push({
                id: produkItem.id,
                id_produk: produkItem.id_produk,
                id_ware: produkItem.id_ware,
                id_brand: produkItem.id_brand,
                id_category: produkItem.id_category,
                tanggal_upload: produkItem.tanggal_upload,
                produk: produkItem.produk,
                deskripsi: produkItem.deskripsi,
                quality: produkItem.quality,
                n_price: produkItem.n_price,
                r_price: produkItem.r_price,
                g_price: produkItem.g_price,
                img: produkItem.img,
                users: produkItem.users,
                created_at: produkItem.created_at,
                updated_at: produkItem.updated_at,
                countqty: countqty,
                detail_variation: detail_variation,
                category: data_category,
                warehouse: data_warehouse,
                brand: data_brand,
                // Jika detail_variation tidak kosong, ambil value dari baris pertama
                sizes: detail_variation.length ? detail_variation[0].sizes : null,
                qtyss: detail_variation.length ? detail_variation[0].qtyss : null,
                id_waress: detail_variation.length ? detail_variation[0].id_waress : null,
                upprice_n_price: data_area[0]?.n_price,
                upprice_r_price: data_area[0]?.r_price,
                upprice_g_price: data_area[0]?.g_price,
                no_urut: offset + index + 1
            });
        }

        await connection.commit();
        connection.release();

        return {
            datas,
            total_artikel,
            sum_artikel,
            total_pages,
            page,
            limit
        };
    } catch (error) {
        console.error(error);
        await connection.release();
        throw error;
    }
};

const getProdukdisplay = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();
        if (body.role === "SUPER-ADMIN" || body.role === "HEAD-AREA") {
            var areas = body.area;
        } else if (body.role === "HEAD-WAREHOUSE") {
            var [cek_area] = await connection.query(
                `SELECT id_area FROM tb_warehouse WHERE id_ware='${body.area}' GROUP BY id_area ORDER BY id DESC`
            );
            var areas = cek_area[0].id_area;
        } else {
            var [cek_area] = await connection.query(
                `SELECT id_area FROM tb_store`
            );
            var areas = cek_area[0].id_area;
        }
        const datas = [];

        if (body.store != "all") {
            var [cek_store] = await connection.query(
                `SELECT * FROM tb_store WHERE id_store='${body.store}'`
            );

            for (let mm = 0; mm < cek_store.length; mm++) {
                var [cek_id_ware] = await connection.query(
                    `SELECT * FROM tb_warehouse WHERE id_ware='${cek_store[mm].id_ware}' ORDER BY id DESC`
                );

                var getidware = cek_id_ware[0].id_ware;
            }
        } else {
            var [cek_id_ware] = await connection.query(
                `SELECT * FROM tb_warehouse ORDER BY id DESC`
            );

            var getidware = cek_id_ware[0].id_ware;
        }

        var [countproduk] = await connection.query(
            `SELECT * FROM tb_produk`
        );

        if (body.loadmorelimit === 1) {
            var limitss = 20;
        } else if (body.loadmorelimit === 0) {
            var limitss = 0;
        } else {
            var limitss = body.loadmorelimit * 20;
        }
        const total_pages = countproduk.length / 20;

        if (body.role === "SUPER-ADMIN") {
            if (body.store === "all") {
                if (body.query === "all") {
                    if (countproduk.length < 20) {
                        var [data_produk] = await connection.query(
                            `SELECT * FROM tb_produk ORDER BY id DESC LIMIT 20`
                        );
                    } else {
                        var [data_produk] = await connection.query(
                            `SELECT * FROM tb_produk ORDER BY id DESC LIMIT 20 OFFSET ${limitss}`
                        );
                    }
                    for (let index = 0; index < data_produk.length; index++) {
                        var [details] = await connection.query(`SELECT *,SUM(qty) as qty,COUNT(size) as totalqty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware`);
                        var [detail_variation] = await connection.query(`SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware,size`);
                        var [data_category] = await connection.query(`SELECT * FROM tb_category WHERE id_category='${data_produk[index].id_category}'`);
                        var [data_warehouse] = await connection.query(`SELECT * FROM tb_warehouse WHERE id_ware='${data_produk[index].id_ware}'`);
                        var [data_brand] = await connection.query(`SELECT * FROM tb_brand WHERE id_brand='${data_produk[index].id_brand}'`);
                        var [data_area] = await connection.query(`SELECT tb_area.*,tb_warehouse.id_area,id_ware FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware='${data_produk[index].id_ware}'`);
                        var [display] = await connection.query(`SELECT * FROM displays WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}'`);

                        datas.push({
                            id: data_produk[index].id,
                            id_produk: data_produk[index].id_produk,
                            id_ware: data_produk[index].id_ware,
                            id_brand: data_produk[index].id_brand,
                            id_category: data_produk[index].id_category,
                            tanggal_upload: data_produk[index].tanggal_upload,
                            produk: data_produk[index].produk,
                            deskripsi: data_produk[index].deskripsi,
                            quality: data_produk[index].quality,
                            n_price: parseInt(data_produk[index].n_price) + parseInt(data_area[0].n_price),
                            r_price: parseInt(data_produk[index].r_price) + parseInt(data_area[0].r_price),
                            g_price: parseInt(data_produk[index].g_price) + parseInt(data_area[0].g_price),
                            img: data_produk[index].img,
                            users: data_produk[index].users,
                            created_at: data_produk[index].created_at,
                            updated_at: data_produk[index].updated_at,
                            detail: details,
                            detail_variation: detail_variation,
                            category: data_category,
                            warehouse: data_warehouse,
                            brand: data_brand,
                            display: display,
                        });
                    }
                } else {
                    var [data_produk] = await connection.query(
                        `SELECT tb_produk.*,tb_brand.brand FROM tb_produk LEFT JOIN tb_brand ON tb_produk.id_brand = tb_brand.id_brand WHERE (tb_produk.produk LIKE '%${body.query}%' OR tb_produk.id_produk LIKE '%${body.query}%') ORDER BY tb_produk.id DESC`
                    );

                    for (let index = 0; index < data_produk.length; index++) {
                        // var [details] = await connection.query(`SELECT *,SUM(qty) as qty,COUNT(size) as totalqty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk} AND id_ware='${data_produk[index].id_ware}'`);
                        var [detail_variation] = await connection.query(`SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware,size`);
                        var [data_category] = await connection.query(`SELECT * FROM tb_category WHERE id_category='${data_produk[index].id_category}'`);
                        var [data_warehouse] = await connection.query(`SELECT * FROM tb_warehouse WHERE id_ware='${data_produk[index].id_ware}'`);
                        var [data_brand] = await connection.query(`SELECT * FROM tb_brand WHERE id_brand='${data_produk[index].id_brand}'`);
                        var [data_area] = await connection.query(`SELECT tb_area.*,tb_warehouse.id_area,id_ware FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware='${data_produk[index].id_ware}'`);
                        var [display] = await connection.query(`SELECT * FROM displays WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}'`);

                        datas.push({
                            id: data_produk[index].id,
                            id_produk: data_produk[index].id_produk,
                            id_ware: data_produk[index].id_ware,
                            id_brand: data_produk[index].id_brand,
                            id_category: data_produk[index].id_category,
                            tanggal_upload: data_produk[index].tanggal_upload,
                            produk: data_produk[index].produk,
                            deskripsi: data_produk[index].deskripsi,
                            quality: data_produk[index].quality,
                            n_price: parseInt(data_produk[index].n_price) + parseInt(data_area[0].n_price),
                            r_price: parseInt(data_produk[index].r_price) + parseInt(data_area[0].r_price),
                            g_price: parseInt(data_produk[index].g_price) + parseInt(data_area[0].g_price),
                            img: data_produk[index].img,
                            users: data_produk[index].users,
                            created_at: data_produk[index].created_at,
                            updated_at: data_produk[index].updated_at,
                            detail: "",
                            detail_variation: detail_variation,
                            category: data_category,
                            warehouse: data_warehouse,
                            brand: data_brand,
                            display: display,
                        });
                    }
                }
            } else {
                if (body.query === "all") {
                    if (countproduk.length < 20) {
                        var [data_produk] = await connection.query(
                            `SELECT * FROM tb_produk LEFT JOIN tb_store ON tb_produk.id_ware = tb_store.id_ware WHERE tb_store.id_store='${body.store}' ORDER BY tb_produk.id DESC LIMIT 20`
                        );
                    } else {
                        var [data_produk] = await connection.query(
                            `SELECT * FROM tb_produk LEFT JOIN tb_store ON tb_produk.id_ware = tb_store.id_ware WHERE tb_store.id_store='${body.store}' ORDER BY tb_produk.id DESC LIMIT 20 OFFSET ${limitss}`
                        );
                    }
                    for (let index = 0; index < data_produk.length; index++) {
                        var [details] = await connection.query(`SELECT *,SUM(qty) as qty,COUNT(size) as totalqty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware`);
                        var [detail_variation] = await connection.query(`SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware,size`);
                        var [data_category] = await connection.query(`SELECT * FROM tb_category WHERE id_category='${data_produk[index].id_category}'`);
                        var [data_warehouse] = await connection.query(`SELECT * FROM tb_warehouse WHERE id_ware='${data_produk[index].id_ware}'`);
                        var [data_brand] = await connection.query(`SELECT * FROM tb_brand WHERE id_brand='${data_produk[index].id_brand}'`);
                        var [data_area] = await connection.query(`SELECT tb_area.*,tb_warehouse.id_area,id_ware FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware='${data_produk[index].id_ware}'`);
                        var [display] = await connection.query(`SELECT * FROM displays WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}'`);

                        datas.push({
                            id: data_produk[index].id,
                            id_produk: data_produk[index].id_produk,
                            id_ware: data_produk[index].id_ware,
                            id_brand: data_produk[index].id_brand,
                            id_category: data_produk[index].id_category,
                            tanggal_upload: data_produk[index].tanggal_upload,
                            produk: data_produk[index].produk,
                            deskripsi: data_produk[index].deskripsi,
                            quality: data_produk[index].quality,
                            n_price: parseInt(data_produk[index].n_price) + parseInt(data_area[0].n_price),
                            r_price: parseInt(data_produk[index].r_price) + parseInt(data_area[0].r_price),
                            g_price: parseInt(data_produk[index].g_price) + parseInt(data_area[0].g_price),
                            img: data_produk[index].img,
                            users: data_produk[index].users,
                            created_at: data_produk[index].created_at,
                            updated_at: data_produk[index].updated_at,
                            detail: details,
                            detail_variation: detail_variation,
                            category: data_category,
                            warehouse: data_warehouse,
                            brand: data_brand,
                            display: display,
                        });
                    }
                } else {
                    var [data_produk] = await connection.query(
                        `SELECT tb_produk.*,tb_brand.brand FROM tb_produk LEFT JOIN tb_brand ON tb_produk.id_brand = tb_brand.id_brand LEFT JOIN tb_store ON tb_produk.id_ware = tb_store.id_ware WHERE (tb_produk.produk LIKE '%${body.query}%' OR tb_produk.id_produk LIKE '%${body.query}%') AND tb_store.id_store='${body.store}' ORDER BY tb_produk.id DESC`
                    );

                    for (let index = 0; index < data_produk.length; index++) {
                        // var [details] = await connection.query(`SELECT *,SUM(qty) as qty,COUNT(size) as totalqty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk} AND id_ware='${data_produk[index].id_ware}'`);
                        var [detail_variation] = await connection.query(`SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware,size`);
                        var [data_category] = await connection.query(`SELECT * FROM tb_category WHERE id_category='${data_produk[index].id_category}'`);
                        var [data_warehouse] = await connection.query(`SELECT * FROM tb_warehouse WHERE id_ware='${data_produk[index].id_ware}'`);
                        var [data_brand] = await connection.query(`SELECT * FROM tb_brand WHERE id_brand='${data_produk[index].id_brand}'`);
                        var [data_area] = await connection.query(`SELECT tb_area.*,tb_warehouse.id_area,id_ware FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware='${data_produk[index].id_ware}'`);
                        var [display] = await connection.query(`SELECT * FROM displays WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}'`);

                        datas.push({
                            id: data_produk[index].id,
                            id_produk: data_produk[index].id_produk,
                            id_ware: data_produk[index].id_ware,
                            id_brand: data_produk[index].id_brand,
                            id_category: data_produk[index].id_category,
                            tanggal_upload: data_produk[index].tanggal_upload,
                            produk: data_produk[index].produk,
                            deskripsi: data_produk[index].deskripsi,
                            quality: data_produk[index].quality,
                            n_price: parseInt(data_produk[index].n_price) + parseInt(data_area[0].n_price),
                            r_price: parseInt(data_produk[index].r_price) + parseInt(data_area[0].r_price),
                            g_price: parseInt(data_produk[index].g_price) + parseInt(data_area[0].g_price),
                            img: data_produk[index].img,
                            users: data_produk[index].users,
                            created_at: data_produk[index].created_at,
                            updated_at: data_produk[index].updated_at,
                            detail: "",
                            detail_variation: detail_variation,
                            category: data_category,
                            warehouse: data_warehouse,
                            brand: data_brand,
                            display: display,
                        });
                    }
                }
            }
        } else if (body.role === "HEAD-AREA") {
            if (body.store === "all_area") {
                if (body.query === "all") {
                    if (countproduk.length < 20) {
                        var [data_produk] = await connection.query(
                            `SELECT * FROM tb_produk LEFT JOIN tb_warehouse ON tb_produk.id_ware = tb_warehouse.id_ware WHERE tb_produk.id_ware='${body.area}' ORDER BY tb_produk.id DESC LIMIT 20`
                        );
                    } else {
                        var [data_produk] = await connection.query(
                            `SELECT * FROM tb_produk LEFT JOIN tb_warehouse ON tb_produk.id_ware = tb_warehouse.id_ware WHERE tb_warehouse.id_area='${body.area}' ORDER BY tb_produk.id DESC LIMIT 20 OFFSET ${limitss}`
                        );
                    }
                    for (let index = 0; index < data_produk.length; index++) {
                        var [details] = await connection.query(`SELECT *,SUM(qty) as qty,COUNT(size) as totalqty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware`);
                        var [detail_variation] = await connection.query(`SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware,size`);
                        var [data_category] = await connection.query(`SELECT * FROM tb_category WHERE id_category='${data_produk[index].id_category}'`);
                        var [data_warehouse] = await connection.query(`SELECT * FROM tb_warehouse WHERE id_ware='${data_produk[index].id_ware}'`);
                        var [data_brand] = await connection.query(`SELECT * FROM tb_brand WHERE id_brand='${data_produk[index].id_brand}'`);
                        var [data_area] = await connection.query(`SELECT tb_area.*,tb_warehouse.id_area,id_ware FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware='${data_produk[index].id_ware}'`);
                        var [display] = await connection.query(`SELECT * FROM displays WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}'`);

                        datas.push({
                            id: data_produk[index].id,
                            id_produk: data_produk[index].id_produk,
                            id_ware: data_produk[index].id_ware,
                            id_brand: data_produk[index].id_brand,
                            id_category: data_produk[index].id_category,
                            tanggal_upload: data_produk[index].tanggal_upload,
                            produk: data_produk[index].produk,
                            deskripsi: data_produk[index].deskripsi,
                            quality: data_produk[index].quality,
                            n_price: parseInt(data_produk[index].n_price) + parseInt(data_area[0].n_price),
                            r_price: parseInt(data_produk[index].r_price) + parseInt(data_area[0].r_price),
                            g_price: parseInt(data_produk[index].g_price) + parseInt(data_area[0].g_price),
                            img: data_produk[index].img,
                            users: data_produk[index].users,
                            created_at: data_produk[index].created_at,
                            updated_at: data_produk[index].updated_at,
                            detail: details,
                            detail_variation: detail_variation,
                            category: data_category,
                            warehouse: data_warehouse,
                            brand: data_brand,
                            display: display,
                        });
                    }
                } else {
                    var [data_produk] = await connection.query(
                        `SELECT tb_produk.*,tb_brand.brand FROM tb_produk LEFT JOIN tb_brand ON tb_produk.id_brand = tb_brand.id_brand LEFT JOIN tb_warehouse ON tb_produk.id_ware = tb_warehouse.id_ware WHERE (tb_produk.produk LIKE '%${body.query}%' OR tb_produk.id_produk LIKE '%${body.query}%') AND tb_warehouse.id_area='${body.area}' AND tb_produk.id_ware != 'EXTERNAL'  ORDER BY tb_produk.id DESC`
                    );

                    for (let index = 0; index < data_produk.length; index++) {
                        // var [details] = await connection.query(`SELECT *,SUM(qty) as qty,COUNT(size) as totalqty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk} AND id_ware='${data_produk[index].id_ware}'`);
                        var [detail_variation] = await connection.query(`SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware,size`);
                        var [data_category] = await connection.query(`SELECT * FROM tb_category WHERE id_category='${data_produk[index].id_category}'`);
                        var [data_warehouse] = await connection.query(`SELECT * FROM tb_warehouse WHERE id_ware='${data_produk[index].id_ware}'`);
                        var [data_brand] = await connection.query(`SELECT * FROM tb_brand WHERE id_brand='${data_produk[index].id_brand}'`);
                        var [data_area] = await connection.query(`SELECT tb_area.*,tb_warehouse.id_area,id_ware FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware='${data_produk[index].id_ware}'`);
                        var [display] = await connection.query(`SELECT * FROM displays WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}'`);

                        datas.push({
                            id: data_produk[index].id,
                            id_produk: data_produk[index].id_produk,
                            id_ware: data_produk[index].id_ware,
                            id_brand: data_produk[index].id_brand,
                            id_category: data_produk[index].id_category,
                            tanggal_upload: data_produk[index].tanggal_upload,
                            produk: data_produk[index].produk,
                            deskripsi: data_produk[index].deskripsi,
                            quality: data_produk[index].quality,
                            n_price: parseInt(data_produk[index].n_price) + parseInt(data_area[0].n_price),
                            r_price: parseInt(data_produk[index].r_price) + parseInt(data_area[0].r_price),
                            g_price: parseInt(data_produk[index].g_price) + parseInt(data_area[0].g_price),
                            img: data_produk[index].img,
                            users: data_produk[index].users,
                            created_at: data_produk[index].created_at,
                            updated_at: data_produk[index].updated_at,
                            detail: "",
                            detail_variation: detail_variation,
                            category: data_category,
                            warehouse: data_warehouse,
                            brand: data_brand,
                            display: display,
                        });
                    }
                }
            } else {
                if (body.query === "all") {
                    if (countproduk.length < 20) {
                        var [data_produk] = await connection.query(
                            `SELECT * FROM tb_produk LEFT JOIN tb_store ON tb_produk.id_ware = tb_store.id_ware WHERE tb_store.id_store='${body.store}' ORDER BY tb_produk.id DESC LIMIT 20`
                        );
                    } else {
                        var [data_produk] = await connection.query(
                            `SELECT * FROM tb_produk LEFT JOIN tb_store ON tb_produk.id_ware = tb_store.id_ware WHERE tb_store.id_store='${body.store}' ORDER BY tb_produk.id DESC LIMIT 20 OFFSET ${limitss}`
                        );
                    }
                    for (let index = 0; index < data_produk.length; index++) {
                        var [details] = await connection.query(`SELECT *,SUM(qty) as qty,COUNT(size) as totalqty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware`);
                        var [detail_variation] = await connection.query(`SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware,size`);
                        var [data_category] = await connection.query(`SELECT * FROM tb_category WHERE id_category='${data_produk[index].id_category}'`);
                        var [data_warehouse] = await connection.query(`SELECT * FROM tb_warehouse WHERE id_ware='${data_produk[index].id_ware}'`);
                        var [data_brand] = await connection.query(`SELECT * FROM tb_brand WHERE id_brand='${data_produk[index].id_brand}'`);
                        var [data_area] = await connection.query(`SELECT tb_area.*,tb_warehouse.id_area,id_ware FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware='${data_produk[index].id_ware}'`);
                        var [display] = await connection.query(`SELECT * FROM displays WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}'`);

                        datas.push({
                            id: data_produk[index].id,
                            id_produk: data_produk[index].id_produk,
                            id_ware: data_produk[index].id_ware,
                            id_brand: data_produk[index].id_brand,
                            id_category: data_produk[index].id_category,
                            tanggal_upload: data_produk[index].tanggal_upload,
                            produk: data_produk[index].produk,
                            deskripsi: data_produk[index].deskripsi,
                            quality: data_produk[index].quality,
                            n_price: parseInt(data_produk[index].n_price) + parseInt(data_area[0].n_price),
                            r_price: parseInt(data_produk[index].r_price) + parseInt(data_area[0].r_price),
                            g_price: parseInt(data_produk[index].g_price) + parseInt(data_area[0].g_price),
                            img: data_produk[index].img,
                            users: data_produk[index].users,
                            created_at: data_produk[index].created_at,
                            updated_at: data_produk[index].updated_at,
                            detail: details,
                            detail_variation: detail_variation,
                            category: data_category,
                            warehouse: data_warehouse,
                            brand: data_brand,
                            display: display,
                        });
                    }
                } else {
                    var [data_produk] = await connection.query(
                        `SELECT tb_produk.*,tb_brand.brand FROM tb_produk LEFT JOIN tb_brand ON tb_produk.id_brand = tb_brand.id_brand LEFT JOIN tb_store ON tb_produk.id_ware = tb_store.id_ware WHERE (tb_produk.produk LIKE '%${body.query}%' OR tb_produk.id_produk LIKE '%${body.query}%') AND tb_store.id_store='${body.store}' ORDER BY tb_produk.id DESC`
                    );

                    for (let index = 0; index < data_produk.length; index++) {
                        // var [details] = await connection.query(`SELECT *,SUM(qty) as qty,COUNT(size) as totalqty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk} AND id_ware='${data_produk[index].id_ware}'`);
                        var [detail_variation] = await connection.query(`SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware,size`);
                        var [data_category] = await connection.query(`SELECT * FROM tb_category WHERE id_category='${data_produk[index].id_category}'`);
                        var [data_warehouse] = await connection.query(`SELECT * FROM tb_warehouse WHERE id_ware='${data_produk[index].id_ware}'`);
                        var [data_brand] = await connection.query(`SELECT * FROM tb_brand WHERE id_brand='${data_produk[index].id_brand}'`);
                        var [data_area] = await connection.query(`SELECT tb_area.*,tb_warehouse.id_area,id_ware FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware='${data_produk[index].id_ware}'`);
                        var [display] = await connection.query(`SELECT * FROM displays WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}'`);

                        datas.push({
                            id: data_produk[index].id,
                            id_produk: data_produk[index].id_produk,
                            id_ware: data_produk[index].id_ware,
                            id_brand: data_produk[index].id_brand,
                            id_category: data_produk[index].id_category,
                            tanggal_upload: data_produk[index].tanggal_upload,
                            produk: data_produk[index].produk,
                            deskripsi: data_produk[index].deskripsi,
                            quality: data_produk[index].quality,
                            n_price: parseInt(data_produk[index].n_price) + parseInt(data_area[0].n_price),
                            r_price: parseInt(data_produk[index].r_price) + parseInt(data_area[0].r_price),
                            g_price: parseInt(data_produk[index].g_price) + parseInt(data_area[0].g_price),
                            img: data_produk[index].img,
                            users: data_produk[index].users,
                            created_at: data_produk[index].created_at,
                            updated_at: data_produk[index].updated_at,
                            detail: "",
                            detail_variation: detail_variation,
                            category: data_category,
                            warehouse: data_warehouse,
                            brand: data_brand,
                            display: display,
                        });
                    }
                }
            }
        } else {
            if (body.query === "all") {
                if (countproduk.length < 20) {
                    var [data_produk] = await connection.query(
                        `SELECT * FROM tb_produk LEFT JOIN tb_store ON tb_produk.id_ware = tb_store.id_ware WHERE tb_store.id_store='${body.store}' ORDER BY tb_produk.id DESC LIMIT 20`
                    );
                } else {
                    var [data_produk] = await connection.query(
                        `SELECT * FROM tb_produk LEFT JOIN tb_store ON tb_produk.id_ware = tb_store.id_ware WHERE tb_store.id_store='${body.store}' ORDER BY tb_produk.id DESC LIMIT 20 OFFSET ${limitss}`
                    );
                }
                for (let index = 0; index < data_produk.length; index++) {
                    var [details] = await connection.query(`SELECT *,SUM(qty) as qty,COUNT(size) as totalqty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware`);
                    var [detail_variation] = await connection.query(`SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware,size`);
                    var [data_category] = await connection.query(`SELECT * FROM tb_category WHERE id_category='${data_produk[index].id_category}'`);
                    var [data_warehouse] = await connection.query(`SELECT * FROM tb_warehouse WHERE id_ware='${data_produk[index].id_ware}'`);
                    var [data_brand] = await connection.query(`SELECT * FROM tb_brand WHERE id_brand='${data_produk[index].id_brand}'`);
                    var [data_area] = await connection.query(`SELECT tb_area.*,tb_warehouse.id_area,id_ware FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware='${data_produk[index].id_ware}'`);
                    var [display] = await connection.query(`SELECT * FROM displays WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}'`);

                    datas.push({
                        id: data_produk[index].id,
                        id_produk: data_produk[index].id_produk,
                        id_ware: data_produk[index].id_ware,
                        id_brand: data_produk[index].id_brand,
                        id_category: data_produk[index].id_category,
                        tanggal_upload: data_produk[index].tanggal_upload,
                        produk: data_produk[index].produk,
                        deskripsi: data_produk[index].deskripsi,
                        quality: data_produk[index].quality,
                        n_price: parseInt(data_produk[index].n_price) + parseInt(data_area[0].n_price),
                        r_price: parseInt(data_produk[index].r_price) + parseInt(data_area[0].r_price),
                        g_price: parseInt(data_produk[index].g_price) + parseInt(data_area[0].g_price),
                        img: data_produk[index].img,
                        users: data_produk[index].users,
                        created_at: data_produk[index].created_at,
                        updated_at: data_produk[index].updated_at,
                        detail: details,
                        detail_variation: detail_variation,
                        category: data_category,
                        warehouse: data_warehouse,
                        brand: data_brand,
                        display: display,
                    });
                }
            } else {
                var [data_produk] = await connection.query(
                    `SELECT tb_produk.*,tb_brand.brand FROM tb_produk LEFT JOIN tb_brand ON tb_produk.id_brand = tb_brand.id_brand LEFT JOIN tb_store ON tb_produk.id_ware = tb_store.id_ware WHERE (tb_produk.produk LIKE '%${body.query}%' OR tb_produk.id_produk LIKE '%${body.query}%') AND tb_store.id_store='${body.store}' ORDER BY tb_produk.id DESC`
                );

                for (let index = 0; index < data_produk.length; index++) {
                    // var [details] = await connection.query(`SELECT *,SUM(qty) as qty,COUNT(size) as totalqty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk} AND id_ware='${data_produk[index].id_ware}'`);
                    var [detail_variation] = await connection.query(`SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}' GROUP BY id_ware,size`);
                    var [data_category] = await connection.query(`SELECT * FROM tb_category WHERE id_category='${data_produk[index].id_category}'`);
                    var [data_warehouse] = await connection.query(`SELECT * FROM tb_warehouse WHERE id_ware='${data_produk[index].id_ware}'`);
                    var [data_brand] = await connection.query(`SELECT * FROM tb_brand WHERE id_brand='${data_produk[index].id_brand}'`);
                    var [data_area] = await connection.query(`SELECT tb_area.*,tb_warehouse.id_area,id_ware FROM tb_area LEFT JOIN tb_warehouse ON tb_area.id_area = tb_warehouse.id_area WHERE tb_warehouse.id_ware='${data_produk[index].id_ware}'`);
                    var [display] = await connection.query(`SELECT * FROM displays WHERE id_produk='${data_produk[index].id_produk}' AND id_ware='${data_produk[index].id_ware}'`);

                    datas.push({
                        id: data_produk[index].id,
                        id_produk: data_produk[index].id_produk,
                        id_ware: data_produk[index].id_ware,
                        id_brand: data_produk[index].id_brand,
                        id_category: data_produk[index].id_category,
                        tanggal_upload: data_produk[index].tanggal_upload,
                        produk: data_produk[index].produk,
                        deskripsi: data_produk[index].deskripsi,
                        quality: data_produk[index].quality,
                        n_price: parseInt(data_produk[index].n_price) + parseInt(data_area[0].n_price),
                        r_price: parseInt(data_produk[index].r_price) + parseInt(data_area[0].r_price),
                        g_price: parseInt(data_produk[index].g_price) + parseInt(data_area[0].g_price),
                        img: data_produk[index].img,
                        users: data_produk[index].users,
                        created_at: data_produk[index].created_at,
                        updated_at: data_produk[index].updated_at,
                        detail: "",
                        detail_variation: detail_variation,
                        category: data_category,
                        warehouse: data_warehouse,
                        brand: data_brand,
                        display: display,
                    });
                }
            }
        }

        await connection.commit();
        await connection.release();
        return {
            datas,
            total_pages: Math.round(total_pages),
            show_page: limitss,
        };

    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const addProduk = async (data, img) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

    var rubahnama = data.produk.split(" ");
    for (let xxx = 0; xxx < rubahnama.length; xxx++) {
        rubahnama[xxx] = rubahnama[xxx][0].toUpperCase() + rubahnama[xxx].substring(1);
    }
    var namaproduk = rubahnama.join(" ")
    try {
        await connection.beginTransaction();

        const [cek_produk] = await connection.query(
            `SELECT MAX(id_produk) as id_produk FROM tb_produk`
        );
        if (cek_produk[0].id_produk === null) {
            var id_produk = "10" + tahun + "000001";
        } else {
            const get_last2 = cek_produk[0].id_produk;
            const data_2 = get_last2.toString().slice(-6);
            const hasil = parseInt(data_2) + 1;
            var id_produk = "10" + tahun + String(hasil).padStart(6, "0");
        }

        const [data_wares] = await connection.query(
            `SELECT * FROM tb_warehouse WHERE id_ware != 'EXTERNAL' AND id_cat='${data.kategori}'`
        );

        const [data_sup] = await connection.query(
            `SELECT supplier FROM tb_supplier WHERE id_sup='${data.supplier}'`
        );

        if (data.file === 'null') {
            for (let xx = 0; xx < data_wares.length; xx++) {
                await connection.query(
                    `INSERT INTO tb_produk
                (id_produk, id_ware, id_brand, id_category, tanggal_upload, produk, deskripsi, quality, n_price, r_price, g_price, img, users, created_at, updated_at)
                VALUES ('${id_produk}','${data_wares[xx].id_ware}','${data.brand}','${data.kategori}','${tanggal_skrg}','${namaproduk}','-','${data.quality}','${data.n_price}','${data.r_price}','${data.g_price}','defaultimg.png','${data.users}','${tanggal}','${tanggal}')`
                );
            }
        } else {
            for (let xx = 0; xx < data_wares.length; xx++) {
                await connection.query(
                    `INSERT INTO tb_produk
            (id_produk, id_ware, id_brand, id_category, tanggal_upload, produk, deskripsi, quality, n_price, r_price, g_price, img, users, created_at, updated_at)
            VALUES ('${id_produk}','${data_wares[xx].id_ware}','${data.brand}','${data.kategori}','${tanggal_skrg}','${namaproduk}','-','${data.quality}','${data.n_price}','${data.r_price}','${data.g_price}','${img}','${data.users}','${tanggal}','${tanggal}')`
                );
            }
        }

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

        const [rows] = await connection.query(
            `SELECT id_act 
                FROM tb_purchaseorder 
                ORDER BY id_act DESC 
                LIMIT 1
                FOR UPDATE`
        );
        console.log("cek rows dlu", rows);

        let id_act;
        if (rows.length === 0 || rows[0].id_act == null) {
            id_act = 1;              // mulai dari 1 kalau tabel kosong = 1
        } else {
            id_act = rows[0].id_act + 1; // contoh: 1101 -> 1102 = 1
        }
        console.log("id_act hasil", id_act);


        const [cek_po] = await connection.query(
            `SELECT MAX(idpo) as idpo FROM tb_purchaseorder`
        );
        if (!cek_po[0].idpo) {
            var idpo = "10001"; // Jika belum ada data, mulai dari 0001
        } else {
            let lastNumber = parseInt(cek_po[0].idpo); // Ambil nomor terakhir sebagai angka
            lastNumber += 1; // Tambah 1

            const numLength = cek_po[0].idpo.length; // Panjang nomor sebelumnya
            var idpo = String(lastNumber).padStart(numLength, "0"); // Jaga format panjang angka
        }

        const [data_ware] = await connection.query(
            `SELECT * FROM tb_warehouse WHERE id_ware='${data.warehouse}'`
        );

        const variasi = JSON.parse(data.variasi)
        const id_area = data_ware[0].id_area

        const [data_wares_variasi] = await connection.query(
            `SELECT * FROM tb_warehouse WHERE id_ware != '${data.warehouse}'`
        );
        for (let indexz = 0; indexz < data_wares_variasi.length; indexz++) {
            for (let bb = 0; bb < variasi.length; bb++) {

                // var rubahsize = variasi[bb].size.split(" ");
                // for (let xxx = 0; xxx < rubahsize.length; xxx++) {
                //     rubahsize[xxx] = rubahsize[xxx][0].toUpperCase() + rubahsize[xxx].substring(1);
                // }
                // var namaproduk = rubahsize.join(" ")

                await connection.query(
                    `INSERT INTO tb_variation
                (tanggal, id_produk, idpo, id_area, id_ware, size, qty, id_act, users, created_at, updated_at)
                VALUES ('${tanggal_skrg}','${id_produk}','${idpo}','${id_area}','${data_wares_variasi[indexz].id_ware}','${variasi[bb].size.toUpperCase()}','0','${id_act}','${data.users}','${tanggal}','${tanggal}')`
                );

            }
        }

        for (let index = 0; index < variasi.length; index++) {
            await connection.query(
                `INSERT INTO tb_variation
            (tanggal, id_produk, idpo, id_area, id_ware, size, qty, id_act, users, created_at, updated_at)
            VALUES ('${tanggal_skrg}','${id_produk}','${idpo}','${id_area}','${data.warehouse}','${variasi[index].size.toUpperCase()}','${variasi[index].stok}','${id_act}','${data.users}','${tanggal}','${tanggal}')`
            );

            await connection.query(
                `INSERT INTO tb_variationorder
            (tanggal, id_produk, idpo, id_sup, id_area, id_ware, size, qty, id_act, tipe_order, users, created_at, updated_at)
            VALUES ('${tanggal_skrg}','${id_produk}','${idpo}','${data.supplier}','${id_area}','${data.warehouse}','${variasi[index].size.toUpperCase()}','${variasi[index].stok}','${id_act}','RELEASE','${data.users}','${tanggal}','${tanggal}')`
            );

            if (variasi[index].stok > 0) {
                await connection.query(
                    `INSERT INTO tb_mutasistock
                (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                VALUES ('${id_mutasi}','${tanggal_skrg}','BARANG BARU','${data.warehouse}','-','${id_produk}','${namaproduk}','${idpo}','${variasi[index].size.toUpperCase()}','${variasi[index].stok}','Barang Gudang','${data_sup[0].supplier}','ADD_PRODUK','${data.users}','${tanggal}','${tanggal}')`
                );
            }
        }

        // if (data.tipe_po === "PO_BARU") {
        await connection.query(
            `INSERT INTO tb_purchaseorder
                (idpo, tanggal_receive, id_sup, id_produk, id_ware, qty, m_price, total_amount, tipe_order, id_act, users, created_at, updated_at)
                VALUES ('${idpo}','${tanggal_skrg}','${data.supplier}','${id_produk}','${data.warehouse}','${data.qty_all}','${data.hargabeli}','${data.total_amount}','RELEASE','${id_act}','${data.users}','${tanggal}','${tanggal}')`
        );
        // } else {
        //     await connection.query(
        //         `INSERT INTO tb_purchaseorder
        //         (idpo, tanggal_receive, id_sup, id_produk, id_ware, qty, m_price, total_amount, tipe_order, id_act, users, created_at, updated_at)
        //         VALUES ('${data.history_po}','${tanggal_skrg}','${data.supplier}','${id_produk}','${data.warehouse}','${data.qty_all}','${data.hargabeli}','${data.total_amount}','RELEASE','${id_act}','ADMIN','${tanggal}','${tanggal}')`
        //     );
        // }


        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const editProduk = async (data, img) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    var edit_produk = data.edit_produk[0].toUpperCase() + data.edit_produk.substring(1);
    try {
        await connection.beginTransaction();
        console.log(img)
        console.log(data.edit_produk)
        var edit_g_price = data.edit_g_price.replace(/\D/g, "");
        var edit_r_price = data.edit_r_price.replace(/\D/g, "");
        var edit_n_price = data.edit_n_price.replace(/\D/g, "");
        const [get_id_produk] = await connection.query(
            `SELECT id_produk FROM tb_produk WHERE id='${data.id}'`
        );

        await connection.query(
            `UPDATE tb_produk SET produk='${edit_produk}',id_brand='${data.edit_brand}',id_category='${data.edit_kategori}',quality='${data.edit_quality}',g_price='${edit_g_price}',r_price='${edit_r_price}',n_price='${edit_n_price}',updated_at='${tanggal}' WHERE id_produk='${get_id_produk[0].id_produk}'`
        );

        if (img === null || img === undefined || img === 'undefined') {

        } else {
            await connection.query(
                `UPDATE tb_produk SET img='${img}' WHERE id_produk='${get_id_produk[0].id_produk}'`
            );
        }

        await connection.commit();
        await connection.release();

        return 'oke';
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const deleteProduk = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        await connection.query(
            `DELETE FROM tb_produk WHERE id_produk='${body.id}' AND id_ware='${body.idware}'`
        );

        await connection.query(
            `DELETE FROM tb_variation WHERE id_produk='${body.id}' AND id_ware='${body.idware}'`
        );

        await connection.query(
            `DELETE FROM tb_variationorder WHERE id_produk='${body.id}' AND id_ware='${body.idware}'`
        );

        await connection.query(
            `DELETE FROM tb_purchaseorder WHERE id_produk='${body.id}' AND id_ware='${body.idware}'`
        );

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getSizesales = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [datasize] = await connection.query(
            `SELECT *,SUM(qty)as qty FROM tb_variation WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}' GROUP BY size`
        );
        const [stokready] = await connection.query(
            `SELECT qty,SUM(qty)as qty FROM tb_variation WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}' AND size='${body.size}' GROUP BY size`
        );
        for (let xox = 0; xox < stokready.length; xox++) {
            var get_stokready = stokready[xox].qty;
        }
        for (let index = 0; index < datasize.length; index++) {
            var [display] = await connection.query(
                `SELECT * FROM displays WHERE id_produk='${datasize[index].id_produk}' AND id_ware='${datasize[index].id_ware}' AND size='${datasize[index].size}'`
            );
            for (let xxx = 0; xxx < display.length; xxx++) {
                var display_id_produk = display[xxx].id_produk;
                var display_id_ware = display[xxx].id_ware;
                var display_size = display[xxx].size;
            }
        }

        const [getwares] = await connection.query(
            `SELECT id_area FROM tb_warehouse WHERE id_ware='${body.idware}'`
        );

        const [gudang_awal] = await connection.query(
            `SELECT warehouse FROM tb_warehouse WHERE id_ware='${body.idware}'`
        );

        const [get_hargajual] = await connection.query(
            `SELECT r_price FROM tb_produk WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}'`
        );
        // console.log(get_hargajual)
        await connection.commit();
        await connection.release();

        return {
            gudang_awal,
            datasize,
            get_hargajual,
            display_id_produk,
            display_id_ware,
            display_size,
            get_stokready,
        };
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getHistoriposelected = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const datas = [];

        const [data_po] = await connection.query(
            `SELECT tb_purchaseorder.*,SUM(qty) as qty,tb_supplier.supplier FROM tb_purchaseorder LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup WHERE tb_purchaseorder.id_ware='${body.idware}' AND tb_purchaseorder.id_produk='${body.idproduct}' AND tb_purchaseorder.tipe_order != 'TRANSFER IN' AND tb_purchaseorder.tipe_order != 'TRANSFER OUT' AND tb_purchaseorder.tipe_order != 'SO_GUDANG' GROUP BY tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
        );

        for (let index = 0; index < data_po.length; index++) {
            const [data_variationorder] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_variationorder WHERE idpo='${data_po[index].idpo}' AND id_ware='${body.idware}' AND id_produk='${body.idproduct}' GROUP BY size ORDER BY size DESC`
            );

            if (data_po[index].tipe_order === "TRANSFER") {
                const [get_ware] = await connection.query(
                    `SELECT warehouse FROM tb_warehouse WHERE id_ware='${data_po[index].id_sup}'`
                );
                datas.push({
                    id: data_po[index].id,
                    idpo: data_po[index].idpo,
                    tanggal_receive: data_po[index].tanggal_receive,
                    id_sup: data_po[index].id_sup,
                    id_produk: data_po[index].id_produk,
                    id_ware: data_po[index].id_ware,
                    qty: data_po[index].qty,
                    m_price: data_po[index].m_price,
                    total_amount: data_po[index].total_amount,
                    tipe_order: data_po[index].tipe_order,
                    id_act: data_po[index].id_act,
                    users: data_po[index].users,
                    supplier: get_ware[0].warehouse,
                    variation: data_variationorder,
                });
            } else {
                datas.push({
                    id: data_po[index].id,
                    idpo: data_po[index].idpo,
                    tanggal_receive: data_po[index].tanggal_receive,
                    id_sup: data_po[index].id_sup,
                    id_produk: data_po[index].id_produk,
                    id_ware: data_po[index].id_ware,
                    qty: data_po[index].qty,
                    m_price: data_po[index].m_price,
                    total_amount: data_po[index].total_amount,
                    tipe_order: data_po[index].tipe_order,
                    id_act: data_po[index].id_act,
                    users: data_po[index].users,
                    supplier: data_po[index].supplier,
                    variation: data_variationorder,
                });
            }

        }
        console.log(data_po)
        await connection.commit();
        await connection.release();

        return datas;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const repeatStok = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();
        const data = body.data;
        const hargabeli = data.harga_beli_repeat.replace(/\D/g, "")

        var qty_all = 0;
        for (let index = 0; index < data.variasirestock.length; index++) {
            qty_all = qty_all + parseInt(data.variasirestock[index].stok_baru);
        }
        var total_amount = qty_all * parseInt(hargabeli);

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

        const [id_ware] = await connection.query(
            `SELECT * FROM tb_warehouse WHERE id_ware='${data.id_gudang_pengirim}'`
        );


        const [cek_po] = await connection.query(
            `SELECT MAX(idpo) as idpo FROM tb_purchaseorder`
        );
        if (!cek_po[0].idpo) {
            var idpo = "10001"; // Jika belum ada data, mulai dari 0001
        } else {
            let lastNumber = parseInt(cek_po[0].idpo); // Ambil nomor terakhir sebagai angka
            lastNumber += 1; // Tambah 1

            const numLength = cek_po[0].idpo.length; // Panjang nomor sebelumnya
            var idpo = String(lastNumber).padStart(numLength, "0"); // Jaga format panjang angka
        }

        const [rows] = await connection.query(
            `SELECT id_act 
                FROM tb_purchaseorder 
                ORDER BY id_act DESC 
                LIMIT 1
                FOR UPDATE`
        );
        console.log("cek rows dlu", rows);

        let id_act;
        if (rows.length === 0 || rows[0].id_act == null) {
            id_act = 1;              // mulai dari 1 kalau tabel kosong = 1
        } else {
            id_act = rows[0].id_act + 1; // contoh: 1101 -> 1102 = 1
        }
        console.log("id_act hasil", id_act);


        const [get_product] = await connection.query(
            `SELECT * FROM tb_produk WHERE id_produk='${data.id_produk}'`
        );

        const [get_sup] = await connection.query(
            `SELECT * FROM tb_supplier WHERE id_sup='${data.supplier_pobaru}'`
        );

        const id_area = id_ware[0].id_area
        const variasi = data.variasirestock
        for (let index = 0; index < variasi.length; index++) {
            if (variasi[index] === null) {
            } else {

                await connection.query(
                    `INSERT INTO tb_variation (tanggal, id_produk, idpo, id_area, id_ware, size, qty, id_act, users, created_at, updated_at)
            VALUES ('${tanggal_skrg}','${data.id_produk}','${idpo}','${id_area}','${data.id_gudang_pengirim}','${variasi[index].size}','${variasi[index].stok_baru}','${id_act}','${body.users}','${tanggal}','${tanggal}')`
                );

                await connection.query(
                    `INSERT INTO tb_variationorder (tanggal, id_produk, idpo, id_sup, id_area, id_ware, size, qty, id_act, tipe_order, users, created_at, updated_at)
                VALUES ('${tanggal_skrg}','${data.id_produk}','${idpo}','${data.supplier_pobaru}','${id_area}','${data.id_gudang_pengirim}','${variasi[index].size}','${variasi[index].stok_baru}','${id_act}','RESTOCK','${body.users}','${tanggal}','${tanggal}')`
                );

                if (variasi[index].stok_baru > 0) {
                    await connection.query(
                        `INSERT INTO tb_mutasistock (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                VALUES ('${id_mutasi}','${tanggal_skrg}','REPEAT STOCK','${data.id_gudang_pengirim}','-','${data.id_produk}','${get_product[0].produk}','${idpo}','${variasi[index].size}','${variasi[index].stok_baru}','Barang Gudang','${get_sup[0].supplier}','RESTOCK','${body.users}','${tanggal}','${tanggal}')`
                    );
                }
            }


        }

        await connection.query(
            `INSERT INTO tb_purchaseorder
            (idpo, tanggal_receive, id_sup, id_produk, id_ware, qty, m_price, total_amount, tipe_order, id_act, users, created_at, updated_at)
            VALUES ('${idpo}','${tanggal_skrg}','${data.supplier_pobaru}','${data.id_produk}','${data.id_gudang_pengirim}','${qty_all}','${hargabeli}','${total_amount}','RESTOCK','${id_act}','${body.users}','${tanggal}','${tanggal}')`
        );

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getHargabeliso = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const datas = [];

        const [data_po] = await connection.query(
            `SELECT tb_purchaseorder.*,SUM(qty) as qty,tb_supplier.supplier FROM tb_purchaseorder LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup WHERE tb_purchaseorder.id_ware='${body.idware}' AND tb_purchaseorder.id_produk='${body.idproduct}' AND tb_purchaseorder.tipe_order != "SO_GUDANG" GROUP BY tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
        );

        for (let index = 0; index < data_po.length; index++) {
            const [data_variationorder] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_variationorder WHERE idpo='${data_po[index].idpo}' AND id_ware='${body.idware}' AND id_produk='${body.idproduct}' GROUP BY size ORDER BY size ASC`
            );

            if (data_po[index].tipe_order === "TRANSFER") {
                const [get_ware] = await connection.query(
                    `SELECT warehouse FROM tb_warehouse WHERE id_ware='${data_po[index].id_sup}'`
                );
                datas.push({
                    id: data_po[index].id,
                    idpo: data_po[index].idpo,
                    tanggal_receive: data_po[index].tanggal_receive,
                    id_sup: data_po[index].id_sup,
                    id_produk: data_po[index].id_produk,
                    id_ware: data_po[index].id_ware,
                    qty: data_po[index].qty,
                    m_price: data_po[index].m_price,
                    total_amount: data_po[index].total_amount,
                    tipe_order: data_po[index].tipe_order,
                    id_act: data_po[index].id_act,
                    users: data_po[index].users,
                    supplier: get_ware,
                    variation: data_variationorder,
                });
            } else {
                datas.push({
                    id: data_po[index].id,
                    idpo: data_po[index].idpo,
                    tanggal_receive: data_po[index].tanggal_receive,
                    id_sup: data_po[index].id_sup,
                    id_produk: data_po[index].id_produk,
                    id_ware: data_po[index].id_ware,
                    qty: data_po[index].qty,
                    m_price: data_po[index].m_price,
                    total_amount: data_po[index].total_amount,
                    tipe_order: data_po[index].tipe_order,
                    id_act: data_po[index].id_act,
                    users: data_po[index].users,
                    supplier: data_po[index].supplier,
                    variation: data_variationorder,
                });
            }

        }

        await connection.commit();
        await connection.release();
        return datas;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getHistorisoselected = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const datas = [];

        const [data_po] = await connection.query(
            `SELECT tb_purchaseorder.*,SUM(qty) as qty,tb_supplier.supplier FROM tb_purchaseorder LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup WHERE tb_purchaseorder.id_ware='${body.idware}' AND tb_purchaseorder.id_produk='${body.idproduct}' AND tipe_order="SO_GUDANG" GROUP BY tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
        );

        for (let index = 0; index < data_po.length; index++) {
            const [data_variationorder] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_variationorder WHERE idpo='${data_po[index].idpo}' AND id_ware='${body.idware}' AND id_produk='${body.idproduct}' AND tipe_order="SO_GUDANG" GROUP BY size ORDER BY size DESC`
            );

            if (data_po[index].tipe_order === "TRANSFER") {
                const [get_ware] = await connection.query(
                    `SELECT warehouse FROM tb_warehouse WHERE id_ware='${data_po[index].id_sup}'`
                );
                datas.push({
                    id: data_po[index].id,
                    idpo: data_po[index].idpo,
                    tanggal_receive: data_po[index].tanggal_receive,
                    id_sup: data_po[index].id_sup,
                    id_produk: data_po[index].id_produk,
                    id_ware: data_po[index].id_ware,
                    qty: data_po[index].qty,
                    m_price: data_po[index].m_price,
                    total_amount: data_po[index].total_amount,
                    tipe_order: data_po[index].tipe_order,
                    id_act: data_po[index].id_act,
                    users: data_po[index].users,
                    supplier: get_ware,
                    variation: data_variationorder,
                });
            } else {
                datas.push({
                    id: data_po[index].id,
                    idpo: data_po[index].idpo,
                    tanggal_receive: data_po[index].tanggal_receive,
                    id_sup: data_po[index].id_sup,
                    id_produk: data_po[index].id_produk,
                    id_ware: data_po[index].id_ware,
                    qty: data_po[index].qty,
                    m_price: data_po[index].m_price,
                    total_amount: data_po[index].total_amount,
                    tipe_order: data_po[index].tipe_order,
                    id_act: data_po[index].id_act,
                    users: data_po[index].users,
                    supplier: data_po[index].supplier,
                    variation: data_variationorder,
                });
            }

        }

        await connection.commit();
        await connection.release();
        return datas;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const stockOpname = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();
        console.log("body.data", body.data);

        const data = body.data;

        var total_qty = 0;
        var qty_all = 0;
        for (let index = 0; index < data.variasirestock.length; index++) {
            qty_all = qty_all + parseInt(data.variasirestock[index].stok_baru);
        }

        const [id_ware] = await connection.query(
            `SELECT * FROM tb_warehouse WHERE id_ware='${data.id_gudang_pengirim}'`
        );

        const [cek_po] = await connection.query(
            `SELECT MAX(idpo) as idpo FROM tb_purchaseorder`
        );
        if (!cek_po[0].idpo) {
            var idpo = "10001"; // Jika belum ada data, mulai dari 0001
        } else {
            let lastNumber = parseInt(cek_po[0].idpo); // Ambil nomor terakhir sebagai angka
            lastNumber += 1; // Tambah 1

            const numLength = cek_po[0].idpo.length; // Panjang nomor sebelumnya
            var idpo = String(lastNumber).padStart(numLength, "0"); // Jaga format panjang angka
        }

        const [rows] = await connection.query(
            `SELECT id_act 
                FROM tb_purchaseorder 
                ORDER BY id_act DESC 
                LIMIT 1
                FOR UPDATE`
        );
        console.log("cek rows dlu", rows);

        let id_act;
        if (rows.length === 0 || rows[0].id_act == null) {
            id_act = 1;              // mulai dari 1 kalau tabel kosong = 1
        } else {
            id_act = rows[0].id_act + 1; // contoh: 1101 -> 1102 = 1
        }
        console.log("id_act hasil", id_act);


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

        const [get_product] = await connection.query(
            `SELECT produk FROM tb_produk WHERE id_produk='${data.id_produk}'`
        );

        const [get_sup] = await connection.query(
            `SELECT * FROM tb_supplier WHERE id_sup='${data.supplier_pobaru}'`
        );

        const [getwarehouse] = await connection.query(
            `SELECT warehouse FROM tb_warehouse WHERE id_ware='${data.id_gudang_pengirim}'`
        );

        const id_area = id_ware[0].id_area
        const variasi = data.variasirestock
        for (let index = 0; index < variasi.length; index++) {
            if (variasi[index].stok_baru != 0) {
                var [getdatavariation_total] = await connection.query(
                    `SELECT SUM(qty) AS totalqty FROM tb_variation WHERE id_produk='${data.id_produk}' AND id_ware='${data.id_gudang_pengirim}' AND size='${variasi[index].size}' ORDER BY id ASC`
                );

                var [get_modal_last] = await connection.query(
                    `SELECT m_price FROM tb_purchaseorder WHERE id_produk='${data.id_produk}' AND id_ware="${data.id_gudang_pengirim}" ORDER BY id DESC LIMIT 1`
                );

                var [getdatavariation] = await connection.query(
                    `SELECT id_produk,id_ware,idpo,size,qty,id_area FROM tb_variation WHERE id_produk='${data.id_produk}' AND id_ware='${data.id_gudang_pengirim}' AND size='${variasi[index].size}' ORDER BY id ASC`
                );

                for (let x = 0; x < getdatavariation.length; x++) {

                    if (x === (getdatavariation.length - 1)) {
                        await connection.query(
                            `UPDATE tb_variation SET qty='${parseInt(getdatavariation_total[0].totalqty) + parseInt(variasi[index].stok_baru)}',idpo='${idpo}',id_act='${id_act}',updated_at='${tanggal}' WHERE id_produk='${getdatavariation[x].id_produk}' AND id_ware='${getdatavariation[x].id_ware}' AND size='${getdatavariation[x].size}' AND idpo='${getdatavariation[x].idpo}'`
                        );
                    } else {
                        await connection.query(
                            `UPDATE tb_variation SET qty='0',updated_at='${tanggal}' WHERE id_produk='${getdatavariation[x].id_produk}' AND id_ware='${getdatavariation[x].id_ware}' AND size='${getdatavariation[x].size}' AND idpo='${getdatavariation[x].idpo}'`
                        );
                    }

                    if (x === 0) {
                        // Add Variasi Order
                        await connection.query(
                            `INSERT INTO tb_variationorder (tanggal, id_produk, idpo, id_sup, id_area, id_ware, size, qty, id_act, tipe_order, users, created_at, updated_at)
                            VALUES ('${tanggal_skrg}','${getdatavariation[x].id_produk}','${idpo}','${getdatavariation[x].id_ware}','${getdatavariation[x].id_area}','${getdatavariation[x].id_ware}','${variasi[index].size}','${variasi[index].stok_baru}','${id_act}','SO_GUDANG','${body.users}','${tanggal}','${tanggal}')`
                        );

                        // Update Variation Old QTY
                        await connection.query(
                            `INSERT INTO tb_mutasistock
                            (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                            VALUES ('${id_mutasi}','${tanggal_skrg}','STOCK OPNAME','${getdatavariation[x].id_ware}','-','${getdatavariation[x].id_produk}','${get_product[0].produk}','${idpo}','${variasi[index].size}','${variasi[index].stok_baru}','Barang Gudang','${getwarehouse[0].warehouse}','STOCK OPNAME','${body.users}','${tanggal}','${tanggal}')`
                        );
                        total_qty = total_qty + parseInt(variasi[index].stok_baru);
                    }
                }
            }
        }
        var total_amount = total_qty * parseInt(get_modal_last[0].m_price);

        await connection.query(
            `INSERT INTO tb_purchaseorder
            (idpo, tanggal_receive, id_sup, id_produk, id_ware, qty, m_price, total_amount, tipe_order, id_act, users, created_at, updated_at)
            VALUES ('${idpo}','${tanggal_skrg}','SO_GUDANG','${data.id_produk}','${data.id_gudang_pengirim}','${total_qty}','${get_modal_last[0].m_price}','${total_amount}','SO_GUDANG','${id_act}','${body.users}','${tanggal}','${tanggal}')`
        );

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const transferStok = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();
        const data = body;
        // console.log(body.user)
        var qty_all = 0;
        for (let index = 0; index < data.variasitransfer.length; index++) {
            qty_all = qty_all + parseInt(data.variasitransfer[index].stok_baru);
        }
        // console.log(data.variasitransfer);

        const [produk_cek] = await connection.query(
            `SELECT * FROM tb_produk WHERE id_produk='${data.idproduk}' AND id_ware='${data.gudang_pengirim}'`
        );

        // if (produk_cek > 0) {
        // } else {
        //     var [get_produk] = await connection.query(
        //         `SELECT * FROM tb_produk WHERE id_produk='${data.idproduk}' AND id_ware='${data.gudang_pengirim}'`
        //     );

        //     await connection.query(
        //         `INSERT INTO tb_produk
        //         (id_produk, id_ware, id_brand, id_category, tanggal_upload, produk, deskripsi, quality, n_price, r_price, g_price, img, users, created_at, updated_at)
        //         VALUES ('${data.idproduk}','${data.gudang_tujuan}','${get_produk[0].id_brand}','${get_produk[0].id_category}','${tanggal_skrg}','${get_produk[0].produk}','-','${get_produk[0].quality}','${get_produk[0].n_price}','${get_produk[0].r_price}','${get_produk[0].g_price}','${get_produk[0].img}','ADMIN','${tanggal}','${tanggal}')`
        //     );
        // }
        var total_qty = 0;
        var total_modal = 0;

        const [id_ware] = await connection.query(
            `SELECT * FROM tb_warehouse WHERE id_ware='${data.gudang_tujuan}'`
        );

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

        const [cek_po] = await connection.query(
            `SELECT MAX(idpo) as idpo FROM tb_purchaseorder`
        );
        if (!cek_po[0].idpo) {
            var idpo = "10001"; // Jika belum ada data, mulai dari 0001
        } else {
            let lastNumber = parseInt(cek_po[0].idpo); // Ambil nomor terakhir sebagai angka
            lastNumber += 1; // Tambah 1

            const numLength = cek_po[0].idpo.length; // Panjang nomor sebelumnya
            var idpo = String(lastNumber).padStart(numLength, "0"); // Jaga format panjang angka
        }

        const [rows] = await connection.query(
            `SELECT id_act 
                FROM tb_purchaseorder 
                ORDER BY id_act DESC 
                LIMIT 1 
                FOR UPDATE`
        );
        console.log("cek rows dlu", rows);

        let id_act;
        if (rows.length === 0 || rows[0].id_act == null) {
            id_act = 1;              // mulai dari 1 kalau tabel kosong = 1
        } else {
            id_act = rows[0].id_act + 1; // contoh: 1101 -> 1102 = 1
        }
        console.log("id_act hasil", id_act);

        const id_area = id_ware[0].id_area
        const variasi = data.variasitransfer
        var idponext = parseInt(idpo) + parseInt(1);
        console.log(data);

        const [get_products] = await connection.query(
            `SELECT produk FROM tb_produk WHERE id_produk='${data.idproduk}'`
        );

        for (let index = 0; index < variasi.length; index++) {

            if (variasi[index].stok_baru != 0) {
                var qty_transfer = variasi[index].stok_baru;

                // cek stock Variasi
                var [get_var] = await connection.query(
                    `SELECT id_produk,idpo,id_ware,size,qty,id_act,users FROM tb_variation WHERE id_produk='${data.idproduk}' AND id_ware='${data.gudang_pengirim}' AND size='${variasi[index].size}' AND qty > '0' ORDER BY idpo ASC`
                );
                var [get_var_sum] = await connection.query(
                    `SELECT SUM(qty) as totalqty FROM tb_variation WHERE id_produk='${data.idproduk}' AND id_ware='${data.gudang_pengirim}' AND size='${variasi[index].size}' AND qty > '0' ORDER BY idpo ASC`
                );

                var totalqty = get_var_sum[0].totalqty;
                var qty_baru = parseInt(totalqty) - parseInt(qty_transfer);

                var [get_warehouse] = await connection.query(
                    `SELECT warehouse FROM tb_warehouse WHERE id_ware='${data.gudang_pengirim}'`
                );

                for (let i = 0; i < get_var.length; i++) {
                    var get_qty = get_var[i].qty;
                    var qty_baru_single = parseInt(get_qty) - parseInt(qty_transfer);


                    var [get_modal] = await connection.query(
                        `SELECT m_price FROM tb_purchaseorder WHERE id_produk='${data.idproduk}' AND id_ware="${data.gudang_pengirim}" ORDER BY id DESC LIMIT 1`
                    );

                    var [cek_size] = await connection.query(
                        `SELECT * FROM tb_variation WHERE idpo='${idpo}' AND id_ware='${data.gudang_tujuan}' AND id_produk='${data.idproduk}' AND size='${variasi[index].size}' `
                    );

                    if (i === (get_var.length - 1)) {
                        await connection.query(
                            `UPDATE tb_variation SET qty='${qty_baru}',updated_at='${tanggal}' WHERE id_produk='${data.idproduk}' AND id_ware='${data.gudang_pengirim}' AND size='${variasi[index].size}' AND idpo='${get_var[i].idpo}'`
                        );
                    } else {
                        await connection.query(
                            `UPDATE tb_variation SET qty='0',updated_at='${tanggal}' WHERE id_produk='${data.idproduk}' AND id_ware='${data.gudang_pengirim}' AND size='${variasi[index].size}' AND idpo='${get_var[i].idpo}'`
                        );
                    }

                    if (i === 0) {
                        if (cek_size.length > 0) {
                            // Update Variation QTY
                            var cekqty = parseInt(cek_size[0].qty) + parseInt(qty_transfer);
                            await connection.query(
                                `UPDATE tb_variation SET qty='${cekqty}',updated_at='${tanggal}' WHERE idpo='${idpo}' AND id_ware='${data.gudang_tujuan}' AND size='${variasi[index].size}' AND id_produk='${data.idproduk}'`
                            );

                            // Add Variasi Order
                            await connection.query(
                                `INSERT INTO tb_variationorder (tanggal, id_produk, idpo, id_sup, id_area, id_ware, size, qty, id_act, tipe_order, users, created_at, updated_at)
                            VALUES ('${tanggal_skrg}','${data.idproduk}','${idpo}','${data.gudang_pengirim}','${id_area}','${data.gudang_tujuan}','${variasi[index].size}','${qty_transfer}','${id_act}','TRANSFER IN','${data.user}','${tanggal}','${tanggal}')`
                            );

                            // Update Variation Old QTY
                            await connection.query(
                                `INSERT INTO tb_mutasistock
                            (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                            VALUES ('${id_mutasi}','${tanggal_skrg}','TRANSFER PRODUCT','${data.gudang_tujuan}','-','${data.idproduk}','${get_products[0].produk}','${idpo}','${variasi[index].size}','${qty_transfer}','Barang Gudang','${get_warehouse[0].warehouse}','TRANSFER IN','${data.user}','${tanggal}','${tanggal}')`
                            );
                        } else {
                            // Add Variasi
                            await connection.query(
                                `INSERT INTO tb_variation (tanggal, id_produk, idpo, id_area, id_ware, size, qty, id_act, users, created_at, updated_at)
                            VALUES ('${tanggal_skrg}','${data.idproduk}','${idpo}','${id_area}','${data.gudang_tujuan}','${variasi[index].size}','${qty_transfer}','${id_act}','${data.user}','${tanggal}','${tanggal}')`
                            );

                            // Add Variasi Order
                            await connection.query(
                                `INSERT INTO tb_variationorder (tanggal, id_produk, idpo, id_sup, id_area, id_ware, size, qty, id_act, tipe_order, users, created_at, updated_at)
                            VALUES ('${tanggal_skrg}','${data.idproduk}','${idpo}','${data.gudang_pengirim}','${id_area}','${data.gudang_tujuan}','${variasi[index].size}','${qty_transfer}','${id_act}','TRANSFER IN','${data.user}','${tanggal}','${tanggal}')`
                            );

                            // Update Variation Old QTY
                            await connection.query(
                                `INSERT INTO tb_mutasistock
                            (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                            VALUES ('${id_mutasi}','${tanggal_skrg}','TRANSFER PRODUCT','${data.gudang_tujuan}','-','${data.idproduk}','${get_products[0].produk}','${idpo}','${variasi[index].size}','${qty_transfer}','Barang Gudang','${get_warehouse[0].warehouse}','TRANSFER IN','${data.user}','${tanggal}','${tanggal}')`
                            );
                        }
                        total_qty = parseInt(total_qty) + parseInt(qty_transfer);
                    }
                    total_modal = parseInt(total_modal) + (parseInt(get_modal[0].m_price) * parseInt(qty_transfer));
                }
            }
        }

        var hasil_total_amount = parseInt(total_qty) * (parseInt(get_modal[0].m_price));
        // Add PO Transfer Gudang Pengiriim
        var hasil_qty = 0 - parseInt(total_qty);
        await connection.query(
            `INSERT INTO tb_purchaseorder
            (idpo, tanggal_receive, id_sup, id_produk, id_ware, qty, m_price, total_amount, tipe_order, id_act, users, created_at, updated_at)
            VALUES ('${idpo}','${tanggal_skrg}','${data.gudang_pengirim}','${data.idproduk}','${data.gudang_tujuan}','${total_qty}','${get_modal[0].m_price}','${hasil_total_amount}','TRANSFER IN','${id_act}','${data.user}','${tanggal}','${tanggal}')`
        );
        // 

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const print_Stockopname = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();
        const datas = [];

        const [data_produk] = await connection.query(
            `SELECT 
                tb_produk.id,
                tb_produk.id_produk,
                tb_produk.id_ware,
                tb_produk.produk,
                tb_brand.brand,
                tb_warehouse.warehouse,
                SUM(sub_variation.total_qty) AS total_qty,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'size', sub_variation.size,
                        'qty', sub_variation.total_qty
                    )
                ) AS variation
            FROM tb_produk
            LEFT JOIN (
                SELECT 
                    id_produk, 
                    id_ware, 
                    size, 
                    SUM(qty) AS total_qty
                FROM tb_variation
                GROUP BY id_produk, id_ware, size
            ) AS sub_variation
            ON tb_produk.id_produk = sub_variation.id_produk 
            AND tb_produk.id_ware = sub_variation.id_ware
            LEFT JOIN tb_brand ON tb_brand.id_brand = tb_produk.id_brand
            LEFT JOIN tb_warehouse ON tb_warehouse.id_ware = tb_produk.id_ware
            WHERE tb_produk.id_ware = '${body.id_ware}'
            GROUP BY 
                tb_produk.id_produk, 
                tb_produk.produk, 
                tb_produk.id_ware, 
                tb_brand.brand, 
                tb_warehouse.warehouse
                HAVING total_qty != 0
            ORDER BY tb_produk.id_brand ASC`
        );
        for (let index = 0; index < data_produk.length; index++) {
            datas.push({
                id: data_produk[index].id,
                id_produk: data_produk[index].id_produk,
                id_ware: data_produk[index].id_ware,
                warehouse: data_produk[index].warehouse,
                produk: data_produk[index].produk,
                variation: JSON.parse(data_produk[index].variation),
                brand: data_produk[index].brand,
                total_qty: data_produk[index].total_qty,
                total: data_produk.length,
            });
        }
        console.log(datas);

        await connection.commit();
        await connection.release();

        return datas;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getPo = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

    const tanggal = body.date;
    const myArray = tanggal.split(" to ");
    const tipepo = body.Filter_Tipe_po;
    const supplier = body.Filter_Supplier;
    const users = body.Filter_Tipe_user;
    console.log("body ini get po:", body);


    if (tanggal.length > 10) {
        var tanggal_start = myArray[0];
        var tanggal_end = myArray[1];
    } else {
        var tanggal_start = tanggal;
        var tanggal_end = tanggal;
    }

    var [get_wares] = await connection.query(
        `SELECT * FROM tb_warehouse GROUP BY id_ware`
    );

    if (body.query === "all") {
        if (supplier === "all") {
            if (users === "all") {
                if (tipepo === "all") {
                    var [get_po] = await connection.query(
                        `SELECT DISTINCT *,users,tanggal_receive FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND qty > 0 AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
                    );
                    var [total_qty] = await connection.query(
                        `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
                    );

                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_qty.length; po++) {
                        if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_qty[po].totalqtys);
                        }
                    }

                    var hasil_amount = 0;
                    var [capital_amount] = await connection.query(
                        `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
                    );
                    for (let x = 0; x < capital_amount.length; x++) {
                        if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                            var hasil_amount = "0";
                        } else {
                            var hasil_amount = parseInt(capital_amount[x].amount);
                        }
                    }
                } else {
                    var [get_po] = await connection.query(
                        `SELECT DISTINCT *,users,tanggal_receive FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND qty > 0 AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tipe_order='${tipepo}' GROUP BY tanggal_receive,users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tipe_order='${tipepo}' GROUP BY tanggal_receive,users`
                    );
                    var [total_qty] = await connection.query(
                        `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tipe_order='${tipepo}' GROUP BY tanggal_receive,users`
                    );

                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_qty.length; po++) {
                        if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_qty[po].totalqtys);
                        }
                    }

                    var hasil_amount = 0;
                    var [capital_amount] = await connection.query(
                        `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tipe_order='${tipepo}'`
                    );
                    for (let x = 0; x < capital_amount.length; x++) {
                        if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                            var hasil_amount = "0";
                        } else {
                            var hasil_amount = parseInt(capital_amount[x].amount);
                        }
                    }
                }
            } else {
                if (tipepo === "all") {
                    var [get_po] = await connection.query(
                        `SELECT DISTINCT *,users,tanggal_receive FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND qty > 0 AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.users='${users}' GROUP BY tanggal_receive,users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.users='${users}' GROUP BY tanggal_receive,users`
                    );
                    var [total_qty] = await connection.query(
                        `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.users='${users}' GROUP BY tanggal_receive,users`
                    );

                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_qty.length; po++) {
                        if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_qty[po].totalqtys);
                        }
                    }

                    var hasil_amount = 0;
                    var [capital_amount] = await connection.query(
                        `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.users='${users}'`
                    );
                    for (let x = 0; x < capital_amount.length; x++) {
                        if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                            var hasil_amount = "0";
                        } else {
                            var hasil_amount = parseInt(capital_amount[x].amount);
                        }
                    }
                } else {
                    var [get_po] = await connection.query(
                        `SELECT DISTINCT *,users,tanggal_receive FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND qty > 0 AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tanggal_receive,users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tanggal_receive,users`
                    );
                    var [total_qty] = await connection.query(
                        `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tanggal_receive,users`
                    );

                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_qty.length; po++) {
                        if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_qty[po].totalqtys);
                        }
                    }

                    var hasil_amount = 0;
                    var [capital_amount] = await connection.query(
                        `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}'`
                    );
                    for (let x = 0; x < capital_amount.length; x++) {
                        if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                            var hasil_amount = "0";
                        } else {
                            var hasil_amount = parseInt(capital_amount[x].amount);
                        }
                    }
                }
            }
        } else {
            if (users === "all") {
                if (tipepo === "all") {
                    var [get_po] = await connection.query(
                        `SELECT DISTINCT *,users,tanggal_receive FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND qty > 0 AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' GROUP BY tanggal_receive,users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' GROUP BY tanggal_receive,users`
                    );
                    var [total_qty] = await connection.query(
                        `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' GROUP BY tanggal_receive,users`
                    );

                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_qty.length; po++) {
                        if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_qty[po].totalqtys);
                        }
                    }

                    var hasil_amount = 0;
                    var [capital_amount] = await connection.query(
                        `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}'`
                    );
                    for (let x = 0; x < capital_amount.length; x++) {
                        if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                            var hasil_amount = "0";
                        } else {
                            var hasil_amount = parseInt(capital_amount[x].amount);
                        }
                    }
                } else {
                    var [get_po] = await connection.query(
                        `SELECT DISTINCT *,users,tanggal_receive FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND qty > 0 AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tanggal_receive,users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tanggal_receive,users`
                    );
                    var [total_qty] = await connection.query(
                        `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tanggal_receive,users`
                    );

                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_qty.length; po++) {
                        if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_qty[po].totalqtys);
                        }
                    }

                    var hasil_amount = 0;
                    var [capital_amount] = await connection.query(
                        `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.tipe_order='${tipepo}'`
                    );
                    for (let x = 0; x < capital_amount.length; x++) {
                        if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                            var hasil_amount = "0";
                        } else {
                            var hasil_amount = parseInt(capital_amount[x].amount);
                        }
                    }
                }
            } else {
                if (tipepo === "all") {
                    var [get_po] = await connection.query(
                        `SELECT DISTINCT *,users,tanggal_receive FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND qty > 0 AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' GROUP BY tanggal_receive,users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' GROUP BY tanggal_receive,users`
                    );
                    var [total_qty] = await connection.query(
                        `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' GROUP BY tanggal_receive,users`
                    );

                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_qty.length; po++) {
                        if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_qty[po].totalqtys);
                        }
                    }

                    var hasil_amount = 0;
                    var [capital_amount] = await connection.query(
                        `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}'`
                    );
                    for (let x = 0; x < capital_amount.length; x++) {
                        if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                            var hasil_amount = "0";
                        } else {
                            var hasil_amount = parseInt(capital_amount[x].amount);
                        }
                    }
                } else {
                    var [get_po] = await connection.query(
                        `SELECT DISTINCT *,users,tanggal_receive FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND qty > 0 AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tanggal_receive,users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tanggal_receive,users`
                    );
                    var [total_qty] = await connection.query(
                        `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tanggal_receive,users`
                    );

                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_qty.length; po++) {
                        if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_qty[po].totalqtys);
                        }
                    }

                    var hasil_amount = 0;
                    var [capital_amount] = await connection.query(
                        `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE (tipe_order='RELEASE' OR tipe_order='RESTOCK') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}'`
                    );
                    for (let x = 0; x < capital_amount.length; x++) {
                        if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                            var hasil_amount = "0";
                        } else {
                            var hasil_amount = parseInt(capital_amount[x].amount);
                        }
                    }
                }
            }
        }
    } else {
        if (supplier === "all") {
            if (users === "all") {
                if (tipepo === "all") {
                    var [get_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(tb_purchaseorder.idpo) as totalpo,SUM(tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.qty > 0 AND (tb_produk.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') GROUP BY tb_purchaseorder.tanggal_receive,tb_produk.users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );

                    var [total_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(DISTINCT tb_purchaseorder.idpo) as totalpo,SUM(DISTINCT tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND (tb_produk.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                    );
                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_po.length; po++) {
                        if (total_po[po].totalqtys === null || total_po[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_po[po].totalqtys);
                        }
                    }
                    var hasil_amount = 0;
                    for (let zxc = 0; zxc < total_po.length; zxc++) {
                        var [capital_amount] = await connection.query(
                            `SELECT tb_purchaseorder.*,IFNULL(SUM(DISTINCT tb_purchaseorder.total_amount), 0) AS amount,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive='${get_po[zxc].tanggal_receive}' AND (tb_produk.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                        );
                        for (let x = 0; x < capital_amount.length; x++) {
                            if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                                var hasil_amount = "0";
                            } else {
                                var hasil_amount = parseInt(hasil_amount) + parseInt(capital_amount[0].amount);
                            }
                        }
                    }
                } else {
                    var [get_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(tb_purchaseorder.idpo) as totalpo,SUM(tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.qty > 0 AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_produk.users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(DISTINCT tb_purchaseorder.idpo) as totalpo,SUM(DISTINCT tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                    );
                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_po.length; po++) {
                        if (total_po[po].totalqtys === null || total_po[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_po[po].totalqtys);
                        }
                    }
                    var hasil_amount = 0;
                    for (let zxc = 0; zxc < total_po.length; zxc++) {
                        var [capital_amount] = await connection.query(
                            `SELECT tb_purchaseorder.*,IFNULL(SUM(DISTINCT tb_purchaseorder.total_amount), 0) AS amount,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.tanggal_receive='${get_po[zxc].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                        );
                        for (let x = 0; x < capital_amount.length; x++) {
                            if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                                var hasil_amount = "0";
                            } else {
                                var hasil_amount = parseInt(hasil_amount) + parseInt(capital_amount[0].amount);
                            }
                        }
                    }
                }
            } else {
                if (tipepo === "all") {
                    var [get_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(tb_purchaseorder.idpo) as totalpo,SUM(tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.qty > 0 AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${users}' GROUP BY tb_purchaseorder.tanggal_receive,tb_produk.users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(DISTINCT tb_purchaseorder.idpo) as totalpo,SUM(DISTINCT tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${users}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                    );
                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_po.length; po++) {
                        if (total_po[po].totalqtys === null || total_po[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_po[po].totalqtys);
                        }
                    }
                    var hasil_amount = 0;
                    for (let zxc = 0; zxc < total_po.length; zxc++) {
                        var [capital_amount] = await connection.query(
                            `SELECT tb_purchaseorder.*,IFNULL(SUM(DISTINCT tb_purchaseorder.total_amount), 0) AS amount,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.tanggal_receive='${get_po[zxc].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${users}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                        );
                        for (let x = 0; x < capital_amount.length; x++) {
                            if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                                var hasil_amount = "0";
                            } else {
                                var hasil_amount = parseInt(hasil_amount) + parseInt(capital_amount[0].amount);
                            }
                        }
                    }
                } else {
                    var [get_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(tb_purchaseorder.idpo) as totalpo,SUM(tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.qty > 0 AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_produk.users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(DISTINCT tb_purchaseorder.idpo) as totalpo,SUM(DISTINCT tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                    );
                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_po.length; po++) {
                        if (total_po[po].totalqtys === null || total_po[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_po[po].totalqtys);
                        }
                    }
                    var hasil_amount = 0;
                    for (let zxc = 0; zxc < total_po.length; zxc++) {
                        var [capital_amount] = await connection.query(
                            `SELECT tb_purchaseorder.*,IFNULL(SUM(DISTINCT tb_purchaseorder.total_amount), 0) AS amount,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.tanggal_receive='${get_po[zxc].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                        );
                        for (let x = 0; x < capital_amount.length; x++) {
                            if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                                var hasil_amount = "0";
                            } else {
                                var hasil_amount = parseInt(hasil_amount) + parseInt(capital_amount[0].amount);
                            }
                        }
                    }
                }
            }
        } else {
            if (users === "all") {
                if (tipepo === "all") {
                    var [get_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(tb_purchaseorder.idpo) as totalpo,SUM(tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.qty > 0 AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' GROUP BY tb_purchaseorder.tanggal_receive,tb_produk.users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(DISTINCT tb_purchaseorder.idpo) as totalpo,SUM(DISTINCT tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                    );
                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_po.length; po++) {
                        if (total_po[po].totalqtys === null || total_po[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_po[po].totalqtys);
                        }
                    }
                    var hasil_amount = 0;
                    for (let zxc = 0; zxc < total_po.length; zxc++) {
                        var [capital_amount] = await connection.query(
                            `SELECT tb_purchaseorder.*,IFNULL(SUM(DISTINCT tb_purchaseorder.total_amount), 0) AS amount,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.tanggal_receive='${get_po[zxc].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                        );
                        for (let x = 0; x < capital_amount.length; x++) {
                            if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                                var hasil_amount = "0";
                            } else {
                                var hasil_amount = parseInt(hasil_amount) + parseInt(capital_amount[0].amount);
                            }
                        }
                    }
                } else {
                    var [get_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(tb_purchaseorder.idpo) as totalpo,SUM(tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.qty > 0 AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_produk.users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(DISTINCT tb_purchaseorder.idpo) as totalpo,SUM(DISTINCT tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                    );
                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_po.length; po++) {
                        if (total_po[po].totalqtys === null || total_po[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_po[po].totalqtys);
                        }
                    }
                    var hasil_amount = 0;
                    for (let zxc = 0; zxc < total_po.length; zxc++) {
                        var [capital_amount] = await connection.query(
                            `SELECT tb_purchaseorder.*,IFNULL(SUM(DISTINCT tb_purchaseorder.total_amount), 0) AS amount,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.tanggal_receive='${get_po[zxc].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                        );
                        for (let x = 0; x < capital_amount.length; x++) {
                            if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                                var hasil_amount = "0";
                            } else {
                                var hasil_amount = parseInt(hasil_amount) + parseInt(capital_amount[0].amount);
                            }
                        }
                    }
                }
            } else {
                if (tipepo === "all") {
                    var [get_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(tb_purchaseorder.idpo) as totalpo,SUM(tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.qty > 0 AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' GROUP BY tb_purchaseorder.tanggal_receive,tb_produk.users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(DISTINCT tb_purchaseorder.idpo) as totalpo,SUM(DISTINCT tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                    );
                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_po.length; po++) {
                        if (total_po[po].totalqtys === null || total_po[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_po[po].totalqtys);
                        }
                    }
                    var hasil_amount = 0;
                    for (let zxc = 0; zxc < total_po.length; zxc++) {
                        var [capital_amount] = await connection.query(
                            `SELECT tb_purchaseorder.*,IFNULL(SUM(DISTINCT tb_purchaseorder.total_amount), 0) AS amount,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.tanggal_receive='${get_po[zxc].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                        );
                        for (let x = 0; x < capital_amount.length; x++) {
                            if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                                var hasil_amount = "0";
                            } else {
                                var hasil_amount = parseInt(hasil_amount) + parseInt(capital_amount[0].amount);
                            }
                        }
                    }
                } else {
                    var [get_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(tb_purchaseorder.idpo) as totalpo,SUM(tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.qty > 0 AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_produk.users ORDER BY tb_purchaseorder.tanggal_receive DESC`
                    );
                    var [total_po] = await connection.query(
                        `SELECT tb_purchaseorder.*,COUNT(DISTINCT tb_purchaseorder.idpo) as totalpo,SUM(DISTINCT tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                    );
                    var hasil_totalqty = 0;
                    for (let po = 0; po < total_po.length; po++) {
                        if (total_po[po].totalqtys === null || total_po[po].totalqtys === "") {
                            var hasil_totalqty = "0";
                        } else {
                            var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_po[po].totalqtys);
                        }
                    }
                    var hasil_amount = 0;
                    for (let zxc = 0; zxc < total_po.length; zxc++) {
                        var [capital_amount] = await connection.query(
                            `SELECT tb_purchaseorder.*,IFNULL(SUM(DISTINCT tb_purchaseorder.total_amount), 0) AS amount,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.tanggal_receive='${get_po[zxc].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${supplier}' AND tb_purchaseorder.users='${users}' AND tb_purchaseorder.tipe_order='${tipepo}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                        );
                        for (let x = 0; x < capital_amount.length; x++) {
                            if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                                var hasil_amount = "0";
                            } else {
                                var hasil_amount = parseInt(hasil_amount) + parseInt(capital_amount[0].amount);
                            }
                        }
                    }
                }
            }
        }
    }

    const datas = [];

    try {
        await connection.beginTransaction();
        var total_qty = 0;
        var total_cost = 0;
        for (let index = 0; index < get_po.length; index++) {

            if (body.query === "all") {
                if (supplier === "all") {
                    if (users === "all") {
                        if (tipepo === "all") {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        } else {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.tipe_order='${get_po[index].tipe_order}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        }
                    } else {
                        if (tipepo === "all") {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        } else {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.tipe_order='${get_po[index].tipe_order}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        }
                    }
                } else {
                    if (users === "all") {
                        if (tipepo === "all") {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.id_sup='${get_po[index].id_sup}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        } else {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.id_sup='${get_po[index].id_sup}' AND tb_purchaseorder.tipe_order='${get_po[index].tipe_order}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        }
                    } else {
                        if (tipepo === "all") {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.id_sup='${get_po[index].id_sup}' AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        } else {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.id_sup='${get_po[index].id_sup}' AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.tipe_order='${get_po[index].tipe_order}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        }
                    }
                }
            } else {
                if (supplier === "all") {
                    if (users === "all") {
                        if (tipepo === "all") {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        } else {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.tipe_order='${get_po[index].tipe_order}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        }
                    } else {
                        if (tipepo === "all") {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        } else {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.tipe_order='${get_po[index].tipe_order}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        }
                    }
                } else {
                    if (users === "all") {
                        if (tipepo === "all") {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${get_po[index].id_sup}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        } else {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${get_po[index].id_sup}' AND tb_purchaseorder.tipe_order='${get_po[index].tipe_order}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        }
                    } else {
                        if (tipepo === "all") {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${get_po[index].id_sup}' AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        } else {
                            var [get_detail] = await connection.query(
                                `SELECT tb_purchaseorder.*,tb_produk.produk,tb_supplier.supplier,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.id_sup='${get_po[index].id_sup}' AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.tipe_order='${get_po[index].tipe_order}' AND tb_purchaseorder.qty > '0' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                            );
                        }
                    }
                }
            }

            const datas2 = [];

            for (let i = 0; i < get_detail.length; i++) {

                if (body.query === "all") {
                    if (supplier === "all") {
                        if (tipepo === "all") {
                            var [get_total] = await connection.query(
                                `SELECT SUM(tb_purchaseorder.total_amount) as hasil_amount,SUM(tb_purchaseorder.qty) as hasil_qty FROM tb_purchaseorder WHERE tb_purchaseorder.tanggal_receive='${get_detail[i].tanggal_receive}' AND tb_purchaseorder.users='${get_detail[i].users}' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.qty > '0' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                            );
                        } else {
                            var [get_total] = await connection.query(
                                `SELECT SUM(tb_purchaseorder.total_amount) as hasil_amount,SUM(tb_purchaseorder.qty) as hasil_qty FROM tb_purchaseorder WHERE tb_purchaseorder.tanggal_receive='${get_detail[i].tanggal_receive}' AND tb_purchaseorder.users='${get_detail[i].users}' AND tb_purchaseorder.tipe_order='${get_detail[i].tipe_order}' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.qty > '0' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                            );
                        }
                    } else {
                        if (tipepo === "all") {
                            var [get_total] = await connection.query(
                                `SELECT SUM(tb_purchaseorder.total_amount) as hasil_amount,SUM(tb_purchaseorder.qty) as hasil_qty FROM tb_purchaseorder WHERE tb_purchaseorder.tanggal_receive='${get_detail[i].tanggal_receive}' AND tb_purchaseorder.users='${get_detail[i].users}' AND tb_purchaseorder.id_sup='${get_detail[i].id_sup}' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.qty > '0' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                            );
                        } else {
                            var [get_total] = await connection.query(
                                `SELECT SUM(tb_purchaseorder.total_amount) as hasil_amount,SUM(tb_purchaseorder.qty) as hasil_qty FROM tb_purchaseorder WHERE tb_purchaseorder.tanggal_receive='${get_detail[i].tanggal_receive}' AND tb_purchaseorder.users='${get_detail[i].users}' AND tb_purchaseorder.id_sup='${get_detail[i].id_sup}' AND tb_purchaseorder.tipe_order='${get_detail[i].tipe_order}' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.qty > '0' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                            );
                        }
                    }
                } else {
                    if (supplier === "all") {
                        if (tipepo === "all") {
                            var [get_total] = await connection.query(
                                `SELECT SUM(tb_purchaseorder.total_amount) as hasil_amount,SUM(tb_purchaseorder.qty) as hasil_qty FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE tb_purchaseorder.tanggal_receive='${get_detail[i].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${get_detail[i].users}' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.qty > '0' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                            );
                        } else {
                            var [get_total] = await connection.query(
                                `SELECT SUM(tb_purchaseorder.total_amount) as hasil_amount,SUM(tb_purchaseorder.qty) as hasil_qty FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE tb_purchaseorder.tanggal_receive='${get_detail[i].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${get_detail[i].users}' AND tb_purchaseorder.tipe_order='${get_detail[i].tipe_order}' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.qty > '0' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                            );
                        }
                    } else {
                        if (tipepo === "all") {
                            var [get_total] = await connection.query(
                                `SELECT SUM(tb_purchaseorder.total_amount) as hasil_amount,SUM(tb_purchaseorder.qty) as hasil_qty FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE tb_purchaseorder.tanggal_receive='${get_detail[i].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${get_detail[i].users}' AND tb_purchaseorder.id_sup='${get_detail[i].id_sup}' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.qty > '0' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                            );
                        } else {
                            var [get_total] = await connection.query(
                                `SELECT SUM(tb_purchaseorder.total_amount) as hasil_amount,SUM(tb_purchaseorder.qty) as hasil_qty FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE tb_purchaseorder.tanggal_receive='${get_detail[i].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tb_purchaseorder.users='${get_detail[i].users}' AND tb_purchaseorder.id_sup='${get_detail[i].id_sup}' AND tb_purchaseorder.tipe_order='${get_detail[i].tipe_order}' AND (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK') AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.qty > '0' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
                            );
                        }
                    }
                }

                datas2.push({
                    id: get_po[index].id,
                    idpo: get_detail[i].idpo,
                    tanggal_receive: get_detail[i].tanggal_receive,
                    id_sup: get_detail[i].id_sup,
                    id_produk: get_detail[i].id_produk,
                    id_ware: get_detail[i].id_ware,
                    qty: get_detail[i].qty,
                    m_price: get_detail[i].m_price,
                    total_amount: get_detail[i].total_amount,
                    tipe_order: get_detail[i].tipe_order,
                    id_act: get_detail[i].id_act,
                    produk: get_detail[i].produk,
                    gudang: get_detail[i].warehouse,
                    supplier: get_detail[i].supplier,
                });

                total_qty = (0 + parseInt(get_total[0].hasil_qty));
                total_cost = (0 + parseInt(get_total[0].hasil_amount));
            }

            datas.push({
                tanggal: get_po[index].tanggal_receive,
                id_so: get_po[index].idpo,
                users: get_po[index].users,
                total_qty: total_qty,
                total_cost: total_cost,
                detail: datas2,
            });

            var created_at = get_po[index].tanggal_receive;
        }

        await connection.commit();
        await connection.release();
        return {
            datas,
            total_po: get_po.length ? get_po.length : 0,
            total_qty: hasil_totalqty,
            capital_amount: hasil_amount ? hasil_amount : 0,
            created_at: created_at,
        };

    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getHistoripo = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [data_historypo] = await connection.query(
            `SELECT * FROM tb_purchaseorder WHERE tipe_order != "TRANSFER" AND tipe_order != "SO_GUDANG" GROUP BY idpo ORDER BY id DESC LIMIT 1`
        );

        await connection.commit();
        await connection.release();

        return data_historypo;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const get_Sizepo = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [data_getsize] = await connection.query(
            `SELECT *,SUM(qty)as qty FROM tb_variationorder WHERE id_act='${body.id_act}' GROUP BY size`
        );

        await connection.commit();
        await connection.release();
        return data_getsize;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const editPo = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

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
        var variasi = body.data.variasirestock;
        var total_qty = 0;

        const [produk_baru] = await connection.query(
            `SELECT produk FROM tb_produk WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}'`
        );

        const [getpo] = await connection.query(
            `SELECT m_price,id_sup,idpo FROM tb_purchaseorder WHERE id_act='${body.id_act}'`
        );

        const [getsupplier] = await connection.query(
            `SELECT supplier FROM tb_supplier WHERE id_sup='${getpo[0].id_sup}'`
        );

        for (let index = 0; index < variasi.length; index++) {
            var [getdatavariation_total] = await connection.query(
                `SELECT SUM(qty) AS totalqty FROM tb_variation WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}' AND size='${variasi[index].size}' AND qty != 0 ORDER BY id ASC`
            );

            var [getdatavariation_all] = await connection.query(
                `SELECT id_produk,id_ware,idpo,size,qty,id_area FROM tb_variation WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}' AND size='${variasi[index].size}' AND qty != 0 ORDER BY id ASC`
            );

            var selisih = parseInt(variasi[index].stok_lama) - parseInt(variasi[index].stok_baru);

            if (variasi[index].stok_baru != variasi[index].stok_lama) {

                for (let x = 0; x < getdatavariation_all.length; x++) {
                    if (x === (getdatavariation_all.length - 1)) {
                        if (selisih < 0) {

                            await connection.query(
                                `UPDATE tb_variation SET qty='${parseInt(getdatavariation_total[0].totalqty) - parseInt(selisih)}',updated_at='${tanggal}' WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}' AND size='${variasi[index].size}' AND id_act='${body.id_act}'`
                            );
                        } else {

                            await connection.query(
                                `UPDATE tb_variation SET qty='${parseInt(getdatavariation_total[0].totalqty) - parseInt(selisih)}',updated_at='${tanggal}' WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}' AND size='${variasi[index].size}' AND id_act='${body.id_act}'`
                            );
                        }
                    } else {
                        await connection.query(
                            `UPDATE tb_variation SET qty='0',updated_at='${tanggal}' WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}' AND size='${variasi[index].size}'`
                        );
                    }
                    if (x === 0) {
                        await connection.query(
                            `UPDATE tb_variationorder SET qty='${variasi[index].stok_baru}',updated_at='${tanggal}' WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}' AND size='${variasi[index].size}' AND id_act='${body.id_act}'`
                        );
                        // Update Variation Old QTY
                        await connection.query(
                            `INSERT INTO tb_mutasistock
                                (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                                VALUES ('${id_mutasi}','${tanggal_skrg}','EDIT DATA PO','${body.id_ware}','-','${body.idproduk}','${produk_baru[0].produk}','${getpo[0].idpo}','${variasi[index].size}','${variasi[index].stok_baru}','Barang Gudang','${getsupplier[0].supplier}','EDIT DATA PO','${body.users}','${tanggal}','${tanggal}')`
                        );
                        total_qty = parseInt(total_qty) + parseInt(variasi[index].stok_baru);
                    }
                }
            }
        }
        const [getpovariationorder] = await connection.query(
            `SELECT sum(qty) as totals FROM tb_variationorder WHERE id_act='${body.id_act}'`
        );

        await connection.query(
            `UPDATE tb_purchaseorder SET total_amount='${parseInt(body.m_price) * parseInt(getpovariationorder[0].totals)}',qty='${getpovariationorder[0].totals}',m_price='${body.m_price}',updated_at='${tanggal}' WHERE id_act='${body.id_act}'`
        );

        const [updatehargapo] = await connection.query(
            `SELECT m_price,id_produk,id_ware FROM tb_purchaseorder WHERE id_act='${body.id_act}'`
        );

        for (let xx = 0; xx < updatehargapo.length; xx++) {
            await connection.query(
                `UPDATE tb_order SET m_price='${body.m_price}',updated_at='${tanggal}' WHERE id_produk='${updatehargapo[xx].id_produk}' AND id_ware='${updatehargapo[xx].id_ware}' AND m_price='0'`
            );
        }

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const deleteItem = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");


    const [cek_po] = await connection.query(
        `SELECT MAX(idpo) as idpo FROM tb_purchaseorder`
    );
    if (!cek_po[0].idpo) {
        var idpo = "10001"; // Jika belum ada data, mulai dari 0001
    } else {
        let lastNumber = parseInt(cek_po[0].idpo); // Ambil nomor terakhir sebagai angka
        lastNumber += 1; // Tambah 1

        const numLength = cek_po[0].idpo.length; // Panjang nomor sebelumnya
        var idpo = String(lastNumber).padStart(numLength, "0"); // Jaga format panjang angka
    }

    const [cek_act] = await connection.query(
        `SELECT MAX(CAST(id_act AS UNSIGNED)) as id_act FROM tb_purchaseorder`
    );
    if (cek_act[0].id_act === null) {
        var id_act = "0001";
    } else {
        const get_last2 = cek_act[0].id_act;
        const data_2 = get_last2.toString().slice(-4);
        const hasil = parseInt(data_2) + 1;
        var id_act = String(hasil).padStart(4, "0");
    }

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

        var [getpo] = await connection.query(
            `SELECT tb_variationorder.*,tb_purchaseorder.id_sup,tb_purchaseorder.qty AS totalqty,tb_purchaseorder.m_price FROM tb_variationorder LEFT JOIN tb_purchaseorder ON tb_variationorder.id_act = tb_purchaseorder.id_act WHERE tb_variationorder.id_act='${body.id_act}'  ORDER BY tb_variationorder.id ASC`
        );

        var [getpo_order] = await connection.query(
            `SELECT tb_variationorder.qty,tb_variationorder.id_sup,tb_variationorder.idpo FROM tb_variationorder LEFT JOIN tb_purchaseorder ON tb_variationorder.id_act = tb_purchaseorder.id_act WHERE tb_variationorder.id_act='${body.id_act}' ORDER BY tb_variationorder.id ASC`
        );

        var [get_var_sum] = await connection.query(
            `SELECT SUM(qty) AS totalqty FROM tb_variation WHERE id_produk='${getpo[0].id_produk}' AND id_ware='${getpo[0].id_ware}' AND size='${getpo[0].size}' AND qty > '0' ORDER BY idpo ASC`
        );

        const [getproducts] = await connection.query(
            `SELECT produk FROM tb_produk WHERE id_produk='${getpo[0].id_produk}'`
        );

        const [getwarehouse] = await connection.query(
            `SELECT warehouse FROM tb_warehouse WHERE id_ware='${getpo[0].id_ware}'`
        );

        var totalqty = 0;
        for (let index = 0; index < getpo.length; index++) {
            totalqty = parseInt(totalqty) + parseInt(getpo_order[index].qty);
            if (getpo[index].qty < 0) {

                await connection.query(
                    `UPDATE tb_variation SET qty='${getpo_order[index].qty}',id_ware='${getpo_order[index].id_sup}',idpo='${getpo_order[index].idpo}',updated_at='${tanggal}' WHERE id_act='${body.id_act}' AND size='${getpo[index].size}'`
                );

                await connection.query(
                    `UPDATE tb_variationorder SET qty='0',tipe_order='CANCEL TRANSFER',updated_at='${tanggal}' WHERE id_act='${body.id_act}'`
                );
            } else {

                await connection.query(
                    `UPDATE tb_variation SET qty='${getpo_order[index].qty}',id_ware='${getpo_order[index].id_sup}',idpo='${getpo_order[index].idpo}',updated_at='${tanggal}' WHERE id_act='${body.id_act}' AND size='${getpo[index].size}'`
                );

                await connection.query(
                    `UPDATE tb_variationorder SET qty='0',tipe_order='CANCEL TRANSFER',updated_at='${tanggal}' WHERE id_act='${body.id_act}'`
                );
            }

            // // Update Variation Old QTY
            await connection.query(
                `INSERT INTO tb_mutasistock
            (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
            VALUES ('${id_mutasi}','${tanggal_skrg}','CANCEL TRANSFER','${getpo[index].id_sup}','-','${getpo[index].id_produk}','${getproducts[0].produk}','${getpo[index].idpo}','${getpo[index].size}','${getpo[index].qty}','Barang Gudang','${getwarehouse[0].warehouse}','CANCEL TRANSFER','${body.users}','${tanggal}','${tanggal}')`
            );
        }
        await connection.query(
            `UPDATE tb_purchaseorder SET qty='${totalqty}',m_price='${getpo[0].m_price}',total_amount='0',tipe_order='CANCEL TRANSFER',updated_at='${tanggal}' WHERE id_act='${body.id_act}'`
        );

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const deletePo = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();



        await connection.query(
            `DELETE FROM tb_variation WHERE idpo='${body.id_po}'`
        );

        await connection.query(
            `DELETE FROM tb_variationorder WHERE idpo='${body.id_po}'`
        );

        await connection.query(
            `DELETE FROM tb_purchaseorder WHERE idpo='${body.id_po}'`
        );

        await connection.commit();
        await connection.release();
        // console.log(body);
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getHistoriso = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [data_historyso] = await connection.query(
            `SELECT * FROM tb_purchaseorder WHERE tipe_order = "SO_GUDANG" GROUP BY idpo ORDER BY id DESC LIMIT 5`
        );

        await connection.commit();
        await connection.release();

        return data_historyso;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getSo = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

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

    if (body.query != "all") {
        var [get_po] = await connection.query(
            `SELECT * FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_produk.id_produk = tb_purchaseorder.id_produk WHERE tipe_order='SO_GUDANG' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,tb_purchaseorder.users`
        );

        var [total_po] = await connection.query(
            `SELECT tb_purchaseorder.*,COUNT(DISTINCT tb_purchaseorder.idpo) as totalpo,SUM(DISTINCT tb_purchaseorder.qty) as totalqtys,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE tb_purchaseorder.tipe_order='SO_GUDANG' AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
        );
        var hasil_totalqty = 0;
        for (let po = 0; po < total_po.length; po++) {
            if (total_po[po].totalqtys === null || total_po[po].totalqtys === "") {
                var hasil_totalqty = "0";
            } else {
                var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_po[po].totalqtys);
            }
        }
        var hasil_amount = 0;
        for (let zxc = 0; zxc < total_po.length; zxc++) {
            var [capital_amount] = await connection.query(
                `SELECT tb_purchaseorder.*,IFNULL(SUM(DISTINCT tb_purchaseorder.total_amount), 0) AS amount,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE tb_purchaseorder.tipe_order='SO_GUDANG' AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tb_purchaseorder.tanggal_receive='${get_po[zxc].tanggal_receive}' AND (tb_purchaseorder.id_produk LIKE '%${body.query}%' OR tb_produk.produk LIKE '%${body.query}%') GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = parseInt(hasil_amount) + parseInt(capital_amount[0].amount);
                }
            }
        }
    } else {
        var [get_po] = await connection.query(
            `SELECT * FROM tb_purchaseorder  WHERE tipe_order='SO_GUDANG' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
        );

        var [total_po] = await connection.query(
            `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='SO_GUDANG' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
        );
        var [total_qty] = await connection.query(
            `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='SO_GUDANG' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
        );

        var hasil_totalqty = 0;
        for (let po = 0; po < total_qty.length; po++) {
            if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                var hasil_totalqty = "0";
            } else {
                var hasil_totalqty = parseInt(hasil_totalqty) + parseInt(total_qty[po].totalqtys);
            }
        }

        var hasil_amount = 0;
        var [capital_amount] = await connection.query(
            `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='SO_GUDANG' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
        );
        for (let x = 0; x < capital_amount.length; x++) {
            if (capital_amount[x].amount === null || capital_amount[x].amount === "") {
                var hasil_amount = "0";
            } else {
                var hasil_amount = parseInt(capital_amount[x].amount);
            }
        }
    }

    try {
        await connection.beginTransaction();
        var total_qty = 0;
        var total_cost = 0;

        for (let index = 0; index < get_po.length; index++) {
            var [get_detail] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive='${get_po[index].tanggal_receive}' AND tipe_order='SO_GUDANG' GROUP BY id_act ORDER BY id DESC`
            );
            const datas2 = [];

            for (let i = 0; i < get_detail.length; i++) {
                var [get_produk] = await connection.query(
                    `SELECT * FROM tb_produk WHERE id_produk='${get_detail[i].id_produk}' `
                );

                var [get_ware] = await connection.query(
                    `SELECT * FROM tb_warehouse WHERE id_ware='${get_detail[i].id_ware}'`
                );

                var [get_supplier] = await connection.query(
                    `SELECT supplier FROM tb_supplier WHERE id_sup='${get_detail[i].id_sup}'`
                );

                if (get_detail[i].tipe_order === "TRANSFER") {
                    datas2.push({
                        id: get_po[index].id,
                        idpo: get_detail[i].idpo,
                        tanggal_receive: get_detail[i].tanggal_receive,
                        id_sup: get_detail[i].id_sup,
                        id_produk: get_detail[i].id_produk,
                        id_ware: get_detail[i].id_ware,
                        qty: get_detail[i].qty,
                        m_price: get_detail[i].m_price,
                        total_amount: get_detail[i].total_amount,
                        tipe_order: get_detail[i].tipe_order,
                        id_act: get_detail[i].id_act,
                        produk: get_produk[0].produk,
                        gudang: get_ware[0].warehouse,
                        supplier: get_detail[i].id_sup,
                    });
                } else {
                    datas2.push({
                        id: get_po[index].id,
                        idpo: get_detail[i].idpo,
                        tanggal_receive: get_detail[i].tanggal_receive,
                        id_sup: get_detail[i].id_sup,
                        id_produk: get_detail[i].id_produk,
                        id_ware: get_detail[i].id_ware,
                        qty: get_detail[i].qty,
                        m_price: get_detail[i].m_price,
                        total_amount: get_detail[i].total_amount,
                        tipe_order: get_detail[i].tipe_order,
                        id_act: get_detail[i].id_act,
                        produk: get_produk[0].produk,
                        gudang: get_ware[0].warehouse,
                        supplier: get_detail[i].id_sup,
                    });
                }

                total_qty = total_qty + parseInt(get_detail[i].qty);
                total_cost = total_cost + parseInt(get_detail[i].total_amount);
            }

            datas.push({
                tanggal: get_po[index].tanggal_receive,
                users: get_po[index].users,
                id_so: get_po[index].idpo,
                total_qty: total_qty,
                total_cost: total_cost,
                detail: datas2,
            });
        }

        await connection.commit();
        await connection.release();

        return {
            datas,
            total_po: get_po.length ? get_po.length : 0,
            total_qty: hasil_totalqty,
            capital_amount: hasil_amount ? hasil_amount : 0,
        };

    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getProdukbarcode = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        if (body.role === "SUPER-ADMIN" || body.role === "HEAD-AREA") {
            var areas = body.area;
        } else if (body.role === "HEAD-WAREHOUSE") {
            var [cek_area] = await connection.query(
                `SELECT id_ware FROM tb_warehouse WHERE id_ware='${body.area}' GROUP BY id_ware`
            );
            var areas = cek_area[0].id_ware;
        } else {
            var [cek_store] = await connection.query(
                `SELECT id_ware FROM tb_store WHERE id_store='${body.area}' GROUP BY id_store`
            );
            var areas = cek_store[0].id_ware;
        }

        if (body.warehouse == "all") {
            var [get_produk] = await connection.query(
                `SELECT tb_produk.*,tb_warehouse.* FROM tb_produk LEFT JOIN tb_warehouse ON tb_produk.id_ware = tb_warehouse.id_ware ORDER BY tb_produk.id DESC`
            );
        } else if (body.warehouse === "all_area") {
            var [get_produk] = await connection.query(
                `SELECT tb_produk.*,tb_warehouse.* FROM tb_produk LEFT JOIN tb_warehouse ON tb_produk.id_ware = tb_warehouse.id_ware WHERE tb_warehouse.id_area='${areas}' ORDER BY tb_produk.id DESC`
            );
        } else if (body.warehouse === "wares") {
            var [get_produk] = await connection.query(
                `SELECT tb_produk.*,tb_warehouse.* FROM tb_produk LEFT JOIN tb_warehouse ON tb_produk.id_ware = tb_warehouse.id_ware WHERE tb_warehouse.id_ware='${areas}' ORDER BY tb_produk.id DESC`
            );
        } else {
            var [get_produk] = await connection.query(
                `SELECT tb_produk.*,tb_warehouse.* FROM tb_produk LEFT JOIN tb_warehouse ON tb_produk.id_ware = tb_warehouse.id_ware WHERE tb_produk.id_ware='${body.warehouse}' ORDER BY tb_produk.id DESC`
            );
        }

        await connection.commit();
        await connection.release();

        return get_produk;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getWarehousebarcode = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [data_role] = await connection.query(
            `SELECT * FROM tb_karyawan WHERE role='${body.role}'`
        );

        if (body.role === 'SUPER-ADMIN') {
            var [data_warehouse] = await connection.query(
                `SELECT * FROM tb_warehouse`
            );
        } else if (body.role === 'HEAD-AREA') {
            var [data_warehouse] = await connection.query(
                `SELECT * FROM tb_warehouse WHERE id_area='${data_role[0].id_store} '`
            );
        } else if (body.role === 'HEAD-WAREHOUSE') {
            var [data_warehouse] = await connection.query(
                `SELECT * FROM tb_warehouse WHERE id_ware='${body.area}'`
            );
        } else {
            var [data_store] = await connection.query(
                `SELECT id_ware FROM tb_store WHERE id_store='${body.area}'`
            );
            var [data_warehouse] = await connection.query(
                `SELECT * FROM tb_warehouse WHERE id_ware='${data_store[0].id_ware}'`
            );
        }

        await connection.commit();
        await connection.release();

        return data_warehouse;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getIdpo = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [get_idpo] = await connection.query(
            `SELECT * FROM tb_purchaseorder WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}' AND qty >= 0 ORDER BY id DESC`
        );


        // console.log(body)
        await connection.commit();
        await connection.release();

        return get_idpo;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getSizebarcode = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [data_getsize] = await connection.query(
            `SELECT *,SUM(qty)as qty FROM tb_variationorder WHERE id_produk='${body.idproduct}' AND id_ware='${body.idware}' AND idpo='${body.idpo}' AND qty >= 0 GROUP BY size`
        );

        await connection.commit();
        await connection.release();
        return data_getsize;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getStore_sales = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();
        const [data_role] = await connection.query(
            `SELECT * FROM tb_karyawan WHERE role='${body.role}'`
        );

        if (body.role === 'SUPER-ADMIN') {
            var [data_store] = await connection.query(
                `SELECT * FROM tb_store`
            );
        } else if (body.role === 'HEAD-AREA') {
            var [data_store] = await connection.query(
                `SELECT * FROM tb_store WHERE id_area='${data_role[0].id_store} '`
            );
        } else {
            var [data_store] = await connection.query(
                `SELECT * FROM tb_store WHERE id_store='${data_role[0].id_store}'`
            );
        }
        // console.log(data_role)
        await connection.commit();
        await connection.release();
        return data_store;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getStore_sales_online = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [data_role] = await connection.query(
            `SELECT * FROM tb_karyawan WHERE role='${body.role}'`
        );

        if (body.role === 'SUPER-ADMIN') {
            var [data_store] = await connection.query(
                `SELECT * FROM tb_store WHERE channel != 'OFFLINE STORE'`
            );
        } else if (body.role === 'HEAD-AREA') {
            var [data_store] = await connection.query(
                `SELECT * FROM tb_store WHERE id_area='${data_role[0].id_store}' AND channel != 'OFFLINE STORE'`
            );
        } else {
            var [list_data_role] = await connection.query(
                `SELECT * FROM tb_karyawan WHERE role='${body.role}' AND id_store='${body.store}'`
            );
            for (let x = 0; x < list_data_role.length; x++) {
                var [data_store] = await connection.query(
                    `SELECT * FROM tb_store WHERE id_store='${list_data_role[x].id_store}' AND channel != 'OFFLINE STORE' GROUP BY id_store`
                );
            }
        }
        // console.log(body)
        await connection.commit();
        await connection.release();
        return data_store;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getStore_dashboard = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [data_role] = await connection.query(
            `SELECT * FROM tb_karyawan WHERE role='${body.role}'`
        );

        if (body.role === 'SUPER-ADMIN') {
            var [data_store] = await connection.query(
                `SELECT * FROM tb_store`
            );
        } else if (body.role === 'HEAD-AREA') {
            var [data_store] = await connection.query(
                `SELECT * FROM tb_store WHERE id_area='${data_role[0].id_store}'`
            );
        } else {
            var [list_data_role] = await connection.query(
                `SELECT * FROM tb_karyawan WHERE role='${body.role}' AND id_store='${body.store}'`
            );
            for (let x = 0; x < list_data_role.length; x++) {
                var [data_store] = await connection.query(
                    `SELECT * FROM tb_store WHERE id_store='${list_data_role[x].id_store}' GROUP BY id_store`
                );
            }
        }
        // console.log(body)

        await connection.commit();
        await connection.release();
        return data_store;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getWarehouse_sales = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    // console.log(body)
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
        // console.log(data_ware)
        await connection.commit();
        await connection.release();
        return data_ware;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getWarehouse_sales_online = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();
        const [data_role] = await connection.query(
            `SELECT * FROM tb_karyawan WHERE role='${body.role}'`
        );

        if (body.role === 'SUPER-ADMIN') {
            var [data_ware] = await connection.query(
                `SELECT * FROM tb_warehouse`
            );
        } else {
            var [data_ware] = await connection.query(
                `SELECT tb_store.*,tb_warehouse.* FROM tb_store LEFT JOIN tb_warehouse ON tb_store.id_ware = tb_warehouse.id_ware WHERE tb_store.id_store='${data_role[0].id_store}'`
            );
        }
        // console.log(data_ware)
        await connection.commit();
        await connection.release();
        return data_ware;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getMutation = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

    const tanggal = body.date;
    const myArray = tanggal.split(" to ");

    if (tanggal.length > 10) {
        var tanggal_start = myArray[0];
        var tanggal_end = myArray[1];
    } else {
        var tanggal_start = tanggal;
        var tanggal_end = tanggal;
    }


    try {
        await connection.beginTransaction();
        const datas = [];

        if (body.user_role === "SUPER-ADMIN" || body.user_role === "HEAD-AREA") {
            var [query] = await connection.query(
                `SELECT tb_mutasistock.*,tb_store.store,tb_warehouse.warehouse FROM tb_mutasistock LEFT JOIN tb_warehouse ON tb_mutasistock.id_ware = tb_warehouse.id_ware 
                        LEFT JOIN tb_store ON tb_mutasistock.id_store = tb_store.id_store 
                        WHERE tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_mutasistock.id DESC`
            );

            var [getstockawal] = await connection.query(
                `SELECT * FROM tb_settlement WHERE tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
            );

            var [query_transaksi] = await connection.query(
                `SELECT * FROM tb_mutasistock WHERE tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY id_mutasi`
            );

            var [total_barangmasuk] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE source='Barang Gudang' AND mutasi='ADD_PRODUK' OR mutasi='RESTOCK' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_in_refund] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE source='Barang Gudang' AND mutasi='REFUND' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_in_cancel] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE source='Barang Gudang' AND mutasi='CANCEL_ORDER' OR mutasi='DELETE_ORDER' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_in_retur] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE source='Barang Gudang' AND mutasi='RETUR_IN' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_out_retur] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE source='Barang Gudang' AND mutasi='RETUR_OUT' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_out_sales_online] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE source='Barang Gudang' AND mutasi='SALES ONLINE' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_out_sales_toko] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE source='Barang Gudang' AND mutasi='SALES RETAIL' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [get_stok_all] = await connection.query(
                `SELECT SUM(qty) as qty FROM tb_variation`
            );

        } else if (body.user_role === "HEAD-WAREHOUSE") {
            var [query] = await connection.query(
                `SELECT tb_mutasistock.*,tb_store.store,tb_warehouse.warehouse FROM tb_mutasistock LEFT JOIN tb_warehouse ON tb_mutasistock.id_ware = tb_warehouse.id_ware 
                        LEFT JOIN tb_store ON tb_mutasistock.id_store = tb_store.id_store 
                        WHERE tb_mutasistock.users='${body.user_login}' AND tb_mutasistock.id_ware='${body.user_store}' AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_mutasistock.id DESC`
            );

            var [getstockawal] = await connection.query(
                `SELECT * FROM tb_settlement WHERE tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
            );

            var [query_transaksi] = await connection.query(
                `SELECT * FROM tb_mutasistock WHERE  users='${body.user_login}' AND id_ware='${body.user_store}' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY id_mutasi`
            );

            var [total_barangmasuk] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND id_ware='${body.user_store}' AND source='Barang Gudang' AND mutasi='ADD_PRODUK' OR mutasi='RESTOCK' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_in_refund] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND id_ware='${body.user_store}' AND source='Barang Gudang' AND mutasi='REFUND' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_in_cancel] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND id_ware='${body.user_store}' AND source='Barang Gudang' AND mutasi='CANCEL_ORDER' OR mutasi='DELETE_ORDER' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_in_retur] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND id_ware='${body.user_store}' AND source='Barang Gudang' AND mutasi='RETUR_IN' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_out_retur] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND id_ware='${body.user_store}' AND source='Barang Gudang' AND mutasi='RETUR_OUT' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_out_sales_online] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND id_ware='${body.user_store}' AND source='Barang Gudang' AND mutasi='SALES ONLINE' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_out_sales_toko] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND id_ware='${body.user_store}' AND source='Barang Gudang' AND mutasi='SALES RETAIL' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [get_stok_all] = await connection.query(
                `SELECT SUM(qty) as qty FROM tb_variation`
            );
        } else {
            var [query] = await connection.query(
                `SELECT tb_mutasistock.*,tb_store.store,tb_warehouse.warehouse FROM tb_mutasistock LEFT JOIN tb_warehouse ON tb_mutasistock.id_ware = tb_warehouse.id_ware 
                        LEFT JOIN tb_store ON tb_mutasistock.id_store = tb_store.id_store 
                        WHERE tb_mutasistock.users='${body.user_login}' AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_mutasistock.id DESC`
            );

            var [getstockawal] = await connection.query(
                `SELECT * FROM tb_settlement WHERE tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY id DESC`
            );

            var [query_transaksi] = await connection.query(
                `SELECT * FROM tb_mutasistock WHERE  users='${body.user_login}' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY id_mutasi`
            );

            var [total_barangmasuk] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND source='Barang Gudang' AND mutasi='ADD_PRODUK' OR mutasi='RESTOCK' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_in_refund] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND source='Barang Gudang' AND mutasi='REFUND' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_in_cancel] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND source='Barang Gudang' AND mutasi='CANCEL_ORDER' OR mutasi='DELETE_ORDER' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_in_retur] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND source='Barang Gudang' AND mutasi='RETUR_IN' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_out_retur] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND source='Barang Gudang' AND mutasi='RETUR_OUT' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_out_sales_online] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND source='Barang Gudang' AND mutasi='SALES ONLINE' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [total_out_sales_toko] = await connection.query(
                `SELECT *,SUM(qty) as qty FROM tb_mutasistock WHERE users='${body.user_login}' AND source='Barang Gudang' AND mutasi='SALES RETAIL' AND tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );

            var [get_stok_all] = await connection.query(
                `SELECT SUM(qty) as qty FROM tb_variation`
            );
        }

        datas.push({
            data_expense: query,
            total_transaksi: query_transaksi.length,
            stock_awal: getstockawal ? getstockawal : 0,
            total_barangmasuk: total_barangmasuk[0].qty,
            total_in_retur: total_in_retur[0].qty,
            total_in_refund: total_in_refund[0].qty,
            total_out_sales_online: total_out_sales_online[0].qty,
            total_out_sales_toko: total_out_sales_toko[0].qty,
            total_out_retur: total_out_retur[0].qty,
            total_in_cancel: total_in_cancel[0].qty,
            live_stok: get_stok_all[0].qty,
            // warehouse: get_ware,
        });
        await connection.commit();
        await connection.release();

        return datas;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const get_Asset = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    const id_ware = body.id_ware;
    const query = body.query;
    const brand = body.brand;
    const datas = [];
    // === SOLD ordering param (for optional sorting) ===
    const soldOrder = (body.sold || 'ALL').toLowerCase();
    console.log("body asset", body);

    // helper paging: selalu batasi hasil (default pageIndex = 0, 0-based)
    const makeLimit = (pageIndex) => {
        const pageSize = 20;
        const page = Number.isFinite(Number(pageIndex)) ? Number(pageIndex) : 0; // 0-based
        const offset = Math.max(0, page) * pageSize;
        return { clause: ` LIMIT ${pageSize} OFFSET ${offset}`, limitss: offset, pageSize };
    };

    // === Kondisi Filter Brand ===
    let brandConditionProduk = "";     // Untuk tb_produk
    let brandConditionWarehouse = "";  // Untuk tb_warehouse
    let brandConditionPO = "";         // Untuk tb_purchaseorder
    let brandConditionVariation = "";  // Untuk tb_variation
    let brandConditionOrder = "";      // Untuk tb_order
    let brandConditionOrderAliased = ""; // Untuk alias `o` pada tb_order

    if (brand !== "all") {
        if (id_ware === "all") {
            brandConditionProduk =
                " AND tb_produk.id_ware IN (SELECT tb_warehouse.id_ware FROM tb_warehouse WHERE tb_warehouse.id_area = '" + brand + "')";
        } else {
            brandConditionProduk =
                " AND (SELECT tb_warehouse.id_area FROM tb_warehouse WHERE tb_warehouse.id_ware = tb_produk.id_ware) = '" + brand + "'";
        }
        brandConditionWarehouse = " WHERE tb_warehouse.id_area = '" + brand + "'";
        brandConditionPO =
            " AND tb_purchaseorder.id_ware IN (SELECT tb_warehouse.id_ware FROM tb_warehouse WHERE tb_warehouse.id_area = '" + brand + "')";
        brandConditionVariation =
            " AND tb_variation.id_ware IN (SELECT tb_warehouse.id_ware FROM tb_warehouse WHERE tb_warehouse.id_area = '" + brand + "')";
        brandConditionOrder =
            " AND tb_order.id_ware IN (SELECT tb_warehouse.id_ware FROM tb_warehouse WHERE tb_warehouse.id_area = '" + brand + "')";
        brandConditionOrderAliased =
            " AND o.id_ware IN (SELECT tb_warehouse.id_ware FROM tb_warehouse WHERE tb_warehouse.id_area = '" + brand + "')";
    }
    // === End Kondisi Filter Brand ===

    try {
        await connection.beginTransaction();
        const datas2 = [];

        // --- COUNT PRODUK cepat ---
        // --- COUNT PRODUK cepat ---
        let totalProduk = 0;
        if (query === "all") {
            if (id_ware === "all") {
                const [rowsTotal] = await connection.query(
                    `SELECT COUNT(DISTINCT p.id_produk) AS total 
             FROM tb_produk p
             WHERE 1 ${brand !== "all" ? brandConditionProduk : ""}`
                );
                totalProduk = rowsTotal[0]?.total || 0;
            } else {
                const [rowsTotal] = await connection.query(
                    `SELECT COUNT(DISTINCT p.id_produk) AS total
             FROM tb_produk p
             WHERE p.id_ware='${id_ware}'
             ${brand !== "all" ? brandConditionProduk : ""}`
                );
                totalProduk = rowsTotal[0]?.total || 0;
            }
        } else {
            if (id_ware === "all") {
                const [rowsTotal] = await connection.query(
                    `SELECT COUNT(DISTINCT p.id_produk) AS total
             FROM tb_produk p
             WHERE 1 
             ${brand !== "all" ? brandConditionProduk : ""}
             AND (p.produk LIKE '%${query}%' OR p.id_produk LIKE '%${query}%')`
                );
                totalProduk = rowsTotal[0]?.total || 0;
            } else {
                const [rowsTotal] = await connection.query(
                    `SELECT COUNT(DISTINCT p.id_produk) AS total
             FROM tb_produk p
             WHERE p.id_ware='${id_ware}'
             ${brand !== "all" ? brandConditionProduk : ""}
             AND (p.produk LIKE '%${query}%' OR p.id_produk LIKE '%${query}%')`
                );
                totalProduk = rowsTotal[0]?.total || 0;
            }
        }

        console.log("totalProduk", totalProduk);


        const { clause: limitClauseStd, limitss, pageSize } = makeLimit(body.loadmorelimit);
        const total_pages = Math.ceil(totalProduk / pageSize);
        console.log("total_pages", total_pages);


        // --- GET DATA WAREHOUSE --- (dipertahankan seperti semula)
        const [get_wares] = await connection.query(
            `SELECT * FROM tb_warehouse ${brand !== "all" ? brandConditionWarehouse : ""} GROUP BY tb_warehouse.id_ware`
        );

        // util ORDER BY
        // util ORDER BY (alias-aware)
        const orderClauseFromUrutan = (prodAlias = 'tb_produk', varAlias = 'tb_variation') => {
            if (body.urutan === 'all') return ` ORDER BY ${prodAlias}.id_produk DESC`;
            if (body.urutan === 'desc') return ` ORDER BY COALESCE(SUM(${varAlias}.qty),0) DESC`;
            return ` ORDER BY COALESCE(SUM(${varAlias}.qty),0) ASC`;
        };

        // === SOLD sorting helper (ke SQL level agar urutan benar sebelum LIMIT) ===
        const buildSoldFilter = () => {
            const f_idware = (id_ware === "all") ? "" : ` AND o.id_ware='${id_ware}'`;
            const f_brand = (brand !== "all")
                ? ` AND o.id_ware IN (SELECT tb_warehouse.id_ware FROM tb_warehouse WHERE tb_warehouse.id_area='${brand}')`
                : "";
            // Only filter by id_ware / brand. Do NOT join or filter by invoice here.
            return f_idware + f_brand;
        };

        const buildSoldJoin = (prodAlias = 'tb_produk') => `
        LEFT JOIN (
          SELECT o.id_produk, SUM(o.qty) AS sold_total
          FROM tb_order o
          WHERE 1=1${buildSoldFilter()}
          GROUP BY o.id_produk
        ) s ON s.id_produk = ${prodAlias}.id_produk`;

        const orderClauseFromSold = (prodAlias = 'tb_produk') => {
            if (soldOrder === 'desc') return ` ORDER BY COALESCE(s.sold_total,0) DESC, ${prodAlias}.id_produk DESC`;
            if (soldOrder === 'asc') return ` ORDER BY COALESCE(s.sold_total,0) ASC,  ${prodAlias}.id_produk DESC`;
            return ""; // 'all' -> tidak override
        };

        // === Ambil list produk sesuai cabang ===
        let baseProdukQuery = "";
        if (query === "all") {
            if (id_ware === "all") {
                baseProdukQuery = `
        SELECT 
            tb_produk.*, 
            'ALL' AS warehouse, 
            COALESCE(SUM(v.qty),0) AS sortbyqty,
            ${soldOrder !== 'all' ? 'COALESCE(s.sold_total,0) AS sold_sql,' : ''} 0 AS sold_sql_placeholder
        FROM tb_produk
        LEFT JOIN tb_variation v 
            ON tb_produk.id_produk = v.id_produk 
            AND tb_produk.id_ware = v.id_ware
        ${soldOrder !== 'all' ? buildSoldJoin('tb_produk') : ''}
        ${brand !== "all" ? "WHERE 1 " + brandConditionProduk : "WHERE 1"}
        GROUP BY tb_produk.id_produk
        ${soldOrder !== 'all' ? orderClauseFromSold('tb_produk') : orderClauseFromUrutan('tb_produk', 'v')}${limitClauseStd}
    `;
            } else {
                baseProdukQuery = `
        SELECT 
            tb_produk.*, 
            w.warehouse AS warehouse, 
            COALESCE(SUM(v.qty),0) AS sortbyqty,
            ${soldOrder !== 'all' ? 'COALESCE(s.sold_total,0) AS sold_sql,' : ''} 0 AS sold_sql_placeholder
        FROM tb_produk
        LEFT JOIN tb_variation v 
            ON tb_produk.id_produk = v.id_produk 
            AND tb_produk.id_ware = v.id_ware
        LEFT JOIN tb_warehouse w 
            ON tb_produk.id_ware = w.id_ware
        ${soldOrder !== 'all' ? buildSoldJoin('tb_produk') : ''}
        WHERE tb_produk.id_ware='${id_ware}' ${brand !== "all" ? brandConditionProduk : ""}
        GROUP BY tb_produk.id_produk, w.warehouse
        ${soldOrder !== 'all' ? orderClauseFromSold('tb_produk') : orderClauseFromUrutan('tb_produk', 'v')}${limitClauseStd}
    `;
            }
        } else {
            if (id_ware === "all") {
                baseProdukQuery = `
                    SELECT p.*, 'ALL' AS warehouse, COALESCE(SUM(v.qty),0) AS sortbyqty,
                           ${soldOrder !== 'all' ? 'COALESCE(s.sold_total,0) AS sold_sql,' : ''} 0 AS sold_sql_placeholder
                    FROM tb_produk p
                    LEFT JOIN tb_variation v ON p.id_produk = v.id_produk AND p.id_ware = v.id_ware
                    LEFT JOIN tb_warehouse w ON p.id_ware = w.id_ware
                    ${soldOrder !== 'all' ? buildSoldJoin('p') : ''}
                    ${brand !== "all" ? "WHERE 1 " + brandConditionProduk + " AND " : "WHERE "}
                    (p.produk LIKE '%${query}%' OR p.id_produk LIKE '%${query}%')
                    GROUP BY p.id_produk
                   ${soldOrder !== 'all' ? orderClauseFromSold('p') : orderClauseFromUrutan('p', 'v')}${limitClauseStd}
                `;
            } else {
                baseProdukQuery = `
                    SELECT tb_produk.*, tb_warehouse.warehouse, COALESCE(SUM(tb_variation.qty),0) AS sortbyqty,
                           ${soldOrder !== 'all' ? 'COALESCE(s.sold_total,0) AS sold_sql,' : ''} 0 AS sold_sql_placeholder
                    FROM tb_produk
                    LEFT JOIN tb_variation ON tb_produk.id_produk = tb_variation.id_produk AND tb_produk.id_ware = tb_variation.id_ware
                    LEFT JOIN tb_warehouse ON tb_produk.id_ware = tb_warehouse.id_ware
                    ${soldOrder !== 'all' ? buildSoldJoin('tb_produk') : ''}
                    WHERE tb_produk.id_ware='${id_ware}' ${brand !== "all" ? brandConditionProduk : ""}
                      AND (tb_produk.produk LIKE '%${query}%' OR tb_produk.id_produk LIKE '%${query}%')
                    GROUP BY tb_produk.id_produk
                   ${soldOrder !== 'all' ? orderClauseFromSold('tb_produk') : orderClauseFromUrutan('tb_produk', 'tb_variation')}${limitClauseStd}
                `;
            }
        }

        const [get_produk] = await connection.query(baseProdukQuery);

        // Jika tidak ada produk, kembalikan agregat kosong
        if (!get_produk.length) {
            const [get_po_stock_opname] = await connection.query(
                `SELECT SUM(qty) as qty FROM tb_purchaseorder WHERE tipe_order='SO_GUDANG' ${brand !== "all" ? brandConditionPO : ""}`
            );
            datas.push({
                data_asset: [],
                release: 0,
                restock: 0,
                tf_in: 0,
                tf_out: 0,
                qty_assets: 0,
                getsoldall: 0,
                nominal_assets: 0,
                asset_bersih: 0,
                total: 0,
                totalterjual: 0,
                stock_opname: parseInt(get_po_stock_opname[0]?.qty || 0)
            });
            await connection.commit();
            await connection.release();
            return { datas, total_pages, show_page: limitss };
        }

        // === Batching agregat per-produk ===
        const idList = get_produk.map(r => r.id_produk);
        const makePlaceholders = (n) => Array(n).fill("?").join(",");

        // stok per produk (ikuti cabang lama)
        let stokSql = "";
        if (query === "all" && id_ware === "all") {
            stokSql = `SELECT id_produk, SUM(qty) AS stock FROM tb_variation WHERE id_produk IN (${makePlaceholders(idList.length)}) GROUP BY id_produk`;
        } else {
            stokSql = `SELECT id_produk, SUM(qty) AS stock FROM tb_variation WHERE id_produk IN (${makePlaceholders(idList.length)}) ${id_ware !== "all" ? ` AND id_ware='${id_ware}'` : ""} GROUP BY id_produk`;
        }
        const [stokRows] = await connection.query(stokSql, idList);
        const stokMap = new Map(stokRows.map(r => [r.id_produk, r.stock || 0]));

        // PO per tipe
        const poBaseWhere =
            ` id_produk IN (${makePlaceholders(idList.length)})` +
            (id_ware !== "all" ? ` AND tb_purchaseorder.id_ware='${id_ware}'` : "") +
            (brand !== "all" ? brandConditionPO : "");
        const [poReleaseRows] = await connection.query(
            `SELECT id_produk, SUM(qty) AS qty FROM tb_purchaseorder WHERE tipe_order='RELEASE' AND ${poBaseWhere} GROUP BY id_produk`, idList);
        const [poRestockRows] = await connection.query(
            `SELECT id_produk, SUM(qty) AS qty FROM tb_purchaseorder WHERE tipe_order='RESTOCK' AND ${poBaseWhere} GROUP BY id_produk`, idList);
        const [poTfinRows] = await connection.query(
            `SELECT id_produk, SUM(qty) AS qty FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND qty > 0 AND ${poBaseWhere} GROUP BY id_produk`, idList);
        const [poTfoutRows] = await connection.query(
            `SELECT id_produk, SUM(qty) AS qty FROM tb_purchaseorder WHERE tipe_order='TRANSFER OUT' AND qty < 0 AND ${poBaseWhere} GROUP BY id_produk`, idList);
        const toMap = (rows) => { const m = new Map(); for (const r of rows) m.set(r.id_produk, r.qty || 0); return m; };
        const poRelMap = toMap(poReleaseRows);
        const poResMap = toMap(poRestockRows);
        const poTfinMap = toMap(poTfinRows);
        const poTfoutMap = toMap(poTfoutRows);

        // SOLD per produk
        const soldBaseWhere =
            ` o.id_produk IN (${makePlaceholders(idList.length)})` +
            (id_ware !== "all" ? ` AND o.id_ware='${id_ware}'` : "") +
            brandConditionOrderAliased;

        // ❶ Ganti query ini (hapus LEFT JOIN tb_invoice & filter tanggal/status)
        const [soldRows] = await connection.query(
            `SELECT o.id_produk, SUM(o.qty) AS total
   FROM tb_order o
   WHERE ${soldBaseWhere}
   GROUP BY o.id_produk`,
            idList
        );

        const soldMap = new Map(soldRows.map(r => [r.id_produk, r.total || 0]));

        // === SOLD per produk & size (untuk kebutuhan sorting body.sold) ===
        const soldBySizeWhere =
            ` o.id_produk IN (${makePlaceholders(idList.length)})` +
            (id_ware !== "all" ? ` AND o.id_ware='${id_ware}'` : "") +
            brandConditionOrderAliased;

        // ❷ Ganti query ini (hapus LEFT JOIN tb_invoice & filter tanggal/status)
        const [soldBySizeRows] = await connection.query(
            `SELECT o.id_produk, o.size, SUM(o.qty) AS total
   FROM tb_order o
   WHERE ${soldBySizeWhere}
   GROUP BY o.id_produk, o.size`,
            idList
        );

        // Reduce ke total per produk (SUM semua size)
        const soldFromSizeMap = new Map();
        for (const r of soldBySizeRows) {
            const cur = soldFromSizeMap.get(r.id_produk) || 0;
            soldFromSizeMap.set(r.id_produk, cur + (r.total || 0));
        }

        // Assets per produk: SUM(m_price * qty variation per idpo)
        const varPerPoSql = `
            SELECT id_produk, idpo, SUM(qty) AS qty
            FROM tb_variation
            WHERE id_produk IN (${makePlaceholders(idList.length)})
            ${id_ware !== "all" ? ` AND id_ware='${id_ware}'` : ""}
            GROUP BY id_produk, idpo
        `;
        const [varPerPoRows] = await connection.query(varPerPoSql, idList);
        const vKey = (p, po) => `${p}::${po}`;
        const varPerPoMap = new Map();
        for (const r of varPerPoRows) varPerPoMap.set(vKey(r.id_produk, r.idpo), r.qty || 0);

        const poForAssetsWhere =
            ` id_produk IN (${makePlaceholders(idList.length)})` +
            (id_ware !== "all" ? ` AND tb_purchaseorder.id_ware='${id_ware}'` : "") +
            (brand !== "all" ? brandConditionPO : "");
        const [poPriceRows] = await connection.query(
            `SELECT id_produk, idpo, m_price FROM tb_purchaseorder WHERE ${poForAssetsWhere} ORDER BY id DESC`, idList);
        const assetsMap = new Map();
        for (const row of poPriceRows) {
            const qty = varPerPoMap.get(vKey(row.id_produk, row.idpo)) || 0;
            const inc = (parseInt(row.m_price) || 0) * (parseInt(qty) || 0);
            assetsMap.set(row.id_produk, (assetsMap.get(row.id_produk) || 0) + inc);
        }

        // Susun datas2
        for (const p of get_produk) {
            datas2.push({
                produk: p.produk,
                warehouse: p.warehouse,
                id_ware: id_ware === "all" ? "ALL" : id_ware,
                id_produk: p.id_produk,
                release: poRelMap.get(p.id_produk) || 0,
                restock: poResMap.get(p.id_produk) || 0,
                transfer_in: poTfinMap.get(p.id_produk) || 0,
                transfer_out: poTfoutMap.get(p.id_produk) || 0,
                sold: soldMap.get(p.id_produk) || 0,
                stock: stokMap.get(p.id_produk) || 0,
                assets: assetsMap.get(p.id_produk) || 0,
                sold_from_size: soldFromSizeMap.get(p.id_produk) || 0
            });
        }
        // console.log("datas 2", datas2);

        // --- Optional re-ordering by SOLD (gunakan total sold per produk yang konsisten dengan subquery SQL) ---
        if (soldOrder === 'desc') {
            datas2.sort((a, b) => {
                if (b.sold !== a.sold) return b.sold - a.sold;
                // tie-breaker to keep results stable:
                return (b.assets || 0) - (a.assets || 0) || (b.stock || 0) - (a.stock || 0) || String(b.id_produk).localeCompare(String(a.id_produk));
            });
        } else if (soldOrder === 'asc') {
            datas2.sort((a, b) => {
                if (a.sold !== b.sold) return a.sold - b.sold;
                return (a.assets || 0) - (b.assets || 0) || (a.stock || 0) - (b.stock || 0) || String(a.id_produk).localeCompare(String(b.id_produk));
            });
        }


        // === Agregat global (tanpa loop) ===
        const brandPO = brand !== "all" ? brandConditionPO : "";
        const brandOrder_o = brand !== "all" ? brandConditionOrderAliased : ""; // for queries using alias `o`
        const brandOrder_tb = brand !== "all" ? brandConditionOrder : "";       // for queries using table name `tb_order`
        const brandVar = brand !== "all" ? brandConditionVariation : "";
        const idWarePO = id_ware === "all" ? "" : ` AND tb_purchaseorder.id_ware='${id_ware}'`;
        // tambahkan persis di bawahnya:
        const brandVar_v = brand !== "all"
            ? ` AND v.id_ware IN (SELECT tb_warehouse.id_ware FROM tb_warehouse WHERE tb_warehouse.id_area='${brand}')`
            : "";
        const idWareVar_v = id_ware === "all" ? "" : ` AND v.id_ware='${id_ware}'`;

        const idWareVar_and = id_ware === "all" ? "" : ` AND tb_variation.id_ware='${id_ware}'`;
        const idWareOrder_o = id_ware === "all" ? "" : ` AND o.id_ware='${id_ware}'`;
        const idWareOrder_tb = id_ware === "all" ? "" : ` AND tb_order.id_ware='${id_ware}'`;
        // Variasi helper khusus alias table untuk tb_purchaseorder
        const idWarePO_tb = id_ware === 'all' ? '' : ` AND tb_purchaseorder.id_ware='${id_ware}'`;
        const idWarePO_po = id_ware === 'all' ? '' : ` AND po.id_ware='${id_ware}'`;
        const brandPO_tb = brand !== 'all'
            ? ` AND tb_purchaseorder.id_ware IN (SELECT tb_warehouse.id_ware FROM tb_warehouse WHERE tb_warehouse.id_area='${brand}')`
            : '';
        const brandPO_po = brand !== 'all'
            ? ` AND po.id_ware IN (SELECT tb_warehouse.id_ware FROM tb_warehouse WHERE tb_warehouse.id_area='${brand}')`
            : '';

        const qFilterProduk = (alias) => ` AND (${alias}.produk LIKE '%${query}%' OR ${alias}.id_produk LIKE '%${query}%')`;

        let get_po_release_all, get_po_restock_all, get_po_tfin_all, get_po_tfout_all,
            get_sold_all, get_stok_all, get_assets_amount, get_sold_amount, get_po_stock_opname;

        if (query === 'all') {
            // ===== Variant A: query === 'all' (tanpa filter query) =====
            [get_po_release_all] = await connection.query(
                `SELECT SUM(qty) as qty FROM tb_purchaseorder WHERE tipe_order='RELEASE'${idWarePO}${brandPO}`
            );
            [get_po_restock_all] = await connection.query(
                `SELECT SUM(qty) as qty FROM tb_purchaseorder WHERE tipe_order='RESTOCK'${idWarePO}${brandPO}`
            );
            [get_po_tfin_all] = await connection.query(
                `SELECT SUM(qty) as qty FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND qty > 0${idWarePO}${brandPO}`
            );
            [get_po_tfout_all] = await connection.query(
                `SELECT SUM(qty) as qty FROM tb_purchaseorder WHERE tipe_order='TRANSFER OUT' AND qty < 0${idWarePO}${brandPO}`
            );
            [get_sold_all] = await connection.query(
                `SELECT SUM(o.qty) as total
                 FROM tb_order o
                 LEFT JOIN tb_invoice i ON o.id_pesanan = i.id_pesanan
                 WHERE i.tanggal_order >= '2025-05-14' AND i.status_pesanan != 'CANCEL'${idWareOrder_o}${brandOrder_o}`
            );
            [get_stok_all] = await connection.query(
                `SELECT SUM(tb_variation.qty) as qty
   FROM tb_variation
   WHERE 1=1${idWareVar_and}${brandVar}`
            );
            [get_assets_amount] = await connection.query(
                `SELECT SUM(tb_purchaseorder.total_amount) as total_amount
                 FROM tb_purchaseorder
                 LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk AND tb_purchaseorder.id_ware = tb_produk.id_ware
                 WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK' OR tb_purchaseorder.tipe_order='SO_GUDANG')${idWarePO}${brandPO}`
            );
            [get_sold_amount] = await connection.query(
                `SELECT SUM(tb_order.m_price * tb_order.qty) as totalterjual
                 FROM tb_invoice
                 LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan
                 WHERE tb_invoice.status_pesanan != 'CANCEL'${idWareOrder_tb}${brandOrder_tb}`
            );
            [get_po_stock_opname] = await connection.query(
                `SELECT SUM(qty) as qty FROM tb_purchaseorder WHERE tipe_order='SO_GUDANG'${idWarePO}${brandPO}`
            );
        } else {
            // ===== Variant B: query != 'all' (ikut filter query) =====
            [get_po_release_all] = await connection.query(
                `SELECT SUM(tb_purchaseorder.qty) as qty
                 FROM tb_purchaseorder
                 LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk AND tb_purchaseorder.id_ware = tb_produk.id_ware
                 WHERE tb_purchaseorder.tipe_order='RELEASE'${idWarePO}${brandPO}${qFilterProduk('tb_produk')}`
            );
            [get_po_restock_all] = await connection.query(
                `SELECT SUM(tb_purchaseorder.qty) as qty
                 FROM tb_purchaseorder
                 LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk AND tb_purchaseorder.id_ware = tb_produk.id_ware
                 WHERE tb_purchaseorder.tipe_order='RESTOCK'${idWarePO}${brandPO}${qFilterProduk('tb_produk')}`
            );
            [get_po_tfin_all] = await connection.query(
                `SELECT SUM(tb_purchaseorder.qty) as qty
                 FROM tb_purchaseorder
                 LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk AND tb_purchaseorder.id_ware = tb_produk.id_ware
                 WHERE tb_purchaseorder.tipe_order='TRANSFER IN' AND tb_purchaseorder.qty > 0${idWarePO}${brandPO}${qFilterProduk('tb_produk')}`
            );
            [get_po_tfout_all] = await connection.query(
                `SELECT SUM(tb_purchaseorder.qty) as qty
                 FROM tb_purchaseorder
                 LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk AND tb_purchaseorder.id_ware = tb_produk.id_ware
                 WHERE tb_purchaseorder.tipe_order='TRANSFER OUT' AND tb_purchaseorder.qty < 0${idWarePO}${brandPO}${qFilterProduk('tb_produk')}`
            );
            [get_sold_all] = await connection.query(
                `SELECT SUM(o.qty) as total
                 FROM tb_order o
                 LEFT JOIN tb_invoice i ON o.id_pesanan = i.id_pesanan
                 LEFT JOIN tb_produk p ON o.id_produk = p.id_produk AND o.id_ware = p.id_ware
                 WHERE i.tanggal_order >= '2025-05-14' AND i.status_pesanan != 'CANCEL'${idWareOrder_o}${brandOrder_o}${qFilterProduk('p')}`
            );
            [get_stok_all] = await connection.query(
                `SELECT SUM(v.qty) as qty
   FROM tb_variation v
   LEFT JOIN tb_produk ON v.id_produk = tb_produk.id_produk AND v.id_ware = tb_produk.id_ware
   WHERE 1=1${idWareVar_v}${brandVar_v}${qFilterProduk('tb_produk')}`
            );
            [get_assets_amount] = await connection.query(
                `SELECT SUM(tb_purchaseorder.total_amount) as total_amount
                 FROM tb_purchaseorder
                 LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk AND tb_purchaseorder.id_ware = tb_produk.id_ware
                 WHERE (tb_purchaseorder.tipe_order='RELEASE' OR tb_purchaseorder.tipe_order='RESTOCK' OR tb_purchaseorder.tipe_order='SO_GUDANG')${idWarePO}${brandPO}${qFilterProduk('tb_produk')}`
            );
            [get_sold_amount] = await connection.query(
                `SELECT SUM(tb_order.m_price * tb_order.qty) as totalterjual
                 FROM tb_invoice
                 LEFT JOIN tb_order ON tb_invoice.id_pesanan = tb_order.id_pesanan
                 WHERE tb_invoice.status_pesanan != 'CANCEL'${idWareOrder_tb}${brandOrder_tb} AND (tb_order.produk LIKE '%${query}%' OR tb_order.id_produk LIKE '%${query}%')`
            );
            [get_po_stock_opname] = await connection.query(
                `SELECT SUM(tb_purchaseorder.qty) as qty
                 FROM tb_purchaseorder
                 LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk AND tb_purchaseorder.id_ware = tb_produk.id_ware
                 WHERE tb_purchaseorder.tipe_order='SO_GUDANG'${idWarePO}${brandPO}${qFilterProduk('tb_produk')}`
            );
        }

        // asset_bersih (global, tidak terpengaruh pagination)
        // Hitung SUM(m_price * qty_variation_per_idpo) untuk seluruh produk sesuai filter (brand/id_ware/query)
        const qProdukFilter = query === 'all' ? '' : qFilterProduk('p');
        const varWhere_v =
            (id_ware === 'all' ? '' : ` AND v.id_ware='${id_ware}'`) +
            (brand !== 'all' ? ` AND v.id_ware IN (SELECT tb_warehouse.id_ware FROM tb_warehouse WHERE tb_warehouse.id_area='${brand}')` : '');

        const [assetRows] = await connection.query(
            `SELECT SUM(po.m_price * IFNULL(v.qty, 0)) AS asset_bersih
           FROM tb_purchaseorder po
           LEFT JOIN (
             SELECT id_produk, idpo, id_ware, SUM(qty) AS qty
             FROM tb_variation v
             WHERE 1=1${varWhere_v}
             GROUP BY id_produk, idpo, id_ware
           ) v ON v.id_produk = po.id_produk
               AND v.idpo = po.idpo
               AND v.id_ware = po.id_ware
           LEFT JOIN tb_produk p ON po.id_produk = p.id_produk AND po.id_ware = p.id_ware
           WHERE 1=1${idWarePO_po}${brandPO_po}${qProdukFilter}`
        );
        const hitungtotalss_dasar = parseInt(assetRows[0]?.asset_bersih || 0);

        datas.push({
            data_asset: datas2,
            release: get_po_release_all[0]?.qty || 0,
            restock: get_po_restock_all[0]?.qty || 0,
            tf_in: get_po_tfin_all[0]?.qty || 0,
            tf_out: get_po_tfout_all[0]?.qty || 0,
            qty_assets: get_stok_all[0]?.qty || 0,
            getsoldall: get_sold_all[0]?.total || 0,
            nominal_assets: get_assets_amount[0]?.total_amount || 0,
            asset_bersih: hitungtotalss_dasar,
            total: get_produk.length,
            totalterjual: get_sold_amount[0]?.totalterjual || 0,
            stock_opname: parseInt(get_po_stock_opname[0]?.qty || 0)
        });
        // console.log("datas", datas);


        await connection.commit();
        await connection.release();
        return {
            datas,
            total_pages, // already Math.ceil above
            show_page: limitss
        };
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getHistoripoasset = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY-MM-DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    const datas = [];

    const id_ware = body.idware;
    const id_produk = body.idproduct;

    try {
        await connection.beginTransaction();

        if (id_ware === "ALL") {
            var [get_po] = await connection.query(
                `SELECT tb_purchaseorder.*,SUM(qty) as qty,tb_supplier.* FROM tb_purchaseorder LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup WHERE tb_purchaseorder.id_produk='${id_produk}' GROUP BY tb_purchaseorder.id_produk ORDER BY tb_purchaseorder.id DESC`
            );

            // var [get_size_histori] = await connection.query(
            //     `SELECT *,SUM(qty) as qty FROM tb_variationorder WHERE id_produk='${id_produk}' GROUP BY size ORDER BY size ASC`
            // );
        } else {
            var [get_po] = await connection.query(
                `SELECT tb_purchaseorder.*,SUM(qty) as qty,tb_supplier.* FROM tb_purchaseorder LEFT JOIN tb_supplier ON tb_purchaseorder.id_sup = tb_supplier.id_sup WHERE tb_purchaseorder.id_produk='${id_produk}' AND tb_purchaseorder.id_ware='${id_ware}' GROUP BY tb_purchaseorder.id_produk ORDER BY tb_purchaseorder.id DESC`
            );

            // var [get_size_histori] = await connection.query(
            //     `SELECT *,SUM(qty) as qty FROM tb_variationorder WHERE id_produk='${id_produk}' AND id_ware='${id_ware}' GROUP BY size ORDER BY size ASC`
            // );
        }

        for (let i = 0; i < get_po.length; i++) {
            if (id_ware === "ALL") {
                // var [get_size] = await connection.query(
                //     `SELECT *,SUM(qty) as qty FROM tb_variationorder WHERE id_produk='${id_produk}' GROUP BY size ORDER BY size ASC`
                // );

                var [get_size_ready] = await connection.query(
                    `SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${id_produk}' GROUP BY size ORDER BY size ASC`
                );
            } else {
                // var [get_size] = await connection.query(
                //     `SELECT *,SUM(qty) as qty FROM tb_variationorder WHERE id_produk='${id_produk}' id_ware='${id_ware}' GROUP BY size ORDER BY size ASC`
                // );

                var [get_size_ready] = await connection.query(
                    `SELECT *,SUM(qty) as qty FROM tb_variation WHERE id_produk='${id_produk}' AND id_ware='${id_ware}' GROUP BY size ORDER BY size ASC`
                );
            }

            var [get_ware] = await connection.query(
                `SELECT * FROM tb_warehouse WHERE id_ware='${get_po[i].id_ware}'`
            );

            if (get_po[i].tipe_order === "TRANSFER") {
                var [get_ware] = await connection.query(
                    `SELECT * FROM tb_warehouse WHERE id_ware='${get_po[i].id_sup}'`
                );

                datas.push({
                    id: get_po[i].id,
                    idpo: get_po[i].idpo,
                    tanggal_receive: get_po[i].tanggal_receive,
                    id_sup: get_po[i].id_sup,
                    id_produk: get_po[i].id_produk,
                    id_ware: get_ware[0].warehouse,
                    qty: get_po[i].qty,
                    m_price: get_po[i].m_price,
                    total_amount: get_po[i].total_amount,
                    tipe_order: get_po[i].tipe_order,
                    id_act: get_po[i].id_act,
                    users: get_po[i].users,
                    supplier: get_ware[0].warehouse,
                    // variation: get_size,
                    variation_ready: get_size_ready,
                });
            } else {
                datas.push({
                    id: get_po[i].id,
                    idpo: get_po[i].idpo,
                    tanggal_receive: get_po[i].tanggal_receive,
                    id_sup: get_po[i].id_sup,
                    id_produk: get_po[i].id_produk,
                    id_ware: get_ware[0].warehouse,
                    qty: get_po[i].qty,
                    m_price: get_po[i].m_price,
                    total_amount: get_po[i].total_amount,
                    tipe_order: get_po[i].tipe_order,
                    id_act: get_po[i].id_act,
                    users: get_po[i].users,
                    supplier: get_po[i].supplier,
                    // variation: get_size,
                    variation_ready: get_size_ready,
                });
            }

        }


        await connection.commit();
        await connection.release();

        return {
            data_po: datas,
            // count_data_po: get_size_histori,
            total: get_po.length
        };

    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const settlementStock = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [getmutation] = await connection.query(
            `SELECT * FROM tb_mutasistock WHERE tanggal='${tanggal_skrg}'`
        );
        // console.log(body.live_stok)
        // console.log(getmutation)

        if (getmutation > 0) {
            var hasil = 'SETTLE_ADA'
        } else {
            await connection.query(
                `INSERT INTO tb_settlement (tanggal, stok_akhir, created_at, updated_at)
            VALUES ('${tanggal_skrg}','${body.live_stok}','${tanggal}','${tanggal}')`
            );

            var hasil = 'SETTLE_SUKSES'
        }

        await connection.commit();
        await connection.release();
        return hasil;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getRetur = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

    const tanggal = body.tanggal;
    const myArray = tanggal.split(" to ");

    if (tanggal.length > 10) {
        var tanggal_start = myArray[0];
        var tanggal_end = myArray[1];
    } else {
        var tanggal_start = tanggal;
        var tanggal_end = tanggal;
    }

    try {
        await connection.beginTransaction();

        if (body.datechange === "dateinput") {
            if (body.query === "all") {
                if (body.store === "all") {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_retur.id DESC`
                    );
                } else if (body.store === "all_area") {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE tb_store.id_area='${body.area}' AND (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_retur.id DESC`
                    );
                } else {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE tb_retur.id_store='${body.store}' AND (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_retur.id DESC`
                    );
                }
            } else {
                if (body.store === "all") {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_retur.id_pesanan LIKE '%${body.query}%' OR tb_retur.id_produk LIKE '%${body.query}%' OR tb_retur.produk LIKE '%${body.query}%') ORDER BY tb_retur.id DESC`
                    );
                } else if (body.store === "all_area") {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_retur.id_pesanan LIKE '%${body.query}%' OR tb_retur.id_produk LIKE '%${body.query}%' OR tb_retur.produk LIKE '%${body.query}%') AND tb_store.id_area='${body.area}' ORDER BY tb_retur.id DESC`
                    );
                } else {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_retur.id_pesanan LIKE '%${body.query}%' OR tb_retur.id_produk LIKE '%${body.query}%' OR tb_retur.produk LIKE '%${body.query}%') AND tb_retur.id_store='${body.store}' ORDER BY tb_retur.id DESC`
                    );
                }
            }
        } else {
            if (body.query === "all") {
                if (body.store === "all") {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_retur.tanggal_retur BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_retur.id DESC`
                    );
                } else if (body.store === "all_area") {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE tb_store.id_area='${body.area}' AND (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_retur.tanggal_retur BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_retur.id DESC`
                    );
                } else {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE tb_retur.id_store='${body.store}' AND (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_retur.tanggal_retur BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_retur.id DESC`
                    );
                }
            } else {
                if (body.store === "all") {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_retur.id_pesanan LIKE '%${body.query}%' OR tb_retur.id_produk LIKE '%${body.query}%' OR tb_retur.produk LIKE '%${body.query}%') ORDER BY tb_retur.id DESC`
                    );
                } else if (body.store === "all_area") {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_retur.id_pesanan LIKE '%${body.query}%' OR tb_retur.id_produk LIKE '%${body.query}%' OR tb_retur.produk LIKE '%${body.query}%') AND tb_store.id_area='${body.area}' ORDER BY tb_retur.id DESC`
                    );
                } else {
                    var [getretur] = await connection.query(
                        `SELECT tb_retur.*,tb_store.*,tb_mutasistock.tanggal as tanggal_input FROM tb_retur LEFT JOIN tb_store ON tb_retur.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_retur.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_retur.id_store='${body.store}' AND (tb_retur.id_pesanan LIKE '%${body.query}%' OR tb_retur.id_produk LIKE '%${body.query}%' OR tb_retur.produk LIKE '%${body.query}%') ORDER BY tb_retur.id DESC`
                    );
                }
            }
        }
        console.log(getretur.length);


        await connection.commit();
        await connection.release();

        return getretur;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getRefund = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

    const tanggal = body.tanggal;
    const myArray = tanggal.split(" to ");
    if (tanggal.length > 10) {
        var tanggal_start = myArray[0];
        var tanggal_end = myArray[1];
    } else {
        var tanggal_start = tanggal;
        var tanggal_end = tanggal;
    }
    try {
        await connection.beginTransaction();

        if (body.datechange === "dateinput") {
            if (body.query === "all") {
                if (body.store === "all") {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_refund.id DESC`
                    );
                } else if (body.store === "all_area") {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE tb_store.id_area='${body.area}' AND (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_refund.id DESC`
                    );
                } else {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE tb_refund.id_store='${body.store}' AND (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_refund.id DESC`
                    );
                }
            } else {
                if (body.store === "all") {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_refund.id_pesanan LIKE '%${body.query}%' OR tb_refund.id_produk LIKE '%${body.query}%' OR tb_refund.produk LIKE '%${body.query}%') ORDER BY tb_refund.id DESC`
                    );
                } else if (body.store === "all_area") {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_refund.id_pesanan LIKE '%${body.query}%' OR tb_refund.id_produk LIKE '%${body.query}%' OR tb_refund.produk LIKE '%${body.query}%') AND tb_store.id_area='${body.area}' ORDER BY tb_refund.id DESC`
                    );
                } else {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_refund.id_pesanan LIKE '%${body.query}%' OR tb_refund.id_produk LIKE '%${body.query}%' OR tb_refund.produk LIKE '%${body.query}%') AND tb_refund.id_store='${body.store}' ORDER BY tb_refund.id DESC`
                    );
                }
            }
        } else {
            if (body.query === "all") {
                if (body.store === "all") {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_refund.tanggal_refund BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_refund.id DESC`
                    );
                } else if (body.store === "all_area") {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE tb_store.id_area='${body.area}' AND (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_refund.tanggal_refund BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_refund.id DESC`
                    );
                } else {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE tb_refund.id_store='${body.store}' AND (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND tb_refund.tanggal_refund BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_refund.id DESC`
                    );
                }
            } else {
                if (body.store === "all") {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_refund.id_pesanan LIKE '%${body.query}%' OR tb_refund.id_produk LIKE '%${body.query}%' OR tb_refund.produk LIKE '%${body.query}%') ORDER BY tb_refund.id DESC`
                    );
                } else if (body.store === "all_area") {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_refund.id_pesanan LIKE '%${body.query}%' OR tb_refund.id_produk LIKE '%${body.query}%' OR tb_refund.produk LIKE '%${body.query}%') AND tb_store.id_area='${body.area}' ORDER BY tb_refund.id DESC`
                    );
                } else {
                    var [getretur] = await connection.query(
                        `SELECT tb_refund.*,tb_store.store,tb_mutasistock.tanggal as tanggal_input FROM tb_refund LEFT JOIN tb_store ON tb_refund.id_store = tb_store.id_store LEFT JOIN tb_mutasistock ON tb_refund.id_pesanan = tb_mutasistock.id_pesanan WHERE (tb_mutasistock.mutasi='SALES ONLINE' OR tb_mutasistock.mutasi='SALES RETAIL') AND (tb_refund.id_pesanan LIKE '%${body.query}%' OR tb_refund.id_produk LIKE '%${body.query}%' OR tb_refund.produk LIKE '%${body.query}%') AND tb_refund.id_store='${body.store}' ORDER BY tb_refund.id DESC`
                    );
                }
            }
        }

        await connection.commit();
        await connection.release();

        return getretur;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getNamaware = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [data_warehouse] = await connection.query(
            `SELECT tb_warehouse.warehouse,tb_area.kota FROM tb_warehouse LEFT JOIN tb_area ON tb_warehouse.id_area = tb_area.id_area WHERE tb_warehouse.id_area='${body.area}' GROUP BY tb_warehouse.id_area`
        );
        await connection.commit();
        await connection.release();
        return data_warehouse;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const get_upprice = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        if (body.role === "SUPER-ADMIN" && body.role === "HEAD-AREA") {
            var [getstores] = await connection.query(
                `SELECT id_area FROM tb_store WHERE id_store='${body.id_store}'`
            );
            for (let x = 0; x < getstores.length; x++) {
                var [data_upprice] = await connection.query(
                    `SELECT m_price,g_price,r_price,n_price,id_area FROM tb_area WHERE id_area='${getstores[x].id_area}'`
                );
                var m_price = data_upprice[0].m_price;
                var g_price = data_upprice[0].g_price;
                var r_price = data_upprice[0].r_price;
                var n_price = data_upprice[0].n_price;
            }
        } else {
            var [getstores] = await connection.query(
                `SELECT id_area FROM tb_store WHERE id_store='${body.area}'`
            );
            for (let x = 0; x < getstores.length; x++) {
                var [data_upprice] = await connection.query(
                    `SELECT m_price,g_price,r_price,n_price,id_area FROM tb_area WHERE id_area='${getstores[x].id_area}'`
                );
                var m_price = data_upprice[0].m_price;
                var g_price = data_upprice[0].g_price;
                var r_price = data_upprice[0].r_price;
                var n_price = data_upprice[0].n_price;
            }
        }


        await connection.commit();
        await connection.release();

        return {
            m_price,
            g_price,
            r_price,
            n_price,
        };
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getHistoripotransfer = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [data_historypo] = await connection.query(
            `SELECT * FROM tb_purchaseorder WHERE tipe_order="TRANSFER" AND tipe_order != "SO_GUDANG" GROUP BY idpo ORDER BY id DESC LIMIT 1`
        );

        await connection.commit();
        await connection.release();

        return data_historypo;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getPotransfer = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    const tanggal = body.date;
    const myArray = tanggal.split(" to ");
    const tipepo = body.Filter_Tipe_po;
    const supplier = body.Filter_Supplier;
    const users = body.Filter_Tipe_user;
    const warehouse = body.Filter_Tipe_warehouse;

    if (tanggal.length > 10) {
        var tanggal_start = myArray[0];
        var tanggal_end = myArray[1];
    } else {
        var tanggal_start = tanggal;
        var tanggal_end = tanggal;
    }
    if (warehouse === "all") {

        if (body.query === "all" && users === "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tipe_order='TRANSFER IN' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN'  AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND qty > '0' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (body.query != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}'  AND tipe_order='TRANSFER IN' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY idpo`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (users != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tipe_order='TRANSFER IN' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN'  AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order != 'SO_GUDANG' AND tipe_order='TRANSFER IN' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (body.query != "all" && users != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tipe_order='TRANSFER IN' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY idpo`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }

    } else {
        if (body.query === "all" && users === "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' AND tipe_order='TRANSFER IN' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN'  AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND qty > '0' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}'`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (body.query != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}'  AND tipe_order='TRANSFER IN' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY idpo`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (users != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' AND tipe_order='TRANSFER IN' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN'  AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}'`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (body.query != "all" && users != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' AND tipe_order='TRANSFER IN' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='TRANSFER IN' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY idpo`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
    }

    const datas = [];

    try {
        await connection.beginTransaction();
        var total_qty = 0;
        var total_cost = 0;

        for (let index = 0; index < get_po.length; index++) {

            if (warehouse === "all") {
                var [get_detail] = await connection.query(
                    `SELECT tb_purchaseorder.*,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.users='${get_po[index].users}'  AND tb_purchaseorder.tipe_order != 'RELEASE' AND tb_purchaseorder.tipe_order='TRANSFER IN' AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                );
            } else {
                var [get_detail] = await connection.query(
                    `SELECT tb_purchaseorder.*,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.id_ware='${warehouse}'  AND tb_purchaseorder.tipe_order='TRANSFER IN' AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                );
            }


            const datas2 = [];

            for (let i = 0; i < get_detail.length; i++) {


                var [get_produk] = await connection.query(
                    `SELECT * FROM tb_produk WHERE id_produk='${get_detail[i].id_produk}'`
                );

                var [get_ware] = await connection.query(
                    `SELECT * FROM tb_warehouse WHERE id_ware='${get_detail[i].id_ware}'`
                );
                for (let qq = 0; qq < get_ware.length; qq++) {
                    var getsware = get_ware[qq].warehouse;
                }

                var [get_supplier_transfer] = await connection.query(
                    `SELECT tb_warehouse.warehouse,tb_purchaseorder.id_sup FROM tb_warehouse LEFT JOIN tb_purchaseorder ON tb_warehouse.id_ware = tb_purchaseorder.id_sup WHERE tb_purchaseorder.tipe_order='TRANSFER IN' AND tb_purchaseorder.id_sup='${get_detail[i].id_sup}'`
                );

                for (let zz = 0; zz < get_supplier_transfer.length; zz++) {
                    var supplier_transfer = get_supplier_transfer[zz].warehouse;
                }

                if (warehouse === "all") {

                    var [get_total] = await connection.query(
                        `SELECT SUM(total_amount) as hasil_amount,SUM(qty) as hasil_qty FROM tb_purchaseorder WHERE tanggal_receive='${get_detail[i].tanggal_receive}' AND users='${get_detail[i].users}' AND tipe_order='TRANSFER IN' GROUP BY tanggal_receive,users`
                    );
                } else {

                    var [get_total] = await connection.query(
                        `SELECT SUM(total_amount) as hasil_amount,SUM(qty) as hasil_qty FROM tb_purchaseorder WHERE tanggal_receive='${get_detail[i].tanggal_receive}' AND users='${get_detail[i].users}' AND id_ware='${warehouse}' AND tipe_order='TRANSFER IN' GROUP BY tanggal_receive,users`
                    );
                }

                if (get_detail[i].tipe_order === "TRANSFER IN") {

                    datas2.push({
                        id: get_detail[i].id,
                        idpo: get_detail[i].idpo,
                        tanggal_receive: get_detail[i].tanggal_receive,
                        id_sup: get_detail[i].id_sup,
                        id_produk: get_detail[i].id_produk,
                        id_ware: get_detail[i].id_ware,
                        qty: get_detail[i].qty,
                        m_price: get_detail[i].m_price,
                        total_amount: get_detail[i].total_amount,
                        tipe_order: get_detail[i].tipe_order,
                        id_act: get_detail[i].id_act,
                        produk: get_produk[0].produk,
                        gudang: getsware,
                        supplier: supplier_transfer,
                    });
                }
                total_qty = 0 + parseInt(get_total[0].hasil_qty);
                total_cost = 0 + parseInt(get_total[0].hasil_amount);
            }



            datas.push({
                tanggal: get_po[index].tanggal_receive,
                id_so: get_po[index].idpo,
                users: get_po[index].users,
                total_qty: total_qty,
                total_cost: total_cost,
                detail: datas2,
            });
            var created_at = get_po[index].tanggal_receive;
        }
        console.log(datas)
        await connection.commit();
        await connection.release();
        return {
            datas,
            total_po: total_po.length ? total_po.length : 0,
            total_qty: hasil_totalqty ? hasil_totalqty : 0,
            capital_amount: hasil_amount ? hasil_amount : 0,
            created_at: created_at,
        };

    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getuserpo = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        const [get_user] = await connection.query(
            `SELECT users FROM tb_purchaseorder GROUP BY users ORDER BY users ASC`
        );



        await connection.commit();
        await connection.release();

        return get_user;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getusertransfer = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        if (body.user_role === "SUPER-ADMIN") {
            var [get_user] = await connection.query(
                `SELECT users FROM tb_purchaseorder GROUP BY users ORDER BY users ASC`
            );
        } else {
            var [get_user] = await connection.query(
                `SELECT users FROM tb_purchaseorder WHERE users='${body.user_login}' GROUP BY users ORDER BY users ASC`
            );
        }

        await connection.commit();
        await connection.release();

        return get_user;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getstoredisplay = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        if (body.role === "SUPER-ADMIN") {
            var [get_store] = await connection.query(
                `SELECT * FROM tb_store ORDER BY id ASC`
            );
        } else if (body.role === "HEAD-AREA") {
            var [get_store] = await connection.query(
                `SELECT * FROM tb_store WHERE id_area='${body.store}' ORDER BY id ASC `
            );
        } else {
            var [get_store] = await connection.query(
                `SELECT * FROM tb_store WHERE id_store='${body.store}' ORDER BY id ASC`
            );
        }

        await connection.commit();
        await connection.release();

        return get_store;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const addDisplay = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        if (body.store === "all") {
            var [cek_id_store] = await connection.query(
                `SELECT * FROM tb_store ORDER BY id ASC`
            );

            var getidstore = cek_id_store[0].id_store;
        } else {
            var getidstore = body.store;
        }

        const [get_produk] = await connection.query(
            `SELECT * FROM tb_produk WHERE id_produk='${body.select_id_produk}' AND id_ware='${body.select_warehouse}'`
        );

        for (let x = 0; x < get_produk.length; x++) {
            await connection.query(
                `INSERT INTO displays (tanggal, id_produk, id_ware, id_store, brand, produk, size, qty, users, created_at, updated_at) VALUES 
                ('${tanggal_skrg}','${get_produk[x].id_produk}','${get_produk[x].id_ware}','${getidstore}','${get_produk[x].id_brand}','${get_produk[x].produk}','${body.select_size}','1','${body.user}','${tanggal}','${tanggal}')`
            );
        }

        await connection.commit();
        await connection.release();

    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const deleteDisplay = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        await connection.query(
            `DELETE FROM displays WHERE id_produk='${body.id}' AND id_ware='${body.idware}'`
        );

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const cariwares = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    const datas = [];
    try {
        await connection.beginTransaction();

        const [cariwares] = await connection.query(
            `SELECT id_ware FROM tb_store WHERE id_store='${body.id_store}'`
        );
        for (let index = 0; index < cariwares.length; index++) {
            var [cariwares_nama] = await connection.query(
                `SELECT id_ware,warehouse,address FROM tb_warehouse WHERE id_ware='${cariwares[index].id_ware}'`
            );

            var [warehouselist] = await connection.query(
                `SELECT id_ware,warehouse,address FROM tb_warehouse`
            );

            var cariwares2 = cariwares_nama[index].id_ware;
            var nama_warehouses = cariwares_nama[index].warehouse;
            var address = cariwares_nama[index].address;
            var warehouselist = warehouselist;
        }

        datas.push({
            cariwares: cariwares2,
            nama_warehouses: nama_warehouses,
            address: address,
            warehouselist: warehouselist,


        });

        await connection.commit();
        await connection.release();
        return datas
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getwarehousetransfer = async (body) => {
    const connection = await dbPool.getConnection();

    const tanggal = body.date;
    const users = body.user_login;
    const myArray = tanggal.split(" to ");

    if (tanggal.length > 10) {
        var tanggal_start = myArray[0];
        var tanggal_end = myArray[1];
    } else {
        var tanggal_start = tanggal;
        var tanggal_end = tanggal;
    }
    try {
        await connection.beginTransaction();

        if (body.Filter_Tipe_user === 'all') {
            var [cariwares] = await connection.query(
                `SELECT tb_purchaseorder.id_ware,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.id_ware`
            );
        } else {
            var [cariwares] = await connection.query(
                `SELECT tb_purchaseorder.id_ware,tb_warehouse.warehouse FROM tb_purchaseorder LEFT JOIN tb_warehouse ON tb_purchaseorder.id_ware = tb_warehouse.id_ware WHERE tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND users='${users}' GROUP BY tb_purchaseorder.id_ware`
            );
        }

        await connection.commit();
        await connection.release();

        return cariwares
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const cariwaresretur = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    const datas = [];
    try {
        await connection.beginTransaction();

        const [cariwares] = await connection.query(
            `SELECT id_ware,warehouse FROM tb_warehouse WHERE id_ware='${body.id_ware}'`
        );

        await connection.commit();
        await connection.release();
        return cariwares
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getusersales = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    try {
        await connection.beginTransaction();

        if (body.user_role === "SUPER-ADMIN" || body.user_role === "HEAD-AREA") {
            var [get_user] = await connection.query(
                `SELECT name as users FROM tb_karyawan GROUP BY name ORDER BY name ASC`
            );
        } else {
            var [get_user] = await connection.query(
                `SELECT name as users FROM tb_karyawan WHERE name='${body.user_login}' GROUP BY name ORDER BY name ASC`
            );
        }

        await connection.commit();
        await connection.release();

        return get_user;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getpodefect = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");
    const tanggal = body.date;
    const myArray = tanggal.split(" to ");
    const tipepo = body.Filter_Tipe_po;
    const supplier = body.Filter_Supplier;
    const users = body.Filter_Tipe_user;
    const warehouse = body.Filter_Tipe_warehouse;

    if (tanggal.length > 10) {
        var tanggal_start = myArray[0];
        var tanggal_end = myArray[1];
    } else {
        var tanggal_start = tanggal;
        var tanggal_end = tanggal;
    }
    if (warehouse === "all") {

        if (body.query === "all" && users === "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tipe_order != 'RELEASE' AND tipe_order != 'RESTOCK' AND tipe_order != 'SO_GUDANG' AND tipe_order != 'TRANSFER OUT' AND tipe_order != 'DEFECT OUT' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='DEFECT IN'  AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' OR tipe_order='DEFECT OUT' AND qty > '0' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (body.query != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}'  AND tipe_order != 'RELEASE' AND tipe_order != 'RESTOCK' AND tipe_order != 'SO_GUDANG' AND tipe_order != 'TRANSFER OUT' AND tipe_order != 'DEFECT OUT' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' OR tipe_order='DEFECT OUT' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY idpo`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (users != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tipe_order != 'RELEASE' AND tipe_order != 'RESTOCK' AND tipe_order != 'SO_GUDANG' AND tipe_order != 'TRANSFER OUT' AND tipe_order != 'DEFECT OUT' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='DEFECT IN'  AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order != 'SO_GUDANG' AND tipe_order='DEFECT IN' OR tipe_order='DEFECT OUT' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}'`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (body.query != "all" && users != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND tipe_order != 'RELEASE' AND tipe_order != 'RESTOCK' AND tipe_order != 'SO_GUDANG' AND tipe_order != 'TRANSFER OUT' AND tipe_order != 'DEFECT OUT' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tipe_order='DEFECT OUT' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY idpo`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }

    } else {
        if (body.query === "all" && users === "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' AND tipe_order != 'RELEASE' AND tipe_order != 'RESTOCK' AND tipe_order != 'SO_GUDANG' AND tipe_order != 'TRANSFER OUT' AND tipe_order != 'DEFECT OUT' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='DEFECT IN'  AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' OR tipe_order='DEFECT OUT' AND qty > '0' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}'`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (body.query != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}'  AND tipe_order != 'RELEASE' AND tipe_order != 'RESTOCK' AND tipe_order != 'SO_GUDANG' AND tipe_order != 'TRANSFER OUT' AND tipe_order != 'DEFECT OUT' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' OR tipe_order='DEFECT OUT' AND tanggal_receive='${body.query}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY idpo`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (users != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' AND tipe_order != 'RELEASE' AND tipe_order != 'RESTOCK' AND tipe_order != 'SO_GUDANG' AND tipe_order != 'TRANSFER OUT' AND tipe_order != 'DEFECT OUT' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='DEFECT IN'  AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order != 'SO_GUDANG' AND tipe_order='DEFECT IN' OR tipe_order='DEFECT OUT' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}'`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
        if (body.query != "all" && users != "all") {
            var [get_po] = await connection.query(
                `SELECT * FROM tb_purchaseorder WHERE tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' AND tipe_order != 'RELEASE' AND tipe_order != 'RESTOCK' AND tipe_order != 'SO_GUDANG' AND tipe_order != 'TRANSFER OUT' AND tipe_order != 'DEFECT OUT' GROUP BY tanggal_receive,users ORDER BY id DESC`
            );
            var [total_po] = await connection.query(
                `SELECT COUNT(idpo) as totalpo FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive,users`
            );
            var [total_qty] = await connection.query(
                `SELECT SUM(qty) as totalqtys FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY tanggal_receive`
            );
            for (let po = 0; po < total_qty.length; po++) {
                if (total_qty[po].totalqtys === null || total_qty[po].totalqtys === "") {
                    var hasil_totalqty = "0";
                } else {
                    var hasil_totalqty = total_qty[po].totalqtys;
                }
            }
            var [capital_amount] = await connection.query(
                `SELECT IFNULL(SUM(total_amount), 0) AS amount FROM tb_purchaseorder WHERE tipe_order='DEFECT IN' AND tipe_order='DEFECT OUT' AND tanggal_receive='${body.query}' AND users='${users}' AND tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' AND id_ware='${warehouse}' GROUP BY idpo`
            );
            for (let x = 0; x < capital_amount.length; x++) {
                if (capital_amount[0].amount === null || capital_amount[0].amount === "") {
                    var hasil_amount = "0";
                } else {
                    var hasil_amount = capital_amount[0].amount;
                }
            }
        }
    }

    const datas = [];

    try {
        await connection.beginTransaction();
        var total_qty = 0;
        var total_cost = 0;

        for (let index = 0; index < get_po.length; index++) {

            if (warehouse === "all") {
                var [get_detail] = await connection.query(
                    `SELECT tb_purchaseorder.*,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.users='${get_po[index].users}'  AND tb_purchaseorder.tipe_order != 'RELEASE' AND tb_purchaseorder.tipe_order != 'RESTOCK' AND tb_purchaseorder.tipe_order != 'SO_GUDANG' AND tb_purchaseorder.tipe_order != 'TRANSFER OUT' AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                );
            } else {
                var [get_detail] = await connection.query(
                    `SELECT tb_purchaseorder.*,tb_produk.produk FROM tb_purchaseorder LEFT JOIN tb_produk ON tb_purchaseorder.id_produk = tb_produk.id_produk WHERE tb_purchaseorder.tanggal_receive='${get_po[index].tanggal_receive}' AND tb_purchaseorder.users='${get_po[index].users}' AND tb_purchaseorder.id_ware='${warehouse}'  AND tb_purchaseorder.tipe_order != 'RELEASE' AND tb_purchaseorder.tipe_order != 'RESTOCK' AND tb_purchaseorder.tipe_order != 'SO_GUDANG' AND tb_purchaseorder.tipe_order != 'TRANSFER OUT' AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.tanggal_receive BETWEEN '${tanggal_start}' AND '${tanggal_end}' GROUP BY tb_purchaseorder.tanggal_receive,tb_purchaseorder.users,tb_purchaseorder.tipe_order,tb_purchaseorder.idpo ORDER BY tb_purchaseorder.id DESC`
                );
            }

            const datas2 = [];

            for (let i = 0; i < get_detail.length; i++) {


                var [get_produk] = await connection.query(
                    `SELECT * FROM tb_produk WHERE id_produk='${get_detail[i].id_produk}'`
                );

                var [get_ware] = await connection.query(
                    `SELECT * FROM tb_warehouse WHERE id_ware='${get_detail[i].id_ware}'`
                );
                for (let qq = 0; qq < get_ware.length; qq++) {
                    var getsware = get_ware[qq].warehouse;
                }

                var [get_supplier_transfer] = await connection.query(
                    `SELECT tb_warehouse.warehouse,tb_purchaseorder.id_sup FROM tb_warehouse LEFT JOIN tb_purchaseorder ON tb_warehouse.id_ware = tb_purchaseorder.id_sup WHERE tb_purchaseorder.tipe_order != 'SO_GUDANG' AND tb_purchaseorder.tipe_order != 'RELEASE' AND tb_purchaseorder.tipe_order != 'RESTOCK' AND tb_purchaseorder.tipe_order != 'TRANSFER OUT' AND tb_purchaseorder.tipe_order != 'DEFECT OUT' AND tb_purchaseorder.id_sup='${get_detail[i].id_sup}'`
                );

                for (let zz = 0; zz < get_supplier_transfer.length; zz++) {
                    var supplier_transfer = get_supplier_transfer[zz].warehouse;
                }

                if (warehouse === "all") {

                    var [get_total] = await connection.query(
                        `SELECT SUM(total_amount) as hasil_amount,SUM(qty) as hasil_qty FROM tb_purchaseorder WHERE tanggal_receive='${get_detail[i].tanggal_receive}' AND users='${get_detail[i].users}' AND tipe_order != 'SO_GUDANG' AND tipe_order != 'RELEASE' AND tipe_order != 'RESTOCK' AND tipe_order != 'TRANSFER OUT' AND tipe_order != 'DEFECT OUT' GROUP BY tanggal_receive,users`
                    );
                } else {

                    var [get_total] = await connection.query(
                        `SELECT SUM(total_amount) as hasil_amount,SUM(qty) as hasil_qty FROM tb_purchaseorder WHERE tanggal_receive='${get_detail[i].tanggal_receive}' AND users='${get_detail[i].users}' AND id_ware='${warehouse}' AND tipe_order != 'SO_GUDANG' AND tipe_order != 'RELEASE' AND tipe_order != 'RESTOCK' AND tipe_order != 'TRANSFER OUT' AND tipe_order != 'DEFECT OUT' GROUP BY tanggal_receive,users`
                    );
                }

                if (get_detail[i].tipe_order === "DEFECT IN") {

                    datas2.push({
                        id: get_detail[i].id,
                        idpo: get_detail[i].idpo,
                        tanggal_receive: get_detail[i].tanggal_receive,
                        id_sup: get_detail[i].id_sup,
                        id_produk: get_detail[i].id_produk,
                        id_ware: get_detail[i].id_ware,
                        qty: get_detail[i].qty,
                        m_price: get_detail[i].m_price,
                        total_amount: get_detail[i].total_amount,
                        tipe_order: get_detail[i].tipe_order,
                        id_act: get_detail[i].id_act,
                        produk: get_produk[0].produk,
                        gudang: getsware,
                        supplier: supplier_transfer,
                    });
                }
                total_qty = 0 + parseInt(get_total[0].hasil_qty);
                total_cost = 0 + parseInt(get_total[0].hasil_amount);
            }



            datas.push({
                tanggal: get_po[index].tanggal_receive,
                id_so: get_po[index].idpo,
                users: get_po[index].users,
                total_qty: total_qty,
                total_cost: total_cost,
                detail: datas2,
            });

        }
        console.log(datas)
        await connection.commit();
        await connection.release();
        return {
            datas,
            total_po: total_po.length ? total_po.length : 0,
            total_qty: hasil_totalqty ? hasil_totalqty : 0,
            capital_amount: hasil_amount ? hasil_amount : 0,
        };

    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const getdeleteorder = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

    const tanggal = body.tanggal;
    const myArray = tanggal.split(" to ");

    if (tanggal.length > 10) {
        var tanggal_start = myArray[0];
        var tanggal_end = myArray[1];
    } else {
        var tanggal_start = tanggal;
        var tanggal_end = tanggal;
    }

    try {
        await connection.beginTransaction();

        if (body.query === "all") {
            if (body.store === "all") {
                var [getdeleteorder] = await connection.query(
                    `SELECT tb_mutasistock.*,tb_store.store,tb_warehouse.warehouse FROM tb_mutasistock LEFT JOIN tb_store ON tb_mutasistock.id_store = tb_store.id_store LEFT JOIN tb_warehouse ON tb_mutasistock.id_ware = tb_warehouse.id_ware WHERE tb_mutasistock.mutasi='DELETE_ORDER' AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_mutasistock.id DESC`
                );
            } else if (body.store === "all_area") {
                var [getdeleteorder] = await connection.query(
                    `SELECT tb_mutasistock.*,tb_store.store,tb_warehouse.warehouse FROM tb_mutasistock LEFT JOIN tb_store ON tb_mutasistock.id_store = tb_store.id_store LEFT JOIN tb_warehouse ON tb_mutasistock.id_ware = tb_warehouse.id_ware WHERE tb_store.id_area='${body.area}' AND tb_mutasistock.mutasi='DELETE_ORDER' AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_mutasistock.id DESC`
                );
            } else {
                var [getdeleteorder] = await connection.query(
                    `SELECT tb_mutasistock.*,tb_store.store,tb_warehouse.warehouse FROM tb_mutasistock LEFT JOIN tb_store ON tb_mutasistock.id_store = tb_store.id_store LEFT JOIN tb_warehouse ON tb_mutasistock.id_ware = tb_warehouse.id_ware WHERE tb_mutasistock.mutasi='DELETE_ORDER' AND tb_store.id_store='${body.store}' AND tb_mutasistock.tanggal BETWEEN '${tanggal_start}' AND '${tanggal_end}' ORDER BY tb_mutasistock.id DESC`
                );
            }
        } else {
            if (body.store === "all") {
                var [getdeleteorder] = await connection.query(
                    `SELECT tb_mutasistock.*,tb_store.store,tb_warehouse.warehouse FROM tb_mutasistock LEFT JOIN tb_store ON tb_mutasistock.id_store = tb_store.id_store LEFT JOIN tb_warehouse ON tb_mutasistock.id_ware = tb_warehouse.id_ware WHERE (tb_mutasistock.id_pesanan LIKE '%${body.query}%' OR tb_mutasistock.id_produk LIKE '%${body.query}%' OR tb_mutasistock.produk LIKE '%${body.query}%') AND tb_mutasistock.mutasi='DELETE_ORDER' ORDER BY tb_mutasistock.id DESC`
                );
            } else if (body.store === "all_area") {
                var [getdeleteorder] = await connection.query(
                    `SELECT tb_mutasistock.*,tb_store.store,tb_warehouse.warehouse FROM tb_mutasistock LEFT JOIN tb_store ON tb_mutasistock.id_store = tb_store.id_store LEFT JOIN tb_warehouse ON tb_mutasistock.id_ware = tb_warehouse.id_ware WHERE (tb_mutasistock.id_pesanan LIKE '%${body.query}%' OR tb_mutasistock.id_produk LIKE '%${body.query}%' OR tb_mutasistock.produk LIKE '%${body.query}%') AND tb_store.id_area='${body.area}' AND tb_mutasistock.mutasi='DELETE_ORDER' ORDER BY tb_mutasistock.id DESC`
                );
            } else {
                var [getdeleteorder] = await connection.query(
                    `SELECT tb_mutasistock.*,tb_store.store,tb_warehouse.warehouse FROM tb_mutasistock LEFT JOIN tb_store ON tb_mutasistock.id_store = tb_store.id_store LEFT JOIN tb_warehouse ON tb_mutasistock.id_ware = tb_warehouse.id_ware WHERE (tb_mutasistock.id_pesanan LIKE '%${body.query}%' OR tb_mutasistock.id_produk LIKE '%${body.query}%' OR tb_mutasistock.produk LIKE '%${body.query}%') AND tb_mutasistock.mutasi='DELETE_ORDER' AND tb_store.id_store='${body.store}' ORDER BY tb_mutasistock.id DESC`
                );
            }
        }

        await connection.commit();
        await connection.release();

        return getdeleteorder;
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const editstockopname = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

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
        var variasi = body.data.variasirestock;
        var total_qty = 0;

        const [produk_baru] = await connection.query(
            `SELECT produk FROM tb_produk WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}'`
        );

        const [getwarehouse] = await connection.query(
            `SELECT warehouse FROM tb_warehouse WHERE id_ware='${body.id_ware}'`
        );

        const [getpo] = await connection.query(
            `SELECT m_price FROM tb_purchaseorder WHERE id_act='${body.id_act}'`
        );

        for (let index = 0; index < variasi.length; index++) {
            var [getdatavariation_total] = await connection.query(
                `SELECT SUM(qty) AS totalqty FROM tb_variation WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}' AND size='${variasi[index].size}' AND qty != 0 ORDER BY id ASC`
            );

            var [getdatavariation] = await connection.query(
                `SELECT id_produk,id_ware,idpo,size,qty,id_area FROM tb_variation WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}' AND size='${variasi[index].size}' AND qty != 0 ORDER BY id ASC`
            );

            var selisih = parseInt(variasi[index].stok_baru) - parseInt(variasi[index].stok_lama);
            if (variasi[index].stok_baru != variasi[index].stok_lama) {
                for (let x = 0; x < getdatavariation.length; x++) {
                    console.log("selisih=", selisih);

                    if (x === (getdatavariation.length - 1)) {
                        if (selisih < 0) {
                            await connection.query(
                                `UPDATE tb_variation SET qty='${parseInt(getdatavariation_total[0].totalqty) + parseInt(selisih)}',updated_at='${tanggal}' WHERE id_produk='${getdatavariation[x].id_produk}' AND id_ware='${getdatavariation[x].id_ware}' AND size='${getdatavariation[x].size}' AND idpo='${getdatavariation[x].idpo}'`
                            );
                        } else {
                            await connection.query(
                                `UPDATE tb_variation SET qty='${parseInt(getdatavariation_total[0].totalqty) + parseInt(selisih)}',updated_at='${tanggal}' WHERE id_produk='${getdatavariation[x].id_produk}' AND id_ware='${getdatavariation[x].id_ware}' AND size='${getdatavariation[x].size}' AND idpo='${getdatavariation[x].idpo}'`
                            );
                        }
                    } else {
                        await connection.query(
                            `UPDATE tb_variation SET qty='0',updated_at='${tanggal}' WHERE id_produk='${getdatavariation[x].id_produk}' AND id_ware='${getdatavariation[x].id_ware}' AND size='${getdatavariation[x].size}' AND idpo='${getdatavariation[x].idpo}'`
                        );
                    }

                    if (x === 0) {
                        await connection.query(
                            `UPDATE tb_variationorder SET qty='${variasi[index].stok_baru}',updated_at='${tanggal}' WHERE id_act='${body.id_act}' AND size='${variasi[index].size}' AND id_ware='${getdatavariation[x].id_ware}'`
                        );

                        // Update Variation Old QTY
                        await connection.query(
                            `INSERT INTO tb_mutasistock
                            (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                            VALUES ('${id_mutasi}','${tanggal_skrg}','EDIT STOCK OPNAME','${getdatavariation[x].id_ware}','-','${getdatavariation[x].id_produk}','${produk_baru[0].produk}','${body.idpo}','${variasi[index].size}','${variasi[index].stok_baru}','Barang Gudang','${getwarehouse[0].warehouse}','EDIT STOCK OPNAME','${body.users}','${tanggal}','${tanggal}')`
                        );
                        total_qty = total_qty + parseInt(variasi[index].stok_baru);
                    }
                }
            }
        }

        await connection.query(
            `UPDATE tb_purchaseorder SET total_amount='${parseInt(getpo[0].m_price) * parseInt(total_qty)}',qty='${total_qty}',m_price='${getpo[0].m_price}',updated_at='${tanggal}' WHERE id_produk='${body.idproduk}' AND id_act='${body.id_act}' AND id_ware='${body.id_ware}'`
        );

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const deleteitemso = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");


    const [cek_po] = await connection.query(
        `SELECT MAX(idpo) as idpo FROM tb_purchaseorder`
    );
    if (!cek_po[0].idpo) {
        var idpo = "10001"; // Jika belum ada data, mulai dari 0001
    } else {
        let lastNumber = parseInt(cek_po[0].idpo); // Ambil nomor terakhir sebagai angka
        lastNumber += 1; // Tambah 1

        const numLength = cek_po[0].idpo.length; // Panjang nomor sebelumnya
        var idpo = String(lastNumber).padStart(numLength, "0"); // Jaga format panjang angka
    }

    const [cek_act] = await connection.query(
        `SELECT MAX(CAST(id_act AS UNSIGNED)) as id_act FROM tb_purchaseorder`
    );
    if (cek_act[0].id_act === null) {
        var id_act = "0001";
    } else {
        const get_last2 = cek_act[0].id_act;
        const data_2 = get_last2.toString().slice(-4);
        const hasil = parseInt(data_2) + 1;
        var id_act = String(hasil).padStart(4, "0");
    }

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

        var [getpo] = await connection.query(
            `SELECT tb_variationorder.*,tb_purchaseorder.id_sup,tb_purchaseorder.qty AS totalqty,tb_purchaseorder.m_price FROM tb_variationorder LEFT JOIN tb_purchaseorder ON tb_variationorder.id_act = tb_purchaseorder.id_act WHERE tb_variationorder.id_act='${body.id_act}'  ORDER BY tb_variationorder.id ASC`
        );

        var [getpo_order] = await connection.query(
            `SELECT tb_variationorder.qty,tb_variationorder.id_sup,tb_variationorder.idpo FROM tb_variationorder LEFT JOIN tb_purchaseorder ON tb_variationorder.id_act = tb_purchaseorder.id_act WHERE tb_variationorder.id_act='${body.id_act}' ORDER BY tb_variationorder.id ASC`
        );

        var [get_var_sum] = await connection.query(
            `SELECT SUM(qty) AS totalqty FROM tb_variation WHERE id_produk='${getpo[0].id_produk}' AND id_ware='${getpo[0].id_ware}' AND size='${getpo[0].size}' AND qty > '0' ORDER BY idpo ASC`
        );

        const [getproducts] = await connection.query(
            `SELECT produk FROM tb_produk WHERE id_produk='${getpo[0].id_produk}'`
        );

        const [getwarehouse] = await connection.query(
            `SELECT warehouse FROM tb_warehouse WHERE id_ware='${getpo[0].id_ware}'`
        );

        var totalqty = 0;
        for (let index = 0; index < getpo.length; index++) {
            totalqty = parseInt(totalqty) + parseInt(getpo_order[index].qty);

            if (getpo[index].qty < 0) {

                await connection.query(
                    `UPDATE tb_variation SET qty='${parseInt(get_var_sum[0].totalqty ? get_var_sum[0].totalqty : 0) - parseInt(getpo_order[index].qty)}',id_ware='${getpo_order[index].id_sup}',idpo='${getpo_order[index].idpo}',updated_at='${tanggal}' WHERE id_act='${body.id_act}' AND size='${getpo[index].size}'`
                );

                await connection.query(
                    `UPDATE tb_variationorder SET qty='0',tipe_order='CANCEL SO',updated_at='${tanggal}' WHERE id_act='${body.id_act}'`
                );
            } else {

                await connection.query(
                    `UPDATE tb_variation SET qty='${parseInt(get_var_sum[0].totalqty ? get_var_sum[0].totalqty : 0) - parseInt(getpo_order[index].qty)}',idpo='${getpo_order[index].idpo}',updated_at='${tanggal}' WHERE id_act='${body.id_act}' AND size='${getpo[index].size}'`
                );

                await connection.query(
                    `UPDATE tb_variationorder SET qty='0',tipe_order='CANCEL SO',updated_at='${tanggal}' WHERE id_act='${body.id_act}'`
                );
            }
            // // Update Variation Old QTY
            await connection.query(
                `INSERT INTO tb_mutasistock
            (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
            VALUES ('${id_mutasi}','${tanggal_skrg}','CANCEL SO','${getpo[index].id_sup}','-','${getpo[index].id_produk}','${getproducts[0].produk}','${getpo[index].idpo}','${getpo[index].size}','${getpo[index].qty}','Barang Gudang','${getwarehouse[0].warehouse}','CANCEL SO','${body.users}','${tanggal}','${tanggal}')`
            );
        }
        await connection.query(
            `UPDATE tb_purchaseorder SET qty='${totalqty}',m_price='${getpo[0].m_price}',total_amount='0',tipe_order='CANCEL SO',updated_at='${tanggal}' WHERE id_act='${body.id_act}'`
        );

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const edittransfer = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

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
        var variasi = body.data.variasirestock;
        var total_qty = 0;

        const [produk_baru] = await connection.query(
            `SELECT produk FROM tb_produk WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_ware}'`
        );

        const [getwarehouse] = await connection.query(
            `SELECT warehouse FROM tb_warehouse WHERE id_ware='${body.id_sup}'`
        );

        const [getpo] = await connection.query(
            `SELECT m_price FROM tb_purchaseorder WHERE id_act='${body.id_act}'`
        );

        for (let index = 0; index < variasi.length; index++) {
            var [getdatavariation_total] = await connection.query(
                `SELECT SUM(qty) AS totalqty FROM tb_variation WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_sup}' AND size='${variasi[index].size}' AND qty != 0 ORDER BY id ASC`
            );

            var [getdatavariation] = await connection.query(
                `SELECT id_produk,id_ware,idpo,size,qty,id_area FROM tb_variation WHERE id_produk='${body.idproduk}' AND id_ware='${body.id_sup}' AND size='${variasi[index].size}' AND qty != 0 ORDER BY id ASC`
            );

            var selisih = parseInt(variasi[index].stok_lama) - parseInt(variasi[index].stok_baru);

            if (variasi[index].stok_baru != variasi[index].stok_lama) {

                for (let x = 0; x < getdatavariation.length; x++) {
                    if (x === (getdatavariation.length - 1)) {
                        if (selisih < 0) {
                            await connection.query(
                                `UPDATE tb_variation SET qty='${parseInt(getdatavariation_total[0].totalqty) + parseInt(selisih)}',updated_at='${tanggal}' WHERE id_produk='${getdatavariation[x].id_produk}' AND id_ware='${getdatavariation[x].id_ware}' AND size='${getdatavariation[x].size}' AND idpo='${getdatavariation[x].idpo}'`
                            );
                        } else {
                            await connection.query(
                                `UPDATE tb_variation SET qty='${parseInt(getdatavariation_total[0].totalqty) + parseInt(selisih)}',updated_at='${tanggal}' WHERE id_produk='${getdatavariation[x].id_produk}' AND id_ware='${getdatavariation[x].id_ware}' AND size='${getdatavariation[x].size}' AND idpo='${getdatavariation[x].idpo}'`
                            );
                        }
                    } else {
                        await connection.query(
                            `UPDATE tb_variation SET qty='0',updated_at='${tanggal}' WHERE id_produk='${getdatavariation[x].id_produk}' AND id_ware='${getdatavariation[x].id_ware}' AND size='${getdatavariation[x].size}'`
                        );
                    }
                    await connection.query(
                        `UPDATE tb_variation SET qty='${variasi[index].stok_baru}',updated_at='${tanggal}' WHERE id_act='${body.id_act}' AND id_ware='${body.id_ware}' AND size='${getdatavariation[x].size}'`
                    );

                    if (x === 0) {
                        await connection.query(
                            `UPDATE tb_variationorder SET qty='${variasi[index].stok_baru}',updated_at='${tanggal}' WHERE id_act='${body.id_act}' AND size='${variasi[index].size}' AND id_ware='${body.id_ware}'`
                        );
                        // Update Variation Old QTY
                        await connection.query(
                            `INSERT INTO tb_mutasistock
                            (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                            VALUES ('${id_mutasi}','${tanggal_skrg}','EDIT TRANSFER','${body.id_ware}','-','${getdatavariation[x].id_produk}','${produk_baru[0].produk}','${getdatavariation[x].idpo}','${variasi[index].size}','${variasi[index].stok_baru}','Barang Gudang','${getwarehouse[0].warehouse}','EDIT TRANSFER','${body.users}','${tanggal}','${tanggal}')`
                        );
                        total_qty = parseInt(total_qty) + parseInt(variasi[index].stok_baru);
                    }
                }
            }
        }

        await connection.query(
            `UPDATE tb_purchaseorder SET total_amount='${parseInt(body.m_price) * parseInt(total_qty)}',qty='${total_qty}',m_price='${body.m_price}',updated_at='${tanggal}' WHERE id_act='${body.id_act}'`
        );

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

const deleteitempo = async (body) => {
    const connection = await dbPool.getConnection();
    const tanggal = date.format(new Date(), "YYYY/MM/DD HH:mm:ss");
    const tanggal_skrg = date.format(new Date(), "YYYY-MM-DD");
    const tahun = date.format(new Date(), "YY");

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

        const [getpo] = await connection.query(
            `SELECT * FROM tb_variationorder WHERE id_act='${body.id_act}' AND qty != 0`
        );

        const [produk_baru] = await connection.query(
            `SELECT produk FROM tb_produk WHERE id_produk='${getpo[0].id_produk}' AND id_ware='${getpo[0].id_ware}'`
        );

        const [datapo] = await connection.query(
            `SELECT m_price,id_sup,idpo FROM tb_purchaseorder WHERE id_act='${body.id_act}'`
        );

        const [getsupplier] = await connection.query(
            `SELECT supplier FROM tb_supplier WHERE id_sup='${getpo[0].id_sup}'`
        );

        for (let index = 0; index < getpo.length; index++) {
            var stokawal = getpo[index].qty;
            var [getdatavariation_total] = await connection.query(
                `SELECT SUM(qty) AS totalqty FROM tb_variation WHERE id_produk='${getpo[index].id_produk}' AND id_ware='${getpo[index].id_ware}' AND size='${getpo[index].size}' AND qty != 0 ORDER BY id ASC`
            );
            var stokakhir = parseInt(getdatavariation_total[0].totalqty) - parseInt(stokawal)

            var [data_variasi] = await connection.query(
                `SELECT id_act,size,id_produk,id_ware FROM tb_variation WHERE id_produk='${getpo[index].id_produk}' AND id_ware='${getpo[index].id_ware}' AND size='${getpo[index].size}' AND qty != 0  ORDER BY id ASC`
            );

            var [cekidact] = await connection.query(
                `SELECT id_act FROM tb_variationorder WHERE id_produk='${getpo[index].id_produk}' AND id_ware='${getpo[index].id_ware}' AND size='${getpo[index].size}' AND qty != 0 AND id_act != '${body.id_act}' AND (tipe_order='RELEASE' OR tipe_order='RESTOCK') GROUP BY id_act ORDER BY id DESC`
            );

            for (let xx = 0; xx < data_variasi.length; xx++) {
                if (xx === (data_variasi.length - 1)) {
                    await connection.query(
                        `UPDATE tb_variation SET qty='${stokakhir}',updated_at='${tanggal}' WHERE size='${data_variasi[xx].size}' AND id_act='${cekidact[0].id_act}'`
                    );
                } else {
                    await connection.query(
                        `UPDATE tb_variation SET qty='0',updated_at='${tanggal}' WHERE id_produk='${data_variasi[xx].id_produk}' AND id_ware='${data_variasi[xx].id_ware}' AND size='${data_variasi[xx].size}'`
                    );
                }

                await connection.query(
                    `UPDATE tb_variationorder SET qty='0',tipe_order='DELETE PO',updated_at='${tanggal}' WHERE id_produk='${data_variasi[xx].id_produk}' AND id_ware='${data_variasi[xx].id_ware}' AND size='${data_variasi[xx].size}' AND id_act='${body.id_act}'`
                );

                if (xx === 0) {
                    // Update Variation Old QTY
                    await connection.query(
                        `INSERT INTO tb_mutasistock
                            (id_mutasi, tanggal, id_pesanan, id_ware, id_store, id_produk, produk, id_po, size, qty, source, id_sup, mutasi, users, created_at, updated_at)
                            VALUES ('${id_mutasi}','${tanggal_skrg}','DELETE PO','${data_variasi[xx].id_ware}','-','${data_variasi[xx].id_produk}','${produk_baru[0].produk}','${getpo[0].idpo}','${data_variasi[xx].size}','${getpo[index].qty}','Barang Gudang','${getsupplier[0].supplier}','DELETE PO','${body.users}','${tanggal}','${tanggal}')`
                    );
                }
            }
        }
        await connection.query(
            `UPDATE tb_purchaseorder SET total_amount='0',qty='0',tipe_order='DELETE PO',updated_at='${tanggal}' WHERE id_act='${body.id_act}'`
        );

        await connection.commit();
        await connection.release();
    } catch (error) {
        console.log(error);
        await connection.release();
    }
};

module.exports = {
    getProduk,
    addProduk,
    editProduk,
    deleteProduk,
    getSizesales,
    getHistoriposelected,
    repeatStok,
    getHargabeliso,
    getHistorisoselected,
    stockOpname,
    transferStok,
    print_Stockopname,
    getPo,
    getHistoripo,
    get_Sizepo,
    editPo,
    deleteItem,
    deletePo,
    getHistoriso,
    getSo,
    getProdukbarcode,
    getIdpo,
    getSizebarcode,
    getStore_sales,
    getMutation,
    get_Asset,
    getHistoripoasset,
    settlementStock,
    getWarehouse_sales,
    getRetur,
    getRefund,
    getStore_sales_online,
    getWarehouse_sales_online,
    getNamaware,
    getWarehousebarcode,
    getStore_dashboard,
    get_upprice,
    getHistoripotransfer,
    getPotransfer,
    getuserpo,
    getusertransfer,
    getProdukdisplay,
    getstoredisplay,
    addDisplay,
    deleteDisplay,
    cariwares,
    getwarehousetransfer,
    cariwaresretur,
    getusersales,
    getpodefect,
    getdeleteorder,
    editstockopname,
    deleteitemso,
    edittransfer,
    deleteitempo,
};
