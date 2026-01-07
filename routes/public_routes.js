const express = require('express');
const router = express.Router();
const db = require('../config/db'); // 注意路徑變為兩層

/**
 * 1. 綜合查詢系統 (球員 / 家長) 
 */
router.get('/search', async (req, res) => {
    const { type, year, keyword } = req.query;

    try {
        let players = [];
        let parents = [];
        let relatives = [];

        if (type === 'player') {
            // --- 查詢球員模式 ---
            let pSql = `SELECT * FROM player WHERE (player_id LIKE ? OR ch_name LIKE ? OR nickname LIKE ?)`;
            let pParams = [keyword, `%${keyword}%`, `%${keyword}%` || ''];

            // 動態加入年份過濾
            if (year && year.trim() !== "") {
                pSql += ` AND year = ?`;
                pParams.push(year);
            }

            const [pRows] = await db.query(pSql, pParams);
            players = pRows;

            // 如果有找到球員，抓取關聯的家族成員
            if (players.length > 0) {
                const familyIds = [...new Set(players.map(p => p.family_id).filter(id => id))];
                if (familyIds.length > 0) {
                    const [paRows] = await db.query(`SELECT * FROM parent WHERE family_id IN (?)`, [familyIds]);
                    parents = paRows;
                    const [rRows] = await db.query(`SELECT * FROM relative WHERE family_id IN (?)`, [familyIds]);
                    relatives = rRows;
                }
            }

        } else if (type === 'parent') {
            // --- 查詢家長模式 ---
            let paSql = `SELECT * FROM parent WHERE (parent_id = ? OR ch_name LIKE ? OR nickname LIKE ?)`;
            let paParams = [keyword, `%${keyword}%`, `%${keyword}%` || ''];

            if (year && year.trim() !== "") {
                paSql += ` AND year = ?`;
                paParams.push(year);
            }

            const [paRows] = await db.query(paSql, paParams);
            parents = paRows;

            // 如果有找到家長，抓取關聯的小孩與親屬
            if (parents.length > 0) {
                const familyIds = [...new Set(parents.map(p => p.family_id).filter(id => id))];
                if (familyIds.length > 0) {
                    const [pRows] = await db.query(`SELECT * FROM player WHERE family_id IN (?)`, [familyIds]);
                    players = pRows;
                    const [rRows] = await db.query(`SELECT * FROM relative WHERE family_id IN (?)`, [familyIds]);
                    relatives = rRows;
                }
            }
        }
        res.json({
            success: true,
            players,
            parents,
            relatives
        });

    } catch (err) {
        console.error("❌ 綜合搜尋 API 錯誤:", err);
        res.status(500).json({
            success: false,
            error: "搜尋失敗，請檢查資料庫連接或語法"
        });
    }
});

/**
 * 2-1. 球隊資訊查詢
 */
router.get('/search-team', async (req, res) => {
    const { keyword, year, level } = req.query; // 增加 level 參數

    try {
        let sql = `SELECT * FROM team WHERE 1=1`;
        let params = [];

        if (year && year.trim() !== "") {
            sql += ` AND year = ?`;
            params.push(year);
        }

        if (level && level.trim() !== "") {
            sql += ` AND level = ?`;
            params.push(level);
        }

        if (keyword && keyword.trim() !== "") {
            sql += ` AND (team_id = ?)`;
            params.push(keyword);
        }

        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "資料庫讀取失敗" });
    }
});

/**
 * 2-2. 取得特定球隊的所有球員
 */
router.get('/team-player', async (req, res) => {
    const { team_id } = req.query;

    if (!team_id) {
        return res.status(400).json({ error: "遺失必要參數: team_id" });
    }

    try {
        const sql = `
            SELECT *
            FROM player
            WHERE p_team_id = ?
            ORDER BY grade ASC 
        `;
        const [rows] = await db.query(sql, [team_id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "伺服器內部錯誤，無法讀取球員資料" });
    }
});

/**
 * 2-3. 取得特定球隊的所有InRole
 */
