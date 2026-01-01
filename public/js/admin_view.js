/**
 * ====================================================================
 * 1. 全域變數與初始化
 * ====================================================================
 */
let currentTempPath = "";
let currentImportType = "";

document.addEventListener('DOMContentLoaded', () => {
    togglePlayerSections(); // 根據匯入類型決定 UI 顯示
    refreshDashboard();     // 初始化統計與選單
});

/**
 * ====================================================================
 * 2. UI 互動與格式下載
 * ====================================================================
 */

// 處理檔案選擇顯示文字
document.getElementById('excelFile').addEventListener('change', function (e) {
    const fileName = e.target.files[0] ? e.target.files[0].name : "點擊或拖拽 Excel 檔案至此";
    document.getElementById('fileInfo').innerHTML = `
        <p style="font-size: 1.1rem; color: var(--accent-blue); font-weight: bold;">📄 ${fileName}</p>
        <p style="font-size: 0.9rem; color: var(--success-green);">檔案已就緒，請點擊解析按鈕</p>
    `;
});

// 下載 Excel 匯入範本
function downloadTemplate() {
    const headers = "family_id,serial_number,year,player_id,ch_name,nickname,grade,school_name,jersey_number,sibling,staff,status\n";
    const example = "2026001,1,2026,20260011,NULL,王小明,Leo,四年級,棒球國小,10,兄,否,Major/週日下午";
    const blob = new Blob(["\ufeff" + headers + example], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "球員匯入範本_2026.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 控制區塊顯示隱藏 (匯入類型切換)
function togglePlayerSections() {
    const importType = document.getElementById('importType').value;
    const exampleBox = document.getElementById('playerImportExample');
    const searchCard = document.getElementById('playerSearchCard');
    const resultSection = document.getElementById('resultSectionGlobal');

    const isPlayer = (importType === 'player');
    exampleBox.style.display = isPlayer ? 'block' : 'none';
    searchCard.style.display = isPlayer ? 'block' : 'none';
    if (!isPlayer) resultSection.style.display = 'none';
}

document.getElementById('importType').addEventListener('change', togglePlayerSections);

/**
 * ====================================================================
 * 3. 資料解析與匯入流程 (Excel Import)
 * ====================================================================
 */

// 步驟 1: 上傳並預覽
async function handleUpload() {
    const fileInput = document.getElementById('excelFile');
    const importType = document.getElementById('importType').value;
    const statusMsg = document.getElementById('statusMsg');
    const statusBadge = document.getElementById('statusBadge');

    if (fileInput.files.length === 0) return alert("請先選擇 Excel 檔案");

    if (currentTempPath) {
        console.log("偵測到舊暫存檔，正在清理...", currentTempPath);
        try {
            await fetch('/api/admin/delete-temp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempPath: currentTempPath })
            });
        } catch (err) {
            console.error("自動清理舊檔失敗:", err);
        }
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("type", importType);

    statusMsg.style.display = 'block';
    statusBadge.className = 'status-badge status-loading';
    statusBadge.innerText = '⏳ Python 正在讀取 Excel 資料中...';

    try {
        const response = await fetch('/api/admin/preview-excel', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            currentTempPath = result.tempPath;
            currentImportType = importType;
            renderPreviewTable(result.data);
            statusBadge.className = 'status-badge status-success';
            statusBadge.innerText = `✅ 解析完成，共計 ${result.data.length} 筆資料`;
            document.getElementById('previewSection').style.display = 'block';
        } else { throw new Error(result.message); }
    } catch (err) {
        statusBadge.className = 'status-badge status-error';
        statusBadge.innerText = '❌ 錯誤：' + err.message;
    }
}

// 步驟 2: 渲染預覽表格
function renderPreviewTable(data) {
    const tbody = document.getElementById('previewBody');
    tbody.innerHTML = data.map(item => `
        <tr>
            <td>${item.family_id || '-'}</td>
            <td>${item.serial_number || '-'}</td>
            <td>${item.year}</td>
            <td style="font-weight:bold">${item.player_id}</td>
            <td style="color: var(--accent-blue)">${item.ch_name}</td>
            <td>${item.nickname || '-'}</td>
            <td>${item.grade || '-'}</td>
            <td>${item.school_name || '-'}</td>
            <td>${item.jersey_number || '-'}</td>
            <td>${item.sibling || '-'}</td>
            <td>${item.staff || '-'}</td>
            <td style="font-size: 0.8rem;">${item.status || '-'}</td>
        </tr>
    `).join('');
}

// 步驟 3: 確認正式寫入
async function confirmImport() {
    if (!currentTempPath) return alert("找不到暫存檔案，請重新執行預覽解析。");
    if (!confirm("確定要將預覽的資料正式寫入資料庫嗎？")) return;

    try {
        const response = await fetch('/api/admin/confirm-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tempPath: currentTempPath, type: currentImportType })
        });
        const result = await response.json();
        if (result.success) {
            alert("🎉 匯入成功！" + (result.message || ""));
            location.reload();
        } else { alert("❌ 匯入失敗：" + result.message); }
    } catch (err) { alert("❌ 無法連接伺服器，請檢查網路。"); }
}

// 重置狀態與刪除暫存
async function resetUpload() {
    if (currentTempPath) {
        try {
            await fetch('/api/admin/delete-temp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempPath: currentTempPath })
            });
        } catch (err) { console.error("刪除請求失敗:", err); }
    }
    currentTempPath = "";
    currentImportType = "";
    document.getElementById('excelFile').value = "";
    document.getElementById('fileInfo').innerHTML = `
        <p style="font-size: 1.2rem; margin-bottom: 5px;">點擊或拖拽 Excel 檔案至此</p>
        <p style="color: var(--text-muted); font-size: 0.9rem;">支援格式: .xlsx, .xls, .csv</p>
    `;
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('statusMsg').style.display = 'none';
    document.getElementById('previewBody').innerHTML = "";
    alert("已重置上傳狀態並清除暫存檔");
}

