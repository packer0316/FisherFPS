// 典獄長(Prison_officer) body pass 專用 frag
// 逐行移植 SSS_ZombieFish2 專案的 assets/game/fishRes/MatcapMaterial/matcap_new.effect (CCProgram unlit-fs)，
// define 組合取自該專案的 Matcap_Prison.mtl：USE_TEXTURE / USE_BLEACH_COLOR / USE_MATCAP_MAP / USE_NORMAL_MAP。
// uniform 命名沿用原 effect(去掉開頭底線)，方便與 matcap_new.effect / Matcap_Prison.mtl 對照。
//
// 與原專案的等價性說明：
//  1. 原專案 gamma chunk 為 SRGBToLinear(x)=x*x、LinearToSRGB(x)=sqrt(x)，且 Game.scene 的 _useHDR=false，
//     所以原 frag 的「texColor 轉 linear -> CCFragOutput 轉回 sRGB」是完全的來回抵銷，
//     等於 matcap 之後的運算全都直接跑在 gamma 空間的貼圖值上。本檔因此不做任何 base color 的 gamma 轉換。
//  2. Cocos Creator 標了 linear:true 的顏色參數(Back_light / Surface_Light / MatCap_add*_Color)是在 CPU 端轉 linear，
//     本檔改成材質給 sRGB 值、在 shader 內 SRGBToLinear 轉換，數值與編輯器面板看到的一致。
//  3. 原 effect 尚有 Glow(_Glow_mask_RGB_intensity) 與 Dissolve(_Texture_Dissolve/_Dissolve_Switch) 兩段，
//     在 Matcap_Prison.mtl 的參數下分別恆為 0 與恆等於 1(不作用)，故未移植。
//  4. 原 effect 走 Creator 的 CC_APPLY_FOG(Game.scene 有開 fog)，本專案的魚一律不吃場景 fog，未移植。
//  5. u_color / u_multColor / u_bleachRate 是本專案的既有機制(節點顏色與透明度、場景色偏、受擊泛白)，
//     對應原 effect 的 mainColor 與 bleachColor.w，接在同樣的位置以維持淡出、壓暗、受擊表現。
//  6. 原本 7 個 sampler 合併成一張 512x512 合圖(見下方 ShaderAtlas / TILE_ 常數)，取樣結果等價。

#ifdef GL_ES
precision highp float;
#endif

varying vec2 TextureCoordOut;
varying vec3 v_worldNormal;
varying vec3 v_worldTangent;
varying vec3 v_worldBinormal;

// 盜墓者燈籠照亮(FishLanternLight): 頂點端(prisonOfficer.vert)算好光色x衰減與燈的方向, 這裡只做受光面 Lambert; 沒被照到時 v_lanternLight 全 0
varying vec3 v_lanternLight;
varying vec3 v_lanternDir;
uniform vec4 u_lanternShade;   // x = 受光包覆, y = 背光面底光, z = 直接加色比例(深色也染亮), w = 距離衰減指數(頂點端用)

vec3 applyLantern(vec3 albedo) {
	vec3 L = normalize(v_lanternDir);
	vec3 N = normalize(v_worldNormal);
	float lit = clamp((dot(N, L) + u_lanternShade.x) / (1.0 + u_lanternShade.x), 0.0, 1.0);
	return (albedo + vec3(u_lanternShade.z)) * v_lanternLight * mix(u_lanternShade.y, 1.0, lit);
}

// 本專案既有的共用 uniform
uniform vec4  u_color;        // 引擎 Mesh::draw 帶入的節點顏色/透明度
uniform vec3  u_multColor;    // 場景色偏 / 壓暗(ModelMgr.multColor、SetColorScale)
uniform float u_bleachRate;   // 受擊泛白強度，對應原 effect 的 bleachColor.w

// 原 Matcap_Prison.mtl 的 7 張貼圖合成一張 512x512 合圖(省下 6 個 texture unit)：
//   Prison_officer_ShaderAtlas.png，由 .Document/tools/gen_prison_officer_atlas.py 產生。
//   3 張 256 + 4 張 128 剛好填滿 512x512，tile 都在整數像素位置且未縮放，
//   所以 bilinear 權重與原本各自取樣完全相同(產生器有逐像素驗證)。
//   ※ 改 tile 排法要同時改產生器的 LAYOUT 與下面的 TILE_ 常數。
// CC_Texture0 仍是模型自己的 mainTexture(Prison_officer_Base_color)，由引擎綁定，不進合圖。
uniform sampler2D ShaderAtlas;