router.get('/team-inrole', async (req, res) => {
    const { team_id } = req.query;

    if (!team_id) {
        return res.status(400).json({ error: "遺失必要參數: team_id" });
    }

    try {
        const sql = `
            SELECT t.year, t.team_id, ir.role, ir.r_parent_id, p.nickname
            FROM team t
            JOIN in_role ir ON t.team_id = ir.r_team_id
            JOIN parent p ON ir.r_parent_id = p.parent_id
            WHERE t.team_id = ?
            ORDER BY ir.role ASC
        `;
        const [rows] = await db.query(sql, [team_id]);
        res.json(rows);

    } catch (err) {
        console.error(`❌ [team-inrole] Error: ${err.message}`);
        res.status(500).json({ error: "伺服器內部錯誤，無法讀取球員資料" });
    }
});

/**
 * 3-1. 球賽資訊查詢
 */
router.get('/search-game', async (req, res) => {
    const { keyword, season, level } = req.query;

    try {
        let sql = `
            SELECT 
                lg.*, 
                guest.team_name AS guest_name, 
                home.team_name AS home_name 
            FROM league_game AS lg
            LEFT JOIN team AS guest ON lg.g_team_id = guest.team_id
            LEFT JOIN team AS home ON lg.h_team_id = home.team_id
            WHERE 1=1`;

        let params = [];

        // 2. 動態過濾條件：層級、賽季
        if (season && season.trim() !== "") {
            sql += ` AND lg.season = ?`;
            params.push(season);
        }

        if (level && level.trim() !== "") {
            sql += ` AND lg.level = ?`;
            params.push(level);
        }

        // 3. 關鍵字搜尋：修正為搜尋聯集後的「球隊名稱」
        if (keyword && keyword.trim() !== "") {
            sql += ` AND (guest.team_id = ? OR home.team_id = ?)`;
            params.push(keyword, keyword);
        }

        // 4. 排序：賽季 -> 自然排序場序
        sql += ` ORDER BY lg.season ASC, LENGTH(lg.serNo) ASC, lg.serNo ASC`;

        const [rows] = await db.query(sql, params);
        res.json(rows);

    } catch (err) {
        console.error("❌ API Error:", err);
        res.status(500).json({ error: "資料庫讀取失敗" });
    }
});

/**
 * 3-2. 統計主審出勤次數排名
 */
router.get('/umpire-ranking', async (req, res) => {
    const { year, level, season } = req.query;

    try {
        let sql = `
            SELECT head_umpire, COUNT(*) as duty_count
            FROM league_game
            WHERE head_umpire IS NOT NULL AND head_umpire != ''
        `;
        let params = [];

        // 如果有選擇年份，則加入過濾條件
        if (year && year.trim() !== "") {
            sql += " AND year = ?";
            params.push(year);
        }

        // 如果有選擇層級，則加入過濾條件
        if (level && level.trim() !== "") {
            sql += " AND level = ?";
            params.push(level);
        }
        // 如果有選擇賽季，則加入過濾條件
        if (season && season.trim() !== "") {
            sql += " AND season = ?";
            params.push(season);
        }

        sql += " GROUP BY head_umpire ORDER BY duty_count DESC";

        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("❌ 主審排名查詢失敗:", err);
        res.status(500).json({ success: false, error: "無法計算主審排名" });
    }
});

/**
 * 3-3. 賽事排名計算 (積分賽/預賽)
 */