/**
 * ====================================================================
 * 4. 統計與搜尋功能 (Dashboard & Search)
 * ====================================================================
 */

// 更新下拉選單與統計標籤
async function refreshDashboard() {
    updateStatusOptions();
    updateDetailSummary();
}

document.getElementById('yearGlobal').addEventListener('change', refreshDashboard);

// 抓取特定年份的唯一時段
async function updateStatusOptions() {
    const year = document.getElementById('yearGlobal').value;
    const statusSelect = document.getElementById('statusFilterGlobal');
    try {
        const response = await fetch(`/api/admin/player-status?year=${year}`);
        const result = await response.json();
        if (result.success) {
            statusSelect.innerHTML = '<option value="">-- 所有時段 --</option>';
            result.data.forEach(status => {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status;
                statusSelect.appendChild(option);
            });
        }
    } catch (err) { console.error("更新時段選單失敗:", err); }
}

// 統計詳細人數標籤 (含點擊過濾)
async function updateDetailSummary() {
    const year = document.getElementById('yearGlobal').value;
    const bar = document.getElementById('detailSummaryBar');
    try {
        const response = await fetch(`/api/admin/player-detail-summary?year=${year}`);
        const result = await response.json();
        if (result.success) {
            bar.innerHTML = result.data.length === 0 ? '<span style="color: #94a3b8;">此年份暫無球員資料</span>' : '';
            result.data.forEach(item => {
                const badge = document.createElement('div');
                badge.className = 'status-count-badge';
                badge.style.cssText = `background: white; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 20px; font-size: 13px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);`;
                
                badge.onmouseover = () => { badge.style.borderColor = 'var(--accent-blue)'; badge.style.transform = 'translateY(-2px)'; };
                badge.onmouseout = () => { badge.style.borderColor = '#e2e8f0'; badge.style.transform = 'translateY(0)'; };
                badge.onclick = () => {
                    document.getElementById('statusFilterGlobal').value = item.status;
                    handleSearchGlobal();
                };

                badge.innerHTML = `<span style="color: #475569;">${item.status}</span> <b style="color: var(--success-green);">${item.count}</b> 人`;
                bar.appendChild(badge);
            });
        }
    } catch (err) { console.error("更新詳細統計失敗:", err); }
}

// 執行搜尋
async function handleSearchGlobal() {
    const year = document.getElementById('yearGlobal').value;
    const status = document.getElementById('statusFilterGlobal').value;
    const body = document.getElementById('bodyGlobal');
    const head = document.getElementById('headGlobal');
    const section = document.getElementById('resultSectionGlobal');

    section.style.display = 'block';
    body.innerHTML = '<tr><td colspan="6">搜尋中...</td></tr>';

    try {
        const params = new URLSearchParams({ year, status });
        const response = await fetch(`/api/admin/search-players?${params}`);
        const result = await response.json();

        if (result.success && result.data.length > 0) {
            head.innerHTML = `<tr><th>球員 ID</th><th>姓名</th><th>背號</th><th>年級</th><th>兄弟姊妹</th><th>中大教職人員</th><th>狀態/時段</th><th>刪除</th></tr>`;
            body.innerHTML = result.data.map(p => `
                <tr id="player-row-${p.player_id}">
                    <td>${p.player_id}</td>
                    <td style="font-weight:bold; color:var(--accent-blue)">${p.ch_name}</td>
                    <td>${p.jersey_number || '-'}</td>
                    <td>${p.grade || '-'}</td>
                    <td>${p.sibling || '-'}</td>
                    <td>${p.staff}</td>
                    <td>${p.status}</td>
                    <td>
                        <button class="btn-clear" style="border-color: var(--danger-red); padding: 4px 10px; min-width: auto;" onclick="deletePlayer('${p.player_id}', '${p.ch_name}')">🗑️ 刪除</button>
                    </td>
                </tr>`).join('');
        } else { body.innerHTML = '<tr><td colspan="6">查無符合條件的球員</td></tr>'; }
    } catch (err) { body.innerHTML = '<tr><td colspan="6" style="color:red">搜尋失敗</td></tr>'; }
}

// 刪除球員
async function deletePlayer(playerId, playerName) {
    if (!confirm(`⚠️ 確定要刪除球員「${playerName}」嗎？此動作無法復原。`)) return;
    try {
        const response = await fetch(`/api/admin/delete-player/${playerId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            alert("✅ " + result.message);
            handleSearchGlobal();
            updateDetailSummary();
        } else { alert("❌ 刪除失敗：" + result.message); }
    } catch (err) { alert("❌ 無法連接伺服器"); }
}

// 清除查詢
function clearGlobalSearch() {
    document.getElementById('yearGlobal').value = new Date().getFullYear();
    document.getElementById('statusFilterGlobal').value = '';
    document.getElementById('resultSectionGlobal').style.display = 'none';
}