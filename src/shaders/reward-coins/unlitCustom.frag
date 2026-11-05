// 3D unlit custom fragment shader.
// Keep only base texture, matcap, matcap multiply and normal map.

#ifdef GL_ES
varying mediump vec2 TextureCoordOut;
varying mediump vec3 v_viewNormal;
#else
varying vec2 TextureCoordOut;
varying vec3 v_viewNormal;
#endif

varying vec3 v_normal;
varying vec3 v_tangent;

uniform vec4 u_color;
uniform vec3 u_multColor;
uniform sampler2D u_matcapTexture;
uniform float u_matcapScalar;
uniform sampler2D u_matcapTextureMul;
uniform float u_matcapScalarMul;

uniform sampler2D u_normalMapTexture;
uniform float normalMapStrength;

// 世界法線 -> view space 法線。v_normal/v_viewNormal 名字騙人，本引擎 3D 的 CC_NormalMatrix 是
// 「世界矩陣」的 inverse-transpose，所以它們是世界法線；CC_PMatrix = projection * view，
// 第 0/1 列正規化後即攝影機 right / up 世界軸。完整推導見 ZombieResource/Shader/prisonOfficer.frag。
vec3 toViewNormal(vec3 worldNormal)
{
    vec3 camRight = normalize(vec3(CC_PMatrix[0][0], CC_PMatrix[1][0], CC_PMatrix[2][0]));
    vec3 camUp    = normalize(vec3(CC_PMatrix[0][1], CC_PMatrix[1][1], CC_PMatrix[2][1]));
    return vec3(dot(worldNormal, camRight),
                dot(worldNormal, camUp),
                dot(worldNormal, cross(camRight, camUp)));
}

vec3 getViewNormal()
{
    vec3 normalMapValue = texture2D(u_normalMapTexture, TextureCoordOut).xyz - vec3(0.5);
    vec3 tangent = normalize(v_tangent);
    vec3 bitangent = cross(v_normal, tangent);
    vec3 normal =
        (normalMapValue.x * normalMapStrength) * tangent +
        (normalMapValue.y * normalMapStrength) * normalize(bitangent) +
        normalMapValue.z * normalize(v_normal);

    // 法線貼圖是在 world space 擾動，這裡才轉到 view space 供 matcap uv 使用
    // (原本少了這一步，matcap 會鎖在世界方向不跟著鏡頭轉)
    return toViewNormal(normalize(normal));
}

void main(void)
{
    vec4 baseColor = texture2D(CC_Texture0, TextureCoordOut);
    vec3 color = baseColor.rgb * u_multColor;

    vec3 viewNormal = getViewNormal();
    vec2 matcapUv = viewNormal.xy * 0.49 + vec2(0.5);
    matcapUv.y = 1.0 - matcapUv.y;

    vec3 matcapColor = texture2D(u_matcapTexture, matcapUv).rgb;
    color += matcapColor * u_matcapScalar;

    vec3 matcapMul = texture2D(u_matcapTextureMul, matcapUv).rgb;
    color *= mix(vec3(1.0), matcapMul, u_matcapScalarMul);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), baseColor.a * u_color.a);
}