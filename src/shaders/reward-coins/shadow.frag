uniform vec4 u_color;
uniform vec3 shadowColor;
uniform float u_shadowAlpha;

void main(void)
{
	gl_FragColor = vec4(shadowColor, u_color.a * u_shadowAlpha);
}