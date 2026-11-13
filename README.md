# Puño y Letra

Escribí cartas con **tu propia letra**, para imprimirlas en papel A4 como si las hubieras escrito a mano.

Es una app web estática (HTML + CSS + JavaScript, sin servidor ni dependencias): se puede instalar
como app en PC y celular y funciona sin conexión. Tu letra y tus cartas se guardan **solo en tu dispositivo**.

## Cómo se usa

1. **Mi letra** → imprimí la plantilla (7 páginas A4, al 100 %), escribí cada carácter a mano en sus casilleros
   y sacale una foto. La app endereza la foto (con las 4 marcas negras), se queda solo con la tinta y guarda cada
   letra. Podés repetir tantas veces como quieras: cada foto suma variantes y el texto las alterna.
2. **Escribir** → tipeá y la hoja se va "escribiendo" con tu letra (trazo animado con ritmo humano).
   Elegí lapicera (bolígrafo, lápiz, pluma, fibrón), color, grosor, tamaño, imperfecciones y tipo de papel.
3. **Imprimir** → se dibuja cada hoja a 300 ppp y se abre el diálogo de impresión (elegí tamaño real, 100 %).

## Estructura

```
index.html          interfaz
css/app.css         estilos (cada tamaño de pantalla tiene su propia disposición)
js/app.js           conecta todo
js/writer.js        texto, ritmo de escritura, dibujo de la hoja
js/layout.js        renglones, hojas, imperfecciones deterministas
js/glyphs.js        biblioteca de letras, lapiceras (sprites) y animación de trazo
js/skeleton.js      esqueleto de cada letra -> orden en que se dibuja
js/capture.js       foto -> homografía -> letras sueltas (solo tinta)
js/template.js      geometría de la plantilla imprimible
js/paper.js         papeles (rayado, cuadriculado, liso)
js/db.js            IndexedDB + exportar/importar la letra
js/print.js         impresión
sw.js, manifest.webmanifest   instalable y offline
dev/simulate.html   (desarrollo) simula la foto de una plantilla rellena, para probar la captura
```

## Desarrollo

```bash
python3 -m http.server 8123   # y abrir http://localhost:8123
```

La fuente de la "letra de ejemplo" es [Caveat](https://github.com/googlefonts/caveat) (SIL Open Font License, ver `fonts/OFL-Caveat.txt`).
