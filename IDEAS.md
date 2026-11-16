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

### Barra de luz (prototipo mostrado, aún no está en la app)
Para que la luz tenga de dónde salir: una barra de metal delgada cruza la hoja de punta a punta, sobre dos soportes, y en el centro tiene una parte semicuadrada con un chaflán y una ranura por donde sale la V. La barra se desplaza con la hoja hacia los costados (queda fija en altura); la parte de la luz queda siempre en la lapicera, como un carro. Acabados: acero cepillado, latón o negro anodizado. La punta de la V se acorta (22 mm) porque ahora hay una fuente visible.

### Barra de luz, segunda ronda
Pieza de luz más chica (26×11×10 mm) y oscura (metal al 75 % de oscuridad, detrás de la luz); seis formas para elegir en el prototipo: cuadrado pequeño, bloque con chaflán, pastilla, cuña, anillo y aleta. El salto de renglón ya es más seco y rápido en la app (0,13 s con un pequeño rebote, estilo carro de máquina de escribir). La barra todavía no está en la app.

### Barra de luz en la app (hecho)
Barra de metal negro con la "aleta" y la luz en V (valores del editor: tip 22, barra 236×5 mm, aleta 18×10×9, oscuridad 75, ranura 100, resplandor 8). Está en LOOK de js/focus3d.js. Al saltar de renglón la barra se corre rápido y la tinta espera 0,5 s antes de empezar (LINE_DELAY en js/focus3d.js).

## Cuadernos con espiral y hojas A5 (YA EN LA APP: js/cuadernos.js, js/format.js)
Idea: poder escribir en A5 además de A4, y que lo que se escribe viva en un cuaderno con espiral. Un botón cierra el cuaderno y la pantalla pasa a una «mesa» con los cuadernos cerrados en su tamaño real (A4 y A5); al elegir uno se acerca, se abre (tapa y hojas ya usadas pasan solas) y queda en la primera hoja libre. «Pasar hoja» da vuelta la hoja como en un cuaderno. Crear cuaderno: nombre, tamaño y color de tapa. Prototipo con CSS 3D; en la app habría que adaptar la hoja del escritor a A5 (medidas de página, márgenes, impresión) y guardar los cuadernos (hojas escritas y hoja actual).

### Cuadernos en la app: cómo cuadra la doble cara
Cada carta en curso es un cuaderno (A4 o A5, color de tapa, nombre). La hoja de papel tiene frente y dorso como siempre; el cuaderno abierto muestra dos páginas: la de la derecha es el frente de una hoja y la de la izquierda es el dorso de la anterior. Se escribe a la derecha; al pasar la hoja queda a la izquierda su dorso (la página que sigue), y después la derecha. El espiral está a la izquierda en el frente y a la derecha en el dorso. El orden de las caras no cambió (frente, dorso, frente, dorso…), así que la impresión a doble cara sigue igual y cada hoja se imprime con su frente y su dorso. A5 se imprime con el papel de la impresora en A5.

### Pasar las hojas con el espiral (hecho, js/hojas.js)
El espiral queda quieto y la hoja gira alrededor de él. Dar vuelta (frente → dorso): la hoja cruza el espiral y la cámara se corre a la página de la izquierda. Dorso → frente de la que sigue: la cámara se desliza a la página de la derecha, sin girar nada. Hoja nueva desde el frente: la hoja cruza el espiral y queda a la izquierda; la que sigue ya estaba debajo, en el mismo lugar. Al volver, el camino inverso. Del lado contrario al espiral asoma un pedazo de la página vecina.

### Espiral en el modo foco (hecho, js/focus3d.js)
En el modo foco 3D el espiral es de verdad: aros de metal que siguen la curva de la hoja (y se enrollan con ella), agujeros en el borde, sombra de contacto sobre el papel y sombras proyectadas por la luz en V (spot con mapa de sombras). Va del lado que corresponde a la cara (izquierda en el frente, derecha en el dorso). Si en una computadora floja se siente pesado, se puede apagar el mapa de sombras (renderer.shadowMap.enabled).

### Foco: entrada sin parpadeo y giros de hoja en 3D (hecho, js/focus3d.js)
La escena 3D se prepara antes (al acercar el mouse al botón Foco o cuando la app está ociosa): librería, shaders y texturas. Al entrar, el primer cuadro 3D se dibuja antes de mostrarse y la hoja normal se esconde en el mismo instante; al salir, vuelve primero la hoja normal y recién después se apaga la 3D. Dentro del foco, dar vuelta y hoja nueva giran la hoja en 3D alrededor del espiral (la cámara se corre de una página a la otra), con el mismo criterio que la vista normal.
