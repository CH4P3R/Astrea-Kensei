import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const catalog = JSON.parse(readFileSync(new URL('../src/data/constellations/lines.json', import.meta.url), 'utf8'))
// The 88 modern constellation abbreviations, including both hemispheres.
const expectedIds = `And Ant Aps Aqr Aql Ara Ari Aur Boo Cae Cam Cnc CVn CMa CMi
  Cap Car Cas Cen Cep Cet Cha Cir Col Com CrA CrB Crv Crt Cru Cyg Del Dor Dra Equ
  Eri For Gem Gru Her Hor Hya Hyi Ind Lac Leo LMi Lep Lib Lup Lyn Lyr Men Mic Mon
  Mus Nor Oct Oph Ori Pav Peg Per Phe Pic Psc PsA Pup Pyx Ret Sge Sgr Sco Scl Sct
  Ser Sex Tau Tel Tri TrA Tuc UMa UMi Vel Vir Vol Vul`.split(/\s+/).sort()

test('the local catalog covers all 88 constellations, not just the zodiac', () => {
  assert.equal(catalog.type, 'FeatureCollection')
  assert.equal(expectedIds.length, 88)
  assert.equal(catalog.features.length, 89, 'Serpens has two distinct figures')
  assert.deepEqual([...new Set(catalog.features.map((feature) => feature.id))].sort(), expectedIds)
})

test('every figure consists of finite J2000 RA/Dec polylines with real segments', () => {
  for (const feature of catalog.features) {
    assert.equal(feature.type, 'Feature')
    assert.equal(feature.geometry.type, 'MultiLineString', feature.id)
    assert.ok(feature.geometry.coordinates.length > 0, feature.id)
    for (const line of feature.geometry.coordinates) {
      assert.ok(line.length >= 2, `${feature.id}: missing line segment`)
      for (let i = 0; i < line.length; i += 1) {
        const point = line[i]
        assert.equal(point.length, 2, feature.id)
        const [ra, dec] = point
        assert.ok(Number.isFinite(ra) && ra >= -180 && ra <= 180, `${feature.id}: invalid RA`)
        assert.ok(Number.isFinite(dec) && dec >= -90 && dec <= 90, `${feature.id}: invalid Dec`)
        if (i > 0) assert.notDeepEqual(point, line[i - 1], `${feature.id}: zero-length segment`)
      }
    }
  }
})

test('Serpens retains separate figures for its head and tail', () => {
  const serpens = catalog.features.filter((feature) => feature.id === 'Ser')
    .flatMap((feature) => feature.geometry.coordinates)
  const raDegrees = (point) => (point[0] + 360) % 360
  assert.ok(serpens.some((line) => line.every((point) => raDegrees(point) < 250)), 'missing Serpens Caput')
  assert.ok(serpens.some((line) => line.every((point) => raDegrees(point) > 250)), 'missing Serpens Cauda')
  assert.ok(serpens.every((line) => line.every((point) => raDegrees(point) < 250)
    || line.every((point) => raDegrees(point) > 250)), 'the two parts of Serpens must not be joined')
})
