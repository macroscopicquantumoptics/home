// Home page picture: two 3D models you can turn and zoom, picked with the dots and arrows at the bottom of the picture.
//   trap:   the dark optical trap, a standing wave whose intensity is drawn as height, with a particle in the dark spot
//   cavity: molecules between two microcavity mirrors, after the figure in Shishkov et al., PRL 133, 186903 (2024)
//   bench:  a polariton condensate forming on the optical table as the pump power grows, after Ho et al., arXiv:2601.15080
//   pairs: a double-resonant cavity emitting entangled IR and visible photons, after Fig. 1 of Shishkov et al., arXiv:2508.10809
// three.js is bundled in assets/vendor/three (MIT licence), so the page still makes no outside requests.
// Without WebGL nothing changes: the video in .hero-media stays.
import * as THREE from "three";
import { OrbitControls } from "./vendor/three/controls/OrbitControls.js";
import { EffectComposer } from "./vendor/three/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/three/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/three/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/three/postprocessing/OutputPass.js";
import { ShaderPass } from "./vendor/three/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "./vendor/three/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "./vendor/three/geometries/RoundedBoxGeometry.js";

const hero = document.querySelector(".hero");
const media = hero && hero.querySelector(".hero-media");
const picker = document.querySelector(".hero-pick");
const ORDER = ["trap", "cavity", "bench", "pairs"];
const BUILD = { trap: trapModel, cavity: cavityModel, bench: benchModel, pairs: pairsModel };
if (media) start();

