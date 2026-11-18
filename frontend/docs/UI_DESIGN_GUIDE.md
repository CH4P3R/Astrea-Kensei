# Guía de diseño e interacción del frontend

## 1. Consulta obligatoria y alcance

**Consultar este documento antes de crear o modificar cualquier UI del frontend.** Es la referencia de las decisiones adoptadas al completar el diseño del panel del flujo 1: Tiempo, Ubicación, Preparación y Aspecto del cielo.

La guía establece los patrones que deben extenderse a los siguientes flujos. Se complementa con [desing.md](../desing.md) y la [arquitectura](FRONTEND_ARCHITECTURE.md). Para la presentación e interacción del HUD, estas decisiones actualizan las referencias históricas del [flujo del prototipo](PROTOTYPE_UI_FLOW.md).

Aspecto del cielo muestra el estado del catálogo estelar y controla la superficie central, el fondo difuso, el Sol y la Luna y las guías celestes. Preparación permite buscar directamente al pulsar el cielo o introduciendo RA/Dec. Al ampliar la UI, representar únicamente capacidades reales del frontend y de la API.

## 2. Composición del HUD

- El escenario celeste ocupa la ventana. La UI se superpone sin cubrir innecesariamente la escena.
- La barra principal es vertical, a la izquierda. Orden: Tiempo, Ubicación, Preparación y Aspecto del cielo.
- Cada opción se representa con un icono; su nombre aparece en un tooltip. El panel asociado se abre a la derecha de la barra.
- La hora y la fecha local permanecen visibles arriba a la izquierda, independientemente del panel abierto.
- La brújula ocupa primero la esquina superior izquierda, seguida a su derecha por la hora y la fecha. Su borde izquierdo se alinea con la barra del menú y su tamaño cuadrado utiliza el mismo `--rail-width`, incluidos los ajustes responsivos. Su dibujo minimalista usa un anillo fino, marcas cardinales y un punto rojo pequeño, sin elipses internas. Mantiene norte arriba, este a la derecha y el punto sobre el rumbo horizontal de la cámara; las iniciales se traducen (O/ES, W/EN). Al mirar al cenit o nadir conserva el último rumbo definido. El conjunto reserva espacio para el encuadre y los selectores sin interceptar la navegación de la escena.
- El selector de idioma permanece abajo a la izquierda con el icono `GlobalLine` y el código ES/EN. La barra conserva espacio inferior para este control y permite scroll cuando la altura es reducida.
- Los avisos de actividad aparecen arriba a la derecha, independientes del panel abierto. En ventanas estrechas se sitúan debajo de la franja del reloj para evitar superposiciones.
- Los iconos principales proceden de [Flujo 1/svg.md](Flujo%201/svg.md), adaptados a React y con `currentColor`.
- La capa general utiliza `pointer-events: none`; solo los controles interactivos recuperan `pointer-events: auto`. El espacio libre permite operar la escena.
- Las piezas compartidas deben reutilizarse. La apertura, el posicionamiento y el tooltip no se implementan de nuevo para cada opción.

El panel izquierdo contiene la preparación del flujo. Al cargar una imagen se abre el inspector derecho con Datos, Apariencia y Comparar, y Preparación se cierra. El apartado 13 define esta distribución y el encuadre frontal que mantiene libre la imagen.

## 3. Apariencia oscura y minimalista

La referencia visual inicial se adaptó a una escena negra. Se emplean superficies sólidas oscuras, esquinas redondeadas e iconos claros.

| Uso | Referencia actual |
| --- | --- |
| Superficie de barra y panel | `#111722` |
| Fondo de controles | `#1a2331` |
| Interacción y selección | `#253247` |
| Texto principal | `#e1e7ef` |
| Texto secundario | `#a5b4c8` |
| Icono activo y foco de teclado | `#a9d9ff` |
| Tooltip informativo | Fondo `#29364a`, texto blanco |
| Tooltip de bloqueo/error | Fondo `#b42332`, texto blanco |
| Scroll | Tirador `#39475b`, interacción `#53657e` |

- No añadir bordes decorativos a barras, paneles, botones ni campos. La separación se obtiene mediante color, espacio y, en el panel, una sombra discreta.
- Conservar el contorno de foco de teclado: cumple una función de accesibilidad.
- Las flechas de anclaje son parte de la superficie del panel o del tooltip. Que se construyan con bordes CSS no implica dibujar un contorno decorativo.
- Los valores reutilizados se mantienen en variables CSS. Las variables globales de movimiento y scroll están en `src/styles/base/variables.css`; los valores propios del HUD, en su hoja de componente.

## 4. Apertura y cierre por clic

### Interacción con la barra

| Interacción | Decisión |
| --- | --- |
| Hover o foco sobre un icono principal | Mostrar solo su tooltip; no abrir ni cambiar paneles |
| Clic en una opción cerrada | Abrir su panel |
| Clic en la opción que ya está abierta | Cerrar su panel |
| Clic en otra opción | Cambiar directamente a ese panel |
| Salida de la barra o del panel, o pérdida de foco | Conservar el panel abierto |

No existen temporizadores de apertura o cierre. Los botones nativos también permiten activar la opción mediante Enter o Espacio. El tooltip conserva su animación de 140 ms, independiente de la visibilidad del panel.

Activar una opción descarta su tooltip mediante `dismissOnClick`, tanto al abrir como al cerrar el panel. El foco del botón se conserva para navegar con teclado, pero no mantiene el globo visible. Una nueva entrada del puntero o un nuevo foco puede mostrarlo otra vez; los tooltips de ayuda y de acciones bloqueadas conservan su comportamiento habitual.

### Tareas y aperturas programáticas

Cerrar un panel o cambiar de opción no cancela su tarea ni borra sus valores. El usuario puede volver a abrirlo para continuar o cancelar una operación mediante su control específico.

`useContextMenu` distingue `toggle(id)`, usado por los botones de la barra, de `open(id)`, usado por los flujos de búsqueda y restauración. Las aperturas programáticas son idempotentes: pedir que se abra Preparación cuando ya está abierta no la cierra. Al cargar una imagen se conserva el paso al inspector y el cierre del panel izquierdo.

