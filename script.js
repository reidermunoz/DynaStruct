/* ============================================================
   ReiDyn Builder — Logica principal v1.1
   ============================================================ */

// ============================================================
//  ESTADO GLOBAL
// ============================================================
const state = {
  nx: 3, ny: 3, nz: 3,
  sx: 5, sy: 3, sz: 4,
  E: 25, b: 30, W: 200, z: 0.05,
  elementosEliminados: [],  // [tipo, ex, ny, mz] tipo: 1=col, 2=vigaX, 3=vigaZ
  apoyos: {},                // { nodoId: tipo }  tipo: 1=emp, 2=art, 3=patin
  modo: 'ver',
  apoyoSel: 1,
  useSismo: false, regSismo: 0,
  useSin: false, ampSin: 500, frecSin: 2, pisoSin: 3,
  useCI: false, u0: 0.02, v0: 0, pisoCI: 3,
  tt: 30
};

// ============================================================
//  THREE.JS — SETUP
// ============================================================
let scene, camera, renderer, controls;
let estructuraGroup;
let raycaster, mouse;

// Colores consistentes con app Unity
const colores = {
  columna:   0x5DCAA5,  // verde
  vigaX:     0x378ADD,  // azul
  vigaZ:     0xAFA9EC,  // morado
  apoyoEmp:  0xBA7517,  // naranja oscuro
  apoyoArt:  0xE4A33B,  // dorado
  apoyoPat:  0xE5C870,  // amarillo claro
  nodo:      0x888899,  // gris
  eliminado: 0x3a3a40   // gris muy oscuro
};

function init3D() {
  const container = document.getElementById('canvas-container');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08080c);

  const w = container.clientWidth;
  const h = container.clientHeight;
  camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 200);
  camera.position.set(15, 12, 18);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Luces
  scene.add(new THREE.AmbientLight(0x404060, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(10, 20, 10);
  scene.add(dir);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 4, 0);

  raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = 0.2;
  mouse = new THREE.Vector2();

  // Distinguir click de drag
  let mouseDownPos = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!mouseDownPos) return;
    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < 5) onCanvasClick(e);
    mouseDownPos = null;
  });

  // Grilla y ejes
  scene.add(new THREE.GridHelper(30, 30, 0x222230, 0x16161c));
  scene.add(new THREE.AxesHelper(2));

  estructuraGroup = new THREE.Group();
  scene.add(estructuraGroup);

  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  const c = document.getElementById('canvas-container');
  camera.aspect = c.clientWidth / c.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(c.clientWidth, c.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ============================================================
//  DIBUJAR ESTRUCTURA
// ============================================================
function redibujar() {
  // Limpiar
  while (estructuraGroup.children.length > 0) {
    const obj = estructuraGroup.children[0];
    estructuraGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }

  const cx = (state.nx - 1) * state.sx / 2;
  const cz = (state.nz - 1) * state.sz / 2;

  const grosor = Math.max(0.06, Math.min(state.sx, state.sz) * 0.04);
  const radioNodo = Math.max(0.14, grosor * 1.8);

  // Columnas
  for (let mz = 0; mz < state.nz; mz++) {
    for (let ex = 0; ex < state.nx; ex++) {
      for (let ny = 0; ny < state.ny; ny++) {
        const elim = esEliminado(1, ex, ny, mz);
        const p1 = new THREE.Vector3(ex * state.sx - cx, ny * state.sy, mz * state.sz - cz);
        const p2 = new THREE.Vector3(ex * state.sx - cx, (ny + 1) * state.sy, mz * state.sz - cz);
        crearElemento(p1, p2, elim ? colores.eliminado : colores.columna, grosor,
          { tipo: 1, ex, ny, mz });
      }
    }
  }

  // Vigas X
  for (let mz = 0; mz < state.nz; mz++) {
    for (let ny = 1; ny <= state.ny; ny++) {
      for (let ex = 0; ex < state.nx - 1; ex++) {
        const elim = esEliminado(2, ex, ny, mz);
        const p1 = new THREE.Vector3(ex * state.sx - cx, ny * state.sy, mz * state.sz - cz);
        const p2 = new THREE.Vector3((ex + 1) * state.sx - cx, ny * state.sy, mz * state.sz - cz);
        crearElemento(p1, p2, elim ? colores.eliminado : colores.vigaX, grosor,
          { tipo: 2, ex, ny, mz });
      }
    }
  }

  // Vigas Z
  for (let ny = 1; ny <= state.ny; ny++) {
    for (let ex = 0; ex < state.nx; ex++) {
      for (let mz = 0; mz < state.nz - 1; mz++) {
        const elim = esEliminado(3, ex, ny, mz);
        const p1 = new THREE.Vector3(ex * state.sx - cx, ny * state.sy, mz * state.sz - cz);
        const p2 = new THREE.Vector3(ex * state.sx - cx, ny * state.sy, (mz + 1) * state.sz - cz);
        crearElemento(p1, p2, elim ? colores.eliminado : colores.vigaZ, grosor,
          { tipo: 3, ex, ny, mz });
      }
    }
  }

  // Nodos
  for (let mz = 0; mz < state.nz; mz++) {
    for (let ex = 0; ex < state.nx; ex++) {
      for (let ny = 0; ny <= state.ny; ny++) {
        const nodoId = obtenerIdNodo(ex, ny, mz);
        const p = new THREE.Vector3(ex * state.sx - cx, ny * state.sy, mz * state.sz - cz);

        if (ny === 0 && state.apoyos[nodoId]) {
          // Apoyo: dibujar forma especial segun tipo
          crearApoyoVisual(p, state.apoyos[nodoId], radioNodo, nodoId);
        } else {
          // Nodo normal
          let r = ny > 0 ? radioNodo : radioNodo * 0.8;
          crearNodo(p, colores.nodo, r, { tipo: 'nodo', ex, ny, mz, nodoId });
        }
      }
    }
  }

  controls.target.set(0, state.ny * state.sy * 0.5, 0);
}

function crearElemento(p1, p2, color, grosor, userData) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const longitud = dir.length();
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

  const geo = new THREE.CylinderGeometry(grosor, grosor, longitud, 10);
  const mat = new THREE.MeshLambertMaterial({ color });
  const cyl = new THREE.Mesh(geo, mat);
  cyl.position.copy(mid);

  const up = new THREE.Vector3(0, 1, 0);
  cyl.quaternion.setFromUnitVectors(up, dir.clone().normalize());
  cyl.userData = userData;
  estructuraGroup.add(cyl);
}

