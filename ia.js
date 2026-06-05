/* ============================================================
   ReiDyn Builder — Modulo de IA v2 (multi-imagen)
   Permite subir hasta 4 imagenes para mejor reconocimiento.
   Mantiene canvas de dibujo libre para casos rapidos.
   ============================================================ */

// URL del backend en Vercel
const IA_ENDPOINT = "https://dyna-struc-ia-backend-lvbj.vercel.app/api/analizar";

// Configuracion
const MAX_IMAGENES = 4;

// ============================================================
//  ESTADO DEL CANVAS DE DIBUJO (igual que antes)
// ============================================================
let iaCanvas, iaCtx;
let iaDibujando = false;
let iaTrazos = [];
let iaTrazoActual = null;

// ============================================================
//  ESTADO MULTI-IMAGEN
//  Lista de objetos: { base64, mimeType, dataUrl }
// ============================================================
let iaImagenes = [];

// ============================================================
//  INICIALIZAR CANVAS (sin cambios)
// ============================================================
function iaInitCanvas() {
  iaCanvas = document.getElementById('ia-canvas');
  if (!iaCanvas) return;
  iaCtx = iaCanvas.getContext('2d');
  iaLimpiarCanvas();
  iaCanvas.addEventListener('mousedown', iaInicioTrazo);
  iaCanvas.addEventListener('mousemove', iaMoverTrazo);
  iaCanvas.addEventListener('mouseup', iaFinTrazo);
  iaCanvas.addEventListener('mouseleave', iaFinTrazo);
  iaCanvas.addEventListener('touchstart', iaTouchStart, { passive: false });
  iaCanvas.addEventListener('touchmove', iaTouchMove, { passive: false });
  iaCanvas.addEventListener('touchend', iaFinTrazo);
}

