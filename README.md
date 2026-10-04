# GeneradorNotas — Gigantografía Seven

CRM estático (notas de venta, cotizaciones, clientes, producción, estadísticas, usuarios, accesos, configuración) sobre Supabase.
Sin compilación: `index.html` + `js/` + `css/` + `vendor/`. Publicado con GitHub Pages (rama `main`).

Seguridad: sesiones con token validado en la base (ver SQL de seguridad), contraseñas con hash bcrypt, CSP en `index.html`.
