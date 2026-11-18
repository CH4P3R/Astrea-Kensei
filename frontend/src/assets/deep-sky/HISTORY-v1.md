# Illustrative deep-sky textures

These six transparent textures were generated with the built-in ImageGen tool
on 2026-11-16 for Astrea-Kensei. They were copied unchanged from the generated
outputs into this directory. No astronomical photographs or survey pixels were
copied into these assets.

They illustrate broad, softened morphology only. They are **not measured images,
WCS solutions, photometric maps, or records of what an unaided observer sees**.
Object centers and angular extents must come from the separately sourced catalog.
The requested north-up/east-left orientation and recognizable silhouettes are
artistic approximations, not verified astrometry of the generated pixels.

Individual stars were deliberately excluded. Orion, Lagoon, Carina and North
America contain nebular haze; Pleiades contains reflection haze only, with real
catalog stars supplied by the existing renderer; Omega Centauri represents
unresolved collective starlight. The generated colors are illustrative and
desaturated, not calibrated passbands.

## Original files and inspection

All selected outputs are native **1254 × 1254 RGBA PNG** images. Although the
prompts requested 1024 × 1024, the built-in tool returned this resolution.
The files retain their original alpha channels and have not been resized,
recolored, cropped, composited or otherwise edited.

| File | Bytes | Approximate alpha > 32 bounds (x0, y0, x1, y1) | Fraction of canvas | Maximum border alpha |
| --- | ---: | --- | --- | ---: |
| `orion-v1.png` | 1537808 | 176, 196, 1088, 1136 | 0.728 × 0.750 | 2/255 |
| `lagoon-v1.png` | 1387593 | 104, 348, 1152, 964 | 0.837 × 0.492 | 1/255 |
| `carina-v1.png` | 1706793 | 80, 180, 1148, 1104 | 0.852 × 0.738 | 2/255 |
| `north-america-v1.png` | 1704358 | 144, 164, 1072, 1116 | 0.741 × 0.760 | 1/255 |
| `pleiades-v1.png` | 1355916 | 164, 196, 1092, 1116 | 0.741 × 0.734 | 2/255 |
| `omega-centauri-v1.png` | 1109568 | 236, 288, 992, 980 | 0.604 × 0.553 | 1/255 |

Bounds were inspected on a four-pixel sampling grid, so they are descriptive,
not exact masks. A requested 70% footprint was not reproduced identically in
every image. In particular, Lagoon is already wide within a square canvas;
stretching it again to a catalog major/minor ratio would distort its artwork.

All six outputs were visually inspected for the intended soft appearance and
absence of discrete star markers. Very faint residual alpha (1–2/255) is present
at some edges. The renderer can discard alpha below 0.01 and feather texture
borders to prevent a rectangular outline without modifying these originals.
None of those visual choices turns the illustrations into measured data.

The six originals total approximately 8.8 MB. Keep them in an independently
toggleable background layer; loading them must not delay catalog stars or FITS.
Avoid placing a full-size texture on every repeated object. Rendering can cap
upload resolution and fade illustrations when inspecting scientific images.

## Exact generation prompts

Each file used one independent built-in ImageGen call with
`transparent_background: true`, no reference images and no CLI/API fallback.

### orion-v1.png

```text
Use case: scientific-educational
Asset type: a single transparent soft deep-sky illustration texture for an interactive planetarium, target square 1024 by 1024 pixels.
Subject: Messier 42, the Orion Nebula, rendered as diffuse nebular emission alone. Preserve the recognizable broad fan/butterfly wings around the central Orion nebular cavity and the dark northern indentation; suggest the small detached M43 lobe just north of the main core. Approximate north-up, east-left astronomical view, no artistic rotation. The visual must resemble Orion rather than a generic space cloud, but deliberately simplify small structures.
Composition: nebula centered on the canvas, entire luminous structure within the central 70 percent of width and height; generous fully transparent margin on all four sides. Emission feathers gently to genuine alpha transparency, never a rectangular field. No background photograph.
Style: very soft, low-frequency, subdued astronomical illustration; gentle luminous mist and broad dark lanes, diffuse details rather than photographic filaments. Pale muted mauve and rose emission, trace of gray-blue reflection, faint warm ivory in the core without blown-out white.
Constraints: isolated nebula only, absolutely no individual stars, dots, sparkles, diffraction spikes, lens flares, text, labels, frames, circles, galaxies, planets, or landscape. Real stars are drawn separately from a measured catalog by the application. No checkerboard painted into the pixels. No solid black, white or colored background; preserve actual transparency. This is illustrative art, not measured data.
```

