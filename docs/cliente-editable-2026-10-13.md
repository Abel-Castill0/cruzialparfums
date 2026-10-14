# Lo que ya puedes editar tú (2026-10-13)

Todo esto ya está cargado en Producción y se cambia desde el panel de administración, sin pedirle nada al equipo técnico. Entra con tu usuario de administrador (con tu segundo factor).

## 1. Dónde se edita cada cosa

| Qué | Dirección |
|---|---|
| Notas y aromas | https://cruzial.pe/admin/parfums/notas |
| Notas de un perfume concreto, en su ficha (con subir y bajar) | https://cruzial.pe/admin/parfums/productos → abre el perfume → sección «Notas y aromas» |
| Zonas del motorizado, agencias de envío y perfumes excluidos del regalo | https://cruzial.pe/admin/parfums/reglas |
| Mayorista (regla de unidades mixtas) | https://cruzial.pe/admin/import/mayorista |
| Costo de envío de un pedido | https://cruzial.pe/admin/parfums/pedidos → abre el pedido → «Costo de envío cotizado» |

Los cambios en notas y zonas se ven en la tienda en pocos segundos.

## 2. Cómo se hace

**Notas** (`/admin/parfums/notas`)
- *Crear:* al final de la página, «Crear nota» (nombre, tipo, descripción opcional). Déjala en «General (lista simple)»: la pirámide salida/corazón/fondo no se usa todavía.
- *Renombrar o corregir:* cambia el nombre y «Guardar nota». Se actualiza en todos los perfumes que la usan.
- *Ocultar:* quita la marca «Visible en la tienda». La nota deja de mostrarse, pero no se pierde.
- *Eliminar:* solo si ningún perfume la usa. Si la usan, la pantalla te dice cuántos; quítala primero de esos perfumes (o solo ocúltala).
- *Asignar a un perfume y ordenar:* en la ficha del perfume, sección «Notas y aromas»: añade con el selector, cambia el orden con ↑ y ↓, quita con «Quitar» y pulsa «Guardar notas». El orden de la lista es el que verán tus clientes.

**Zonas del motorizado** (`/admin/parfums/reglas`, sección «Zonas del motorizado»)
- Cada distrito tiene la casilla «Sin motorizado». Márcala y «Guardar» para quitar el motorizado en ese distrito; el cliente podrá elegir Shalom y el pedido se registra igual. **Nunca se bloquea un pedido.**
- Para agregar un distrito: «Nuevo distrito» al final. Para quitarlo: «Eliminar» y confirmar.

**Agencias de envío** (misma pantalla, «Agencias de envío»): hoy solo Shalom (Todo Perú, cotización por WhatsApp). Puedes editar el texto o agregar otra agencia.

**Regalo de 2 ml** (misma pantalla, «Regalo de 2 ml: perfumes excluidos»): marca los perfumes árabes que no participan y «Guardar exclusiones». Hoy está excluido **Club de Nuit Precieux I**.

**Mayorista** (`/admin/import/mayorista`, «Regla mixta»): mínimo de unidades mixtas y descuento por frasco de cada tipo (hoy 40 unidades; S/5 árabe, S/7 diseñador, S/10 nicho). No existen tramos por encima del mínimo (T28: pendiente de que el cliente los defina).

## 3. Las 70 notas cargadas

Se cargaron tal cual estaban en la tienda (nada se unió ni se borró). 🔍 = conviene revisarla; 🔶 = no es una nota.

