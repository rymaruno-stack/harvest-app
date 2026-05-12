# 農業収穫管理アプリ — Claude Code 実装指示書

> **⚠️ スコープ注意**: このプロジェクト専用のディレクトリ内でのみ作業すること。
> このディレクトリ外のファイルは絶対に読み書きしないこと。

## プロジェクト概要

宮崎県のきゅうり農家向け出荷管理Webアプリ。
iPad・スマホから日別出荷数を入力 → Supabase保存 → 既存Excelフォーマットへの書き込み・ダッシュボード表示。

---

## 技術スタック

- **フロントエンド**: Vanilla HTML / CSS / JavaScript（フレームワークなし）
- **バックエンド DB**: Supabase（PostgreSQL）
- **ホスティング**: Vercel（静的サイト）
- **Excelエクスポート**: Python（openpyxl）スクリプト

---

## ファイル構成

```
/
├── index.html          # 出荷入力画面（メイン）
├── dashboard.html      # グラフ・集計ダッシュボード
├── css/
│   └── style.css
├── js/
│   ├── config.js       # Supabase接続設定（.gitignoreに追加）
│   ├── supabase.js
│   ├── harvest.js
│   ├── dashboard.js
│   └── weather.js
├── scripts/
│   ├── export_excel.py
│   └── create_sheet.py
├── .gitignore
└── vercel.json
```

---

## Supabase DBスキーマ

以下のSQLをSupabaseのSQL Editorで実行する。

```sql
CREATE TABLE houses (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL,
  area_a NUMERIC
);

CREATE TABLE harvests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id      INT REFERENCES houses(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  ja_nagabako_am        INT DEFAULT 0,
  ja_fukabako_am        INT DEFAULT 0,
  ja_hirabako_as        INT DEFAULT 0,
  ja_hirabako_am        INT DEFAULT 0,
  ja_10khira_am         INT DEFAULT 0,
  ja_regular_al         INT DEFAULT 0,
  ja_regular_am         INT DEFAULT 0,
  ja_regular_as         INT DEFAULT 0,
  ja_regular_a2s        INT DEFAULT 0,
  ja_regular_bl         INT DEFAULT 0,
  ja_regular_bm         INT DEFAULT 0,
  ja_regular_bs         INT DEFAULT 0,
  ja_kobukuro_al        INT DEFAULT 0,
  ja_kobukuro_bl        INT DEFAULT 0,
  ja_kobukuro_bm        INT DEFAULT 0,
  ja_kobukuro_cm        INT DEFAULT 0,
  ja_kikakugai_dm       INT DEFAULT 0,
  ja_kikakugai_ds       INT DEFAULT 0,
  market_fukabako_a     INT DEFAULT 0,
  market_regular_as     INT DEFAULT 0,
  market_regular_am     INT DEFAULT 0,
  market_regular_al     INT DEFAULT 0,
  market_regular_bs     INT DEFAULT 0,
  market_regular_bm     INT DEFAULT 0,
  market_regular_bl     INT DEFAULT 0,
  market_10k_pori       INT DEFAULT 0,
  jfp_contena           INT DEFAULT 0,
  jfp_fukabako_5kg      INT DEFAULT 0,
  jfp_b_5kg             INT DEFAULT 0,
  jfp_cd_10kg           INT DEFAULT 0,
  ja_uriage_nagabako    NUMERIC DEFAULT 0,
  ja_uriage_fukabako    NUMERIC DEFAULT 0,
  ja_uriage_hirabako    NUMERIC DEFAULT 0,
  ja_uriage_10k         NUMERIC DEFAULT 0,
  ja_uriage_regular     NUMERIC DEFAULT 0,
  ja_uriage_kobukuro    NUMERIC DEFAULT 0,
  ja_uriage_kikakugai   NUMERIC DEFAULT 0,
  market_uriage_fukabako_a  NUMERIC DEFAULT 0,
  market_uriage_as          NUMERIC DEFAULT 0,
  market_uriage_am          NUMERIC DEFAULT 0,
  market_uriage_al          NUMERIC DEFAULT 0,
  market_uriage_bs          NUMERIC DEFAULT 0,
  market_uriage_bm          NUMERIC DEFAULT 0,
  market_uriage_bl          NUMERIC DEFAULT 0,
  market_uriage_pori        NUMERIC DEFAULT 0,
  jfp_uriage_contena    NUMERIC DEFAULT 0,
  jfp_uriage_fukabako   NUMERIC DEFAULT 0,
  jfp_uriage_b          NUMERIC DEFAULT 0,
  jfp_uriage_cd         NUMERIC DEFAULT 0,
  ja_date               DATE,
  market_date           DATE,
  jfp_date              DATE,
  container_date        DATE,
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(house_id, date)
);

CREATE TABLE weather_logs (
  date         DATE PRIMARY KEY,
  temp_max     NUMERIC,
  temp_min     NUMERIC,
  weather_code TEXT,
  weather_desc TEXT,
  fetched_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE houses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON houses       FOR ALL USING (true);
CREATE POLICY "Allow all" ON harvests     FOR ALL USING (true);
CREATE POLICY "Allow all" ON weather_logs FOR ALL USING (true);

INSERT INTO houses (name, area_a) VALUES
  ('初号機', 20),
  ('弐号機', 17),
  ('参号機', 10);
```

