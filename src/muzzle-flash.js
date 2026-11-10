import * as T from 'three';

// Four uneven tongues share a white-hot core. The noisy edge and a few trailing embers
// change per round without allocating particles, textures, or lights during gunfire.
export function muzzleFlash(scene) {
  const uniforms = { seed: { value: 0 }, age: { value: 1 } };
  const material = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
    vertexShader: `varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 p;uniform float seed,age;
    float hash(float n){return fract(sin(n*12.9898)*43758.5453);}
    float noise(float t,float k){float i=floor(t);return mix(hash(i+k),hash(i+1.+k),smoothstep(0.,1.,fract(t)));}
    void main(){
      vec2 q=p;float d=length(q),gas=0.,spit=0.;
      for(int i=0;i<4;i++){
        float k=seed+float(i)*17.4;
        float a=float(i)*1.5708+(hash(k)-.5)*.38;
        vec2 axis=vec2(cos(a),sin(a));float along=dot(q,axis),across=dot(q,vec2(-axis.y,axis.x));
        float extent=(.43+.60*hash(k+2.))*(1.-age*.32);
        float u=clamp(along/extent,0.,1.);
        float bend=(noise(6.*u+age*1.3,k)-.5)*(.09*u);
        float width=(.013+.085*pow(1.-u,1.8))*(.57+.85*noise(9.*u,k+4.));
        gas+=exp(-pow(abs(across-bend)/width,1.3))*smoothstep(-.045,.025,along)*(1.-smoothstep(.45,1.,u));
        float speck=length(vec2((along-extent*.90)/.06,(across-bend-.028)/.009));
        spit+=exp(-speck*speck*2.)*(1.-age);
      }
      float core=exp(-d*d*170.),halo=exp(-d*d*23.)*.20;
      float alpha=clamp((core+gas+halo+spit*.8)*(1.-age*age),0.,1.);
      vec3 col=mix(vec3(1.,.21,.025),vec3(1.,.72,.24),clamp(gas,0.,1.));
      col=mix(col,vec3(1.,.98,.83),clamp(core+gas*.38,0.,1.));
      gl_FragColor=vec4(col,alpha);
      #include <colorspace_fragment>
    }`,
  });
  const flash = new T.Mesh(new T.PlaneGeometry(1, 1), material);
  const light = new T.PointLight(0xffad5a, 0, 1.6, 2);
  scene.add(flash, light);
  flash.visible = false;
  let life = 0,
    size = 0;
  return {
    fire(rifle, strength = 1) {
      life = 0.064;
      size = (rifle ? 0.53 : 0.4) * strength * (0.82 + 0.34 * Math.random());
      uniforms.seed.value = Math.random() * 280;
      flash.rotation.z = (Math.random() - 0.5) * 0.65;
    },
    update(position, dt, ads, modelScale = 1) {
      const pulse = Math.max(0, life / 0.064);
      flash.visible = pulse > 0;
      flash.position.copy(position);
      flash.scale.setScalar(size * modelScale * (1 - 0.34 * ads) * (1.09 - 0.17 * pulse));
      uniforms.age.value = 1 - pulse;
      light.position.copy(position);
      light.position.z += 0.09;
      light.intensity = pulse * pulse * 0.63 * modelScale * modelScale;
      life = Math.max(0, life - dt);
    },
    clear() {
      life = 0;
      light.intensity = 0;
      flash.visible = false;
    },
  };
}
