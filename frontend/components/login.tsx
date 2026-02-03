import Link from "next/link";
//import js cookie
import Cookies from "js-cookie";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Image from "next/image";

export default function Login() {
  const {
    register,
    control,
    resetField,
    setValue,
    trigger,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({});

  const router = useRouter();

  const [ProcessLogin, setProcessLogin]: any = useState(false);
  var expireTime = new Date();
  expireTime.setTime(expireTime.getTime() + (24 * 60 * 60 * 1000));

  async function onLogin(data: any) {
    setProcessLogin(true);

    await axios
      .post(`${process.env.NEXT_PUBLIC_HOST}/v1/login`, {
        data: data,
      })
      .then(function (response) {
        if (response.data.result === "Failed") {
          toast.warning("Login Failed", {
            position: toast.POSITION.TOP_CENTER,
            pauseOnHover: false,
            autoClose: 800,
          });
          setProcessLogin(false);
        } else if (response.data.result === "NONACTIVE") {
          toast.info("Maaf, Akun Belum Aktif", {
            position: toast.POSITION.TOP_CENTER,
            pauseOnHover: false,
            autoClose: 800,
          });
          setProcessLogin(false);
        } else if (response.data.result === "Wrong") {
          toast.info("the username and password combination you entered into the system was incorrect or doesn't match", {
            position: toast.POSITION.TOP_CENTER,
            pauseOnHover: false,
            autoClose: 800,
          });
          setProcessLogin(false);
        } else {
          toast.success("Login Berhasil", {
            position: toast.POSITION.TOP_CENTER,
            pauseOnHover: false,
            autoClose: 800,
            onClose: () => {
              router.reload();
              window.location.href = "/products/daftar_produk";
              Cookies.set("auth", "Login", { expires: expireTime });
              Cookies.set("auth_idusername", response.data.result[0]["id"], {
                expires: expireTime,
              });
              Cookies.set(
                "auth_username",
                response.data.result[0]["username"],
                { expires: expireTime }
              );
              Cookies.set("auth_name", response.data.result[0]["name"], {
                expires: expireTime,
              });
              Cookies.set(
                "auth_password",
                response.data.result[0]["password"],
                { expires: expireTime }
              );
              Cookies.set("auth_role", response.data.result[0]["role"], {
                expires: expireTime,
              });
              Cookies.set("auth_store", response.data.result[0]["id_store"], {
                expires: expireTime,
              });
              Cookies.set("auth_channel", response.data.result[0]["channel"], {
                expires: expireTime,
              });
            },
          });
          // console.log(response.data[0]['name']);
        }
      });
  }

  const [isipassword, setPassword]: any = useState("");
  const [isiusername, setUsername]: any = useState("");

  async function keyDown(event: any) {
    if (event.key == 'Enter') {
      if (event.key == 'Enter') {
        var username = isiusername.target.value;
        var password = isipassword.target.value;

        setProcessLogin(true);

        await axios
          .post(`${process.env.NEXT_PUBLIC_HOST}/v1/login_on_enter`, {
            username: username,
            password: password,
          })
          .then(function (response) {
            if (response.data.result === "Failed") {
              toast.warning("Login Failed", {
                position: toast.POSITION.TOP_CENTER,
                pauseOnHover: false,
                autoClose: 800,
              });
              setProcessLogin(false);
            } else if (response.data.result === "NONACTIVE") {
              toast.info("Maaf, Akun Belum Aktif", {
                position: toast.POSITION.TOP_CENTER,
                pauseOnHover: false,
                autoClose: 800,
              });
              setProcessLogin(false);
            } else if (response.data.result === "Wrong") {
              toast.info("the username and password combination you entered into the system was incorrect or doesn't match", {
                position: toast.POSITION.TOP_CENTER,
                pauseOnHover: false,
                autoClose: 800,
              });
              setProcessLogin(false);
            } else if (response.data.result === undefined) {
              toast.info("Server is lost, please restart the browser", {
                position: toast.POSITION.TOP_CENTER,
                pauseOnHover: false,
                autoClose: 800,
              });
              setProcessLogin(false);
            } else if (response.data.result === "undefined") {
              toast.info("Server is lost, please restart the browser", {
                position: toast.POSITION.TOP_CENTER,
                pauseOnHover: false,
                autoClose: 800,
              });
              setProcessLogin(false);
            } else {
              toast.success("Login Berhasil", {
                position: toast.POSITION.TOP_CENTER,
                pauseOnHover: false,
                autoClose: 800,
                onClose: () => {
                  router.reload();
                  window.location.href = "/products/daftar_produk";
                  Cookies.set("auth", "Login", { expires: expireTime });
                  Cookies.set("auth_idusername", response.data.result[0]["id"], {
                    expires: expireTime,
                  });
                  Cookies.set(
                    "auth_username",
                    response.data.result[0]["username"],
                    { expires: expireTime }
                  );
                  Cookies.set("auth_name", response.data.result[0]["name"], {
                    expires: expireTime,
                  });
                  Cookies.set(
                    "auth_password",
                    response.data.result[0]["password"],
                    { expires: expireTime }
                  );
                  Cookies.set("auth_role", response.data.result[0]["role"], {
                    expires: expireTime,
                  });
                  Cookies.set("auth_store", response.data.result[0]["id_store"], {
                    expires: expireTime,
                  });
                  Cookies.set("auth_channel", response.data.result[0]["channel"], {
                    expires: expireTime,
                  });
                },
              });
              // console.log(response.data[0]['name']);
            }
          });
      }
    }
  }


  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">

      <title>Login | Fars Official</title>
      <link rel="shortcut icon" href="../favicon.ico" />

      <ToastContainer className="mt-[50px]" />

      <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-8">

        {/* LOGO */}
        <div className="flex justify-center mb-6">
          <Image
            src="/farslogowhite.png"
            alt="FARS"
            width={160}
            height={60}
            className="h-12 w-auto"
            priority
          />
        </div>

        {/* TITLE */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-wide">
            Welcome Back
          </h1>
          <p className="text-sm text-gray-300 mt-1">
            Please sign in to continue
          </p>
        </div>

        {/* USERNAME */}
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-2">
            Username
          </label>
          <input
            type="text"
            placeholder="Enter your username"
            autoComplete="off"
            {...register("username", { required: true })}
            onChange={(e) => setUsername(e)}
            className={`
            w-full rounded-lg px-4 py-3
            bg-white/90 text-gray-800
            border border-gray-300
            focus:outline-none focus:ring-2 focus:ring-blue-500
            transition
            ${errors.username ? "border-red-500" : ""}
          `}
          />
        </div>

        {/* PASSWORD */}
        <div className="mb-6">
          <label className="block text-sm text-gray-300 mb-2">
            Password
          </label>
          <input
            type="password"
            placeholder="Enter your password"
            autoComplete="off"
            {...register("password", { required: true })}
            onChange={(e) => setPassword(e)}
            onKeyDown={keyDown}
            className={`
            w-full rounded-lg px-4 py-3
            bg-white/90 text-gray-800
            border border-gray-300
            focus:outline-none focus:ring-2 focus:ring-blue-500
            transition
            ${errors.password ? "border-red-500" : ""}
          `}
          />
        </div>

        {/* BUTTON */}
        <button
          onClick={handleSubmit(onLogin)}
          disabled={ProcessLogin}
          className={`
          w-full h-[52px] rounded-lg
          font-semibold text-white
          transition-all duration-200
          ${ProcessLogin
              ? "bg-gray-500 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg"}
        `}
        >
          {ProcessLogin ? (
            <div className="flex items-center justify-center gap-2">
              <svg
                className="w-5 h-5 animate-spin text-white"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              Processing...
            </div>
          ) : (
            "Login"
          )}
        </button>

        {/* FOOTER */}
        <div className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} FARS Official System
        </div>

      </div>
    </div>
  );
}
