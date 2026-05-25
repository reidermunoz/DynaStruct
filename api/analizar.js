// ============================================================
//  ReiDyn IA Backend — Serverless Function para Vercel
//  Ruta: /api/analizar
//
//  Recibe una imagen (base64) desde la web, la manda a Gemini
//  con un prompt especifico, y devuelve el JSON estructural.
//
//  La API KEY de Gemini vive en variables de entorno (GEMINI_API_KEY)
//  NUNCA en el codigo. Configurarla en el dashboard de Vercel.
// ============================================================

export default async function handler(req, res) {
  // ---- CORS: permitir que tu GitHub Pages llame a este endpoint ----
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight (el navegador pregunta permiso antes del POST)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo se permite POST' });
  }

  try {
    const { imagenBase64, mimeType } = req.body;

    if (!imagenBase64) {
      return res.status(400).json({ error: 'Falta la imagen (imagenBase64)' });
    }

    // La API key esta oculta en las variables de entorno de Vercel
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'API key no configurada en el servidor' });
    }

    // ---- Prompt especifico para analisis estructural ----
    const prompt = `Eres un asistente experto en analisis estructural. Analiza esta imagen de una estructura (portico, edificacion o marco estructural dibujado a mano o esquematico) y devuelve UNICAMENTE un objeto JSON valido, sin texto adicional, sin markdown, sin explicaciones fuera del JSON.

Formato exacto requerido:
{
  "nx": <numero entero de ejes verticales/columnas en direccion X, minimo 2>,
  "ny": <numero entero de pisos/niveles, minimo 1>,
  "nz": <numero entero de marcos en profundidad Z, usa 1 si la estructura es claramente 2D/plana>,
  "sx": <luz tipica entre ejes X en metros, estima 5 si no es determinable>,
  "sy": <altura tipica de piso en metros, estima 3 si no es determinable>,
  "sz": <profundidad entre marcos en metros, estima 4 si no es determinable>,
  "elementosFaltantes": [
    {"tipo": "columna", "ejeX": <0-indexado>, "nivelY": <0-indexado>, "marcoZ": <0-indexado>},
    {"tipo": "vigaX", "ejeX": <0-indexado>, "nivelY": <1-indexado>, "marcoZ": <0-indexado>},
    {"tipo": "vigaZ", "ejeX": <0-indexado>, "nivelY": <1-indexado>, "marcoZ": <0-indexado>}
  ],
  "confianza": <numero entre 0 y 1 indicando que tan seguro estas del reconocimiento>,
  "notas": "<breve descripcion en espanol de lo que detectaste, max 150 caracteres>"
}

Reglas de interpretacion:
- Cuenta los PISOS (ny) contando los niveles horizontales de vigas por encima de la base.
- Cuenta los EJES X (nx) contando las lineas verticales (columnas) de izquierda a derecha.
- Una estructura regular tiene todas las columnas y vigas. Si detectas HUECOS (lugares donde claramente falta una columna o viga que romperia la regularidad), agregalos a "elementosFaltantes". Si la estructura es completamente regular, deja "elementosFaltantes" como array vacio [].
- tipo "columna": elemento vertical entre nivel y nivel+1.
- tipo "vigaX": elemento horizontal en direccion X en un nivel dado (nivel >= 1).
- tipo "vigaZ": elemento horizontal en profundidad (solo si nz > 1).
- Si no puedes determinar dimensiones reales en metros, usa los valores por defecto indicados.
- La "confianza" debe ser baja (< 0.5) si la imagen es ambigua, borrosa o dificil de interpretar.

Devuelve SOLO el JSON, nada mas.`;

    // ---- Llamada a Gemini ----
    const modelo = 'gemini-2.0-flash';  // modelo multimodal rapido y gratis
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${API_KEY}`;

    const geminiBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType || 'image/png',
              data: imagenBase64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,        // baja temperatura = mas determinista
        maxOutputTokens: 1024,
        responseMimeType: 'application/json'  // forzar salida JSON
      }
    };

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    });

    if (!geminiRes.ok) {
      const errTxt = await geminiRes.text();
      return res.status(502).json({ error: 'Error de Gemini: ' + errTxt });
    }

    const geminiData = await geminiRes.json();

    // Extraer el texto de la respuesta
    const textoRespuesta =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!textoRespuesta) {
      return res.status(502).json({ error: 'Gemini no devolvio contenido' });
    }

    // Intentar parsear el JSON que devolvio la IA
    let estructura;
    try {
      // Limpiar posibles backticks de markdown por si acaso
      const limpio = textoRespuesta.replace(/```json|```/g, '').trim();
      estructura = JSON.parse(limpio);
    } catch (e) {
      return res.status(502).json({
        error: 'Gemini devolvio un JSON invalido',
        raw: textoRespuesta
      });
    }

    // Devolver la estructura reconocida a la web
    return res.status(200).json({ ok: true, estructura });

  } catch (e) {
    return res.status(500).json({ error: 'Error interno: ' + e.message });
  }
}
