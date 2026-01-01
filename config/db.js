// db.js
const mysql = require('mysql2');

// 建立連線池設定
const pool = mysql.createPool({
  host: 'localhost',      // 通常是 localhost
  user: 'root',           // phpMyAdmin 預設帳號
  password: '',           // phpMyAdmin 預設密碼通常為空（如果是 XAMPP）
  database: 'baseball',    // 你剛才建立的資料庫名稱
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 匯出一個支援 Promise 的版本，讓語法更乾淨
const promisePool = pool.promise();

module.exports = promisePool;