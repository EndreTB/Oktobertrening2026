import * as THREE from 'three';
import type { RealmComposition } from './realm-environments';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const surface = (color: string, metalness = 0, glow = 0) => new THREE.MeshStandardMaterial({
  color, roughness: .72, metalness, emissive: color, emissiveIntensity: glow,
});

/** One landscape, one continuous walk: a moon garden rising into the crown. */
export function buildStarTree(group: THREE.Group, random: () => number): RealmComposition {
  const limestone = surface('#c4bd9e', .12);
  const brass = surface('#bda36a', .65);
  const bark = surface('#626e71', .3);
  const light = new THREE.MeshBasicMaterial({ color: '#ffe5a3' });
  const teal = surface('#438e86', .15, .12);
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, p: THREE.Vector3, parent: THREE.Object3D = group) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.copy(p); object.castShadow = true; object.receiveShadow = true;
    parent.add(object); return object;
  };
  const pipe = (points: THREE.Vector3[], radius: number, material: THREE.Material, segments = 80) =>
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 8, false), material, v(0, 0, 0));
  // Taper branches instead of using constant-width neon tubes.
  const branch = (points: THREE.Vector3[], radius: number, material = bark) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 40, 1, 8, false);
    const positions = geometry.attributes['position'];
    for (let i = 0; i <= 40; i++) {
      const center = curve.getPointAt(i / 40), scale = radius * (1 - i / 40 * .94);
      for (let j = 0; j <= 8; j++) {
        const index = i * 9 + j;
        const p = new THREE.Vector3().fromBufferAttribute(positions, index).sub(center).multiplyScalar(scale).add(center);
        positions.setXYZ(index, p.x, p.y, p.z);
      }
    }
    geometry.computeVertexNormals();
    return mesh(geometry, material, v(0, 0, 0));
  };

  const approach = new THREE.CatmullRomCurve3([
    v(-11, 1.1, 10), v(-7, 1.5, 11), v(-1, 2.1, 10), v(6, 3, 9),
    v(10, 3.8, 5), v(8, 4.6, 1), v(3, 5.3, 2), v(-2, 5.9, 4),
    v(-7, 6.5, 1), v(-7, 7.1, -4), v(-3, 7.8, -8),
  ]);
  const gardenPoints = approach.getSpacedPoints(180);
  const startAngle = Math.atan2(-5, -3), startRadius = Math.hypot(3, 5);
  const ascent = Array.from({ length: 121 }, (_, i) => {
    const t = i / 120, angle = startAngle + t * Math.PI * 2.05, radius = startRadius - t * 3;
    return v(Math.cos(angle) * radius, 7.8 + t * 12, -3 + Math.sin(angle) * radius);
  });
  const route = new THREE.CatmullRomCurve3([...gardenPoints, ...ascent.slice(1)]);
  const points = route.getSpacedPoints(320);

  // A radial heightfield closes into a sculpted cliff, with no rectangular base.
  const terrainHeight = (x: number, z: number) => {
    let nearest = Infinity, pathHeight = 0;
    for (const p of gardenPoints) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < nearest) { nearest = d; pathHeight = p.y - .21; }
    }
    const hill = .8 + 6.8 * Math.exp(-(x * x + (z + 3) ** 2) / 85);
    const weight = Math.exp(-nearest / 5);
    return THREE.MathUtils.lerp(hill + Math.sin(x * .7) * Math.cos(z * .6) * .24, pathHeight, weight);
  };
  const edgeRadius = (a: number) => 15.6 + Math.sin(a * 3) * .65 + Math.cos(a * 5) * .45;
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
  const rings = 64, sides = 160;
  const moss = new THREE.Color('#254d4c'), ridge = new THREE.Color('#487674'), cliff = new THREE.Color('#293849');
  for (let r = 0; r <= rings + 10; r++) {
    const under = Math.max(0, (r - rings) / 10);
    for (let s = 0; s <= sides; s++) {
      const a = s / sides * Math.PI * 2;
      const radius = edgeRadius(a) * (r <= rings ? r / rings : 1 - under * .4);
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius * .88 + 1;
      const y = r <= rings ? terrainHeight(x, z) : terrainHeight(Math.cos(a) * edgeRadius(a), Math.sin(a) * edgeRadius(a) * .88 + 1) - under * (7 + Math.sin(a * 7) * .6);
      vertices.push(x, y, z);
      const color = r <= rings ? moss.clone().lerp(ridge, Math.min(1, y / 11 + (Math.sin(x * 1.2 + z) + 1) * .08)) : ridge.clone().lerp(cliff, Math.min(1, under * 1.9));
      colors.push(color.r, color.g, color.b);
      if (r < rings + 10 && s < sides) {
        const n = r * (sides + 1) + s;
        indices.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1);
      }
    }
  }
  const terrain = new THREE.BufferGeometry();
  terrain.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  terrain.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  terrain.setIndex(indices); terrain.computeVertexNormals();
  mesh(terrain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, side: THREE.DoubleSide }), v(0, 0, 0)).name = 'star-garden-terrain';

  // A solid stone walkway. The same curve carries the hiker, paving and railings.
  const routeFrames = points.map((p, i) => {
    const tangent = points[Math.min(points.length - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    return { p, side: v(tangent.z, 0, -tangent.x).normalize(), tangent };
  });
  const deckVertices: number[] = [], deckIndices: number[] = [];
  for (let i = 0; i < routeFrames.length; i++) {
    const { p, side } = routeFrames[i];
    for (const [s, y] of [[1, -.09], [-1, -.09], [1, -.36], [-1, -.36]]) {
      deckVertices.push(...p.clone().addScaledVector(side, s * .92).add(v(0, y, 0)).toArray());
    }
    if (i < routeFrames.length - 1) {
      const n = i * 4;
      deckIndices.push(n, n + 1, n + 4, n + 1, n + 5, n + 4,
        n, n + 2, n + 4, n + 2, n + 6, n + 4,
        n + 1, n + 5, n + 3, n + 3, n + 5, n + 7,
        n + 2, n + 3, n + 6, n + 3, n + 7, n + 6);
    }
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute('position', new THREE.Float32BufferAttribute(deckVertices, 3)); deck.setIndex(deckIndices); deck.computeVertexNormals();
  mesh(deck, limestone, v(0, 0, 0)).name = 'star-garden-walkway';
  for (const side of [-1, 1]) {
    pipe(routeFrames.map(f => f.p.clone().addScaledVector(f.side, side * .84).add(v(0, -.025, 0))), .025, brass, 320);
    pipe(ascent.map((p, i) => {
      const angle = startAngle + i / 120 * Math.PI * 2.05;
      return p.clone().add(v(Math.cos(angle) * side * .91, .7, Math.sin(angle) * side * .91));
    }), .028, brass, 150);
  }
  // Instanced paving joints and lanterns keep the detailed path inexpensive.
  const joints = new THREE.InstancedMesh(new THREE.BoxGeometry(1.74, .018, .028), brass, 185);
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.045, .075, .7, 6), brass, 64);
  const lanterns = new THREE.InstancedMesh(new THREE.SphereGeometry(.105, 8, 6), light, 64);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 185; i++) {
    const t = i / 184, p = route.getPointAt(t), tangent = route.getTangentAt(t);
    dummy.position.copy(p).add(v(0, -.071, 0)); dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0); dummy.updateMatrix(); joints.setMatrixAt(i, dummy.matrix);
  }
  for (let i = 0; i < 64; i++) {
    const t = Math.floor(i / 2) / 31, p = route.getPointAt(t), tangent = route.getTangentAt(t);
    const side = v(tangent.z, 0, -tangent.x).normalize().multiplyScalar(i % 2 ? .89 : -.89);
    dummy.rotation.set(0, 0, 0); dummy.position.copy(p).add(side).add(v(0, .27, 0)); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix);
    dummy.position.y += .43; dummy.updateMatrix(); lanterns.setMatrixAt(i, dummy.matrix);
  }
  group.add(joints, posts, lanterns);

  // The tree's roots and branches physically support the upper promenade.
  const trunk = [v(0, 6.8, -3), v(-.5, 10, -3), v(.35, 14, -3.3), v(-.4, 18, -3), v(0, 25.5, -3)];
  branch(trunk, 1.25);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, x = Math.cos(a) * 4.5, z = -3 + Math.sin(a) * 4.5;
    branch([v(0, 9, -3), v(x * .4, 7.7, -3 + (z + 3) * .4), v(x, terrainHeight(x, z) + .08, z)], .45);
  }
  for (let i = 18; i < ascent.length; i += 17) {
    const p = ascent[i];
    branch([v(0, p.y - 3, -3), p.clone().multiply(v(.6, 1, 1)).add(v(0, -1.4, 0)), p.clone().add(v(0, -.4, 0))], .32);
  }
  const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), surface('#b7c8ad', .35, .16), 720);
  let leafIndex = 0;
  for (let i = 0; i < 18; i++) {
    const a = i * 2.399, y = 13.5 + i * .46, radius = 7.2 - Math.max(0, y - 16) * .72;
    const end = v(Math.cos(a) * radius, y + 2.5, -3 + Math.sin(a) * radius);
    branch([v(0, y - 2, -3), v(end.x * .45, y, -3 + (end.z + 3) * .45), end], .32);
    for (let j = 0; j < 3; j++) {
      const tip = end.clone().add(v(Math.cos(a + j - 1) * 1.8, .7 + j * .25, Math.sin(a + j - 1) * 1.8));
      branch([end.clone().lerp(v(0, y, -3), .3), end, tip], .12);
    }
    for (let j = 0; j < 40; j++) {
      dummy.position.copy(end).add(v((random() - .5) * 4.2, (random() - .5) * 1.7, (random() - .5) * 3.4));
      dummy.rotation.set(random() * 2, random() * 6, random());
      const scale = .16 + random() * .23; dummy.scale.set(scale, scale * .4, scale * 1.8); dummy.updateMatrix();
      leaves.setMatrixAt(leafIndex, dummy.matrix);
      leaves.setColorAt(leafIndex++, new THREE.Color().setHSL(.11 + random() * .1, .24 + random() * .2, .48 + random() * .28));
    }
  }
  leaves.castShadow = true; group.add(leaves); dummy.scale.setScalar(1);

  // A reflecting pool and slender cypress groves give the lower walk a sense of place.
  const pool = mesh(new THREE.CylinderGeometry(2.8, 3, .18, 64), brass, v(-2, terrainHeight(-2, 7) + .06, 7));
  const water = mesh(new THREE.CircleGeometry(2.72, 64), surface('#1b6976', .65, .14), v(0, .1, 0), pool); water.rotation.x = -Math.PI / 2;
  for (const radius of [.8, 1.7, 2.4]) {
    const ripple = mesh(new THREE.TorusGeometry(radius, .012, 4, 64), teal, v(0, .11, 0), pool); ripple.rotation.x = -Math.PI / 2;
  }
  const grove = new THREE.InstancedMesh(new THREE.ConeGeometry(.7, 3.4, 9), surface('#204c50'), 65);
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), surface('#526b70'), 90);
  const clearOfWalk = (x: number, z: number, margin: number) => gardenPoints.every(p => Math.hypot(p.x - x, p.z - z) > margin);
  for (let i = 0; i < 155; i++) {
    let x = 0, z = 0;
    for (let attempt = 0; attempt < 100; attempt++) {
      const a = random() * Math.PI * 2, r = 6 + random() * 7;
      x = Math.cos(a) * r; z = 1 + Math.sin(a) * r * .87;
      if (clearOfWalk(x, z, 1.65) && Math.hypot(x + 2, z - 7) > 3.5) break;
    }
    const tree = i < 65, scale = tree ? .45 + random() * .65 : .25 + random() * .65;
    dummy.position.set(x, terrainHeight(x, z) + (tree ? scale * 1.55 : .12), z);
    dummy.rotation.set(0, random() * 6, tree ? 0 : random());
    dummy.scale.set(scale, tree ? scale : scale * .65, scale); dummy.updateMatrix();
    (tree ? grove : rocks).setMatrixAt(tree ? i : i - 65, dummy.matrix);
  }
  grove.castShadow = true; rocks.castShadow = true; group.add(grove, rocks); dummy.scale.setScalar(1);

  // An entrance arch, with an echo at the observatory at the end of the climb.
  const entry = new THREE.Group(); entry.position.copy(points[0]);
  const entryTangent = route.getTangent(0); entry.rotation.y = Math.atan2(entryTangent.x, entryTangent.z); group.add(entry);
  for (const side of [-1, 1]) mesh(new THREE.CylinderGeometry(.15, .22, 2.7, 12), limestone, v(side * 1.3, 1.25, 0), entry);
  mesh(new THREE.TorusGeometry(1.3, .16, 8, 32, Math.PI), limestone, v(0, 2.6, 0), entry);
  const end = points.at(-1)!;
  mesh(new THREE.CylinderGeometry(1.65, 1.4, .3, 48), limestone, end.clone().add(v(0, -.25, 0)));
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5 + Math.PI / 2, r = i % 2 ? .48 : 1.2;
    if (i) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starShape.closePath();
  const star = mesh(new THREE.ExtrudeGeometry(starShape, { depth: .16, bevelEnabled: true, bevelSize: .055, bevelThickness: .06, bevelSegments: 2, steps: 1 }), light, v(0, 26, -3));
  star.rotation.y = .3;
  const halo = mesh(new THREE.TorusGeometry(1.85, .018, 6, 96), brass, v(0, 26, -3)); halo.rotation.y = .3;
  const beacon = new THREE.PointLight('#ffd992', 22, 18, 2); beacon.position.set(0, 22, -2); group.add(beacon);

  // A quiet, distant star field stays fixed while the landscape is explored.
  const stars: number[] = [], starColors: number[] = [];
  for (let i = 0; i < 380; i++) {
    stars.push((random() - .5) * 100, random() * 60 - 10, -28 - random() * 40);
    const color = new THREE.Color(i % 5 ? '#9cb6cc' : '#f1d7a2'); starColors.push(color.r, color.g, color.b);
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3)); starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
  group.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: .09, vertexColors: true, transparent: true, opacity: .7, depthWrite: false })));
  return { points, overview: v(34, 29, 48), lookAt: v(0, 9, 0), followOffset: v(8, 5.5, 10) };
}
