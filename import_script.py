import sys
import pandas as pd
import mysql.connector
import numpy as np
import os

# 強制設定輸出編碼為 UTF-8
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
    
def run_import(file_path, data_type, mode):
    db = None 
    try:
        # --- 核心修正：判斷副檔名並讀取檔案 ---
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"找不到檔案: {file_path}")

        ext = os.path.splitext(file_path)[1].lower()
        
        if ext in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path)
        elif ext == '.csv':
            # 使用 utf-8-sig 可以自動處理 Excel 產出的 CSV 編碼問題
            df = pd.read_csv(file_path, encoding='utf-8-sig')
        else:
            raise ValueError(f"不支援的檔案格式: {ext}")

        # 將所有 NaN 轉為 None (SQL NULL)
        df = df.replace({np.nan: None})

        # --- 預覽模式 (Preview) ---
        if mode == 'preview':
            result_json = df.to_json(orient='records', force_ascii=False)
            print(result_json)
            return

        # --- 正式匯入模式 (Import) ---
        if mode == 'import':
            db = mysql.connector.connect(
                host="localhost",
                user="root",
                password="",  
                database="baseball"
            )
            cursor = db.cursor()
            
            if data_type == 'player':
                count = 0
                for _, row in df.iterrows():
                    sql = """
                        INSERT INTO player 
                        (family_id, serial_number, year, player_id, p_team_id, ch_name, nickname, grade, school_name, jersey_number, sibling, staff, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE 
                        ch_name=VALUES(ch_name), nickname=VALUES(nickname), jersey_number=VALUES(jersey_number), status=VALUES(status)
                    """
                    val = (
                        row['family_id'], 
                        row['serial_number'], 
                        row['year'], 
                        row['player_id'], 
                        None, 
                        row['ch_name'], 
                        row['nickname'], 
                        row['grade'],
                        row['school_name'], 
                        row['jersey_number'], 
                        row['sibling'], 
                        row['staff'], 
                        row['status'],
                    )
                    cursor.execute(sql, val)
                    count += 1
                
                db.commit() 
                print(f"成功匯入 {count} 筆球員資料")
            
            cursor.close()

    except Exception as e:
        print(f"Python 錯誤: {str(e)}", file=sys.stderr)
        sys.exit(1)

    finally:
        if db and db.is_connected():
            db.close()
        
        # 僅在正式匯入模式完成後刪除檔案
        if mode == 'import' and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"刪除暫存檔失敗: {e}", file=sys.stderr)

if __name__ == "__main__":
    f_path = sys.argv[1] if len(sys.argv) > 1 else ""
    d_type = sys.argv[2] if len(sys.argv) > 2 else "player"
    m_mode = sys.argv[3] if len(sys.argv) > 3 else "preview"
    
    run_import(f_path, d_type, m_mode)