function start() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch (e) {
    return; // no WebGL: keep the video
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  // soft shadows from one key light per model: one extra depth pass of a few dozen objects a frame
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  media.appendChild(canvas);

  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !still.matches;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  // one finger: sideways turns the model, up and down still scrolls the page
  canvas.style.touchAction = "pan-y";
  // the wheel scrolls the page; it zooms only with Ctrl or Cmd held (a trackpad pinch sends Ctrl)
  // and a plain scroll over the picture briefly says how to zoom
  const tip = document.createElement("p");
  tip.className = "hero-tip";
  tip.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "Hold ⌘ and scroll, or pinch, to zoom" : "Hold Ctrl and scroll to zoom";
  media.appendChild(tip);
  let tipTimer = 0;
  media.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) return;
    e.stopPropagation();
    tip.classList.add("on");
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => tip.classList.remove("on"), 1200);
  }, { capture: true });
  // double-click goes back to the starting view
  canvas.addEventListener("dblclick", () => { resetView(); frame(); });

  // the composer draws into its own target, which needs its own multisampling or every edge comes out jagged
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  const renderPass = new RenderPass(new THREE.Scene(), camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.72);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  // a soft vignette, darker towards the corners, as a lens gives
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main() { vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; c.rgb *= 1.0 - 0.45 * smoothstep(0.25, 0.75, length(d * vec2(1.2, 1.0))); gl_FragColor = c; }`,
  }));
  composer.addPass(new OutputPass());

  const models = {};
  let current = null, shown = "trap";

  function show(name) {
    if (!models[name]) models[name] = BUILD[name](renderer);
    current = models[name];
    shown = name;
    renderPass.scene = current.scene;
    bloom.strength = current.bloom;
    resetView();
    resize();
    if (picker) {
      picker.querySelectorAll("[data-scene]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scene === name)));
    }
    media.querySelectorAll(".hero-paper[data-for]").forEach((p) => { p.hidden = p.dataset.for !== name; });
    frame();
  }

  function resetView() {
    const v = current.view;
    camera.position.set(...v.position);
    controls.target.set(...v.target);
    controls.minDistance = v.near;
    controls.maxDistance = v.far;
    controls.maxPolarAngle = v.maxPolar || Math.PI;
    controls.screenSpacePanning = !v.maxPolar; // with a floor, panning slides along it rather than through it
    controls.update();
  }

  // on wide screens the title sits over the left side, so the model is drawn a little to the right
  function resize() {
    const w = media.clientWidth, h = media.clientHeight;
    if (!w || !h || !current) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    const shift = w > 900 ? -current.view.shift * w : 0;
    camera.setViewOffset(w, h, shift, 0, w, h);
    camera.updateProjectionMatrix();
    frame();
  }
  new ResizeObserver(resize).observe(media);

  let t = 0, last = performance.now(), visible = true, raf = 0;
  function frame() {
    if (!current) return;
    controls.update();
    current.update(t);
    composer.render();
  }
  function loop(now) {
    raf = 0;
    if (!visible || document.hidden || still.matches) return;
    t += Math.min(now - last, 100) / 1000;
    last = now;
    frame();
    raf = requestAnimationFrame(loop);
  }
  function run() {
    if (!raf && visible && !document.hidden && !still.matches) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }
  // with reduced motion nothing moves by itself, and the picture redraws only when someone turns it
  controls.addEventListener("change", () => { if (still.matches) frame(); });
  still.addEventListener("change", () => { controls.enableDamping = !still.matches; run(); frame(); });
  document.addEventListener("visibilitychange", run);
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; run(); }).observe(media);

  if (picker) {
    picker.hidden = false;
    picker.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const step = Number(b.dataset.step) || 0;
      show(b.dataset.scene || ORDER[(ORDER.indexOf(shown) + step + ORDER.length) % ORDER.length]);
    });
  }

  show("trap");
  media.classList.add("live");
  const video = media.querySelector("video");
  if (video) video.pause();
  run();
}

// ---------- dark optical trap ----------
// Two counter-propagating beams, each a sum of the Gaussian mode and the first radial Laguerre-Gauss mode
// with opposite sign: they cancel at the focus (the dark spot) and add up away from it. Their standing wave
// gives the fringes; the intensity in the plane through the beam axis is drawn as height.
function trapModel(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const L = 30, X = 6;            // half length along the axis, half width across it
  const NZ = 1000, NX = 200;      // grid points
  const k = Math.PI / 1.05;       // fringe spacing 1.05
  const zR = 9, w0 = 1.3;         // Rayleigh range and waist, drawn rather than to scale
  const geo = new THREE.PlaneGeometry(2 * L, 2 * X, NZ - 1, NX - 1);
  geo.rotateX(-Math.PI / 2);      // plane in x (axis) and z (across), height along y
  const pos = geo.attributes.position;
  const I = new Float32Array(pos.count);
  let peak = 0;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getX(i), r = pos.getZ(i);
    const w2 = w0 * w0 * (1 + (z / zR) ** 2);
    const invR = z / (z * z + zR * zR);          // 1 / radius of curvature
    const psi = Math.atan(z / zR);               // Gouy phase
    const g = Math.exp(-r * r / w2) * w0 / Math.sqrt(w2);
    const curv = k * r * r * invR / 2;
    // U = LG00 - LG10, LG10 carries (1 - 2 r^2 / w^2) and three times the Gouy phase
    const a = 1, b = -(1 - 2 * r * r / w2);
    const re = g * (a * Math.cos(curv - psi) + b * Math.cos(curv - 3 * psi));
    const im = g * (a * Math.sin(curv - psi) + b * Math.sin(curv - 3 * psi));
    // standing wave: forward plus backward beam, real part of U e^{ikz}
    const s = re * Math.cos(k * z) - im * Math.sin(k * z);
    I[i] = s * s;
    if (I[i] > peak) peak = I[i];
  }
  const H = 2.6;
  for (let i = 0; i < pos.count; i++) pos.setY(i, H * Math.pow(I[i] / peak, 0.75));
  geo.computeVertexNormals();

  const surface = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: {
      H: { value: H }, L: { value: L }, ball: { value: new THREE.Vector3(0, 0.45, 0) },
      deep: { value: new THREE.Color(0x24145e) }, mid: { value: new THREE.Color(0x5b45b8) },
      pale: { value: new THREE.Color(0xc8bdf2) }, line: { value: new THREE.Color(0xe39a4a) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPos = wp.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float H; uniform float L; uniform vec3 ball; uniform vec3 deep; uniform vec3 mid; uniform vec3 pale; uniform vec3 line;
      varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float h = clamp(vPos.y / H, 0.0, 1.0);
        vec3 c = mix(deep, mid, smoothstep(0.0, 0.35, h));
        c = mix(c, pale, smoothstep(0.35, 0.8, h));
        c = mix(c, vec3(1.0), smoothstep(0.8, 1.0, h));
        vec3 n = normalize(vNormal);
        vec3 l = normalize(vec3(-0.4, 1.0, 0.5));
        float diff = 0.45 + 0.55 * max(dot(n, l), 0.0);
        float spec = pow(max(dot(reflect(-l, n), vView), 0.0), 24.0) * 0.25;
        vec3 col = c * diff + spec;
        col += vec3(1.0) * smoothstep(0.82, 1.0, h) * 0.9;           // the brightest crests glow
        // thin orange height lines on the flanks
        float q = vPos.y * 3.0;
        float f = abs(fract(q) - 0.5) / fwidth(q);
        float band = smoothstep(0.03, 0.08, h) * (1.0 - smoothstep(0.3, 0.45, h));
        col = mix(col, line * 1.4, (1.0 - clamp(f - 0.5, 0.0, 1.0)) * band * 0.7);
        col *= smoothstep(0.0, 0.08, h);                              // the floor is black
        // the particle's soft shadow and the occlusion around it, from the light above
        vec2 dd = vPos.xz - ball.xz - vec2(0.25, -0.15);
        col *= 1.0 - 0.55 * exp(-dot(dd, dd) / 0.5);
        // crevices between crests take less light than the crests
        col *= 0.55 + 0.45 * smoothstep(-0.2, 0.9, dot(normalize(vNormal), vec3(0.0, 1.0, 0.0)) + h);
        col *= 1.0 - smoothstep(L * 0.55, L * 0.98, abs(vPos.x));    // the beam fades into the dark at both ends
        gl_FragColor = vec4(col, 1.0);
      }`,
    extensions: { derivatives: true },
  }));
  scene.add(surface);

  // the trapped particle: a mirror-like sphere that reflects the light field around it
  const cube = new THREE.WebGLCubeRenderTarget(256);
  const cubeCam = new THREE.CubeCamera(0.1, 60, cube);
  cubeCam.position.set(0, 0.45, 0);
  cubeCam.update(renderer, scene);
  const particle = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 64, 32),
    new THREE.MeshStandardMaterial({ color: 0xb8b8c8, metalness: 1, roughness: 0.06, envMap: cube.texture })
  );
  particle.position.copy(cubeCam.position);
  scene.add(particle);
  const glint = new THREE.PointLight(0xffffff, 6, 6);
  glint.position.set(-1.5, 3, 2);
  scene.add(glint);

  return {
    scene, bloom: 0.55,
    // maxPolar keeps the camera above the light field: from below it is only an empty shell
    view: { position: [-9.5, 7.2, 12.5], target: [0.6, 0.2, 0], near: 3, far: 45, shift: 0.2, maxPolar: 1.38 },
    // the particle oscillates along the trap axis, once every three seconds
    update(t) {
      particle.position.x = 0.5 * Math.sin((2 * Math.PI * t) / 3);
      surface.material.uniforms.ball.value.copy(particle.position);
    },
  };
}

