import getToken from "../../components/gettoken";
import axios from "axios";

const request_host = "https://api.ginee.com";
const access_key = "24149de32ca192a5";
const secret_key = "d06535d93ed71299";
const http_method = "POST";

/**
 * POST /api/getlogisticsresi
 * Body: { orders: [{ orderId: string, externalOrderId: string }] }
 *
 * Gunakan BatchGetOrderItems (/openapi/v3/oms/order/item/batch-get) karena:
 * - ListOrder TIDAK menjamin logisticsTrackingNumber ada di response
 * - BatchGetOrderItems memiliki section "Logistics Info" yang berisi logisticsTrackingNumber
 *
 * Mengembalikan: { items: [{ externalOrderId, resi, jasa_kirim }] }
 */
export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ status: "error", message: "Method not allowed" });
    }

    const { orders } = req.body;

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({ status: "error", message: "orders array is required" });
    }

    // Buat map orderId → externalOrderId untuk lookup nanti
    const orderIdToExternal = {};
    for (const o of orders) {
        if (o.orderId && o.externalOrderId) {
            orderIdToExternal[String(o.orderId)] = String(o.externalOrderId);
        }
    }

    const internalOrderIds = Object.keys(orderIdToExternal);
    if (internalOrderIds.length === 0) {
        return res.status(400).json({ status: "error", message: "Tidak ada orderId valid" });
    }

    try {
        const batchUri = "/openapi/v3/oms/order/item/batch-get";
        const BATCH_SIZE = 100; // Ginee max batch-get limit
        const allItems = [];

        for (let i = 0; i < internalOrderIds.length; i += BATCH_SIZE) {
            const batch = internalOrderIds.slice(i, i + BATCH_SIZE);

            const token = await getToken(http_method, batchUri, access_key, secret_key);

            const batchRes = await axios({
                method: http_method,
                url: request_host + batchUri,
                data: { orderIds: batch },
                headers: {
                    "Content-Type": "application/json",
                    "X-Advai-Country": "ID",
                    Authorization: token,
                },
            });

            const batchData = batchRes.data;
            console.log(
                `[getlogisticsresi] batch-get code: ${batchData.code}, orders: ${(batchData.data || []).length}`
            );

            if (batchData.code !== "SUCCESS") {
                console.warn("[getlogisticsresi] batch-get error:", batchData.message);
                continue;
            }

            const orderList = batchData.data || [];

            for (const order of orderList) {
                const internalId = String(order.orderId || "");
                // Ambil externalOrderId dari map (atau dari order.externalOrderId langsung)
                const extId =
                    order.externalOrderId ||
                    orderIdToExternal[internalId] ||
                    "";

                // logisticsInfos ada di level order (bukan item)
                const logisticsInfos = order.logisticsInfos || [];
                const logistics = logisticsInfos[0] || {};

                console.log(
                    `[getlogisticsresi] orderId=${internalId} extId=${extId}`,
                    `resi=${logistics.logisticsTrackingNumber}`,
                    `jasa=${logistics.logisticsProviderName}`
                );

                allItems.push({
                    externalOrderId: extId,
                    resi: logistics.logisticsTrackingNumber || "",
                    jasa_kirim: logistics.logisticsProviderName || "",
                });
            }
        }

        console.log(`[getlogisticsresi] total items:`, allItems.length);
        return res.status(200).json({ status: "success", items: allItems });

    } catch (error) {
        console.error("[getlogisticsresi] error:", error.message);
        return res.status(500).json({ status: "error", message: error.message });
    }
}
