precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec4 tangent;
attribute vec2 uv;
attribute mat4 instanceMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
varying mediump vec2 TextureCoordOut;
varying mediump vec3 v_viewNormal;
varying vec3 v_normal;
varying vec3 v_tangent;
#ifdef COIN_FADE
attribute float coinOpacity;
varying mediump float v_opacity;
#endif

void main() {
    // The C3B has one rigid joint. Its bind transform is baked into the GLB.
    gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
    TextureCoordOut = vec2(uv.x, 1.0 - uv.y);
    v_normal = normalize(mat3(instanceMatrix) * normal);
    v_viewNormal = v_normal;
    v_tangent = normalize(mat3(instanceMatrix) * tangent.xyz);
#ifdef COIN_FADE
    v_opacity = coinOpacity;
#endif
}