// ---------- molecules in a microcavity ----------
function cavityModel(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.environment = studio(renderer);
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202030, 0.3));
  shadowLight(scene, [-3, 10, 4], 2.2, 7);
  studioFloor(scene, -3.2, 26);
  const rim = new THREE.DirectionalLight(0xb8c4ff, 1.2);   // a cool light from behind picks out the edges
  rim.position.set(4, 3, -8);
  scene.add(rim);

  const gap = 4.6; // mirror faces at x = +-gap
  // mirrors: grey discs with a concave face towards the molecules
  // a brushed-steel body with rounded rims, and the coated concave face as a separate, polished part
  const R = 2.5, depth = 1.3, sag = 0.3, bev = 0.08, body = [new THREE.Vector2(0, -depth)];
  for (let i = 0; i <= 6; i++) {           // rounded back rim
    const a = (Math.PI / 2) * (i / 6);
    body.push(new THREE.Vector2(R - bev + bev * Math.sin(a), -depth + bev - bev * Math.cos(a)));
  }
  for (let i = 0; i <= 6; i++) {           // rounded front rim, ending on the face
    const a = (Math.PI / 2) * (i / 6);
    body.push(new THREE.Vector2(R - bev + bev * Math.cos(a), -bev + bev * Math.sin(a)));
  }
  body.push(new THREE.Vector2(R - bev, 0));
  const face = [];
  for (let i = 0; i <= 32; i++) {
    const r = (R - bev) * (1 - i / 32);
    face.push(new THREE.Vector2(r, -sag * (1 - (r / (R - bev)) ** 2)));
  }
  const bodyGeo = new THREE.LatheGeometry(body, 128), faceGeo = new THREE.LatheGeometry(face, 128);
  const steelBody = new THREE.MeshPhysicalMaterial({ color: 0x9a9ea8, metalness: 1, roughness: 0.38, clearcoat: 0.3, side: THREE.DoubleSide });
  const coat = coatedMirror();
  coat.side = THREE.DoubleSide;
  for (const side of [-1, 1]) {
    const m = new THREE.Group();
    const b = new THREE.Mesh(bodyGeo, steelBody), f = new THREE.Mesh(faceGeo, coat);
    b.castShadow = true;
    m.add(b, f);
    m.rotation.z = side * Math.PI / 2; // lathe axis (y) along the cavity axis, concave face inwards
    m.position.x = side * (gap + sag);
    scene.add(m);
  }

  // standing waves: the condensate mode (green) and the exciton (blue), a line with a faint sheet under it
  const waves = [
    standingWave(0x3fae2a, 5, 1.25, gap, 2 * Math.PI / 1.6, 0),
    standingWave(0x4060e0, 3, 1.45, gap, 2 * Math.PI / 2.3, Math.PI / 2.6),
  ];
  waves.forEach((w) => scene.add(w.group));

  // molecules: small ball-and-stick clusters filling the cavity
  const rand = mulberry(7);
  const atomGeo = new THREE.SphereGeometry(1, 32, 20);
  const bondGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  bondGeo.translate(0, 0.5, 0);
  // glossy black atoms that mirror the studio, like the trapped particle, on polished steel bonds
  const atomMat = new THREE.MeshPhysicalMaterial({ color: 0x141418, metalness: 0.15, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
  const bondMat = new THREE.MeshPhysicalMaterial({ color: 0xc4c8d0, metalness: 1, roughness: 0.22 });
  const molecules = [];
  const glow = glowTexture();
  for (let m = 0; m < 26; m++) {
    const g = new THREE.Group();
    const atoms = [new THREE.Vector3()];
    const n = 4 + Math.floor(rand() * 5);
    for (let a = 1; a < n; a++) {
      const from = atoms[Math.floor(rand() * atoms.length)];
      const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      const p = from.clone().addScaledVector(dir, 0.36);
      atoms.push(p);
      g.add(bond(from, p, 0.018, bondGeo, bondMat));
    }
    atoms.forEach((p) => {
      const s = new THREE.Mesh(atomGeo, atomMat);
      s.scale.setScalar(0.06 + rand() * 0.05);
      s.position.copy(p);
      g.add(s);
    });
    // about a third of the molecules carry an excitation, a soft purple glow
    let halo = null;
    if (rand() < 0.4) {
      halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xb050e8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(0.85);
      g.add(halo);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const r = 1.6 * Math.sqrt(rand()), phi = rand() * 2 * Math.PI;
    g.position.set(-gap + 0.7 + rand() * (2 * gap - 1.4), r * Math.cos(phi), r * Math.sin(phi));
    g.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    scene.add(g);
    molecules.push({ g, halo, spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.3), phase: rand() * 6.28 });
  }

  // vibrations: springs with a ball on each end, stretching and relaxing
  const springMat = new THREE.MeshPhysicalMaterial({ color: 0xd0d4dc, metalness: 1, roughness: 0.18 });
  const springs = [];
  for (let s = 0; s < 9; s++) {
    const g = new THREE.Group();
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new Helix(0.07, 7), 160, 0.012, 6), springMat);
    const ends = [0, 1].map(() => { const b = new THREE.Mesh(atomGeo, atomMat); b.scale.setScalar(0.09); g.add(b); return b; });
    g.add(coil);
    const r = 1.7 * Math.sqrt(rand()), phi = rand() * 2 * Math.PI;
    g.position.set(-gap + 0.8 + rand() * (2 * gap - 1.6), r * Math.cos(phi), r * Math.sin(phi));
    g.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    scene.add(g);
    springs.push({ coil, ends, phase: rand() * 6.28, rate: 5 + rand() * 3 });
  }

  // light outside the cavity, along its axis: blue pump pulses enter through the left mirror,
  // and the green condensate emission leaves through the right one
  const back = gap + sag + depth + 0.05; // outer face of each mirror
  const pump = pulse(0x4a6cff, 0.32, 8, 1.4);
  pump.group.position.set(-back - 8, 0, 0);
  scene.add(pump.group);
  const emission = pulse(0x52d035, 0.38, 10, 2.2);
  emission.group.position.set(back, 0, 0);
  scene.add(emission.group);

  return {
    scene, bloom: 0.5,
    view: { position: [3, 4.6, 15.5], target: [0.4, -0.1, 0], near: 3, far: 40, shift: 0.14 },
    update(t) {
      waves.forEach((w) => w.update(t));
      molecules.forEach((m) => {
        m.g.rotation.x += m.spin.x * 0.01; m.g.rotation.y += m.spin.y * 0.01;
        if (m.halo) m.halo.material.opacity = 0.3 + 0.18 * Math.sin(t * 2 + m.phase);
      });
      springs.forEach((s) => {
        const len = 0.5 + 0.12 * Math.sin(t * s.rate + s.phase);
        s.coil.scale.set(1, len, 1);
        s.ends[0].position.y = 0;
        s.ends[1].position.y = len;
      });
      pump.update(t, 0);
      emission.update(t, 1.3);
    },
  };
}

