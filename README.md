# 冰河地形工作室 V2（先做地形與等高線；不包含 AR）

這是免費靜態網頁。**先在地圖或 3D 模型放置可調整的地形「積木」，以高度變形塑造地表，再從同一個 DEM 生成等高線、ASC 和 GLB**。可儲存與載入 JSON 專案。

## 安裝

建立一個新的 GitHub Pages 公開儲存庫，例如 `glacier-terrain-studio`，將以下檔案上傳到根目錄：
- `index.html`
- `style.css`
- `terrain-core.js`
- `app.js`

到 `Settings → Pages → Deploy from a branch → main / (root)` 開啟 GitHub Pages。請使用 HTTPS 網址開啟。Three.js 從 jsDelivr 讀取，第一次載入需要網路。

若在電腦上本機測試，在本資料夾執行 `python -m http.server 8000`，以 `http://localhost:8000` 開啟；直接雙擊 HTML 可能因 module 安全限制失敗。

## 使用流程

1. 按「載入虛構冰河教學地景」或「建立平坦地表」。
2. 在左側點選一種地形，例如「冰斗」，再於地圖或 3D 地表單擊放置。
3. 左側點「選取／拖曳」後，在地圖點選圓點、拖動積木。
4. 右側可改變高差、長寬、角度、邊緣柔和，並設定全局平滑。
5. 等高線與 3D 模型會隨修改同步更新，能切換「原始地表／塑形後／作用差異」。
6. 輸出橫式 A4 等高線 PNG、精確高程 ASC、3D GLB 和可再次編輯的 JSON。

## 真實地形

支援 3 個有地理座標的實際 DEM 案例，可從 Mapzen Terrain Tiles（AWS Open Data）下載：
- 瑞士阿雷奇冰河附近（46.43, 8.06；山岳冰河）
- 美國威斯康辛 Clyman 鼓丘附近（43.342419, -88.689722；冰河堆積丘陵）
- 冰島 Skeiðarársandur 附近（63.895, -17.3；冰水沖積平原）

線上下載需要網路與跨來源讀取權限；若失敗，可按「開啟目前案例原始 Terrarium PNG」，儲存圖檔，再從本機匯入。**實際案例是 DEM 高程，不是衛星影像，也不表示其中每個丘陵已經得到成因鑑定**。Mapzen 會融合 SRTM、USGS 3DEP 等多個來源，依位置與縮放層級提供不同解析度；細微蛇丘可能無法辨識。

支援本機：
- `*.asc`：ESRI ASCII Grid（高度為實際高程）。
- `*.tif` / `*.tiff`：GeoTIFF 第一波段，瀏覽器另載入 geotiff.js。
- `*.png`：**僅支援 Terrarium 編碼**（不支援普通 RGB 地圖或任意灰階高度圖）。

## 高程與比例說明

- 所有積木是數值高程變形；可平滑其所造成的高程變化，不會反覆模糊原始 DEM。
- 「冰蝕」類造型用負高差（凹槽、冰斗），「堆積」類用正高差（脊丘），部分造型如角峰代表示意性山體骨架，**不等同冰河造山的實際過程**。
- 「原始地表」是加積木前的狀態；真實 DEM 上的後續變形是模擬，不是實際發生的變遷。
- 匯出 ASC 有高程值，水平坐標是相對位置；GeoTIFF 若為地理經緯度座標系統，先在 QGIS 投影到公尺制，才能取得正確水平比例。
- GLB 高度依當次高程範圍規一化以利觀察，**不是具地理參考或 1:1 公尺比例的模型**。AR 紙面定位留待下一版處理。
- 等高線採網格 marching squares 產生，解析度固定 180 × 108。網格解析度及原始 DEM 都會限制可辨識的地形大小。
- 平滑、等高線設定及 3D 顯示需要瀏覽器支援 WebGL。PDF 暫未提供，A4 PNG 3508 × 2480 可列印。

## 地理資料來源

- Mapzen Terrain Tiles / AWS Open Data： https://registry.opendata.aws/terrain-tiles/
- DEM 說明：https://github.com/tilezen/joerd/blob/master/docs/attribution.md
- GeoTIFF 解碼：https://geotiffjs.github.io/geotiff.js/

建議課堂流程：先比較「原始地表」→ 在指定位置增加冰斗、冰槽、端磧或蛇丘 → 查看地形「作用差異」→ 檢驗等高線如何改變。不要只依地形表面形狀就判斷沉積物種類或完整形成機制。