### lagoon-v1.png

```text
Use case: scientific-educational
Asset type: one soft transparent deep-sky raster texture for a planetarium; square 1024 by 1024 pixels.
Style: subdued low-frequency astronomical illustration, broadly recognizable morphology but no photographic detail or calibrated-data claim. Gentle optically diffused emission or unresolved glow, soft internal transitions, restrained desaturated color, no sharp filaments or edges.
Composition: center the named object on the image. Entire luminous footprint contained within the middle 70 percent of both dimensions. All four outer margins must be fully transparent and generous. Feather emission naturally into genuine alpha transparency. Approximate astronomical north up, east left, without decorative rotation.
Constraints: no text, labels, frames, arrows, border, checkerboard pixels, solid background, landscape, planets, lens flares, diffraction spikes, or unrelated nebulae. Absolutely no discrete stars or bright dots; actual stars are rendered separately by the application from measured catalogs. The image is illustrative, not measured data.
Subject: Messier 8, the Lagoon Nebula. Preserve its elongated oval east-west cloud of emission, the broad dark lagoon-like dust lane splitting the main glow, and the brighter compact western portion near the Hourglass region. Render the known large-scale asymmetry instead of a generic round cloud. Very muted dusty rose/mauve and warm ivory-gray emission, soft low contrast. The larger stellar-cluster side must contain only diffuse unresolved haze, no separate stars.
```

### carina-v1.png

```text
Use case: scientific-educational
Asset type: one soft transparent deep-sky raster texture for a planetarium; square 1024 by 1024 pixels.
Style: subdued low-frequency astronomical illustration, broadly recognizable morphology but no photographic detail or calibrated-data claim. Gentle optically diffused emission or unresolved glow, soft internal transitions, restrained desaturated color, no sharp filaments or edges.
Composition: center the named object on the image. Entire luminous footprint contained within the middle 70 percent of both dimensions. All four outer margins must be fully transparent and generous. Feather emission naturally into genuine alpha transparency. Approximate astronomical north up, east left, without decorative rotation.
Constraints: no text, labels, frames, arrows, border, checkerboard pixels, solid background, landscape, planets, lens flares, diffraction spikes, or unrelated nebulae. Absolutely no discrete stars or bright dots; actual stars are rendered separately by the application from measured catalogs. The image is illustrative, not measured data.
Subject: NGC 3372, the Carina Nebula. A broad irregular complex of interlocking luminous lobes divided by dark rifts, with a prominent crooked V-shaped dark lane near the center and the Eta Carinae region suggested as a soft central brightening, never a star. Preserve the characteristic broad complex structure, not a circular cloud. Muted rose/ivory emission and faint gray-violet peripheral haze, thoroughly softened.
```

### north-america-v1.png

