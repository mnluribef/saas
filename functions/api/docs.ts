// functions/api/docs.ts
// Documentación interactiva de la API con Redoc (Sin CSS ni JS inline conforme a las reglas) (U-03)
import type { Env, PagesHandler } from '../types';

export const onRequestGet: PagesHandler<Env> = async () => {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <title>Ventrina API Docs</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" />
</head>
<body>
    <redoc spec-url="/api/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;

    return new Response(html, {
        headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=3600"
        }
    });
};
