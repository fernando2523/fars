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
import DataTable, { ExpanderComponentProps } from "react-data-table-component";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import axios from "axios";
import { Key } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

let Rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export default function Expense() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const [isLoading, setisLoading] = useState(true);
  const [data_asset, setdataasset]: any = useState([]);
  const [data_ware, setdataware] = useState([]);
  const [Query, setQuery] = useState("all");
  const [Brand, setBrand] = useState("all");

  useEffect(() => {
    loaddataasset(Warehouse, Query, currentPage, Urutan, Brand, Urutan_terjual);
    getwarehouse();
    return () => { };
  }, []);

  async function loaddataasset(warehouse: any, query: any, pageIndex: any, Urutan: any, Brand: any, Urutan_terjual: any) {
    setisLoading(true);
    await axios({
      method: "post",
      url: `${process.env.NEXT_PUBLIC_HOST}/v1/get_asset`,
      data: {
        id_ware: warehouse,
        query: query,
        loadmorelimit: pageIndex, // backend sudah pakai index halaman
        urutan: Urutan,
        brand: Brand,
        sold: Urutan_terjual,
      },
    })
      .then(function (response) {
        console.log(response.data.result);

        setdataasset(response.data.result.datas[0]);
        setTotalPages(response.data.result.total_pages || 0);
        setCurrentPage(pageIndex);
        setisLoading(false);
      })
      .catch(function (error) {
        console.log(error);
      });
  }

  const [Warehouse, setWarehouse] = useState("all");
  const [Urutan, setUrutan] = useState("all");
  const [Urutan_terjual, setUrutan_terjual] = useState("all");
  async function getwarehouse() {
    await axios({
      method: "get",
      url: `${process.env.NEXT_PUBLIC_HOST}/v1/getwarehouse`,
    })
      .then(function (response) {
        setdataware(response.data.data_warehouse);
      })
      .catch(function (error) {
        console.log(error);
      });
  }

  const list_warehouse: any = [];
  if (!isLoading) {
    data_ware.map((area: any, index: number) => {
      list_warehouse.push(
        <option key={index} value={area.id_ware}>
          {area.warehouse}
        </option>
      );
    });
  }

  async function keyDown(event: any) {
    if (event.key == 'Enter') {
      if (Query != "all") {
        loaddataasset(Warehouse, Query, currentPage, Urutan, Brand, Urutan_terjual);
      }
    }
  }

  const [showModal, setShowModal] = React.useState(false);
  const PAGE_SIZE = 20; // opsional, untuk referensi
  const [currentPage, setCurrentPage]: any = useState(0); // 0-based
  const [totalPages, setTotalPages]: any = useState(0);

  const list_produk: any = [];

  if (!isLoading) {
    var product_counts = (data_asset && data_asset.data_asset) ? data_asset.data_asset.length : 0;
    var release = data_asset.release;
    var restock = data_asset.restock;
    var tf_in = data_asset.tf_in;
    var stock_opname = (parseInt(data_asset.release) + parseInt(data_asset.restock)) - parseInt(data_asset.getsoldall);
    var inout = parseInt(data_asset.qty_assets) - stock_opname;
    var tf_out = data_asset.tf_out;
    var qty_assets = data_asset.qty_assets;
    var getsoldall = data_asset.getsoldall;
    var nominal_assets = Rupiah.format(data_asset.nominal_assets);
    var assetbersih = Rupiah.format(parseInt(data_asset.asset_bersih));
    const startNo = currentPage * PAGE_SIZE + 1;
    data_asset.data_asset.map((data_asset: any, index: number) => {
      return list_produk.push(
        <div key={index}>
          <div className="flex flex-wrap mb-2 group hover:shadow-lg ">
            <div className="bg-white flex flex-row basis-full h-[full] rounded-lg items-center group-hover:drop-shadow-primary transition-filter px-5 py-5">
              <div className="grow mr-5 text-center">
                {startNo + index}
              </div>
              <div className="basis-6/12 text-left ml-5 font-medium">
                {data_asset.produk} | {data_asset.id_produk}
              </div>
              <div className="basis-1/6 text-center">{data_asset.warehouse}</div>
              <div className="basis-1/6 text-center">{data_asset.release ? data_asset.release : 0}</div>
              <div className="basis-1/6 text-center">{data_asset.restock ? data_asset.restock : 0}</div>
              <div className="basis-1/6 text-center">{parseInt(data_asset.stock ? data_asset.stock : 0) - (parseInt(data_asset.release ? data_asset.release : 0) + parseInt(data_asset.restock ? data_asset.restock : 0)) + parseInt(data_asset.sold ? data_asset.sold : 0)}</div>
              {/* <div className="basis-1/6 text-center">{data_asset.transfer_out ? data_asset.transfer_out : 0}</div> */}
              <div className="basis-1/6 text-center">{data_asset.sold ? data_asset.sold : 0}</div>
              <div className="basis-1/6 text-center">{data_asset.stock ? data_asset.stock : 0}</div>
              <div className="basis-1/6 text-center">{Rupiah.format(data_asset.assets ? data_asset.assets : 0)}</div>
              <div className="basis-1/6 text-center">
                <button
                  onClick={() =>
                    show_po(
                      data_asset.produk,
                      data_asset.id_produk,
                      data_asset.id_ware
                    )
                  }
                  className="text-blue-500"
                >
                  <i className="fi fi-rr-eye text-center text-xl"></i>
                </button>
              </div>
            </div>
          </div >
        </div >
      );
    });
  }

  const [data_po, setdata_po]: any = React.useState([]);
  const [Product, setProduct]: any = React.useState("");
  const [IDProduct, setIDProduct]: any = React.useState("");

  async function show_po(produk: any, idproduk: any, id_ware: any) {
    setProduct(produk);
    setIDProduct(idproduk);

    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/gethistoripoasset`, {
        idware: id_ware,
        idproduct: idproduk,
      })
      .then(function (response) {
        setdata_po(response.data.result);
        setShowModal(true);
      });
  }

  const {
    register,
    resetField,
    setValue,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({

    defaultValues: {
      deskripsi: "",
      amount: "",
      qty: "",
      total_amount: "",
      edit_deskripsi: "",
      edit_amount: "",
      edit_qty: "",
      edit_total_amount: "",
      gopagego: 0,
    },
  });



  function goToPage(page: number) {
    if (page < 0) page = 0;
    if (totalPages && page > totalPages - 1) page = totalPages - 1;
    loaddataasset(Warehouse, Query, page, Urutan, Brand, Urutan_terjual);
  }

  return (
    <div className="p-5">
      <div className="font-bold text-2xl border-b border-[#2125291A] h-12 mb-4">
        Assets (FIFO METHOD)
      </div>

      <div className="flex flex-row gap-3 grow h-auto content-start">
        <a className="hover:shadow-[0px_3px_11px_1px_#2125291A] basis-1/3 rounded-xl h-auto bg-white px-5 py-5 group">
          <div className="grid grid-rows-3 items-center">
            <div className="flex content-center items-center justify-start">
              <div className="grow">
                <Image
                  className="w-[36px] h-[36px] max-w-full max-h-full"
                  src="/release.png"
                  alt="Picture of the author"
                  width={100}
                  height={100}
                />
              </div>

            </div>

            <div className="font-medium pt-1.5 text-base text-gray-400">
              Release
            </div>

            <div className="font-bold text-md text-black">
              {release ? release : 0}
            </div>
          </div>
        </a>

        <a className="hover:shadow-[0px_3px_11px_1px_#2125291A] basis-1/3 rounded-xl h-auto bg-white px-5 py-5 group">
          <div className="grid grid-rows-3 items-center">
            <div className="flex content-center items-center justify-start">
              <div className="grow">
                <Image
                  className="w-[36px] h-[36px] max-w-full max-h-full"
                  src="/restock.png"
                  alt="Picture of the author"
                  width={100}
                  height={100}
                />
              </div>
            </div>

            <div className="font-medium pt-1.5 text-base text-gray-400">
              Restock
            </div>

            <div className="font-bold text-md text-black">
              {restock ? restock : 0}
            </div>
          </div>
        </a>

        <a className="hover:shadow-[0px_3px_11px_1px_#2125291A] basis-1/3 rounded-xl h-auto bg-white px-5 py-5 group">
          <div className="grid grid-rows-3 items-center">
            <div className="flex content-center items-center justify-start">
              <div className="grow">
                <Image
                  className="w-[36px] h-[36px] max-w-full max-h-full"
                  src="/transfer.png"
                  alt="Picture of the author"
                  width={100}
                  height={100}
                />
              </div>
            </div>

            <div className="font-medium pt-1.5 text-base text-gray-400">
              In / Out
            </div>

            <div className="font-bold text-md text-black">
              {inout ? inout : 0}
            </div>
          </div>
        </a>

        <a className="hover:shadow-[0px_3px_11px_1px_#2125291A] basis-1/3 rounded-xl h-auto bg-white px-5 py-5 group">
          <div className="grid grid-rows-3 items-center">
            <div className="flex content-center items-center justify-start">
              <div className="grow">
                <Image
                  className="w-[36px] h-[36px] max-w-full max-h-full"
                  src="/warehouse.png"
                  alt="Picture of the author"
                  width={100}
                  height={100}
                />
              </div>

              {/* <div>
                                <fa.FaChevronRight size={18} className="text-gray-400 group-hover:text-gray-800" />
                            </div> */}
            </div>

            <div className="font-medium pt-1.5 text-base text-gray-400">
              Sold
            </div>

            <div className="font-bold text-md text-black">
              {getsoldall ? getsoldall : 0}
            </div>
          </div>
        </a>
      </div>

      <div className="flex flex-row gap-3 grow h-auto content-start mt-4">


        <a className="hover:shadow-[0px_3px_11px_1px_#2125291A] basis-1/3 rounded-xl h-auto bg-white px-5 py-5 group">
          <div className="grid grid-rows-3 items-center">
            <div className="flex content-center items-center justify-start">
              <div className="grow">
                <Image
                  className="w-[36px] h-[36px] max-w-full max-h-full"
                  src="/warehouse.png"
                  alt="Picture of the author"
                  width={100}
                  height={100}
                />
              </div>

              {/* <div>
                                <fa.FaChevronRight size={18} className="text-gray-400 group-hover:text-gray-800" />
                            </div> */}
            </div>

            <div className="font-medium pt-1.5 text-base text-gray-400">
              Asset Quantity
            </div>

            <div className="font-bold text-md text-black">
              {qty_assets ? qty_assets : 0}
            </div>
          </div>
        </a>

        <a className="hover:shadow-[0px_3px_11px_1px_#2125291A] basis-1/3 rounded-xl h-auto bg-white px-5 py-5 group">
          <div className="grid grid-rows-3 items-center">
            <div className="flex content-center items-center justify-start">
              <div className="grow">
                <Image
                  className="w-[36px] h-[36px] max-w-full max-h-full"
                  src="/delivery-box.png"
                  alt="Picture of the author"
                  width={100}
                  height={100}
                />
              </div>

              {/* <div>
                                <fa.FaChevronRight size={18} className="text-gray-400 group-hover:text-gray-800" />
                            </div> */}
            </div>

            <div className="font-medium pt-1.5 text-base text-gray-400">
              Assets Valuasi
            </div>

            <div className="font-bold text-md text-black">
              {nominal_assets ? nominal_assets : 0}
            </div>
          </div>
        </a>

        <a className="hover:shadow-[0px_3px_11px_1px_#2125291A] basis-1/3 rounded-xl h-auto bg-white px-5 py-5 group">
          <div className="grid grid-rows-3 items-center">
            <div className="flex content-center items-center justify-start">
              <div className="grow">
                <Image
                  className="w-[36px] h-[36px] max-w-full max-h-full"
                  src="/delivery-box.png"
                  alt="Picture of the author"
                  width={100}
                  height={100}
                />
              </div>

            </div>

            <div className="font-medium pt-1.5 text-base text-gray-400">
              Assets Bersih
            </div>

            <div className="font-bold text-md text-black">
              {assetbersih ? assetbersih : 0}
            </div>
          </div>
        </a>
      </div>

      <div className="rounded-lg mt-4 gap-3 w-auto flex flex-row text-center content-center">
        <div className="shadow grow rounded-lg  flex flex-row text-center content-center">
          <input
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value === "") {
                setQuery("all");
                loaddataasset(Warehouse, "all", currentPage, Urutan, Brand, Urutan_terjual);
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
              // console.log(Query)
              if (Query != "all") {
                loaddataasset(Warehouse, Query, currentPage, Urutan, Brand, Urutan_terjual);
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

        <select
          value={Urutan}
          onChange={(e) => {
            setUrutan(e.target.value);
            loaddataasset(Warehouse, Query, currentPage, e.target.value, Brand, Urutan_terjual);
          }}
          className={`appearance-none grow border h-[45px] w-[20%] px-5 text-gray-700 focus:outline-none rounded-lg`}
        >
          <option value="all">Basic Stock</option>
          <option value="asc">Least Stock A - Z</option>
          <option value="desc">Most Stock Z - A</option>
        </select>

        <select
          value={Urutan_terjual}
          onChange={(e) => {
            setUrutan_terjual(e.target.value);
            loaddataasset(Warehouse, Query, currentPage, Urutan, Brand, e.target.value);
          }}
          className={`appearance-none grow border h-[45px] w-[20%] px-5 text-gray-700 focus:outline-none rounded-lg`}
        >
          <option value="all">Base Sold</option>
          <option value="desc">Best Selling</option>
          <option value="asc">Least Selling</option>
        </select>

        <select
          value={Warehouse}
          onChange={(e) => {
            setWarehouse(e.target.value);
            loaddataasset(e.target.value, Query, currentPage, Urutan, Brand, Urutan_terjual);
          }}
          className={`appearance-none border h-[45px] w-[20%] px-5 text-gray-700 focus:outline-none rounded-lg`}
        >
          <option value="all">All Warehouse</option>
          {list_warehouse}
        </select>
      </div>

      <div className="items-center content-center mb-3 mt-3 gap-10 scroll-m-96">

        <div className="bg-[#323232] flex flex-row h-[40px] rounded-lg font-bold text-white items-center px-5">
          <div className="grow mr-5 text-center">No.</div>
          <div className="basis-6/12 text-left">Product</div>
          <div className="basis-1/6 text-center">Warehouse</div>
          <div className="basis-1/6 text-center">Release</div>
          <div className="basis-1/6 text-center">Restock</div>
          <div className="basis-1/6 text-center">In / Out</div>
          {/* <div className="basis-1/6 text-center">Transfer Out</div> */}
          <div className="basis-1/6 text-center">Sold</div>
          <div className="basis-1/6 text-center">Stock</div>
          <div className="basis-1/6 text-center">Assets</div>
          <div className="basis-1/6 text-center">Act</div>
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

      {/* <div className="mb-20 mt-3">
        <DataTable
          className="items-center text-center"
          columns={columns}
          // data={filteredItems}
          pagination
          paginationComponent={CustomMaterialPagination}
          paginationPerPage={20}
        />
      </div> */}

      {showModal ? (
        <>
          <div className="justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none focus:outline-none">
            <div className="mx-auto w-[30%]">
              {/*content*/}
              <div className="border-0 rounded-lg shadow-lg flex flex-col bg-white outline-none focus:outline-none w-[100%] ">
                {/*header*/}
                <div className="flex items-start justify-between px-5 py-3 border-b border-solid border-slate-200 rounded-t">
                  <span className="text-base font-semibold">
                    {IDProduct} - {Product}
                  </span>

                  <button
                    onClick={() => setShowModal(false)}
                    className="text-red-500"
                  >
                    <i className="fi fi-br-cross-small text-center text-xl"></i>
                  </button>
                </div>

                <div className="p-6 gap-4 flex flex-auto h-[auto]">
                  <div className="grow flex flex-col justify-start">
                    <div className="h-[full] w-full">
                      <div className="text-xs flex flex-auto text-center mb-2 font-bold">
                        <div className="border py-1.5 w-[100%] rounded-lg bg-[#323232] text-white">
                          Stock Ready
                        </div>
                      </div>

                      <div className="h-[100%] overscroll-y-auto overflow-x-hidden scrollbar-none">
                        {(function () {
                          if (data_po.data_po.length > 0) {
                            return data_po.data_po.map(
                              (datapo: any, index: any) => {
                                var total_size = 0;
                                var total_size_ready = 0;
                                return (
                                  <div
                                    key={index}
                                    className="h-auto flex flex-auto text-xs items-center border rounded-lg px-2 py-2 mb-2"
                                  >
                                    <div className="w-[100%] text-center flex flex-col px-3 gap-2">
                                      <div className="grid grid-cols-3 gap-1">
                                        {(function () {
                                          return datapo.variation_ready.map(
                                            (variation: any, indexs: any) => {
                                              total_size_ready =
                                                total_size_ready +
                                                parseInt(variation.qty);
                                              if (variation.qty > 0) {
                                                return (
                                                  <div
                                                    key={indexs}
                                                    className="bg-green-500 text-white rounded px-2 py-0.5"
                                                  >
                                                    {variation.size}=
                                                    {variation.qty}
                                                  </div>
                                                );
                                              } else {
                                                return (
                                                  <div
                                                    key={indexs}
                                                    className="bg-red-300 text-white rounded px-2 py-0.5"
                                                  >
                                                    {variation.size}=
                                                    {variation.qty}
                                                  </div>
                                                );
                                              }
                                            }
                                          );
                                        })()}
                                      </div>
                                      <div className="border rounded-lg px-2 py-1 bg-[#323232] text-white font-bold">
                                        Total Qty :{" "}
                                        <b>{total_size_ready}</b> Pcs
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
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
      ) : null}

      {!isLoading && totalPages && totalPages > 1 && (
        <div className="mt-6 mb-6 flex justify-center items-center gap-2">
          <button
            disabled={isLoading || currentPage === 0}
            onClick={() => goToPage(0)}
            className="px-3 py-1 rounded border bg-white disabled:opacity-50"
          >
            First
          </button>
          <button
            disabled={isLoading || currentPage === 0}
            onClick={() => goToPage(currentPage - 1)}
            className="px-3 py-1 rounded border bg-white disabled:opacity-50"
          >
            Prev
          </button>

          {Array.from({ length: totalPages }, (_, i) => i)
            .filter(i => i === 0 || i === totalPages - 1 || Math.abs(i - currentPage) <= 2)
            .reduce((acc: any[], i, idx, arr) => {
              if (idx > 0 && i - arr[idx - 1] > 1) acc.push('ellipsis-' + i);
              acc.push(i);
              return acc;
            }, [])
            .map((v, idx) =>
              typeof v === 'string' ? (
                <span key={v} className="px-2">…</span>
              ) : (
                <button
                  key={v}
                  onClick={() => goToPage(v)}
                  disabled={isLoading}
                  className={`px-3 py-1 rounded border ${v === currentPage ? 'bg-gray-200 font-bold' : 'bg-white'} disabled:opacity-50`}
                >
                  {v + 1}
                </button>
              )
            )
          }

          <button
            disabled={isLoading || currentPage >= totalPages - 1}
            onClick={() => goToPage(currentPage + 1)}
            className="px-3 py-1 rounded border bg-white disabled:opacity-50"
          >
            Next
          </button>
          <button
            disabled={isLoading || currentPage >= totalPages - 1}
            onClick={() => goToPage(totalPages - 1)}
            className="px-3 py-1 rounded border bg-white disabled:opacity-50"
          >
            Last
          </button>

          <div className="ml-3 text-sm text-gray-600">
            Page {currentPage + 1} of {totalPages}
          </div>
        </div>
      )}
    </div>
  );
}