```text
Use case: scientific-educational
Asset type: one soft transparent deep-sky raster texture for a planetarium; square 1024 by 1024 pixels.
Style: subdued low-frequency astronomical illustration, broadly recognizable morphology but no photographic detail or calibrated-data claim. Gentle optically diffused emission or unresolved glow, soft internal transitions, restrained desaturated color, no sharp filaments or edges.
Composition: center the named object on the image. Entire luminous footprint contained within the middle 70 percent of both dimensions. All four outer margins must be fully transparent and generous. Feather emission naturally into genuine alpha transparency. Approximate astronomical north up, east left, without decorative rotation.
Constraints: no text, labels, frames, arrows, border, checkerboard pixels, solid background, landscape, planets, lens flares, diffraction spikes, or unrelated nebulae. Absolutely no discrete stars or bright dots; actual stars are rendered separately by the application from measured catalogs. The image is illustrative, not measured data.
Subject: NGC 7000, the North America Nebula. Preserve the famously recognizable broad continent-like emission outline with its clear Gulf of Mexico indentation and the narrower Mexico/Central America peninsula. In the conventional north-up/east-left view, the dark gulf indents the lower right side, the broad northern area lies above, and the peninsula descends along the lower left of the gulf. Smooth and subtle, never an outlined map or geographic diagram. Muted dusty rose/red-gray hydrogen emission, broad low-contrast dark lane, no separate Pelican Nebula.
```

### pleiades-v1.png

```text
Use case: scientific-educational
Asset type: one soft transparent deep-sky raster texture for a planetarium; square 1024 by 1024 pixels.
Style: subdued low-frequency astronomical illustration, broadly recognizable morphology but no photographic detail or calibrated-data claim. Gentle optically diffused emission or unresolved glow, soft internal transitions, restrained desaturated color, no sharp filaments or edges.
Composition: center the named object on the image. Entire luminous footprint contained within the middle 70 percent of both dimensions. All four outer margins must be fully transparent and generous. Feather emission naturally into genuine alpha transparency. Approximate astronomical north up, east left, without decorative rotation.
Constraints: no text, labels, frames, arrows, border, checkerboard pixels, solid background, landscape, planets, lens flares, diffraction spikes, or unrelated nebulae. Absolutely no discrete stars or bright dots; actual stars are rendered separately by the application from measured catalogs. The image is illustrative, not measured data.
Subject: Messier 45, the Pleiades reflection-nebula haze. Show ONLY the delicate interconnected blue-gray reflection clouds associated with this familiar sparse stellar group: a small irregular collection of overlapping soft diffuse veils, including the broader fan-like Merope reflection haze to the south of the group. The broad glow should suggest the Pleiades nebular complex rather than an emission nebula or a round globular cluster. Very pale desaturated slate-blue and cool silver haze. No stars at all, no isolated luminous dots or bright cores: those main stars already exist in the application's measured star catalog.
```

### omega-centauri-v1.png

```text
Use case: scientific-educational
Asset type: one soft transparent deep-sky raster texture for a planetarium; square 1024 by 1024 pixels.
Style: subdued low-frequency astronomical illustration, broadly recognizable morphology but no photographic detail or calibrated-data claim. Gentle optically diffused emission or unresolved glow, soft internal transitions, restrained desaturated color, no sharp filaments or edges.
Composition: center the named object on the image. Entire luminous footprint contained within the middle 70 percent of both dimensions. All four outer margins must be fully transparent and generous. Feather emission naturally into genuine alpha transparency. Approximate astronomical north up, east left, without decorative rotation.
Constraints: no text, labels, frames, arrows, border, checkerboard pixels, solid background, landscape, planets, lens flares, diffraction spikes, or unrelated nebulae. Absolutely no discrete stars or bright dots; actual stars are rendered separately by the application from measured catalogs. The image is illustrative, not measured data.
Subject: NGC 5139, Omega Centauri globular cluster, represented ONLY by unresolved collective starlight. A nearly circular compact, softly mottled diffuse glow with mild natural ellipticity, smoothly concentrated toward its center and fading broadly toward the edge. The center is subdued warm ivory-gray, the halo is faint neutral silver with a trace of cool gray. Suggest the texture of innumerable unresolved faint cluster members without drawing ANY isolated recognizable point star, speckle, bright pinprick, flare, or sharp grain. No gas-cloud tendrils or dust lanes; it must read as a smooth globular cluster, not a nebula.
```