const float ATLAS_SIZE = 512.0;
// vec4(offsetU, offsetV, sizeU, sizeV)，單位是合圖的 0~1 uv
const vec4 TILE_MATCAP_ADD       = vec4(0.0,  0.0,  0.5,  0.5 );   // matcap204.jpg  256
const vec4 TILE_MATCAP_METALLIC  = vec4(0.5,  0.0,  0.5,  0.5 );   // matcap203.jpg  256
const vec4 TILE_NORMALMAP        = vec4(0.0,  0.5,  0.5,  0.5 );   // Normal.jpg     256
const vec4 TILE_MATCAP_LIGHT     = vec4(0.5,  0.5,  0.25, 0.25);   // 001.jpg        128
const vec4 TILE_MATCAP_ADD2      = vec4(0.75, 0.5,  0.25, 0.25);   // 007.jpg        128
const vec4 TILE_ROUGHNESS        = vec4(0.5,  0.75, 0.25, 0.25);   // Roughness.jpg  128
const vec4 TILE_METALLIC         = vec4(0.75, 0.75, 0.25, 0.25);   // Metallic.jpg   128

// 純量/顏色參數(顏色以 sRGB 給，shader 內轉 linear)
uniform float Normalmap_intemsity;
uniform float Light_pos;
uniform float Light_contrast;
uniform float Metallic_Intensity;
uniform vec3  Back_light;
uniform vec3  Surface_Light;
uniform vec3  MatCap_add_Color;
uniform vec3  MatCap_add2_Color;
uniform vec4  MatCap_add_R_size_GB_intensity;
uniform vec4  MatCap_add2_R_size_GB_intensity;
uniform float bleachPow;

// 同 Creator 3.8 chunks/common/color/gamma.chunk
vec3 SRGBToLinear(vec3 gamma) {
	return gamma * gamma;
}

// 把 0~1 的貼圖 uv 換算成合圖上對應 tile 的 uv。
// 夾在 tile 往內縮半個 texel 的範圍：
//   * bilinear 絕不會取到隔壁 tile(所以合圖不需要留 padding gutter)
//   * 夾在半個 texel 剛好落在邊緣 texel 的中心，等同原本各張貼圖的 CLAMP_TO_EDGE
//   * uv 超出 0~1 時也一樣夾到邊緣，行為與 CLAMP_TO_EDGE 相同
vec2 atlasUv(vec2 uv, vec4 tile) {
	vec2 halfTexel = vec2(0.5 / ATLAS_SIZE);
	return clamp(tile.xy + uv * tile.zw,
	             tile.xy + halfTexel,
	             tile.xy + tile.zw - halfTexel);
}

// 把世界法線轉成 view space —— 對應原 effect 的 ( cc_matView * vec4( sn, 0.0 ) ).xyz。
//
// 本引擎沒有現成的 view matrix uniform (CC_MVMatrix 實際是 world、CC_NormalMatrix 是 world 的
// inverse-transpose，見 prisonOfficer.vert 的說明)，但 CC_PMatrix = projection * view，
// 而 projection 的第 0/1 列只有對角上的正縮放係數(perspective 是 f/aspect 與 f，ortho 是 2/(r-l) 與 2/(t-b))，
// 所以 (projection * view) 的第 0/1 列 = 正係數 * view 的第 0/1 列，正規化後就是攝影機的 right / up 世界軸。
// 第 2 列被 projection 的 z/w 列汙染不能直接用，改以 cross(right, up) 取得 view space +Z(由物體指向攝影機)。
//
// 註：本專案其他 matcap shader 是用 normalize(mat3(CC_PMatrix) * worldNormal) 近似，
//     方向正確但 x/y 被投影係數非等比放大，法線分佈會被推向 matcap 邊緣；這裡取真正的 view space 分量。
void getCameraAxes(out vec3 camRight, out vec3 camUp, out vec3 camBack) {
	camRight = normalize(vec3(CC_PMatrix[0][0], CC_PMatrix[1][0], CC_PMatrix[2][0]));
	camUp    = normalize(vec3(CC_PMatrix[0][1], CC_PMatrix[1][1], CC_PMatrix[2][1]));
	camBack  = cross(camRight, camUp);
}

// 原 effect 的 USE_NORMAL_MAP 分支：法線貼圖只擾動 matcap 取樣用的法線，不做寫實光照。
// 與原專案一樣在 world space 組 TBN，nmmp.z 不乘強度。
vec3 getShadingNormal(vec2 texCoord) {
	vec3 normal = normalize(v_worldNormal);
	vec3 nmmp = texture2D(ShaderAtlas, atlasUv(texCoord, TILE_NORMALMAP)).xyz - vec3(0.5);
	return normalize(
		(nmmp.x * Normalmap_intemsity) * normalize(v_worldTangent) +
		(nmmp.y * Normalmap_intemsity) * normalize(v_worldBinormal) +
		nmmp.z * normal);
}

