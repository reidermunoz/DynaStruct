/* ============================================================
   ReiDyn Builder — Modulo de IA (dibujo + imagen)
   Se conecta al backend de Vercel que llama a Gemini.
   ============================================================ */

// URL de tu backend en Vercel
const IA_ENDPOINT = "https://dyna-struc-ia-backend-lvbj.vercel.app/api/analizar";

// ============================================================
//  ESTADO DEL CANVAS DE DIBUJO
// ============================================================
let iaCanvas, iaCtx;
let iaDibujando = false;
let iaTrazos = [];          // historial para deshacer
let iaTrazoActual = null;

// ============================================================
//  INICIALIZAR EL CANVAS DE DIBUJO
// ============================================================
function iaInitCanvas() {
  iaCanvas = document.getElementById('ia-canvas');
  if (!iaCanvas) return;
  iaCtx = iaCanvas.getContext('2d');

  // Fondo blanco (importante: la IA ve mejor sobre blanco)
  iaLimpiarCanvas();

  // Eventos de mouse
  iaCanvas.addEventListener('mousedown', iaInicioTrazo);
  iaCanvas.addEventListener('mousemove', iaMoverTrazo);
  iaCanvas.addEventListener('mouseup', iaFinTrazo);
  iaCanvas.addEventListener('mouseleave', iaFinTrazo);

  // Eventos tactiles (para tablets)
  iaCanvas.addEventListener('touchstart', iaTouchStart, { passive: false });
  iaCanvas.addEventListener('touchmove', iaTouchMove, { passive: false });
  iaCanvas.addEventListener('touchend', iaFinTrazo);
}

function iaPosicion(e) {
  const rect = iaCanvas.getBoundingClientRect();
  const scaleX = iaCanvas.width / rect.width;
  const scaleY = iaCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function iaInicioTrazo(e) {
  iaDibujando = true;
  const p = iaPosicion(e);
  iaTrazoActual = [p];
}

function iaMoverTrazo(e) {
  if (!iaDibujando) return;
  const p = iaPosicion(e);
  iaTrazoActual.push(p);
  iaRedibujarCanvas();
  // Dibujar el trazo en curso
  iaDibujarLinea(iaTrazoActual);
}

function iaFinTrazo() {
  if (!iaDibujando) return;
  iaDibujando = false;
  if (iaTrazoActual && iaTrazoActual.length > 1) {
    iaTrazos.push(iaTrazoActual);
  }
  iaTrazoActual = null;
  iaRedibujarCanvas();
}

// Touch handlers
function iaTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  iaInicioTrazo({ clientX: t.clientX, clientY: t.clientY });
}
function iaTouchMove(e) {
  e.preventDefault();
  const t = e.touches[0];
  iaMoverTrazo({ clientX: t.clientX, clientY: t.clientY });
}

function iaDibujarLinea(puntos) {
  iaCtx.strokeStyle = '#111';
  iaCtx.lineWidth = 4;
  iaCtx.lineJoin = 'round';
  iaCtx.lineCap = 'round';
  iaCtx.beginPath();
  iaCtx.moveTo(puntos[0].x, puntos[0].y);
  for (let i = 1; i < puntos.length; i++) {
    iaCtx.lineTo(puntos[i].x, puntos[i].y);
  }
  iaCtx.stroke();
}

function iaRedibujarCanvas() {
  iaLimpiarCanvas(false);
  for (const trazo of iaTrazos) {
    iaDibujarLinea(trazo);
  }
}

function iaLimpiarCanvas(borrarTrazos = true) {
  if (borrarTrazos) iaTrazos = [];
  iaCtx.fillStyle = '#ffffff';
  iaCtx.fillRect(0, 0, iaCanvas.width, iaCanvas.height);
}

function iaDeshacer() {
  iaTrazos.pop();
  iaRedibujarCanvas();
}

// ============================================================
//  SUBIR IMAGEN
// ============================================================
function iaCargarImagen(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      // Devuelve base64 SIN el prefijo "data:image/...;base64,"
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1];
      const mime = dataUrl.substring(5, dataUrl.indexOf(';'));
      resolve({ base64, mime });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
