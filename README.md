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

- 桌機使用 WASD 移動、滑鼠轉向、Shift 跑步、按住 Ctrl 蹲下、空白鍵跳躍。先按住 Ctrl 再按空白鍵可蹲跳上高箱。鬆開 Ctrl 且頭頂有空間時會起身。R 主動換彈，1 步槍、2 手槍、3 戰鬥刀、Esc 暫停。滑鼠左鍵射擊，手槍點放，步槍可按住連發。步槍按滑鼠右鍵開啟圓筒紅點鏡，再按一次退鏡。持刀點擊或按住左鍵揮砍，命中距離 2.5 公尺。
- 觸控使用左側搖桿移動，推到底跑步。右側滑動轉向，點「蹲」切換姿勢，再點「跳」即可蹲跳。裝備步槍時會顯示瞄準鏡按鈕，武器也可在軍械商店切換。
- 按 B 或點擊「軍械商店」購買與裝備。商店開啟期間暫停獵殺。
- MG3 重機槍售價 450 賞金，購買後可用數字鍵 4 裝備。每箱 200 發，每發 2 幣、21 傷害。按住滑鼠左鍵或觸控射擊鈕可持續連射，R 可提前換箱。空箱會自動換彈，需 4.8 秒。
- 按 J 或點擊「BOSS 挑戰」，選「典獄長」進入 C 區監獄中庭。小殭屍可從柵門出場，或從接近 24 公尺高的屋架跳下。
- 進場有 100 生命，每次重擊扣 10 點。典獄長會預判跑位，紅色預警出現後落點就會固定。直線重擊可側閃或變向，圓形震擊要跑出圈外。留意第一擊後的「回掃追擊」，半血後每次直線重擊都會回掃。
- 命中典獄長且未擊倒時，每次有 6% 機率開小獎。命中處會噴出 1–3 枚大幣與 5–7 枚小幣，再飛向左下錢包。大幣值 5、小幣值 1，單次共 10–22 賞金。典獄長正在攻擊時會把動作播到最後一幀，期間同樣能領獎。
- 擊倒典獄長可領 400 賞金。結束畫面可重試或返回沙境，也能在戰鬥中按 J 離開。返回時恢復原獵場位置與波次，兩地共用武器、彈藥與賞金。
- 初始賞金 1,000，開局免費配發並裝備 AK-47，另備 P12 手槍與 KA-BAR 戰鬥刀。AK-47 每發 2 幣、彈匣 30 發，手槍每發 1 幣、彈匣 12 發。彈匣耗盡會自動換彈。餘額低於 2 幣時可在商店領取補給。
- 按 F 或點擊「自動射擊」切換模式。開啟後優先鎖定靠近準星且可見的獵物，射擊前會再次檢查遮擋與實際怪物網格。
- 所有射擊都消耗一發彈藥。第一個命中點在建築牆面時會爆開、留下彈痕並全額退回這一發的賞金。命中怪物、地面、道具或射向天空皆照常計費。

- T 出生平台可往中路、隧道或 A 大門。中路雙門前的 Xbox 箱可蹲跳接 A 小道，CT 橋下也可沿貨箱跳上小道。A 大道由兩組轉角木門通往藍箱、大坑與 A 坡。B 點可經上層隧道、雙門，或踩 CT 側鷹架蹲身穿過破窗。高低差與落腳面依單人移動調整。[Valve 的 CS:GO Dust II 場景對照](https://www.counter-strike.net/dust2/) · [Dust II 俯視圖與點位](https://betrefs.gg/cs2-callouts/dust2)

## 開發入口

- `src/main.js` 管理輸入、戰鬥、商店與賞金。
- `src/prison.js` 建立監獄、可開啟的柵門與場景碰撞；`src/warden.js` 控制典獄長、原作動作、材質與攻擊判定。典獄長模型、ShaderAtlas、囚衣與 Effekseer 資源均隨專案附上。
- 典獄長的進場、常駐與直線重擊 EFK 依原作掛在 `Root` 骨骼，使用本地縮放 100、旋轉 0，每幀繼承模型的世界變換。震擊與金幣閃光在觸發時取用當下的朝向與比例，留在實際落點或命中處。
- `src/world.js` 建構地圖、碰撞、分區批次、掃描材質、風沙與植被 shader。
- `src/hunt.js` 重用 24 隻怪物的模型、骨架與動畫播放器。死亡演出結束後逐隻補回，優先在玩家附近可見的空地補足 4 隻。切換區域時可調動遠處健康且離開視野的怪物。每波的血量加成套用於新進場的怪物。
- 男女行屍與盜墓者的空降使用 FishDefine.lua 的 `jump_down`、`stand_up`，依 30 fps 播放。有頂棚的落點改用淡入，木乃伊淡入時播放 `walk`，死靈法師播放 `idle`。
- 追蹤獨立於自動射擊。怪物進入玩家視野且胸口或頭部可見時，以每秒約 1.0–1.3 公尺靠近，在距離 2.4–3.15 公尺處停下。遮蔽判定分散到不同影格執行。
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
| `boss:impact` | species、kind（step 或 slam）、position、strength。重擊另帶 attack（line、sweep 或 circle），與鏡頭震動及碎石同一拍觸發。 |

## 素材來源

五種怪物與貼圖來自使用者提供的模型資料夾及 TMDC_Zombie 原遊戲資源。命中綠血取自該遊戲 `BulletDefine.lua` 中玩家斧頭的 `HitEffect`。`public/effects/axe-hit` 內保留原始 `Bullet_Axe_Hit.efk`、`Dissolve_03.efkmat` 與四張貼圖。

第一人稱武器與手套使用公開素材，自製換彈動作、手指貼合與圓筒紅點瞄具。AK、手槍與刀的作者、授權與修改紀錄位於 `public/viewmodel/CREDITS.txt`。地圖、建築、HUD、槍口與牆面特效於專案內建立。地圖動線參考 [Valve 的 Dust II 地圖介紹](https://www.counter-strike.net/dust2/)。

環境使用下列 Poly Haven 掃描素材。表面材質在打包前轉成 WebP，部分色彩經過調整。[Poly Haven CC0 授權](https://polyhaven.com/license)

- 牆面與砌石使用 [Damaged Plaster](https://polyhaven.com/a/damaged_plaster) 與 [Sandstone Blocks 05](https://polyhaven.com/a/sandstone_blocks_05)。
- 地面混合 [Cobblestone Floor 08](https://polyhaven.com/a/cobblestone_floor_08) 與 [Sandy Gravel](https://polyhaven.com/a/sandy_gravel)。
- 木門與物資箱使用 [Brown Planks 03](https://polyhaven.com/a/brown_planks_03)。
- 天空與環境反射使用 [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky)。
- 英文字型使用 Barlow Condensed。隨附授權位於 `public/fonts/OFL.txt`。

