import getToken from "../../components/gettoken";
import axios from "axios";

const request_host = "https://api.ginee.com";
const access_key = "24149de32ca192a5";
const secret_key = "d06535d93ed71299";
const http_method = "POST";
const listUri  = "/openapi/v3/oms/order/list";
const batchUri = "/openapi/v3/oms/order/item/batch-get";

// Date range: 7 hari ke belakang s/d sekarang (UTC)
function getDateRange() {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    return { createSince: from.toISOString(), createTo: to.toISOString() };
}

// Ambil SEMUA order dengan status tertentu, handle pagination via nextCursor
async function fetchAllOrders(orderStatus, createSince, createTo) {
    const allOrders = [];
    let nextCursor = undefined;
    let page = 0;

    do {
        page++;
        const token = await getToken(http_method, listUri, access_key, secret_key);
        const body = { orderStatus, createSince, createTo, size: 100 };
        if (nextCursor) body.nextCursor = nextCursor;

        const res = await axios({
            method: http_method,
            url: request_host + listUri,
            data: body,
            headers: {
                "Content-Type": "application/json",
                "X-Advai-Country": "ID",
                Authorization: token,
            },
        });

        const data = res.data;
        if (data.code !== "SUCCESS") {
            console.warn(`[getorderbytracking] ListOrder ${orderStatus} page ${page} error:`, data.message);
            break;
        }

        const content = data.data?.content || [];
        allOrders.push(...content);
        nextCursor = content.length < 100 ? null : data.data?.nextCursor;

        console.log(`[getorderbytracking] ${orderStatus} page ${page}: +${content.length} order (total: ${allOrders.length}), nextCursor: ${nextCursor ?? "end"}`);
    } while (nextCursor);

    return allOrders;
}

// BatchGetOrderItems dalam chunk 100, cocokkan trackingNo
async function findInBatch(orderIds, cleanTracking) {
    const CHUNK = 100;
    for (let i = 0; i < orderIds.length; i += CHUNK) {
        const chunk = orderIds.slice(i, i + CHUNK);
        const token = await getToken(http_method, batchUri, access_key, secret_key);

        const res = await axios({
            method: http_method,
            url: request_host + batchUri,
            data: { orderIds: chunk },
            headers: {
                "Content-Type": "application/json",
                "X-Advai-Country": "ID",
                Authorization: token,
            },
        });

        const batchData = res.data;
        console.log(`[getorderbytracking] BatchGet chunk [${i}..${i + chunk.length - 1}] code: ${batchData.code}, orders: ${(batchData.data || []).length}`);

        if (batchData.code !== "SUCCESS") continue;

        for (const order of (batchData.data || [])) {
            for (const logi of (order.logisticsInfos || [])) {
                if ((logi.logisticsTrackingNumber || "") === cleanTracking) {
                    console.log(`[getorderbytracking] ✅ COCOK: ${order.externalOrderId} (${order.orderStatus})`);
                    return {
                        externalOrderId: order.externalOrderId || "",
                        orderId: String(order.orderId || ""),
                        orderStatus: order.orderStatus || "",
                    };
                }
            }
        }
    }
    return null;
}

/**
 * POST /api/getorderbytracking
 * Body: { trackingNo: string }
 *
 * Strategy:
 *  1. Ambil SEMUA order SHIPPING 7 hari (pagination) → cari trackingNo via BatchGetOrderItems
 *  2. Jika tidak ketemu, coba COMPLETED (order mungkin sudah selesai)
 */
export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ status: "error", message: "Method not allowed" });
    }

    const { trackingNo } = req.body;
    if (!trackingNo?.trim()) {
        return res.status(400).json({ status: "error", message: "trackingNo is required" });
    }

    const cleanTracking = trackingNo.trim();
    console.log("\n[getorderbytracking] ===== Mencari resi:", cleanTracking, "=====");

    try {
        const { createSince, createTo } = getDateRange();

        // ── Step 1: SHIPPING ──────────────────────────────────────────────
        console.log("[getorderbytracking] Mengambil order SHIPPING...");
        const shippingOrders = await fetchAllOrders("SHIPPING", createSince, createTo);
        console.log("[getorderbytracking] Total SHIPPING:", shippingOrders.length);

        if (shippingOrders.length > 0) {
            const shippingIds = shippingOrders.map(o => String(o.orderId || o.id || "")).filter(Boolean);
            const found = await findInBatch(shippingIds, cleanTracking);
            if (found) {
                return res.status(200).json({ status: "success", ...found });
            }
        }

        // ── Step 2: COMPLETED (jika sudah selesai) ────────────────────────
        console.log("[getorderbytracking] Tidak ada di SHIPPING, coba COMPLETED...");
        const completedOrders = await fetchAllOrders("COMPLETED", createSince, createTo);
        console.log("[getorderbytracking] Total COMPLETED:", completedOrders.length);

        if (completedOrders.length > 0) {
            const completedIds = completedOrders.map(o => String(o.orderId || o.id || "")).filter(Boolean);
            const found = await findInBatch(completedIds, cleanTracking);
            if (found) {
                return res.status(200).json({ status: "success", ...found });
            }
        }

        // ── Tidak ketemu di mana-mana ─────────────────────────────────────
        const totalChecked = shippingOrders.length + completedOrders.length;
        console.warn(`[getorderbytracking] ❌ Tidak ditemukan di ${totalChecked} order (SHIPPING + COMPLETED)`);
        return res.status(200).json({
            status: "not_found",
            message: `Resi "${cleanTracking}" tidak ditemukan di ${totalChecked} order dalam 7 hari terakhir`,
        });

    } catch (error) {
        console.error("[getorderbytracking] error:", error.message);
        return res.status(500).json({ status: "error", message: error.message });
    }
}
