import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Matrix4, OrthographicCamera, Vector3 } from 'three'
import { constellationNames } from '../src/data/constellations/names.js'
import { constellationAnchor, constellationLabelOpacity, constellationLabels, constellationLineData,
  selectConstellationLabels, updateConstellationOpacities } from '../src/three/core/constellationLabelUtils.js'
import { equatorialFrameBasis } from '../src/three/core/coordinateUtils.js'

const catalog = JSON.parse(readFileSync(new URL('../src/data/constellations/lines.json', import.meta.url), 'utf8'))
const figure = (points) => ({ id: 'And', geometry: { type: 'MultiLineString', coordinates: [points] } })

test('figure names cover the whole catalog and keep both Serpens anchors', () => {
  const labels = constellationLabels(catalog.features, 100)
  assert.equal(Object.keys(constellationNames).length, 88)
  assert.deepEqual(Object.keys(constellationNames).sort(), [...new Set(catalog.features.map(({ id }) => id))].sort())
  assert.equal(labels.length, 89)
  assert.equal(new Set(labels.map(({ id }) => id)).size, 89)
  for (const { position } of labels) assert.ok(Math.abs(Math.hypot(...position) - 100) < 1e-10)
  const serpens = labels.filter(({ constellation }) => constellation === 'Ser')
  assert.deepEqual(serpens.map(({ text }) => text).sort(), ['Serpens Caput', 'Serpens Cauda'])
  assert.ok(new Vector3(...serpens[0].position).angleTo(new Vector3(...serpens[1].position)) > 0.5)
})

test('spherical anchors preserve the RA seam and ignore repeated loop vertices', () => {
  const open = constellationAnchor(figure([[350, 0], [10, 0]]))
  const closed = constellationAnchor(figure([[350, 0], [10, 0], [-10, 0]]))
  assert.ok(Math.abs(open[0]) < 1e-12)
  assert.ok(open[2] < -0.999)
  assert.deepEqual(open, closed)
  const polar = constellationAnchor(figure([[0, 89], [180, 89]]))
  assert.ok(polar[1] > 0.999)
})

test('labels behind the camera, outside the viewport or overlapping a nearer label are rejected', () => {
  const make = (index, x, y, score, inFront = true) => ({ index, x, y, score, inFront, width: 80, height: 22 })
  const candidates = [make(0, 400, 300, 0), make(1, 410, 300, 0.1), make(2, 200, 180, 0.2),
    make(3, 400, 300, -1, false), make(4, 10, 200, -0.5), make(5, 600, 450, 0.3)]
  assert.deepEqual(selectConstellationLabels(candidates, 800, 600).map(({ index }) => index), [0, 2, 5])
  assert.deepEqual(selectConstellationLabels(candidates, 800, 600, [], [], 2).map(({ index }) => index), [0, 2])
})

test('label visibility follows the real observer rotation and the camera rather than fixed RA', () => {
  const camera = new OrthographicCamera(-70, 70, 45, -45, 0.01, 250)
  const labels = constellationLabels(catalog.features, 100)
  const timestamp = Date.UTC(2026, 10, 16)
  const visible = (observer) => {
    const frame = new Matrix4().makeBasis(...equatorialFrameBasis(observer, timestamp).map((axis) => new Vector3(...axis)))
    camera.updateMatrixWorld()
    const candidates = labels.map((label, index) => {
      const point = new Vector3(...label.position).applyMatrix4(frame).applyMatrix4(camera.matrixWorldInverse)
      const inFront = point.z < -camera.near && point.z > -camera.far
      point.applyMatrix4(camera.projectionMatrix)
      return { index, x: (point.x + 1) * 400, y: (1 - point.y) * 300,
        width: 100, height: 22, inFront, score: point.x ** 2 + point.y ** 2 }
    })
    return selectConstellationLabels(candidates, 800, 600).map(({ index }) => labels[index].id)
  }
  const north = visible({ latitude: 45, longitude: 0 })
  const south = visible({ latitude: -45, longitude: 0 })
  assert.ok(north.length > 0 && north.length <= 8)
  assert.ok(south.length > 0 && south.length <= 8)
  assert.notDeepEqual(north, south)
  camera.rotation.y = Math.PI
  assert.notDeepEqual(visible({ latitude: 45, longitude: 0 }), north)
  assert.ok(constellationLabelOpacity(1) > 0)
  assert.equal(constellationLabelOpacity(20), 0)
  assert.equal(constellationLabelOpacity(8192), 0)
})

test('line vertices retain the name of their own figure, including both Serpens parts', () => {
  const features = catalog.features.filter(({ id }) => id === 'Ser' || id === 'Ori')
  const labels = constellationLabels(features, 100)
  const data = constellationLineData(features, labels, 100)
  assert.equal(data.positions.length, data.figures.length * 3)
  assert.equal(data.figures.length % 2, 0)
  assert.deepEqual([...new Set(data.figures)], [0, 1, 2])
  for (let vertex = 0; vertex < data.figures.length; vertex += 2) {
    assert.equal(data.figures[vertex], data.figures[vertex + 1], 'a line cannot join different names')
    const position = new Vector3().fromArray(data.positions, vertex * 3)
    assert.ok(Math.abs(position.length() - 100) < 1e-5)
  }

  // A selected head must not reveal the disconnected tail or Orion's figure.
  const candidates = labels.map((_, index) => ({ index, selected: false }))
  const opacities = new Float32Array(labels.length)
  const caput = labels.findIndex(({ text }) => text === 'Serpens Caput')
  const cauda = labels.findIndex(({ text }) => text === 'Serpens Cauda')
  updateConstellationOpacities(candidates, [candidates[caput]], opacities, constellationLabelOpacity(1), 0.1)
  assert.ok(opacities[caput] > 0)
  assert.equal(opacities[cauda], 0)
  for (const figureIndex of data.figures) {
    assert.equal(opacities[figureIndex] > 0, figureIndex === caput)
  }
})

test('changing the view removes former lines immediately and zoom hides both layers', () => {
  const candidates = [
    { index: 0, x: 300, y: 200, width: 80, height: 22, score: 0, inFront: true },
    { index: 1, x: 500, y: 200, width: 80, height: 22, score: 1, inFront: false },
  ]
  const opacities = new Float32Array(2)
  let selected = selectConstellationLabels(candidates, 800, 600)
  updateConstellationOpacities(candidates, selected, opacities, constellationLabelOpacity(1), 0.1)
  const first = opacities[0]
  assert.ok(first > 0 && first < constellationLabelOpacity(1), 'the line/name entrance should fade in')
  candidates[0].inFront = false
  candidates[1].inFront = true
  selected = selectConstellationLabels(candidates, 800, 600)
  updateConstellationOpacities(candidates, selected, opacities, constellationLabelOpacity(1), 0.1)
  assert.equal(opacities[0], 0, 'no former figure may remain without its name')
  assert.ok(opacities[1] > 0)
  assert.equal(updateConstellationOpacities(candidates, [], opacities, constellationLabelOpacity(20), 0.1), false)
  assert.deepEqual([...opacities], [0, 0])
})