El tamaño del recorte es un parámetro de aplicación inmediata: modificarlo no inicia una tarea pendiente ni requiere un botón de confirmación. El clic válido en la escena abre Preparación automáticamente para mantener accesibles la cancelación y los resultados; el progreso se muestra en el aviso superior derecho.

## 5. Posición, límites y flecha

La regla final prioriza el centrado vertical y los límites de la ventana. No se alinea siempre el borde superior del panel con el botón que lo abre: ese comportamiento dejaba demasiado abajo los paneles activados desde la última opción.

El posicionamiento sigue este orden:

1. Medir la altura real del panel y el espacio visible disponible.
2. Calcular una posición centrada verticalmente.
3. Ajustarla lo necesario para que la flecha pueda señalar al botón de origen.
4. Limitarla por los márgenes superior e inferior. Un panel extenso se desplaza hacia arriba cuando necesita espacio.
5. Calcular la posición de la flecha dentro de la superficie, evitando las esquinas redondeadas.

| Parámetro | Valor actual |
| --- | --- |
| Altura máxima | El menor valor entre 560 px y la altura visible menos ambos márgenes |
| Márgenes verticales | 24 px; 16 px en pantallas de hasta 600 px de ancho |
| Ancho de referencia | Hasta 330 px en escritorio; ajustado al espacio libre en móvil |
| Separación horizontal respecto a la barra | 26 px; 18 px en móvil |
| Distancia mínima del centro de la flecha a los extremos del panel | 35 px; 30 px en móvil, limitada por la propia altura del panel |

Recalcular la posición cuando cambian el contenido, el tamaño de la ventana o el área visible del dispositivo. La flecha forma parte de la superficie animada y debe permanecer unida a ella. No asignar desplazamientos verticales fijos por nombre de opción.

## 6. Encabezado, contenido desplazable y acciones fijas

Todos los paneles utilizan la estructura reutilizable de `PanelContent`:

| Zona | Contenido |
| --- | --- |
| Encabezado | Título, estado breve y controles que deben seguir a la vista |
| Cuerpo | Formularios, explicaciones, errores y listas que pueden necesitar scroll |
| Pie | Acciones principales, cancelación, aplicación o limpieza |

El pie permanece dentro del panel y fuera del cuerpo desplazable. No situar una acción importante después de una lista extensa ni fijarla a la ventana de forma independiente del panel.

Aplicación en el flujo 1:

- **Preparación:** tamaño compartido e instrucciones pertinentes en el encabezado; campos RA/Dec y carga pendiente en el cuerpo; búsqueda manual, cancelación o limpieza en el pie. El detector y los datos de una imagen cargada pertenecen al inspector derecho. El progreso de búsqueda y carga pertenece al aviso superior derecho.
- **Tiempo:** estado en el encabezado; fecha personalizada y referencias temporales en el cuerpo; control del reloj y aplicación de fecha en el pie.
- **Ubicación:** contexto del observador en el encabezado; coordenadas manuales y errores en el cuerpo; ubicación del dispositivo y aplicación manual en el pie.
- **Aspecto del cielo:** estado de las estrellas en el encabezado; visibilidad de la superficie central y errores en el cuerpo; reintento de carga en el pie cuando falla.

### Scroll

- El cuerpo tiene `min-height: 0` dentro de una columna flexible, para ceder espacio al encabezado y al pie.
- Se utiliza un scroll vertical fino y oscuro, con tirador redondeado y pista transparente; nunca una barra blanca que rompa la paleta.
- Referencias: `scrollbar-width: thin` y 6 px donde se aplica la personalización WebKit.
- Reservar espacio para el scroll mediante `scrollbar-gutter: stable` y contener el desplazamiento con `overscroll-behavior-y: contain`.
- Evitar un segundo scroll dentro de la lista de resultados: el cuerpo ya cumple esa función.
- En ventanas de hasta 520 px de alto, el encabezado también puede desplazarse para conservar accesibles las acciones del pie.

## 7. Contenido por estado y eliminación de redundancias

- Mostrar únicamente instrucciones y opciones pertinentes al estado actual.
- Presentar los pasos como una lista vertical real, no como una secuencia numerada dentro de un párrafo.
- No repetir el mismo aviso simultáneamente como bloque destacado y como tooltip.
- No añadir varios botones que realicen la misma acción con nombres diferentes.
- No introducir plegables dentro de estos paneles para esconder formularios que ya pertenecen a la opción elegida. Los plegables de Tiempo y Ubicación se retiraron por redundantes.
- Durante una operación, mostrar progreso y la cancelación correspondiente. Evitar presentar acciones incompatibles como si pudieran ejecutarse.
- La etiqueta de una acción debe describir su efecto real. «Limpiar imagen y resultados» no debe presentarse como «Limpiar filtros» si no restablece esos valores.

### Tiempo

Se eliminó la duplicación entre «Ahora» y «Reanudar», porque ambos volvían al reloj actual.

| Estado | Acción del reloj | Efecto |
| --- | --- | --- |
| En vivo | Pausar tiempo | Fija el instante mostrado |
| Pausado o fecha personalizada aplicada | Volver al tiempo actual | Regresa al instante actual y al modo en vivo |

El estado «En vivo / Live» se presenta como una insignia con acento de color y un punto de pulso suave. El estado pausado utiliza un indicador neutro estático. La animación decorativa se desactiva con `prefers-reduced-motion`; las etiquetas textuales identifican el estado independientemente del color.

«Aplicar fecha» es una acción distinta: interpreta el campo como UTC y fija ese instante. No existe una reproducción que continúe desde el instante pausado unos segundos por detrás del tiempo real; no denominarla «Reanudar» mientras ese comportamiento no exista.

La hora y fecha del HUD se muestran en la zona local del navegador. La entrada personalizada se interpreta como UTC. El tiempo del cielo no es la fecha de adquisición de una observación.

### Preparación y búsqueda

El tamaño predeterminado es **7 minutos de arco**, disponible desde el inicio aunque nunca se abra Preparación. El control del tamaño modifica inmediatamente un único valor compartido por ambas vías de búsqueda; no depende del envío del formulario RA/Dec ni de un botón «Aplicar» o «Buscar». Las consultas nuevas usan el valor vigente al iniciarse. Cambiarlo no relanza una consulta en curso ni modifica una imagen ya cargada.

