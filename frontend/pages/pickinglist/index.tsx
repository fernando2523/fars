import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import * as fa from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Cookies from "js-cookie";

interface OrderItem {
    id_pesanan: string;
    id_produk: string;
    produk: string;
    size: string;
    qty: number;
}

interface PickingRecord {
    id: number;
    tanggal: string;
    no_pesanan: string;
    resi: string | null;
    id_produk: string;
    size: string;
    qty: number;
    users: string;
    created_at: string;
    produk: string | null;
}

// Agregasi per size dalam satu group (no_pesanan + id_produk)
interface AggregatedItem {
    size: string;
    qty: number;         // sum dari semua record dg size yg sama
    editTarget: PickingRecord;  // record pertama, dipakai utk modal edit
}

interface GroupedRecord {
    key: string;
    no_pesanan: string;
    resi: string | null;
    id_produk: string;
    produk: string | null;
    users: string;
    created_at: string;          // paling terbaru dalam group
    items: AggregatedItem[];
}

interface OrderDetailItem {
    externalOrderId: string;
    productName: string;
    variationName: string;
    sku: string;
    id_produk: string;
    size: string;
    qty: number;
    image: string | null;
}

// Format tanggal lokal → YYYY-MM-DD
const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function PickingList() {
    // ── Scan input ───────────────────────────────────────────────────
    const [noResi, setNoResi] = useState("");
    const [barcodeRaw, setBarcodeRaw] = useState("");
    const [parsed, setParsed] = useState<{ id_produk: string; size: string } | null>(null);

    // ── Flow state ───────────────────────────────────────────────────
    const [isChecking, setIsChecking] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [orderItem, setOrderItem] = useState<OrderItem | null>(null);
    const [confirmQty, setConfirmQty] = useState(1);

    // ── Tabel + filter tanggal ───────────────────────────────────────
    const [filterDate, setFilterDate] = useState(toDateStr(new Date()));
    const [pickingData, setPickingData] = useState<PickingRecord[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    // ── Edit modal ───────────────────────────────────────────────────
    const [editRow, setEditRow] = useState<PickingRecord | null>(null);
    const [editQty, setEditQty] = useState(1);
    const [editSize, setEditSize] = useState("");
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // ── Order Detail Scan (Ginee) ────────────────────────────────────
    const [orderScan, setOrderScan] = useState("");
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [orderDetailData, setOrderDetailData] = useState<OrderDetailItem[] | null>(null);
    const [showOrderModal, setShowOrderModal] = useState(false);

    // ── Mobile camera ────────────────────────────────────────────────
    const [isMobile, setIsMobile] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [scanTarget, setScanTarget] = useState<"resi" | "barcode" | "orderscan">("barcode");
    const cameraRef = useRef<any>(null);

    useEffect(() => {
        const check = () =>
            setIsMobile(/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    const startScan = (target: "resi" | "barcode" | "orderscan") => {
        setScanTarget(target);
        setShowCamera(true);
    };

    const stopScan = async () => {
        if (cameraRef.current) {
            try { await cameraRef.current.stop(); } catch { /* ignore */ }
            cameraRef.current = null;
        }
        setShowCamera(false);
    };

    useEffect(() => {
        if (!showCamera) return;
        let mounted = true;
        (async () => {
            const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
            if (!mounted) return;
            const scanner = new Html5Qrcode("barcode-camera-reader");
            cameraRef.current = scanner;

            // orderscan = no. pesanan marketplace → barcode 1D
            // resi = no. resi pengiriman → QR code
            // barcode = barcode produk → QR code
            const isBarcode1D = scanTarget === "orderscan";
            const config = isBarcode1D
                ? {
                    fps: 20,
                    qrbox: { width: 320, height: 100 },
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.ITF,
                    ],
                    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                }
                : {
                    fps: 10,
                    qrbox: { width: 260, height: 260 },
                    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                };

            try {
                await scanner.start(
                    { facingMode: "environment" },
                    config,
                    (decoded: string) => {
                        if (scanTarget === "resi") {
                            setNoResi(decoded);
                            setOrderItem(null);
                        } else if (scanTarget === "barcode") {
                            setBarcodeRaw(decoded);
                            setOrderItem(null);
                        } else if (scanTarget === "orderscan") {
                            setOrderScan(decoded);
                            stopScan();
                            // auto-trigger search setelah scan
                            setTimeout(() => handleOrderScan(decoded), 100);
                            return;
                        }
                        stopScan();
                    },
                    undefined
                );
            } catch {
                setShowCamera(false);
            }
        })();
        return () => {
            mounted = false;
            if (cameraRef.current) {
                cameraRef.current.stop().catch(() => { });
                cameraRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showCamera]);

    // ── Refs ─────────────────────────────────────────────────────────
    const inputPesananRef = useRef<HTMLInputElement>(null);
    const inputBarcodeRef = useRef<HTMLInputElement>(null);
    const submitRef = useRef<HTMLButtonElement>(null);

    // ── Parse barcode: format {id_produk}.{size} atau {id_produk}.{size}.{id_ware}
    // Selalu split di titik PERTAMA → id_produk = bagian[0], size = bagian[1]
    useEffect(() => {
        const val = barcodeRaw.trim();
        if (!val) { setParsed(null); return; }
        const dot = val.indexOf(".");
        if (dot > 0) {
            const id_produk = val.substring(0, dot);
            const rest = val.substring(dot + 1);
            // Ambil size = bagian sebelum titik berikutnya (jika ada id_ware di belakang)
            const dot2 = rest.indexOf(".");
            const size = dot2 > 0 ? rest.substring(0, dot2) : rest;
            setParsed({ id_produk, size });
        } else {
            setParsed(null);
        }
    }, [barcodeRaw]);

    // ── Auto-advance: No. Resi → Barcode ────────────────────────────
    useEffect(() => {
        if (!noResi.trim()) return;
        const t = setTimeout(() => inputBarcodeRef.current?.focus(), 200);
        return () => clearTimeout(t);
    }, [noResi]);

    // ── Auto-advance: Barcode → Submit ───────────────────────────────
    useEffect(() => {
        if (!barcodeRaw.trim() || !noResi.trim()) return;
        const t = setTimeout(() => submitRef.current?.focus(), 200);
        return () => clearTimeout(t);
    }, [barcodeRaw]);

    // ── Fetch data tabel ─────────────────────────────────────────────
    const fetchPickingData = useCallback(async (tanggal?: string) => {
        setLoadingData(true);
        try {
            const res = await axios.post("https://api.supplysmooth.id/v1/getpickinglistdata", {
                tanggal: tanggal || filterDate,
            });
            setPickingData(res.data.result || []);
        } catch {
            // silent
        } finally {
            setLoadingData(false);
        }
    }, [filterDate]);

    useEffect(() => { fetchPickingData(); }, [fetchPickingData]);

    // ── Ganti tanggal filter ─────────────────────────────────────────
    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilterDate(e.target.value);
        fetchPickingData(e.target.value);
    };

    // ── Reset form scan ──────────────────────────────────────────────
    const handleReset = () => {
        setNoResi(""); setBarcodeRaw(""); setParsed(null);
        setOrderItem(null); setConfirmQty(1);
        setTimeout(() => inputPesananRef.current?.focus(), 100);
    };

    // ── Submit: cek pesanan di backend ───────────────────────────────
    const handleSubmit = async () => {
        if (!noResi.trim() || !parsed) return;
        setIsChecking(true);
        setOrderItem(null);
        try {
            const res = await axios.post("https://api.supplysmooth.id/v1/getpickinglist", {
                no_resi: noResi.trim(),
                id_produk: parsed.id_produk,
                size: parsed.size,
            });
            const result = res.data.result;
            if (!result.found) {
                toast.error("No. Resi tidak ditemukan!");
                return;
            }
            if (!result.orderItem) {
                // Debug: tampilkan semua item di order ini di console
                if (result.debug) {
                    console.log("[PickingList] id_pesanan ditemukan:", result.debug.id_pesanan);
                    console.log("[PickingList] Cari id_produk:", result.debug.search_id_produk, "| size:", result.debug.search_size);
                    console.log("[PickingList] Semua item dalam order:", result.debug.all_items);
                }
                const allItems: { id_produk: string; size: string }[] = result.debug?.all_items || [];
                const itemList = allItems.map((i: { id_produk: string; size: string }) => `${i.id_produk} / ${i.size}`).join(", ");
                toast.error(
                    `Produk tidak ditemukan dalam pesanan ini.\nItem tersedia: ${itemList || "-"}`,
                    { autoClose: 6000 }
                );
                return;
            }
            setOrderItem(result.orderItem);
            setConfirmQty(1);
        } catch {
            toast.error("Gagal menghubungi server.");
        } finally {
            setIsChecking(false);
        }
    };

    // ── Submit Pesanan: simpan ke tb_picking_list ────────────────────
    const handleSubmitPesanan = async () => {
        if (!orderItem || confirmQty < 1) return;
        setIsSaving(true);
        try {
            const res = await axios.post("https://api.supplysmooth.id/v1/insertpickinglist", {
                no_resi: noResi.trim(),
                id_produk: parsed!.id_produk,
                size: parsed!.size,
                qty: confirmQty,
                users: Cookies.get("auth_username") || "-",
            });
            if (res.data.result?.duplicate) {
                toast.warning(
                    `No. Resi "${noResi.trim()}" dengan produk & size ini sudah ada di picking list!`,
                    { autoClose: 4000 }
                );
                return;
            }
            toast.success("Berhasil ditambahkan ke picking list ✓");
            handleReset();
            fetchPickingData();
        } catch {
            toast.error("Gagal menyimpan picking list.");
        } finally {
            setIsSaving(false);
        }
    };

    // ── Buka modal edit ──────────────────────────────────────────────
    const openEdit = (row: PickingRecord) => {
        setEditRow(row);
        setEditQty(row.qty);
        setEditSize(row.size);
    };

    // ── Simpan edit ──────────────────────────────────────────────────
    const handleSaveEdit = async () => {
        if (!editRow || editQty < 1 || !editSize.trim()) return;
        setIsSavingEdit(true);
        try {
            await axios.post("https://api.supplysmooth.id/v1/updatepickinglist", {
                id: editRow.id,
                qty: editQty,
                size: editSize.trim(),
            });
            toast.success("Data berhasil diupdate ✓");
            setEditRow(null);
            fetchPickingData();
        } catch {
            toast.error("Gagal update data.");
        } finally {
            setIsSavingEdit(false);
        }
    };

    // ── Fetch detail pesanan dari Ginee API ──────────────────────────
    const handleOrderScan = async (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        setIsLoadingDetail(true);
        setOrderDetailData(null);
        try {
            const res = await axios.post("/api/getpesanandetail", {
                externalOrderId: trimmed,
            });
            console.log("res.data", res.data);

            if (res.data.status === "success" && res.data.items && res.data.items.length > 0) {
                setOrderDetailData(res.data.items);
                setShowOrderModal(true);
            } else {
                toast.error("Pesanan tidak ditemukan di Ginee.");
            }
        } catch {
            toast.error("Gagal mengambil detail pesanan.");
        } finally {
            setIsLoadingDetail(false);
        }
    };

    const canSubmit = !!noResi.trim() && !!parsed;

    // ── Role-based access ─────────────────────────────────────────────
    const authRole = Cookies.get("auth_role") ?? "";
    const canEdit = authRole === "SUPER-ADMIN" || authRole === "HEAD-AREA";

    // ── Format waktu ─────────────────────────────────────────────────
    const fmtTime = (s: string) => s?.slice(0, 16).replace("T", " ") ?? "-";

    // ── Group + aggregate pickingData ────────────────────────────────
    // Key: no_pesanan + id_produk → merge waktu/users/no_pesanan/produk
    // Per group: sum qty jika size sama
    const groupedData = useMemo<GroupedRecord[]>(() => {
        const map = new Map<string, GroupedRecord>();
        pickingData.forEach(row => {
            const key = `${row.no_pesanan}|||${row.id_produk}`;
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    no_pesanan: row.no_pesanan,
                    resi: row.resi || null,
                    id_produk: row.id_produk,
                    produk: row.produk,
                    users: row.users,
                    created_at: row.created_at,
                    items: [],
                });
            }
            const grp = map.get(key)!;
            // gunakan waktu terbaru dalam group
            if (row.created_at > grp.created_at) grp.created_at = row.created_at;
            // sum qty jika size sama, otherwise tambah entry baru
            const existing = grp.items.find(i => i.size === row.size);
            if (existing) {
                existing.qty += row.qty;
            } else {
                grp.items.push({ size: row.size, qty: row.qty, editTarget: row });
            }
        });
        return Array.from(map.values());
    }, [pickingData]);

    return (
        <div className="min-h-screen bg-[#F4F4F4] p-3 md:p-6">
            <ToastContainer position="top-right" autoClose={2500} />

            {/* Judul */}
            <div className="mb-4">
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <fa.FaClipboardList className="text-gray-600" />
                    Picking List
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                    Scan No. Resi lalu scan Barcode Produk, kemudian Submit
                </p>
            </div>

            {/* ── Form Scan ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <div className="flex flex-col md:flex-row gap-3">

                    {/* Input 1: No. Resi */}
                    <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">
                            No. Resi
                        </label>
                        <div className="flex items-center border border-gray-200 rounded-lg bg-gray-50 px-3 focus-within:ring-2 focus-within:ring-gray-300">
                            <fa.FaBarcode className="text-gray-400 text-base shrink-0 mr-2" />
                            <input
                                ref={inputPesananRef}
                                type="text"
                                value={noResi}
                                onChange={(e) => { setNoResi(e.target.value); setOrderItem(null); }}
                                placeholder="Scan / ketik no. resi..."
                                className="flex-1 py-2.5 text-sm bg-transparent focus:outline-none"
                                autoFocus
                            />
                            {noResi && (
                                <button onClick={() => { setNoResi(""); setOrderItem(null); }}
                                    className="text-gray-300 hover:text-gray-500 ml-1">
                                    <fa.FaTimes className="text-xs" />
                                </button>
                            )}
                            {isMobile && (
                                <button type="button" onClick={() => startScan("resi")}
                                    className="text-gray-400 hover:text-gray-600 ml-2 shrink-0">
                                    <fa.FaCamera className="text-base" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Input 2: Barcode Produk */}
                    <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">
                            Barcode Produk&nbsp;
                            <span className="normal-case font-normal text-gray-300">(id_produk.size)</span>
                        </label>
                        <div className={`flex items-center border rounded-lg bg-gray-50 px-3 focus-within:ring-2 focus-within:ring-gray-300 ${parsed ? "border-green-300" : "border-gray-200"}`}>
                            <fa.FaQrcode className="text-gray-400 text-base shrink-0 mr-2" />
                            <input
                                ref={inputBarcodeRef}
                                type="text"
                                value={barcodeRaw}
                                onChange={(e) => { setBarcodeRaw(e.target.value); setOrderItem(null); }}
                                placeholder="Scan QR barcode produk..."
                                className="flex-1 py-2.5 text-sm bg-transparent focus:outline-none"
                            />
                            {barcodeRaw && (
                                <button onClick={() => { setBarcodeRaw(""); setParsed(null); setOrderItem(null); }}
                                    className="text-gray-300 hover:text-gray-500 ml-1">
                                    <fa.FaTimes className="text-xs" />
                                </button>
                            )}
                            {isMobile && (
                                <button type="button" onClick={() => startScan("barcode")}
                                    className="text-gray-400 hover:text-gray-600 ml-2 shrink-0">
                                    <fa.FaCamera className="text-base" />
                                </button>
                            )}
                        </div>
                        {parsed && (
                            <div className="flex gap-3 mt-1.5 text-xs">
                                <span className="text-gray-500">ID: <b className="text-gray-700">{parsed.id_produk}</b></span>
                                <span className="text-gray-500">Size: <b className="text-gray-700">{parsed.size}</b></span>
                            </div>
                        )}
                    </div>

                    {/* Tombol */}
                    <div className="flex gap-2 items-start pt-5">
                        <button
                            ref={submitRef}
                            onClick={handleSubmit}
                            disabled={isChecking || !canSubmit}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-800 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 focus:ring-2 focus:ring-gray-400 focus:outline-none transition-all"
                        >
                            {isChecking ? <fa.FaSpinner className="animate-spin" /> : <fa.FaSearch />}
                            Submit
                        </button>
                        {orderItem && (
                            <button onClick={handleReset}
                                className="flex items-center gap-1.5 border border-gray-200 text-gray-500 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50">
                                <fa.FaRedo className="text-xs" /> Reset
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Cek Detail Pesanan Ginee ──────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1 flex items-center gap-1">
                    <fa.FaSearch className="text-indigo-400" /> Cek Detail Pesanan
                </label>
                <div className="flex items-center border border-gray-200 rounded-lg bg-gray-50 px-3 focus-within:ring-2 focus-within:ring-indigo-300 w-full">
                    <fa.FaClipboardList className="text-gray-400 text-base shrink-0 mr-2" />
                    <input
                        type="text"
                        value={orderScan}
                        onChange={(e) => setOrderScan(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleOrderScan(orderScan); }}
                        placeholder="Scan / ketik no. pesanan untuk lihat detail produk, size & qty..."
                        className="flex-1 py-2.5 text-sm bg-transparent focus:outline-none"
                    />
                    {isLoadingDetail && <fa.FaSpinner className="animate-spin text-indigo-500 mr-2" />}
                    {orderScan && !isLoadingDetail && (
                        <button onClick={() => { setOrderScan(""); setOrderDetailData(null); setShowOrderModal(false); }}
                            className="text-gray-300 hover:text-gray-500 ml-1">
                            <fa.FaTimes className="text-xs" />
                        </button>
                    )}
                    {isMobile && !isLoadingDetail && (
                        <button type="button" onClick={() => startScan("orderscan")}
                            className="text-gray-400 hover:text-indigo-500 ml-2 shrink-0">
                            <fa.FaCamera className="text-base" />
                        </button>
                    )}
                    <button
                        onClick={() => handleOrderScan(orderScan)}
                        disabled={!orderScan.trim() || isLoadingDetail}
                        className="ml-3 bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-all"
                    >
                        Cek
                    </button>
                </div>
            </div>

            {/* ── Konfirmasi Order Item ──────────────────────────────────── */}
            {orderItem && (
                <div className="bg-white rounded-xl shadow-sm p-4 mb-4 border-l-4 border-gray-800">
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Detail Produk Ditemukan</p>
                    <div className="flex-1 mb-4">
                        <p className="font-bold text-gray-800 text-base leading-tight">{orderItem.produk}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                            <span>ID: <b className="text-gray-700">{orderItem.id_produk}</b></span>
                            <span>Size: <b className="text-gray-700">{orderItem.size}</b></span>
                            <span>Qty Order: <b className="text-gray-700">{orderItem.qty}</b></span>
                        </div>
                    </div>

                    {orderItem.qty > 1 ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                            <p className="text-xs font-semibold text-yellow-700 mb-2 flex items-center gap-1">
                                <fa.FaExclamationTriangle /> Qty {orderItem.qty} — tentukan jumlah yang di-pack:
                            </p>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setConfirmQty(q => Math.max(1, q - 1))}
                                    className="w-8 h-8 rounded-lg bg-gray-200 hover:bg-gray-300 font-bold text-gray-700 flex items-center justify-center">
                                    <fa.FaMinus className="text-xs" />
                                </button>
                                <input
                                    type="number" min={1} max={orderItem.qty} value={confirmQty}
                                    onChange={(e) => setConfirmQty(Math.max(1, Math.min(orderItem.qty, parseInt(e.target.value) || 1)))}
                                    className="w-16 text-center border border-gray-300 rounded-lg py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-gray-300"
                                />
                                <button onClick={() => setConfirmQty(q => Math.min(orderItem.qty, q + 1))}
                                    className="w-8 h-8 rounded-lg bg-gray-200 hover:bg-gray-300 font-bold text-gray-700 flex items-center justify-center">
                                    <fa.FaPlus className="text-xs" />
                                </button>
                                <span className="text-xs text-gray-400">/ {orderItem.qty}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                            <p className="text-xs text-green-700 font-medium flex items-center gap-1">
                                <fa.FaCheckCircle /> Qty: <b>1</b> — siap disimpan
                            </p>
                        </div>
                    )}

                    <button
                        onClick={handleSubmitPesanan}
                        disabled={isSaving || confirmQty < 1}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-green-600 text-white px-8 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-all"
                    >
                        {isSaving ? <fa.FaSpinner className="animate-spin" /> : <fa.FaCheckCircle />}
                        Submit Pesanan
                    </button>
                </div>
            )}

            {/* ── Tabel Picking List ────────────────────────────────────── */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">

                {/* Header tabel + date picker */}
                <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                    <p className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                        <fa.FaList className="text-gray-400" />
                        Data Picking List
                        <span className="text-xs text-gray-400 font-normal">({pickingData.length} item)</span>
                    </p>
                    <div className="flex items-center gap-2">
                        {/* Date picker */}
                        <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 bg-gray-50 focus-within:ring-2 focus-within:ring-gray-300">
                            <fa.FaCalendarAlt className="text-gray-400 text-xs shrink-0" />
                            <input
                                type="date"
                                value={filterDate}
                                onChange={handleDateChange}
                                className="text-xs bg-transparent focus:outline-none text-gray-700"
                            />
                        </div>
                        <button onClick={() => fetchPickingData()}
                            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100">
                            <fa.FaSyncAlt className={loadingData ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {loadingData ? (
                    <div className="p-8 text-center text-gray-400">
                        <fa.FaSpinner className="animate-spin text-2xl mx-auto mb-2" />
                        <p className="text-xs">Memuat data...</p>
                    </div>
                ) : pickingData.length === 0 ? (
                    <div className="p-8 text-center text-gray-300">
                        <fa.FaClipboardList className="text-4xl mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Belum ada data picking list untuk tanggal ini</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile: grouped card */}
                        <div className="block md:hidden divide-y divide-gray-200">
                            {groupedData.map((grp, gIdx) => (
                                <div key={grp.key} className="p-4">
                                    {/* Header group: waktu · users · no_pesanan · produk */}
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] text-gray-400 mb-0.5">
                                                {fmtTime(grp.created_at)} · <span className="font-medium">{grp.users}</span>
                                            </p>
                                            <p className="font-semibold text-gray-800 text-sm leading-tight truncate">
                                                {grp.produk || grp.id_produk}
                                            </p>
                                            <p className="text-[10px] text-gray-400 truncate mt-0.5">{grp.no_pesanan}</p>
                                            {grp.resi && (
                                                <p className="text-[10px] text-gray-400 truncate">Resi: {grp.resi}</p>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded px-2 py-0.5 shrink-0">
                                            #{gIdx + 1}
                                        </span>
                                    </div>
                                    {/* Baris per size (agregasi) */}
                                    <div className="rounded-lg border border-gray-100 overflow-hidden mt-2">
                                        {grp.items.map((item, sIdx) => (
                                            <div key={item.size}
                                                className={`flex items-center justify-between px-3 py-2 bg-gray-50/70 ${sIdx < grp.items.length - 1 ? "border-b border-gray-100" : ""}`}>
                                                <div className="flex gap-5 text-xs">
                                                    <span className="text-gray-500">Size: <b className="text-gray-800 font-semibold">{item.size}</b></span>
                                                    <span className="text-gray-500">Qty: <b className="text-gray-800 font-semibold">{item.qty}</b></span>
                                                </div>
                                                {canEdit && (
                                                    <button onClick={() => openEdit(item.editTarget)}
                                                        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded px-2 py-1">
                                                        <fa.FaEdit /> Edit
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop: tabel grouped dengan rowSpan */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                    <tr>
                                        <th className="px-4 py-3 text-left w-10 border-b-2 border-gray-200">No</th>
                                        <th className="px-4 py-3 text-left border-b-2 border-gray-200">Waktu</th>
                                        <th className="px-4 py-3 text-left border-b-2 border-gray-200">Users</th>
                                        <th className="px-4 py-3 text-left border-b-2 border-gray-200">No. Pesanan</th>
                                        <th className="px-4 py-3 text-left border-b-2 border-gray-200">No. Resi</th>
                                        <th className="px-4 py-3 text-left border-b-2 border-gray-200">Produk</th>
                                        <th className="px-4 py-3 text-center border-b-2 border-gray-200">Size</th>
                                        <th className="px-4 py-3 text-center border-b-2 border-gray-200">Qty</th>
                                        {canEdit && <th className="px-4 py-3 text-center border-b-2 border-gray-200">Aksi</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupedData.flatMap((grp, gIdx) =>
                                        grp.items.map((item, iIdx) => {
                                            const isLast = iIdx === grp.items.length - 1;
                                            // border bawah: tebal antar-group, tipis antar-size dalam group
                                            const rowBorder = isLast ? "border-b-2 border-gray-200" : "border-b border-gray-100";
                                            // border kanan untuk merged cells
                                            const mergedCls = `px-4 py-3 align-middle border-r border-gray-100 border-b-2 border-gray-200 bg-white`;
                                            return (
                                                <tr key={`${grp.key}-${item.size}`} className="hover:bg-gray-50">
                                                    {iIdx === 0 && <>
                                                        <td rowSpan={grp.items.length} className={`${mergedCls} text-gray-400 text-xs w-10`}>
                                                            {gIdx + 1}
                                                        </td>
                                                        <td rowSpan={grp.items.length} className={`${mergedCls} text-gray-500 text-xs whitespace-nowrap`}>
                                                            {fmtTime(grp.created_at)}
                                                        </td>
                                                        <td rowSpan={grp.items.length} className={`${mergedCls} text-gray-600 text-xs`}>
                                                            {grp.users}
                                                        </td>
                                                        <td rowSpan={grp.items.length} className={`${mergedCls} text-gray-700 text-xs`}>
                                                            {grp.no_pesanan}
                                                        </td>
                                                        <td rowSpan={grp.items.length} className={`${mergedCls} text-gray-500 text-xs`}>
                                                            {grp.resi || <span className="text-gray-300">-</span>}
                                                        </td>
                                                        <td rowSpan={grp.items.length} className={`${mergedCls}`}>
                                                            <p className="font-medium text-gray-800">{grp.produk || "-"}</p>
                                                            <p className="text-xs text-gray-400">{grp.id_produk}</p>
                                                        </td>
                                                    </>}
                                                    <td className={`px-4 py-3 text-center font-semibold text-gray-700 ${rowBorder}`}>{item.size}</td>
                                                    <td className={`px-4 py-3 text-center font-bold text-gray-800 ${rowBorder}`}>{item.qty}</td>
                                                    {canEdit && (
                                                        <td className={`px-4 py-3 text-center ${rowBorder}`}>
                                                            <button onClick={() => openEdit(item.editTarget)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 text-blue-600 hover:bg-blue-50 transition-all">
                                                                <fa.FaEdit /> Edit
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* ── Modal Detail Pesanan Ginee — FULLSCREEN ──────────────── */}
            {showOrderModal && orderDetailData && (
                <div className="fixed inset-0 z-50 flex flex-col bg-black">

                    {/* ── Header bar ── */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-900 shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <fa.FaClipboardList className="text-indigo-400 shrink-0" />
                            <span className="text-white font-semibold text-sm truncate">Detail Pesanan</span>
                            <span className="text-gray-400 text-xs font-mono truncate hidden sm:inline">
                                {orderDetailData[0]?.externalOrderId}
                            </span>
                        </div>
                        <button onClick={() => setShowOrderModal(false)}
                            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-700 transition-all shrink-0">
                            <fa.FaTimes className="text-lg" />
                        </button>
                    </div>

                    {/* ── Body: scrollable items ── */}
                    <div className="flex-1 overflow-y-auto">
                        {orderDetailData.map((item, idx) => (
                            <div key={idx}
                                className={`flex flex-col md:flex-row ${idx > 0 ? "border-t-4 border-gray-800" : ""}`}
                                style={{ minHeight: "calc(100vh - 56px)" }}>

                                {/* ── Gambar — atas (mobile) / kiri (desktop) — BESAR ── */}
                                <div className="
                                    md:w-1/2 bg-black flex items-center justify-center overflow-hidden
                                    h-[55vw] md:h-auto
                                    md:sticky md:top-0 md:self-start
                                " style={{ minHeight: 260 }}>
                                    {item.image ? (
                                        <img
                                            src={item.image}
                                            alt={item.productName}
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <div className="text-gray-600 flex flex-col items-center gap-2">
                                            <fa.FaImage className="text-6xl" />
                                            <span className="text-sm text-gray-500">No Image</span>
                                        </div>
                                    )}
                                </div>

                                {/* ── Detail — bawah (mobile) / kanan (desktop) ── */}
                                <div className="flex-1 bg-white flex flex-col justify-center px-5 py-6 md:px-8 md:py-10">
                                    {/* Nama produk */}
                                    <p className="font-bold text-gray-900 text-lg md:text-2xl leading-snug mb-6">
                                        {item.productName}
                                    </p>

                                    {/* No pesanan — full width */}
                                    <div className="mb-4 pb-4 border-b border-gray-100">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">No. Pesanan</p>
                                        <p className="text-gray-700 font-mono text-sm break-all">{item.externalOrderId}</p>
                                    </div>

                                    {/* Grid 2 kolom */}
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                                        <div>
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Variasi</p>
                                            <p className="text-gray-700 font-medium text-sm">{item.variationName || "-"}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Size</p>
                                            <p className="text-gray-900 font-extrabold text-3xl md:text-4xl tracking-wide">{item.size || "-"}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">ID Produk</p>
                                            <p className="text-gray-600 font-mono text-xs">{item.id_produk}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Qty</p>
                                            <p className="text-indigo-600 font-extrabold text-4xl md:text-5xl">{item.qty}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">SKU</p>
                                            <p className="text-gray-500 font-mono text-xs break-all">{item.sku}</p>
                                        </div>
                                    </div>

                                    {/* Tombol tutup (mobile friendly) */}
                                    <button onClick={() => setShowOrderModal(false)}
                                        className="mt-8 w-full py-3 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 transition-all active:scale-95">
                                        Tutup
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Camera Modal (mobile only) ───────────────────────────── */}
            {showCamera && (
                <div className="fixed inset-0 bg-black z-50 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-black/80">
                        <div className="flex items-center gap-2 text-white">
                            <fa.FaCamera className="text-lg" />
                            <span className="font-semibold text-sm">
                                {scanTarget === "barcode" ? "Scan Barcode Produk" : scanTarget === "resi" ? "Scan No. Resi" : "Scan No. Pesanan"}
                            </span>
                        </div>
                        <button onClick={stopScan}
                            className="text-white bg-white/10 hover:bg-white/20 rounded-full w-8 h-8 flex items-center justify-center">
                            <fa.FaTimes />
                        </button>
                    </div>

                    {/* Camera viewport */}
                    <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
                        <div id="barcode-camera-reader" className="w-full h-full" />
                        {/* Overlay frame */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className={`border-2 border-white/50 rounded-xl relative ${scanTarget === "orderscan" ? "w-80 h-24" : "w-64 h-64"}`}>
                                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg" />
                                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg" />
                                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
                                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg" />
                                {scanTarget === "orderscan" && (
                                    <div className="absolute inset-x-2 top-1/2 h-0.5 bg-red-400/80 animate-pulse" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer hint */}
                    <div className="px-4 py-3 bg-black/80 text-center">
                        <p className="text-white/60 text-xs">
                            {scanTarget === "barcode"
                                ? "Arahkan kamera ke barcode produk (format: id_produk.size)"
                                : scanTarget === "resi"
                                    ? "Arahkan kamera ke QR Code No. Resi"
                                    : "Arahkan kamera ke barcode No. Pesanan"}
                        </p>
                    </div>
                </div>
            )}

            {/* ── Modal Edit ───────────────────────────────────────────── */}
            {editRow && (
                <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <fa.FaEdit className="text-blue-500" /> Edit Picking List
                            </h3>
                            <button onClick={() => setEditRow(null)}
                                className="text-gray-400 hover:text-gray-600">
                                <fa.FaTimes />
                            </button>
                        </div>

                        {/* Info readonly */}
                        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs space-y-1">
                            <p className="text-gray-500">Produk: <b className="text-gray-700">{editRow.produk || editRow.id_produk}</b></p>
                            <p className="text-gray-500">No. Pesanan: <b className="text-gray-700">{editRow.no_pesanan}</b></p>
                        </div>

                        {/* Edit Size */}
                        <div className="mb-4">
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Size</label>
                            <input
                                type="text"
                                value={editSize}
                                onChange={(e) => setEditSize(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 bg-gray-50"
                            />
                        </div>

                        {/* Edit Qty */}
                        <div className="mb-5">
                            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Qty</label>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setEditQty(q => Math.max(1, q - 1))}
                                    className="w-9 h-9 rounded-lg bg-gray-200 hover:bg-gray-300 font-bold text-gray-700 flex items-center justify-center">
                                    <fa.FaMinus className="text-xs" />
                                </button>
                                <input
                                    type="number" min={1} value={editQty}
                                    onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-20 text-center border border-gray-300 rounded-lg py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-gray-300"
                                />
                                <button onClick={() => setEditQty(q => q + 1)}
                                    className="w-9 h-9 rounded-lg bg-gray-200 hover:bg-gray-300 font-bold text-gray-700 flex items-center justify-center">
                                    <fa.FaPlus className="text-xs" />
                                </button>
                            </div>
                        </div>

                        {/* Tombol */}
                        <div className="flex gap-2">
                            <button onClick={() => setEditRow(null)}
                                className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-lg text-sm hover:bg-gray-50">
                                Batal
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={isSavingEdit || editQty < 1 || !editSize.trim()}
                                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-all"
                            >
                                {isSavingEdit ? <fa.FaSpinner className="animate-spin" /> : <fa.FaSave />}
                                Simpan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