// ---------- a polariton condensate forming on the optical table ----------
// The sample (a thin amber slab, as QuOp's Tabletop draws it) floats above the table. A laser turns its power
// up, the lit bars on its top showing how far; its blue beam hits the sample at 45 degrees. Below threshold
// the sample glows faintly into a wide cone; above it a condensate forms and the emission becomes a narrow,
// bright beam. The camera facing the sample records the emission in momentum (k) space, and its picture, on
// the monitor behind it, narrows from a broad haze to a bright spot at k = 0. After arXiv:2601.15080, not to scale.
function benchModel(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.Fog(0x000000, 14, 30);     // the far end of the table falls into the dark
  scene.environment = studio(renderer);
  scene.environmentIntensity = 0.3;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202028, 0.25));
  const key = shadowLight(scene, [-7, 9, -1], 3.2, 9); // low from the left, so shadows fall across the table towards the camera
  const rim = new THREE.DirectionalLight(0xd0d8ff, 0.5);   // a cool light from behind picks out the edges
  rim.position.set(6, 5, -8);
  scene.add(rim);

  const AX = 2.2;                                   // beam height above the table
  const pumpCol = new THREE.Color(0x3c64ff), emitCol = new THREE.Color(0x52e6d6);
  // anodised black, a laser's white enamel and polished steel, each with a clear coat that catches the studio
  const black = new THREE.MeshPhysicalMaterial({ color: 0x18191e, metalness: 0.5, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xb4b4ba, metalness: 0, roughness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.2 });
  const rounded = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 4, r);

  // the breadboard: dark plate with a square grid of tapped holes, lit and shadowed like everything on it
  const hole = document.createElement("canvas");
  hole.width = hole.height = 64;
  const g2 = hole.getContext("2d");
  g2.fillStyle = "#2a2b31"; g2.fillRect(0, 0, 64, 64);
  g2.fillStyle = "#050506"; g2.beginPath(); g2.arc(32, 32, 9, 0, 2 * Math.PI); g2.fill();
  const holes = new THREE.CanvasTexture(hole);
  holes.colorSpace = THREE.SRGBColorSpace;
  holes.wrapS = holes.wrapT = THREE.RepeatWrapping;
  holes.repeat.set(36, 24);
  holes.anisotropy = 8;
  const table = new THREE.Mesh(rounded(18, 0.3, 12, 0.1), [black, black,
    new THREE.MeshStandardMaterial({ map: holes, metalness: 0.5, roughness: 0.55 }), black, black, black]);
  table.position.y = -0.15;
  table.receiveShadow = true;
  scene.add(table);

  // the sample, floating on the beam
  const half = 0.64;
  const sample = new THREE.Mesh(rounded(0.12, 2 * half, 2 * half, 0.03),
    // amber polymer film on glass, with the thin-film colour play a real sample shows
    new THREE.MeshPhysicalMaterial({ color: 0xf2c94c, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.6, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 500], transparent: true, opacity: 0.92 }));
  sample.position.y = AX;
  sample.castShadow = true;
  scene.add(sample);

  // the laser, out along the pump direction, with a row of power bars on its top
  const d = new THREE.Vector3(1, 0, 1).normalize();       // pump direction, 45 degrees onto the sample
  const hit = new THREE.Vector3(-0.07, AX, 0);
  const at = (s) => hit.clone().addScaledVector(d, -s);   // a point s back along the pump
  const laser = new THREE.Group();
  const box = new THREE.Mesh(rounded(2.4, 0.9, 1.0, 0.1), white);
  box.castShadow = box.receiveShadow = true;
  const foot = new THREE.Mesh(rounded(2.6, 0.1, 1.2, 0.03), black);
  foot.position.y = -0.5;
  foot.castShadow = foot.receiveShadow = true;
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 24).rotateZ(Math.PI / 2), black);
  nose.position.x = 1.3;
  const apertureMat = new THREE.MeshBasicMaterial({ color: pumpCol.clone() });
  const aperture = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24).rotateY(Math.PI / 2), apertureMat);
  aperture.position.x = 1.41;
  const pedestal = new THREE.Mesh(rounded(1.6, AX - 0.55, 0.8, 0.05), black);  // up from the table to the beam height
  pedestal.position.y = -0.55 - (AX - 0.55) / 2;
  pedestal.castShadow = pedestal.receiveShadow = true;
  laser.add(box, foot, pedestal, nose, aperture);
  // cooling fins along the back, and a dark panel on top for the power bars
  for (let i = 0; i < 7; i++) {
    const fin = new THREE.Mesh(rounded(0.05, 0.16, 0.92, 0.02), steel);
    fin.position.set(-1.05 + i * 0.12, 0.52, 0);
    fin.castShadow = true;
    laser.add(fin);
  }
  const panel = new THREE.Mesh(rounded(1.05, 0.04, 0.5, 0.015), black);
  panel.position.set(0.5, 0.46, 0);
  laser.add(panel);
  const BARS = 10, barMats = [];
  for (let i = 0; i < BARS; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x222228 });
    const b = new THREE.Mesh(rounded(0.06, 0.03, 0.32, 0.01), mat);
    b.position.set(0.09 + i * 0.09, 0.485, 0);
    laser.add(b);
    barMats.push(mat);
  }
  laser.position.copy(at(5.6));
  laser.rotation.y = Math.atan2(-d.z, d.x);
  scene.add(laser);

  // a beam: a glowing cylinder from a to b, its brightness set each frame
  function beam(a, b, radius, color) {
    const len = a.distanceTo(b);
    const u = { color: { value: color.clone() }, power: { value: 0 } };
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 16, 1, true), new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main() { vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 color; uniform float power; varying vec3 vN; varying vec3 vV;
        void main() { float core = pow(abs(dot(vN, vV)), 2.0); gl_FragColor = vec4(color * power * (0.25 + 1.6 * core), 1.0); }`,
    }));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    scene.add(m);
    return u;
  }
  const pump = beam(at(4.15), hit, 0.05, pumpCol);

  // the camera, facing the sample's back, on a short stand
  const camX = 4.2;
  const cam = new THREE.Group();
  const body = new THREE.Mesh(rounded(1.3, 1.0, 1.0, 0.1), black);
  body.position.x = 0.65;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 32).rotateZ(Math.PI / 2), steel);
  barrel.position.x = -0.35;
  // the front lens, its anti-reflection coating glinting purple and green
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 16, 0, 2 * Math.PI, 0, 0.5).rotateZ(Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x080a14, metalness: 0.3, roughness: 0.03, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.4, iridescenceThicknessRange: [280, 420] }));
  [-0.15, -0.45].forEach((x) => {          // knurled focus and aperture rings
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 48).rotateZ(Math.PI / 2), black);
    ring.position.x = x;
    cam.add(ring);
  });
  glass.position.x = -0.63;
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, AX - 0.5, 16), steel);
  stand.position.set(0.65, -(AX - 0.5) / 2 - 0.5, 0);
  const plate = new THREE.Mesh(rounded(0.8, 0.08, 0.8, 0.03), black);
  plate.position.set(0.65, -AX + 0.04, 0);
  cam.add(body, barrel, glass, stand, plate);
  cam.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  cam.position.set(camX, AX, 0);
  scene.add(cam);

  // the emission from the sample to the camera: a wide, faint cone (thermal polaritons at all angles)
  // and a narrow beam (the condensate, k = 0)
  function cone(open, color) {
    const u = { color: { value: color.clone() }, power: { value: 0 } };
    const len = camX - 0.75;
    const g = new THREE.CylinderGeometry(open, 0.04, len, 32, 1, true);
    g.rotateZ(-Math.PI / 2).translate(len / 2 + 0.06, AX, 0);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying float vX; void main() { vX = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 color; uniform float power; varying float vX;
        void main() { gl_FragColor = vec4(color * power * (0.6 - 0.1 * vX), 1.0); }`,
    }));
    scene.add(m);
    return u;
  }
  const thermalCone = cone(0.3, emitCol);
  const condCone = cone(0.06, emitCol);
  // the spot where the pump lands, and the light it throws on the table
  const spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  spot.position.set(0.05, AX, 0);
  scene.add(spot);
  const spill = new THREE.PointLight(emitCol, 0, 6, 1.6);
  spill.position.set(0.3, AX, 0);
  scene.add(spill);

  // the camera's picture, on a monitor behind it: the emission in k space
  const kUniforms = { nth: { value: 0 }, nc: { value: 0 }, t: { value: 0 } };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), new THREE.ShaderMaterial({
    uniforms: kUniforms,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float nth; uniform float nc; uniform float t; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + t) * 43758.5453); }
      vec3 ramp(float x) {   // black, deep blue, cyan, white
        x = clamp(x, 0.0, 1.0);
        vec3 c = mix(vec3(0.0), vec3(0.05, 0.12, 0.55), smoothstep(0.0, 0.3, x));
        c = mix(c, vec3(0.2, 0.85, 0.85), smoothstep(0.3, 0.7, x));
        return mix(c, vec3(1.0), smoothstep(0.7, 1.0, x));
      }
      void main() {
        vec2 k = (vUv - 0.5) * vec2(1.3, 1.0) * 2.0;               // kx, ky
        float r2 = dot(k, k);
        float sc = 0.012 + 0.06 / (1.0 + 4.0 * nc);                // the condensate narrows as it fills
        float I = nth * 0.38 * exp(-r2 / 0.35) + nc * 1.4 * exp(-r2 / sc);
        I *= 0.9 + 0.2 * hash(floor(vUv * 160.0));                  // a little camera noise
        vec3 col = ramp(I);
        col += vec3(0.08) * (step(abs(k.x), 0.004) + step(abs(k.y), 0.004)) * step(r2, 0.9);   // axes
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  const monitor = new THREE.Group();
  const bezel = new THREE.Mesh(rounded(3.7, 2.9, 0.14, 0.05), black);
  bezel.position.z = -0.08;
  bezel.castShadow = true;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, AX + 1.2, 16), steel);
  arm.position.set(0, -(AX + 1.2) / 2 - 1.3, -0.2);
  arm.castShadow = true;
  monitor.add(bezel, screen, arm);
  monitor.position.set(camX + 1.6, AX + 2.3, -3.2);
  monitor.rotation.y = -0.35;
  scene.add(monitor);

  // pump power over one cycle: up from 0.2 to 2 times threshold over 6.5 s, a hold, then down and again
  const CYCLE = 9;
  return {
    scene, bloom: 0.6,
    view: { position: [-3.2, 8.2, 14.5], target: [1.0, 2.0, -0.6], near: 4, far: 40, shift: 0.17, maxPolar: 1.45 },
    update(t) {
      const c = t % CYCLE;
      const P = c < 6.5 ? 0.2 + 1.8 * THREE.MathUtils.smoothstep(c, 0, 6.5) : c < 8.4 ? 2 : 2 - 1.8 * THREE.MathUtils.smoothstep(c, 8.4, 9);
      const nc = Math.log(1 + Math.exp((P - 1) * 10)) / 10;       // condensate: grows past threshold (P = 1)
      const nth = Math.min(P, 1);                                   // thermal part: clamps at threshold
      const lit = Math.round((P / 2) * BARS);
      barMats.forEach((m, i) => m.color.set(i < lit ? (i < BARS / 2 ? 0x3c64ff : 0x8fa6ff) : 0x222228));
      apertureMat.color.copy(pumpCol).multiplyScalar(0.4 + 1.2 * (P / 2));
      pump.power.value = 0.15 + 0.9 * (P / 2);
      thermalCone.power.value = 0.07 * nth;
      condCone.power.value = 0.9 * Math.min(nc, 1.2);
      spot.material.color.copy(pumpCol).lerp(emitCol, Math.min(1, nc * 1.5));
      spot.material.opacity = 0.3 + 0.5 * Math.min(1, (nth + nc) / 1.5);
      spot.scale.setScalar(0.6 + 0.5 * Math.min(nc, 1));
      spill.intensity = 6 * Math.min(nc, 1.2);
      kUniforms.nth.value = nth; kUniforms.nc.value = nc; kUniforms.t.value = Math.floor(t * 12);
    },
  };
}

