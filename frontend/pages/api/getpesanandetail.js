import getToken from "../../components/gettoken";
import axios from "axios";

const request_host = "https://api.ginee.com";
const access_key = "24149de32ca192a5";
const secret_key = "d06535d93ed71299";
const http_method = "POST";

export default async function handler(req, res) {
    const { externalOrderId } = req.body;

    if (!externalOrderId) {
        return res.status(400).json({ status: "error", message: "externalOrderId is required" });
    }

    try {
        const listUri = "/openapi/v3/oms/order/list";
        const batchUri = "/openapi/v3/oms/order/item/batch-get";

        const [tokenList, tokenBatch] = await Promise.all([
            getToken(http_method, listUri, access_key, secret_key),
            getToken(http_method, batchUri, access_key, secret_key),
        ]);

        // ── Step 1: ListOrder dengan filter externalOrderIds langsung ──
        // Sesuai dokumentasi Ginee: externalOrderIds adalah filter yang didukung
        const listRes = await axios({
            method: http_method,
            url: request_host + listUri,
            data: {
                externalOrderIds: [String(externalOrderId)],
                size: 10,
            },
            headers: {
                "Content-Type": "application/json",
                "X-Advai-Country": "ID",
                Authorization: tokenList,
            },
        });

        console.log("ListOrder response:", JSON.stringify(listRes.data).slice(0, 600));

        const listData = listRes.data.data;
        const content = listData?.content || [];
        console.log(`ListOrder content count: ${content.length}`);

        if (content.length === 0) {
            return res.status(200).json({ status: "error", message: "Pesanan tidak ditemukan di Ginee." });
        }

        // Ambil internal orderId dari order yang ditemukan
        const found = content[0];
        const internalOrderId = found.orderId || Object.values(found)[0];
        console.log(`✅ Found orderId: ${internalOrderId} for ${externalOrderId}`);

        // ── Step 2: BatchGetOrderItems dengan internal orderId ──
        const batchRes = await axios({
            method: http_method,
            url: request_host + batchUri,
            data: { orderIds: [String(internalOrderId)] },
            headers: {
                "Content-Type": "application/json",
                "X-Advai-Country": "ID",
                Authorization: tokenBatch,
            },
        });

        const batchData = batchRes.data;
        console.log(`batch-get code: ${batchData.code}, orders: ${(batchData.data || []).length}`);

        if (batchData.code !== "SUCCESS") {
            return res.status(200).json({ status: "error", message: batchData.message || "Ginee batch-get error" });
        }

        // batchData.data = array of order objects, each has items[]
        const orders = batchData.data || [];
        const mapped = [];

        for (const order of orders) {
            for (const item of (order.items || [])) {
                const skuParts = String(item.masterSku || item.sku || "").split(".");
                mapped.push({
                    externalOrderId: order.externalOrderId || externalOrderId,
                    productName: item.productName,
                    variationName: item.variationName,
                    sku: item.masterSku || item.sku,
                    id_produk: skuParts[0] || "",
                    size: skuParts[1] || item.variationName || "",
                    qty: item.quantity,
                    image: item.productImageUrl || null,
                });
            }
        }

        return res.status(200).json({ status: "success", items: mapped });

    } catch (error) {
        console.error("getpesanandetail error:", error.message);
        return res.status(500).json({ status: "error", message: error.message });
    }
}
