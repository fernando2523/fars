import * as fa from "react-icons/fa";
import Items from './menu';
import React, { PropsWithChildren, useEffect, useState } from "react";
import { Collapse } from "react-collapse";
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from "next/router";
import Cookies from "js-cookie";

const Layout = (props: PropsWithChildren) => {
    const [screenSize, setScreenSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });

    if (Cookies.get("auth_role") === "GUEST") {
        if (screenSize.width < 1200) {
            var [toggleViewMode, setToggleViewMode] = useState(false);
        } else {
            var [toggleViewMode, setToggleViewMode] = useState(false);
        }
    } else {
        if (screenSize.width < 1200) {
            var [toggleViewMode, setToggleViewMode] = useState(false);
        } else {
            var [toggleViewMode, setToggleViewMode] = useState(true);
        }
    }
    const router = useRouter();

    const [openBylink, setopenBylink] = useState(true);

    function toogleActiveStyles() {
        if (toggleViewMode === true) {
            setToggleViewMode(false);
        } else {
            setToggleViewMode(true);
        }
    }

    const [openMenumode, setopenMenumode] = useState(false);

    function openMenu() {
        if (openMenumode === true) {
            setopenMenumode(false);
        } else {
            setopenMenumode(true);
        }
    }

    const [toggleMenu, setToggleMenu] = useState({
        activeObject: null,
    });

    function toogleActive(index: any) {
        if (openBylink) {
            setopenBylink(false);
            if (index === toggleMenu.activeObject) {
                setToggleMenu({ ...toggleMenu, activeObject: null });
            } else {
                setToggleMenu({ ...toggleMenu, activeObject: index });
                // setToggleMenu({ ...toggleMenu, activeObject: index });
            }
        } else {
            if (index === toggleMenu.activeObject) {
                setToggleMenu({ ...toggleMenu, activeObject: null });
            } else {
                setToggleMenu({ ...toggleMenu, activeObject: index });
            }
        }
    }

    function toogleActiveCollapse(index: any) {
        if (index === toggleMenu.activeObject) {
            return true
        } else {
            return false
        }
    }

    function logout() {
        Cookies.remove('auth')
        Cookies.remove('auth_idusername')
        Cookies.remove('auth_username')
        Cookies.remove('auth_password')
        Cookies.remove('auth_role')
        Cookies.remove('auth_name')
        Cookies.remove('auth_store')
        Cookies.remove('auth_channel')
        router.reload();
    }

    const [Username, setUsername]: any = useState(null);

    //hook useEffect
    useEffect(() => {
        { Cookies.get('auth') ? setUsername(Cookies.get('auth_username')) : setUsername(false) }
        setTimeout(function () {
            Cookies.remove('auth')
            Cookies.remove('auth_idusername')
            Cookies.remove('auth_username')
            Cookies.remove('auth_password')
            Cookies.remove('auth_role')
            Cookies.remove('auth_name')
            Cookies.remove('auth_store')
            Cookies.remove('auth_channel')
            router.reload();
        }, 30 * 60 * 1000);
    }, []);

    return (
        <div className="grid min-h-screen grid-rows-[64px_1fr] text-sm bg-slate-100">
            {/* header */}
            <div className="w-full h-[64px] fixed z-30 bg-slate-900/90 backdrop-blur border-b border-white/10 flex items-center px-4 text-white">
                {Cookies.get("auth_role") === "GUEST" ? null : (
                    <>
                        {screenSize.width > 1200 ? (
                            <>
                                <div className="ml-4 flex cursor-pointer items-center h-10 w-auto px-2 " onClick={() => toogleActiveStyles()} >
                                    <i className="fi fi-sr-menu-burger w-[1.12rem] h-[1.12rem] text-center text-[1.12rem] leading-4"></i>
                                </div>
                            </>) : null}
                    </>)}

                <div className="flex items-center gap-3 ml-2">
                    <Image
                        src="/farslogowhite.png"
                        alt="logo"
                        width={110}
                        height={40}
                        className="h-9 w-auto"
                        priority
                    />
                </div>
                <div className="grow">
                </div>

                <div className="flex items-center gap-4 mr-4 text-sm">
                    <span className="text-gray-300">
                        Hello, <b className="text-white">{String(Username)}</b>
                    </span>

                    <button
                        onClick={logout}
                        className="px-4 py-1.5 rounded-md bg-red-500/80 hover:bg-red-600 transition text-white text-xs"
                    >
                        Logout
                    </button>
                </div>
            </div>
            {/* end header */}

            <div
                className={`
                    ${toggleViewMode ? "left-0" : "left-[-280px]"}
                    w-[17rem] fixed z-20
                    duration-300 ease-in-out
                    grid grid-rows-[64px_1fr]
                    h-screen
                    bg-slate-900 text-white
                    border-r border-white/10
                `}
            >
                <div></div>
                <ul className="h-auto mb-2 space-y-1 text-sm font-medium overflow-y-auto pt-6 pb-6 px-3 scrollbar-thin scrollbar-thumb-white/20">
                    {Items.map((item: any, index) => {
                        if (
                            item.roles_SUPERADMIN === Cookies.get("auth_role") ||
                            item.roles_HEADAREA === Cookies.get("auth_role") ||
                            item.roles_HEADWAREHOUSE === Cookies.get("auth_role") ||
                            item.roles_HEADSTORE === Cookies.get("auth_role") ||
                            item.roles_CASHIER === Cookies.get("auth_role") ||
                            item.roles_GUEST === Cookies.get("auth_role") ||
                            item.roles_CHANNEL === Cookies.get("auth_channel") ||
                            item.roles_offline === "offline"
                        ) {
                            var pathUrl = router.asPath.split("/");
                            const validasiMenu =
                                toggleMenu.activeObject === index
                                    ? true
                                    : pathUrl[1] == item.path
                                        ? openBylink
                                        : false;
                            if (item.title === "Pesanan Online" || item.title === "Pesanan Toko") {
                                if (Cookies.get("auth_role") === "SUPER-ADMIN" || Cookies.get("auth_role") === "HEAD-AREA") {
                                    if (item.children) {
                                        return (
                                            <li key={index} className="h-auto rounded-lg cursor-pointer">
                                                <div
                                                    className="flex gap-3.5 items-center justify-start py-3 px-5"
                                                    onClick={() => toogleActive(index)}
                                                >
                                                    <i
                                                        className={`${item.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center`}
                                                    ></i>
                                                    <span className="text-sm items-center font-normal grow">
                                                        {item.text}
                                                    </span>
                                                    <fa.FaChevronDown
                                                        id={String(index)}
                                                        className={`${validasiMenu ? "rotate-0" : "rotate-180"
                                                            } p-1 w-5 h-5 transition duration-500`}
                                                    />
                                                </div>

                                                <Collapse isOpened={validasiMenu}>
                                                    <ul className="bg-transparent text-[0.9rem] space-y-1.5 font-medium">
                                                        {item.children.map((child: any, index: any) => {
                                                            if (
                                                                child.roles_SUPERADMIN === Cookies.get("auth_role") || child.roles_HEADAREA === Cookies.get("auth_role") || child.roles_HEADWAREHOUSE === Cookies.get("auth_role") || child.roles_HEADSTORE === Cookies.get("auth_role") || child.roles_CASHIER === Cookies.get("auth_role") || child.roles_GUEST === Cookies.get("auth_role") || child.roles_CHANNEL === Cookies.get("auth_channel")
                                                            ) {
                                                                return (
                                                                    <li
                                                                        key={index}
                                                                        className={`${router.asPath == child.href
                                                                            ? "bg-blue-600/20 text-blue-400 font-semibold"
                                                                            : "hover:bg-white/10 font-normal"
                                                                            } h-auto rounded-lg cursor-pointer pl-3`}
                                                                    >
                                                                        <a
                                                                            href={child.href}
                                                                            className="flex gap-3.5 items-center text-start py-3 px-5"
                                                                        >
                                                                            <i
                                                                                className={`${child.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center m-0 pt-[1.9px]`}
                                                                            ></i>
                                                                            <span className="text-sm items-center grow">
                                                                                {child.text}
                                                                            </span>
                                                                        </a>
                                                                    </li>
                                                                );
                                                            }
                                                        })}
                                                    </ul>
                                                </Collapse>
                                            </li>
                                        );
                                    } else {
                                        return (
                                            <li
                                                key={index}
                                                className={`${router.asPath == item.href
                                                    ? "bg-blue-600/20 text-blue-400 font-semibold"
                                                    : "hover:bg-white/10 font-normal"
                                                    } "h-auto rounded-lg cursor-pointer`}
                                            >
                                                <a
                                                    href={item.href}
                                                    className="flex gap-3.5 items-center text-center justify-start py-3 px-5"
                                                >
                                                    <i
                                                        className={`${item.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center`}
                                                    ></i>
                                                    <span className="text-sm items-center">{item.text}</span>
                                                </a>
                                            </li>
                                        );
                                    }
                                } else {
                                    if (Cookies.get("auth_channel") === "OFFLINE STORE") {
                                        if (item.title === "Pesanan Toko") {
                                            if (item.children) {
                                                return (
                                                    <li key={index} className="h-auto rounded-lg cursor-pointer">
                                                        <div
                                                            className="flex gap-3.5 items-center justify-start py-3 px-5"
                                                            onClick={() => toogleActive(index)}
                                                        >
                                                            <i
                                                                className={`${item.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center`}
                                                            ></i>
                                                            <span className="text-sm items-center font-normal grow">
                                                                {item.text}
                                                            </span>
                                                            <fa.FaChevronDown
                                                                id={String(index)}
                                                                className={`${validasiMenu ? "rotate-0" : "rotate-180"
                                                                    } p-1 w-5 h-5 transition duration-500`}
                                                            />
                                                        </div>

                                                        <Collapse isOpened={validasiMenu}>
                                                            <ul className="bg-transparent text-[0.9rem] space-y-1.5 font-medium">
                                                                {item.children.map((child: any, index: any) => {
                                                                    if (
                                                                        child.roles_SUPERADMIN === Cookies.get("auth_role") || child.roles_HEADAREA === Cookies.get("auth_role") || child.roles_HEADWAREHOUSE === Cookies.get("auth_role") || child.roles_HEADSTORE === Cookies.get("auth_role") || child.roles_CASHIER === Cookies.get("auth_role") || child.roles_GUEST === Cookies.get("auth_role") || child.roles_CHANNEL === Cookies.get("auth_channel")
                                                                    ) {
                                                                        return (
                                                                            <li
                                                                                key={index}
                                                                                className={`${router.asPath == child.href
                                                                                    ? "bg-blue-600/20 text-blue-400 font-semibold"
                                                                                    : "hover:bg-white/10 font-normal"
                                                                                    } h-auto rounded-lg cursor-pointer pl-3`}
                                                                            >
                                                                                <a
                                                                                    href={child.href}
                                                                                    className="flex gap-3.5 items-center text-start py-3 px-5"
                                                                                >
                                                                                    <i
                                                                                        className={`${child.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center m-0 pt-[1.9px]`}
                                                                                    ></i>
                                                                                    <span className="text-sm items-center grow">
                                                                                        {child.text}
                                                                                    </span>
                                                                                </a>
                                                                            </li>
                                                                        );
                                                                    }
                                                                })}
                                                            </ul>
                                                        </Collapse>
                                                    </li>
                                                );
                                            } else {
                                                return (
                                                    <li
                                                        key={index}
                                                        className={`${router.asPath == item.href
                                                            ? "bg-blue-600/20 text-blue-400 font-semibold"
                                                            : "hover:bg-white/10 font-normal"
                                                            } "h-auto rounded-lg cursor-pointer`}
                                                    >
                                                        <a
                                                            href={item.href}
                                                            className="flex gap-3.5 items-center text-center justify-start py-3 px-5"
                                                        >
                                                            <i
                                                                className={`${item.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center`}
                                                            ></i>
                                                            <span className="text-sm items-center">{item.text}</span>
                                                        </a>
                                                    </li>
                                                );
                                            }
                                        }
                                    } else {
                                        if (item.title === "Pesanan Online") {
                                            if (item.children) {
                                                return (
                                                    <li key={index} className="h-auto rounded-lg cursor-pointer">
                                                        <div
                                                            className="flex gap-3.5 items-center justify-start py-3 px-5"
                                                            onClick={() => toogleActive(index)}
                                                        >
                                                            <i
                                                                className={`${item.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center`}
                                                            ></i>
                                                            <span className="text-sm items-center font-normal grow">
                                                                {item.text}
                                                            </span>
                                                            <fa.FaChevronDown
                                                                id={String(index)}
                                                                className={`${validasiMenu ? "rotate-0" : "rotate-180"
                                                                    } p-1 w-5 h-5 transition duration-500`}
                                                            />
                                                        </div>

                                                        <Collapse isOpened={validasiMenu}>
                                                            <ul className="bg-transparent text-[0.9rem] space-y-1.5 font-medium">
                                                                {item.children.map((child: any, index: any) => {
                                                                    if (
                                                                        child.roles_SUPERADMIN === Cookies.get("auth_role") || child.roles_HEADAREA === Cookies.get("auth_role") || child.roles_HEADWAREHOUSE === Cookies.get("auth_role") || child.roles_HEADSTORE === Cookies.get("auth_role") || child.roles_CASHIER === Cookies.get("auth_role") || child.roles_GUEST === Cookies.get("auth_role") || child.roles_CHANNEL === Cookies.get("auth_channel")
                                                                    ) {
                                                                        return (
                                                                            <li
                                                                                key={index}
                                                                                className={`${router.asPath == child.href
                                                                                    ? "bg-blue-600/20 text-blue-400 font-semibold"
                                                                                    : "hover:bg-white/10 font-normal"
                                                                                    } h-auto rounded-lg cursor-pointer pl-3`}
                                                                            >
                                                                                <a
                                                                                    href={child.href}
                                                                                    className="flex gap-3.5 items-center text-start py-3 px-5"
                                                                                >
                                                                                    <i
                                                                                        className={`${child.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center m-0 pt-[1.9px]`}
                                                                                    ></i>
                                                                                    <span className="text-sm items-center grow">
                                                                                        {child.text}
                                                                                    </span>
                                                                                </a>
                                                                            </li>
                                                                        );
                                                                    }
                                                                })}
                                                            </ul>
                                                        </Collapse>
                                                    </li>
                                                );
                                            } else {
                                                return (
                                                    <li
                                                        key={index}
                                                        className={`${router.asPath == item.href
                                                            ? "bg-blue-600/20 text-blue-400 font-semibold"
                                                            : "hover:bg-white/10 font-normal"
                                                            } "h-auto rounded-lg cursor-pointer`}
                                                    >
                                                        <a
                                                            href={item.href}
                                                            className="flex gap-3.5 items-center text-center justify-start py-3 px-5"
                                                        >
                                                            <i
                                                                className={`${item.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center`}
                                                            ></i>
                                                            <span className="text-sm items-center">{item.text}</span>
                                                        </a>
                                                    </li>
                                                );
                                            }
                                        }
                                    }
                                }

                            } else {
                                if (item.children) {
                                    return (
                                        <li key={index} className="h-auto rounded-lg cursor-pointer">
                                            <div
                                                className="flex gap-3.5 items-center justify-start py-3 px-5"
                                                onClick={() => toogleActive(index)}
                                            >
                                                <i
                                                    className={`${item.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center`}
                                                ></i>
                                                <span className="text-sm items-center font-normal grow">
                                                    {item.text}
                                                </span>
                                                <fa.FaChevronDown
                                                    id={String(index)}
                                                    className={`${validasiMenu ? "rotate-0" : "rotate-180"
                                                        } p-1 w-5 h-5 transition duration-500`}
                                                />
                                            </div>

                                            <Collapse isOpened={validasiMenu}>
                                                <ul className="bg-transparent text-[0.9rem] space-y-1.5 font-medium">
                                                    {item.children.map((child: any, index: any) => {
                                                        if (
                                                            child.roles_SUPERADMIN === Cookies.get("auth_role") || child.roles_HEADAREA === Cookies.get("auth_role") || child.roles_HEADWAREHOUSE === Cookies.get("auth_role") || child.roles_HEADSTORE === Cookies.get("auth_role") || child.roles_CASHIER === Cookies.get("auth_role") || child.roles_GUEST === Cookies.get("auth_role") || child.roles_CHANNEL === Cookies.get("auth_channel")
                                                        ) {
                                                            return (
                                                                <li
                                                                    key={index}
                                                                    className={`${router.asPath == child.href
                                                                        ? "bg-blue-600/20 text-blue-400 font-semibold"
                                                                        : "hover:bg-white/10 font-normal"
                                                                        } h-auto rounded-lg cursor-pointer pl-3`}
                                                                >
                                                                    <a
                                                                        href={child.href}
                                                                        className="flex gap-3.5 items-center text-start py-3 px-5"
                                                                    >
                                                                        <i
                                                                            className={`${child.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center m-0 pt-[1.9px]`}
                                                                        ></i>
                                                                        <span className="text-sm items-center grow">
                                                                            {child.text}
                                                                        </span>
                                                                    </a>
                                                                </li>
                                                            );
                                                        }
                                                    })}
                                                </ul>
                                            </Collapse>
                                        </li>
                                    );
                                } else {
                                    return (
                                        <li
                                            key={index}
                                            className={`${router.asPath == item.href
                                                ? "bg-blue-600/20 text-blue-400 font-semibold"
                                                : "hover:bg-white/10 font-normal"
                                                } "h-auto rounded-lg cursor-pointer`}
                                        >
                                            <a
                                                href={item.href}
                                                className="flex gap-3.5 items-center text-center justify-start py-3 px-5"
                                            >
                                                <i
                                                    className={`${item.icon_item} w-5 h-5 text-center text-[1.25rem] leading-5 items-center`}
                                                ></i>
                                                <span className="text-sm items-center">{item.text}</span>
                                            </a>
                                        </li>
                                    );
                                }
                            }

                        }
                    })}
                </ul>
            </div >

            {/* <div className="grid grid-cols-[16rem_1fr] h-full"> */}
            <div className="h-screen pt-[60px] " >
                <div className={`${toggleViewMode ? "grid-cols-[15.3rem_1fr]" : "grid-cols-[0rem_1fr]"} grid h-full duration-200`}>
                    <div className="h-full bg-slate-100 py-6 pt-5 px-4 ">
                    </div>

                    <main className={`${toggleViewMode ? "px-0" : "px-0"} h-full bg-slate-100 px-6 py-6 duration-200 overscroll-y-auto overflow-x-hidden scrollbar-none max-w-screen-xxl`}>
                        {props.children}
                    </main>
                </div>
            </div >
        </div >
    );
};

export default Layout;
