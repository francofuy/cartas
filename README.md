# Puño y Letra

Escribí cartas con **tu propia letra**, para imprimirlas en papel A4 como si las hubieras escrito a mano.

Es una app web estática (HTML + CSS + JavaScript, sin servidor ni dependencias): se puede instalar
como app en PC y celular y funciona sin conexión. Tu letra y tus cartas se guardan **solo en tu dispositivo**.

## Cómo se usa

1. **Mi letra** → imprimí la plantilla (7 páginas A4, al 100 %), escribí cada carácter a mano en sus casilleros
   y sacale una foto. La app endereza la foto (con las 4 marcas negras), se queda solo con la tinta y guarda cada
   letra. Podés repetir tantas veces como quieras: cada foto suma variantes y el texto las alterna.
2. **Escribir** → tipeá y la hoja se va "escribiendo" con tu letra (trazo animado con ritmo humano).
   La barra de la izquierda abre cada ajuste: lapicera, escritura, papel y letra.
3. **Sonido** → al escribir suena una lapicera muy suave, distinta en cada instrumento y nunca igual a sí misma; se regula o se apaga en «Lapicera».
4. **Hojas con dorso** → «Dar vuelta» gira la hoja y seguís en el dorso; «Hoja nueva» toma otra hoja del montón
   (sin dorso). También podés dar vuelta la hoja con el gesto: mantené apretada la esquina inferior (derecha = siguiente, izquierda = anterior) y arrastrá; la hoja se despega como la de un cuaderno. Cuando una hoja se llena, la carta sigue en el dorso o en otra hoja, a tu elección.
4. **Archivero** → un cajón en una esquina que se abre al pasar el cursor y muestra las cartas de lomo (por carpeta). Al hacer clic en una se muestra de frente para elegirla y arrastrarla a la referencia; también se buscan, se leen, se editan y se exportan o importan.
   La referencia se ve al costado, en una ventana flotante o «fantasma» sobre la hoja, con letra legible o con tu letra.
5. **Papel** → galería de modelos y de tus hojas guardadas; editor de líneas, margen, color, textura, imagen de fondo y decoraciones; y buscador de imágenes en internet (Openverse y Wikimedia sin clave; Unsplash, Pexels y Pixabay con una clave gratuita que guardás solo en tu dispositivo).
6. **Imprimir** → se dibuja cada hoja a 300 ppp. Si hay hojas con dorso podés elegir doble cara automática,
   una cara por hoja, o doble cara a mano (el navegador no puede saber qué impresora tenés).

## Estructura

```
index.html          interfaz
css/app.css         estilos (vidrio, barra, vistas, diálogos); css/archivero.css: archivero 3D y referencia
js/app.js           conecta todo
js/theme.js         paletas, vidrio, fondo de puntos que reaccionan
js/writer.js        texto, ritmo de escritura, dibujo de la hoja y modo fantasma
js/layout.js        renglones, caras (frente/dorso), hojas, imperfecciones deterministas
js/refs.js          datos de las cartas y referencia (costado / flotante / fantasma); js/cajon.js: el cajón de la esquina
js/curl.js          gesto de la esquina para dar vuelta la hoja
js/sound.js         sonido suave de la lapicera (Web Audio, sin archivos)
js/letters.js       cartas en curso, cerrar la carta, Buzón e impresión única; js/seal.js: animación del sobre y el sello; js/printflow.js: ventana de impresión
js/glyphs.js        biblioteca de letras, lapiceras (sprites) y animación de trazo
js/skeleton.js      esqueleto de cada letra -> orden en que se dibuja
js/capture.js       foto -> homografía -> letras sueltas (solo tinta)
js/template.js      geometría de la plantilla imprimible
js/paper.js         dibujo del papel (líneas, margen, textura, imagen, decoraciones)
js/papers.js        panel Papel: galería, editor y buscador; js/webpapers.js: fuentes de imágenes; js/controls.js: botones y paletas
js/db.js            IndexedDB (letra, cartas e imágenes de papel)
js/backup.js        copia de seguridad única: exportar e importar todo
js/print.js         impresión
sw.js, manifest.webmanifest   instalable y offline
dev/simulate.html   (desarrollo) simula la foto de una plantilla rellena, para probar la captura
```

## Desarrollo

```bash
python3 -m http.server 8123   # y abrir http://localhost:8123
```

La fuente de la "letra de ejemplo" es [Caveat](https://github.com/googlefonts/caveat) (SIL Open Font License, ver `fonts/OFL-Caveat.txt`).

La fuente de la interfaz es [Inter](https://rsms.me/inter/) (SIL Open Font License, ver `fonts/OFL-Inter.txt`).
