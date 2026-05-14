/* ============================================================
   ReiDyn Builder — Logica principal
   ============================================================ */

// ============================================================
//  ESTADO GLOBAL
// ============================================================
const state = {
  nx: 3, ny: 3, nz: 3,
  sx: 5, sy: 3, sz: 4,
  E: 25, b: 30, W: 200, z: 0.05,
  // Elementos eliminados: cada uno [tipo, ejeX, nivelY, marcoZ]
  // tipo: 1=columna, 2=vigaX, 3=vigaZ
  elementosEliminados: [],
  // Apoyos: { nodoId: tipo } donde tipo 1=emp, 2=art, 3=patin
  apoyos: {},
  // Modo de edicion
  modo: 'ver',
  apoyoSel: 1,
  // Excitaciones
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
const colores = {
  columna: 0x5DCAA5,
  vigaX: 0x378ADD,
  vigaZ: 0xAFA9EC,
  apoyo: 0xBA7517,
  nodo: 0x666688,
  eliminado: 0x444444
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
  const ambient = new THREE.AmbientLight(0x404060, 0.7);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(10, 20, 10);
  scene.add(dir);

  // OrbitControls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 4, 0);

  // Raycaster para click en elementos
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('click', onCanvasClick);

  // Suelo de referencia
  const gridHelper = new THREE.GridHelper(30, 30, 0x222230, 0x16161c);
  scene.add(gridHelper);

  // Ejes
  const axes = new THREE.AxesHelper(2);
  scene.add(axes);

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
  // Limpiar grupo
  while (estructuraGroup.children.length > 0) {
    const obj = estructuraGroup.children[0];
    estructuraGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }

  // Centrar estructura
  const cx = (state.nx - 1) * state.sx / 2;
  const cz = (state.nz - 1) * state.sz / 2;

  // ---- Columnas ----
  for (let mz = 0; mz < state.nz; mz++) {
    for (let ex = 0; ex < state.nx; ex++) {
      for (let ny = 0; ny < state.ny; ny++) {
        const eliminado = esEliminado(1, ex, ny, mz);
        const p1 = new THREE.Vector3(ex * state.sx - cx, ny * state.sy, mz * state.sz - cz);
        const p2 = new THREE.Vector3(ex * state.sx - cx, (ny + 1) * state.sy, mz * state.sz - cz);
        crearLinea(p1, p2, eliminado ? colores.eliminado : colores.columna, 0.08,
          { tipo: 1, ex, ny, mz });
      }
    }
  }

  // ---- Vigas X ----
  for (let mz = 0; mz < state.nz; mz++) {
    for (let ny = 1; ny <= state.ny; ny++) {
      for (let ex = 0; ex < state.nx - 1; ex++) {
        const eliminado = esEliminado(2, ex, ny, mz);
        const p1 = new THREE.Vector3(ex * state.sx - cx, ny * state.sy, mz * state.sz - cz);
        const p2 = new THREE.Vector3((ex + 1) * state.sx - cx, ny * state.sy, mz * state.sz - cz);
        crearLinea(p1, p2, eliminado ? colores.eliminado : colores.vigaX, 0.08,
          { tipo: 2, ex, ny, mz });
      }
    }
  }

  // ---- Vigas Z ----
  for (let ny = 1; ny <= state.ny; ny++) {
    for (let ex = 0; ex < state.nx; ex++) {
      for (let mz = 0; mz < state.nz - 1; mz++) {
        const eliminado = esEliminado(3, ex, ny, mz);
        const p1 = new THREE.Vector3(ex * state.sx - cx, ny * state.sy, mz * state.sz - cz);
        const p2 = new THREE.Vector3(ex * state.sx - cx, ny * state.sy, (mz + 1) * state.sz - cz);
        crearLinea(p1, p2, eliminado ? colores.eliminado : colores.vigaZ, 0.08,
          { tipo: 3, ex, ny, mz });
      }
    }
  }

  // ---- Nodos ----
  for (let mz = 0; mz < state.nz; mz++) {
    for (let ex = 0; ex < state.nx; ex++) {
      for (let ny = 0; ny <= state.ny; ny++) {
        const nodoId = obtenerIdNodo(ex, ny, mz);
        const p = new THREE.Vector3(ex * state.sx - cx, ny * state.sy, mz * state.sz - cz);
        let color = colores.nodo;
        let radio = ny > 0 ? 0.15 : 0.1;
        if (state.apoyos[nodoId]) {
          color = colores.apoyo;
          radio = 0.22;
        }
        crearNodo(p, color, radio, { tipo: 'nodo', ex, ny, mz, nodoId });
      }
    }
  }

  // Recentrar camara/controles
  controls.target.set(0, state.ny * state.sy * 0.5, 0);
}

function crearLinea(p1, p2, color, grosor, userData) {
  // Cilindro entre p1 y p2 (para que sea clickeable)
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const longitud = dir.length();
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);

  const geo = new THREE.CylinderGeometry(grosor, grosor, longitud, 8);
  const mat = new THREE.MeshLambertMaterial({ color });
  const cyl = new THREE.Mesh(geo, mat);
  cyl.position.copy(mid);

  // Orientar el cilindro segun la direccion
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  cyl.quaternion.copy(q);

  cyl.userData = userData;
  estructuraGroup.add(cyl);
}

