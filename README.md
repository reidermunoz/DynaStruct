# ReiDyn IA Backend

Backend serverless (Vercel) que analiza imagenes de estructuras con
Gemini y devuelve un JSON estructural. Oculta la API key del frontend.

## Estructura

```
reidyn-ia-backend/
├── api/
│   └── analizar.js     ← la serverless function
├── package.json
└── README.md
```

## Despliegue en Vercel (gratis)

1. Crear cuenta en https://vercel.com (puedes usar tu cuenta GitHub)
2. Subir esta carpeta a un repositorio de GitHub (ej: reidyn-ia-backend)
3. En Vercel: "Add New Project" → importar ese repositorio
4. Antes de desplegar, ir a "Environment Variables" y agregar:
       Nombre:  GEMINI_API_KEY
       Valor:   <tu API key de Gemini, la que empieza con AIza...>
5. Click "Deploy"
6. Vercel te da una URL tipo: https://reidyn-ia-backend.vercel.app
7. Tu endpoint sera: https://reidyn-ia-backend.vercel.app/api/analizar

## Probar el endpoint

Una vez desplegado, el endpoint acepta POST con JSON:
```json
{
  "imagenBase64": "<imagen en base64 sin el prefijo data:image...>",
  "mimeType": "image/png"
}
```

Y devuelve:
```json
{
  "ok": true,
  "estructura": {
    "nx": 3, "ny": 3, "nz": 1,
    "sx": 5, "sy": 3, "sz": 4,
    "elementosFaltantes": [],
    "confianza": 0.85,
    "notas": "Portico plano de 3 pisos y 3 ejes"
  }
}
```

## Seguridad

- La GEMINI_API_KEY vive SOLO en las variables de entorno de Vercel.
- Nunca aparece en el codigo ni en el frontend.
- CORS esta abierto (*) para que GitHub Pages pueda llamarlo.
  Si quieres restringir, cambia el Access-Control-Allow-Origin
  en analizar.js por tu dominio exacto de GitHub Pages.