// 原 effect 的 bleach()：以視線夾角做邊緣泛白。
// 原專案是 normalize(cc_cameraPos - worldPos) 的逐點視線；本引擎拿不到攝影機世界座標，
// 改用攝影機的 back 軸當視線方向(正交近似)。受擊泛白只有 0.25 秒，差異看不出來。
// 另外原專案寫成 clamp(0., 1., dot(...))，參數順序反了，實際等於 min(dot, 1.0)(不夾下限)，
// 這裡照原樣保留以維持一模一樣的表現。
vec3 bleach(vec3 oldColor, float lerpValue, float nDotV) {
	float theta = 1.0 - min(nDotV, 1.0);
	float scalar = 1.7;
	return mix(oldColor, vec3(scalar), lerpValue * pow(theta, bleachPow));
}

void main(void)
{
	vec2 texCoord = TextureCoordOut;
	vec4 addColor = vec4(1.0, 1.0, 1.0, 1.0) - u_color;

	// 原 effect: o = mainColor * texColor，本專案以 u_multColor/u_color 取代 mainColor
	vec4 baseColor = texture2D(CC_Texture0, texCoord) * vec4(u_multColor, 1.0) + addColor;

	vec3 camRight, camUp, camBack;
	getCameraAxes(camRight, camUp, camBack);

	// 世界法線 -> view space，再取 matcap uv(與原 effect 的 appendResult6 相同)
	vec3 shadingNormal = getShadingNormal(texCoord);
	vec2 viewNormalXY = vec2(dot(shadingNormal, camRight), dot(shadingNormal, camUp));
	vec2 matcapUv = vec2(viewNormalXY.x * 0.5 + 0.5, 0.5 - viewNormalXY.y * 0.5);

	// 金屬：以 Metallic 遮罩的 r 通道當遮罩，把 matcap_metallic 乘進 base color
	float metallic = texture2D(ShaderAtlas, atlasUv(texCoord, TILE_METALLIC)).r;
	vec3 metallicMatcap = clamp(
		texture2D(ShaderAtlas, atlasUv(matcapUv, TILE_MATCAP_METALLIC)).rgb
			* (metallic * Metallic_Intensity),
		vec3(0.0), vec3(1.0));
	vec3 shaded = mix(baseColor.rgb, baseColor.rgb * metallicMatcap, metallic);

	// 主光：用 MatCap_light 的 r 通道在背光色與受光色之間插值
	float lightRatio = clamp(
		(texture2D(ShaderAtlas, atlasUv(matcapUv, TILE_MATCAP_LIGHT)).r - 0.5)
			* Light_contrast + Light_pos,
		0.0, 1.0);
	vec3 lightColor = mix(SRGBToLinear(Back_light), SRGBToLinear(Surface_Light), lightRatio);

	// 疊加反光 1：受 Roughness 反向遮罩(越光滑越亮)
	float roughness = texture2D(ShaderAtlas, atlasUv(texCoord, TILE_ROUGHNESS)).r;
	vec3 addMatcap = clamp(
		SRGBToLinear(MatCap_add_Color) *
			(((texture2D(ShaderAtlas, atlasUv(matcapUv, TILE_MATCAP_ADD)).rgb
				- vec3(MatCap_add_R_size_GB_intensity.y))
				* MatCap_add_R_size_GB_intensity.z + vec3(MatCap_add_R_size_GB_intensity.x))
				* (1.0 - roughness)),
		vec3(0.0), vec3(1.0));

	// 疊加反光 2：不受 Roughness 影響
	vec3 addMatcap2 = clamp(
		SRGBToLinear(MatCap_add2_Color) *
			((texture2D(ShaderAtlas, atlasUv(matcapUv, TILE_MATCAP_ADD2)).rgb
				- vec3(MatCap_add2_R_size_GB_intensity.y))
				* MatCap_add2_R_size_GB_intensity.z + vec3(MatCap_add2_R_size_GB_intensity.x)),
		vec3(0.0), vec3(1.0));

	vec3 finalColor = clamp(shaded * lightColor + addMatcap + addMatcap2, vec3(0.0), vec3(1.0));

	// 燈籠照亮: 乘的是含場景色的底色, 疊在反光之後
	if (dot(v_lanternLight, v_lanternLight) > 0.0) finalColor += applyLantern(baseColor.rgb);
	if (u_bleachRate > 0.0) {
		// 原 effect 的 bleach 用的是幾何法線(不套法線貼圖)
		finalColor = bleach(finalColor, u_bleachRate, dot(normalize(v_worldNormal), camBack));
	}

	gl_FragColor.rgb = finalColor;
	gl_FragColor.a = baseColor.a * u_color.a;
}
