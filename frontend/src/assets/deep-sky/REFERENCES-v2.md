# Observational references for the second illustration pass

References checked on 2026-11-17. These are telescope observations selected to guide the large-scale morphology and palette of a new, softened illustration pass. They are not replacements for the catalog coordinates. This file records reference selection, not a claim that every reference was supplied to a completed generation; the generation record must identify the actual image inputs and outputs.

The images combine measured passbands with display color assignments, exposure stretching and contrast processing. None is a prediction of naked-eye appearance. In particular, hydrogen-alpha enhancement, ultraviolet mapped to purple, and an I-band exposure mapped to red must not be described as unprocessed or calibrated true color.

## Main reference files

| Object | Observation page | Direct reference JPEG | Passbands and useful palette |
| --- | --- | --- | --- |
| Orion / M42 | [ESO eso1103a](https://www.eso.org/public/images/eso1103a/) | [Screensize JPEG](https://cdn.eso.org/images/screen/eso1103a.jpg) | B 451 nm, V 539 nm, R 651 nm, H-alpha 658 nm, plus U 340 nm. The published mapping assigns R/H-alpha to red, V to green, B to blue and ultraviolet to purple. Use restrained pink-red emission and a cooler luminous interior; purple is a display assignment. |
| Lagoon / M8 | [ESO eso0936a](https://www.eso.org/public/images/eso0936a/) | [Screensize JPEG](https://cdn.eso.org/images/screen/eso0936a.jpg) | Broadband B 456 nm, V 539 nm and R 651 nm, supplemented by narrowband H-alpha 658 nm. Soft reddish-pink emission, a brighter inner region and dark absorbing lanes; not a narrowband false-color gold/blue palette. |
| Carina / NGC 3372 | [ESO eso1250a](https://www.eso.org/public/images/eso1250a/) | [Screensize JPEG](https://cdn.eso.org/images/screen/eso1250a.jpg) | B 440 nm, g 480 nm, r 625 nm and H-alpha 659 nm. [ESO's supplied color metadata](https://www.astropix.org/image/eso/eso1250a) assigns B to blue, g to green and r/H-alpha to red. Retain subdued red-pink emission and dark dust, avoiding an unrelated infrared or gold/blue palette. |
| North America / NGC 7000 | [ESA/Hubble heic0510a](https://esahubble.org/images/heic0510a/) | [Screensize JPEG](https://cdn.esahubble.org/archives/images/screen/heic0510a.jpg) | Digitized POSS II/DSS2 red- and blue-sensitive photographic plates. This is a processed two-band optical composite, not three independently measured RGB channels. Use red-pink emission and low-luminance dust structure. |
| Pleiades / M45 | [NOIRLab observation](https://noirlab.edu/public/images/noao-m45/), [provider metadata on AstroPix](https://www.astropix.org/image/noirlab/noao-m45) | [AstroPix 1024-pixel JPEG](https://www.astropix.org/archive/noirlab/noao-m45/noirlab_noao-m45_1024.jpg) | B 436 nm is blue, V 537 nm is green, I 805 nm is red in the published composite. The I band extends beyond visible red. The blue reflection haze is the relevant visual reference; do not describe this BVI rendering as visible RGB alone. |
| Omega Centauri / NGC 5139 | [ESO eso1023c](https://www.eso.org/public/images/eso1023c/) | [Screensize JPEG](https://cdn.eso.org/images/screen/eso1023c.jpg) | Broadband B 445 nm, V 551 nm and R 658 nm. Use a subdued mix of pale, warmer and cooler stellar light for the unresolved glow, not gaseous emission colors. This image covers the central region only. |

The NOIRLab page returned a browser-verification page during this review. Its supplied image, credit, passbands and astrometric metadata were available through AstroPix, a NASA-supported astronomical image service carrying NOIRLab's provider record.

## Orientation, angular coverage and catalog alignment

| Reference | Published angular field | Published north direction | Direction adjustment for north-up artwork |
| --- | --- | --- | --- |
| eso1103a | 35.49 × 34.10 arcmin | 0.0 degrees left of vertical | Essentially already north up. |
| eso0936a | 93.49 × 62.61 arcmin | 0.0 degrees left of vertical | Essentially already north up. |
| eso1250a | 61.82 × 66.34 arcmin | 0.0 degrees right of vertical | Essentially already north up. |
| heic0510a | 236.23 × 236.23 arcmin | 0.9 degrees left of vertical | Approximately 0.9 degrees clockwise. |
| noao-m45 | Approximately 1.1 × 0.8 degrees | North 90.7 degrees clockwise from up; east toward the top | Approximately 90.7 degrees counterclockwise, placing north up and east left. |
| eso1023c | 21.32 × 21.32 arcmin | 2.8 degrees left of vertical | Approximately 2.8 degrees clockwise. |

Those are rotations of the reference photographs, not measured major-axis position angles of the objects. The intended output convention remains north up and east left without a mirror reflection. Keep the catalog's `positionAngleDeg: null`.

Do not change catalog centers to the coordinates displayed on an image page. A published astrometric reference position can belong to a reference pixel away from the geometric image center; an image's coordinate label alone is insufficient to register or recenter its pixels. Precise registration would require the full image astrometry and projection. The softened generated output remains an illustration rather than a plate-solved image.

The reference fields are also not the objects' full diameters. Orion's photograph samples a smaller field than the catalog optical extent. Carina's photograph covers only part of the much larger complex. Omega's BVR photograph contains only the central cluster. Enlarging one of these entire photographs to fill 70% of the current illustration canvas would enlarge its internal features incorrectly. Keep compact structure compact and permit only faint, approximate surrounding extension; retain the separately documented catalog and canvas sizes.

## Morphology to preserve while softening

These are drawing instructions inferred from the reference observations, not new measured morphology parameters.

- **Orion:** preserve the asymmetric luminous fan and cavity, the northern dark intrusion and the smaller northern M43 region. Avoid a smooth circular blob, a sharp cartoon contour, or a featureless white center. Keep outer wings much fainter than the inner glow.
- **Lagoon:** preserve the elongated complex, dark central lane and uneven brightness between its regions. The brighter inner area should dissolve into emission rather than become a white point. Keep the surrounding cloud broken and wispy, without an opaque outer outline.
- **Carina:** preserve an irregular connected complex split by branching dark rifts. Use several broad emission regions with varied transparency, rather than equally sized rounded lobes. Do not turn dust boundaries into bold ink-like strokes.
- **North America:** retain the broad northern area, dark Gulf of Mexico indentation and narrower southern extension. The reference also contains neighboring nebulosity and a dense stellar field; neither must be pasted into the NGC 7000 asset. Keep the recognizable silhouette feathered instead of tracing a geographical map.
- **Pleiades:** retain thin, directional blue reflection veils and irregular fans around the stellar group, especially the southern Merope region. Haze must remain translucent between clouds; avoid a filled blue disk. Bright stars belong to the measured stellar layer, so their positions and diffraction spikes must not be baked into this texture.
- **Omega Centauri:** preserve a centrally concentrated, mildly elongated population with a smooth outward decrease in unresolved light. It should read as a stellar concentration, not a gas cloud. The texture may suggest unresolved fine grain without inventing catalog-star positions or drawing conspicuous isolated points.

## Supplementary checks

[ESO eso1119b](https://www.eso.org/public/images/eso1119b/) ([screensize JPEG](https://cdn.eso.org/images/screen/eso1119b.jpg)) provides a wider 50.88 × 50.88 arcminute view of Omega Centauri, with north effectively up. It is useful for the overall concentration and outskirts. Its g 480 nm, r 625 nm and i 770 nm composite includes a band that ESO classifies as infrared; use the BVR reference above when explaining the optical color choice.

[The IAC Pleiades observation](https://www.iac.edu.es/en/outreach/multimedia-gallery/media/pleiades-open-cluster-m45) is an additional broadband LRGB reference from the Sky Treasure Chest astrograph. Its page explicitly documents red, green, blue and luminance exposures. The inspected page does not provide a verified north angle, and its download endpoint timed out during this review, so it is a palette cross-check rather than the principal registered-orientation reference.

## Reference credits

- **eso1103a:** ESO/Igor Chekalin.
- **eso0936a:** ESO.
- **eso1250a:** ESO. Acknowledgement: VPHAS+ Consortium/Cambridge Astronomical Survey Unit.
- **heic0510a:** Davide De Martin (ESA/Hubble), the ESA/ESO/NASA Photoshop FITS Liberator and Digitized Sky Survey 2.
- **noao-m45:** NOIRLab/NSF/AURA/T.A. Rector (University of Alaska Anchorage), R. Cool (University of Arizona) and WIYN.
- **eso1023c:** TRAPPIST/E. Jehin/ESO.
- **eso1119b, supplementary:** ESO/INAF-VST/OmegaCAM. Acknowledgement: A. Grado, L. Limatola/INAF-Capodimonte Observatory.
- **IAC Pleiades, supplementary:** Daniel López / Alfredo Rosenberg (IAC).

These credits identify the source observations and their authors. The observational images must not be presented as Astrea-Kensei's original photography, and the generated illustrations must not be presented as original data from these observatories. The project-wide authorship and licensing status is unchanged by this reference document.