La UI ofrece dos vías:

1. **Clic en la escena:** pulsar un punto del cielo sin arrastrar inicia la consulta directamente. Se retiró «Seleccionar región del cielo» y no existe un modo de selección que deba activarse previamente.
2. **Coordenadas manuales:** introducir RA y Dec y pulsar «Buscar coordenadas» envía esa posición. Este botón inicia la consulta manual; no confirma el tamaño del recorte.

Ambas vías solicitan solo la observación más reciente (`limit=1`) de cualquier detector y la cargan automáticamente cuando hay observador. La búsqueda manual sin ubicación conserva el resultado; después de definir el observador, «Cargar observación más reciente» permite cargarlo. Una vez cargada, su información pertenece al inspector derecho.

El inspector presenta D1–D6 como segmentos pastel con controles de radio nativos. Cambiarlo consulta la misma posición ICRS y tamaño, aplicando el nuevo detector. La imagen actual se conserva durante la carga y ante errores o resultados vacíos. Los rangos espectrales describen el detector; no garantizan la longitud de onda de un píxel ni una fecha común entre detectores.

El tamaño admitido es de 0,1 a 30 minutos de arco. Representa el lado angular de una imagen cuadrada, no una resolución en píxeles. Un área mayor suele producir una matriz con más filas y columnas, conservando la resolución nativa.

Las coordenadas manuales son ICRS en grados decimales: RA desde 0 hasta menos de 360 y Dec entre −90 y 90, incluidos ambos polos. La búsqueda manual utiliza `GET /api/v1/images` y convierte el tamaño de minutos de arco a grados. No requiere ubicación terrestre para consultar las observaciones. La carga y colocación de una imagen en el cielo local requieren un observador; el botón de carga explica ese requisito con un tooltip.

La búsqueda mediante un punto del cielo utiliza `POST /api/v1/images/search` y necesita la ubicación del observador. La latitud y longitud de Ubicación describen una posición terrestre; no son RA/Dec.

### Avisos reutilizables de actividad

- Utilizar `StatusNotice` para comunicar el progreso y la finalización de una tarea. Su posición la define `.status-region` en la capa HUD; no depende de Preparación ni de que el panel permanezca visible.
- Mantener la superficie sólida oscura, sin borde decorativo, con esquinas redondeadas y los colores compartidos `--hud-surface` y `--hud-text`. Los SVG `Loading2Line`, `CheckRounded`, `NoResultsOutlineBold` y `Cancel` utilizan `currentColor` y reproducen los iconos proporcionados para este aviso.
- Durante la consulta, mostrar «Buscando observaciones…». Con un resultado y observador, continuar directamente con «Cargando imagen…» y finalizar con «Imagen cargada». Sin observador, conservar el aviso de resultado y su recuento; si `has_more` es verdadero, «Más de N imágenes encontradas en IRSA» indica que hay observaciones anteriores fuera del límite actual de una imagen, sin expresar el total del archivo. Una consulta vacía utiliza el estado `empty`, con «No se encontraron observaciones en IRSA.» y el icono `NoResultsOutlineBold` en color neutro.
- La carga de la imagen elegida utiliza el mismo componente con «Cargando imagen…» y «Imagen cargada». No repetir los indicadores de progreso dentro de Preparación. El botón de cancelación y el detalle persistente de los errores siguen disponibles en el panel.
- Un fallo de búsqueda o carga muestra el estado `error`, con `NoResultsOutlineBold` en `--hud-error` y un mensaje breve que identifica la operación fallida. El panel conserva el diagnóstico traducido de la causa; no se repite ese mismo texto en el aviso. Los errores de validación y de actualización posterior de la proyección mantienen su presentación contextual.
- La cancelación explícita muestra `cancelled`, con el icono `Cancel` y «Operación cancelada». `useFitsImage.cancel` aborta la petición del navegador, limpia la operación y publica este aviso. `reset` limpia sin anunciar una cancelación: no confundir limpiar resultados con cancelar una operación en curso.
- La tarjeta entra desde fuera del borde superior y termina en la esquina superior derecha: 700 ms con desaceleración suave, sin rebote. El resultado permanece 3.200 ms y sale hacia arriba en 500 ms; la opacidad cambia en 420 ms. Estas duraciones locales dan al aviso un movimiento más pausado que el de los controles. No desmontar ni vaciar la superficie antes de completar la salida.
- El indicador gira continuamente en 1.800 ms y pulsa suavemente entre escala 1 y 1,08 en 2.400 ms. Los iconos de éxito, error, cancelación y ausencia de resultados aparecen suavemente en 500 ms. Giro, escala y desplazamiento de la tarjeta se aplican a capas distintas, sin escalar el texto.
- Todos los estados finales permanecen 3.200 ms antes de salir. Una operación nueva sustituye la anterior; sus temporizadores no pueden ocultar el aviso nuevo. Las respuestas canceladas no producen éxito, errores ni resultados vacíos tardíos. Los abortos internos al sustituir una petición, cambiar el contexto o desmontar el componente no generan el mensaje de cancelación explícita.
- El aviso no intercepta clics ni mueve el foco. Una región `role="status"`, con anuncio cortés y atómico, comunica los cambios sin leer los SVG. Con `prefers-reduced-motion`, se eliminan los desplazamientos, giros y pulsaciones; se conserva el tiempo para leer el resultado.

`StatusNotice` recibe `notice`: un objeto estable `{ status, message }` o `null` para cerrar. Admite `loading`, `success`, `error`, `cancelled` y `empty`. `message` es una clave o descriptor traducible de los catálogos ES/EN. Mantener el mismo objeto mientras no cambie la notificación y crear uno nuevo para cada operación o actualización permite repetir tareas con el mismo mensaje. `duration` configura la permanencia del resultado en milisegundos; su valor predeterminado es 3200 y un valor menor o igual a cero desactiva el cierre automático. La carga permanece visible hasta que cambie `notice`.