---

## Excelファイルの構造（重要）

ファイル名: `2025出荷実績.xlsx`
月シート: `10月` `11月` `12月` `1月` `2月` `3月` `4月`

### 各月シートのレイアウト

| セクション  | データ開始行 | データ終了行 |
|------------|-------------|-------------|
| 全体 47a   | 行6（1日）  | 行36（31日）|
| 初号機 20a | 行46（1日） | 行76（31日）|
| 弐号機 17a | 行86（1日） | 行116（31日）|
| 参号機 10a | 行126（1日）| 行156（31日）|

### 列マッピング（全セクション共通）

| 列  | 内容              | DBフィールド              |
|-----|-------------------|--------------------------|
| C   | JA 長箱AM         | ja_nagabako_am           |
| D   | JA 深箱AM         | ja_fukabako_am           |
| E   | JA 平箱AS         | ja_hirabako_as           |
| F   | JA 平箱AM         | ja_hirabako_am           |
| G   | JA 10k平AM        | ja_10khira_am            |
| H   | JA レギュラーAL   | ja_regular_al            |
| I   | JA レギュラーAM   | ja_regular_am            |
| J   | JA レギュラーAS   | ja_regular_as            |
| K   | JA レギュラーA2S  | ja_regular_a2s           |
| L   | JA レギュラーBL   | ja_regular_bl            |
| M   | JA レギュラーBM   | ja_regular_bm            |
| N   | JA レギュラーBS   | ja_regular_bs            |
| O   | JA 小袋AL         | ja_kobukuro_al           |
| P   | JA 小袋BL         | ja_kobukuro_bl           |
| Q   | JA 小袋BM         | ja_kobukuro_bm           |
| R   | JA 小袋CM         | ja_kobukuro_cm           |
| S   | JA 規格外DM       | ja_kikakugai_dm          |
| T   | JA 規格外DS       | ja_kikakugai_ds          |
| U   | 市場 深箱A        | market_fukabako_a        |
| V   | 市場 レギュラーAS | market_regular_as        |
| W   | 市場 レギュラーAM | market_regular_am        |
| X   | 市場 レギュラーAL | market_regular_al        |
| Y   | 市場 レギュラーBS | market_regular_bs        |
| Z   | 市場 レギュラーBM | market_regular_bm        |
| AA  | 市場 レギュラーBL | market_regular_bl        |
| AB  | 市場 10kポリ      | market_10k_pori          |
| AC  | JFP コンテナ      | jfp_contena              |
| AD  | JFP 深箱5kg       | jfp_fukabako_5kg         |
| AE  | JFP B 5kg         | jfp_b_5kg                |
| AF  | JFP CD 10kg       | jfp_cd_10kg              |
| AG  | JA売上 長箱AM     | ja_uriage_nagabako       |
| AH  | JA売上 深箱AM     | ja_uriage_fukabako       |
| AI  | JA売上 平箱       | ja_uriage_hirabako       |
| AJ  | JA売上 10k平箱    | ja_uriage_10k            |
| AK  | JA売上 レギュラー | ja_uriage_regular        |
| AL  | JA売上 小袋       | ja_uriage_kobukuro       |
| AM  | JA売上 規格外     | ja_uriage_kikakugai      |
| AN  | 市場売上 深箱A    | market_uriage_fukabako_a |
| AO  | 市場売上 AS       | market_uriage_as         |
| AP  | 市場売上 AM       | market_uriage_am         |
| AQ  | 市場売上 AL       | market_uriage_al         |
| AR  | 市場売上 BS       | market_uriage_bs         |
| AS  | 市場売上 BM       | market_uriage_bm         |
| AT  | 市場売上 BL       | market_uriage_bl         |
| AU  | 市場売上 ポリ     | market_uriage_pori       |
| AV  | JFP売上 コンテナ  | jfp_uriage_contena       |
| AW  | JFP売上 深箱      | jfp_uriage_fukabako      |
| AX  | JFP売上 B         | jfp_uriage_b             |
| AY  | JFP売上 CD        | jfp_uriage_cd            |

