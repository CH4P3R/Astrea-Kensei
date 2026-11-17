export const solarBodyVertexShader = `
  varying vec2 discUv;
  void main() {
    discUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const solarBodyFragmentShader = `
  uniform float isSun;
  uniform vec3 lightDirection;
  varying vec2 discUv;
  void main() {
    vec2 p = (discUv * 2.0 - 1.0) * mix(1.0, 2.5, isSun);
    float r = length(p);
    float aa = max(fwidth(r), 0.001);
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
    vec3 color;
    float alpha;
    if (isSun > 0.5) {
      float halo = exp(-3.2 * max(r - 1.0, 0.0)) * 0.2;
      halo *= 1.0 - smoothstep(2.0, 2.5, r);
      alpha = max(disc, halo);
      color = mix(vec3(1.0, 0.46, 0.12), vec3(1.0, 0.96, 0.72), disc * (1.0 - 0.22 * r * r));
    } else {
      if (r > 1.0 + aa) discard;
      vec3 normal = vec3(p, sqrt(max(0.0, 1.0 - dot(p, p))));
      float incidence = dot(normal, lightDirection);
      float terminator = smoothstep(-0.015, 0.025, incidence);
      float light = 0.045 + terminator * (0.5 + 0.45 * max(incidence, 0.0));
      color = vec3(0.79, 0.78, 0.74) * light;
      alpha = disc;
    }
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`