function crearNodo(pos, color, radio, userData) {
  const geo = new THREE.SphereGeometry(radio, 14, 14);
  const mat = new THREE.MeshLambertMaterial({ color });
  const sph = new THREE.Mesh(geo, mat);
  sph.position.copy(pos);
  sph.userData = userData;
  estructuraGroup.add(sph);
}

// ============================================================
//  APOYOS VISUALES — formas distintas para cada tipo
// ============================================================
function crearApoyoVisual(pos, tipo, radioBase, nodoId) {
  const grupo = new THREE.Group();
  grupo.position.copy(pos);

  if (tipo === 1) {
    // EMPOTRADO: cubo solido grande (base anclada)
    const s = radioBase * 2.5;
    const geo = new THREE.BoxGeometry(s, s * 0.5, s);
    const mat = new THREE.MeshLambertMaterial({ color: colores.apoyoEmp });
    const cube = new THREE.Mesh(geo, mat);
    cube.position.y = -s * 0.25;
    grupo.add(cube);

    // Lineas de "tierra"  (hatching)
    const lineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
    for (let i = -2; i <= 2; i++) {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(i * s * 0.2 - s * 0.4, -s * 0.5, 0),
        new THREE.Vector3(i * s * 0.2 - s * 0.6, -s * 0.7, 0)
      ]);
      grupo.add(new THREE.Line(geom, lineMat));
    }
  }
  else if (tipo === 2) {
    // ARTICULADO: triangulo (cono) apuntando hacia arriba
    const r = radioBase * 1.4;
    const alto = radioBase * 2;
    const geo = new THREE.ConeGeometry(r, alto, 4);
    const mat = new THREE.MeshLambertMaterial({ color: colores.apoyoArt });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.y = -alto * 0.5;
    grupo.add(cone);

    // Base
    const baseGeo = new THREE.BoxGeometry(r * 2.5, radioBase * 0.3, r * 2.5);
    const baseMesh = new THREE.Mesh(baseGeo, mat);
    baseMesh.position.y = -alto - radioBase * 0.15;
    grupo.add(baseMesh);
  }
  else if (tipo === 3) {
    // PATIN: cono + 2 esferas (rodillos) abajo
    const r = radioBase * 1.4;
    const alto = radioBase * 1.6;
    const matCono = new THREE.MeshLambertMaterial({ color: colores.apoyoPat });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, alto, 4), matCono);
    cone.position.y = -alto * 0.5;
    grupo.add(cone);

    // Dos rodillos
    const rodR = radioBase * 0.5;
    const matRod = new THREE.MeshLambertMaterial({ color: 0x222222 });
    [-r * 0.6, r * 0.6].forEach(xOff => {
      const rod = new THREE.Mesh(new THREE.SphereGeometry(rodR, 10, 10), matRod);
      rod.position.set(xOff, -alto - rodR * 0.5, 0);
      grupo.add(rod);
    });

    // Base horizontal
    const baseGeo = new THREE.BoxGeometry(r * 2.8, radioBase * 0.3, r * 2);
    const baseMesh = new THREE.Mesh(baseGeo, matCono);
    baseMesh.position.y = -alto - rodR * 1.5 - radioBase * 0.15;
    grupo.add(baseMesh);
  }

  // Hacer todo el grupo clickeable (asignar userData a un hit mesh invisible)
  const hitGeo = new THREE.SphereGeometry(radioBase * 2.5, 8, 8);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.userData = { tipo: 'nodo', nodoId, ny: 0 };
  grupo.add(hit);

  estructuraGroup.add(grupo);
}

