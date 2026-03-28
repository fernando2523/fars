// const mysql = require("mysql2");

// const pool = mysql.createPool({
//     host: "45.77.175.74", // Ganti dengan host database Anda
//     user: "4yourdibi",      // Ganti dengan username database Anda
//     password: "3Eeeei1!tS!", // Ganti dengan password database Anda
//     database: "u321906646_eastwoodcloth", // Ganti dengan nama database Anda
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
//     connectTimeout: 60000, // Tambahkan timeout 60 detik
//     acquireTimeout: 30000,
//     timezone: '+07:00',        // Set timezone to Waktu Indonesia Barat (UTC+7)
//     dateStrings: true,         // Return date/time fields as strings in the given timezone
// });

// // const pool = mysql.createPool({
// //     host: "45.77.175.74", // Ganti dengan host database Anda
// //     user: "4yourdibi",      // Ganti dengan username database Anda
// //     password: "3Eeeei1!tS!", // Ganti dengan password database Anda
// //     database: "dummycloth", // Ganti dengan nama database Anda
// //     waitForConnections: true,
// //     connectionLimit: 10,
// //     queueLimit: 0,
// //     connectTimeout: 60000, // Tambahkan timeout 60 detik
// //     acquireTimeout: 30000,
// //     timezone: '+07:00',        // Set timezone to Waktu Indonesia Barat (UTC+7)
// //     dateStrings: true,         // Return date/time fields as strings in the given timezone
// // });


// pool.on('error', err => {
//     console.error('MySQL pool error:', err);
// });

// module.exports = pool.promise(); // Gunakan promise untuk query async/await