//  ENVIAR A LA IA (backend Vercel -> Gemini)
// ============================================================
async function iaAnalizar(base64, mimeType) {
  const res = await fetch(IA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagenBase64: base64, mimeType })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Backend respondio ' + res.status + ': ' + txt);
  }

  const data = await res.json();
  if (!data.ok || !data.estructura) {
    throw new Error(data.error || 'Respuesta invalida del backend');
  }
  return data.estructura;
}

// ============================================================
//  APLICAR LA ESTRUCTURA RECONOCIDA AL EDITOR
//  (usa el 'state' global del script.js principal)
// ============================================================
function iaAplicarEstructura(est) {
  // Validar y clampear valores
  state.nx = Math.max(2, Math.min(8, Math.round(est.nx || 3)));
  state.ny = Math.max(1, Math.min(10, Math.round(est.ny || 3)));
  state.nz = Math.max(1, Math.min(6, Math.round(est.nz || 1)));
  state.sx = Math.max(1, Math.min(20, est.sx || 5));
  state.sy = Math.max(1, Math.min(6, est.sy || 3));
  state.sz = Math.max(1, Math.min(20, est.sz || 4));

  // Regenerar estructura regular base
  state.elementosEliminados = [];
  state.apoyos = {};
  for (let mz = 0; mz < state.nz; mz++) {
    for (let ex = 0; ex < state.nx; ex++) {
      const nodoId = obtenerIdNodo(ex, 0, mz);
      state.apoyos[nodoId] = 1;  // empotrado por defecto
    }
  }

  // Aplicar elementos faltantes detectados por la IA
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
      // Evitar duplicados
      if (!esEliminado(tipo, ex, ny, mz)) {
        state.elementosEliminados.push([tipo, ex, ny, mz]);
      }
    }
  }

    // Aplicar diagonales detectadas por la IA
  state.diagonales = [];
  if (Array.isArray(est.diagonales)) {
    for (const d of est.diagonales) {
      // Validar que los nodos esten dentro de la grilla
      const exA = Math.max(0, Math.min(state.nx - 1, d.ejeXA || 0));
      const nyA = Math.max(0, Math.min(state.ny, d.nivelYA || 0));
      const mzA = Math.max(0, Math.min(state.nz - 1, d.marcoZA || 0));
      const exB = Math.max(0, Math.min(state.nx - 1, d.ejeXB || 0));
      const nyB = Math.max(0, Math.min(state.ny, d.nivelYB || 0));
      const mzB = Math.max(0, Math.min(state.nz - 1, d.marcoZB || 0));

      const nodoA = obtenerIdNodo(exA, nyA, mzA);
      const nodoB = obtenerIdNodo(exB, nyB, mzB);

      // Evitar diagonales degeneradas (mismo nodo) o duplicadas
      if (nodoA === nodoB) continue;
      const yaExiste = state.diagonales.some(diag =>
        (diag[0] === nodoA && diag[1] === nodoB) ||
        (diag[0] === nodoB && diag[1] === nodoA));
      if (!yaExiste) {
        state.diagonales.push([nodoA, nodoB]);
      }
    }
  }
   

  // Sincronizar los inputs de la UI con los nuevos valores
  document.getElementById('nx').value = state.nx;
  document.getElementById('ny').value = state.ny;
  document.getElementById('nz').value = state.nz;
  document.getElementById('sx').value = state.sx;
  document.getElementById('sy').value = state.sy;
  document.getElementById('sz').value = state.sz;

  // Redibujar la estructura 3D y actualizar
  redibujar();
  actualizarBytes();
}

// ============================================================
//  FLUJO PRINCIPAL: procesar imagen (dibujo o subida)
// ============================================================
async function iaProcesarImagen(base64, mimeType) {
  iaSetEstado('Analizando estructura con IA...', 'info');
  iaMostrarSpinner(true);

  try {
    const est = await iaAnalizar(base64, mimeType);
    iaMostrarSpinner(false);

    // Mostrar panel de resultado con la confianza
    iaMostrarResultado(est);

  } catch (err) {
    iaMostrarSpinner(false);
    iaSetEstado('Error: ' + err.message, 'error');
    console.error('[IA] Error:', err);
  }
}