// ============================================================
//  CLICK EN ELEMENTOS
// ============================================================
function onCanvasClick(event) {
  if (state.modo === 'ver') return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(estructuraGroup.children, true);
  if (hits.length === 0) return;

  let target = null;
  if (state.modo === 'apoyo') {
    target = hits.find(h => h.object.userData.tipo === 'nodo' && h.object.userData.ny === 0);
  } else if (state.modo === 'editar') {
    target = hits.find(h => h.object.userData.tipo === 1 ||
                            h.object.userData.tipo === 2 ||
                            h.object.userData.tipo === 3);
  }
  if (!target) return;

  const ud = target.object.userData;

  if (state.modo === 'editar') {
    toggleEliminado(ud.tipo, ud.ex, ud.ny, ud.mz);
    redibujar();
    actualizarBytes();
    setEstado(esEliminado(ud.tipo, ud.ex, ud.ny, ud.mz) ? 'Elemento eliminado' : 'Elemento restaurado', 'ok');
  } else if (state.modo === 'apoyo' && ud.ny === 0) {
    if (state.apoyos[ud.nodoId] === state.apoyoSel) {
      delete state.apoyos[ud.nodoId];
      setEstado('Apoyo removido', 'info');
    } else {
      state.apoyos[ud.nodoId] = state.apoyoSel;
      const nombres = { 1: 'Empotrado', 2: 'Articulado', 3: 'Patín' };
      setEstado('Apoyo ' + nombres[state.apoyoSel] + ' asignado', 'ok');
    }
    redibujar();
    actualizarBytes();
  }
}

// ============================================================
//  HELPERS
// ============================================================
function obtenerIdNodo(ex, ny, mz) {
  return mz * (state.nx * (state.ny + 1)) + ex * (state.ny + 1) + ny;
}

function esEliminado(tipo, ex, ny, mz) {
  return state.elementosEliminados.some(e =>
    e[0] === tipo && e[1] === ex && e[2] === ny && e[3] === mz);
}

function toggleEliminado(tipo, ex, ny, mz) {
  const idx = state.elementosEliminados.findIndex(e =>
    e[0] === tipo && e[1] === ex && e[2] === ny && e[3] === mz);
  if (idx >= 0) state.elementosEliminados.splice(idx, 1);
  else state.elementosEliminados.push([tipo, ex, ny, mz]);
}