`useState` y `useEffect`, de React, conservan el contenido de salida y coordinan el temporizador; `setTimeout` y `clearTimeout` son API del navegador. Las animaciones son CSS nativo. El componente no consulta la API ni calcula resultados; `useFitsImage` aporta los mensajes según la operación real. No se requieren dependencias nuevas.

### Ubicación automática y avisos sobre la escena

- Solicitar la ubicación del dispositivo al iniciar, si el navegador y el contexto seguro lo permiten. Los permisos del navegador siguen siendo necesarios.
- Mantener el reintento y la entrada de latitud/longitud en Ubicación. Una entrada manual tiene prioridad sobre respuestas automáticas pendientes.
- Si se pulsa el cielo sin ubicación, anclar el tooltip al punto pulsado, no a un botón del panel. Durante la solicitud, mostrar información de espera; si falla, mostrar el motivo en rojo y cómo resolverlo.
- Si la solicitud falla después de marcar el punto, actualizar el aviso en ese mismo punto. Al obtener ubicación, retirar el aviso; el siguiente clic inicia la consulta.
- Aplicar el mismo aviso contextual cuando el tamaño del recorte no sea válido.
- El aviso se descarta con Escape o con otro clic. El gesto de arrastre no debe iniciar una consulta.
- Obtener la ubicación después de una búsqueda manual no debe borrar sus resultados.

### Estrellas, Sol y Luna, superficie central y guías celestes

- Las estrellas Hipparcos se cargan al disponer de ubicación y se actualizan con el contexto de Tiempo. El encabezado de Aspecto del cielo informa de carga, disponibilidad y cantidad.
- Un fallo de carga o actualización muestra el error y la acción «Volver a cargar estrellas». Las direcciones caducadas no se muestran.
- «Sol y Luna» comienza activado y requiere ubicación. Ambos siguen el reloj de la aplicación: se mueven en modo En vivo y se sitúan en la fecha seleccionada al pausar. Su carga no depende del catálogo de estrellas; los fallos tienen un reintento propio y las posiciones caducadas se ocultan.
- Las posiciones y tamaños angulares se calculan para el observador con las efemérides integradas de Astropy, conservando la distancia para incluir la paralaje lunar. La Luna muestra una iluminación aproximada orientada hacia el Sol. No se simulan refracción atmosférica, eclipses ni brillo diurno del cielo.
- El servidor envía muestras cada 10 segundos para una ventana de dos minutos. `useSolarSystem` renueva aproximadamente cada 90 segundos y el renderizador interpola entre muestras; no hay peticiones por fotograma. Los dos discos usan sombreadores procedurales, sin texturas ni modelos descargados.
- «Nebulosas y cúmulos» controla una capa ilustrativa independiente del fondo difuso: Orión, Laguna, Carina, Norteamérica, Pléyades y Omega Centauri. Comienza activada y requiere ubicación. Los centros de catálogo y el marco J2000 siguen la ubicación y el reloj; cada imagen conserva norte arriba y este a la izquierda en su parche celeste, en vez de girar hacia la cámara.
- Las texturas de cielo profundo son arte suave generado con ImageGen a partir de referencias observacionales de ESO, ESA/Hubble y NOIRLab, documentadas junto con sus filtros en `src/assets/deep-sky/REFERENCES-v2.md`. Formas, colores, límites y orientación interna son aproximados; el centrado de catálogo no convierte los píxeles en una imagen astrométrica. Los encuadres ilustrativos y las extensiones publicadas se distinguen en `src/data/deepSky/SOURCE.md`. No añadir estrellas puntuales inventadas sobre el catálogo real.
- La luz de cada textura decae gradualmente hasta negro; la mezcla aditiva conserva las colas tenues sin recortes por alfa. El negro no aporta luz al fondo, y un suavizado exterior evita costuras en el parche. No usar contornos opacos, discos rellenos ni siluetas cerradas para las nubes.
- Cada ilustración se descarga al entrar su parche en la vista. La carga no bloquea estrellas ni FITS; se limita a 512×512 píxeles por textura en GPU, con mipmaps y una geometría esférica de 128 triángulos por objeto. La capa se atenúa cuando los campos son subpíxel o superan 420–900 píxeles en pantalla y se oculta durante la inspección FITS. La carga diferida evita solicitar todos los PNG al entrar; los tamaños de las versiones activas se documentan junto a los archivos.
- «Mostrar superficie central» es un checkbox nativo de aplicación inmediata, activado por defecto. Conserva la guía transparente original: cuadrícula, anillos, ejes y retícula central. Las líneas tienen un gris ligeramente azulado y contraste suave; la cuadrícula secundaria se atenúa antes que los anillos para reducir la carga visual. Un fondo negro comienza al 22 % y se ajusta con «Oscuridad del suelo»: un `RangeField` de 0 a 100 %, con pasos de un punto porcentual, porcentaje visible y valor accesible. El control cambia solo el fondo, de opacidad uniforme hasta el horizonte real, sin degradado vertical y atenuado con el zoom, sin alterar el brillo de las líneas. No añadir paisaje ni textura de terreno.
- La guía ocupa únicamente el hemisferio inferior; la oscuridad elegida determina cuánto cielo se ve a través del fondo. No intercepta clics ni restringe la cámara; se dibuja detrás de las imágenes FITS y puede desactivarse. Su visibilidad es independiente de la ubicación y de la carga de estrellas. El deslizador se deshabilita al ocultar la superficie y conserva su valor al volver a mostrarla o cerrar el panel. `useGroundOpacity` guarda la preferencia en `localStorage` bajo `astrea.groundOpacity` y la restaura al recargar. Si no hay un valor válido entre 0 y 1, utiliza 22 %; si el almacenamiento no está disponible, el control sigue funcionando en memoria.
- Una semiesfera de baja resolución y un único sombreador sin texturas ni luces conservan un coste reducido. Las líneas se suavizan por píxel y se ocultan cuando su separación es demasiado pequeña. Se mantienen la reducción de opacidad al mirar abajo y el desvanecimiento entre zoom 1× y 8× del diseño original.
- «Constelaciones (88)», «Eclíptica» y «Cuadrícula RA/Dec» son controles independientes de aplicación inmediata. Las constelaciones comienzan activadas; la eclíptica y la cuadrícula, desactivadas. La selección se conserva durante la sesión al cerrar paneles o cambiar ubicación y hora.
- Las tres guías requieren una ubicación para orientarse respecto al horizonte. Hasta disponer de ella, sus controles están deshabilitados y el panel explica cómo habilitarlos. Las guías no dependen de que termine la descarga de estrellas.
- Las figuras de las constelaciones son un catálogo local de líneas entre estrellas, incluidas las constelaciones no zodiacales. No representan límites oficiales de regiones del cielo.
- El mismo control muestra los nombres oficiales latinos de las constelaciones hacia las que apunta la cámara. Se priorizan los más cercanos al centro, con un máximo de ocho sin solapamiento, tamaño de texto fijo y desvanecimiento entre zoom 6× y 20×. Serpens tiene anclas para Caput y Cauda. Un único atlas generado localmente y una llamada de dibujo instanciada evitan crear un elemento DOM o una textura por nombre.
- `Constellations` comparte la selección y la opacidad entre nombres y líneas. Solo aparecen las figuras cuyos nombres están seleccionados para la vista; la entrada suave y el desvanecimiento con zoom se aplican a ambos. Serpens conserva dos figuras independientes. Un lote de líneas y 89 valores de opacidad evitan recrear geometría o actualizar estado React en cada fotograma.
- La cuadrícula usa coordenadas J2000, con ascensión recta en horas y declinación en grados. La eclíptica representa el plano medio de fecha de la órbita terrestre. Todas las guías siguen la ubicación y el reloj del cielo mediante el marco ecuatorial compartido; son referencias visuales, no una calibración astrométrica de las imágenes FITS.
- Las estrellas, cuerpos, líneas y etiquetas se dibujan en la capa de fondo, detrás de las imágenes, y no interceptan clics. Las explicaciones reutilizan `HelpButton` y funcionan con ratón, foco de teclado y pulsación.