// a directional light that casts soft shadows over a square of half-width `reach` around the origin
function shadowLight(scene, pos, intensity, reach) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.set(...pos);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  const c = light.shadow.camera;
  c.left = c.bottom = -reach; c.right = c.top = reach; c.near = 1; c.far = 40;
  light.shadow.radius = 4;
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.02;
  scene.add(light);
  return light;
}

// ---------- entangled polariton pairs ----------
// A cavity drawn upright: two mirrors with spacers, and between them a patterned layer of pillars hosting
// excitons and phonons. The IR Fabry-Perot mode (pink) fills the cavity and the visible lattice mode (blue) runs
// through the patterned layer. A pump photon comes in through the top mirror; the cavity answers with an
// entangled pair, a phonon-polariton (red spring) and an exciton-polariton (blue and purple), which leave as
// an IR and a visible photon. The figure-eights mark the pairs. Drawn after Fig. 1 of arXiv:2508.10809.
function pairsModel(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.environment = studio(renderer);
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303040, 0.35));
  shadowLight(scene, [-4, 12, 6], 2.2, 6);
  const rim = new THREE.DirectionalLight(0xb8c4ff, 1);   // a cool light from behind picks out the edges
  rim.position.set(5, 4, -8);
  scene.add(rim);

  const S = 4.4, Y = 3;                    // side of the stack, mirrors at y = +-Y
  studioFloor(scene, -Y - 0.9, 26);
  // mirrors: thin silver plates
  const mirrorMat = coatedMirror();
  for (const y of [-Y, Y]) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(S, 0.14, S, 4, 0.04), mirrorMat);
    m.position.y = y + Math.sign(y) * 0.07;
    m.receiveShadow = y < 0;
    scene.add(m);
  }
  // spacers: clear glass blocks, seen mostly by their edges
  const box = new THREE.Mesh(new RoundedBoxGeometry(S - 0.02, 2 * Y - 0.02, S - 0.02, 4, 0.05), glass(0xdfe6ff, 0.02, 0.35));
  scene.add(box);

  // the patterned layer: a thin slab with a square lattice of pillars, the ones towards the back right lit up
  const slab = new THREE.Mesh(new RoundedBoxGeometry(S, 0.3, S, 3, 0.03),
    glass(0xa8b0ff, 0.06, 0.5));
  scene.add(slab);
  const n = 7, pitch = S / (n + 0.6);
  const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 0.26, 40),
    new THREE.MeshPhysicalMaterial({ color: 0x22223a, metalness: 0.6, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }), n * n);
  const caps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.15, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), n * n);
  const m4 = new THREE.Matrix4(), warm = new THREE.Color(0xffd8a8), c = new THREE.Color();
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = (i - (n - 1) / 2) * pitch, z = (j - (n - 1) / 2) * pitch, id = i * n + j;
    pillars.setMatrixAt(id, m4.makeTranslation(x, 0, z));
    caps.setMatrixAt(id, m4.makeTranslation(x, 0.135, z));
    caps.setColorAt(id, c.copy(warm).multiplyScalar(Math.max(0, (x - z) / S + 0.15) * 1.4));
  }
  pillars.castShadow = pillars.receiveShadow = true;
  scene.add(pillars, caps);

  // the IR Fabry-Perot mode: a pink spindle, widest at the patterned layer, narrow at the mirrors
  const prof = [];
  for (let i = 0; i <= 64; i++) {
    const y = -Y + (2 * Y * i) / 64;
    prof.push(new THREE.Vector2(0.1 + 1.8 * Math.cos((Math.PI * y) / (2 * Y)) ** 2, y));
  }
  const irUniforms = { t: { value: 0 } };
  const ir = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), new THREE.ShaderMaterial({
    uniforms: irUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float t; varying vec3 vN; varying vec3 vV;
      void main() { float rim = 1.0 - abs(dot(normalize(vN), vV));
        gl_FragColor = vec4(vec3(1.0, 0.42, 0.5) * (0.05 + 0.22 * rim * rim) * (0.85 + 0.15 * sin(t * 2.0)), 1.0); }`,
  }));
  scene.add(ir);

  // the visible lattice mode: blue standing waves running through the patterned layer
  const lattice = [-1, 0, 1].map((k) => {
    const w = standingWave(0x3c5cff, 4, 0.38, S / 2, 2 * Math.PI / 1.3, 0);
    w.group.position.z = k * 1.45;
    scene.add(w.group);
    return w;
  });

  // a figure-eight (lemniscate of Bernoulli), lying flat, its two loops centred at x = +-0.71 a
  const greyMat = new THREE.MeshPhysicalMaterial({ color: 0x9a9ea8, metalness: 1, roughness: 0.22 });   // polished steel
  function eight(a) {
    const pts = [];
    for (let i = 0; i < 200; i++) {
      const u = (i / 200) * 2 * Math.PI, d = 1 + Math.sin(u) ** 2;
      pts.push(new THREE.Vector3((a * Math.cos(u)) / d, 0, (a * Math.sin(u) * Math.cos(u)) / d));
    }
    const loop = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 400, 0.05, 16, true), greyMat);
    loop.castShadow = true;
    return loop;
  }
  const a = 1.75, lobe = 0.71 * a;
  const inner = eight(a);
  inner.position.y = 0.75;
  inner.rotation.x = 0.55; // tipped towards the viewer, as in the figure
  scene.add(inner);
  const outer = eight(a);
  outer.position.y = Y + 1.9;
  outer.rotation.x = 0.55;
  scene.add(outer);

  // inside the loops: the phonon-polariton, two red balls on a spring, and the exciton-polariton, a blue and a purple ball
  const ball = new THREE.SphereGeometry(1, 48, 32);
  const red = new THREE.MeshPhysicalMaterial({ color: 0xd8262a, metalness: 0.1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 });
  const phonon = new THREE.Group();
  phonon.position.set(-lobe, 0.75, 0);
  const ends = [-1, 1].map(() => { const b = new THREE.Mesh(ball, red); b.scale.setScalar(0.14); phonon.add(b); return b; });
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new Helix(0.07, 7), 160, 0.014, 6), red);
  coil.rotation.z = -Math.PI / 2; // helix runs along x
  phonon.add(coil);
  scene.add(phonon);
  const exciton = new THREE.Group();
  exciton.position.set(lobe, 0.75, 0);
  const blue = new THREE.Mesh(ball, new THREE.MeshPhysicalMaterial({ color: 0x3048ff, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x101860 }));
  const purple = new THREE.Mesh(ball, new THREE.MeshPhysicalMaterial({ color: 0x8a2ad8, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04, emissive: 0x2a0850 }));
  blue.scale.setScalar(0.17); purple.scale.setScalar(0.15);
  exciton.add(blue, purple);
  scene.add(exciton);
  [phonon, exciton].forEach((g) => g.traverse((o) => { if (o.isMesh) o.castShadow = true; }));

  // light above the top mirror: the pump comes in at an angle, then the IR and visible photons leave together,
  // each through one loop of the upper figure-eight. IR has the longest wavelength, the pump the shortest.
  const top = Y + 0.15;
  const pump = pulse(0x9a3cff, 0.22, 4.6, 1.2, 15);
  pump.group.position.set(-lobe - 2.6, top + 3.9, 0);
  pump.group.rotation.z = -Math.atan2(3.9, 2.6);
  scene.add(pump.group);
  const irPhoton = pulse(0xe8302a, 0.26, 4.4, 1.5, 6);
  irPhoton.group.position.set(-lobe, top, 0);
  irPhoton.group.rotation.z = Math.PI / 2;
  scene.add(irPhoton.group);
  const visPhoton = pulse(0x3c64ff, 0.2, 4.4, 1.5, 13);
  visPhoton.group.position.set(lobe, top, 0);
  visPhoton.group.rotation.z = Math.PI / 2;
  scene.add(visPhoton.group);

  return {
    scene, bloom: 0.55,
    view: { position: [8.1, 8, 15.6], target: [0, 2.1, 0], near: 4, far: 45, shift: 0.18 },
    update(t) {
      irUniforms.t.value = t;
      lattice.forEach((w) => w.update(t));
      const stretch = 0.5 + 0.1 * Math.sin(t * 7);
      ends[0].position.x = -stretch; ends[1].position.x = stretch;
      coil.position.x = -stretch; coil.scale.set(1, 2 * stretch, 1);
      blue.position.set(0.2 * Math.cos(t * 1.5), 0.05 * Math.sin(t * 3), 0.2 * Math.sin(t * 1.5));
      purple.position.copy(blue.position).multiplyScalar(-1);
      pump.update(t, 0);
      irPhoton.update(t, 1.2);
      visPhoton.update(t, 1.2);
    },
  };
}

// a standing wave between the mirrors: a glowing line and a faint sheet down to the axis, its amplitude swinging in time
function standingWave(color, modes, amp, gap, omega, plane) {
  const group = new THREE.Group();
  group.rotation.x = plane;
  const uniforms = { t: { value: 0 }, color: { value: new THREE.Color(color) }, k: { value: (modes * Math.PI) / (2 * gap) }, gap: { value: gap }, amp: { value: amp }, omega: { value: omega } };
  const shift = /* glsl */ `
    uniform float t; uniform float k; uniform float gap; uniform float amp; uniform float omega;
    float wave(float x) { return amp * sin(k * (x + gap)) * cos(omega * t); }`;
  const line = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 2 * gap, 8, 240, true).rotateZ(Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: shift + `void main() { vec3 p = position; p.y += wave(p.x); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform vec3 color; void main() { gl_FragColor = vec4(color * 1.8, 1.0); }`,
    })
  );
  const sheetGeo = new THREE.PlaneGeometry(2 * gap, 1, 240, 1);
  sheetGeo.translate(0, 0.5, 0);
  const sheet = new THREE.Mesh(sheetGeo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: shift + `varying float vUp; void main() { vec3 p = position; vUp = p.y; p.y = p.y * wave(p.x); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform vec3 color; varying float vUp; void main() { gl_FragColor = vec4(color * (0.08 + 0.22 * vUp), 1.0); }`,
  }));
  group.add(line, sheet);
  return { group, update(t) { uniforms.t.value = t; } };
}

// a short wave packet travelling in +x along a stretch of the given length, once every 3 s;
// it takes `duration` seconds to cross, delay sets when in the cycle it starts, wave is its wavenumber
function pulse(color, amp, length, duration, wave = 9) {
  const group = new THREE.Group();
  const uniforms = { x0: { value: -10 }, color: { value: new THREE.Color(color) }, amp: { value: amp }, wave: { value: wave } };
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, length, 8, 400, true).rotateZ(Math.PI / 2).translate(length / 2, 0, 0),
    new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float x0; uniform float amp; uniform float wave; varying float vEnv;
        void main() {
          vec3 p = position;
          float d = p.x - x0;
          vEnv = exp(-d * d / 0.9);
          p.y += amp * vEnv * sin(wave * d);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform vec3 color; varying float vEnv; void main() { gl_FragColor = vec4(color * 2.0 * vEnv, 1.0); }`,
    })
  );
  group.add(mesh);
  return {
    group,
    update(t, delay) {
      const phase = (((t - delay) % 3) + 3) % 3; // seconds into this cycle
      uniforms.x0.value = phase * ((length + 2) / duration) - 1;
    },
  };
}