// ============================================================
//  PANEL DE RESULTADO / VALIDACION
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

  panel.innerHTML = `
    <div style="font-weight:600; margin-bottom:8px; color:#e8e8ec;">La IA detectó:</div>
    <div style="font-size:13px; color:#a0a0aa; line-height:1.6;">
      Pisos: <b style="color:#e8e8ec;">${est.ny}</b> &nbsp;|&nbsp;
      Ejes X: <b style="color:#e8e8ec;">${est.nx}</b> &nbsp;|&nbsp;
      Marcos Z: <b style="color:#e8e8ec;">${est.nz}</b><br>
      Elementos faltantes: <b style="color:#e8e8ec;">${(est.elementosFaltantes || []).length}</b><br>
      Confianza: <b style="color:${colorConf};">${conf}%</b>
    </div>
    <div style="font-size:12px; color:#6e6e7a; margin-top:8px; font-style:italic;">
      ${est.notas || ''}
    </div>
    <div style="display:flex; gap:8px; margin-top:14px;">
      <button class="btn-primario" onclick="iaAceptarResultado()" style="flex:1;">Aceptar y editar</button>
      <button class="btn-secundario" onclick="iaRechazarResultado()" style="flex:1;">Descartar</button>
    </div>
    ${conf < 50 ? '<div style="font-size:11px; color:#E24B4A; margin-top:8px;">⚠ Confianza baja. Revisa bien la estructura o intenta con un dibujo más claro.</div>' : ''}
  `;
  panel.style.display = 'block';
}

function iaAceptarResultado() {
  if (!iaEstructuraPendiente) return;
  iaAplicarEstructura(iaEstructuraPendiente);
  iaSetEstado('Estructura cargada. Ahora puedes editarla y generar el QR.', 'ok');
  document.getElementById('ia-resultado').style.display = 'none';
  iaCerrarModal();
  iaEstructuraPendiente = null;
}

function iaRechazarResultado() {
  iaEstructuraPendiente = null;
  document.getElementById('ia-resultado').style.display = 'none';
  iaSetEstado('Resultado descartado. Puedes intentar de nuevo.', 'info');
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
  // Inicializar canvas la primera vez
  if (!iaCanvas) iaInitCanvas();
  else iaLimpiarCanvas();
}

function iaCerrarModal() {
  document.getElementById('ia-modal').style.display = 'none';
}

// ============================================================
//  CONECTAR EVENTOS (llamar despues de cargar el DOM)
// ============================================================
function iaBindEventos() {
  // Boton para abrir el modal de IA
  const btnAbrir = document.getElementById('btnIA');
  if (btnAbrir) btnAbrir.addEventListener('click', iaAbrirModal);

  // Cerrar modal
  const btnCerrar = document.getElementById('ia-cerrar');
  if (btnCerrar) btnCerrar.addEventListener('click', iaCerrarModal);

  // Canvas: limpiar y deshacer
  const btnLimpiar = document.getElementById('ia-limpiar');
  if (btnLimpiar) btnLimpiar.addEventListener('click', () => iaLimpiarCanvas());
  const btnDeshacer = document.getElementById('ia-deshacer');
  if (btnDeshacer) btnDeshacer.addEventListener('click', iaDeshacer);

  // Analizar el dibujo del canvas
  const btnAnalizarDibujo = document.getElementById('ia-analizar-dibujo');
  if (btnAnalizarDibujo) btnAnalizarDibujo.addEventListener('click', () => {
    if (iaTrazos.length === 0) {
      iaSetEstado('Dibuja una estructura primero', 'error');
      return;
    }
    // Convertir canvas a base64
    const dataUrl = iaCanvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    iaProcesarImagen(base64, 'image/png');
  });

  // Subir imagen
  const inputImg = document.getElementById('ia-input-imagen');
  if (inputImg) inputImg.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { base64, mime } = await iaCargarImagen(file);
      // Mostrar preview
      const prev = document.getElementById('ia-preview');
      if (prev) {
        prev.src = 'data:' + mime + ';base64,' + base64;
        prev.style.display = 'block';
      }
      iaProcesarImagen(base64, mime);
    } catch (err) {
      iaSetEstado('Error al cargar imagen: ' + err.message, 'error');
    }
  });

  // Tabs dibujo / imagen
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

// Auto-inicializar cuando carga el DOM
window.addEventListener('DOMContentLoaded', () => {
  iaBindEventos();
});
