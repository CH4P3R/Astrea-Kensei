# Deep-sky illustration reference data

These six entries pair individually referenced catalog positions with soft visual illustrations. The centers use SIMBAD's ICRS positions listed at epoch J2000.0, consulted on 2026-11-16. Decimal degrees are conversions of the sexagesimal values below, not additional measurement precision. ICRS does not itself have an equinox; `coordinateEpoch: 'J2000'` identifies the reference positions supplied to the application's existing sky frame.

The imagery is illustrative, not an observation, calibrated surface-brightness map, or plate-solved image. Correct placement of the catalog center does not make the generated internal details astrometrically accurate. Colors and relative visibility are softened for the application and do not predict naked-eye visibility or measured spectra. No photographs or catalog database dumps are included by these data files.

The second artwork pass uses actual telescope images as generation references. Their filters, color assignments, image rotations and credits are recorded in [REFERENCES-v2.md](../../assets/deep-sky/REFERENCES-v2.md). Those display palettes do not constitute calibrated true color; the catalog centers and illustration fields below remain independent of the reference photographs' framing.

## Catalog centers and optical extents

| Object | ICRS RA, J2000 | ICRS Dec, J2000 | Optical extent, arcmin | Illustration field, degrees |
| --- | --- | --- | --- | --- |
| [M42, Orion](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=M42) | 05h 35m 16.8s | −05° 23′ 15″ | 66 × 66 | 1.6 × 1.6 |
| [M8, Lagoon](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=M+8) | 18h 03m 37.0s | −24° 23′ 12″ | approximately 90 × 40 | 2.15 × 2.15 |
| [NGC 3372, Carina](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=NGC+3372) | 10h 45m 02.23s | −59° 41′ 59.8″ | not asserted | 3.3 × 3.3 |
| [NGC 7000, North America](https://simbad.cds.unistra.fr/simbad/sim-basic?Ident=NGC+7000) | 20h 58m 47.0s | +44° 19′ 48″ | not asserted | 3 × 3 |
| [M45, Pleiades](https://simbad.cds.unistra.fr/simbad/sim-basic?Ident=M45) | 03h 46m 24.2s | +24° 06′ 50″ | 76.86 × 76.86 | 1.85 × 1.85 |
| [NGC 5139, Omega Centauri](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=NGC5139) | 13h 26m 47.28s | −47° 28′ 46.1″ | 36.3 × 36.3 | 0.87 × 0.87 |

SIMBAD's position references are `2022A&A...661A..38P` for M42, `2019ApJ...870...32K` for Carina, `2021A&A...647A..19T` for M45, and `2010AJ....140.1830G` for Omega Centauri. The consulted M8 and NGC 7000 records list legacy positions without an associated coordinate bibliography. Their displayed decimal precision should not be interpreted as modern subarcsecond accuracy.

M42 and Omega Centauri sizes are SIMBAD's optical angular-size fields, citing `1989Sci...246.1066D`. M45's optical cluster size cites `2021MNRAS.504..356D`; it is not a boundary of the surrounding reflection nebula. M8's approximate visible extent is given in [JRASC, August 2010, volume 104, number 4, PDF page 37](https://www.rasc.rocks/sites/default/files/publications/JRASC-2010-08-lr.pdf). These sizes describe different catalog or observing conventions, not uniform brightness contours.

## Drawing and orientation contract

`displayFieldDeg: [width, height]` is always a **square illustration canvas** including empty margins. It never asserts that the object is square or circular. The main motif is intended to occupy about 70% of the canvas; for entries with measured extents the field is approximately their major angular size divided by 0.7. M8's elongated 90 × 40 arcminute shape is drawn inside its square canvas, rather than stretching a square image to that aspect ratio. Carina and North America's fields are deliberate visual approximations, not recovered angular measurements.

The intended texture convention is celestial north up and east left. The renderer must orient this local tangent frame with the sky. All `positionAngleDeg` values are `null`: no measured major-axis angle is supplied. A source photograph's north-arrow angle is an image rotation, not an object's position angle. Equal catalog axes do not establish a physical position angle either.

The artwork should retain only broad identifying structure:

- **M42:** a luminous central region, asymmetric surrounding cloud and dark intrusions, guided by [NASA's M42 overview](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-42/). The approximate catalog extent is not a circular cutoff. Individual Trapezium stars are not texture-generated astrometric landmarks.
- **M8:** an elongated emission cloud split by a dark lagoon-like lane, with a brighter compact inner region, as described in [ESO's Lagoon Nebula image](https://www.eso.org/public/images/potw1016a/). That published image covers only about 13.3 × 13.6 arcminutes and has rotated north, so its field must not be mistaken for the full nebula's size or copied as a north-up composition without accounting for that rotation.
- **Carina:** broad glowing lobes interrupted by irregular dark dust, guided by [ESO's optical wide view](https://www.eso.org/public/images/eso1250a/), whose metadata has north up. That image's approximately 61.8 × 66.3 arcminute field covers only part of the complex. [The Herschel project page](https://herscheltelescope.org.uk/results/carina-nebula/) gives a 2.3-degree image field in far-infrared bands; this is context for the complex's broad coverage, not an optical diameter or an instruction to copy infrared colors.
- **NGC 7000:** a diffuse continent-like cloud with the conspicuous dark Gulf of Mexico notch, supported by [NASA's Caldwell 20 overview](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-20/) and [Spitzer's optical/infrared discussion](https://www.spitzer.caltech.edu/news/ssc2011-03-new-view-of-family-life-in-the-north-america-nebula). The familiar optical outline changes strongly in infrared. A roughly 2-degree drawn motif inside the 3-degree canvas is an art choice; neither major nor minor optical boundary is claimed.
- **M45:** pale blue reflection haze and soft streaks around the cluster, consistent with [NASA's M45 overview](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-45/). The stars' positions come from the existing stellar layer; the illustration must not add a fabricated arrangement of bright stars. Dust contours are illustrative and are not defined by the cluster's quoted size.
- **Omega Centauri:** a dense rounded unresolved glow fading outward, consistent with [NASA's Caldwell 80 overview](https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-caldwell-catalog/caldwell-80/) and [ESA's cluster description](https://www.esa.int/About_Us/ESAC/A_puzzle_of_10_million_stars). Fine grain may suggest unresolved starlight; it is not a catalog of individual stars or a calibrated radial profile.

These links credit the astronomical information and visual references. They do not imply NASA, ESA, ESO, CDS, or RASC endorsement, nor a license for Astrea-Kensei as a whole. Generated asset provenance belongs alongside the image assets.
