# Constellation figure data

`lines.json` contains the constellation figures from [d3-celestial](https://github.com/ofrohn/d3-celestial), by Olaf Frohn.

- Upstream data: [`data/constellations.lines.json`](https://github.com/ofrohn/d3-celestial/blob/master/data/constellations.lines.json).
- Upstream license: [BSD-3-Clause](https://github.com/ofrohn/d3-celestial/blob/master/LICENSE); the complete notice is retained in `LICENSE.d3-celestial`.
- Upstream source notes: [d3-celestial README, Files and Sources](https://github.com/ofrohn/d3-celestial#files). The upstream author cites the IAU constellation page and documents his own line modifications.
- Retrieved: 2026-11-16, from `https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json`.
- Snapshot: 27,136 bytes; SHA-256 `294f66bef5d5cf50b1e17f16d2efa1d97a15131612c68dd935adef6e7373e13c`. The imported JSON is unchanged. This content hash identifies the local snapshot; the upstream `master` URL may change.

The figures connect stars conventionally. They are not the official boundaries of constellation regions, and their particular shapes are not an official IAU standard.

## Coordinate contract

The file is a GeoJSON `FeatureCollection`. Each constellation is identified by its three-letter abbreviation in `feature.id`. The line coordinates are J2000 equatorial positions in degrees, `[right ascension, declination]`. Upstream maps right ascension to `[-180, 180]`: negative values are equivalent to adding 360 degrees. The first coordinate is not terrestrial longitude and must not be negated when rendering the sky.

There are 89 features representing 88 constellations: Serpens Caput and Serpens Cauda are separate features that both use the ID `Ser`. Do not deduplicate the features by ID, since doing so would discard half of Serpens.

Each `MultiLineString` contains independent polylines. Preserve the boundaries between those polylines: disconnected figures, including the two parts of Serpens, must not acquire artificial connecting lines. Consecutive positions within each polyline are connected on the celestial sphere.

The data is bundled with the frontend and requires no catalog request at runtime. The existing observer/date frame provides the local orientation.

This third-party license applies to the imported catalog. It does not set a license for Astrea-Kensei as a whole. The full notice is also included in `frontend/public/licenses/d3-celestial.txt`, so Vite copies it into distributed builds. Keep that notice with built applications as well as source distributions.
