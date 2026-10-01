import * as THREE from 'three';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A path belonging to the ground itself, without architectural trim or paving. */
export function naturalTrail(parent: THREE.Group, route: THREE.CatmullRomCurve3, width: number, color: string) {
  const positions: number[] = [], indices: number[] = [];
  for(let i=0;i<=320;i++){
    const p=route.getPointAt(i/320),tangent=route.getTangentAt(i/320),side=v(tangent.z,0,-tangent.x).normalize();
    const w=width*(1+Math.sin(i*.13)*.07)/2;
    positions.push(...p.clone().addScaledVector(side,w).add(v(0,-.08,0)).toArray(),...p.clone().addScaledVector(side,-w).add(v(0,-.08,0)).toArray());
    if(i<320){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const path=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.95,side:THREE.DoubleSide}));path.receiveShadow=true;parent.add(path);return path;
}

/** Rounded, closed terrain shared by the outdoor worlds. */
export function sculptedTerrain(
  parent: THREE.Group, radius: number, depth: number,
  height: (x: number, z: number) => number, palette: [string, string, string],
) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const rings = 60, sides = 140, low = new THREE.Color(palette[0]), high = new THREE.Color(palette[1]), cliff = new THREE.Color(palette[2]);
  for (let r = 0; r <= rings + 12; r++) {
    const under = Math.max(0, (r - rings) / 12);
    for (let s = 0; s <= sides; s++) {
      const a = s / sides * Math.PI * 2, edge = radius * (1 + .035 * Math.sin(a * 5) + .025 * Math.cos(a * 3));
      const distance = edge * (r <= rings ? r / rings : 1 - under * .22);
      const x = Math.cos(a) * distance, z = Math.sin(a) * distance * .85;
      const y = r <= rings ? height(x, z) : height(Math.cos(a) * edge, Math.sin(a) * edge * .85) - under * depth;
      positions.push(x, y, z);
      const color = r <= rings ? low.clone().lerp(high, THREE.MathUtils.clamp(y / 12, 0, 1)) : low.clone().lerp(cliff, Math.min(1, under * 1.6));
      colors.push(color.r, color.g, color.b);
      if (r < rings + 12 && s < sides) {
        const n = r * (sides + 1) + s;
        indices.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1);
      }
    }
  }
  // Close the underside; the center is hidden beneath the terrain.
  const center = positions.length / 3; positions.push(0, -depth, 0); colors.push(cliff.r, cliff.g, cliff.b);
  const lastRing = (rings + 12) * (sides + 1);
  for (let s = 0; s < sides; s++) indices.push(lastRing + s, center, lastRing + s + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94 }));
  mesh.receiveShadow = true; mesh.castShadow = true; parent.add(mesh); return mesh;
}

/** A continuous deck and its physical edges, all sampled from the walking curve. */
export function walkway(parent: THREE.Group, route: THREE.CatmullRomCurve3, width: number, color: string, edge: string, rail = false) {
  const points = route.getSpacedPoints(240), positions: number[] = [], indices: number[] = [];
  const sides = points.map((_, i) => {
    const direction = route.getTangentAt(i / 240); return v(direction.z, 0, -direction.x).normalize();
  });
  for (let i = 0; i < points.length; i++) {
    for (const [s, y] of [[1, -.1], [-1, -.1], [1, -.3], [-1, -.3]]) {
      positions.push(...points[i].clone().addScaledVector(sides[i], s * width / 2).add(v(0, y, 0)).toArray());
    }
    if (i < 240) {
      const n = i * 4;
      indices.push(n, n + 1, n + 4, n + 1, n + 5, n + 4,
        n, n + 4, n + 2, n + 2, n + 4, n + 6,
        n + 1, n + 3, n + 5, n + 3, n + 7, n + 5,
        n + 2, n + 6, n + 3, n + 3, n + 6, n + 7);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const deck = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .12 })); deck.receiveShadow = true; deck.castShadow = true; parent.add(deck);
  const trim = new THREE.MeshStandardMaterial({ color: edge, metalness: .5, roughness: .35, emissive: edge, emissiveIntensity: .12 });
  for (const side of [-1, 1]) {
    const edgePoints = points.map((p, i) => p.clone().addScaledVector(sides[i], side * (width / 2 - .06)).add(v(0, rail ? .62 : -.025, 0)));
    parent.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePoints), 240, .028, 6, false), trim));
  }
  const joints = new THREE.InstancedMesh(new THREE.BoxGeometry(width * .95, .022, .035), trim, 110);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 110; i++) {
    const p = route.getPointAt(i / 109), tangent = route.getTangentAt(i / 109);
    dummy.position.copy(p).add(v(0, -.08, 0)); dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0); dummy.updateMatrix(); joints.setMatrixAt(i, dummy.matrix);
  }
  parent.add(joints);
  if (rail) {
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.035, .05, .7, 6), trim, 62);
    for (let i = 0; i < 62; i++) {
      const t = Math.floor(i / 2) / 30, p = route.getPointAt(t), tangent = route.getTangentAt(t);
      dummy.rotation.set(0, 0, 0); dummy.position.copy(p).add(v(tangent.z, 0, -tangent.x).normalize().multiplyScalar((i % 2 ? 1 : -1) * (width / 2 - .06))).add(v(0, .27, 0));
      dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix);
    }
    parent.add(posts);
  }
  return deck;
}

export function trailLanterns(parent: THREE.Group, route: THREE.CatmullRomCurve3, width: number, color: string, count = 24) {
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .09, .65, 8), new THREE.MeshStandardMaterial({ color: '#5b625c', metalness: .5, roughness: .5 }), count);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 10, 8), new THREE.MeshBasicMaterial({ color }), count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1), tangent = route.getTangentAt(t), p = route.getPointAt(t);
    dummy.position.copy(p).add(v(tangent.z, 0, -tangent.x).normalize().multiplyScalar(width * (i % 2 ? .52 : -.52))).add(v(0, .22, 0));
    dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix); dummy.position.y += .38; dummy.updateMatrix(); lamps.setMatrixAt(i, dummy.matrix);
  }
  parent.add(posts, lamps);
}