class Helix extends THREE.Curve {
  constructor(radius, turns) { super(); this.radius = radius; this.turns = turns; }
  getPoint(u, target = new THREE.Vector3()) {
    const a = u * this.turns * 2 * Math.PI;
    return target.set(this.radius * Math.cos(a), u, this.radius * Math.sin(a));
  }
}

function bond(a, b, radius, geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  const d = b.clone().sub(a);
  m.position.copy(a);
  m.scale.set(radius, d.length(), radius);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

// the reflections every model shares: a softly lit studio room, prefiltered once
let studioEnv = null;
function studio(renderer) {
  if (!studioEnv) studioEnv = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  return studioEnv;
}

// a dark studio floor: a faint pool of light that fades to black, and the shadows that fall on it
function studioFloor(scene, y, size) {
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; void main() { float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(vec3(0.06, 0.06, 0.07) * (1.0 - smoothstep(0.0, 1.0, r)), 1.0); }`,
  }));
  pool.position.y = y;
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.55 }));
  shade.position.y = y + 0.002;
  shade.receiveShadow = true;
  scene.add(pool, shade);
}

// cheap glass: nearly clear face on, brighter at grazing angles, as a pane's edges catch the light
function glass(color = 0xffffff, face = 0.03, edge = 0.5) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, face: { value: face }, edge: { value: edge } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vV; void main() { vec4 w = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 color; uniform float face; uniform float edge; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(normalize(vN), vV)), 3.0); gl_FragColor = vec4(color, face + edge * f); }`,
  });
}

// the coated face of a dielectric mirror: polished, with the faint colour play of its thin layers
function coatedMirror(color = 0xdcdce4) {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.07, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [250, 650] });
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.4, "rgba(255,255,255,0.35)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// small seeded random numbers, so the molecules sit in the same places on every visit
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
