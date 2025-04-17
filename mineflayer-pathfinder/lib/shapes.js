// @ts-nocheck
const { Vec3 } = require('vec3')

function getShapeFaceCenters (shapes, direction, half = null) {
  const faces = []
  for (const shape of shapes) {
    const halfsize = new Vec3(shape[3] - shape[0], shape[4] - shape[1], shape[5] - shape[2]).scale(0.5)
    let center = new Vec3(shape[0] + shape[3], shape[1] + shape[4], shape[2] + shape[5]).scale(0.5)
    center = center.offset(halfsize.x * direction.x, halfsize.y * direction.y, halfsize.z * direction.z)

    if (half === 'top' && center.y <= 0.5) {
      if (Math.abs(direction.y) === 0) center.y += halfsize.y - 0.001
      if (center.y <= 0.5) continue
    } else if (half === 'bottom' && center.y >= 0.5) {
      if (Math.abs(direction.y) === 0) center.y -= halfsize.y - 0.001
      if (center.y >= 0.5) continue
    }

    faces.push(center)
  }
  return faces
}

module.exports = { getShapeFaceCenters }
