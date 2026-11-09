# DUSTLINE 沙境獵場

Three.js 與 Vite 製作的單人第一人稱魚機原型。預設手動射擊，也可開啟自動瞄準與射擊。每發子彈花費賞金，擊倒獵物會發獎並持續補怪，每擊倒 24 隻進入下一波。每次重新載入會開始新的一局。

## 啟動

在專案目錄執行以下命令。開發環境使用 Node.js 24。

```powershell
npm.cmd ci
npm.cmd run dev
```

電腦開啟終端顯示的 Local 網址。手機與電腦連上同一個區域網路後，開啟終端顯示的 Network 網址。遊戲會從本機專案載入怪物、材質、天空與字型。

```powershell
npm.cmd run build
npm.cmd run preview
```

## 遊玩

- 初次啟動先進入首頁大廳。選「一般模式」進入沙境獵場，選「BOSS 挑戰」再挑典獄長或鬼新娘；首頁顯示目前賞金與裝備，也可開啟軍械商店。
- 大廳可用 BET 加減按鈕或直接輸入設定單發扣款，範圍 1–1,000 幣，預設 10 幣。所有槍械、手動與自動射擊共用此金額；戰鬥刀不扣款。回大廳及切換模式保留 BET，重新載入恢復預設。BET 僅調整扣款，不改變傷害或獎金；餘額不足一發時不射擊、不消耗彈藥，可回大廳調低 BET。
- 按 ESC（手機點暫停）顯示「返回」與「回到首頁」；再次按 ESC 也可繼續遊戲。回首頁保留本次開啟遊戲期間的賞金、武器、彈藥與一般獵場進度，重新載入仍會重開一局。
- 桌機使用 WASD 移動、滑鼠轉向、Shift 跑步、按住 Ctrl 蹲下、空白鍵跳躍。先按住 Ctrl 再按空白鍵可蹲跳上高箱。鬆開 Ctrl 且頭頂有空間時會起身。R 主動換彈，1 步槍、2 手槍、3 戰鬥刀、4 已購買的重機槍、Esc 暫停。滑鼠左鍵射擊，手槍點放，步槍及重機槍可按住連發。右鍵切換瞄準，再按一次回到腰射。AK 使用圓筒紅點鏡，MG3 使用機械照門與準星。持刀點擊或按住左鍵揮砍，命中距離 2.5 公尺。
- 觸控使用左側搖桿移動，推到底跑步。右側滑動轉向，點「蹲」切換姿勢，再點「跳」即可蹲跳。裝備步槍或重機槍時會顯示瞄準按鈕，武器也可在軍械商店切換。
- 按 B 或點擊「軍械商店」購買與裝備。商店開啟期間暫停獵殺。
- 換彈進度達到 50% 後切換武器，原武器視為已換好彈匣；切回時直接使用滿彈。未達 50% 就切換則取消換彈並保留原彈量。適用 AK、手槍及 MG3。
- MG3 重機槍售價 450 賞金，購買後可用數字鍵 4 裝備。每箱 200 發，每發按 BET 扣款、21 傷害。按住滑鼠左鍵或觸控射擊鈕可持續連射，R 可提前換箱。空箱會自動換彈，需 4.8 秒。
- 按 J 或點擊「BOSS 挑戰」，選「典獄長」進入 C 區監獄中庭。小殭屍可從柵門出場，或從接近 24 公尺高的屋架跳下。
- 進場有 100 生命，每次重擊扣 10 點。典獄長會預判跑位，紅色預警出現後落點就會固定。直線重擊可側閃或變向，圓形震擊要跑出圈外。留意第一擊後的「回掃追擊」，半血後每次直線重擊都會回掃。
- BOSS 關卡擊倒小怪有 8% 機率掉落金色物資箱，走近約 1 公尺自動拾取，每箱隨機獲得一種補給：回血 30／60（上限 100，綠色邊緣閃光）、MG3（200 發並自動裝備），或移速 +35% 持續 20 秒（青色邊緣光與倒數）。加速再次取得會刷新 20 秒，不疊加倍率；商店與暫停期間停止倒數，重試、結算或離開監獄會清除加速。
- 物資箱帶有原作常駐 EFK、金色地面光圈、向上光柱與漂浮光點。最多保留 8 箱，60 秒未拾取便回收，最後 8 秒播放 warning 動作。只有小怪會掉落，典獄長與沙境怪物不掉此補給。
- 命中典獄長且未擊倒時，每次有 6% 機率開小獎。命中處會噴出 1–3 枚大幣與 5–7 枚小幣，再飛向左下錢包。大幣值 5、小幣值 1，單次共 10–22 賞金。典獄長正在攻擊時會把動作播到最後一幀，期間同樣能領獎。
- 擊倒典獄長可領 400 賞金。結算後可回首頁重新選擇模式，失敗畫面另提供重試；戰鬥中也能按 J 或 ESC 回首頁。下次進入一般模式會恢復原獵場位置與波次，各模式共用武器、彈藥與賞金。
- 初始賞金 100,000，開局免費配發並裝備 AK-47，另備 P12 手槍與 KA-BAR 戰鬥刀。AK-47 彈匣 30 發，手槍彈匣 12 發，每發皆按大廳 BET 扣款。彈匣耗盡會自動換彈。餘額低於 2 幣時可在商店領取補給。
- 按 F 或點擊「自動射擊」切換模式。開啟後優先鎖定靠近準星且可見的獵物，射擊前會再次檢查遮擋與實際怪物網格。
- 所有射擊都消耗一發彈藥。第一個命中點在建築牆面時會爆開、留下彈痕並全額退回這一發的賞金。命中怪物、地面、道具或射向天空皆照常計費。

