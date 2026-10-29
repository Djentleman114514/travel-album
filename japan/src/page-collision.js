import { Matrix4, Vector3 } from "three";

const clearance = 0.0002;

function pageMatrix(sheet) {
  sheet.updateMatrix();
  sheet.page.updateMatrix();
  return new Matrix4().multiplyMatrices(sheet.matrix, sheet.page.matrix);
}

function supportProfile(sheet) {
  if (!sheet) return null;
  const positions = sheet.page.geometry.attributes.position;
  const columns = sheet.page.geometry.parameters?.widthSegments
    ?? Math.round(Math.sqrt(positions.count / 2)) - 1;
  const matrix = pageMatrix(sheet);
  const points = [];
  const point = new Vector3();
  for (let index = 0; index <= columns; index += 1) {
    point.fromBufferAttribute(positions, index).applyMatrix4(matrix);
    points.push({ x: point.x, y: point.y });
  }
  points.sort((a, b) => a.x - b.x);
  return points;
}

function supportHeight(profile, x) {
  if (!profile || x < profile[0].x - 1e-6 || x > profile.at(-1).x + 1e-6) return -Infinity;
  x = Math.max(profile[0].x, Math.min(profile.at(-1).x, x));
  for (let index = 1; index < profile.length; index += 1) {
    const left = profile[index - 1];
    const right = profile[index];
    if (x <= right.x) {
      const fraction = (x - left.x) / (right.x - left.x);
      return left.y + (right.y - left.y) * fraction;
    }
  }
  return -Infinity;
}

// A page is a triangle mesh. Checking only its vertices misses intersections
// between differently spaced grids, especially beside the spine. Along each
// triangle edge also check every bend in the resting paper's height profile.
// The maximum difference between these piecewise-linear surfaces occurs at
// one of those points. Lift the entire sheet, preserving its shape and UVs.
export function constrainTurningPage(book) {
  const sheets = [...book];
  const index = Math.floor(book.progress);
  if (book.progress === index || !sheets[index]) return false;
  const sheet = sheets[index];
  const profiles = [supportProfile(sheets[index - 1]), supportProfile(sheets[index + 1])];
  const matrix = pageMatrix(sheet);
  const geometry = sheet.page.geometry;
  const positions = geometry.attributes.position;
  const points = [];
  let lift = 0;
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const point = new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(matrix);
    points.push(point);
    for (const profile of profiles) {
      lift = Math.max(lift, supportHeight(profile, point.x) + clearance - point.y);
    }
  }
  const indices = geometry.index;
  // Front and back use coincident triangles; inspect just the first face.
  const faceCount = indices.count / 2;
  for (let triangle = 0; triangle < faceCount; triangle += 3) {
    for (let edge = 0; edge < 3; edge += 1) {
      const start = points[indices.getX(triangle + edge)];
      const end = points[indices.getX(triangle + (edge + 1) % 3)];
      if (Math.abs(end.x - start.x) < 1e-10) continue;
      for (const profile of profiles) {
        if (!profile) continue;
        for (const support of profile) {
          const fraction = (support.x - start.x) / (end.x - start.x);
          if (fraction < 0 || fraction > 1) continue;
          const height = start.y + (end.y - start.y) * fraction;
          lift = Math.max(lift, support.y + clearance - height);
        }
      }
    }
  }
  if (lift <= 1e-8) return false;
  sheet.position.y += lift;
  sheet.updateMatrix();
  return true;
}

// The engine keeps a minimum bend even at 0/1. Remove that residual bend so
// resting pages share a stable profile in both reading directions.
export function settlePage(sheet, progress) {
  if (progress !== 0 && progress !== 1) return;
  sheet.bend.force = 0;
  sheet.twist.angle = 0;
  sheet.modifiers.apply();
}
