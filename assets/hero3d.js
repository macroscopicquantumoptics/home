// Home page picture: two 3D models you can turn and zoom, picked with the dots and arrows at the bottom of the picture.
//   trap:   the dark optical trap, a standing wave whose intensity is drawn as height, with a particle in the dark spot
//   cavity: molecules between two microcavity mirrors, after the figure in Shishkov et al., PRL 133, 186903 (2024)
// three.js is bundled in assets/vendor/three (MIT licence), so the page still makes no outside requests.
// Without WebGL nothing changes: the video in .hero-media stays.
import * as THREE from "three";
import { OrbitControls } from "./vendor/three/controls/OrbitControls.js";
import { EffectComposer } from "./vendor/three/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/three/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/three/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/three/postprocessing/OutputPass.js";

const hero = document.querySelector(".hero");
const media = hero && hero.querySelector(".hero-media");
const picker = document.querySelector(".hero-pick");
const ORDER = ["trap", "cavity"];
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

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(new THREE.Scene(), camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.72);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const models = { trap: trapModel(renderer), cavity: null };
  let current = null, shown = "trap";

  function show(name) {
    if (!models[name]) models[name] = name === "cavity" ? cavityModel(renderer) : trapModel(renderer);
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
      H: { value: H }, L: { value: L },
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
      uniform float H; uniform float L; uniform vec3 deep; uniform vec3 mid; uniform vec3 pale; uniform vec3 line;
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
    update(t) { particle.position.x = 0.5 * Math.sin((2 * Math.PI * t) / 3); },
  };
}

// ---------- molecules in a microcavity ----------
function cavityModel(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(softboxes(), 0.02).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202030, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-3, 6, 5);
  scene.add(key);

  const gap = 4.6; // mirror faces at x = +-gap
  // mirrors: grey discs with a concave face towards the molecules
  const R = 2.5, depth = 1.3, sag = 0.3, prof = [new THREE.Vector2(0, -depth), new THREE.Vector2(R, -depth), new THREE.Vector2(R, 0)];
  for (let i = 1; i <= 24; i++) {
    const r = R * (1 - i / 24);
    prof.push(new THREE.Vector2(r, -sag * (1 - (r / R) ** 2)));
  }
  const mirrorGeo = new THREE.LatheGeometry(prof, 96);
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xb8b8c0, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(mirrorGeo, mirrorMat);
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
  const atomGeo = new THREE.SphereGeometry(1, 20, 14);
  const bondGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  bondGeo.translate(0, 0.5, 0);
  const atomMat = new THREE.MeshStandardMaterial({ color: 0x2c2c30, metalness: 0.3, roughness: 0.25 });
  const bondMat = new THREE.MeshStandardMaterial({ color: 0x8a8a90, metalness: 0.2, roughness: 0.5 });
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
    const r = 1.6 * Math.sqrt(rand()), phi = rand() * 2 * Math.PI;
    g.position.set(-gap + 0.7 + rand() * (2 * gap - 1.4), r * Math.cos(phi), r * Math.sin(phi));
    g.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    scene.add(g);
    molecules.push({ g, halo, spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.3), phase: rand() * 6.28 });
  }

  // vibrations: springs with a ball on each end, stretching and relaxing
  const springMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b8, metalness: 0.4, roughness: 0.35 });
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
// it takes `duration` seconds to cross, and delay sets when in the cycle it starts
function pulse(color, amp, length, duration) {
  const group = new THREE.Group();
  const uniforms = { x0: { value: -10 }, color: { value: new THREE.Color(color) }, amp: { value: amp } };
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, length, 8, 400, true).rotateZ(Math.PI / 2).translate(length / 2, 0, 0),
    new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float x0; uniform float amp; varying float vEnv;
        void main() {
          vec3 p = position;
          float d = p.x - x0;
          vEnv = exp(-d * d / 0.9);
          p.y += amp * vEnv * sin(9.0 * d);
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

// a few white panels around an empty room, for the mirrors to reflect
function softboxes() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x050507);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [[0, 8, 0, 10, 0.2, 6], [-9, 2, 4, 0.2, 4, 8], [8, 3, -5, 0.2, 3, 6], [0, -6, 8, 6, 0.2, 2]].forEach(([x, y, z, w, h, d]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, y, z);
    s.add(b);
  });
  return s;
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