function crearNodo(pos, color, radio, userData) {
  const geo = new THREE.SphereGeometry(radio, 12, 12);
  const mat = new THREE.MeshLambertMaterial({ color });
  const sph = new THREE.Mesh(geo, mat);
  sph.position.copy(pos);
  sph.userData = userData;
  estructuraGroup.add(sph);
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
  const hits = raycaster.intersectObjects(estructuraGroup.children);
  if (hits.length === 0) return;

  const obj = hits[0].object;
  const ud = obj.userData;

  if (state.modo === 'borrar' && ud.tipo && ud.tipo !== 'nodo') {
    toggleEliminado(ud.tipo, ud.ex, ud.ny, ud.mz);
    redibujar();
    actualizarBytes();
  } else if (state.modo === 'apoyo' && ud.tipo === 'nodo' && ud.ny === 0) {
    if (state.apoyos[ud.nodoId] === state.apoyoSel) {
      delete state.apoyos[ud.nodoId];
    } else {
      state.apoyos[ud.nodoId] = state.apoyoSel;
    }
    redibujar();
    actualizarBytes();
  }
}

// ============================================================
//  HELPERS
// ============================================================
function obtenerIdNodo(ex, ny, mz) {
  // Mismo orden que SimulationDataMGDL3D.GenerarGrilla()
  // for mz, for ex, for ny
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
  // Apoyos por defecto: empotrados en todas las bases
  for (let mz = 0; mz < state.nz; mz++) {
    for (let ex = 0; ex < state.nx; ex++) {
      const nodoId = obtenerIdNodo(ex, 0, mz);
      state.apoyos[nodoId] = 1;
    }
  }
  redibujar();
  actualizarBytes();
}

// ============================================================
//  GENERAR JSON
// ============================================================
function construirJSON() {
  const obj = {
    v: 1,
    t: "MGDL3D",
    g: {
      nx: state.nx, ny: state.ny, nz: state.nz,
      sx: round2(state.sx), sy: round2(state.sy), sz: round2(state.sz)
    },
    p: {
      E: round2(state.E), b: round2(state.b), W: round2(state.W)
    },
    z: round3(state.z),
    tt: round2(state.tt),
    elim: state.elementosEliminados,
    ap: Object.entries(state.apoyos).map(([id, t]) => [parseInt(id), t]),
    exc: {}
  };
  if (state.useSismo) obj.exc.sis = state.regSismo;
  if (state.useSin) obj.exc.sin = {
    a: round2(state.ampSin), f: round3(state.frecSin), p: state.pisoSin
  };
  if (state.useCI) obj.exc.ci = {
    u0: round3(state.u0), v0: round3(state.v0), p: state.pisoCI
  };
  return obj;
}