function regenerarRegular() {
  state.elementosEliminados = [];
  state.apoyos = {};
  for (let mz = 0; mz < state.nz; mz++) {
    for (let ex = 0; ex < state.nx; ex++) {
      const nodoId = obtenerIdNodo(ex, 0, mz);
      state.apoyos[nodoId] = 1;
    }
  }
  redibujar();
  actualizarBytes();
  setEstado('Estructura regenerada', 'ok');
}

// ============================================================
//  GENERAR JSON
// ============================================================
function construirJSON() {
  const obj = {
    v: 1, t: "MGDL3D",
    g: {
      nx: state.nx, ny: state.ny, nz: state.nz,
      sx: round2(state.sx), sy: round2(state.sy), sz: round2(state.sz)
    },
    p: { E: round2(state.E), b: round2(state.b), W: round2(state.W) },
    z: round3(state.z), tt: round2(state.tt),
    elim: state.elementosEliminados,
    ap: Object.entries(state.apoyos).map(([id, t]) => [parseInt(id), t]),
    exc: {}
  };
  if (state.useSismo) obj.exc.sis = state.regSismo;
  if (state.useSin) obj.exc.sin = { a: round2(state.ampSin), f: round3(state.frecSin), p: state.pisoSin };
  if (state.useCI) obj.exc.ci = { u0: round3(state.u0), v0: round3(state.v0), p: state.pisoCI };
  return obj;
}

function round2(x) { return Math.round(x * 100) / 100; }
function round3(x) { return Math.round(x * 1000) / 1000; }

function actualizarBytes() {
  const json = JSON.stringify(construirJSON());
  const comp = LZString.compressToEncodedURIComponent(json);
  document.getElementById('bytes-raw').textContent = json.length;
  document.getElementById('bytes-comp').textContent = comp.length;

  const limite = 1500;
  const forzar = document.getElementById('forzarJsonBin').checked;
  const modoB = (comp.length > limite || forzar);
  const badge = document.getElementById('modo-qr');
  if (!modoB) {
    badge.textContent = 'QR Directo (offline)';
    badge.className = 'badge badge-A';
  } else {
    badge.textContent = 'QR con URL JSONBin';
    badge.className = 'badge badge-B';
  }
}

// ============================================================
//  GENERAR QR — usando QRious (canvas directo, super simple)
// ============================================================
async function generarQR() {
  setEstado('Generando...', 'info');

  // Verificar que QRious cargo
  if (typeof QRious === 'undefined') {
    setEstado('Error: Librería QR no cargada. Verifica conexión a internet y recarga.', 'error');
    console.error('QRious no esta definido. CDNs probablemente bloqueados.');
    return;
  }

  const jsonObj = construirJSON();
  const jsonStr = JSON.stringify(jsonObj);
  document.getElementById('jsonOut').value = JSON.stringify(jsonObj, null, 2);

  const compStr = LZString.compressToEncodedURIComponent(jsonStr);
  const limite = 1500;
  const forzar = document.getElementById('forzarJsonBin').checked;
  const usarJsonBin = compStr.length > limite || forzar;

  let qrPayload;
  if (usarJsonBin) {
    try {
      const url = await subirAJsonBin(jsonObj);
      qrPayload = "RDYN:" + url;
      setEstado('JSON subido a JSONBin. URL en QR.', 'ok');
    } catch (err) {
      setEstado('Error subiendo a JSONBin: ' + err.message, 'error');
      console.error(err);
      return;
    }
  } else {
    qrPayload = "RDYN:Z:" + compStr;
    setEstado('QR generado correctamente', 'ok');
  }

  dibujarQR(qrPayload);
}

function dibujarQR(payload) {
  const cont = document.getElementById('qr-container');
  cont.innerHTML = '';

  try {
    const canvas = document.createElement('canvas');
    cont.appendChild(canvas);

    new QRious({
      element: canvas,
      value: payload,
      size: 280,
      level: 'M',
      background: 'white',
      foreground: 'black',
      padding: 12
    });
  } catch (e) {
    setEstado('Error generando QR: ' + e.message, 'error');
    console.error(e);
    const div = document.createElement('div');
    div.className = 'qr-placeholder';
    div.textContent = 'Error: ' + e.message;
    cont.appendChild(div);
  }
}

