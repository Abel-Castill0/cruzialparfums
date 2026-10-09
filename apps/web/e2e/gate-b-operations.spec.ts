import { expect,test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { GATE_B_ADMIN_STATE as ADMIN_STATE, hasIdentity } from "./auth-state";
const ids={parfumsOrder:"99003000-0000-4000-8000-000000000010",importOrder:"99003000-0000-4000-8000-000000000011",product:"99003000-0000-4000-8000-000000000020",campaign:"99003000-0000-4000-8000-000000000030",complaint:"99003000-0000-4000-8000-000000000040"};
test.describe("Gate B local operations",()=>{
 test.describe.configure({mode:"serial"});
 test.skip(process.env.E2E_LOCAL_FIXTURES!=="1"||!hasIdentity("E2E_GATE_B_ADMIN"),"requires disposable local fixtures and the E2E_GATE_B_ADMIN_* identity (real password + TOTP sign-in in auth.setup.ts)");
 test.use({storageState:ADMIN_STATE});
 test("Parfums tracked reservation follows confirmation and fulfillment",async({page})=>{
  // Automation evidence lives behind "Ver detalle técnico" (progressive disclosure, Phase B1).
  const technical=page.getByText("Ver detalle técnico",{exact:true});
  await page.goto(`/admin/parfums/pedidos/${ids.parfumsOrder}`);await technical.click();await expect(page.getByText(/2 unidades · reserved/)).toBeVisible();
  await page.getByRole("button",{name:"Confirmar por WhatsApp",exact:true}).click();await expect(page.getByRole("button",{name:"Marcar como completado",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Marcar como completado",exact:true}).click();await expect(page.getByText(/2 unidades · consumed/)).toBeVisible();await page.reload();await technical.click();await expect(page.getByText(/2 unidades · consumed/)).toBeVisible();
 });
 test("Import confirmation and cancellation retain independent workflow",async({page})=>{
  await page.goto(`/admin/import/pedidos/${ids.importOrder}`);await page.getByRole("button",{name:"Confirmar coordinación",exact:true}).click();await expect(page.getByRole("button",{name:"Marcar como completado",exact:true})).toBeVisible({timeout:15_000});
  // Cancellation is a two-step, reason-required confirmation.
  await page.getByRole("button",{name:"Cancelar pedido",exact:true}).click();await page.getByPlaceholder("Razón de cancelación (requerida)").fill("LOCAL QA cancelación humana");await page.getByRole("button",{name:"Confirmar cancelación",exact:true}).click();
  await expect(page.getByText(/Estado del pedido actualizado/)).toBeVisible({timeout:15_000});await page.getByText("Ver detalle técnico",{exact:true}).click();await expect(page.getByText("cancelled",{exact:false}).first()).toBeVisible();
 });
 test("catalog CSV dry run previews and explicitly applies categoryless factual edit",async({page})=>{
  await page.goto(`/admin/import/lotes?campaign=${ids.campaign}`);
  const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"Exportar plantilla del catálogo"}).click();const download=await downloadPromise;
  const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream!)chunks.push(Buffer.from(chunk));
  const csv=Buffer.concat(chunks).toString("utf8").split("\r\n");const row=csv.find(line=>line.includes(ids.product))!;
  await page.getByLabel("CSV del catálogo",{exact:true}).setInputFiles({name:"local-catalogo.csv",mimeType:"text/csv",buffer:Buffer.from(csv[0]+"\r\n"+row.replace("LOCAL Gate B lote","LOCAL Gate B lote editado"))});
  await page.getByRole("button",{name:"Validar y ver cambios"}).click();await expect(page.getByText("1 filas válidas · 0 errores.")).toBeVisible();await expect(page.getByText(/LOCAL Gate B lote → LOCAL Gate B lote editado/)).toBeVisible();
  await page.getByRole("button",{name:"Aplicar 1 filas explícitamente"}).click();await expect(page.getByRole("status")).toContainText("1 filas aplicadas");
 });
 test("bulk publication leaves campaign draft and media matching is exact",async({page})=>{
  await page.goto(`/admin/import/lotes?campaign=${ids.campaign}`);await page.getByRole("button",{name:"Seleccionar todos los elegibles (1)"}).click();await page.getByRole("button",{name:"Publicar 1 ofertas seleccionadas"}).click();await expect(page.getByRole("status")).toContainText("Lote publicado");
  await page.goto(`/admin/import/productos/${ids.product}`);await expect(page.locator("section",{has:page.getByRole("heading",{name:"Datos del producto"})}).getByLabel("Publicación")).toHaveValue("published");
  await page.goto(`/admin/import/lotes?campaign=${ids.campaign}`);await expect(page.locator("#campaign option:checked")).toContainText("draft");
  await page.getByLabel("Imágenes PNG, JPG o WebP").setInputFiles({name:"local-gate-b-bulk.png",mimeType:"image/png",buffer:Buffer.from("fixture-image-preview")});await page.getByRole("button",{name:"Ver coincidencias"}).click();await expect(page.getByText("local-gate-b-bulk.png: LOCAL Gate B lote editado")).toBeVisible();
 });
 test("overdue complaint resolves with a human note",async({page})=>{
  await page.goto(`/admin/parfums/reclamos/${ids.complaint}`);await expect(page.getByText(/Plazo vencido · Responder hasta/)).toBeVisible();await page.getByLabel("Notas internas (no visibles para el consumidor)").fill("LOCAL QA respuesta humana aprobada");await page.getByRole("button",{name:"Resuelto",exact:true}).click();await expect(page.getByRole("button",{name:"Resuelto (actual)",exact:true})).toBeDisabled();await expect(page.getByText(/Resuelto el .+\(hora de Lima\)/)).toBeVisible();await expect(page.getByText("No requiere acción.")).toBeVisible();await expect(page.getByText(/Responder hasta/)).toHaveCount(0);
 });
 test("notification failure retry UI is scoped and responsive",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/admin/import/operaciones");await expect(page.getByRole("heading",{name:"Operaciones · Cruzial Import"})).toBeVisible();
  const job=page.locator("li").filter({hasText:ids.importOrder}).filter({hasText:"Rechazado"}).first();await job.getByRole("button",{name:"Reintentar",exact:true}).click();await expect(page.getByText("Reintento registrado en la cola.")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page).toHaveTitle(/Operaciones Import/);
  const scan=await new AxeBuilder({page}).analyze();expect(scan.violations.filter(v=>["critical","serious"].includes(v.impact??""))).toEqual([]);
  await page.getByLabel("Móvil interno para alertas de reclamos").focus();await expect(page.getByLabel("Móvil interno para alertas de reclamos")).toBeFocused();
 });
});
