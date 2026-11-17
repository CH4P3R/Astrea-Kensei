export const horizonVertexShader = `
  varying vec3 skyDirection;

  void main() {
    skyDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const horizonFragmentShader = `
  uniform float groundHeight;
  uniform float surfaceOpacity;
  uniform float groundOpacity;
  uniform float lineScale;
  varying vec3 skyDirection;

  float stroke(float distanceToLine, float width) {
    float scaledWidth = width * lineScale;
    float aa = max(fwidth(distanceToLine), 0.001 * lineScale);
    return 1.0 - smoothstep(scaledWidth, scaledWidth + aa, abs(distanceToLine));
  }

  float grid(vec2 p, float spacing) {
    vec2 distanceToLine = abs(mod(p + spacing * 0.5, spacing) - spacing * 0.5);
    // Filter each axis separately and hide lines too dense to resolve on screen.
    vec2 footprint = max(fwidth(p), vec2(0.0001));
    float width = 0.01 * lineScale;
    vec2 lines = 1.0 - smoothstep(vec2(width), vec2(width) + footprint, distanceToLine);
    lines *= 1.0 - smoothstep(vec2(spacing * 0.2), vec2(spacing * 0.5), footprint);
    return max(lines.x, lines.y);
  }

  void main() {
    vec3 direction = normalize(skyDirection);

    // Intersect the observer's sky direction with the horizontal plane below it
    vec2 p = direction.xz * (-groundHeight / max(-direction.y, 0.0001));
    float radius = length(p);
    float detailFade = 1.0 - smoothstep(12.0, 32.0, radius);
    float fineFade = 1.0 - smoothstep(6.0, 16.0, radius);
    float lines = max(grid(p, 1.0) * 0.12 * fineFade, grid(p, 5.0) * 0.32);

    float rings = max(stroke(radius - 4.0, 0.018), stroke(radius - 8.0, 0.018));
    rings = max(rings, stroke(radius - 12.0, 0.025));
    rings = max(rings, stroke(radius - 20.0, 0.035));
    rings = max(rings, stroke(radius - 2.1, 0.025));

    float spokes = stroke(min(abs(p.x), abs(p.y)), 0.02);
    spokes *= smoothstep(2.1, 2.3, radius) * (1.0 - smoothstep(19.9, 20.1, radius));
    float reticle = stroke(min(abs(p.x), abs(p.y)), 0.012)
      * (1.0 - smoothstep(0.25, 0.3, radius));
    reticle = max(reticle, stroke(radius - 0.45, 0.012));

    float lineAlpha = max(max(lines, rings * 0.65), max(spokes * 0.45, reticle * 0.8));
    lineAlpha *= detailFade * surfaceOpacity;
    float groundAlpha = groundOpacity;
    float alpha = lineAlpha + groundAlpha * (1.0 - lineAlpha);
    if (direction.y >= 0.0 || alpha < 0.001) discard;
    gl_FragColor = vec4(vec3(0.40, 0.43, 0.46), alpha);
    #include <colorspace_fragment>
    // Composite the unchanged lines over a faint black base in one draw call.
    // Weight in output color space to preserve their existing brightness.
    gl_FragColor.rgb *= lineAlpha / alpha;
  }
`