- T 出生平台可往中路、隧道或 A 大門。中路雙門前的 Xbox 箱可蹲跳接 A 小道，CT 橋下也可沿貨箱跳上小道。A 大道由兩組轉角木門通往藍箱、大坑與 A 坡。B 點可經上層隧道、雙門，或踩 CT 側鷹架蹲身穿過破窗。高低差與落腳面依單人移動調整。[Valve 的 CS:GO Dust II 場景對照](https://www.counter-strike.net/dust2/) · [Dust II 俯視圖與點位](https://betrefs.gg/cs2-callouts/dust2)

## 開發入口

- `src/main.js` 管理輸入、戰鬥、商店與賞金。
- `src/boss-supplies.js` 管理物資掉落、碰撞遮擋拾取、補給 HUD 與 8 槽 Pool。共享幾何、貼圖與動畫片段，重用骨架與播放器；特效共用既有 Effekseer context，沒有新增動態光源或後處理。只在第一次載入監獄時讀取資源。
- 物資箱使用 FishDefine.lua 的 wait（80–140）、warning（150–190）、dead（200–260），30 fps，不綁定 start 動作。模型與貼圖已放在 `public/supplies/airdrop.glb`；可用 `node tools/convert_cocos_zombies.mjs --supply <空投物資資料夾>` 重新轉換。來源與 EFK 變換記錄見 `public/supplies/CREDITS.txt`。
- `src/prison.js` 建立監獄、可開啟的柵門與場景碰撞；`src/warden.js` 控制典獄長、原作動作、材質與攻擊判定。典獄長模型、ShaderAtlas、囚衣與 Effekseer 資源均隨專案附上。
- 典獄長的進場、常駐與直線重擊 EFK 依原作掛在 `Root` 骨骼，使用本地縮放 100、旋轉 0，每幀繼承模型的世界變換。震擊與金幣閃光在觸發時取用當下的朝向與比例，留在實際落點或命中處。
- `src/world.js` 建構地圖、碰撞、分區批次、掃描材質、風沙與植被 shader。
- `src/hunt.js` 重用 24 隻怪物的模型、骨架與動畫播放器。死亡演出結束後逐隻補回，優先在玩家附近可見的空地補足 4 隻。切換區域時可調動遠處健康且離開視野的怪物。每波的血量加成套用於新進場的怪物。
- 男女行屍與盜墓者的空降使用 FishDefine.lua 的 `jump_down`、`stand_up`，依 30 fps 播放。有頂棚的落點改用淡入，木乃伊淡入時播放 `walk`，死靈法師播放 `idle`。
- 追蹤獨立於自動射擊。怪物進入玩家視野且胸口或頭部可見時，以每秒約 1.0–1.3 公尺靠近，在距離 2.4–3.15 公尺處停下。遮蔽判定分散到不同影格執行。
- `src/hunt-navigation.js` 使用共享的分層尋路，分辨地面、橋上、橋下與箱頂，沿樓梯、斜坡及障礙外側前進。怪物一旦發現玩家，就持續追蹤玩家目前的位置；離開畫面或被牆遮擋皆不會解除追蹤，也沒有追蹤逾時。追蹤中的怪物不會被人口補充機制搬走，死亡或重新生成時才清除追蹤狀態。
- 可跳上最多約 1.32 公尺的低矮落腳面，或分段踩貨箱追到高處。起跳前檢查整段身體碰撞、頭頂空間與落點，空中使用重力拋物線；男女殭屍與盜墓者沿用原作 jump_down／stand_up 動作，落地動作照原速播完。過高或無法到達的地方會停在可達位置，等待路線改變。
- 導航格點與連線按需求建立並快取，所有小怪共用搜尋工作區，每幀搜尋工作預算 2 毫秒、最多展開 80 節點。死亡與重生會清除舊路線；群聚避讓只在相同樓層側移，不會將怪物推進平台。可用 `npm test` 執行繞牆、樓梯、橋梁分層、跳躍碰撞、群聚及重生測試。
- `src/weapons.js` 定義數值與第一人稱槍模。彈道和命中粒子位於 `src/effects.js`。
- `src/combat-particles.js` 使用本機的 Effekseer for WebGL 1.80.3。命中綠血與場景共用深度緩衝，最多同時播放三次。收幣時，原作的 `Coin_UP_Get_Flash.efk` 會在賞金圖示前播放，最短間隔 0.2 秒。[Effekseer 發行版本](https://github.com/effekseer/Effekseer/releases/tag/1803)
- `src/reward-coins.js` 依原作掉落表播放星幣。盜墓者、木乃伊與死靈法師每次非致命命中有 20% 機率開小獎，擊殺仍領全額。桌機金幣池上限 160 枚，觸控裝置 96 枚。
- `tools/convert_monsters.py` 透過 Blender 轉出木乃伊與死靈法師。`node tools/convert_cocos_zombies.mjs <TMDC_Zombie目錄>` 從原遊戲的 C3B 和貼圖重建男女殭屍與盜墓者 GLB，保留完整的骨架與道具動畫。一般開發與遊玩直接使用 `public/monsters` 內的成品。
- 死靈法師使用原生 idle。幀表中沒有 idle 的角色使用各自的站定姿勢與輕微呼吸。男女殭屍和盜墓者播放各自的 dead 段，木乃伊和死靈法師採用原遊戲的普通退場。

## 音效接點

匯入 `src/events.js` 的 `gameEvents` 接收事件。空間座標使用 Three.js 世界座標，Y 軸朝上。射擊、命中與擊倒是各自獨立的事件，同一次射擊可能依序觸發三者。

```js
import { gameEvents } from './events.js';

gameEvents.addEventListener('weapon:fire', ({ detail }) => {
  const { weapon, origin, target, cost } = detail;
  // 在此接入手槍或步槍音效。origin 與 target 均為 [x, y, z]。
});
```

| 事件 | detail 欄位 |
| --- | --- |
| `weapon:swing` | weapon |
| `weapon:fire` | weapon, origin, target, cost |
| `world:impact` | kind，position |
| `wallet:refund` | amount，weapon |
| `weapon:reload`、`weapon:ready`、`weapon:equip` | weapon |
| `target:hit` | species, position, damage |
| `target:kill` | species, position, reward |
| `shop:purchase`、`wallet:resupply` | 前者提供 weapon、price，後者提供 amount |
| `hunt:resume`、`hunt:wave` | wave |
| `hunt:pause`、`shop:open` | 空物件 |
| `supply:drop` | position（物資實際掉落的世界座標） |
| `supply:pickup` | kind（heal、mg3、speed）、position；heal 另附 amount（抽中的 30 或 60，實際回血受生命上限限制） |
| `supply:speed-end` | 空物件；加速自然到期時觸發 |
| `boss:impact` | species、kind（step 或 slam）、position、strength。重擊另帶 attack（line、sweep 或 circle），與鏡頭震動及碎石同一拍觸發。 |
| `boss:payout` | species、amount、phase（scatter、collect、complete）；scatter 另附 coins。可串接噴幣、滾分與結算音效。 |
| `wallet:bossCoin` | amount（本次入帳）、total（這次 BOSS 已入帳總額）。 |

### BOSS 勝利與賞金表演

典獄長與鬼新娘都先完成正在播放的攻擊及死亡表演，之後從退場位置分批噴出
50～150 枚金幣，約 1/5 為大金幣。沿用小怪的 0.03 秒噴出間隔與三段彈跳，
放大噴射高度、範圍，並預先選出避開障礙且互不重疊的落點。

最後一枚彈跳完成後顯示鬼新娘圖片與半透明暗色遮罩，從 1 滾到本次 BOSS 賞金，
數字帶千分位；金幣同時逐枚飛往左下餘額，抵達才入帳。滾分與收幣完成後等 3 秒，
顯示「回到首頁」按鈕並保留結算畫面。桌機可按 Enter 直接返回，手機可點按鈕。
表演全程仍可移動、跳躍、瞄準、射擊；手動暫停會同時暫停表演。主動換關或重試會
補入已獲得但尚未飛抵的餘款，避免遺失或重複計獎。

賞金維持原設定（典獄長 400、鬼新娘 520），小怪及額外小獎照舊。首頁與首頁開啟的
選單使用本機場景預覽圖，停止背景 3D 繪製，避免在大廳消耗遊戲渲染效能。
金幣重用 256 格物件池及最多 3 批實例化繪製，手機同樣支援完整 150 枚。
結算圖片 `public/castle/bride-victory.png` 由專案內的原始鬼新娘模型渲染而成。

## 素材來源

### 第二個 BOSS：鬼新娘／永夜古堡

按 **J** 或點「BOSS 挑戰」，選擇 **鬼新娘**。前兩個挑戰可進入，第三、第四個仍保留。
古堡婚宴大廳為 44 × 56 公尺、拱頂最高 20 公尺；黑白大理石棋盤、白色石膏雕像、
尖拱彩繪玻璃、玫瑰窗、雕花凹格拱頂與三幅天頂壁畫。牆面加入古典花紋壁板、
凹槽石柱、金屬飾邊與潮濕剝落；長椅可跳上，中央保留戰鬥通道。

- 場景使用冷月光、暖燭光與夜間反射環境；鬼新娘和小怪另有柔和補光，讓暗處
  仍可辨識面部與服裝。補光僅套用古堡材質，出生／死亡淡出也保持一致。
- 99 支蠟燭共用兩次實例化繪製：動態火焰與柔光暈。火焰有熱芯、藍色焰根、
  上升擾流與獨立擺動，燭光明暗連動；未增加逐燭光源或陰影貼圖。
- 牆面貼圖固定於幾何座標，搭配法線、粗糙度與公尺尺度 UV，避免轉動視角時紋理變向。
  彩繪玻璃與壁畫為本專案生成的本機素材，提示詞記錄見 `public/castle/GENERATED-ASSETS.md`。

- **亡者請柬**：三批玫瑰咒圈，延遲爆發並召喚亡者，場上最多 12 隻。
- **送葬遊行**：原作靈魂曲線飛向 Soul 節點，之後指揮小怪沿預警方向衝鋒；
  傷害依小怪實際接觸判定，可閃避或先射殺，移動仍受導航與地形碰撞約束。
- **怨月誓環**：先攻擊環形區域（圓心與環外安全），再攻擊圓心，迫使玩家換位。
- 玩家生命 100，每次命中扣 10；半血後 BOSS 攻擊間隔縮短、衝鋒數量和速度增加。
  攻擊不被中彈或小獎打斷，致命一擊後完成當前動作，再播放原作死亡與紫色消融。
- 繼承小獎噴幣、擊殺 520 賞金與小怪補給箱；重新挑戰恢復生命，返回獵場保留錢與武器。
- 模型與特效只在首次進古堡時載入；12 個怪物、6 個預警、6 條靈魂軌跡、
  20 個 EFK 追蹤槽重複使用；雕像實例化、建築依材質及區段合批。

原始 C3B 可用 `node tools/convert_cocos_zombies.mjs --bride "<鬼新娘模型資料夾>"` 重轉；
`tools/import_bride.py` 複製材質與 EFK 依賴，`tools/import_castle_statues.ps1` 取得 CC0 雕像。
原始幀表、Shader、EFK 對應與雕像授權見 `public/castle/CREDITS.txt`。

新增音效介面事件 `boss:attack`：`species: 'bride'`、`attack: summon / march / vow`、
`phase: 1 / 2`。範圍落點沿用 `boss:impact`；目前不播放音效。

雕像使用 [Marble Bust 01](https://polyhaven.com/a/marble_bust_01) 與
[Gothic Statue](https://polyhaven.com/a/gothic_statue)，均為 Poly Haven CC0，已存入專案。

### 滑鼠與戰鬥卡頓修正

- 桌面優先使用 Pointer Lock 原始滑鼠輸入；不支援時退回一般 Pointer Lock。
  高回報率事件以固定容量時間桶合併，每幀只套用一次。正常甩槍維持原靈敏度，
  超過 80 ms 的卡頓則丟棄過期事件、限制恢復瞬間的大幅跳轉，不延後重播剩餘位移。
- 暫停、失焦、滑鼠重新鎖定及畫面尺寸改變會清除舊輸入；
  動態解析度不再重複重建 Canvas backing buffer。
- 怪物命中使用各自的骨骼姿態 BVH；每發子彈的每個頂點只計算一次蒙皮，
  保留原模型精確三角形判定、遮蔽物與命中位置，不以大球形碰撞箱取代模型。
- 武器、爆炸和怪物淡入／實體材質在載入階段預編譯；隱藏效果池預先上傳貼圖並暖機，
  避免把首次準備工作集中到開槍、怪物出生或 BOSS 出招那一幀。

### BOSS 攻擊與地面爆破

- 典獄長直線攻擊以每段約 3 公尺、約 27 公尺／秒向前炸開；第二擊重新預警並鎖定方向。
  圓形震擊由圓心向外擴散。保留原作 1.5／2.3 秒接觸幀與不可打斷的攻擊動作。
- 鬼新娘每批請柬至少一個咒圈瞄準玩家短距離預測位置；半血增加第三圈。
  送葬衝鋒每兩隻一組、相隔 0.5 秒出發，擊殺即可取消該隻衝鋒；
  沒有可指揮的小怪時使用兩道靈魂裂隙。誓環先由內向外爆破，圓心安全，
  之後另行預警圓心爆發。
- `boss-hazards.js` 共用預警、分段命中及特效的形狀，直線止於場地邊界。
  每道波最多扣一次 10 HP，跨招另有 0.72／0.8 秒傷害間隔；慢幀補算途經的區段。
  死亡、離場取消傷害，暫停也暫停波前和效果時間。
- 新增官方 CC0 EFK 爆炸／靈爆，搭配 4×4 火焰動畫、地面餘燼、環形衝擊波、
  碎石與兩盞不投影的短暫光源。保留兩隻 BOSS 原有骨骼 EFK 與音效事件介面。
- 火焰共用一個 instanced draw，碎石共用一個 instanced draw；預警、地面效果、
  碎石、火焰及 EFK handle 全部固定容量覆用。手機降低粒子量，不更改傷害範圍。
  原生追加爆炸限制同時 1 個、靈爆 4 個，並檢查剩餘容量，替血花與本體特效保留空間。

素材來自 [Effekseer EffectMaterials](https://github.com/effekseer/EffectMaterials)，
CC0 授權、作者、固定版本及修改說明見 `public/effects/boss-impacts/CREDITS.md`。
可用 `python tools/import_boss_impacts.py <EffectMaterials checkout>` 重建素材。

### 既有素材

五種怪物與貼圖來自使用者提供的模型資料夾及 TMDC_Zombie 原遊戲資源。命中綠血取自該遊戲 `BulletDefine.lua` 中玩家斧頭的 `HitEffect`。`public/effects/axe-hit` 內保留原始 `Bullet_Axe_Hit.efk`、`Dissolve_03.efkmat` 與四張貼圖。

第一人稱武器與手套使用公開素材，自製換彈動作、手指貼合與圓筒紅點瞄具。AK、手槍與刀的作者、授權與修改紀錄位於 `public/viewmodel/CREDITS.txt`。地圖、建築、HUD、槍口與牆面特效於專案內建立。地圖動線參考 [Valve 的 Dust II 地圖介紹](https://www.counter-strike.net/dust2/)。

環境使用下列 Poly Haven 掃描素材。表面材質在打包前轉成 WebP，部分色彩經過調整。[Poly Haven CC0 授權](https://polyhaven.com/license)

- 牆面與砌石使用 [Damaged Plaster](https://polyhaven.com/a/damaged_plaster) 與 [Sandstone Blocks 05](https://polyhaven.com/a/sandstone_blocks_05)。
- 地面混合 [Cobblestone Floor 08](https://polyhaven.com/a/cobblestone_floor_08) 與 [Sandy Gravel](https://polyhaven.com/a/sandy_gravel)。
- 木門與物資箱使用 [Brown Planks 03](https://polyhaven.com/a/brown_planks_03)。
- 天空與環境反射使用 [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky)。
- 英文字型使用 Barlow Condensed。隨附授權位於 `public/fonts/OFL.txt`。

