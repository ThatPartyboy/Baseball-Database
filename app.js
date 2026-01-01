const express = require('express');
const path = require('path');
const app = express();

// 從環境變數讀取 Port
const PORT = process.env.PORT || 3000;

// --- 中間件設定 ---
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // 靜態檔案路徑

// --- 引入路由模組 ---
const publicRoutes = require('./routes/public_routes');
const adminRoutes = require('./routes/admin_routes');

// --- 掛載路徑 ---
app.use('/api', publicRoutes);        // 前台 API 前綴為 /api/
app.use('/api/admin', adminRoutes);  // 後台 API 前綴為 /api/admin/

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`
    ========================================
    🚀 球隊管理系統整合伺服器已啟動
    📡 運行網址: http://localhost:${PORT}
    ========================================
    `);
});