### Navegación de la cámara

- El arrastre horizontal cambia únicamente el rumbo y el vertical únicamente la elevación, siguiendo los controles del prototipo. La cámara gira desde el centro del cielo.
- La navegación inicial mantiene el giro lateral en cero. La elevación se limita justo antes del cenit y del nadir para evitar invertir el horizonte.
- El arrastre interpola rumbo y elevación por separado. El encuadre de imágenes utiliza su orientación frontal WCS y una transición GSAP de cuaterniones; el arrastre posterior conserva el giro lateral alcanzado.
- La sensibilidad depende del zoom ortográfico vigente. La transformación astronómica del fondo no debe inclinar la cámara ni los controles locales.

## 8. Tooltips reutilizables y explicación de bloqueos

Utilizar `Tooltip` para nombres, información breve y motivos de bloqueo; no crear variantes independientes para cada menú.

| Uso | Presentación |
| --- | --- |
| Nombre de una opción principal | Tooltip compacto informativo |
| Explicación de un campo | Tooltip informativo asociado al icono «i» |
| Acción bloqueada por un requisito ausente o inválido | Tooltip rojo con causa y forma de resolverla |
| Clic en el cielo sin ubicación o con tamaño inválido | El mismo tooltip, anclado a las coordenadas de pantalla del clic |

Ejemplo de bloqueo: «Falta tu ubicación. En Ubicación, usa el dispositivo o introduce latitud y longitud.» El rojo señala el problema; el texto explica cómo continuar. No limitarse a desactivar silenciosamente un botón.

Cuando el usuario necesita enfocar una acción bloqueada para leer su motivo, utilizar `aria-disabled` y bloquear expresamente su ejecución en el manejador. El atributo por sí solo no impide el clic. Mantener `disabled` nativo donde corresponda a otros controles.

El tooltip:

- Aparece con hover o foco; la ayuda «i» también se abre al pulsarla.
- Se asocia al elemento mediante `aria-describedby` y utiliza `role="tooltip"`.
- Puede descartarse con Escape.
- Se posiciona dentro de la ventana y cambia de lado si falta espacio.
- Su ancho se ajusta al contenido, con un máximo de 280 px (190 px en la variante compacta) y sin superar el ancho de la ventana menos 24 px. Los textos largos se distribuyen en varias líneas.
- Se renderiza mediante un portal fuera del área desplazable para evitar recortes por `overflow`.
- No contiene acciones interactivas ni intercepta el ratón.

Los errores de solicitud o validación que requieren atención en el formulario pueden mostrarse en el cuerpo, con `role="alert"`. Esto no justifica duplicar el mismo mensaje en dos superficies a la vez.

## 9. Ayuda para conceptos técnicos

Los campos con datos poco familiares utilizan `InputField`: etiqueta visible, entrada nativa y botón de información a la derecha de la fila. El botón utiliza el SVG `InfoRounded` proporcionado para el flujo 1 y abre el mismo `Tooltip` compartido.

Latitud, longitud, RA y Dec utilizan `ScrubbableNumberField`: botón «−» a la izquierda, valor editable en el centro y botón «+» a la derecha. Un clic corto permite escribir; un arrastre horizontal ajusta el valor sin entrar en edición al soltar. Conservan entrada numérica nativa, navegación por teclado y las ayudas de cada coordenada. Los cambios modifican el borrador: Ubicación requiere «Aplicar» y Preparación «Buscar coordenadas». Latitud/Dec y longitud respetan sus límites; los ajustes de RA pueden cruzar circularmente entre 360° y 0°, mientras la entrada manual mantiene la validación de 0 ≤ RA < 360°.

La ayuda debe explicar qué representa el dato, sus unidades y, cuando sea útil, un ejemplo o su efecto sobre el resultado. No repetir la etiqueta ni limitarse a decir «Introduce un valor».

| Campo | Enfoque de la explicación |
| --- | --- |
| Tamaño del recorte | Cuánto cielo abarca cada lado y su relación con las filas y columnas de la matriz; no confundirlo con resolución en píxeles |
| Fecha y hora UTC | Qué instante se desea mostrar y que UTC es una referencia mundial distinta de la hora local |
| Latitud | Posición norte/sur del ecuador, grados decimales y signo |
| Longitud | Posición este/oeste de Greenwich, grados decimales y signo |
| RA y Dec | Posición del punto en el cielo en ICRS, grados decimales y rangos; distinguirlas de latitud/longitud terrestres |