router.get('/standings', async (req, res) => {
    const {season, round, level, group } = req.query;

    try {
        let sql = `
            SELECT 
                stats.group,
                t.team_name,
                stats.team_id,
                SUM(stats.points) AS total_points,
                SUM(stats.runs_allowed) AS total_runs_allowed,
                SUM(stats.runs_scored) AS total_runs_scored,
                COUNT(stats.serNo) AS games_played
            FROM (
                -- 處理後攻球隊的數據
                SELECT 
                    h_team_id AS team_id, 
                    hPoint AS points, 
                    gScore AS runs_allowed, 
                    hScore AS runs_scored,
                    serNo, round, level, season, \`group\`
                FROM league_game
                UNION ALL
                -- 處理先攻球隊的數據
                SELECT 
                    g_team_id AS team_id, 
                    gPoint AS points, 
                    hScore AS runs_allowed, 
                    gScore AS runs_scored,
                    serNo, round, level, season, \`group\`
                FROM league_game
            ) AS stats
            JOIN team t ON stats.team_id = t.team_id
            WHERE stats.season = ? AND stats.round = ? AND stats.level = ? 
        `;

        let params = [season, round, level];

        if (group && group.trim() !== "") {
            sql += ` AND stats.\`group\` LIKE ?`;
            params.push(`%${group}%`);
        }

        sql += `
            GROUP BY stats.team_id, t.team_name
            ORDER BY 
                total_points DESC,          -- 1. 積分最高
                total_runs_allowed ASC,     -- 2. 失分最低
                total_runs_scored DESC      -- 3. 得分最高
        `;


        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });

    } catch (err) {
        console.error("❌ 排名計算錯誤:", err);
        res.status(500).json({ success: false, error: "無法讀取排名資料" });
    }
});

/**
 * 下拉式選單資料取得
 */
router.get('/level', async (req, res) => {
    try {
        const sql = `SELECT DISTINCT level FROM team WHERE level IS NOT NULL AND level != '' ORDER BY level ASC`;
        const [rows] = await db.query(sql);
        // 回傳格式如: ["MajorA", "MajorB", "U8D"]
        const levels = rows.map(row => row.level);
        res.json(levels);
    } catch (err) {
        res.status(500).json({ error: "無法讀取層級資料" });
    }
});

router.get('/game-level', async (req, res) => {
    try {
        const sql = `SELECT DISTINCT level FROM league_game WHERE level IS NOT NULL AND level != '' ORDER BY level ASC`;
        const [rows] = await db.query(sql);
        // 回傳格式如: ["MajorA", "MajorB", "U8D"]
        const levels = rows.map(row => row.level);
        res.json(levels);
    } catch (err) {
        res.status(500).json({ error: "無法讀取層級資料" });
    }
});

router.get('/season', async (req, res) => {
    try {
        const sql = `SELECT DISTINCT season FROM league_game ORDER BY season DESC`;
        const [rows] = await db.query(sql);
        const season = rows.map(row => row.season);
        res.json(season);

    } catch (err) {
        res.status(500).json({ error: "無法讀取賽季資料" });
    }
});

router.get('/round', async (req, res) => {
    const { season } = req.query;
    try {
        const sql = `SELECT DISTINCT round FROM league_game WHERE season = ? ORDER BY round DESC`;
        const [rows] = await db.query(sql, [season]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "無法讀取賽季與賽別資料" });
    }
});

router.get('/level-by-round', async (req, res) => {
    const { season, round } = req.query;
    try {
        const sql = `SELECT DISTINCT level FROM league_game WHERE season = ? AND round = ? ORDER BY level ASC`;
        const [rows] = await db.query(sql, [season, round]);
        const levels = rows.map(row => row.level);
        res.json(levels);
    } catch (err) {
        res.status(500).json({ error: "無法讀取層級資料" });
    }
});

router.get('/team-by-year-level', async (req, res) => {
    const { year, level } = req.query;
    try {
        const sql = `SELECT DISTINCT team_id FROM team WHERE year = ? AND level = ? ORDER BY team_id ASC`;
        const [rows] = await db.query(sql, [year, level]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "無法讀取球隊資料" });
    }
});

router.get('/team-by-season-level', async (req, res) => {
    const { season, level } = req.query;
    try {
        const sql = `SELECT DISTINCT h_team_id FROM league_game WHERE season = ? AND level = ? ORDER BY h_team_id ASC`;
        const [rows] = await db.query(sql, [season, level]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "無法讀取球隊資料" });
    }
});

module.exports = router;