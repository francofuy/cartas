# Ideas guardadas (todavía sin elegir)

Cosas que se hablaron y quedaron para decidir más adelante. No están en la app.

## Dónde viven las cartas cerradas
Hoy en la app: variantes 1 (botón arriba) y 6 (en la hoja vacía), activables por separado en Escritura > Cartas cerradas. La 3 (lengüeta abajo) se quitó porque repetía al botón de arriba. Además siempre está la lista en «Mis cartas». Falta elegir cuál(es) dejar.
Maquetas: https://claude.ai/artifact/FQnRuGign6NnEbxUFduYf2

- **A · Panel del dock.** Un botón nuevo abre un panel de vidrio con los sobres en lista. Tapa un poco la hoja mientras está abierto.
- **B · Pestaña «Cartas».** Tercera pestaña junto a Escribir y Mi letra, con los sobres grandes e inclinados sobre el escritorio. No tapa nada.
- **C · Sobres en el margen del escritorio.** Apoyados a la derecha, afuera de la hoja; se levantan al pasar el cursor. En ventanas angostas queda solo un contador.
- Se pueden combinar (por ejemplo B más un contador arriba, y C solo en pantallas anchas).
- Descartadas: la caja 3D y el cajón en la esquina (no convencieron).

## Mejoras de la interfaz
Maquetas: https://claude.ai/artifact/RqB3oS4xeErSzoUyMeL9Ug

1. **Modo foco.** HECHO (para probar): todo se apaga y una luz tibia acompaña la lapicera, un poco por debajo de la punta. Botón «Foco» en la barra de la hoja, Ctrl + . y un botón en Escritura. Se sale con Esc.
2. **Selector de ambiente dentro de la app.** El de noche podría activarse solo al anochecer.
3. **Atajos de teclado visibles** al pasar el cursor por los botones del dock (los atajos todavía no existen).
4. **Mesa con textura** (lino, madera clara, corcho) en lugar de los puntos, y hoja con sombra más realista.
5. **Títulos con más carácter** (otra tipografía para los títulos de los paneles, Inter para los botones).
6. **Botón Imprimir con animación** (una hoja se desliza hacia una bandeja antes de abrir la impresión).

## Ambientes de color
Elegido: Carbón (escritorio #0d0d10, acento #ececf2). Antes: Índigo (#ccccff, #0033ff). Otras vistas: Papel y tinta, Salvia, Atardecer, Grafito y Noche.
Se está explorando una familia de ambientes oscuros.

## Plan pendiente (ya aprobado)
Luz y tinta húmeda, portalápices; tachones, formato a mano y firma; fotos y cintas, sobre impreso; papel ya rayado con calibración; mesa 3D.

## Luz del modo foco
Hoy: elipse suave bajo la punta. Se pidió una luz «en V». Opciones mostradas: elipse, V que abre hacia arriba, cono de lámpara desde arriba, Λ desde la punta, haz diagonal, V con ambiente. Falta elegir y ajustar ángulo, alcance y tono.
Segunda ronda (pedido: V más abierta, origen más abajo, punta sin filo, como linterna o foco cálido): seis linternas (base, foco amplio, con núcleo, inclinada, abanico corto, con penumbra) en una página con controles de apertura, origen, suavidad de la punta, oscuridad y tono.

## Hoja de máquina de escribir en el modo foco (YA EN LA APP: js/focus3d.js)
Idea: cámara fija con la lapicera siempre en el mismo punto de la pantalla; la hoja se desliza a izquierda/derecha según dónde se escribe y sube en cada Enter. Como en una máquina de escribir, se enrolla sobre un rodillo y cae hacia atrás (arco sin estirar el papel). Luz: linterna cálida un poco más abajo de las letras. Prototipo aparte con controles de radio del rodillo, cuánto se enrolla, altura de cámara y de la luz. En la app haría falta WebGL (three.js, empaquetado para funcionar sin conexión). La versión anterior (hoja cóncava y combada) se descartó.

### Valores elegidos para el modo foco con hoja de máquina de escribir
(los que se ven bien en el prototipo; usarlos como base si se lleva a la app)
- Radio del rodillo 38 mm · Cuánto se enrolla 210° · Rigidez del papel 55 (muy flexible)
- Altura de la cámara −10° · Distancia de la cámara 61 % · Giro al desplazarse 14 %
- Distancia de la luz al papel 105 mm · Intensidad 170 % (en la V de 150 %) · Oscuridad del fondo 95 % · Resplandor 10 %
- Altura de la luz: por encima · Velocidad 14 letras/s · Rodillo oculto
- Luz: se pidió una forma de V más marcada. Hecho en un editor de luz aparte (V con vértice, eje, apertura, asimetría, borde, curva de brazos, punta redondeada, alcance, núcleo; color por temperatura; halo; rebote; resplandor; bordes; grano; parpadeo; guías arrastrables; puntos de partida; copiar/pegar valores). Los valores finales que elija se copian desde ahí.

### Valores finales de la luz (los que pegaste desde el editor, ya aplicados en la app)
V de 70°, vértice (1, −41), borde 67, punta 50, alcance 262, núcleo 30/45, intensidad 80 %, 2850 K, color 89 %, luz a 220 mm, caída 10, halo 49 %, rebote 22 %, fondo 82 %, resplandor 10 %, bordes 49 %, grano 7 %. Escena: rodillo 38, rigidez 55, enrollado 210°, cámara −10° y 61 %, giro 14 %. Están en LOOK dentro de js/focus3d.js.

### Modo foco 3D: transición y interfaz (hecho)
El fondo normal (con puntos) se oscurece en vez de pasar a negro; la interfaz queda muy tenue (20 %) y vuelve al pasar el mouse o con el teclado; los botones de vista (Ancho / Hoja entera / De cerca) mueven la cámara; al usar un botón el cursor vuelve a la hoja. La hoja 3D arranca exactamente donde está la hoja normal y viaja hasta su lugar (cámara, curva y luz); al salir hace el camino inverso.
