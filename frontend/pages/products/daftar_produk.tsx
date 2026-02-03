import Head from "next/head";
import Image from "next/image";
import * as fa from "react-icons/fa";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/dark.css";
import React, { Component, useRef, useState, useEffect } from "react";
import { compareAsc, format } from "date-fns";
import Link from "next/link";
import TableHeaderRow from "@nextui-org/react/types/table/table-header-row";
import { Collapse } from "react-collapse";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useForm, useFieldArray } from "react-hook-form";
import useSWR from "swr";
import axios from "axios";
import CurrencyInput from "react-currency-input-field";
import { BeakerIcon, ClipboardDocumentIcon } from "@heroicons/react/24/solid";
import {
  Box,
} from "lucide-react";
import Cookies from "js-cookie";
import Select from "react-select";

let Rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});


export default function DaftarProduk() {
  const [isLoading, setisLoading]: any = useState(true);
  const [data_produk, setdataproduk] = useState([]);
  const [total_pages, settotal_pages]: any = useState([]);
  const [data_ware, setdataware] = useState([]);
  const [total_produk, setdatatotalproduk] = useState(0);
  const [sum_produk, setdatasumproduk] = useState(0);
  const [data_category, setdatacategory] = useState([]);
  const [data_brand, setdatabrand] = useState([]);
  const [data_supplier, setdatasupplier] = useState([]);
  const [data_historypo, setdatahistorypo] = useState([]);
  const [data_historypo_transfer, setdatahistoryptransfer] = useState([]);
  const [data_so, setdataso] = useState([]);
  const [collapse_name, setcollapse_name] = useState(true);
  const [Urutan, setUrutan] = useState("all");
  const [warehouseApi, setwarehouseapi]: any = useState([]);
  const [productapi, setproductapi]: any = useState([]);
  const [stockpromo, setstockpromo]: any = useState([]);
  const [stockpromoside, setstockpromoside]: any = useState([]);
  const [Brand, setBrand] = useState("all");
  const [data_brand_all, setdatabrand_all] = useState([]);

  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    loaddataproduk(Warehouse, Query, area, Role, Urutan, Brand);
    getwarehouse();
    getcategory();
    getsupplier();
    gethistoripo();
    gethistoriso();
  }, []);


  async function loaddataproduk(
    id_ware: any,
    query: any,
    area: any,
    Role: any,
    Urutan: any,
    Brand: any,
    pageParam = page
  ) {
    setisLoading(true);

    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_HOST}/v1/getproduk`,
        {
          page: pageParam,
          limit: limit,

          id_ware: id_ware,
          query: query,
          area: area,
          role: Role,
          urutan: Urutan,
          brand: Brand,
        }
      );

      setdataproduk(res.data.result.datas);

      settotal_pages(res.data.result.total_pages);
      setdatatotalproduk(res.data.result.total_artikel);
      setdatasumproduk(res.data.result.sum_artikel);

      setPage(res.data.result.page);

    } catch (error) {
      console.error("load data produk error:", error);
    } finally {
      setisLoading(false);
    }
  }

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [totalPages, setTotalPages] = useState(0);
  const [totalData, setTotalData] = useState(0);

  async function getwarehouse() {
    await axios({
      method: "get",
      url: `${process.env.NEXT_PUBLIC_HOST}/v1/getwarehouse_product`,
    })
      .then(function (response) {
        setdataware(response.data.data_warehouse);
      })
      .catch(function (error) {
        console.log(error);
      });
  }


  const [Query, setQuery] = useState("all");
  const list_query: any = [];
  const filter_query = list_query.filter((list_query: any) => {
    return list_query.produk
      .toLocaleLowerCase()
      .includes(Query.toLocaleLowerCase());
  });

  const [Warehouse, setWarehouse] = useState("all");

  const [Role, setRole] = useState(Cookies.get("auth_role"));
  const [Name, setName] = useState(Cookies.get("auth_name"));
  const [area, setarea] = useState((Cookies.get("auth_store")));
  const [isDisabled, setIsDisabled] = useState(false);

  function querySet(e: any) {
    if (e.target.value === "") {
      setQuery("all");
      loaddataproduk(Warehouse, "all", area, Role, Urutan, Brand);
    } else {
      setQuery(e.target.value);
      loaddataproduk(Warehouse, e.target.value, area, Role, Urutan, Brand);
    }
  }

  async function keyDown(event: any) {
    if (event.key == 'Enter') {
      if (Query != "all") {
        loaddataproduk(Warehouse, Query, area, Role, Urutan, Brand);
      }
    }
  }

  const [warehouse_so, setwarehouse_so] = useState("");

  const list_warehouse: any = [];
  const list_warehouse_so: any = [];
  // const list_warehouse_defect: any = [];

  const [notwarehouse, setnotwarehouse] = useState(null);

  const list_brand_all: any = [];
  if (!isLoading) {
    data_brand_all.map((brand: any, index: number) => {
      list_brand_all.push(
        <option key={index} value={brand.id_area}>
          {brand.brand}
        </option>
      );
    });
  }

  if (!isLoading) {
    data_ware.map((data_ware: any, index: number) => {
      // if (notwarehouse != data_ware.id_ware) {
      list_warehouse.push(
        <option key={index} value={data_ware.id_ware}>
          {data_ware.warehouse}
        </option>
      );
      // }

      list_warehouse_so.push(
        <option key={index} value={data_ware.id_ware}>
          {data_ware.warehouse}
        </option>
      );
    });
  }

  async function getsupplier() {
    await axios({
      method: "get",
      url: `${process.env.NEXT_PUBLIC_HOST}/v1/getsupplier`,
    })
      .then(function (response) {
        setdatasupplier(response.data.data_supplier);
      })
      .catch(function (error) {
        console.log(error);
      });
  }
  const list_supplier: any = [];
  if (!isLoading) {
    data_supplier.map((area: any, index: number) => {
      list_supplier.push(
        <option key={index} value={area.id_sup}>
          {area.supplier}
        </option>
      );
    });
  }

  async function gethistoripo() {
    await axios({
      method: "get",
      url: `${process.env.NEXT_PUBLIC_HOST}/v1/gethistoripo`,
    })
      .then(function (response) {
        setdatahistorypo(response.data.result);
      })
      .catch(function (error) {
        console.log(error);
      });
  }
  const list_po: any = [];
  if (!isLoading) {
    data_historypo.map((historipo: any, index: number) => {
      list_po.push(
        <option key={index} value={historipo.idpo}>
          {historipo.tanggal_receive} - {historipo.tipe_order} -{" "}
          {historipo.idpo}
        </option>
      );
    });
  }

  async function gethistoriso() {
    await axios({
      method: "get",
      url: `${process.env.NEXT_PUBLIC_HOST}/v1/gethistoriso`,
    })
      .then(function (response) {
        setdataso(response.data.result);
      })
      .catch(function (error) {
        console.log(error);
      });
  }

  const list_so: any = [];
  if (!isLoading) {
    data_so.map((historiso: any, index: number) => {
      list_so.push(
        <option key={index} value={historiso.idpo}>
          {historiso.tanggal_receive} - {historiso.tipe_order} -{" "}
          {historiso.idpo}
        </option>
      );
    });
  }

  async function getcategory() {
    await axios({
      method: "get",
      url: `${process.env.NEXT_PUBLIC_HOST}/v1/getcategory`,
    })
      .then(function (response) {
        setdatacategory(response.data.data_category);
      })
      .catch(function (error) {
        console.log(error);
      });
  }
  const list_category: any = [];
  if (!isLoading) {
    data_category.map((area: any, index: number) => {
      list_category.push(
        <option key={index} value={area.id_category}>
          {area.category}
        </option>
      );
    });
  }


  const list_brand: any = [];
  if (!isLoading) {
    data_brand.map((area: any, index: number) => {
      list_brand.push(
        <option key={index} value={area.id_brand}>
          {area.brand}
        </option>
      );
    });
  }

  const [openSize, setopenSize] = useState(null);

  function toogleActive(index: any) {
    if (openSize === index) {
      setopenSize(null);
    } else {
      setopenSize(index);
    }
  }

  const {
    register,
    control,
    unregister,
    resetField,
    setValue,
    handleSubmit,
    watch,
    clearErrors,
    formState: { errors },
  } = useForm({
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "variasi",
  });

  const [showModal, setShowModal] = React.useState(false);
  const [repeatModal, setrepeatModal] = React.useState(false);
  const [editstocksync, seteditstocksync] = React.useState(false);
  const [stockopname, setstockopname] = React.useState(false);
  const [showModalPrintSO, setshowModalPrintSO] = React.useState(false);
  const [transferModal, settransferModal] = React.useState(false);
  const [delModal, setdelModal] = React.useState(false);
  const [editModal, seteditModal] = React.useState(false);
  const [transferdefectModal, settransferdefectModal] = React.useState(false);

  const [id, setid] = React.useState(null);
  const [idware, setidware] = React.useState(null);
  const [img, setimg] = React.useState(null);

  function showeditModal(
    id: any,
    produk: any,
    brand: any,
    kategori: any,
    kualitas: any,
    g_price: any,
    r_price: any,
    n_price: any,
    img: any,
    index: number
  ) {
    setid(id);
    setValue("edit_produk", produk);
    setValue("edit_brand", brand);
    setValue("edit_kategori", kategori);
    setValue("edit_kualitas", kualitas);
    setValue("edit_g_price", g_price);
    setValue("edit_r_price", r_price);
    setValue("edit_n_price", n_price);
    setValue("file", img);
    setShowModal(true);
    setimg(`${process.env.NEXT_PUBLIC_HOST}/public/images/${img}`);
  }

  const onSubmitUpdate = async (data: any) => {
    setisLoading(true)

    let formData = new FormData();
    formData.append("id", id);
    formData.append("edit_produk", data.edit_produk);
    formData.append("edit_brand", data.edit_brand);
    formData.append("edit_quality", data.edit_kualitas);
    formData.append("edit_kategori", data.edit_kategori);
    formData.append("edit_g_price", data.edit_g_price);
    formData.append("edit_r_price", data.edit_r_price);
    formData.append("edit_n_price", data.edit_n_price);
    formData.append("file", selectedImage);
    await axios({
      method: "post",
      url: `${process.env.NEXT_PUBLIC_HOST}/v1/editproduk`,
      headers: {
        "content-type": "multipart/form-data",
      },
      data: formData,
    }).then(function (response) {
      loaddataproduk(Warehouse, Query, area, Role, Urutan, Brand);
      setSelectedImage(null);
      setimg(null);
      setisLoading(false)
      toast.success("Data telah diupdate", {
        position: toast.POSITION.TOP_RIGHT,
        pauseOnHover: false,
        autoClose: 500,
      });
      resetField("edit_produk");
      resetField("edit_brand");
      resetField("edit_kategori");
      resetField("edit_kualitas");
      resetField("edit_harga");
      resetField("file");
      setShowModal(false);
    });
  };

  const [transferproduct, settransferproduct] = React.useState("");
  const [idtransferproduct, setidtransferproduct] = React.useState("");
  const [waretransferproduct, setwaretransferproduct] = React.useState("");
  const [transferdefectproduct, settransferproductdefect] = React.useState("");
  const [idtransferproductdefect, setidtransferproductdefect] = React.useState("");
  const [waretransferproductdefect, setwaretransferproductdefect] = React.useState("");
  const [DefectModelProduk, setdefectModelProduk] = React.useState("");
  const [DefectModelIDProduk, setdefectModelIDProduk] = React.useState("");
  const [gudangdefectawal, setgudangdefectawal] = React.useState(null);
  const [gudangdefectawal_id_ware, setgudangdefectawal_id_ware] = React.useState(null);

  const options: any = [];

  if (!isLoading) {
    data_produk.map((produk: any, index: number) => {
      return options.push({
        value: produk.produk + "#" + produk.id_produk,
        // label: produk.produk,
        label: (
          <div className="flex gap-2 py-2 items-center">
            {gudangdefectawal === produk.warehouse[0].warehouse ?
              (
                <>
                  <Image
                    className="rounded border w-[65px] h-auto p-2"
                    src={`${process.env.NEXT_PUBLIC_HOST}/public/images/${produk.img}`}
                    alt="product-1"
                    height="500"
                    width="500"
                    priority
                  />
                  <span>
                    {produk.produk} - Gudang : {gudangdefectawal}
                  </span>
                </>
              ) : null}
          </div>
        ),
      });
    });
  }

  async function showtransferdefectModal(
    id: any,
    produk: any,
    id_produk: any,
    brand: any,
    kategori: any,
    kualitas: any,
    harga: any,
    img: any,
    variation: any,
    gudang_pengirim: any,
    ware: any,
    index: number
  ) {
    settransferproductdefect(produk);
    setidtransferproductdefect(id_produk);
    setwaretransferproductdefect(ware);
    setnotwarehouse(ware);
    setgudangdefectawal(gudang_pengirim);
    setgudangdefectawal_id_ware(ware);

    clearErrors();
    setValue("defect_transferwaretujuan", "");
    setValue("defect_gudangpengirim", gudang_pengirim);

    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/getsizesales`, {
        idware: ware,
        idproduct: id_produk,
      })
      .then(function (response) {
        unregister("variasitransfer");
        setdatasize(response.data.result.datasize);
        settransferdefectModal(true);
      });
  }

  const onSubmitTransferdefect = async (data: any) => {
    if ("HEAD-WAREHOUSE" === Cookies.get("auth_role")) {
      var warehousetujuan = gudangdefectawal_id_ware;
    } else {
      var warehousetujuan = data.defect_transferwaretujuan;
    }

    setIsDisabled(true);
    if (warehousetujuan === "") {
      toast.warning("Gudang Tujuan Tidak Boleh Kosong", {
        position: toast.POSITION.TOP_RIGHT,
        pauseOnHover: false,
        autoClose: 1000,
      });
      setIsDisabled(false);
    } else {
      var qty_all = 0;
      for (let index = 0; index < data.variasitransferdefect.length; index++) {
        var hitungsisa = data.variasitransferdefect[index].stok_lama - data.variasitransferdefect[index].stok_baru;
        qty_all = qty_all + parseInt(data.variasitransferdefect[index].stok_baru);

        if (data.variasitransferdefect[index].stok_baru > 0) {
          if (hitungsisa < 0) {
            if (hitungsisa < 0) {
              var sisastok = "batalkan";
            } else {
              var sisastok = "proses";
            }
          } else {
            var sisastok = "proses";
          }
        }
      }

      if (qty_all < 1) {
        toast.warning("Jumlah Total Quantity Tidak Boleh Kosong", {
          position: toast.POSITION.TOP_RIGHT,
          pauseOnHover: false,
          autoClose: 1000,
        });
        setIsDisabled(false);
      } else if (sisastok === "batalkan") {
        toast.warning("Jumlah Tidak Boleh Melebihi Qty yang Tersedia", {
          position: toast.POSITION.TOP_RIGHT,
          pauseOnHover: false,
          autoClose: 1000,
        });
        setIsDisabled(false);
      } else if (DefectModelIDProduk === "" || DefectModelIDProduk === null) {
        toast.warning("Product Tujuan Tidak Boleh Kosong", {
          position: toast.POSITION.TOP_RIGHT,
          pauseOnHover: false,
          autoClose: 1000,
        });
        setIsDisabled(false);
      } else {
        await axios
          .post(`${process.env.NEXT_PUBLIC_HOST}/v1/transferstokdefect`, {
            idproduk_lama: idtransferproductdefect,
            idproduk_baru: DefectModelIDProduk,
            gudang_pengirim: waretransferproductdefect,
            gudang_tujuan: warehousetujuan,
            variasitransfer: data.variasitransferdefect,
            users: Name,
          })
          .then(function (response) {
            loaddataproduk(Warehouse, Query, area, Role, Urutan, Brand);
            setIsDisabled(false);
            setValue("variasitransferdefect", "");
          });
        setIsDisabled(false);

        toast.success("Transfer Defect Berhasil", {
          position: toast.POSITION.TOP_RIGHT,
          pauseOnHover: false,
          autoClose: 1000,
        });

        settransferdefectModal(false);
      }
    }

  };

  async function showtransferModal(
    id: any,
    produk: any,
    id_produk: any,
    brand: any,
    kategori: any,
    kualitas: any,
    harga: any,
    img: any,
    variation: any,
    gudang_pengirim: any,
    ware: any,
    index: number
  ) {
    settransferproduct(produk);
    setidtransferproduct(id_produk);
    setwaretransferproduct(ware);
    setnotwarehouse(ware);

    clearErrors();
    setValue("transferwaretujuan", "");
    setValue("gudangpengirim", gudang_pengirim);

    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/getsizesales`, {
        idware: ware,
        idproduct: id_produk,
      })
      .then(function (response) {
        unregister("variasitransfer");
        setdatasize(response.data.result.datasize);
        settransferModal(true);
      });
  }

  async function setSyncApi(id_produk: any, detail: any) {
    const promo = stockpromo;

    const product = productapi.find((product: any) => product.spu === id_produk);

    let stockList: any = [];
    product.variationBriefs.forEach((vars: any) => {
      const product = detail.find((details: any) => details.size === vars.sku.split('.')[1]);
      const productpromo = promo.find((promos: any) => promos.masterSku.split('.')[1] === vars.sku.split('.')[1]);
      stockList.push({
        masterSku: product.id_produk + "." + product.size,
        action: "OVER_WRITE",
        quantity: product.qty - productpromo.promotionStock,
        warehouseId: warehouseApi,
        shelfInventoryId: "",
        remark: "from openapi",
      });
    });

    await axios({
      method: "POST",
      url: "/api/getsyncstock",
      data: {
        request_uri: "/openapi/v1/oms/stock/available-stock/update",
        params: {
          stockList: stockList,
        },
      },
    })
      .then(function (response) {
        if (response.data.code === "SUCCESS") {
          toast.success("Stock Marketplace Telah Disesuaikan", {
            position: toast.POSITION.TOP_RIGHT,
            pauseOnHover: false,
            autoClose: 750,
          });
        } else {
          toast.error("Stock Marketplace Gagal Disesuaikan", {
            position: toast.POSITION.TOP_RIGHT,
            pauseOnHover: false,
            autoClose: 750,
          });
        }
      })
      .catch(function (error) {
        console.log(error);
      });
  }

  const onSubmitTransfer = async (data: any) => {
    setIsDisabled(true);
    var qty_all = 0;
    for (let index = 0; index < data.variasitransfer.length; index++) {
      var hitungsisa = data.variasitransfer[index].stok_lama - data.variasitransfer[index].stok_baru;
      qty_all = qty_all + parseInt(data.variasitransfer[index].stok_baru);

      if (data.variasitransfer[index].stok_baru > 0) {
        if (hitungsisa < 0) {
          if (hitungsisa < 0) {
            var sisastok = "batalkan";
          } else {
            var sisastok = "proses";
          }
        } else {
          var sisastok = "proses";
        }
      }
    }

    if (qty_all < 1) {
      toast.warning("Jumlah Total Quantity Tidak Boleh Kosong", {
        position: toast.POSITION.TOP_RIGHT,
        pauseOnHover: false,
        autoClose: 1000,
      });
      setIsDisabled(false);
    } else if (sisastok === "batalkan") {
      toast.warning("Jumlah Tidak Boleh Melebihi Qty yang Tersedia", {
        position: toast.POSITION.TOP_RIGHT,
        pauseOnHover: false,
        autoClose: 1000,
      });
      setIsDisabled(false);
    } else {
      await axios
        .post(`${process.env.NEXT_PUBLIC_HOST}/v1/transferstok`, {
          idproduk: idtransferproduct,
          gudang_pengirim: waretransferproduct,
          gudang_tujuan: data.transferwaretujuan,
          variasitransfer: data.variasitransfer,
          user: Name,
        })
        .then(function (response) {
          loaddataproduk(Warehouse, Query, area, Role, Urutan, Brand);
          setIsDisabled(false);
          // gethistoripotransfer();
        });
      setIsDisabled(false);

      toast.success("Transfer berhasil", {
        position: toast.POSITION.TOP_RIGHT,
        pauseOnHover: false,
        autoClose: 2000,
      });

      settransferModal(false);
    }
  };

  const [repeatProduct, setrepeatProduct] = React.useState("");
  const [datasize, setdatasize] = React.useState([]);
  const [data_po, setdata_po]: any = React.useState([]);
  const [tipepo, settipepo] = React.useState("");
  const [tipeso, settipeso] = React.useState("");
  const [gudang, setgudang] = React.useState(null);

  const [list_hargabeli, setlist_hargabeli]: any = React.useState([]);

  async function showstockopname(
    id: any,
    produk: any,
    id_produk: any,
    brand: any,
    kategori: any,
    kualitas: any,
    harga: any,
    img: any,
    variation: any,
    gudang_pengirim: any,
    ware: any,
    index: number
  ) {
    setid(id);
    setValue("edit_produk", produk);
    setValue("edit_brand", brand);
    setValue("id_produk", id_produk);
    setValue("edit_kategori", kategori);
    setValue("edit_kualitas", kualitas);
    setValue("harga_beli", 0);
    setValue("id_gudang_pengirim", ware);
    setValue("gudang_pengirim", gudang_pengirim);

    clearErrors();
    settipeso("");
    setValue("tipe_so", "");
    setValue("harga_beli_so", "");

    setgudang(gudang_pengirim);
    setrepeatProduct(produk);

    unregister("variasirestock");

    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/gethargabeliso`, {
        idware: ware,
        idproduct: id_produk,
      })
      .then(function (response) {
        setlist_hargabeli(response.data.result);
      });

    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/getsizesales`, {
        idware: ware,
        idproduct: id_produk,
      })
      .then(function (response) {
        unregister("variasirestock");
        setdatasize(response.data.result.datasize);
      });

    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/gethistorisoselected`, {
        idware: ware,
        idproduct: id_produk,
      })
      .then(function (response) {
        setdata_po(response.data.result);
      });
    // historiso_mutate();
    setstockopname(true);

    setProduk(index);
  }

  const onSubmitSO = async (data: any) => {
    setIsDisabled(true);
    var qty_all = 0;
    for (let index = 0; index < data.variasirestock.length; index++) {
      qty_all = qty_all + parseInt(data.variasirestock[index].stok_gudang);
    }

    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/stockopname`, {
        data: data,
        users: Name,
      })
      .then(function (response) {
        loaddataproduk(Warehouse, Query, area, Role, Urutan, Brand);
        unregister("variasirestock");
        setIsDisabled(false);
        toast.success("Repeat berhasil", {
          position: toast.POSITION.TOP_RIGHT,
          pauseOnHover: false,
          autoClose: 1000,
        });
        setstockopname(false);
      });
    // }
  };

  async function showrepeatModal(
    id: any,
    produk: any,
    id_produk: any,
    brand: any,
    kategori: any,
    kualitas: any,
    harga: any,
    img: any,
    variation: any,
    gudang_pengirim: any,
    ware: any,
    index: number
  ) {
    setid(id);
    setValue("edit_produk", produk);
    setValue("edit_brand", brand);
    setValue("id_produk", id_produk);
    setValue("edit_kategori", kategori);
    setValue("edit_kualitas", kualitas);
    setValue("harga_beli", 0);
    setValue("id_gudang_pengirim", ware);
    setValue("gudang_pengirim", gudang_pengirim);
    setimg(`${process.env.NEXT_PUBLIC_HOST}/public/images/${img}`);
    clearErrors();
    settipepo("");
    setValue("tipe_po", "");
    setValue("supplier_pobaru", "");

    setgudang(gudang_pengirim);
    setrepeatProduct(produk);

    unregister("variasirestock");

    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/getsizesales`, {
        idware: ware,
        idproduct: id_produk,
      })
      .then(function (response) {
        unregister("variasirestock");
        setdatasize(response.data.result.datasize);
      });

    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/gethistoriposelected`, {
        idware: ware,
        idproduct: id_produk,
      })
      .then(function (response) {
        setdata_po(response.data.result);
      });

    setrepeatModal(true);

    setProduk(index);
  }

  const onSubmitRepeat = async (data: any) => {
    setIsDisabled(true);
    var qty_all = 0;
    for (let index = 0; index < data.variasirestock.length; index++) {
      qty_all = qty_all + parseInt(data.variasirestock[index].stok_baru);
    }

    if (qty_all < 1) {
      toast.warning("Jumlah Total Quantity Tidak Boleh Kosong", {
        position: toast.POSITION.TOP_RIGHT,
        pauseOnHover: false,
        autoClose: 2000,
      });
      setIsDisabled(false);
    } else {
      await axios
        .post(`${process.env.NEXT_PUBLIC_HOST}/v1/repeatstok`, {
          data: data,
          users: Name,
        })
        .then(function (response) {
          loaddataproduk(Warehouse, Query, area, Role, Urutan, Brand);
          setValue("harga_beli_repeat", null);
          unregister("variasirestock");
          setIsDisabled(false);
        });

      toast.success("Repeat berhasil", {
        position: toast.POSITION.TOP_RIGHT,
        pauseOnHover: false,
        autoClose: 2000,
      });

      setrepeatModal(false);
    }
  };

  function showdeleteModal(
    id_produk: any,
    produk: any,
    id_ware: any,
    index: number
  ) {
    setid(id_produk);
    setidware(id_ware);
    setproduk_name(produk);
    setdelModal(true);
  }

  async function deleteData() {
    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/deleteproduk`, { id, idware })
      .then(function (response) {
        loaddataproduk(Warehouse, Query, area, Role, Urutan, Brand);
      });

    toast.success("Data berhasil dihapus", {
      position: toast.POSITION.TOP_RIGHT,
      pauseOnHover: false,
      autoClose: 2000,
    });

    setdelModal(false);
  }

  const [Count, setCount] = useState(0);
  const [Produk, setProduk] = useState(0);
  const [produk_name, setproduk_name] = useState(null);
  const list_produk: any = [];
  const [openAction, setOpenAction] = useState<number | null>(null);

  if (!isLoading) {
    var product_counts = data_produk.length;
    data_produk.map((data_produk: any, index: any) => {
      return list_produk.push(
        <div key={index} >
          <div className="flex flex-wrap mb-2 group hover:shadow-lg ">
            <div className="bg-white flex flex-row basis-full h-[full] rounded-tl-lg rounded-tr-lg items-center group-hover:drop-shadow-primary transition-filter px-5">
              <div className="basis-1/12 text-center font-bold">
                {(page - 1) * limit + index + 1}
              </div>
              <div className="basis-full flex flex-row items-center h-full pt-2 pb-1 pl-2">
                {screenSize.width > 1200 ? (
                  <>
                    <div className="aspect-square max-w-[80px] rounded  items-center">
                      <Image
                        className="w-[100%] h-full rounded"
                        src={`${process.env.NEXT_PUBLIC_HOST}/public/images/${data_produk.img}`}
                        alt="product-1"
                        height="500"
                        width="500"
                        priority
                      />
                    </div>
                  </>) : null}
                <div className="flex flex-col ml-2">
                  <div className="text-xs">
                    #{data_produk.id_produk} | {data_produk.brand[0]["brand"]} |  {data_produk.category[0]["category"]}

                  </div>
                  <div className="text-sm font-medium">
                    {data_produk.produk}
                  </div>
                  <div className="text-xs flex flex-row">
                    <div className="basis-1">Warehouse </div> <div className="grow">&nbsp;: {data_produk.warehouse[0].warehouse}</div>

                  </div>

                </div>
              </div>
              <div className="basis-1/4 font-semibold italic text-left">
                <div className="text-xs flex flex-row">
                  <div className="basis-16">GR</div> <div className="basis-1/2">&nbsp;: {Rupiah.format(parseInt(data_produk.g_price) + parseInt(data_produk.upprice_g_price))}</div>
                </div>
                <div className="text-xs flex flex-row">
                  <div className="basis-16"> RS</div> <div className="basis-1/2">&nbsp;: {Rupiah.format(parseInt(data_produk.r_price) + parseInt(data_produk.upprice_r_price))}</div>
                </div>
                <div className="text-xs mb-1 flex flex-row">
                  <div className="basis-16"> NOR</div> <div className="basis-1/2">&nbsp;: {Rupiah.format(parseInt(data_produk.n_price) + parseInt(data_produk.upprice_n_price))}</div>
                </div>
              </div>

              <div className="basis-1/6">
                <div className="flex flex-wrap justify-center items-center h-full pt-2 md:pt-4 md:pb-[15px] px-4 ">
                  {data_produk.countqty < 1 ? (
                    <>
                      <button
                        className="cursor-pointer text-red-600 font-bold hover:underline focus:underline"
                      >
                        <i>STOCK 0</i>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="cursor-pointer text-green-600 font-medium hover:underline focus:underline"

                        onClick={() => {
                          toogleActive(index)
                          // getwarehouseAPI(data_produk.id_produk)
                        }}
                      >
                        {data_produk.countqty < 1
                          ? 0
                          : data_produk.countqty}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {screenSize.width > 1200 ? (
                <>
                  <div className="basis-1/6 text-center relative">

                    {/* ICON LIST */}
                    <button
                      onClick={() =>
                        setOpenAction(openAction === index ? null : index)
                      }
                      className="p-2 rounded-lg hover:bg-gray-100 transition"
                    >
                      <i className="fi fi-rr-menu-burger text-xl text-gray-700"></i>
                    </button>

                    {/* DROPDOWN */}
                    {openAction === index && (
                      <div className="absolute right-0 top-10 z-50 w-[190px]
                    bg-white border rounded-xl shadow-xl
                    text-left overflow-hidden">
                        {/* ================= EDIT ================= */}
                        {"SUPER-ADMIN" === Cookies.get("auth_role") ||
                          "HEAD-AREA" === Cookies.get("auth_role") ||
                          "HEAD-WAREHOUSE" === Cookies.get("auth_role") ||
                          "HEAD-STORE" === Cookies.get("auth_role") ||
                          "CASHIER" === Cookies.get("auth_role") ? (
                          <button
                            className="dropdown-btn text-blue-600"
                            onClick={() => {
                              setOpenAction(null);
                              showeditModal(
                                data_produk.id,
                                data_produk.produk,
                                data_produk.id_brand,
                                data_produk.id_category,
                                data_produk.quality,
                                data_produk.g_price,
                                data_produk.r_price,
                                data_produk.n_price,
                                data_produk.img,
                                index
                              );
                            }}
                          >
                            <i className="fi fi-rr-edit" />
                            <span>Edit Product</span>
                          </button>
                        ) : null}

                        {/* ================= DELETE ================= */}
                        {"SUPER-ADMIN" === Cookies.get("auth_role") ||
                          "HEAD-AREA" === Cookies.get("auth_role") ? (
                          <button
                            className="dropdown-btn text-red-600"
                            onClick={() => {
                              setOpenAction(null);
                              showdeleteModal(
                                data_produk.id_produk,
                                data_produk.produk,
                                data_produk.id_ware,
                                index
                              );
                            }}
                          >
                            <i className="fi fi-rr-trash" />
                            <span>Delete Product</span>
                          </button>
                        ) : null}

                        <div className="border-t my-1" />

                        {/* ================= SUPER ADMIN / HEAD AREA ================= */}
                        {
                          "SUPER-ADMIN" === Cookies.get("auth_role") ||
                            "HEAD-AREA" === Cookies.get("auth_role") ? (
                            <>

                              <button
                                className="dropdown-btn text-green-600"
                                onClick={() => {
                                  setOpenAction(null);
                                  showrepeatModal(
                                    data_produk.id,
                                    data_produk.produk,
                                    data_produk.id_produk,
                                    data_produk.id_brand,
                                    data_produk.id_category,
                                    data_produk.quality,
                                    data_produk.n_price,
                                    data_produk.img,
                                    data_produk.detail_variation.length,
                                    data_produk.warehouse[0].warehouse,
                                    data_produk.id_ware,
                                    index
                                  );
                                }}
                              >
                                <i className="fi fi-rr-arrows-repeat" />
                                <span>Restock</span>
                              </button>

                              <button
                                className="dropdown-btn text-red-600"
                                onClick={() => {
                                  setOpenAction(null);
                                  showtransferdefectModal(
                                    data_produk.id,
                                    data_produk.produk,
                                    data_produk.id_produk,
                                    data_produk.id_brand,
                                    data_produk.id_category,
                                    data_produk.quality,
                                    data_produk.n_price,
                                    data_produk.img,
                                    data_produk.detail_variation.length,
                                    data_produk.warehouse[0].warehouse,
                                    data_produk.id_ware,
                                    index
                                  );
                                }}
                              >
                                <i className="fi fi-rs-move-to-folder-2" />
                                <span>Defect</span>
                              </button>

                              <button
                                className="dropdown-btn text-orange-500"
                                onClick={() => {
                                  setOpenAction(null);
                                  showstockopname(
                                    data_produk.id,
                                    data_produk.produk,
                                    data_produk.id_produk,
                                    data_produk.id_brand,
                                    data_produk.id_category,
                                    data_produk.quality,
                                    data_produk.n_price,
                                    data_produk.img,
                                    data_produk.detail_variation.length,
                                    data_produk.warehouse[0].warehouse,
                                    data_produk.id_ware,
                                    index
                                  );
                                }}
                              >
                                <i className="fi fi-br-rotate-right" />
                                <span>Stock Opname</span>
                              </button>

                              <button
                                className="dropdown-btn text-blue-600"
                                onClick={() => {
                                  setOpenAction(null);
                                  showtransferModal(
                                    data_produk.id,
                                    data_produk.produk,
                                    data_produk.id_produk,
                                    data_produk.id_brand,
                                    data_produk.id_category,
                                    data_produk.quality,
                                    data_produk.n_price,
                                    data_produk.img,
                                    data_produk.detail_variation.length,
                                    data_produk.warehouse[0].warehouse,
                                    data_produk.id_ware,
                                    index
                                  );
                                }}
                              >
                                <i className="fi fi-rr-sign-in-alt" />
                                <span>Transfer</span>
                              </button>

                            </>
                          ) : null
                        }

                        {/* ================= HEAD WAREHOUSE ================= */}
                        {
                          "HEAD-WAREHOUSE" === Cookies.get("auth_role") &&
                            data_produk.id_ware === Cookies.get("auth_store") ? (
                            <>
                              {/* sama persis seperti di atas */}
                            </>
                          ) : null
                        }

                        {/* ================= NO ACCESS ================= */}
                        {
                          "HEAD-WAREHOUSE" === Cookies.get("auth_role") &&
                            data_produk.id_ware !== Cookies.get("auth_store") ? (
                            <div className="px-4 py-3 text-center text-red-600 text-xs italic">
                              NO ACCESS
                            </div>
                          ) : null
                        }

                      </div>
                    )}
                  </div>
                </>) : null}
            </div >

          </div>
          <div className="mb-2 group hover:shadow-lg rounded-lg -mt-2  transition-filter">
            <div className=" items-center basis-1/6">
              <Collapse isOpened={openSize === index} >
                <div className="flex flex-row  justify-center ">

                  <div className="border-b-0  rounded-br-lg rounded-bl-lg px-2 py-2 bg-white gap-2 w-[100%] border-t-2 mb-2">
                    <div className="flex flex-row">
                      {(function (rows: any, i, len) {
                        while (++i <= data_produk.detail_variation.length) {
                          rows.push(
                            <div key={i} className="grow flex flex-row w-[50px] item-center justify-center">
                              {data_produk.detail_variation[i - 1].sizes != null ? (
                                <>
                                  <div
                                    className={`${data_produk.detail_variation[i - 1].qty === '0' || data_produk.id_waress === data_produk.detail_variation[i - 1].id_ware && data_produk.sizes === data_produk.detail_variation[i - 1].size
                                      ? "text-red-600 bg-red-50"
                                      : "text-black"
                                      } font-semibold text-sm grow text-center border rounded-md w-[full]`}
                                  >
                                    {data_produk.detail_variation[i - 1].size} :  <span className={`${data_produk.detail_variation[i - 1].qty === '0' || data_produk.id_waress === data_produk.detail_variation[i - 1].id_ware && data_produk.sizes === data_produk.detail_variation[i - 1].size
                                      ? "text-red-600 bg-red-50"
                                      : "text-black"
                                      } font-semibold text-sm grow text-center w-[full] `}>{data_produk.detail_variation[i - 1].qty}</span>
                                  </div>
                                </>) : (
                                <>
                                  <div
                                    className={`${data_produk.detail_variation[i - 1].qty === '0' || data_produk.id_waress === data_produk.detail_variation[i - 1].id_ware && data_produk.sizes === data_produk.detail_variation[i - 1].size
                                      ? "text-red-600 bg-red-50"
                                      : "text-black"
                                      } font-semibold text-sm grow text-center border rounded-md w-[full]`}
                                  >
                                    {data_produk.detail_variation[i - 1].size} :  <span className={`${data_produk.detail_variation[i - 1].qty === '0' || data_produk.id_waress === data_produk.detail_variation[i - 1].id_ware && data_produk.sizes === data_produk.detail_variation[i - 1].size
                                      ? "text-red-600 bg-red-50"
                                      : "text-black"
                                      } font-semibold text-sm grow text-center w-[full]`}>{data_produk.detail_variation[i - 1].qty}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        }
                        return rows;
                      })([], 0, index + 1)}
                    </div>

                    <div className="border-t-2 mt-2 w-[100%] ">
                    </div>


                    {data_produk.id_waress === data_produk.id_ware ? (
                      <>
                        <div className="text-center mt-2 border rounded-lg bg-red-300">
                          <span className="font-semibold text-md ">Stock Display {data_produk.sizes} : </span>
                          <span className="font-semibold text-md ">{data_produk.qtyss}</span>
                        </div>
                      </>) : null}
                  </div><br />

                </div>
              </Collapse>
            </div>
          </div>
        </div >
      );
    });
  }


  const [hitungdata, sethitungdata] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  const inputRef = useRef(null);

  const handleClick = async () => {
    inputRef.current.click();
    // await trigger();
  };

  const imageChange = (e: any) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedImage(e.target.files[0]);
    }
  };

  async function printSo() {
    if (warehouse_so === "") {
      toast.warning("Harap Pilih Gudang", {
        position: toast.POSITION.TOP_RIGHT,
        pauseOnHover: false,
        autoClose: 2000,
      });
    } else {
      await axios({
        method: "POST",
        url: `${process.env.NEXT_PUBLIC_HOST}/v1/print_stockopname`,
        data: {
          id_ware: warehouse_so,
        },
      })
        .then(function (response) {
          sethitungdata(response.data.result[0].total);
          blob_so(response.data.result)
          var hitungtotalqty = 0;
          for (let index = 0; index < response.data.result.length; index++) {
            hitungtotalqty = hitungtotalqty + parseInt(response.data.result[index].total_qty);
          }

          toast.warning("Total Data Produk Ada " + response.data.result[0].total + " Produk " + hitungtotalqty + " Pcs" + " & Akan Melakukan Open New Tab Sebanyak " + Math.ceil(response.data.result[0].total / 200) + " Kali", {
            position: toast.POSITION.BOTTOM_CENTER,
            pauseOnHover: true,
            autoClose: 3000,
          });

          setisLoading(false);
        })
        .catch(function (error) {
          console.log(error);
        });
    }
  }

  function chunkArray(array: any[], chunkSize: number): any[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }


  async function blob_so(items: any) {
    const chunkSize = 200; // Tentukan ukuran chunk
    const dataChunks = chunkArray(items, chunkSize);

    for (let i = 0; i < dataChunks.length; i++) {
      const chunk = dataChunks[i];

      await axios
        .post(`https://4mediakreatif.site/print_so_cloth`, {
          items: chunk,
          warehouse: items[0]['warehouse'],
        }, {
          withCredentials: false,
          responseType: 'blob',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        .then(function (response) {
          //Create a Blob from the PDF Stream
          setTimeout(function () {
            const file = new Blob(
              [response.data],
              { type: 'application/pdf' });
            //Build a URL from the file
            const fileURL = URL.createObjectURL(file);
            //Open the URL on new Window
            window.open(fileURL);
          }, 2000);
        })
        .catch(function (error) {
          console.error('Error while sending chunk', error);
        });
    }
  }

  const canSeeAction =
    Cookies.get("auth_role") === "SUPER-ADMIN" ||
    Cookies.get("auth_role") === "HEAD-AREA" ||
    Cookies.get("auth_role") === "HEAD-BRAND" ||
    Cookies.get("auth_role") === "HEAD-WAREHOUSE";

  const isDesktop = screenSize.width > 1200;

  return (
    <div className="p-2 h-[100%] max-h-full overflow-y-auto pl-10 pr-5">
      {/* <div className="font-bold text-3xl">Products List</div> */}

      {/* <span> {JSON.stringify(datasize)}</span> */}

      <div className="">
        <ToastContainer className="mt-[50px]" />
        {"SUPER-ADMIN" === Cookies.get("auth_role") ||
          "HEAD-AREA" === Cookies.get("auth_role") ||
          "HEAD-BRAND" === Cookies.get("auth_role") ||
          "HEAD-WAREHOUSE" === Cookies.get("auth_role") ? (
          <>
            <div className="mt-0 mb-3 ">
              <div className=" flex flex-row mt-0 gap-3 text-black">
                <div className="basis-1/2 bg-white border border-gray-300 h-[110px] rounded-lg shadow-md hover:shadow-[0px_10px_11px_1px_#2125291A]">
                  <div className="text-md font-semibold py-4  px-5 ">
                    Total Item
                  </div>
                  <div className="flex flex-row text-left  mt-2">
                    <div className="basis-full text-2xl font-semibold py-0 px-5">
                      {total_produk ? total_produk : 0}
                    </div>
                    <div className=" basis-auto mt-1 mx-5">
                      <ClipboardDocumentIcon className="h-10 w-10 -mt-3 text-black text-right" />
                    </div>
                  </div>
                </div>
                <div className="basis-1/2 bg-white border border-gray-300 h-[110px] rounded-lg shadow-md hover:shadow-[0px_10px_11px_1px_#2125291A]">
                  <div className="text-md font-semibold py-4  px-5">
                    Total Qty
                  </div>
                  <div className="flex flex-row text-left  mt-2">
                    <div className="basis-full text-2xl font-semibold py-0 px-5">
                      {sum_produk ? sum_produk : 0}
                    </div>
                    <div className=" basis-auto mt-1 mx-5">
                      <Box className="h-10 w-10 -mt-3 text-black text-right" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap items-center content-center mb-3 mt-3 gap-1">

          <div className="shadow grow rounded-lg  flex flex-row text-center content-center">
            <input
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value === "") {
                  setQuery("all");
                  loaddataproduk(Warehouse, "all", area, Role, Urutan, Brand);
                }
              }}
              onKeyDown={keyDown}
              disabled={isLoading}
              className="h-[45px] border-0 grow py-2 pl-5 pr-3 text-gray-700 focus:outline-none rounded-l-lg"
              type="text"
              placeholder="Search..."
            />

            <button
              type="button"
              disabled={isLoading}
              className={`rounded-r-lg bg-white basis-1/8 hover:bg-gray-200 h-[45px] text-gray-700 font-medium px-5`}
              onClick={() => {
                if (Query != "all") {
                  loaddataproduk(Warehouse, Query, area, Role, Urutan, Brand);
                }
              }}
            >
              <div className="my-auto">
                {isLoading === true ? (
                  <>
                    <fa.FaArrowsAlt size={17} className={`${isLoading ? "animate-spin" : ""}  text-gray-700`} />
                  </>
                ) : (
                  <>
                    <fa.FaSearch size={17} className={`${isLoading ? "animate-spin" : ""}  text-gray-700`} />
                  </>
                )}
              </div>
            </button>
          </div>

          <div className=" grow rounded-lg flex flex-row text-center content-center bg-red-200">
            <select
              value={Warehouse}
              onChange={(e) => {
                setWarehouse(e.target.value);
                // loaddataproduk(e.target.value, Query, area, Role, loadmorelimit - 20, Urutan, Brand);

                loaddataproduk(e.target.value, Query, area, Role, Urutan, Brand);
              }}
              className={`appearance-none grow border h-[45px] px-5 text-gray-700 focus:outline-none rounded-lg`}>
              {"SUPER-ADMIN" === Cookies.get("auth_role") ? (
                <>
                  <option value="all">All Warehouse</option>
                  {list_warehouse}
                </>
              ) : "HEAD-AREA" === Cookies.get("auth_role") || "HEAD-WAREHOUSE" === Cookies.get("auth_role") ? (
                <>
                  <option value="all_area">All Warehouse</option>
                  {list_warehouse}
                </>
              ) : (
                <>
                  <option value="all">All Warehouse</option>
                  {list_warehouse}
                </>
              )}
            </select>
          </div>

          <select
            value={Urutan}
            onChange={(e) => {
              setUrutan(e.target.value);
              loaddataproduk(Warehouse, Query, area, Role, e.target.value, Brand);
            }}
            className={`appearance-none grow border h-[45px] w-[20%] px-5 text-gray-700 focus:outline-none rounded-lg`}
          >
            <option value="all">Basic Stock</option>
            <option value="asc">Least Stock A - Z</option>
            <option value="desc">Most Stock Z - A</option>
          </select>

          {screenSize.width > 1200 ? (
            <>
              <div className="grow flex flex-row items-center justify-end"
              >
                {"SUPER-ADMIN" === Cookies.get("auth_role") ||
                  "HEAD-AREA" === Cookies.get("auth_role") ||
                  "HEAD-BRAND" === Cookies.get("auth_role") ||
                  "HEAD-WAREHOUSE" === Cookies.get("auth_role") ? (
                  <>
                    <button
                      onClick={() => {
                        setwarehouse_so("");
                        setshowModalPrintSO(true);
                      }}
                      type="button"
                      className="ml-3 shadow rounded-lg w-[200px] bg-green-600 hover:bg-green-800 h-[45px] text-white px-4 flex flex-wrap gap-2 content-center items-center justify-center"
                    >
                      Print Stock Opname<fa.FaBook size={13} className="text-white" />
                    </button>
                  </>
                ) : null}

                {"SUPER-ADMIN" === Cookies.get("auth_role") ||
                  "HEAD-AREA" === Cookies.get("auth_role") ||
                  "HEAD-BRAND" === Cookies.get("auth_role") ||
                  "HEAD-WAREHOUSE" === Cookies.get("auth_role") ? (
                  <>
                    <Link href="add_produk">
                      <button
                        type="button"
                        className="ml-3 shadow rounded-lg bg-black hover:bg-gray-600 h-[45px] text-white px-4 flex flex-wrap gap-2 content-center"
                      >
                        Add Product
                        <div className="my-auto">
                          <fa.FaPlus size={13} className="text-white" />
                        </div>
                      </button>
                    </Link>
                  </>
                ) : null}
              </div>
            </>) : null}
        </div>
        <div className="items-center content-center mb-3 mt-3 gap-10 scroll-m-96">
          <div className="bg-[#323232] flex flex-row h-[42px] rounded-lg font-bold text-white items-center px-5 text-sm">

            {/* Product */}
            <div className="basis-1/12 text-center">
              No
            </div>
            <div className="basis-full">
              Product Detail
            </div>

            {/* Price */}
            <div className="basis-1/4 text-center -ml-36">
              Price
            </div>

            {/* Stock */}
            <div className="basis-1/6 text-center">
              Stock
            </div>

            {/* Action */}
            {canSeeAction && isDesktop && (
              <div className="basis-1/6 text-center">
                Act
              </div>
            )}

          </div>
        </div>
        <div className="items-center content-center mb-3 mt-3 gap-10">
          {(function () {
            if (product_counts < 1) {
              return (
                <div className="w-[100%] py-3 text-center mt-10">
                  Products are not yet available, please select a warehouse..
                </div>
              );
            } else {
              return list_produk;
            }
          })()}
        </div>

        {
          transferdefectModal ? (
            <>
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                <div className="relative mt-[50px] mb-[40px] mx-auto w-[60%]">
                  {/*content*/}
                  <div className="border-0 rounded-lg shadow-lg relative flex flex-col bg-white outline-none focus:outline-none w-[100%]">
                    {/*header*/}
                    <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-slate-200 rounded-t">
                      <span className="text-base font-semibold">
                        Defect Stock : {transferdefectproduct}
                      </span>
                    </div>

                    {/* <span className="text-xs px-3">{JSON.stringify(watch())}</span> */}
                    {/*body*/}
                    <div className="p-6 gap-4 flex flex-auto h-[auto]">
                      <div className="w-[33%] text-sm flex flex-col pb-3">
                        <div className="grow">
                          <div className="text-xs mb-3">
                            <label>Produk:</label>
                            <div className="mt-1 flex flex-wrap items-center justify-end">
                              <Select
                                className="w-full"
                                options={options}
                                onChange={(e: any) => {
                                  setdefectModelProduk(e.value.split("#")[0]);
                                  setdefectModelIDProduk(e.value.split("#")[1]);
                                }}
                                placeholder="Select Products.."
                                required={true}
                              />
                            </div>
                          </div>
                          <div className="">
                            <label className="text-xs">Gudang Pengirim</label>
                            <input
                              readOnly
                              {...register("defect_gudangpengirim", { required: true })}
                              className={`${errors.defect_gudangpengirim
                                ? "border-red-500 border-2"
                                : "border"
                                } appearance-none border h-[30px] mt-2 w-[100%] pr-3 pl-5 text-gray-700 focus:outline-none rounded-lg`}
                            ></input>
                          </div>


                          {"HEAD-WAREHOUSE" === Cookies.get("auth_role") ?
                            (<>
                              <div className="mt-3">
                                <label className="text-xs">Gudang Penerima</label>
                                <div className="mt-2 flex flex-wrap items-center justify-end">
                                  <select
                                    value={gudangdefectawal}
                                    {...register("defect_transferwaretujuan", {
                                    })}
                                    className={`${errors.defect_transferwaretujuan
                                      ? "border-red-500 border-2"
                                      : "border"
                                      } appearance-none border h-[30px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                                  >
                                    <option value="">{gudangdefectawal}</option>

                                  </select>
                                  <i className="fi fi-rr-angle-small-down w-[1.12rem] h-[1.12rem] text-center text-gray-500 text-[1.12rem] leading-4 absolute mr-5"></i>
                                </div>
                                {/* {errors.defect_transferwaretujuan && (
                                  <div className="mt-1 text-sm italic">
                                    This field is required
                                  </div>
                                )} */}
                              </div>
                            </>
                            )
                            :
                            (
                              <>
                                <div className="mt-3">
                                  <label className="text-xs">Gudang Penerima</label>
                                  <div className="mt-2 flex flex-wrap items-center justify-end">
                                    <select
                                      {...register("defect_transferwaretujuan", {
                                      })}
                                      className={`${errors.defect_transferwaretujuan
                                        ? "border-red-500 border-2"
                                        : "border"
                                        } appearance-none border h-[30px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                                    >
                                      <option value="">Pilih Gudang Penerima</option>
                                      {list_warehouse}
                                    </select>
                                    <i className="fi fi-rr-angle-small-down w-[1.12rem] h-[1.12rem] text-center text-gray-500 text-[1.12rem] leading-4 absolute mr-5"></i>
                                  </div>

                                </div>
                              </>
                            )}
                        </div>
                      </div>

                      <div className="grow">
                        <table className="table table-auto bg-transparent text-sm w-full">
                          <thead className="bg-[#DDE4F0] text-gray-800 text-xs">
                            <tr className="">
                              <th className="py-2 rounded-l-lg">Size</th>
                              <th className="py-2">Stok Gudang</th>
                              <th className="py-2 rounded-r-lg">Stok Transfer</th>
                            </tr>
                          </thead>

                          <tbody className="group rounded-lg text-xs">
                            {datasize.map((datasizes, index) => {
                              return (
                                <tr key={index} className="rounded-lg h-auto mt-7">
                                  <td className="pt-2 p-0">
                                    <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                      <input
                                        readOnly
                                        defaultValue={datasizes.size}
                                        {...register(
                                          `variasitransferdefect.${index}.size`,
                                          { required: true }
                                        )}
                                        className="h-[100%] border w-[100%] pr-3 pl-5 mx-2 text-gray-700 focus:outline-none rounded-lg"
                                        type="text"
                                      />
                                    </div>
                                  </td>
                                  <td className="pt-2 p-0">
                                    <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                      <input
                                        readOnly
                                        defaultValue={datasizes.qty}
                                        {...register(
                                          `variasitransferdefect.${index}.stok_lama`,
                                          { required: true }
                                        )}
                                        className="h-[100%] border w-[100%] pr-3 pl-5 mx-2 text-gray-700 focus:outline-none rounded-lg"
                                        type="number"
                                      />
                                    </div>
                                  </td>
                                  <td className="pt-2 p-0">
                                    <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                      <input
                                        min={0}
                                        defaultValue={0}
                                        // {...register(
                                        //   `variasitransferdefect.${index}.stok_baru`,
                                        //   { required: true }
                                        // )}
                                        {...register(`variasitransferdefect.${index}.stok_baru`,
                                          {
                                            required: true, onChange: (e: any) => {
                                              if (e.target.value === "") {
                                                var n = 0;
                                              } else {
                                                var n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                                              }
                                              setValue(`variasitransferdefect.${index}.stok_baru`, n)
                                            }
                                          })}
                                        className="h-[100%] border w-[100%] pr-3 pl-5 mx-2 text-gray-700 focus:outline-none rounded-lg"
                                        type="number"
                                        placeholder="Size"
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        <div className="h-[10%] py-2 mt-3 w-full grid grid-cols-2 items-end justify-start">
                          <button
                            className="bg-red-500 text-white font-bold uppercase text-xs px-6 py-2.5 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={() => {
                              setSelectedImage(null);
                              settransferdefectModal(false);
                              setValue("variasitransferdefect", "");
                            }}
                          >
                            Close
                          </button>
                          <button
                            className="bg-emerald-500 text-white font-bold uppercase text-xs px-6 py-2.5 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={handleSubmit(onSubmitTransferdefect)}
                            disabled={isDisabled}
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
            </>
          ) : null
        }

        {
          showModal ? (
            <>
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                <div className="relative w-[1000px] max-w-[95vw] bg-white rounded-lg shadow-lg ">
                  {/*content*/}
                  {"SUPER-ADMIN" === Cookies.get("auth_role") ||
                    "HEAD-AREA" === Cookies.get("auth_role") ? (
                    <>
                      <div className="border-0 rounded-lg shadow-lg relative flex flex-col bg-white outline-none focus:outline-none w-[95vw] max-w-[1000px]">
                        {/*header*/}
                        <div className="flex items-start justify-between p-5 border-b border-solid border-slate-200 rounded-t">
                          <span className="text-xl font-semibold">Edit Product</span>
                        </div>
                        {/*body*/}
                        <div className="relative p-6 flex flex-auto">
                          <div className="w-[40%] mr-4">
                            <label className="block mb-2 text-sm font-medium text-black">
                              Photo Product
                            </label>
                            <div className="flex items-center justify-start">
                              <input
                                className="absolute w-0 opacity-0"
                                accept="image/*"
                                type="file"
                                onChange={imageChange}
                                ref={inputRef}
                              />

                              {selectedImage ? (
                                <div className="">
                                  <img
                                    src={URL.createObjectURL(selectedImage)}
                                    className="w-[20rem] h-[20rem] rounded-lg cursor-pointer"
                                    onClick={handleClick}
                                  />
                                </div>
                              ) : (
                                <div
                                  className="aspect-square m-auto w-[20rem] h-[20rem] border rounded-lg cursor-pointer"
                                  onClick={handleClick}
                                >
                                  <img
                                    src={img}
                                    className="w-[100%] h-[100%] rounded-lg cursor-pointer"
                                  />
                                </div>
                              )}
                            </div>

                            {/* <div className="text-xs italic text-gray-500 text-center mt-3">*Klik Foto untuk merubah Foto</div> */}
                          </div>

                          <div className="grow">
                            <div className="">
                              <label className="block mb-2 text-sm font-medium text-black">
                                Nama Produk
                              </label>
                              <input
                                className={`${errors.edit_produk
                                  ? "border-red-500 border-2"
                                  : "border"
                                  } h-[45px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                                type="text"
                                defaultValue=""
                                {...register("edit_produk", { required: true })}
                              />
                              {errors.edit_produk && (
                                <div className="mt-1 text-sm italic">
                                  This field is required
                                </div>
                              )}
                            </div>

                            <div className="mt-6">
                              <label className="block mb-2 text-sm font-medium text-black">
                                Brand
                              </label>
                              <select
                                {...register("edit_brand", { required: false })}
                                className={`appearance-none border h-[45px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                              >
                                <option value="">Pilih Brand</option>
                                {list_brand}
                              </select>
                              {errors.edit_brand && (
                                <div className="mt-1 text-sm italic">
                                  This field is required
                                </div>
                              )}
                            </div>

                            <div className="mt-6">
                              <label className="block mb-2 text-sm font-medium text-black">
                                Kategori
                              </label>
                              <select
                                {...register("edit_kategori", { required: false })}
                                className={`appearance-none border h-[45px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                              >
                                <option value="">Pilih Kategori</option>
                                {list_category}
                              </select>
                              {errors.edit_kategori && (
                                <div className="mt-1 text-sm italic">
                                  This field is required
                                </div>
                              )}
                            </div>

                            <div className="mt-6">
                              <label className="block mb-2 text-sm font-medium text-black">
                                Kualitas
                              </label>
                              <select
                                {...register("edit_kualitas", { required: false })}
                                className={`appearance-none border h-[45px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                              >
                                <option value="">Pilih Quality</option>
                                <option value="IMPORT">IMPORT</option>
                                <option value="LOKAL">LOKAL</option>
                                <option value="ORIGINAL">ORIGINAL</option>
                              </select>
                              {errors.edit_kualitas && (
                                <div className="mt-1 text-sm italic">
                                  This field is required
                                </div>
                              )}
                            </div>

                            <div className="mt-6">
                              <label className="block mb-2 text-sm font-medium text-black">
                                Harga Grosir
                              </label>
                              <CurrencyInput
                                className={`${errors.edit_g_price
                                  ? "border-red-500 border-2"
                                  : "border"
                                  } h-[45px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                                placeholder="Masukan Harga Beli"
                                defaultValue={0}
                                decimalsLimit={2}
                                groupSeparator="."
                                decimalSeparator=","
                                prefix="Rp "
                                {...register("edit_g_price", {
                                  required: true,
                                  // onChange(event) {
                                  //     setValue("harga_beli_repeat", event.target.value.replace(/\D/g, ""))
                                  // },
                                })}
                              />

                              {errors.edit_g_price && (
                                <div className="mt-1 text-sm italic">
                                  This field is required
                                </div>
                              )}

                            </div>

                            <div className="mt-6">
                              <label className="block mb-2 text-sm font-medium text-black">
                                Harga Reseller
                              </label>
                              <CurrencyInput
                                className={`${errors.edit_r_price
                                  ? "border-red-500 border-2"
                                  : "border"
                                  } h-[45px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                                placeholder="Masukan Harga Beli"
                                defaultValue={0}
                                decimalsLimit={2}
                                groupSeparator="."
                                decimalSeparator=","
                                prefix="Rp "
                                {...register("edit_r_price", {
                                  required: true,
                                  // onChange(event) {
                                  //     setValue("harga_beli_repeat", event.target.value.replace(/\D/g, ""))
                                  // },
                                })}
                              />

                              {errors.edit_r_price && (
                                <div className="mt-1 text-sm italic">
                                  This field is required
                                </div>
                              )}
                            </div>

                            <div className="mt-6">
                              <label className="block mb-2 text-sm font-medium text-black">
                                Harga Normal
                              </label>
                              <CurrencyInput
                                className={`${errors.edit_n_price
                                  ? "border-red-500 border-2"
                                  : "border"
                                  } h-[45px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                                placeholder="Masukan Harga Beli"
                                defaultValue={0}
                                decimalsLimit={2}
                                groupSeparator="."
                                decimalSeparator=","
                                prefix="Rp "
                                {...register("edit_n_price", {
                                  required: true,
                                  // onChange(event) {
                                  //     setValue("harga_beli_repeat", event.target.value.replace(/\D/g, ""))
                                  // },
                                })}
                              />

                              {errors.edit_n_price && (
                                <div className="mt-1 text-sm italic">
                                  This field is required
                                </div>
                              )}
                            </div>
                          </div>

                        </div>
                        {/*footer*/}
                        <div className="flex items-center justify-end p-6 border-t border-solid border-slate-200 rounded-b">
                          <button
                            className="text-red-500 background-transparent font-bold uppercase px-6 py-2 text-sm outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={() => {
                              setSelectedImage(null);
                              setShowModal(false);
                            }}
                          >
                            Close
                          </button>
                          <button
                            className="bg-emerald-500 text-white active:bg-emerald-600 font-bold uppercase text-sm px-6 py-3 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={handleSubmit(onSubmitUpdate)}

                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    </>) : (
                    <>
                      <div className="border-0 rounded-lg shadow-lg relative flex flex-col bg-white outline-none focus:outline-none w-[100vh]">
                        {/*header*/}
                        <div className="flex items-start justify-between p-5 border-b border-solid border-slate-200 rounded-t">
                          <span className="text-xl font-semibold">Edit Product</span>
                        </div>
                        {/*body*/}
                        <div className="relative p-6 flex flex-auto">
                          <div className="w-[40%] mr-4">
                            <label className="block mb-2 text-sm font-medium text-black">
                              Photo Product
                            </label>
                            <div className="flex items-center justify-start">
                              <input
                                className="absolute w-0 opacity-0"
                                accept="image/*"
                                type="file"
                                onChange={imageChange}
                                ref={inputRef}
                              />

                              {selectedImage ? (
                                <div className="">
                                  <img
                                    src={URL.createObjectURL(selectedImage)}
                                    className="w-[20rem] h-[20rem] rounded-lg cursor-pointer"
                                    onClick={handleClick}
                                  />
                                </div>
                              ) : (
                                <div
                                  className="aspect-square m-auto w-[20rem] h-[20rem] border rounded-lg cursor-pointer"
                                  onClick={handleClick}
                                >
                                  <img
                                    src={img}
                                    className="w-[100%] h-[100%] rounded-lg cursor-pointer"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {/*footer*/}
                        <div className="flex items-center justify-end p-6 border-t border-solid border-slate-200 rounded-b">
                          <button
                            className="text-red-500 background-transparent font-bold uppercase px-6 py-2 text-sm outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={() => {
                              setSelectedImage(null);
                              setShowModal(false);
                            }}
                          >
                            Close
                          </button>
                          <button
                            className="bg-emerald-500 text-white active:bg-emerald-600 font-bold uppercase text-sm px-6 py-3 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={handleSubmit(onSubmitUpdate)}

                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
            </>
          ) : null
        }

        {
          repeatModal ? (
            <>
              <div className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none focus:outline-none">
                <div className="mb-[40px] mx-auto w-[60%]">
                  {/*content*/}
                  <div className="border-0 rounded-lg shadow-lg flex flex-col bg-white outline-none focus:outline-none w-[100%]">
                    {/*header*/}
                    <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-slate-200 rounded-t">
                      <span className="text-base font-semibold">
                        Restock : {repeatProduct} | {gudang}
                      </span>
                    </div>

                    {/* <span className="text-xs px-3">{JSON.stringify(watch())}</span> */}
                    {/*body*/}
                    <div className="p-6 gap-4 flex flex-auto h-[auto]">
                      <div className="w-[33%] text-sm flex flex-col">
                        {/* <div className="flex flex-wrap items-center justify-end">
                      <select
                        {...register("tipe_po", { required: true })}
                        onChange={(e) => {
                          settipepo(e.target.value);
                          setValue("history_po", "");
                          setValue("supplier_pobaru", "");
                        }}
                        className={`${errors.tipe_po ? "border-red-500 border-2" : "border"
                          } appearance-none border h-[30px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                      >
                        <option value="">Tipe Purchase order</option>
                        <option value="PO_BARU">PO Baru</option>
                        <option value="PO_LANJUTAN">PO Lanjutan</option>
                      </select>
                      <i className="fi fi-rr-angle-small-down w-[1.12rem] h-[1.12rem] text-center text-gray-500 text-[1.12rem] leading-4 absolute mr-5"></i>
                    </div>
                    {errors.tipe_po && (
                      <div className="mt-1 text-sm italic">
                        This field is required
                      </div>
                    )}

                    {(function () {
                      if (tipepo === "PO_LANJUTAN") {
                        return (
                          <div>
                            <div className="mt-4 flex flex-wrap items-center justify-end">
                              <select
                                {...register("history_po", { required: true })}
                                className={`${errors.history_po
                                  ? "border-red-500 border-2"
                                  : "border"
                                  } appearance-none border h-[30px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                              >
                                <option value="">Pilih Data PO</option>
                                {list_po}
                              </select>
                              <i className="fi fi-rr-angle-small-down w-[1.12rem] h-[1.12rem] text-center text-gray-500 text-[1.12rem] leading-4 absolute mr-5"></i>
                            </div>
                            {errors.history_po && (
                              <div className="mt-1 text-sm italic">
                                This field is required
                              </div>
                            )}
                          </div>
                        );
                      }
                    })()} */}

                        <div>
                          <div className="flex flex-wrap items-center justify-end">
                            <select
                              {...register("supplier_pobaru", { required: true })}
                              className={`${errors.supplier_pobaru
                                ? "border-red-500 border-2"
                                : "border"
                                } appearance-none border h-[30px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                            >
                              <option value="">Pilih Supplier PO</option>
                              {list_supplier}
                            </select>
                            <i className="fi fi-rr-angle-small-down w-[1.12rem] h-[1.12rem] text-center text-gray-500 text-[1.12rem] leading-4 absolute mr-5"></i>
                          </div>
                          {errors.supplier_pobaru && (
                            <div className="mt-1 text-sm italic">
                              This field is required
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-start gap-3">
                          <div className="h-[30px] flex items-center text-sm font-medium text-black">
                            Harga Beli :
                          </div>
                          <CurrencyInput
                            className={`${errors.harga_beli_repeat
                              ? "border-red-500 border-2"
                              : "border"
                              } h-[30px] grow pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                            placeholder="Masukan Harga Beli"
                            defaultValue={0}
                            decimalsLimit={2}
                            groupSeparator="."
                            decimalSeparator=","
                            prefix="Rp "
                            {...register("harga_beli_repeat", {
                              required: true,
                              // onChange(event) {
                              //     setValue("harga_beli_repeat", event.target.value.replace(/\D/g, ""))
                              // },
                            })}
                          />
                        </div>

                        {errors.harga_beli_repeat && (
                          <div className="mt-1 text-sm italic">
                            This field is required
                          </div>
                        )}

                        <div className="grow">
                          <table className="table table-auto bg-transparent text-sm mt-3">
                            <thead className="bg-[#DDE4F0] text-gray-800 text-xs">
                              <tr className="">
                                <th className="py-2 rounded-l-lg">Size</th>
                                <th className="py-2">Stok Gudang</th>
                                <th className="py-2 rounded-r-lg">Stok Baru</th>
                              </tr>
                            </thead>

                            <tbody className="group rounded-lg text-xs">
                              {datasize.map((datasizes, index) => {
                                return (
                                  <tr
                                    key={index}
                                    className="rounded-lg h-auto mt-7"
                                  >
                                    <td className="pt-2 p-0">
                                      <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                        <input
                                          readOnly
                                          defaultValue={datasizes.size}
                                          {...register(
                                            `variasirestock.${index}.size`,
                                            { required: true }
                                          )}
                                          className="h-[100%] border w-[100%] pr-3 pl-5 mx-2 text-gray-700 focus:outline-none rounded-lg"
                                          type="text"
                                        />
                                      </div>
                                    </td>
                                    <td className="pt-2 p-0">
                                      <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                        <input
                                          readOnly
                                          defaultValue={datasizes.qty}
                                          className="h-[100%] border w-[100%] pr-3 pl-5 mx-2 text-gray-700 focus:outline-none rounded-lg"
                                          type="number"
                                        />
                                      </div>
                                    </td>
                                    <td className="pt-2 p-0">
                                      <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                        <input
                                          min={0}
                                          defaultValue={0}
                                          // {...register(
                                          //   `variasirestock.${index}.stok_baru`,
                                          //   { required: true }
                                          // )}
                                          {...register(`variasirestock.${index}.stok_baru`,
                                            {
                                              required: true, onChange: (e: any) => {
                                                if (e.target.value === "") {
                                                  var n = 0;
                                                } else {
                                                  var n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                                                }
                                                setValue(`variasirestock.${index}.stok_baru`, n)
                                              }
                                            })}
                                          className="h-[100%] border w-[100%] pr-3 pl-5 mx-2 text-gray-700 focus:outline-none rounded-lg"
                                          type="number"
                                          placeholder="aaa"
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                          {/* <button
                                                onClick={() => {
                                                    append({ size: null, stok_baru: 0 });
                                                    setCount(Count + 1);
                                                }}
                                                type="button" className="mt-3 mx-2 m-auto border-none rounded-lg bg-blue-600 hover:bg-blue-800 h-[30px] text-white px-2 flex flex-wrap gap-2 content-center">
                                                <div className="my-auto">
                                                    <fa.FaPlus size={13} className="text-white" />
                                                </div>
                                            </button> */}
                        </div>

                        <div className="h-[10%] mt-6 w-full grid grid-cols-2 items-end justify-start">
                          <button
                            className="bg-red-500 text-white font-bold uppercase text-xs px-6 py-2.5 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={() => {
                              setSelectedImage(null);
                              setValue("harga_beli", null);
                              // batas = 0;
                              // setCount(batas);
                              setrepeatModal(false);
                            }}
                          >
                            Close
                          </button>
                          <button
                            className="bg-emerald-500 text-white font-bold uppercase text-xs px-6 py-2.5 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={handleSubmit(onSubmitRepeat)}
                            disabled={isDisabled}
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>

                      <div className="grow flex flex-col justify-start">
                        <div className="h-[500px] w-full pb-10">
                          <div className="text-xs flex flex-auto text-center mb-2 font-bold">
                            <div className="border py-1.5 w-[40%] rounded-l-lg">
                              Detail
                            </div>
                            {"SUPER-ADMIN" === Cookies.get("auth_role") ||
                              "HEAD-AREA" === Cookies.get("auth_role") ? (
                              <>
                                <div className="border py-1.5 grow">
                                  Total Pembelian
                                </div>
                              </>
                            ) : null}
                            <div className="border py-1.5 w-[40%] rounded-r-lg">
                              Size
                            </div>
                          </div>

                          {/* {JSON.stringify(data_po)} */}

                          <div className="h-[100%] overscroll-y-auto overflow-x-hidden scrollbar-none pb-20">
                            {(function () {
                              if (data_po.length > 0) {
                                return data_po.map((datapo: any, index: any) => {
                                  return (
                                    <div
                                      key={index}
                                      className="h-auto flex flex-auto text-xs items-center border rounded-lg px-2 py-2 mb-2"
                                    >
                                      <div className="w-[40%] grid grid-rows-5 pl-4">
                                        <div className="grid grid-cols-3">
                                          <span>Tanggal</span>
                                          <span className="col-span-2">
                                            : {datapo.tanggal_receive}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-3">
                                          <span>ID PO</span>
                                          <span className="col-span-2 font-bold text-violet-600">
                                            : {datapo.idpo}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-3">
                                          <span>Tipe PO</span>
                                          <span className="col-span-2 font-bold">
                                            : {datapo.tipe_order}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-3">
                                          <span>Supplier</span>
                                          <span className="col-span-2">
                                            : {datapo.supplier}
                                          </span>
                                        </div>
                                        {"SUPER-ADMIN" ===
                                          Cookies.get("auth_role") ||
                                          "HEAD-AREA" === Cookies.get("auth_role") ? (
                                          <>
                                            <div className="grid grid-cols-3">
                                              <span>Harga Satuan</span>
                                              <span className="col-span-2">
                                                : {Rupiah.format(datapo.m_price)}
                                              </span>
                                            </div>
                                          </>
                                        ) : null}
                                        <div className="grid grid-cols-3">
                                          <span>Quantity</span>
                                          <span className="col-span-2">
                                            : {datapo.qty}
                                          </span>
                                        </div>
                                      </div>
                                      {"SUPER-ADMIN" === Cookies.get("auth_role") ||
                                        "HEAD-AREA" === Cookies.get("auth_role") ? (
                                        <>
                                          <div className="grow text-center font-bold">
                                            {Rupiah.format(datapo.total_amount)}
                                          </div>
                                        </>
                                      ) : null}
                                      <div className="w-[40%] text-center grid grid-cols-4 px-2 gap-1">
                                        {(function () {
                                          return datapo.variation.map(
                                            (variation: any, indexs: any) => {
                                              return (
                                                <div
                                                  key={indexs}
                                                  className={`${variation.qty > 0
                                                    ? "bg-lime-600 text-white font-bold"
                                                    : "bg-red-600 text-white font-bold"
                                                    } border rounded px-2`}
                                                >
                                                  {variation.size}={variation.qty}
                                                </div>
                                              );
                                            }
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  );
                                });
                              }
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/*footer*/}
                    {/* <div className="flex items-center justify-end p-6 border-t border-solid border-slate-200 rounded-b">
                                    {JSON.stringify(watch())}
                                    <button
                                        className="text-red-500 background-transparent font-bold uppercase px-6 py-2 text-sm outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150"
                                        type="button"
                                        onClick={() => {
                                            setSelectedImage(null);
                                            setValue("harga_beli", null);
                                            batas = 0;
                                            setCount(batas);
                                            unregister('variasi');
                                            setrepeatModal(false);
                                        }}
                                    >
                                        Close
                                    </button>
                                    <button
                                        className="bg-emerald-500 text-white active:bg-emerald-600 font-bold uppercase text-sm px-6 py-3 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150"
                                        type="button"
                                        onClick={handleSubmit(onSubmitRepeat)}
                                    >
                                        Save Changes
                                    </button>
                                </div> */}
                  </div>
                </div>
              </div>
              <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
            </>
          ) : null
        }

        {
          transferModal ? (
            <>
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                <div className="relative mt-[50px] mb-[40px] mx-auto w-[60%]">
                  {/*content*/}
                  <div className="border-0 rounded-lg shadow-lg relative flex flex-col bg-white outline-none focus:outline-none w-[100%]">
                    {/*header*/}
                    <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-slate-200 rounded-t">
                      <span className="text-base font-semibold">
                        Transfer Stock : {transferproduct}
                      </span>
                    </div>

                    {/* <span className="text-xs px-3">{JSON.stringify(watch())}</span> */}
                    {/*body*/}
                    <div className="p-6 gap-4 flex flex-auto h-[auto]">
                      <div className="w-[33%] text-sm flex flex-col pb-3">
                        <div className="grow">
                          <div className="">
                            <label className="text-xs">Gudang Pengirim</label>
                            <input
                              readOnly
                              {...register("gudangpengirim", { required: true })}
                              className={`${errors.gudangpengirim
                                ? "border-red-500 border-2"
                                : "border"
                                } appearance-none border h-[30px] mt-2 w-[100%] pr-3 pl-5 text-gray-700 focus:outline-none rounded-lg`}
                            ></input>
                          </div>

                          <div className="mt-3">
                            <label className="text-xs">Gudang Penerima</label>
                            <div className="mt-2 flex flex-wrap items-center justify-end">
                              <select
                                {...register("transferwaretujuan", {
                                  required: true,
                                })}
                                className={`${errors.transferwaretujuan
                                  ? "border-red-500 border-2"
                                  : "border"
                                  } appearance-none border h-[30px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                              >
                                <option value="">Pilih Gudang Penerima</option>
                                {list_warehouse}
                              </select>
                              <i className="fi fi-rr-angle-small-down w-[1.12rem] h-[1.12rem] text-center text-gray-500 text-[1.12rem] leading-4 absolute mr-5"></i>
                            </div>
                            {errors.transferwaretujuan && (
                              <div className="mt-1 text-sm italic">
                                This field is required
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grow">
                        <table className="table table-auto bg-transparent text-sm w-full">
                          <thead className="bg-[#DDE4F0] text-gray-800 text-xs">
                            <tr className="">
                              <th className="py-2 rounded-l-lg">Size</th>
                              <th className="py-2">Stok Gudang</th>
                              <th className="py-2 rounded-r-lg">Stok Transfer</th>
                            </tr>
                          </thead>

                          <tbody className="group rounded-lg text-xs">
                            {datasize.map((datasizes, index) => {
                              return (
                                <tr key={index} className="rounded-lg h-auto mt-7">
                                  <td className="pt-2 p-0">
                                    <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                      <input
                                        readOnly
                                        defaultValue={datasizes.size}
                                        {...register(
                                          `variasitransfer.${index}.size`,
                                          { required: true }
                                        )}
                                        className="h-[100%] border w-[100%] pr-3 pl-5 mx-2 text-gray-700 focus:outline-none rounded-lg"
                                        type="text"
                                      />
                                    </div>
                                  </td>
                                  <td className="pt-2 p-0">
                                    <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                      <input
                                        readOnly
                                        defaultValue={datasizes.qty}
                                        className="h-[100%] border w-[100%] pr-3 pl-5 mx-2 text-gray-700 focus:outline-none rounded-lg"
                                        type="number"
                                      />
                                    </div>
                                  </td>
                                  <td className="pt-2 p-0">
                                    <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                      <input
                                        min={0}
                                        defaultValue={0}
                                        // {...register(
                                        //   `variasitransfer.${index}.stok_baru`,
                                        //   { required: true }
                                        // )}
                                        {...register(`variasitransfer.${index}.stok_baru`,
                                          {
                                            required: true, onChange: (e: any) => {
                                              if (e.target.value === "") {
                                                var n = 0;
                                              } else {
                                                var n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                                              }
                                              setValue(`variasitransfer.${index}.stok_baru`, n)
                                            }
                                          })}
                                        className="h-[100%] border w-[100%] pr-3 pl-5 mx-2 text-gray-700 focus:outline-none rounded-lg"
                                        type="number"
                                        placeholder="Size"
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        <div className="h-[10%] py-2 mt-3 w-full grid grid-cols-2 items-end justify-start">
                          <button
                            className="bg-red-500 text-white font-bold uppercase text-xs px-6 py-2.5 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={() => {
                              setSelectedImage(null);
                              settransferModal(false);
                            }}
                          >
                            Close
                          </button>
                          <button
                            className="bg-emerald-500 text-white font-bold uppercase text-xs px-6 py-2.5 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={handleSubmit(onSubmitTransfer)}
                            disabled={isDisabled}
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
            </>
          ) : null
        }

        {
          delModal ? (
            <>
              <div className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none focus:outline-none">
                <div className="relative w-[1000px] max-w-[95vw] bg-white rounded-lg shadow-lg ">
                  {/*content*/}
                  <div className="border-0 rounded-lg shadow-lg relative flex flex-col bg-white outline-none focus:outline-none w-[500px]">
                    {/*header*/}
                    <div className="flex items-start justify-between p-5 border-b border-solid border-slate-200 rounded-t">
                      <span className="text-sm font-semibold">Warning</span>
                    </div>
                    {/*body*/}
                    <div className="relative p-6 flex-auto">
                      <p className="text-sm font-semibold">
                        Produk {produk_name} akan dihapus?
                      </p>
                      <p className="text-sm italic text-red-400">
                        *Semua data dan Variasi Stok akan ikut terhapus
                      </p>
                    </div>
                    {/*footer*/}
                    <div className="flex items-center justify-end p-6 border-t border-solid border-slate-200 rounded-b">
                      <button
                        className="text-red-500 background-transparent font-bold uppercase px-6 py-2 text-sm outline-none focus:outline-none mr-1 mb-1"
                        type="button"
                        onClick={() => {
                          setdelModal(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="bg-red-500 text-white active:bg-emerald-600 font-bold uppercase text-sm px-6 py-3 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 mb-1"
                        type="button"
                        onClick={() => deleteData()}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
            </>
          ) : null
        }

        {
          stockopname ? (
            <>
              <div className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none focus:outline-none">
                <div className="mb-[10px] mx-auto w-[60%]">
                  {/*content*/}
                  <div className="border-0 rounded-lg shadow-lg flex flex-col bg-white outline-none focus:outline-none w-[100%]">
                    {/*header*/}
                    <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-slate-200 rounded-t">
                      <span className="text-base font-semibold">
                        Stock Opname : {repeatProduct} | {gudang}
                      </span>
                    </div>

                    {/* <span className="text-xs px-3">{JSON.stringify(watch())}</span> */}
                    {/*body*/}
                    <div className="p-6 gap-4 flex flex-auto h-[auto]">
                      <div className="w-[48%] text-sm flex flex-col">
                        {/* <div className="flex flex-wrap items-center justify-end">
                      <select
                        {...register("tipe_so", { required: true })}
                        onChange={(e) => {
                          settipeso(e.target.value);
                          setValue("history_po", "");
                        }}
                        className={`${errors.tipe_so ? "border-red-500 border-2" : "border"
                          } appearance-none border h-[30px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                      >
                        <option value="">Tipe Stock Opname</option>
                        <option value="SO_BARU">SO Baru</option>
                        <option value="SO_LANJUTAN">SO Lanjutan</option>
                      </select>
                      <i className="fi fi-rr-angle-small-down w-[1.12rem] h-[1.12rem] text-center text-gray-500 text-[1.12rem] leading-4 absolute mr-5"></i>
                    </div>
                    {errors.tipe_so && (
                      <div className="mt-1 text-sm italic">
                        This field is required
                      </div>
                    )} */}

                        {/* {(function () {
                      if (tipeso === "SO_LANJUTAN") {
                        return (
                          <div>
                            <div className="mt-4 flex flex-wrap items-center justify-end">
                              <select
                                {...register("history_po", { required: true })}
                                className={`${errors.history_po
                                  ? "border-red-500 border-2"
                                  : "border"
                                  } appearance-none border h-[30px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                              >
                                <option value="">Pilih Data SO</option>
                                {list_so}
                              </select>
                              <i className="fi fi-rr-angle-small-down w-[1.12rem] h-[1.12rem] text-center text-gray-500 text-[1.12rem] leading-4 absolute mr-5"></i>
                            </div>
                            {errors.history_po && (
                              <div className="mt-1 text-sm italic">
                                This field is required
                              </div>
                            )}
                          </div>
                        );
                      }
                    })()}
                    {"SUPER-ADMIN" === Cookies.get("auth_role") ||
                      "HEAD-AREA" === Cookies.get("auth_role") ? (
                      <>
                        <div className="mt-4 flex flex-wrap items-center justify-end">
                          <select
                            {...register("harga_beli_so", { required: true })}
                            className={`${errors.harga_beli_so
                              ? "border-red-500 border-2"
                              : "border"
                              } appearance-none border h-[30px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                          >
                            <option value="">Pilih Harga Beli</option>
                            {(function () {
                              return list_hargabeli.map(
                                (historipo: any, index: number) => {
                                  return (
                                    <option
                                      key={index}
                                      value={historipo.m_price}
                                    >
                                      {Rupiah.format(historipo.m_price)} (
                                      {historipo.tanggal_receive})
                                    </option>
                                  );
                                }
                              );
                            })()}
                          </select>
                          <i className="fi fi-rr-angle-small-down w-[1.12rem] h-[1.12rem] text-center text-gray-500 text-[1.12rem] leading-4 absolute mr-5"></i>
                        </div>
                        {errors.harga_beli_so && (
                          <div className="mt-1 text-sm italic">
                            This field is required
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div
                          className="mt-4 flex flex-wrap items-center justify-end"
                          hidden
                        >
                          {(function () {
                            return list_hargabeli.map(
                              (historipo: any, index: number) => {
                                return (
                                  <input
                                    {...register("harga_beli_so")}
                                    key={index}
                                    hidden
                                    value={0}
                                    className={`appearance-none border h-[30px]  w-[100%] pr-3 pl-5  text-gray-700 focus:outline-none rounded-lg`}
                                  ></input>
                                );
                              }
                            );
                          })()}
                        </div>
                      </>
                    )} */}
                        <div className="grow">
                          <table className="table table-auto bg-transparent text-sm mt-3">
                            <thead className="bg-[#DDE4F0] text-gray-800 text-xs">
                              <tr className="">
                                <th className="py-2 w-[16%] rounded-l-lg">Size</th>
                                <th className="py-2">Jumlah Di Sistem</th>
                                <th className="py-2">
                                  Jumlah Di Gudang
                                  <span className="text-red-600">*</span>
                                </th>
                                <th className="py-2 rounded-r-lg">
                                  Jumlah Stok Opname
                                </th>
                              </tr>
                            </thead>

                            <tbody className="group rounded-lg text-xs">
                              {datasize.map((datasizes, index) => {
                                return (
                                  <tr
                                    key={index}
                                    className="rounded-lg h-auto mt-7"
                                  >
                                    <td className="pt-2 p-0">
                                      <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                        <input
                                          readOnly
                                          defaultValue={datasizes.size}
                                          {...register(
                                            `variasirestock.${index}.size`,
                                            { required: true }
                                          )}
                                          className="text-center h-[100%] border w-[100%] mx-2 text-gray-700 focus:outline-none rounded-lg"
                                          type="text"
                                        />
                                      </div>
                                    </td>
                                    <td className="pt-2 p-0">
                                      <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                        <input
                                          readOnly
                                          defaultValue={datasizes.qty}
                                          className="text-center h-[100%] border bg-orange-100 w-[100%] mx-2 text-gray-700 focus:outline-none rounded-lg"
                                        />
                                      </div>
                                    </td>
                                    <td className="pt-2 p-0">
                                      <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                        <input
                                          defaultValue={0}
                                          // disableGroupSeparators={true}
                                          type="text"
                                          min={0}
                                          className="text-center h-[100%] border w-[100%] mx-2 text-gray-700 focus:outline-none rounded-lg"
                                          {...register(`variasirestock.${index}.stok_gudang`,
                                            {
                                              required: true, onChange: (e: any) => {
                                                if (e.target.value === "") {
                                                  var n = 0;
                                                  var x = 0;
                                                } else {
                                                  var n = parseInt(e.target.value.replace(/\D/g, ''), 10) - datasizes.qty;
                                                  var x = parseInt(e.target.value.replace(/\D/g, ''), 10);
                                                }
                                                setValue(`variasirestock.${index}.stok_baru`, n)
                                                setValue(`variasirestock.${index}.stok_gudang`, x)
                                              }
                                            })}
                                        />
                                      </div>
                                    </td>
                                    <td className="pt-2 p-0">
                                      <div className="h-[30px] flex flex-wrap justify-center items-center rounded-l-lg">
                                        <input
                                          readOnly
                                          defaultValue={0}
                                          {...register(
                                            `variasirestock.${index}.stok_baru`,
                                            { required: true }
                                          )}
                                          className="text-center h-[100%] border w-[100%] mx-2 bg-green-100 text-gray-700 focus:outline-none rounded-lg"
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="h-[10%] mt-6 w-full grid grid-cols-2 items-end justify-start">
                          <button
                            className="bg-red-500 text-white font-bold uppercase text-xs px-6 py-2.5 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={() => {
                              setValue("harga_beli", null);
                              setstockopname(false);
                            }}
                          >
                            Close
                          </button>
                          <button
                            className="bg-emerald-500 text-white font-bold uppercase text-xs px-6 py-2.5 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 ease-linear transition-all duration-150"
                            type="button"
                            onClick={handleSubmit(onSubmitSO)}
                            disabled={isDisabled}
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>

                      <div className="grow flex flex-col justify-start">
                        <div className="h-[500px] w-full pb-10">
                          <div className="text-xs flex flex-auto text-center mb-2 font-bold">
                            <div className="border py-1.5 w-[35%] rounded-l-lg">
                              Detail
                            </div>
                            <div className="border py-1.5 w-[65%] rounded-r-lg">
                              Size
                            </div>
                          </div>

                          {/* {JSON.stringify(data_po)} */}

                          <div className="h-[100%] overscroll-y-auto overflow-x-hidden scrollbar-none pb-20">
                            {(function () {
                              if (data_po.length > 0) {
                                return data_po.map((datapo: any, index: any) => {
                                  return (
                                    <div
                                      key={index}
                                      className="h-auto flex flex-auto text-xs items-center border rounded-lg px-2 py-2 mb-2"
                                    >
                                      <div className="w-[35%] grid grid-rows-3 pl-4">
                                        <div className="grid grid-cols-3">
                                          <span>Tanggal</span>
                                          <span className="col-span-2">
                                            : {datapo.tanggal_receive}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-3">
                                          <span>ID SO</span>
                                          <span className="col-span-2 font-bold text-violet-600">
                                            : {datapo.idpo}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-3">
                                          <span>Quantity</span>
                                          <span className="col-span-2">
                                            : {datapo.qty}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="w-[65%] text-center grid grid-cols-4 px-2 gap-1">
                                        {(function () {
                                          return datapo.variation.map(
                                            (variation: any, indexs: any) => {
                                              return (
                                                <div
                                                  key={indexs}
                                                  // className="border rounded px-2"
                                                  className={`${variation.qty != 0
                                                    ? "bg-lime-600 text-white font-bold"
                                                    : "bg-red-600 text-white font-bold"
                                                    } border rounded px-2`}
                                                >
                                                  {variation.size}{" = "}{variation.qty}
                                                </div>
                                              );
                                            }
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  );
                                });
                              } else {
                                return (
                                  <div className="w-full text-center h-full mt-5">
                                    Belum Ada Stock Opname
                                  </div>
                                );
                              }
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
            </>
          ) : null
        }

        {
          showModalPrintSO ? (
            <>
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                <div className="relative w-[1000px] max-w-[95vw] bg-white rounded-lg shadow-lg ">
                  {/*content*/}
                  <div className="border-0 rounded-lg shadow-lg relative flex flex-col bg-white outline-none focus:outline-none w-[50vh]">
                    {/*header*/}
                    <div className="flex items-start justify-between p-5 border-b border-solid border-slate-200 rounded-t">
                      <span className="text-xl font-semibold">Print Daftar SO</span>
                    </div>
                    {/*body*/}
                    <div className="relative p-6 flex flex-auto gap-6">
                      <select
                        value={warehouse_so}
                        onChange={(e) => {
                          setwarehouse_so(e.target.value);
                        }}
                        className={`ml-3 appearance-none border h-[45px] w-[100%] px-5 text-gray-700 focus:outline-none rounded-lg`}
                      >
                        <option value="">Pilih Warehouse</option>
                        {list_warehouse_so}
                      </select>
                    </div>
                    {/*footer*/}
                    <div className="flex items-center justify-end p-6 border-t border-solid border-slate-200 rounded-b">
                      <button
                        className="text-red-500 background-transparent font-bold uppercase px-6 py-2 text-sm outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150"
                        type="button"
                        onClick={() => {
                          setSelectedImage(null);
                          setshowModalPrintSO(false);
                        }}
                      >
                        Close
                      </button>
                      <button
                        className="bg-emerald-500 text-white active:bg-emerald-600 font-bold uppercase text-sm px-6 py-3 rounded shadow hover:shadow-lg outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150"
                        type="button"
                        onClick={() => printSo()}
                      >
                        Print Daftar SO
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="opacity-25 fixed inset-0 z-40 bg-black"></div>
            </>
          ) : null
        }

      </div>
      {Query === "all" && total_pages > 1 && (
        <>
          {/* info halaman */}
          <div className="mb-3 text-center text-gray-500 font-medium">
            Page {page} of {total_pages}
          </div>

          {/* tombol pagination */}
          <div className="flex justify-center items-center gap-2 mb-6">

            {/* PREV */}
            <button
              disabled={page === 1}
              onClick={() =>
                loaddataproduk(
                  Warehouse,
                  Query,
                  area,
                  Role,
                  Urutan,
                  Brand,
                  page - 1
                )
              }
              className={`px-4 py-2 rounded-md border
          ${page === 1
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white hover:bg-gray-100 text-gray-700"
                }`}
            >
              Prev
            </button>

            {/* nomor halaman */}
            {Array.from({ length: total_pages })
              .slice(Math.max(page - 3, 0), Math.min(page + 2, total_pages))
              .map((_, i) => {
                const pageNumber = Math.max(page - 2, 1) + i;

                return (
                  <button
                    key={pageNumber}
                    onClick={() =>
                      loaddataproduk(
                        Warehouse,
                        Query,
                        area,
                        Role,
                        Urutan,
                        Brand,
                        pageNumber
                      )
                    }
                    className={`px-4 py-2 rounded-md border
                ${page === pageNumber
                        ? "bg-emerald-500 text-white font-bold"
                        : "bg-white hover:bg-gray-100 text-gray-700"
                      }`}
                  >
                    {pageNumber}
                  </button>
                );
              })}

            {/* NEXT */}
            <button
              disabled={page === total_pages}
              onClick={() =>
                loaddataproduk(
                  Warehouse,
                  Query,
                  area,
                  Role,
                  Urutan,
                  Brand,
                  page + 1
                )
              }
              className={`px-4 py-2 rounded-md border
          ${page === total_pages
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white hover:bg-gray-100 text-gray-700"
                }`}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div >

  );
}