// ============================================================
//  JSONBIN.IO
// ============================================================
async function subirAJsonBin(obj) {
  const key = document.getElementById('jsonBinKey').value.trim();
  const headers = {
    'Content-Type': 'application/json',
    'X-Bin-Private': 'false',
    'X-Bin-Name': 'reidyn-' + Date.now()
  };
  if (key) headers['X-Master-Key'] = key;

  const res = await fetch('https://api.jsonbin.io/v3/b', {
    method: 'POST', headers,
    body: JSON.stringify(obj)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('HTTP ' + res.status + ': ' + txt);
  }
  const data = await res.json();
  return 'https://api.jsonbin.io/v3/b/' + data.metadata.id + '/latest';
}

// ============================================================
//  ESTADO UI
// ============================================================
function setEstado(msg, tipo) {
  const e = document.getElementById('estado');
  e.textContent = msg;
  e.className = 'estado ' + tipo;
}

// ============================================================
//  EVENTOS DE INPUT
// ============================================================
function bindInputs() {
  const numFields = ['nx','ny','nz','sx','sy','sz','E','b','W','z','tt',
                     'ampSin','frecSin','pisoSin','u0','v0','pisoCI'];
  numFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      state[id] = parseFloat(el.value) || 0;
      if (['nx','ny','nz'].includes(id)) regenerarRegular();
      else { redibujar(); actualizarBytes(); }
    });
  });

  document.getElementById('useSismo').addEventListener('change', e => {
    state.useSismo = e.target.checked; actualizarBytes();
  });
  document.getElementById('regSismo').addEventListener('change', e => {
    state.regSismo = parseInt(e.target.value); actualizarBytes();
  });
  document.getElementById('useSin').addEventListener('change', e => {
    state.useSin = e.target.checked;
    document.getElementById('subSin').style.display = e.target.checked ? 'grid' : 'none';
    actualizarBytes();
  });
  document.getElementById('useCI').addEventListener('change', e => {
    state.useCI = e.target.checked;
    document.getElementById('subCI').style.display = e.target.checked ? 'grid' : 'none';
    actualizarBytes();
  });

  document.querySelectorAll('.modo-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.modo-btn').forEach(x => x.classList.remove('activo'));
      b.classList.add('activo');
      state.modo = b.dataset.modo;
      const hints = {
        ver: 'Solo rotar/ver la estructura',
        editar: 'Toca una viga o columna para eliminarla. Vuelve a tocarla para restaurar.',
        apoyo: 'Toca un nodo de la base para asignarle el apoyo seleccionado.'
      };
      document.getElementById('hintModo').textContent = hints[state.modo];
    });
  });

  document.querySelectorAll('.apoyo-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.apoyo-btn').forEach(x => x.classList.remove('activo'));
      b.classList.add('activo');
      state.apoyoSel = parseInt(b.dataset.apoyo);
    });
  });

  document.getElementById('btnRegular').addEventListener('click', regenerarRegular);
  document.getElementById('btnGenerar').addEventListener('click', generarQR);

  document.getElementById('btnCopiar').addEventListener('click', () => {
    const txt = document.getElementById('jsonOut').value;
    if (!txt) { setEstado('Genera el JSON primero', 'error'); return; }
    navigator.clipboard.writeText(txt).then(() => setEstado('JSON copiado', 'ok'));
  });

  document.getElementById('btnDescargar').addEventListener('click', () => {
    const txt = document.getElementById('jsonOut').value;
    if (!txt) { setEstado('Genera el JSON primero', 'error'); return; }
    const blob = new Blob([txt], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'reidyn-' + Date.now() + '.json'; a.click();
    URL.revokeObjectURL(url);
    setEstado('JSON descargado', 'ok');
  });

  document.getElementById('forzarJsonBin').addEventListener('change', actualizarBytes);
}

// ============================================================
//  INIT
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  init3D();
  bindInputs();
  regenerarRegular();

  // Verificar que QRious cargo, sino mostrar advertencia
  setTimeout(() => {
    if (typeof QRious === 'undefined') {
      setEstado('Advertencia: librería QR no cargó. Verifica conexión.', 'error');
    }
  }, 1500);
});
