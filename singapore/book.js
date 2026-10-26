(() => {
  const $ = (s) => document.querySelector(s);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PI = Math.PI;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };

  const BOOK = window.PHOTOBOOK;
  if (!BOOK || !BOOK.spreads?.length || !(BOOK.pageWidth > 0) || !(BOOK.pageHeight > 0)) {
    $("#loadtext").textContent = "Configure book-data.js with page dimensions and at least one interior spread.";
    return;
  }
  document.title = BOOK.title + " — artist book";
  document.querySelectorAll(".book-title").forEach(el => { el.textContent = BOOK.title; });
  $("meta[name='description']").content = BOOK.title + " — an artist book in a tactile 3D hardcover reader.";

  // ---------- the physical book (1 unit = 10 cm) ----------
  const H = 2.0, W = H * BOOK.pageWidth / BOOK.pageHeight; // preserve artwork ratio
  const OH = 0.03;                   // board overhang, the "squares"
  const JNT = 0.014;                 // each board steps out this far from the spine when the book lies open
  const BW = W + OH, BH = H + 2 * OH;
  const BBW = BW - JNT;              // the board itself
  const BT = 0.02;                   // 2 mm greyboard with the printed wrap glued over it
  const BEV = 0.0045;                // wrapped board edges are rounded, never cut square
  const GROOVE = 0.062;              // the hinge groove pressed into the cover, from the spine
  const TURNIN = 0.024;              // how much of the wrap shows around the pastedown
  const PT = 0.0058;                 // fixed uncoated stock, preserving the default book geometry
  const HUMP = 0.011, HUMP_S = 0.07; // open pages arch out of the binding, then settle flat
  const RUN = 0.22;                  // stacked sheets fan up from the spine over this run
  const COLS = 48, ROWS = 22, DS = W / COLS;

  // Every visible face is an existing ImageGen leaf. Opening the front board reveals
  // the first spread; closing the back board follows the final spread.
  const SPEC = [
    { kind: "board", outside: BOOK.frontCover.file, inside: BOOK.spreads[0].left.file },
    ...BOOK.spreads.slice(0, -1).map((spread, i) => ({
      kind: "page", front: spread.right.file, back: BOOK.spreads[i + 1].left.file,
    })),
    { kind: "board", inside: BOOK.spreads.at(-1).right.file, outside: BOOK.backCover.file },
  ];
  const NL = SPEC.length;

  // One fixed uncoated stock; artwork already includes its printed paper texture.
  const SPREADS = ["Cover", ...BOOK.spreads.map((s, i) => "Pages " + (i * 2 + 1) + "–" + (i * 2 + 2)), "Back cover"];
  const DESCRIPTIONS = [BOOK.frontCover.alt, ...BOOK.spreads.map(s => s.left.alt + " " + s.right.alt), BOOK.backCover.alt];

  // ---------- renderer ----------
  const stage = $("#stage");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch (e) {
    $("#loadtext").textContent = "This book needs WebGL, which is turned off in this browser.";
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xe8e3da, 1);
  stage.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // warm desk lamp up and to the left, cool window fill from the right
  scene.add(new THREE.HemisphereLight(lin("#ffffff"), lin("#c5c1b9"), 0.7));
  const key = new THREE.DirectionalLight(lin("#ffffff"), 0.7);
  key.position.set(-2.7, 5.4, 2.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 14 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(lin("#ffffff"), 0.15);
  fill.position.set(3, 3, 1);
  scene.add(fill);

  // ---------- textures ----------
  const manager = new THREE.LoadingManager();
  const texLoader = new THREE.TextureLoader(manager);
  const failed = [];
  manager.onProgress = (url, n, total) => {
    $("#bar").style.width = Math.round((n / total) * 100) + "%";
    $("#loadtext").textContent = `Loading pages ${n} / ${total}`;
  };
  manager.onError = (url) => failed.push(url);
  function tex(url, srgb, repeat) {
    const t = texLoader.load(url);
    t.anisotropy = maxAniso;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }

  // Paper shader: the fibre height map lights the tooth (bump) and also
  // nudges the albedo, plus an ambient-occlusion falloff into the gutter.
  function paperMaterial(o) {
    const M = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const params = {
      color: o.color || new THREE.Color(1, 1, 1),
      roughness: o.roughness ?? 0.9, metalness: 0,
      bumpMap: o.bump || null, bumpScale: o.bumpScale ?? 0.02,
      side: o.side ?? THREE.FrontSide,
    };
    if (o.map) params.map = o.map;
    if (o.physical) Object.assign(params, { clearcoat: o.clearcoat ?? 0.3, clearcoatRoughness: o.clearcoatRoughness ?? 0.3 });
    const m = new M(params);
    const u = { uPaperAmt: { value: o.paperAmt ?? 0 }, uGutter: { value: 0 },
      uGroove: { value: o.groove ?? -1 }, uGrooveDir: { value: o.grooveDir ?? 1 } };
    const g = o.gutter || "";
    const grooved = o.groove != null;
    const wrapBlur = !!o.wrapBlur;
    m.userData.u = u;
    // Display finished artwork without lamp, stock tint, grain, or saturation changes.
    // The book geometry, sheet edges, shadows and turning mechanics remain physical.
    if (BOOK.faithfulDisplay && o.map) {
      m.dispose();
      const art = new THREE.MeshBasicMaterial({ map: o.map, side: o.side ?? THREE.FrontSide, toneMapped: false });
      art.userData.u = u;
      return art;
    }
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uPaperAmt = u.uPaperAmt;
      sh.uniforms.uGutter = u.uGutter;
      sh.uniforms.uGroove = u.uGroove;
      sh.uniforms.uGrooveDir = u.uGrooveDir;
      if (wrapBlur) {
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float aSide;\nvarying float vSide;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSide = aSide;");
      }
      if (g === "vS") {
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float aS;\nvarying float vS;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvS = aS;");
      }
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uPaperAmt;\nuniform float uGutter;\nuniform float uGroove;\nuniform float uGrooveDir;\n" + (g === "vS" ? "varying float vS;" : "") + (wrapBlur ? "\nvarying float vSide;" : ""))
        .replace("#include <map_fragment>", `${wrapBlur ? `
          // where the print turns over the board edge it softens instead of streaking
          vec4 texelColor = mapTexelToLinear( texture2D( map, vUv, vSide * 6.0 ) );
          diffuseColor *= texelColor;` : "#include <map_fragment>"}
          float paperH = texture2D( bumpMap, vUv ).r;
          diffuseColor.rgb *= 1.0 + uPaperAmt * ( paperH - 0.5 ) * 2.0;
          ${grooved ? `float gd = ( vUv.x - uGroove ) / 0.0028;
          float gr = ( vUv.x - uGroove - uGrooveDir * 0.0068 ) / 0.0045;
          diffuseColor.rgb *= 1.0 - 0.34 * exp( -gd * gd ) + 0.06 * exp( -gr * gr );` : ""}
          ${g ? `float gq = ${g};
          diffuseColor.rgb *= 1.0 - uGutter * ( 1.0 - smoothstep( 0.0, 0.2, gq ) ) * ( 0.6 + 0.4 * ( 1.0 - smoothstep( 0.0, 0.03, gq ) ) );` : ""}`);
    };
    if (wrapBlur) {
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh) => {
        prev(sh);
        // paper tooth would smear into streaks on the rounded edge, where the projection is stretched
        sh.fragmentShader = sh.fragmentShader.replace("#include <bumpmap_pars_fragment>",
          THREE.ShaderChunk.bumpmap_pars_fragment.replace(/bumpScale \* /g, "bumpScale * ( 1.0 - vSide ) * "));
      };
    }
    m.customProgramCacheKey = () => "paper|" + g + "|" + (o.physical ? 1 : 0) + "|" + (grooved ? 1 : 0) + (wrapBlur ? 1 : 0);
    return m;
  }

  // Finished artwork is displayed without extra surface texture or color treatment.
  function pageMaterial(map, side) {
    return new THREE.MeshBasicMaterial({ map, side, toneMapped: false });
  }

  // ---------- scene graph ----------
  const bookRoot = new THREE.Group();       // sits on the desk, slides to keep the book centred
  bookRoot.rotation.y = -0.018;
  const book = new THREE.Group();           // local frame: x across, y up the page, z out of the paper
  book.rotation.x = -PI / 2;
  bookRoot.add(book);
  scene.add(bookRoot);

  // desk: dark wool felt
  const feltTex = tex("assets/paper/felt.webp", false, [16, 16]);
  const desk = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    paperMaterial({ color: lin("#d8d3c9"), bump: feltTex, bumpScale: 0.006, paperAmt: 0.025, roughness: 1 })
  );
  desk.rotation.x = -PI / 2;
  desk.receiveShadow = true;
  scene.add(desk);

  // soft contact shadow right under the book
  const contact = (() => {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const x = c.getContext("2d");
    x.shadowColor = "rgba(0,0,0,1)";
    x.shadowBlur = 22;
    x.shadowOffsetX = 1000;
    x.fillRect(28 - 1000, 28, 200, 200);
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: t, color: 0x000000, transparent: true, opacity: 0.72, depthWrite: false }));
    m.position.z = 0.0008;
    book.add(m);
    return m;
  })();

  const EDGE_TINTS = ["#f6efe2", "#ece3d3", "#f9f2e6", "#e8dfcf", "#f3ebdd", "#e6dccb", "#f7f0e3", "#ebe2d2"];

  // a small seeded random, so every sheet keeps its own quirks between visits
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // the cut edge of a sheet: paper colour, a trace of the printed ink at the top,
  // and a shadow where it meets the sheet below
  function edgeMaterial(tint, map) {
    const m = new THREE.MeshStandardMaterial({ map, color: lin(tint), roughness: 0.96, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aT;\nvarying float vT;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvT = aT;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vT;")
        .replace("#include <map_fragment>", `
          vec4 inkC = mapTexelToLinear( texture2D( map, vUv ) );
          float inkAmt = 0.34 * ( 1.0 - smoothstep( 0.05, 0.6, vT ) );
          diffuseColor.rgb *= mix( vec3( 1.0 ), inkC.rgb, inkAmt );
          diffuseColor.rgb *= mix( 1.04, 0.42, smoothstep( 0.45, 1.0, vT ) );`);
    };
    m.customProgramCacheKey = () => "edge";
    return m;
  }

  // ---------- boards ----------
  // merge the extrusion's duplicate vertices so the rounded edge shades smoothly; the flat
  // faces stay separate so they keep a clean normal and a crisp print
  function smoothMerge(g) {
    const pos = g.attributes.position, seen = new Map(), verts = [], flat = [], index = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let f = 0; f < pos.count; f += 3) {
      a.fromBufferAttribute(pos, f); b.fromBufferAttribute(pos, f + 1); c.fromBufferAttribute(pos, f + 2);
      const nz = Math.abs(b.clone().sub(a).cross(c.clone().sub(a)).normalize().z);
      const cap = nz > 0.9999 && (Math.abs(a.z) < 1e-5 || Math.abs(a.z - BT) < 1e-5) ? 1 : 0;
      for (let i = f; i < f + 3; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const key = cap + ":" + Math.round(x * 1e5) + "," + Math.round(y * 1e5) + "," + Math.round(z * 1e5);
        let id = seen.get(key);
        if (id === undefined) { id = verts.length / 3; seen.set(key, id); verts.push(x, y, z); flat.push(cap); }
        index.push(id);
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    out.setAttribute("aSide", new THREE.Float32BufferAttribute(flat.map((f) => 1 - f), 1));
    out.setIndex(index);
    return out;
  }
  function boardGeometry(outsideUp) {
    const x0 = BEV, x1 = BBW - BEV, y0 = -BH / 2 + BEV, y1 = BH / 2 - BEV, r = 0.006;
    const sh = new THREE.Shape();
    sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r);
    sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1);
    sh.lineTo(x0 + r, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - r);
    sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
    let g = new THREE.ExtrudeGeometry(sh, { depth: BT - 2 * BEV, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 5, curveSegments: 4 });
    g.translate(0, 0, BEV);
    g = smoothMerge(g);
    // the print is wrapped round the board, so project it straight down: edges carry the image's border
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const u = clamp(p.getX(i) / BBW, 0, 1);
      uv[i * 2] = outsideUp ? u : 1 - u;
      uv[i * 2 + 1] = clamp((p.getY(i) + BH / 2) / BH, 0, 1);
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  // endpaper pasted inside the board, leaving the wrap's turn-in showing round three sides
  function pastedownGeometry(onBottom) {
    const pw = W, ph = H; // preserve the artwork’s exact 3:4 aspect ratio
    const g = new THREE.PlaneGeometry(pw, ph, 12, 1);
    if (onBottom) g.rotateY(PI);
    g.translate(0.004 + pw / 2, 0, onBottom ? -0.00035 : BT + 0.00035);
    const p = g.attributes.position, aS = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) aS[i] = p.getX(i) / BBW;
    g.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
    return g;
  }

  const clothTex = tex("assets/paper/cloth.webp", false, [3, 46]);
  const clothMat = new THREE.MeshStandardMaterial({ color: lin("#161514"), roughness: 0.82, bumpMap: clothTex, bumpScale: 0.012, side: THREE.DoubleSide });

  function leafGeometry() {
    const front = new THREE.PlaneGeometry(W, H, COLS, ROWS);
    const n = (COLS + 1) * (ROWS + 1);
    const aS = new Float32Array(n);
    for (let iy = 0; iy <= ROWS; iy++) for (let ix = 0; ix <= COLS; ix++) aS[iy * (COLS + 1) + ix] = ix / COLS;
    front.setAttribute("aS", new THREE.BufferAttribute(aS, 1));
    front.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const back = new THREE.BufferGeometry();
    back.setIndex(front.index);
    back.setAttribute("position", front.attributes.position);
    back.setAttribute("normal", front.attributes.normal);
    back.setAttribute("aS", front.attributes.aS);
    const uv = front.attributes.uv.array.slice();
    for (let k = 0; k < uv.length; k += 2) uv[k] = 1 - uv[k];   // the back of a sheet is its mirror
    back.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return { front, back };
  }

  // the cut edge of a sheet: head, tail and fore-edge strips, one paper thick
  const RIB_N = 2 * (COLS + 1) + (ROWS + 1);
  function ribbonGeometry() {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(RIB_N * 2 * 3), uv = new Float32Array(RIB_N * 2 * 2), idx = [];
    const strip = (start, n) => { for (let a = 0; a < n - 1; a++) { const p = (start + a) * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); } };
    strip(0, COLS + 1); strip(COLS + 1, COLS + 1); strip(2 * (COLS + 1), ROWS + 1);
    for (let v = 0; v < RIB_N; v++) { uv[v * 4] = 0; uv[v * 4 + 1] = 1; uv[v * 4 + 2] = 0; uv[v * 4 + 3] = 0; }
    const aT = new Float32Array(RIB_N * 2);
    for (let v = 0; v < RIB_N; v++) aT[v * 2 + 1] = 1;
    g.setIndex(idx);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    return g;
  }

  function faceMap(face) {
    return tex("assets/pages/" + face, true);
  }

  const leaves = SPEC.map((sp, i) => {
    const L = { i, kind: sp.kind, t: 0, te: 0, target: 0, anim: null, dir: 1, dragging: false,
      peek: 0, peekTarget: 0, curl: 0, curlTarget: 0, grabY: -0.55, sig: "" };
    if (sp.kind === "page") {
      const geo = leafGeometry();
      L.geo = geo.front;
      L.maps = [faceMap(sp.front), faceMap(sp.back)];
      L.lu = { uOff: { value: new THREE.Vector2(0, 0) }, uGutter: { value: 0 } };
      L.mats = [pageMaterial(L.maps[0], THREE.FrontSide), pageMaterial(L.maps[1], THREE.BackSide)];
      // no two sheets are trimmed or lie exactly alike
      const rnd = rng(9001 + i * 131);
      L.ds = DS * (1 + (rnd() - 0.5) * 0.0032);
      L.dy = (rnd() - 0.5) * 0.0034;
      const amp = 0.004 + 0.017 * rnd(), k1 = 1.5 + 3 * rnd(), k2 = 5 + 6 * rnd(), ph1 = rnd() * 6.28, ph2 = rnd() * 6.28;
      L.wave = new Float32Array(ROWS + 1);
      for (let iy = 0; iy <= ROWS; iy++) {
        const yy = iy / ROWS;
        L.wave[iy] = amp * clamp(0.55 + 0.35 * Math.sin(yy * k1 * 6.28 + ph1) + 0.15 * Math.sin(yy * k2 * 6.28 + ph2), 0.1, 1);
      }
      L.meshes = [new THREE.Mesh(geo.front, L.mats[0]), new THREE.Mesh(geo.back, L.mats[1])];
      for (const m of L.meshes) { m.frustumCulled = false; m.receiveShadow = true; book.add(m); }
      const em = edgeMaterial(EDGE_TINTS[i % EDGE_TINTS.length], L.maps[0]);
      L.edgeBase = em.color.clone();
      L.rib = ribbonGeometry();
      L.edge = new THREE.Mesh(L.rib, em);
      L.edge.frustumCulled = false;
      L.edge.castShadow = L.edge.receiveShadow = true;
      book.add(L.edge);
    } else {
      const front = i === 0;
      const cover = paperMaterial({ map: tex("assets/pages/" + sp.outside, true), bumpScale: 0.003, paperAmt: 0.0,
        roughness: 0.46, physical: true, clearcoat: 0.38, clearcoatRoughness: 0.3,
        groove: front ? GROOVE / BBW : 1 - GROOVE / BBW, grooveDir: front ? 1 : -1, wrapBlur: true });
      const mesh = new THREE.Mesh(boardGeometry(front), cover);
      mesh.castShadow = mesh.receiveShadow = true;
      const ep = paperMaterial({ map: faceMap(sp.inside), bumpScale: 0.0085, paperAmt: 0.06, roughness: 0.88, gutter: "vS" });
      const paste = new THREE.Mesh(pastedownGeometry(front), ep);
      paste.receiveShadow = true;
      L.group = new THREE.Group();
      L.group.add(mesh, paste);
      L.ep = ep;
      book.add(L.group);
    }
    return L;
  });

  // spine: black book cloth bridging the two boards, re-shaped every frame
  const SPS = 14;
  const spineGeo = new THREE.PlaneGeometry(1, BH, SPS, 1);
  spineGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const spine = new THREE.Mesh(spineGeo, clothMat);
  spine.frustumCulled = false;
  spine.castShadow = spine.receiveShadow = true;
  book.add(spine);

  // ---------- page physics (well, kinematics) ----------
  const phiR = new Float32Array(COLS), phiL = new Float32Array(COLS), gS = new Float32Array(COLS),
    prof = new Float32Array(COLS), humpD = new Float32Array(COLS), eShape = new Float32Array(COLS);
  const PEXP = 2.2;
  for (let ix = 0; ix < COLS; ix++) {
    const s = (ix + 0.5) * DS, u = s / RUN, q = s / HUMP_S;
    prof[ix] = u < 1 ? (PEXP * Math.pow(1 - u, PEXP - 1)) / RUN : 0;   // slope of 1-(1-u)^p
    humpD[ix] = ((1 - q) * Math.exp(1 - q)) / HUMP_S;                   // slope of q*e^(1-q)
    eShape[ix] = smooth((s - 0.8 * W) / (0.2 * W));
    // The binding holds the inner sheet in place; grow the corner curl outside
    // it so the negative curl slope cannot cut into the page underneath.
    gS[ix] = ((s / W) * (s / W) - 0.33) * smooth(s / RUN);
  }
  const riseF = (x) => { const u = clamp(Math.abs(x) / RUN, 0, 1); return 1 - Math.pow(1 - u, PEXP); };
  const humpF = (x) => { const q = Math.abs(x) / HUMP_S; return q * Math.exp(1 - q); };

  function deformPage(L, hR, hL, BR, BL) {
    const t = L.te, sinT = Math.sin(PI * t);
    const AR = 0.88 * hR, AL = 0.88 * hL;
    const sig = [t, L.curl, L.grabY, AR, AL, BR, BL].map((v) => v.toFixed(5)).join();
    if (sig === L.sig) return;
    L.sig = sig;
    const h = hR + (hL - hR) * t;
    const z0 = BT + 0.12 * h;
    const moving = t > 1e-4 && t < 1 - 1e-4;
    for (let ix = 0; ix < COLS; ix++) {
      phiR[ix] = AR * prof[ix] + BR * humpD[ix];
      phiL[ix] = PI - (AL * prof[ix] + BL * humpD[ix]);
    }
    const pos = L.geo.attributes.position.array;
    // the surface of the stack this sheet would land on, so a moving sheet never dips into it
    const floorAt = (x) => x > 0 ? BT + 0.12 * hR + AR * riseF(x) + BR * humpF(x) - PT
                                 : BT + 0.12 * hL + AL * riseF(x) + BL * humpF(x) - PT;
    for (let iy = 0; iy <= ROWS; iy++) {
      const y = H / 2 - (iy * H) / ROWS + L.dy;
      const prox = 1 - Math.abs(y - L.grabY) / H;
      const cr = L.curl * (0.5 + prox * prox) * sinT;   // the grabbed corner leads
      const wv = L.wave[iy];                             // this sheet's own slight cockle at the fore-edge
      let x = 0, z = z0;
      let k = iy * (COLS + 1) * 3;
      for (let ix = 0; ix <= COLS; ix++, k += 3) {
        let zz = z;
        if (moving) zz = Math.max(zz, floorAt(x));
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = zz;
        if (ix === COLS) break;
        const e = wv * eShape[ix];
        const phi = (1 - t) * (phiR[ix] + e) + t * (phiL[ix] - e) + cr * gS[ix];
        x += L.ds * Math.cos(phi);
        z += L.ds * Math.sin(phi);
      }
    }
    L.geo.attributes.position.needsUpdate = true;
    L.geo.computeVertexNormals();

    const nrm = L.geo.attributes.normal.array;
    const rp = L.rib.attributes.position.array, ru = L.rib.attributes.uv.array;
    const up = t < 0.5;
    const sg = up ? -1 : 1;                // thickness hangs below whichever face is up
    L.edge.material.map = L.maps[up ? 0 : 1];
    let w = 0, wu = 0;
    const put = (k) => {
      const k3 = k * 3, px = pos[k3], py = pos[k3 + 1], pz = pos[k3 + 2];
      rp[w++] = px; rp[w++] = py; rp[w++] = pz;
      rp[w++] = px + sg * nrm[k3] * PT; rp[w++] = py + sg * nrm[k3 + 1] * PT; rp[w++] = pz + sg * nrm[k3 + 2] * PT;
      // sample the print right at the sheet's border, so the cut edge carries a trace of the ink
      const ix = k % (COLS + 1), iy = (k - ix) / (COLS + 1);
      let u = clamp(ix / COLS, 0.004, 0.996);
      if (!up) u = 1 - u;
      const v = clamp(1 - iy / ROWS, 0.004, 0.996);
      ru[wu] = u; ru[wu + 1] = v; ru[wu + 2] = u; ru[wu + 3] = v;
      wu += 4;
    };
    for (let ix = 0; ix <= COLS; ix++) put(ix);
    for (let ix = 0; ix <= COLS; ix++) put(ROWS * (COLS + 1) + ix);
    for (let iy = 0; iy <= ROWS; iy++) put(iy * (COLS + 1) + COLS);
    L.rib.attributes.position.needsUpdate = true;
    L.rib.attributes.uv.needsUpdate = true;
    L.rib.computeVertexNormals();
  }

  // ---------- state ----------
  const easeInOutSine = (p) => -(Math.cos(PI * p) - 1) / 2;
  const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
  const spreadIndex = () => leaves.reduce((n, L) => n + (L.target === 1 ? 1 : 0), 0);
  let needsRender = true;
  let interacted = false;

  function turn(L, to, o = {}) {
    if (L.target === to && !L.anim && L.t === to) return;
    L.t = L.te; L.peek = 0; L.peekTarget = 0;
    const dist = Math.abs(to - L.t);
    if (dist < 1e-4) { L.t = to; L.target = to; L.anim = null; return; }
    L.dir = to > L.t ? 1 : -1;
    L.target = to;
    if (o.grabY != null) L.grabY = o.grabY;
    const board = L.kind === "board";
    let dur = o.dur ?? (board ? 1.25 : 1.05) * (0.25 + 0.75 * dist);
    if (reduceMotion) dur = Math.min(dur, 0.35);
    L.anim = { from: L.t, to, start: performance.now(), delay: o.delay || 0, dur,
      ease: o.ease || (board ? easeInOutCubic : easeInOutSine) };
    updateUI();
  }
  function topRight() {
    const L = leaves.find((l) => l.target === 0);
    return L && !L.anim && !L.dragging ? L : null;
  }
  function topLeft() {
    let L = null;
    for (const l of leaves) if (l.target === 1) L = l;
    return L && !L.anim && !L.dragging ? L : null;
  }
  function next(grabY) { const L = leaves.find((l) => l.target === 0); if (L && !L.dragging) { turn(L, 1, { grabY: grabY ?? -0.6 }); noteInteraction(); } }
  function prev(grabY) { let L = null; for (const l of leaves) if (l.target === 1) L = l; if (L && !L.dragging) { turn(L, 0, { grabY: grabY ?? -0.6 }); noteInteraction(); } }
  function goTo(k) {
    const cur = spreadIndex();
    const stag = reduceMotion ? 0 : 0.11;
    if (k > cur) for (let j = cur; j < k; j++) turn(leaves[j], 1, { delay: (j - cur) * stag, dur: leaves[j].kind === "board" ? 1.0 : 0.8, grabY: -0.5 });
    if (k < cur) for (let j = cur - 1; j >= k; j--) turn(leaves[j], 0, { delay: (cur - 1 - j) * stag, dur: leaves[j].kind === "board" ? 1.0 : 0.8, grabY: -0.5 });
    noteInteraction();
  }

  // ---------- per-frame update ----------
  const cam = { dist: 0, el: 1, az: 0, azT: 0, elJ: 0, elJT: 0, off: 0 };
  let fitW = 0;

  function update(dt, now) {
    let busy = false;
    for (const L of leaves) {
      if (L.anim) {
        busy = true;
        const a = L.anim, e = (now - a.start) / 1000 - a.delay;
        if (e >= 0) {
          const p = Math.min(1, e / a.dur);
          L.t = a.from + (a.to - a.from) * a.ease(p);
          if (L.kind === "page") {
            const pp = L.dir > 0 ? L.t : 1 - L.t;
            L.curlTarget = L.dir * 2.3 * (0.55 - pp);   // edge leads as it lifts, trails as it falls
          }
          if (p >= 1) {
            L.t = a.to; L.anim = null; L.curlTarget = 0;
          }
        }
      }
      const pk = L.peek + (L.peekTarget - L.peek) * Math.min(1, dt * 9);
      if (Math.abs(pk - L.peek) > 1e-5) busy = true;
      L.peek = pk;
      const c = L.curl + (L.curlTarget - L.curl) * Math.min(1, dt * 8);
      if (Math.abs(c - L.curl) > 1e-5) busy = true;
      L.curl = c;
      const atRest = !L.anim && !L.dragging;
      const side = L.t < 0.5 ? 1 : -1;
      L.te = clamp(L.t + (atRest ? side * L.peek : 0), 0, 1);
    }

    // stack heights
    const te = leaves.map((L) => L.te);
    const BR = HUMP * te[0], BL = HUMP * (1 - te[NL - 1]);
    const jOpen = JNT * te[0] * (1 - te[NL - 1]);
    let pagesR = 0, pagesL = 0;
    for (let i = 1; i < NL - 1; i++) { pagesR += PT * (1 - te[i]); pagesL += PT * te[i]; }
    for (const L of leaves) {
      const i = L.i;
      if (L.kind === "page") {
        let hR = PT / 2, hL = PT / 2;
        for (let j = i + 1; j < NL - 1; j++) hR += PT * (1 - te[j]);
        for (let j = 1; j < i; j++) hL += PT * te[j];
        deformPage(L, hR, hL, BR, BL);
        const s = Math.sin(PI * L.te);
        const g = 0.36 * Math.pow(1 - s, 3);
        L.lu.uGutter.value = g;
        const moving = L.te > 1e-4 && L.te < 1 - 1e-4;
        L.meshes[0].castShadow = L.meshes[1].castShadow = moving;
      } else {
        let zR, zL;
        if (i === 0) { zR = BT * (1 - te[NL - 1]) + pagesR + 0.0006; zL = 0; }
        else { zR = 0; zL = BT * te[0] + pagesL + 0.0006; }
        const zh = zR + (zL + BT - zR) * L.te;
        L.hx = i === 0 ? -jOpen : jOpen;
        L.group.position.set(L.hx, 0, zh);
        L.group.rotation.y = -PI * L.te;
        L.ep.userData.u.uGutter.value = 0.3 * Math.pow(1 - Math.sin(PI * L.te), 3);
        L.hinge = zh;
      }
    }

    // spine follows both boards
    {
      const f = leaves[0], b = leaves[NL - 1];
      // where each board's outer face begins at the hinge
      const a0 = PI * f.te, a9 = PI * b.te;
      const F = [f.hx + BEV * Math.cos(a0) - BT * Math.sin(a0), f.hinge + BEV * Math.sin(a0) + BT * Math.cos(a0)];
      const B = [b.hx + BEV * Math.cos(a9), b.hinge + BEV * Math.sin(a9)];
      const dx = B[0] - F[0], dz = B[1] - F[1], len = Math.hypot(dx, dz);
      const nx = len > 1e-6 ? dz / len : -1, nz = len > 1e-6 ? -dx / len : 0;
      const bulge = 0.34 * len;
      const C = [(F[0] + B[0]) / 2 + nx * bulge, Math.max(0.0006, (F[1] + B[1]) / 2 + nz * bulge)];
      F[1] = Math.max(0.0006, F[1]); B[1] = Math.max(0.0006, B[1]);
      const p = spineGeo.attributes.position.array;
      for (let row = 0; row <= 1; row++) {
        const y = row === 0 ? BH / 2 : -BH / 2;
        for (let s = 0; s <= SPS; s++) {
          const u = s / SPS, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
          const k = (row * (SPS + 1) + s) * 3;
          p[k] = w0 * F[0] + w1 * C[0] + w2 * B[0];
          p[k + 1] = y;
          p[k + 2] = w0 * F[1] + w1 * C[1] + w2 * B[1];
        }
      }
      spineGeo.attributes.position.needsUpdate = true;
      spineGeo.computeVertexNormals();
      spine.visible = len > 0.001;
    }

    // contact shadow footprint
    const xmin = -BW * te[0], xmax = BW * (1 - te[NL - 1]);
    contact.position.x = (xmin + xmax) / 2;
    contact.scale.set(xmax - xmin + 0.34, BH + 0.34, 1);

    // camera + centring follow the settled state, so dragging never moves the book under the hand
    // while a hand holds a page, frame the settled state so the book never moves under the pointer;
    // otherwise frame what is actually on the desk, so a riffle stays in view
    const k = spreadIndex();
    const held = leaves.some((L) => L.dragging);
    const offT = held ? (k === 0 ? -BW / 2 : k === NL ? BW / 2 : 0) : -(xmin + xmax) / 2;
    const wT = held ? (k === 0 || k === NL ? BW : 2 * BW) : xmax - xmin;
    const r = Math.min(1, dt * 3.2);
    const prevOff = cam.off, prevW = fitW;
    cam.off += (offT - cam.off) * r;
    fitW += (wT - fitW) * r;
    cam.az += (cam.azT - cam.az) * Math.min(1, dt * 3);
    cam.elJ += (cam.elJT - cam.elJ) * Math.min(1, dt * 3);
    if (Math.abs(cam.off - prevOff) > 1e-5 || Math.abs(fitW - prevW) > 1e-5 || Math.abs(cam.azT - cam.az) > 1e-5 || Math.abs(cam.elJT - cam.elJ) > 1e-5) busy = true;
    bookRoot.position.x = cam.off;
    placeCamera();
    return busy;
  }

  let vw = 1, vh = 1;
  function placeCamera() {
    const aspect = vw / vh;
    const el = (aspect < 0.85 ? 1.2 : 1.0) + cam.elJ;
    const vt = Math.tan((camera.fov * PI) / 360);
    const usable = clamp((vh - 230) / vh, 0.45, 0.86);
    const dW = (fitW / 2 + 0.16) / (vt * aspect);
    const dH = ((BH * Math.sin(el) + 0.12) / 2) / (vt * usable);
    const dist = Math.max(dW, dH) * 1.08;
    camera.position.set(Math.sin(cam.az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(cam.az) * Math.cos(el) * dist);
    camera.lookAt(0, 0.04, 0);
  }

  function resize() {
    vw = stage.clientWidth || window.innerWidth;
    vh = stage.clientHeight || window.innerHeight;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    // lift the frame a little so the book sits clear of the bottom dock
    camera.setViewOffset(vw, vh, 0, Math.round(vh < 600 ? 18 : 26), vw, vh);
    camera.updateProjectionMatrix();
    needsRender = true;
  }
  window.addEventListener("resize", resize);

  // ---------- pointer ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.06);
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(deskPlane, hit)) return null;
    return book.worldToLocal(hit);
  }
  const onBook = (p) => p && Math.abs(p.y) <= BH / 2 && Math.abs(p.x) <= BW;
  let drag = null, peekLeaf = null;

  function setPeek(L, grabY, side) {
    if (peekLeaf && peekLeaf !== L) { peekLeaf.peekTarget = 0; peekLeaf.curlTarget = 0; }
    peekLeaf = L;
    if (!L) return;
    L.peekTarget = L.kind === "board" ? 0.022 : 0.04;
    L.grabY = clamp(grabY, -H / 2, H / 2);
    if (L.kind === "page") L.curlTarget = side * 2.4 * 1;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const p = pick(e);
    if (!onBook(p)) return;
    const side = p.x >= 0 ? 1 : -1;
    const L = side > 0 ? topRight() : topLeft();
    if (!L) return;
    setPeek(null);
    L.t = L.te; L.peek = 0; L.peekTarget = 0;
    L.grabY = clamp(p.y, -H / 2, H / 2);
    L.dir = side;
    drag = { L, side, x0: p.x, sx: e.clientX, sy: e.clientY, moved: false, lastT: L.t, lastTime: performance.now(), vel: 0 };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = pick(e);
    if (e.pointerType === "mouse" && !drag) {
      cam.azT = ((e.clientX / vw) - 0.5) * 0.05;
      cam.elJT = ((e.clientY / vh) - 0.5) * -0.03;
    }
    if (drag) {
      const { L, side } = drag;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
        drag.moved = true; L.dragging = true; noteInteraction();
      }
      if (!drag.moved || !p) return;
      const t = side > 0 ? clamp((drag.x0 - p.x) / (drag.x0 + W), 0, 1) : 1 - clamp((p.x - drag.x0) / (W - drag.x0), 0, 1);
      const now = performance.now(), dtm = Math.max(1, now - drag.lastTime);
      drag.vel = 0.7 * drag.vel + 0.3 * (((t - drag.lastT) / dtm) * 1000);
      drag.lastT = t; drag.lastTime = now;
      L.t = t;
      L.grabY = clamp(p.y, -H / 2, H / 2);
      if (L.kind === "page") L.curlTarget = side * 1.15;
      needsRender = true;
      return;
    }
    // hover: lift the corner a touch, like a thumb on the fore-edge
    if (onBook(p)) {
      const nearR = p.x > W - 0.34, nearL = p.x < -W + 0.34;
      const L = nearR ? topRight() : nearL ? topLeft() : null;
      setPeek(L, p.y, nearR ? 1 : -1);
      canvas.style.cursor = (p.x >= 0 ? topRight() : topLeft()) ? "grab" : "default";
    } else {
      setPeek(null);
      canvas.style.cursor = "default";
    }
    needsRender = true;
  });

  function endDrag(e) {
    if (!drag) return;
    const { L, side, moved } = drag;
    L.dragging = false;
    canvas.style.cursor = "grab";
    if (!moved) {
      const p = pick(e);
      turn(L, side > 0 ? 1 : 0, { grabY: p ? clamp(p.y, -H / 2, H / 2) : -0.6 });
      noteInteraction();
    } else {
      const proj = L.t + drag.vel * 0.14;
      const to = side > 0 ? (proj > 0.45 ? 1 : 0) : (proj < 0.55 ? 0 : 1);
      L.target = side > 0 ? 0 : 1;   // so turn() always animates from where the hand let go
      turn(L, to, { ease: easeOutCubic, dur: (L.kind === "board" ? 0.5 : 0.35) + 0.75 * Math.abs(to - L.t) });
    }
    drag = null;
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", (e) => { if (!drag) { setPeek(null); cam.azT = 0; cam.elJT = 0; } });

  window.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("button") && (e.key === " " || e.key === "Enter")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); goTo(0); }
    else if (e.key === "End") { e.preventDefault(); goTo(NL); }
  });
  $("#next").addEventListener("click", () => next());
  $("#prev").addEventListener("click", () => prev());

  // ---------- UI ----------
  const dots = $("#dots");
  SPREADS.forEach((name, k) => {
    const b = document.createElement("button");
    b.className = "dot"; b.type = "button";
    b.setAttribute("aria-label", "Go to " + name);
    b.title = name;
    b.addEventListener("click", () => goTo(k));
    dots.appendChild(b);
  });
  let lastK = -1;
  function updateUI() {
    const k = spreadIndex();
    if (k === lastK) return;
    lastK = k;
    $("#label").textContent = SPREADS[k];
    $("#live").textContent = SPREADS[k] + ". " + DESCRIPTIONS[k];
    stage.setAttribute("aria-label", BOOK.title + ". " + SPREADS[k] + ". " + DESCRIPTIONS[k]);
    stage.dataset.spread = String(k);
    stage.dataset.left = k === 0 ? "" : k === NL ? BOOK.backCover.file : BOOK.spreads[k - 1].left.file;
    stage.dataset.right = k === 0 ? BOOK.frontCover.file : k === NL ? "" : BOOK.spreads[k - 1].right.file;
    const currentId = k === 0 ? "cover" : k === NL ? "back" : BOOK.spreads[k - 1].id;
    stage.dataset.artwork = currentId;
    history.replaceState(null, "", "#" + currentId);
    $("#prev").disabled = k === 0;
    $("#next").disabled = k === NL;
    [...dots.children].forEach((d, i) => d.setAttribute("aria-current", String(i === k)));
    needsRender = true;
  }
  function noteInteraction() {
    if (interacted) return;
    interacted = true;
    $("#hint").classList.add("gone");
  }

  function boot(data) {
    const k = clamp((data && data.k) | 0, 0, NL);
    leaves.forEach((L, i) => { L.t = L.te = L.target = i < k ? 1 : 0; });
    updateUI();
    update(0, performance.now());
    cam.off = k === 0 ? -BW / 2 : k === NL ? BW / 2 : 0;
    fitW = k === 0 || k === NL ? BW : 2 * BW;
    resize();
    requestAnimationFrame(loop);
  }

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const busy = update(dt, now);
    if (busy || needsRender) { renderer.render(scene, camera); needsRender = false; }
  }

  // All artwork is supplied as finished generated pages; wait for UI fonts and textures.
  let texturesDone = false, fontsDone = false;
  function reveal() {
    if (!texturesDone || !fontsDone) return;
    needsRender = true;
    if (failed.length) {
      $("#loadtext").textContent = `${failed.length} page image${failed.length > 1 ? "s" : ""} could not load. Reload to try again.`;
      return;
    }
    setTimeout(() => { $("#loader").classList.add("done"); $("#loader").setAttribute("aria-hidden", "true"); }, 120);
  }
  manager.onLoad = () => { texturesDone = true; reveal(); };
  const fontWait = document.fonts
    ? Promise.all([document.fonts.load("500 14px Oswald"), document.fonts.load("400 11px Oswald")])
    : Promise.resolve();
  Promise.race([fontWait, new Promise((r) => setTimeout(r, 3500))]).catch(() => {}).then(() => { fontsDone = true; reveal(); });

  const requestedId = decodeURIComponent(location.hash.slice(1));
  const requestedIndex = requestedId === "back" ? NL : BOOK.spreads.findIndex(s => s.id === requestedId) + 1;
  boot({ k: requestedIndex });
})();