---

## 各画面の実装要件

### 1. 出荷入力画面（index.html）

**UIデザイン**:
- 深緑×白のシンプルなデザイン
- iPad優先（min-height: 52px）
- 1日1回まとめて入力するフロー

**機能**:
- ハウス選択タブ（初号機 / 弐号機 / 参号機）
- 日付選択（デフォルト: 今日）
- 出荷数入力フォーム
  - **メイン表示（大きく優先）**:
    - JA: 深箱AM / レギュラーAL・AM・AS / 規格外DM
    - 市場: レギュラーAS・AM・AL・BM・BL
    - JFP: コンテナ・深箱5kg・B5kg・CD10kg
  - **「詳細入力」で展開**:
    - JA: 長箱・平箱・10k平・A2S/BL/BM/BS・小袋全種・規格外DS
    - 市場: 深箱A・レギュラーBS・10kポリ
- 売上入力（JA・市場・JFP）
- メモ欄
- 「保存」ボタン → UPSERT（house_id + date でユニーク）
- 保存後に全ハウス今日の合計表示
- 過去7日分の履歴カード

### 2. ダッシュボード（dashboard.html）

- 期間切替: 日・週・月・年
- ハウス切替: 初号機 / 弐号機 / 参号機 / 全体
- Chart.js（CDN: https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js）
  - 棒グラフ: 日別出荷箱数（JA・市場・JFP 積み上げ）
  - 折れ線: 気温（最高・最低）2軸
  - 積算グラフ: 月累計 vs 目標
- サマリーカード（合計箱数・売上・日平均）

### 3. 気象庁API（weather.js）

```
https://www.jma.go.jp/bosai/forecast/data/forecast/450010.json
```
ページ読み込み時に当日未取得なら自動取得・保存。

### 4. Excelエクスポート（scripts/export_excel.py）

```bash
pip install openpyxl supabase python-dateutil
python scripts/export_excel.py --year 2025 --month 11 --template "2025出荷実績.xlsx" --output "2025出荷実績_updated.xlsx"
```

上記の列マッピングを使い、全体・初号機・弐号機・参号機の4セクション全てに書き込む。

### 5. 月次シート生成（scripts/create_sheet.py）

```bash
python scripts/create_sheet.py --template "2025出荷実績.xlsx" --year 2025 --month 12
```

前月シートを複製、日付・曜日を更新、数値データをクリア。

---

## config.js（.gitignoreに追加）

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

---

## .gitignore

```
config.js
*.pyc
__pycache__/
.env
*.xlsx
```

---

## vercel.json

```json
{
  "cleanUrls": true,
  "trailingSlash": false
}
```

---

## 実装の優先順位

1. Supabase テーブル作成
2. config.js に接続情報を記入
3. index.html 実装・動作確認
4. dashboard.html 実装
5. weather.js 追加
6. export_excel.py 確認
7. create_sheet.py 確認
8. Vercel デプロイ