| Nota | Perfumes | Observación |
|---|---|---|
| Ámbar | 59 |  |
| Vainilla | 35 |  |
| Especias | 23 |  |
| Madera | 21 |  |
| Acuático | 14 | 🔍 **Revisar** · parecida a Agua y Marino |
| Cítricos | 10 |  |
| Flores | 8 |  |
| Bergamota | 7 |  |
| Canela | 7 |  |
| Cuero | 7 |  |
| Cedro | 6 |  |
| Almizcle | 5 |  |
| Coco | 5 |  |
| Manzana | 5 |  |
| Piña | 5 |  |
| Café | 4 |  |
| Caramelo | 4 |  |
| Lavanda | 3 |  |
| Mandarina | 3 |  |
| Menta | 3 |  |
| Ron | 3 |  |
| Tabaco | 3 |  |
| Verde | 3 | 🔍 **Revisar** · parece una familia o sensación, no una nota |
| Almendra | 2 |  |
| Cereza | 2 |  |
| Flores blancas | 2 |  |
| Frutos rojos | 2 |  |
| Limón | 2 |  |
| Marino | 2 | 🔍 **Revisar** · parecida a Agua y Acuático |
| Rosas | 2 |  |
| 4 fragancias | 1 | 🔶 **Marcador, no es una nota** · marcador de set, no es una nota |
| Abedul | 1 |  |
| Agua | 1 | 🔍 **Revisar** · parecida a Acuático y Marino |
| Algodón dulce | 1 |  |
| Avellana | 1 |  |
| Azafrán | 1 |  |
| Cacao | 1 |  |
| Cálido | 1 | 🔍 **Revisar** · parece una sensación, no una nota |
| Cardamomo | 1 |  |
| Castaña | 1 |  |
| Ciruela | 1 |  |
| Dulce | 1 |  |
| Flor de naranjo | 1 |  |
| Fresa | 1 |  |
| Fresco | 1 | 🔍 **Revisar** · parece una sensación, no una nota |
| Fruta | 1 | 🔍 **Revisar** · parecida a Frutal y Fruta tropical |
| Fruta tropical | 1 |  |
| Frutal | 1 | 🔍 **Revisar** · parecida a Fruta y Fruta tropical |
| Fuego | 1 |  |
| Geranio | 1 |  |
| Gourmand | 1 |  |
| Humo | 1 |  |
| Incienso | 1 |  |
| Jazmín | 1 |  |
| Mango | 1 |  |
| Melocotón | 1 |  |
| Metálico | 1 |  |
| Miel | 1 |  |
| Orientales | 1 |  |
| Oud | 1 |  |
| Pera | 1 |  |
| Pimienta | 1 |  |
| Pistacho | 1 |  |
| Plátano | 1 |  |
| Praliné | 1 |  |
| Romero | 1 |  |
| Selección | 1 | 🔶 **Marcador, no es una nota** · marcador de set, no es una nota |
| Toffee | 1 |  |
| Veraniego | 1 |  |
| Violeta | 1 |  |

### Para revisar (decisión tuya)
- **Verde, Cálido, Fresco**: parecen sensaciones o familias más que notas.
- **Fruta / Frutal / Fruta tropical**: significan casi lo mismo.
- **Agua / Acuático / Marino**: significan casi lo mismo.

### Marcadores que no son notas (se eliminan desde el admin, decisión del cliente)
**«4 fragancias»** y **«Selección»** (un set cada una). Para quitarlas: ábrelas en la ficha del set → sección «Notas y aromas» → «Quitar» → «Guardar notas»; después, en `/admin/parfums/notas`, «Eliminar» cada una. **No se tocaron.**

## 4. Los 43 distritos (ya validados)

**Con motorizado (30):** Cercado de Lima, Rímac, Breña, Lince, Jesús María, Pueblo Libre, Magdalena del Mar, San Miguel, San Isidro, Miraflores, Barranco, Surquillo, San Borja, Santiago de Surco, Chorrillos, San Luis, La Victoria, El Agustino, Santa Anita, Ate, La Molina, San Juan de Lurigancho, Independencia, Los Olivos, San Martín de Porres, Comas, Carabayllo, San Juan de Miraflores, Villa María del Triunfo, Villa El Salvador.

**Sin motorizado, solo Shalom (13):** Ancón, Santa Rosa, Puente Piedra, Chaclacayo, Lurigancho-Chosica, Cieneguilla, Pachacámac, Lurín, Punta Hermosa, Punta Negra, San Bartolo, Santa María del Mar, Pucusana.

Los casos que eran dudosos (informativo, ya validados): Puente Piedra, San Juan de Lurigancho, La Molina, Chaclacayo/Chosica y Lurín/Pachacámac. Cualquiera se puede cambiar cuando quieras desde «Zonas del motorizado».

## 5. Qué sigue sin estar disponible
- Selector del perfume de regalo en el checkout (hoy el regalo se acuerda por WhatsApp).
- Bloqueo de `/import` para quien no es administrador cuando la campaña no está abierta.
- Descuento mayorista aplicado automáticamente a los pedidos (hoy se coordina por WhatsApp).
- Tramos mayoristas por encima de 40 unidades (T28).