La descripción se vincula tanto al campo como al botón de ayuda. Usar lenguaje accesible, ortografía correcta y textos breves en el idioma seleccionado. Los textos visibles, ayudas y etiquetas accesibles se obtienen de los catálogos ES/EN de `src/i18n/locales/`. Los identificadores y nombres de archivos permanecen en ASCII.

## 10. Microinteracciones y accesibilidad

Las transiciones suaves forman parte del diseño, no son un añadido opcional. Deben permitir reconocer cambios sin deformar el contenido ni mover controles vecinos.

| Interacción | Referencia actual |
| --- | --- |
| Movimiento principal | 360 ms, `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Salida y opacidad del panel | 180 ms |
| Tooltip | 140 ms, opacidad y escala breve |
| Aviso de actividad | Entrada superior de 700 ms, resultado visible 3.200 ms y salida superior de 500 ms; opacidad de 420 ms |
| Icono de carga del aviso | Giro de 1.800 ms y pulso de 2.400 ms, escala máxima 1,08 |
| Fondo del botón con hover o foco | Escala `1.025` |
| Fondo del botón al pulsar | Escala `0.985` |
| Superficie del panel al entrar o salir | Desplazamiento horizontal de 8 px y cambio de opacidad |

- Separar fondo, texto e icono. En los botones actuales se anima un pseudoelemento de fondo; el texto permanece estable.
- Aplicar una reacción principal por interacción y limitar el rebote a un efecto discreto.
- Conservar las transiciones en la salida: ocultar o desmontar instantáneamente elimina esa animación.
- Los paneles cerrados son `inert`, tienen `aria-hidden` y no interceptan eventos, incluso durante la salida visual.
- Limitar el hover visual a dispositivos compatibles. Conservar navegación por teclado, controles nativos y foco visible.
- Respetar `prefers-reduced-motion`; los valores temporales se reducen a cero y se elimina el movimiento decorativo.
- No utilizar `transition: all`.

El flujo 1 utiliza CSS en la superficie interna del panel y no añade GSAP como dependencia. Si otro flujo incorpora GSAP para los contenedores, mantener las microinteracciones CSS en capas internas y evitar que ambos controlen `transform` u `opacity` del mismo elemento. Para selectores, sliders y otros controles futuros, consultar también los patrones específicos de [desing.md](../desing.md).

## 11. Componentes y responsabilidades que se deben reutilizar

Las rutas de esta tabla son relativas a `frontend/`.

| Archivo | Responsabilidad y uso |
| --- | --- |
| `src/components/layout/AppViewport.jsx` | Integra el clic directo, los avisos sobre la escena y los estados que requieren persistencia |
| `src/components/controls/ContextToolbar.jsx` | Opciones principales y presentación de los paneles |
| `src/components/common/ContextPanel.jsx` | Superficie, anclaje y visibilidad; recibe `id`, `anchorId`, `label`, `visible` y contenido |
| `src/components/common/PanelContent.jsx` | Distribución por `title`, `header`, cuerpo en `children` y acciones en `footer` |
| `src/components/common/Tooltip.jsx` | Información o error mediante `message` y `tone`; admite `compact`, anclaje al tamaño del control con `inline`, `placement`, `id`, apertura controlada con `open` y ancla virtual `point` para el clic en la escena |
| `src/components/common/InputField.jsx` | Campo nativo con `label`, `help`, identificador y propiedades de entrada; comparte `HelpButton` con el inspector |
| `src/components/common/Select.jsx` | Selector personalizado controlado, opciones habilitadas/deshabilitadas, teclado y portal con posición adaptable |
| `src/components/controls/LanguageSelect.jsx` | Idioma abajo a la izquierda, icono global y abreviatura del idioma actual |
| `src/hooks/useSelectPosition.js` | Medición y adaptación del select a ventana, límites y controles cercanos |
| `src/i18n/` | Catálogos por idioma/sección, proveedor React, formatos locales y errores traducibles |
| `src/components/common/StatusNotice.jsx` | Aviso reutilizable con `notice` y `duration`, progreso persistente, resultado temporal y salida animada |
| `src/components/common/StatusIcons.jsx` | Iconos `Loading2Line`, `CheckRounded`, `NoResultsOutlineBold` y `Cancel`, reutilizables y decorativos por defecto |
| `src/hooks/useContextMenu.js` | Alternancia por clic y apertura programática idempotente, sin temporizadores |
| `src/hooks/useAnchoredPanel.js` | Medición, centrado, límites y posición de la flecha |
| `src/hooks/useTooltipPosition.js` | Posición del tooltip y adaptación al espacio visible |
| `src/hooks/useSkyClock.js` | Tiempo en vivo, pausa, regreso al presente y aplicación de fecha |
| `src/hooks/useObserver.js` | Solicitud automática de ubicación, reintento y prioridad de la entrada manual |
| `src/hooks/useStars.js` | Carga, renovación y cancelación del cielo estelar según ubicación y tiempo |
| `src/hooks/useSolarSystem.js` | Carga, renovación y cancelación del Sol y la Luna según ubicación, tiempo y visibilidad |
| `src/components/controls/SkyControls.jsx` | Estado y reintento de estrellas y cuerpos, visibilidad del suelo, fondo y guías |
| `src/hooks/useFitsImage.js` | Tamaño compartido, filtro de detector, consultas por clic o RA/Dec, carga automática de la observación más reciente y avisos de la operación vigente |
| `src/config/search.js` | Tamaño inicial de 7 minutos de arco, detectores D1–D6 y validación de tamaño y coordenadas |
| `src/styles/base/variables.css` | Variables globales de movimiento y scroll |
| `src/styles/components/context-toolbar.css` | Barra, paneles, distribución, límites, scroll y estados visuales |
| `src/styles/components/tooltip.css` | Variantes y animación del tooltip |
| `src/styles/components/input-field.css` | Distribución del campo y botón de ayuda |
| `src/styles/components/status-notice.css` | Superficie, entrada/salida, giro y pulso del aviso de actividad |
| `src/styles/layout/viewport.css` | Capas de la escena y anclaje adaptable de los avisos superiores |

Los componentes y hooks utilizan React; el portal procede de `react-dom`. `ResizeObserver`, `requestAnimationFrame`, `getBoundingClientRect` y `visualViewport` son API del navegador utilizadas para medir y actualizar posiciones. Estos patrones no requieren una biblioteca externa de tooltips o posicionamiento.

La presentación se define en hojas CSS importadas desde `src/styles/main.css`. Los hooks comunican las mediciones dinámicas mediante propiedades CSS personalizadas; no trasladar colores, espaciados estáticos ni bloques de estilos al JSX.

### Selectores e idioma

Reutilizar `Select` en lugar de crear menús independientes. Su lista se abre arriba o abajo según el espacio visible y los obstáculos declarados; puede ajustarse horizontalmente manteniendo el anclaje. Si no hay espacio libre suficiente, se superpone al contenido para conservar opciones utilizables. Las listas extensas se desplazan dentro del límite disponible. Se conservan la superficie oscura sin bordes decorativos, la marca de selección, el foco de teclado y las transiciones de salida con `inert`.

El cambio de idioma es inmediato, conserva las tareas y actualiza también errores, avisos, accesibilidad y etiquetas del cielo. El idioma inicial es inglés salvo que exista una preferencia guardada válida. No guardar frases traducidas en el estado. Consultar [Internacionalización y selector compartido](I18N.md) para el contrato del componente y la ampliación de catálogos.

`Select` monta su lista mediante un portal dentro del diálogo nativo más cercano, si existe; fuera de diálogos utiliza `document.body`. Así la lista permanece visible e interactiva en la top layer, sin competir con el fondo del modal.

En el HUD, el botón `InfoRounded` ocupa una fila encima del selector de idioma y abre «Acerca de Astrea» en un diálogo de 640 px. Conserva su tooltip y nombre accesible. El HUD reserva 96 px para ambas filas. `AboutModal` y `AboutContent`, en `components/layout/`, reutilizan `Modal` y cuentan con estilos propios en `styles/components/about.css`. Incluyen una descripción del equipo, las seis fotos locales de `src/assets/team/`, los nombres, roles y perfiles definidos en `src/config/team.js`, y el repositorio público. Los textos se guardan en `src/i18n/locales/{es,en}/about.json`. Los enlaces externos se anuncian como apertura en otra pestaña y utilizan `noopener noreferrer`. «Cerrar», Escape y el fondo inician una salida animada; al terminar, el foco pasa al área principal sin contorno visual ni desplazamiento. Los controles conservan sus indicadores de foco de teclado. La lista usa dos columnas en escritorio y una en móvil; solo se desplaza el cuerpo y el cierre permanece accesible. Los tooltips, al igual que los selectores, se montan dentro del diálogo nativo más cercano para permanecer en su capa.

## 12. Aplicación a nuevas pantallas

Antes de añadir una opción al HUD:

1. Definir su objetivo, estados, requisitos de entrada, acción principal y condiciones de finalización o cancelación.
2. Decidir qué permanece visible en encabezado y pie, y qué contenido debe desplazarse.
3. Reutilizar los componentes y hooks anteriores; asignar un ancla identificable al panel.
4. Elegir la política temporal o persistente según la tarea, no según el aspecto del componente.
5. Redactar nombres, ayudas y bloqueos sin duplicaciones ni términos que prometan un comportamiento diferente del real.
6. Aplicar la paleta oscura, las microinteracciones, los límites de ventana y la accesibilidad establecidos.

Comprobar visualmente la apertura desde cada icono, el recorrido del ratón hasta el panel, las tareas pendientes, las listas extensas, las acciones del pie, los tooltips y los tamaños de ventana reducidos. La validación estática no acredita por sí sola estos comportamientos visuales.

Si una decisión cambia, actualizar esta guía y sus referencias en la misma entrega para evitar que una solución descartada vuelva a introducirse.

## 13. Inspector derecho y encuadre frontal

### Composición y navegación

- `ImageInspector` contiene una barra de pestañas, cierre, encabezado común, cuerpo y acciones de la pestaña activa. Reutiliza `PanelContent`; no utiliza el anclaje con flecha ni el cierre por hover de `ContextPanel`.
- El encabezado muestra fecha UTC, detector y publicación de la imagen visible. Estos datos se retiran de Preparación y de la zona inferior de la imagen.
- Cerrar pausa la reproducción y conserva las imágenes y los ajustes. «Abrir inspector» recupera la vista y su encuadre. El foco regresa al control correspondiente.
- Cambiar de pestaña pausa la reproducción y conserva la selección. «Buscar otra región» limpia la sesión y abre Preparación. Mientras se inspecciona, pulsar la escena no inicia otra búsqueda accidentalmente.
- El panel usa la paleta oscura existente, superficies sin bordes decorativos y los iconos de `Flujo 2/svg.md`. En ventanas estrechas se sitúa abajo; la barra izquierda se desplaza internamente y el idioma ocupa la zona superior.
- El cuerpo tiene un solo scroll. En alturas reducidas el encabezado también puede desplazarse para conservar el contenido y las acciones accesibles.

### Detector y ayuda compartida

- `DetectorSelector` presenta seis segmentos pastel D1–D6, con nombres visibles, selección marcada y teclado nativo. El color identifica opciones; no representa datos espectrales medidos.
- El icono «i» de «Explorar detectores» muestra los rangos nominales y explica que la fecha puede cambiar. Los segmentos seleccionan el detector. «Más reciente de cualquier detector» restablece la consulta sin filtro.
- `HelpButton` reutiliza `Tooltip` con `inline` y el icono informativo del flujo 1. El área de hover y el anclaje de la flecha coinciden con el botón «i». Se emplea en encabezados, campos y metadatos; `InputField` comparte el mismo componente. Las etiquetas y los valores no activan la ayuda.
- Una búsqueda fallida o vacía conserva la imagen anterior y su identidad real. El selector indica el detector cargado, no atribuye la imagen al filtro que falló.

### Contenido de las pestañas

| Pestaña | Organización |
| --- | --- |
| Datos | Datos básicos: dimensiones, tamaño solicitado y porcentaje de píxeles finitos. Datos técnicos: posición solicitada, centro real, unidad original, precisión, mínimo/máximo e identificador |
| Cabecera WCS | Vista interna de Datos con regreso visible; tarjetas del archivo y sus descripciones, sin un segundo scroll |
| Apariencia | Visualización: paleta, brillo, opacidad y restauración. Procesamiento: flags, fondo zodiacal y señal/ruido, inicialmente desactivados |
| Comparar | Referencia A, criterio de otra fecha con mismo/cualquier detector, candidatas B, carga independiente, separación temporal y acciones A/B |

En Apariencia, la paleta ofrece Escala de grises, Color, Ámbar, Hielo, Violeta-dorado e Invertida. Son rampas de visualización de intensidad; la leyenda «Débil → Brillante» sigue la paleta seleccionada, incluida la escala invertida. El selector y el sombreador comparten las definiciones de `config/appearance.js`; las rampas nuevas son propias, sin atribuirles nombres de mapas científicos publicados. Cambiar la paleta no solicita píxeles de nuevo ni modifica el procesamiento, la exposición o la opacidad. «Restaurar apariencia» recupera los valores predeterminados.

La búsqueda inicial sigue limitada a una observación. Comparar solicita hasta 50 candidatas por una operación distinta y explica `has_more`. Excluye A, tiempos ausentes o equivalentes y detectores incompatibles con el criterio. Cargar o cancelar B conserva A. El filtro por longitud de onda específica no se presenta: la API aún no proporciona ese contrato.

Ambas imágenes usan sus propias mallas WCS y un intervalo de intensidad compartido. A define la orientación frontal y B conserva su geometría para mantener la alineación celeste. Los píxeles originales se conservan. Las opciones de procesamiento se aplican conjuntamente y solo habilitan reproducción cuando ambas terminan y tienen píxeles válidos. Las unidades originales deben ser conocidas y compatibles; el modo señal/ruido se identifica como adimensional. Una posición caducada detiene la reproducción y deja de dibujarse.

### Imagen completa y movimiento

- `useImageViewport` mide barra, paneles abiertos, reloj, idioma y región de avisos mediante marcadores `data-image-obstacle` y `ResizeObserver`.
- `availableImageRect` calcula un rectángulo libre con márgenes; `imageFrame` encuadra todos los vértices WCS de A y, cuando corresponde, B dentro de esa zona.
- La orientación es frontal y fiel: mantiene las dimensiones y distorsiones reales. Un archivo rectangular sigue siendo rectangular, sin recortar ni estirar datos.
- `SkyCameraRig` usa `gsap.to` con 1,8 segundos y `power2.inOut` para orientación, zoom y desplazamiento de proyección. Conserva la cámara en el centro de la esfera.
- Mientras permanece encuadrada, la cámara sigue la proyección en vivo. Arrastrar o ampliar interrumpe el seguimiento; «Centrar imagen» lo recupera. Cambiar la distribución recalcula el encuadre.
- `prefers-reduced-motion` elimina la transición de cámara. CSS controla las microinteracciones del inspector y GSAP controla exclusivamente la transición de cámara.

### Responsabilidades reutilizables

| Componente o hook | Responsabilidad |
| --- | --- |
| `Tabs`, `MetadataList`, `RangeField`, `HelpButton` | Primitivas accesibles independientes del dominio |
| `ImageInspector` | Composición del inspector y navegación |
| `ImageDataPanel`, `ImageAppearancePanel`, `ImageComparisonPanel` | Contenido específico de cada pestaña |
| `useFitsImage` | Región inicial, imagen A y cambio de detector |
| `useProjectedImage` | Proyección de cada imagen, renovación, vigencia y reintento |
| `useImageAppearance` | Ajustes visuales, procesamiento y normalización compartida |
| `useImageComparison` | Consulta de candidatas y carga independiente de B |
| `useBlinkPlayback` | Imagen visible, pausa y temporización de alternancia |
| `useImageViewport`, `imageFrameUtils` | Medición del espacio libre y cálculo del encuadre |

Los hooks usan React; el cálculo geométrico usa Three.js y la animación usa GSAP. Los servicios siguen utilizando `fetch` y `AbortController`. Los textos, ayudas y estados proceden de los catálogos ES/EN. Se añade únicamente la dependencia `gsap`.

## 14. Enlaces compartidos y diálogos

La aplicación abre directamente el espacio de trabajo. Los enlaces compartidos restauran RA, Dec, tamaño y detector; la ubicación terrestre y la fecha del observador no se comparten. Un enlace válido inicia la vista con Greenwich como observador de referencia explícito (`source: reference`), sin solicitar geolocalización, para cargar la imagen y abrir el inspector automáticamente también en otros dispositivos. El inspector y Ubicación identifican esa referencia; el usuario puede cambiarla manualmente o solicitar la ubicación del dispositivo. Preparación se abre durante la búsqueda para mostrar progreso, resultados vacíos y errores, y se cierra al cargar la imagen.

El inspector coloca «Copiar enlace» como botón de icono `Share3` de 44 px a la derecha de la fecha de observación, en la misma fila horizontal y sin superponer los detectores ni los avisos. Reutiliza `ShareLink` con `iconOnly`, el tooltip común y los colores y microinteracciones del HUD. Solo anuncia la copia tras resolver `navigator.clipboard.writeText`; el tooltip de éxito dura 2400 ms y el resultado se anuncia también mediante una región de estado accesible. Si el portapapeles falla, muestra el enlace seleccionable para copiarlo manualmente en una fila de ancho completo, sin afirmar éxito. Durante una búsqueda celeste pendiente se deshabilita el control. Los estilos se importan desde `styles/main.css`.

`Modal` usa `<dialog>` nativo y un portal de React DOM, sin dependencias adicionales. Mantiene los límites de pantalla, el desplazamiento interno y la restauración del foco. La confirmación de región y «Acerca de Astrea» reutilizan esta base. `closing` y `onExited`, junto con `animationend` y un temporizador de respaldo, coordinan el desmontaje y el foco. Con movimiento reducido se omiten las animaciones.
