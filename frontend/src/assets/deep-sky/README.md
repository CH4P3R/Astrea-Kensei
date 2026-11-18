# Illustrative deep-sky textures

The active `*-v2.png` assets were generated with the built-in ImageGen tool on
2026-11-17, using telescope photographs as visual references. Each object has
its own image. The photographs were inspected and supplied to generation;
they are not bundled as runtime sky imagery.

- [Orion / M42](orion-v2.png)
- [Lagoon / M8](lagoon-v2.png)
- [Carina / NGC 3372](carina-v2.png)
- [North America / NGC 7000](north-america-v2.png)
- [Pleiades / M45](pleiades-v2.png)
- [Omega Centauri / NGC 5139](omega-centauri-v2.png)

See [the exact prompts and generation inputs](PROMPTS-v2.md) and
[the observations, filters, orientations and credits](REFERENCES-v2.md).
The original transparent v1 files remain available for comparison, with their
original prompts and inspection record in [HISTORY-v1.md](HISTORY-v1.md).
Only the v2 files are referenced by the application.

The six active files are native **1254 × 1254 RGB PNGs**, totaling
**5,867,377 bytes (5.87 MB)**. They contain no transparency mask.

## Appearance and rendering

The new images represent emission fading continuously into a near-black
background. Nebulae retain open wisps, uneven luminous regions and dark lanes;
Pleiades contains blue reflection veils, and Omega Centauri suggests unresolved
collective starlight. Bright point stars and diffraction spikes are omitted
because the measured stellar catalog supplies the application's stars.

`DeepSkyObjects` draws these images over a black canvas and uses their RGB as
additive light. Black contributes no light; there is no alpha cutoff through
faint cloud detail. A continuous feather at the outer bitmap boundary suppresses
seams. GPU textures remain limited to 512 pixels per side with mipmaps, load
only when their field first enters view, and disappear during FITS inspection
or strong zoom. The generated PNG files themselves are preserved unchanged.

## Accuracy and color

These are **illustrations, not measured images, WCS solutions, photometric maps,
or predictions of naked-eye visibility**. Catalog centers and angular canvas
fields are documented independently in [SOURCE.md](../../data/deepSky/SOURCE.md).
The renderer aligns the patch with celestial north and east; generated internal
structure, its scale and its orientation remain approximate rather than
plate-solved. Reference photograph fields must not be mistaken for object sizes.

Colors follow the selected observational displays with restrained contrast.
Those displays combine filters and stretches; some include ultraviolet or
near-infrared assigned to visible colors. They are not unprocessed true-color
measurements. The generation record identifies the actual references used,
and REFERENCES-v2.md preserves their authors' credits.