function round2(x) { return Math.round(x * 100) / 100; }
function round3(x) { return Math.round(x * 1000) / 1000; }

// ============================================================
//  ACTUALIZAR INFO DE TAMAÑO
// ============================================================
function actualizarBytes() {
  const json = JSON.stringify(construirJSON());
  const comp = LZString.compressToEncodedURIComponent(json);
  document.getElementById('bytes-raw').textContent = json.length;
  document.getElementById('bytes-comp').textContent = comp.length;

  const limite = 1500; // ~1.5 KB
  const forzar = document.getElementById('forzarJsonBin').checked;
  const modo = (comp.length > limite || forzar) ? 'B' : 'A';
  const badge = document.getElementById('modo-qr');
  if (modo === 'A') {
    badge.textContent = 'QR Directo (offline)';
    badge.className = 'badge badge-A';
  } else {
    badge.textContent = 'QR con URL JSONBin';
    badge.className = 'badge badge-B';
  }
}

// ============================================================
//  GENERAR QR
// ============================================================
async function generarQR() {
  setEstado('Generando...', 'info');

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
    // Prefijo para indicar a la app que es JSON comprimido directo
    qrPayload = "RDYN:Z:" + compStr;
    setEstado('QR generado con JSON directo.', 'ok');
  }

  // Dibujar QR
  const cont = document.getElementById('qr-container');
  cont.innerHTML = '';
  const canv = document.createElement('canvas');
  cont.appendChild(canv);
  try {
    await QRCode.toCanvas(canv, qrPayload, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    });
  } catch (e) {
    setEstado('Error generando QR: ' + e.message, 'error');
    console.error(e);
    return;
  }
}

// ============================================================
//  SUBIDA A JSONBIN.IO
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
    method: 'POST',
    headers,
    body: JSON.stringify(obj)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('HTTP ' + res.status + ': ' + txt);
  }
  const data = await res.json();
  const binId = data.metadata.id;
  // URL publica para leer (sin auth necesaria si es publico)
  return 'https://api.jsonbin.io/v3/b/' + binId + '/latest';
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
      // Si cambiaron dimensiones, regenerar regular para limpiar
      if (['nx','ny','nz'].includes(id)) {
        regenerarRegular();
      } else {
        redibujar();
        actualizarBytes();
      }
    });
  });

  // Checkboxes
  document.getElementById('useSismo').addEventListener('change', e => {
    state.useSismo = e.target.checked;
    actualizarBytes();
  });
  document.getElementById('regSismo').addEventListener('change', e => {
    state.regSismo = parseInt(e.target.value);
    actualizarBytes();
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

  // Modos
  document.querySelectorAll('.modo-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.modo-btn').forEach(x => x.classList.remove('activo'));
      b.classList.add('activo');
      state.modo = b.dataset.modo;
    });
  });

  document.querySelectorAll('.apoyo-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.apoyo-btn').forEach(x => x.classList.remove('activo'));
      b.classList.add('activo');
      state.apoyoSel = parseInt(b.dataset.apoyo);
    });
  });

  // Botones
  document.getElementById('btnRegular').addEventListener('click', regenerarRegular);
  document.getElementById('btnGenerar').addEventListener('click', generarQR);

  document.getElementById('btnCopiar').addEventListener('click', () => {
    const txt = document.getElementById('jsonOut').value;
    if (!txt) { setEstado('Genera el JSON primero', 'error'); return; }
    navigator.clipboard.writeText(txt).then(() => {
      setEstado('JSON copiado al portapapeles', 'ok');
    });
  });

  document.getElementById('btnDescargar').addEventListener('click', () => {
    const txt = document.getElementById('jsonOut').value;
    if (!txt) { setEstado('Genera el JSON primero', 'error'); return; }
    const blob = new Blob([txt], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reidyn-' + Date.now() + '.json';
    a.click();
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
});
