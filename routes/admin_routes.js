const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { spawn } = require('child_process');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); 
    },
    filename: function (req, file, cb) {
        // ✨ 重要：這段代碼確保檔案存入 uploads 時會帶上 .xlsx 或 .csv
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// 預覽 Excel API
router.post('/preview-excel', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "未接收到檔案" });

    const filePath = req.file.path;
    const type = req.body.type || 'player';

    // 呼叫 Python
    const pythonProcess = spawn('python', ['import_script.py', filePath, type, 'preview']);

    let output = "";
    let errorOutput = ""; // ✨ 新增：用來接錯誤訊息

    pythonProcess.stdout.on('data', (data) => output += data.toString());
    pythonProcess.stderr.on('data', (data) => errorOutput += data.toString()); // ✨ 接收 stderr

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            try {
                const data = JSON.parse(output);
                res.json({ success: true, data: data, tempPath: filePath });
            } catch (err) {
                // 如果 JSON 解析失敗，印出 Python 輸出的內容看看是什麼
                console.error("JSON 解析失敗，Python 輸出為:", output);
                res.status(500).json({ success: false, message: "資料解析格式錯誤" });
            }
        } else {
            // ✨ 如果 Python 報錯，這裡會印出具體原因 (例如: 缺少 openpyxl)
            console.error("Python 執行出錯:", errorOutput);
            res.status(500).json({ success: false, message: `解析失敗: ${errorOutput}` });
        }
    });
});

// 確認匯入 API
router.post('/confirm-import', (req, res) => {
    const { tempPath, type } = req.body;

    if (!tempPath) return res.status(400).json({ success: false, message: "遺失暫存檔案路徑" });

    // 呼叫 Python，模式改為 'import'
    const pythonProcess = spawn('python', ['import_script.py', tempPath, type, 'import']);

    let output = "";
    pythonProcess.stdout.on('data', (data) => output += data.toString());
    pythonProcess.stderr.on('data', (data) => console.error(data.toString())); // 印出 Python 的錯誤

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            res.json({ success: true, message: output.trim() });
        } else {
            res.status(500).json({ success: false, message: "匯入過程發生錯誤" });
        }
    });
});

// 刪除暫存檔 API
router.post('/delete-temp', (req, res) => {
    const { tempPath } = req.body;

    if (!tempPath) {
        return res.json({ success: true, message: "無須刪除" });
    }

    // 安全檢查：確保路徑包含 'uploads'，防止惡意刪除系統檔案
    if (tempPath.includes('uploads')) {
        fs.unlink(tempPath, (err) => {
            if (err) {
                console.error("重製刪除失敗:", err);
                return res.status(500).json({ success: false, message: "檔案刪除失敗" });
            }
            console.log(`✅ 已手動刪除暫存檔: ${tempPath}`);
            res.json({ success: true, message: "暫存檔已清除" });
        });
    } else {
        res.status(403).json({ success: false, message: "非法路徑" });
    }
});

// 取得球員狀態清單 API
router.get('/player-status', async (req, res) => {
    const { year } = req.query;
    try {
        // 查詢該年份所有不重複的 status 欄位
        const [rows] = await db.query(
            "SELECT DISTINCT status FROM player WHERE year = ? AND status IS NOT NULL AND status != ''",
            [year]
        );
        res.json({ success: true, data: rows.map(r => r.status) });
    } catch (err) {
        res.status(500).json({ success: false, message: "無法取得時段清單" });
    }
});

// 搜尋球員 API
router.get('/search-players', async (req, res) => {
    // 從網址參數取得 year 和 status
    const { year, status } = req.query;

    try {
        let sql = "SELECT * FROM player WHERE year = ?";
        let params = [year];

        // 如果使用者有選擇特定時段，則增加過濾條件
        if (status && status !== "") {
            sql += " AND status = ?";
            params.push(status);
        }

        sql += " ORDER BY player_id ASC";

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("❌ 查詢球員失敗:", err);
        res.status(500).json({ success: false, message: "資料庫查詢出錯" });
    }
});

// 取得球員狀態統計 API
router.get('/player-detail-summary', async (req, res) => {
    const { year } = req.query;
    try {
        const sql = `
            SELECT 
                status, 
                COUNT(*) AS count 
            FROM player 
            WHERE year = ? AND status IS NOT NULL AND status != ''
            GROUP BY status
            ORDER BY status ASC
        `;
        const [rows] = await db.query(sql, [year]);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: "詳細統計失敗" });
    }
});

// 刪除球員 API
router.delete('/delete-player/:player_id', async (req, res) => {
    const { player_id } = req.params;

    try {
        const sql = "DELETE FROM player WHERE player_id = ?";
        const [result] = await db.query(sql, [player_id]);

        if (result.affectedRows > 0) {
            res.json({ success: true, message: "球員已成功刪除" });
        } else {
            res.status(404).json({ success: false, message: "找不到該球員" });
        }
    } catch (err) {
        console.error("❌ 刪除球員失敗:", err);
        res.status(500).json({ success: false, message: "伺服器錯誤，無法刪除" });
    }
});

module.exports = router;