function iaPosicion(e) {
  const rect = iaCanvas.getBoundingClientRect();
  const scaleX = iaCanvas.width / rect.width;
  const scaleY = iaCanvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function iaInicioTrazo(e) { iaDibujando = true; iaTrazoActual = [iaPosicion(e)]; }
function iaMoverTrazo(e) {
  if (!iaDibujando) return;
  iaTrazoActual.push(iaPosicion(e));
  iaRedibujarCanvas();
  iaDibujarLinea(iaTrazoActual);
}
function iaFinTrazo() {
  if (!iaDibujando) return;
  iaDibujando = false;
  if (iaTrazoActual && iaTrazoActual.length > 1) iaTrazos.push(iaTrazoActual);
  iaTrazoActual = null;
  iaRedibujarCanvas();
}
function iaTouchStart(e) { e.preventDefault(); const t = e.touches[0]; iaInicioTrazo({ clientX: t.clientX, clientY: t.clientY }); }
function iaTouchMove(e) { e.preventDefault(); const t = e.touches[0]; iaMoverTrazo({ clientX: t.clientX, clientY: t.clientY }); }

function iaDibujarLinea(puntos) {
  iaCtx.strokeStyle = '#111';
  iaCtx.lineWidth = 4;
  iaCtx.lineJoin = 'round';
  iaCtx.lineCap = 'round';
  iaCtx.beginPath();
  iaCtx.moveTo(puntos[0].x, puntos[0].y);
  for (let i = 1; i < puntos.length; i++) iaCtx.lineTo(puntos[i].x, puntos[i].y);
  iaCtx.stroke();
}

function iaRedibujarCanvas() {
  iaLimpiarCanvas(false);
  for (const trazo of iaTrazos) iaDibujarLinea(trazo);
}

function iaLimpiarCanvas(borrarTrazos = true) {
  if (borrarTrazos) iaTrazos = [];
  iaCtx.fillStyle = '#ffffff';
  iaCtx.fillRect(0, 0, iaCanvas.width, iaCanvas.height);
}

function iaDeshacer() { iaTrazos.pop(); iaRedibujarCanvas(); }

// ============================================================
//  MULTI-IMAGEN: cargar archivos y manejar la lista
// ============================================================
function iaCargarArchivoComoImagen(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1];
      const mime = dataUrl.substring(5, dataUrl.indexOf(';'));
      resolve({ base64, mimeType: mime, dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function iaAgregarImagenes(files) {
  if (!files || files.length === 0) return;

  // Calcular cuantas podemos agregar
  const espacioDisponible = MAX_IMAGENES - iaImagenes.length;
  if (espacioDisponible <= 0) {
    iaSetEstado(`Maximo ${MAX_IMAGENES} imagenes. Elimina alguna primero.`, 'error');
    return;
  }

  const aProcesar = Array.from(files).slice(0, espacioDisponible);
  const ignoradas = files.length - aProcesar.length;

  for (const file of aProcesar) {
    if (!file.type.startsWith('image/')) {
      iaSetEstado(`"${file.name}" no es una imagen, se ignora`, 'error');
      continue;
    }
    try {
      const img = await iaCargarArchivoComoImagen(file);
      iaImagenes.push(img);
    } catch (err) {
      iaSetEstado('Error al cargar imagen: ' + err.message, 'error');
    }
  }

  if (ignoradas > 0) {
    iaSetEstado(`Se agregaron ${aProcesar.length} imagenes. ${ignoradas} ignoradas (max ${MAX_IMAGENES}).`, 'info');
  } else {
    iaSetEstado(`${iaImagenes.length}/${MAX_IMAGENES} imagenes cargadas`, 'info');
  }

  iaRenderizarMiniaturas();
  iaActualizarBotonAnalizar();
}

function iaQuitarImagen(idx) {
  if (idx < 0 || idx >= iaImagenes.length) return;
  iaImagenes.splice(idx, 1);
  iaRenderizarMiniaturas();
  iaActualizarBotonAnalizar();
  iaSetEstado(`${iaImagenes.length}/${MAX_IMAGENES} imagenes`, 'info');
}

function iaLimpiarImagenes() {
  iaImagenes = [];
  iaRenderizarMiniaturas();
  iaActualizarBotonAnalizar();
}

function iaRenderizarMiniaturas() {
  const cont = document.getElementById('ia-miniaturas');
  if (!cont) return;
  cont.innerHTML = '';

  // Renderizar cada imagen con boton de borrar
  iaImagenes.forEach((img, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'ia-miniatura';

    const im = document.createElement('img');
    im.src = img.dataUrl;
    im.alt = 'Vista ' + (idx + 1);

    const lbl = document.createElement('div');
    lbl.className = 'ia-miniatura-label';
    lbl.textContent = 'Vista ' + (idx + 1);

    const btn = document.createElement('button');
    btn.className = 'ia-miniatura-quitar';
    btn.type = 'button';
    btn.innerHTML = '&times;';
    btn.title = 'Quitar';
    btn.onclick = () => iaQuitarImagen(idx);

    wrap.appendChild(im);
    wrap.appendChild(lbl);
    wrap.appendChild(btn);
    cont.appendChild(wrap);
  });

  // Slot vacio para agregar mas (si hay espacio)
  if (iaImagenes.length < MAX_IMAGENES) {
    const add = document.createElement('label');
    add.className = 'ia-miniatura-add';
    add.htmlFor = 'ia-input-imagen';
    add.innerHTML = '<span>+</span><div>Agregar imagen</div>';
    cont.appendChild(add);
  }

  // Contador
  const contador = document.getElementById('ia-contador-imagenes');
  if (contador) contador.textContent = `${iaImagenes.length}/${MAX_IMAGENES} imagenes`;
}

function iaActualizarBotonAnalizar() {
  const btn = document.getElementById('ia-analizar-imagenes');
  if (!btn) return;
  if (iaImagenes.length === 0) {
    btn.disabled = true;
    btn.classList.add('btn-deshabilitado');
  } else {
    btn.disabled = false;
    btn.classList.remove('btn-deshabilitado');
  }
}

// ============================================================
//  ANALIZAR — soporta single (canvas) o multi (imagenes)
// ============================================================
async function iaAnalizarMultiImagen() {
  if (iaImagenes.length === 0) {
    iaSetEstado('Agrega al menos una imagen', 'error');
    return;
  }
  iaSetEstado(`Analizando ${iaImagenes.length} imagen(es) con IA...`, 'info');
  iaMostrarSpinner(true);

  try {
    // Construir el array que espera el backend
    const payload = {
      imagenesBase64: iaImagenes.map(img => ({
        data: img.base64,
        mimeType: img.mimeType
      }))
    };

    const res = await fetch(IA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Backend respondio ' + res.status + ': ' + txt);
    }

    const data = await res.json();
    if (!data.ok || !data.estructura) {
      throw new Error(data.error || 'Respuesta invalida del backend');
    }

    iaMostrarSpinner(false);
    iaMostrarResultado(data.estructura);
  } catch (err) {
    iaMostrarSpinner(false);
    iaSetEstado('Error: ' + err.message, 'error');
    console.error('[IA] Error multi:', err);
  }
}

async function iaAnalizarDibujo() {
  if (iaTrazos.length === 0) {
    iaSetEstado('Dibuja una estructura primero', 'error');
    return;
  }
  iaSetEstado('Analizando dibujo con IA...', 'info');
  iaMostrarSpinner(true);

  try {
    const dataUrl = iaCanvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    const res = await fetch(IA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagenBase64: base64, mimeType: 'image/png' })
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Backend respondio ' + res.status + ': ' + txt);
    }

    const data = await res.json();
    if (!data.ok || !data.estructura) {
      throw new Error(data.error || 'Respuesta invalida del backend');
    }

    iaMostrarSpinner(false);
    iaMostrarResultado(data.estructura);
  } catch (err) {
    iaMostrarSpinner(false);
    iaSetEstado('Error: ' + err.message, 'error');
    console.error('[IA] Error dibujo:', err);
  }
}

// ============================================================
//  APLICAR ESTRUCTURA AL EDITOR (igual que antes)
// ============================================================
function iaAplicarEstructura(est) {
  state.nx = Math.max(2, Math.min(8, Math.round(est.nx || 3)));
  state.ny = Math.max(1, Math.min(10, Math.round(est.ny || 3)));
  state.nz = Math.max(1, Math.min(6, Math.round(est.nz || 1)));
  state.sx = Math.max(1, Math.min(20, est.sx || 5));
  state.sy = Math.max(1, Math.min(6, est.sy || 3));
  state.sz = Math.max(1, Math.min(20, est.sz || 4));

  state.elementosEliminados = [];
  state.apoyos = {};
  state.diagonales = [];

  for (let mz = 0; mz < state.nz; mz++) {
    for (let ex = 0; ex < state.nx; ex++) {
      const nodoId = obtenerIdNodo(ex, 0, mz);
      state.apoyos[nodoId] = 1;
    }
  }

  if (Array.isArray(est.elementosFaltantes)) {
    for (const ef of est.elementosFaltantes) {
      let tipo;
      if (ef.tipo === 'columna') tipo = 1;
      else if (ef.tipo === 'vigaX') tipo = 2;
      else if (ef.tipo === 'vigaZ') tipo = 3;
      else continue;
      const ex = ef.ejeX || 0;
      const ny = ef.nivelY || 0;
      const mz = ef.marcoZ || 0;
      if (!esEliminado(tipo, ex, ny, mz)) {
        state.elementosEliminados.push([tipo, ex, ny, mz]);
      }
    }
  }

  // Diagonales
  if (Array.isArray(est.diagonales)) {
    for (const d of est.diagonales) {
      const exA = Math.max(0, Math.min(state.nx - 1, d.ejeXA || 0));
      const nyA = Math.max(0, Math.min(state.ny, d.nivelYA || 0));
      const mzA = Math.max(0, Math.min(state.nz - 1, d.marcoZA || 0));
      const exB = Math.max(0, Math.min(state.nx - 1, d.ejeXB || 0));
      const nyB = Math.max(0, Math.min(state.ny, d.nivelYB || 0));
      const mzB = Math.max(0, Math.min(state.nz - 1, d.marcoZB || 0));
      const nodoA = obtenerIdNodo(exA, nyA, mzA);
      const nodoB = obtenerIdNodo(exB, nyB, mzB);
      if (nodoA === nodoB) continue;
      const yaExiste = state.diagonales.some(diag =>
        (diag[0] === nodoA && diag[1] === nodoB) || (diag[0] === nodoB && diag[1] === nodoA));
      if (!yaExiste) state.diagonales.push([nodoA, nodoB]);
    }
  }

  // Sincronizar inputs
  document.getElementById('nx').value = state.nx;
  document.getElementById('ny').value = state.ny;
  document.getElementById('nz').value = state.nz;
  document.getElementById('sx').value = state.sx;
  document.getElementById('sy').value = state.sy;
  document.getElementById('sz').value = state.sz;

  redibujar();
  actualizarBytes();
}

// ============================================================
//  PANEL DE RESULTADO
// ============================================================
let iaEstructuraPendiente = null;

function iaMostrarResultado(est) {
  iaEstructuraPendiente = est;
  const panel = document.getElementById('ia-resultado');
  if (!panel) return;

  const conf = Math.round((est.confianza || 0) * 100);
  let colorConf = '#5DCAA5';
  if (conf < 50) colorConf = '#E24B4A';
  else if (conf < 75) colorConf = '#E4A33B';

  const nDiag = (est.diagonales || []).length;
  const nFalt = (est.elementosFaltantes || []).length;
  const imgsUsadas = est._meta?.imagenesUsadas || 1;

  panel.innerHTML = `
    <div style="font-weight:600; margin-bottom:8px; color:#e8e8ec;">La IA detectó (${imgsUsadas} imagen${imgsUsadas>1?'es':''}):</div>
    <div style="font-size:13px; color:#a0a0aa; line-height:1.6;">
      Pisos: <b style="color:#e8e8ec;">${est.ny}</b> &nbsp;|&nbsp;
      Ejes X: <b style="color:#e8e8ec;">${est.nx}</b> &nbsp;|&nbsp;
      Marcos Z: <b style="color:#e8e8ec;">${est.nz}</b><br>
      Diagonales: <b style="color:#FF6B4A;">${nDiag}</b> &nbsp;|&nbsp;
      Elementos faltantes: <b style="color:#e8e8ec;">${nFalt}</b><br>
      Confianza: <b style="color:${colorConf};">${conf}%</b>
    </div>
    <div style="font-size:12px; color:#6e6e7a; margin-top:8px; font-style:italic;">
      ${est.notas || ''}
    </div>
    <div style="display:flex; gap:8px; margin-top:14px;">
      <button class="btn-primario" onclick="iaAceptarResultado()" style="flex:1;">Aceptar y editar</button>
      <button class="btn-secundario" onclick="iaRechazarResultado()" style="flex:1;">Descartar</button>
    </div>
    ${conf < 50 ? '<div style="font-size:11px; color:#E24B4A; margin-top:8px;">⚠ Confianza baja. Prueba agregar mas vistas o revisa bien la estructura.</div>' : ''}
  `;
  panel.style.display = 'block';
}

function iaAceptarResultado() {
  if (!iaEstructuraPendiente) return;
  iaAplicarEstructura(iaEstructuraPendiente);
  iaSetEstado('Estructura cargada. Puedes editarla y generar el QR.', 'ok');
  document.getElementById('ia-resultado').style.display = 'none';
  iaCerrarModal();
  iaEstructuraPendiente = null;
  // Limpiar imagenes para no acumular en el modal
  iaLimpiarImagenes();
}

function iaRechazarResultado() {
  iaEstructuraPendiente = null;
  document.getElementById('ia-resultado').style.display = 'none';
  iaSetEstado('Resultado descartado. Puedes intentar de nuevo o agregar mas imagenes.', 'info');
}

// ============================================================
//  UI HELPERS
// ============================================================
function iaSetEstado(msg, tipo) {
  const e = document.getElementById('ia-estado');
  if (!e) return;
  e.textContent = msg;
  e.className = 'estado ' + tipo;
  e.style.display = 'block';
}

function iaMostrarSpinner(mostrar) {
  const s = document.getElementById('ia-spinner');
  if (s) s.style.display = mostrar ? 'flex' : 'none';
}

function iaAbrirModal() {
  document.getElementById('ia-modal').style.display = 'flex';
  if (!iaCanvas) iaInitCanvas();
  else iaLimpiarCanvas();
  iaRenderizarMiniaturas();
  iaActualizarBotonAnalizar();
}

function iaCerrarModal() {
  document.getElementById('ia-modal').style.display = 'none';
}

// ============================================================
//  CONECTAR EVENTOS
// ============================================================
function iaBindEventos() {
  const btnAbrir = document.getElementById('btnIA');
  if (btnAbrir) btnAbrir.addEventListener('click', iaAbrirModal);

  const btnCerrar = document.getElementById('ia-cerrar');
  if (btnCerrar) btnCerrar.addEventListener('click', iaCerrarModal);

  // Canvas
  const btnLimpiar = document.getElementById('ia-limpiar');
  if (btnLimpiar) btnLimpiar.addEventListener('click', () => iaLimpiarCanvas());
  const btnDeshacer = document.getElementById('ia-deshacer');
  if (btnDeshacer) btnDeshacer.addEventListener('click', iaDeshacer);

  // Analizar dibujo (canvas)
  const btnAnalizarDibujo = document.getElementById('ia-analizar-dibujo');
  if (btnAnalizarDibujo) btnAnalizarDibujo.addEventListener('click', iaAnalizarDibujo);

  // Subir imagenes (multiple)
  const inputImg = document.getElementById('ia-input-imagen');
  if (inputImg) {
    inputImg.addEventListener('change', async (e) => {
      await iaAgregarImagenes(e.target.files);
      // Limpiar el input para poder volver a seleccionar la misma imagen si quiere
      e.target.value = '';
    });
  }

  // Analizar imagenes (multi)
  const btnAnalizarImg = document.getElementById('ia-analizar-imagenes');
  if (btnAnalizarImg) btnAnalizarImg.addEventListener('click', iaAnalizarMultiImagen);

  // Limpiar todas las imagenes
  const btnLimpiarImg = document.getElementById('ia-limpiar-imagenes');
  if (btnLimpiarImg) btnLimpiarImg.addEventListener('click', iaLimpiarImagenes);

  // Tabs
  document.querySelectorAll('.ia-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ia-tab').forEach(t => t.classList.remove('activo'));
      tab.classList.add('activo');
      const modo = tab.dataset.modo;
      document.getElementById('ia-panel-dibujo').style.display = (modo === 'dibujo') ? 'block' : 'none';
      document.getElementById('ia-panel-imagen').style.display = (modo === 'imagen') ? 'block' : 'none';
    });
  });
}

window.addEventListener('DOMContentLoaded', () => { iaBindEventos(); });
