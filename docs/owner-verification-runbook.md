# Comprobación segura con sesión del propietario

Tres comprobaciones que solo puede hacer una persona con sesión real. Claude no pide, ve ni registra
contraseñas, códigos MFA ni secretos: el propietario las hace en su navegador y anota solo
**PASA / FALLA** y, si falla, el mensaje de error visible (sin pegar códigos ni enlaces de recuperación).

> **Aviso de entorno.** Hoy existe un único proyecto Supabase (`iyxidhglyqkzoziyewlc`) y es el de
> **Producción** (80 migraciones = repo, 944 productos, 0 pedidos, 0 clientes, sin fixtures QA). No hay
> staging separado, y Preview no tiene variables de Supabase a propósito. Por eso estas pruebas se hacen
> en `https://cruzial.pe` con datos mínimos y reversibles. No crees pedidos, clientes ni reclamos de prueba.

## 1. MFA del administrador (AAL2)

Requisito: cuenta admin existente (`admin_memberships` tiene 2).

1. Ventana privada → `https://cruzial.pe/admin` → debe redirigir a `/admin/login`.
2. Inicia sesión con tu correo y contraseña (solo tú la escribes).
3. Si aún no tienes factor: `/admin/mfa/enroll` → escanea el QR con tu app TOTP → confirma el código.
   Si ya tienes: `/admin/mfa/challenge` → ingresa el código vigente.
4. **PASA si:** llegas a `/admin` con Parfums/Import visibles; recargar (F5) no vuelve a pedir login;
   `/admin/security` abre.
5. Prueba negativa (opcional): ventana nueva, inicia sesión y **no** completes el código; abre `/admin/parfums`.
   **PASA si** te devuelve a `/admin/mfa/challenge` o `/admin/login` sin mostrar datos.
6. Cierra sesión y confirma que `/admin` vuelve a pedir login.

Guarda un código de recuperación fuera de línea si la pantalla lo ofrece (nunca en el repo ni en el chat).

## 2. Recuperación de contraseña

La acción construye el enlace desde `SITE_URL` (configuración del servidor, no desde el `Host` de la petición).

1. Ventana privada → `https://cruzial.pe/admin/forgot-password` → escribe **tu** correo admin → enviar.
2. **PASA (parte 1)** si ves la frase genérica «Si existe una cuenta autorizada…» (se muestra igual exista o no la cuenta).
3. Abre el correo recibido. **El enlace debe empezar por `https://cruzial.pe/auth/callback`.**
   - Si empieza por otro dominio → **FALLA**: `SITE_URL` de Producción está mal.
   - Si no llega correo en 5 min → revisa spam; si sigue sin llegar, falla de SMTP/plantilla en Supabase Auth.
   - Si al hacer clic ves `/admin/login?error=missing_code` o un error de redirect → falta
     `https://cruzial.pe/auth/callback` en *Supabase → Authentication → URL Configuration → Redirect URLs*.
4. Clic en el enlace → `/admin/reset-password` → pon una contraseña nueva (puede ser la misma que ya usas).
5. **PASA (parte 2)** si luego puedes iniciar sesión con ella y el MFA vuelve a pedirse.

No pegues el enlace del correo en ningún chat: es de un solo uso y da acceso a la cuenta.

## 3. Carga de prueba en Cloudinary

Las variables `CLOUDINARY_*` existen en Producción, pero el CLI de Vercel no deja leer si tienen valor, y
el panel admin solo lo dice cuando intentas subir (`data-media-unconfigured`).

Elige un producto **que no sea público**, para que la foto de prueba no se vea en la tienda:
un producto Parfums o Import en estado *borrador* (por ejemplo `le-male-le-parfum`, que está en borrador).
No uses un producto publicado.

1. Admin → Productos → abre el producto → sección **Fotos**.
2. Si ves el aviso «La subida de fotos no está configurada…» → **FALLA**: faltan o están vacías las
   credenciales de Cloudinary en Vercel (Production). Corrige en *Vercel → Settings → Environment Variables*
   (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`; ninguna con prefijo `NEXT_PUBLIC_`) y redeploy.
3. Si aparece la zona de arrastre, sube **una** imagen JPG/PNG/WebP pequeña (< 1 MB, sin datos personales).
4. **PASA si:** la cola muestra «Subida», aparece la miniatura y se queda tras recargar.
5. Limpieza (misma pantalla): **Archivar** la foto. Archivar la oculta; el archivo sigue en Cloudinary bajo
   `cruzial/<unidad>/products/<id>/…`. Bórralo en la consola de Cloudinary (Media Library) si quieres limpiar.
6. Opcional, imágenes varias: sube 2–3 a la vez y confirma que un archivo inválido (p. ej. un `.txt`) falla
   solo ese archivo sin detener los demás.

## Ya comprobado automáticamente (solo lectura, 2026-10-08, sin tocar datos)

Contra `https://cruzial.pe`, sin sesión: `/admin/forgot-password` 200; `/admin/reset-password` redirige a
`/admin/forgot-password` (exige sesión de recuperación); `/admin/mfa/enroll`, `/admin/mfa/challenge` y
`/admin/security` redirigen a `/admin/login`; `/auth/callback` sin código redirige a
`/admin/login?error=missing_code` y con un código inválido a `?error=invalid_link` (la ruta llega a Supabase
y rechaza). Cabeceras CSP (nonce), HSTS, `X-Frame-Options: DENY` y `nosniff` presentes. Esto prueba que las
rutas están desplegadas y protegidas; **no** prueba el correo, el MFA ni Cloudinary, que siguen siendo manuales.
La lógica MFA/AAL2 (denegación AAL1, viewer y entre unidades) está cubierta por pgTAP y por el E2E local.

## Configuración en el panel de Supabase (no se puede leer desde el repositorio)

*Authentication → URL Configuration:* `Site URL` = `https://cruzial.pe` y en *Redirect URLs*
`https://cruzial.pe/auth/callback`. *Authentication → Providers → Email:* longitud mínima de contraseña
(el código exige un mínimo al restablecer; local usa 12). *Protección contra contraseñas filtradas*
(HaveIBeenPwned): **no disponible en el plan Free** (según la documentación de Supabase es de plan Pro o
superior; la organización está en Free). No es una vulnerabilidad del código: control compensatorio = MFA
AAL2 obligatorio para todo el panel y restablecimiento solo con sesión de recuperación. No cambies esto sin
decidir el cambio de plan (coste).

## Registros para investigar incidentes

- *Base de datos:* `audit_log` (mutaciones de admin) y `order_status_events` no tienen retención por tiempo
  (58 filas de auditoría entre 2026-09-13 y 2026-10-05).
- *Supabase (plan Free):* los informes del panel llegan a 24 horas atrás; no hay historial largo de logs de API/Auth.
- *Vercel:* los logs de ejecución se consultan con `vercel logs`; su retención depende del plan del equipo
  (no leída desde aquí). Para investigaciones largas hace falta un drenaje de logs (coste/decisión del propietario).

## Qué reportar a Claude

Una línea por prueba: `MFA: PASA`, `Recuperación: FALLA — el enlace apunta a …`, `Cloudinary: PASA`.
Con eso se corrige la configuración y se actualiza `docs/current-v2.md`.

## Pendiente estructural: staging real

Para probar flujos de escritura sin tocar Producción hace falta un **segundo proyecto Supabase** (staging),
con las migraciones del repo (`supabase link` + `supabase db push` sobre ese proyecto), las fixtures QA
(`supabase/provisioning/staging-qa-fixtures*.sql`) y entonces sí `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en el target **Preview** de Vercel. Crear el proyecto implica coste
y es decisión del propietario.
