# Arquitectura Frontend — Astrea (SPHEREx & Planet X)

Este documento describe la organización arquitectónica de `frontend/src/` y el propósito específico de cada carpeta y sección del proyecto.

## Consulta obligatoria para nueva UI

Antes de crear o modificar componentes de interfaz, consultar la [Guía de diseño e interacción](UI_DESIGN_GUIDE.md) y las [reglas de diseño minimalista](../desing.md). La guía recoge las decisiones actuales del flujo 1 y los componentes reutilizables; es la referencia para la presentación y el comportamiento del HUD al extender esta arquitectura.

---

## 1. Visión General y Capas Visuales

El objetivo principal de **Astrea** es permitir que cualquier persona ingrese las coordenadas de una región del cielo (`Ascensión Recta` y `Declinación`) —o seleccione uno de los cinco objetos de validación del reto— y observe una secuencia de imágenes reales de **SPHEREx** reproducirse como un pequeño video (*blink*) para identificar objetos en movimiento o estrellas variables.

La interfaz opera sobre un **viewport fijo a pantalla completa (`100vw` × `100dvh`)** dividido en dos planos superpuestos:

1. **Capa de Escena 3D (`.scene-layer`, fondo interactivo):**
   Gestionada con **Three.js**, **React Three Fiber** y **Drei**. Renderiza la bóveda celeste en coordenadas astronómicas ICRS (`RA`, `Dec`), ubica espacialmente los objetivos de prueba y encuadra el *Field of View (FoV)* seleccionado.
2. **Capa de Interfaz / HUD (`.ui-layer`, frente superpuesto):**
   Construida en **React (JS)** con **CSS nativo tradicional** y contenedores animados mediante **GSAP**. El contenedor raíz de esta capa mantiene `pointer-events: none` para dejar pasar los giros y clics hacia el espacio 3D en las zonas libres, mientras que cada barra o panel interactivo reactiva `pointer-events: auto`.

---

## 2. Mapa de Carpetas (`frontend/src/`)

```text
frontend/src/
├── animations/
├── assets/
├── components/
│   ├── blink-hud/
│   ├── common/
│   ├── controls/
│   └── layout/
├── config/
├── contracts/
├── hooks/
├── i18n/
│   └── locales/
│       ├── es/
│       └── en/
├── services/
├── store/
├── styles/
│   ├── base/
│   ├── components/
│   └── layout/
└── three/
    ├── core/
    └── elements/
```

---

## 3. Propósito Detallado de Cada Sección

### `src/i18n/` — Internacionalización

Centraliza los catálogos JSON por idioma y sección, el proveedor React, los formatos de números y fechas con Intl y los descriptores de errores traducibles. `components/common/Select.jsx` ofrece el selector reutilizable; `components/controls/LanguageSelect.jsx` lo utiliza para cambiar entre ES y EN y conservar la preferencia. Consultar [I18N.md](I18N.md) para añadir textos, secciones e idiomas.

### `src/styles/` — CSS Nativo Tradicional
Centraliza todas las hojas de estilo del proyecto bajo una estructura clásica separada por responsabilidad, importadas en orden desde un único archivo maestro (`main.css`):

- **`styles/base/`**: Fundamentos globales de diseño. Contendrá las variables CSS (`variables.css` para paleta espacial oscura, transparencias tipo cristal/`backdrop-filter`, tipografía y niveles `z-index`) y la normalización base (`reset.css` asegurando `100vw` × `100dvh` sin desbordamiento de scroll).
- **`styles/layout/`**: Reglas estructurales de pantalla. Define la superposición entre la escena 3D y la capa de interfaz (`viewport.css`), el comportamiento `pointer-events` y las zonas de anclaje donde se ubican las barras y el HUD (`hud-layout.css`).
- **`styles/components/`**: Hojas de estilo individuales y aisladas para cada componente visual (contenedor cristal base `.panel`, barra de búsqueda de coordenadas, tarjetas de objetivos rápidos, reproductor `<canvas>` del Blink, tabla de épocas y panel de metadatos).
  - *Convención con GSAP:* CSS define estética, maquetación y estados `:hover` simples; **GSAP controla `transform` y `opacity`** de los contenedores, evitando declarar `transition: transform` o `transition: all` sobre paneles animados por GSAP para no generar conflictos.

---

### `src/three/` — Espacio Tridimensional (Bóveda Celeste)
Agrupa exclusivamente los módulos que viven dentro del `<Canvas>` de **React Three Fiber**. No almacena modelos 3D estáticos de planetas; toda la escena se construye matemáticamente a partir de coordenadas celestes reales:

- **`three/core/`**: Infraestructura base de la escena 3D.
  - Controlador de cámara (`SkyCameraRig`) con `OrbitControls`. Cuando el usuario selecciona una coordenada o un objetivo, **bloquea por completo el movimiento manual** hasta que termina el vuelo de cámara animado con GSAP (`onComplete`).
  - Utilidades astronómicas (`coordinateUtils`) encargadas de convertir tanto grados decimales como formato sexagesimal (`08h55m10.831s`, `-7d14m42.53s`) a grados ICRS (`0–360°`, `-90–+90°`) y a vectores cartesianos 3D `(x, y, z)`.
- **`three/elements/`**: Objetos visuales renderizados en el espacio 3D.
  - Esfera celeste de referencia con fondo estelar y detección de clic sobre el cielo.
  - Marcadores 3D interactivos para los cinco objetivos de validación (*Barnard's Star*, *Epsilon Indi B*, *WISE 0855*, *RW Aurigae* y *R Draconis*).
  - Retícula 3D (`FovReticle3D`) que representa visualmente el área del cielo abarcada por el *Field of View* elegido (`0.02°` a `0.5°`).

---

### `src/animations/` — Motor de Transiciones (GSAP)
Concentra la configuración de **GSAP (`@gsap/react`)** y las funciones reutilizables de animación tanto para HTML como para Three.js:

- **Animaciones de Contenedores HTML**: Presets de entrada y salida suave (`opacity`, desplazamiento lateral/vertical y escalado) para desplegar y ocultar paneles del HUD.
- **Transiciones en la Escena 3D**: Líneas de tiempo (`gsap.timeline`) que interpolan las propiedades numéricas de la cámara de Three.js (orientación hacia `RA/Dec` y acercamiento de `camera.fov`) junto con la retícula 3D, gestionando el bloqueo de interacción durante el trayecto y disparando la apertura del HUD al finalizar (`onComplete`).

---

### `src/components/` — Interfaz Superpuesta (HUD)
Contiene todos los componentes React (DOM/HTML) que flotan sobre el espacio tridimensional:

- **`components/layout/`**: `AppViewport` abre directamente la sesión y controla el diálogo «Acerca de Astrea». `AppWorkspace` integra el lienzo, los hooks y el inspector.
- **`components/common/`**: Piezas transversales reutilizables, principalmente el contenedor envolvente animado con GSAP (`AnimatedPanel`), que mantiene los paneles en el DOM mientras dura su animación de salida y desactiva sus `pointer-events` al cerrarse.
- **`components/controls/`**: Herramientas de entrada y navegación rápida.
  - Buscador principal de coordenadas (`RA` / `Dec`), ajuste de `FoV` (`0.02°–0.5°`) y selectores de `collection` y `detector` (`1–6`).
  - Barra de acceso rápido de un clic hacia los cinco objetivos de validación del reto.
- **`components/blink-hud/`**: **HUD Dedicado de Inspección Temporal**. Se despliega sobre el espacio 3D al consultar una región y actúa como un reproductor de video astronómico:
  - Reproductor en `<canvas>` 2D de la secuencia de épocas (*Blink*) con controles `Play/Pause`, velocidad (`200–2000 ms`), **etiqueta de fecha (`epoch`) y contador siempre visibles**, zoom local `1–4×`, **Modo Diferencia** (resta de píxeles entre épocas en el navegador para resaltar movimiento) e indicador de carga/reintento individual por cada frame.
  - Tabla de épocas (`FrameTable`) con fecha, detector, rango de longitud de onda en micrómetros (`band_min_um` – `band_max_um`), escala de píxel y estado de caché.
  - Panel de metadatos (`MetaPanel`) con conteo de banderas de calidad/contaminación (`flags_summary`) y avisos de la consulta.

---

### `src/store/` — Estado Global Sincronizado (Zustand)
Actúa como puente directo y ligero entre el árbol DOM (interfaz HTML), los parámetros de la URL y el árbol WebGL (`<Canvas>` de React Three Fiber) sin provocar renderizados innecesarios:

- Almacena las coordenadas activas (`ra`, `dec`), `fov`, `collection`, `detector`, lista de `frames` recibidos, estado de reproducción del Blink (índice actual, play/pause, velocidad, zoom, modo diferencia), estado de bloqueo de cámara (`isCameraLocked`) y visibilidad de los contenedores HUD.

---

### `src/hooks/` — Hooks de Comportamiento y Ciclo de Vida
Encapsula lógica reactiva reutilizable separada de la vista:

- **Sincronización con la URL (`useUrlSync`)**: Lee al iniciar y actualiza mediante `history.replaceState` los parámetros `?ra=&dec=&fov=&collection=&detector=&speed=` para que cualquier vista pueda compartirse o incrustarse fácilmente.
- **Precarga de Imágenes (`useFramePreloader`)**: Descarga en paralelo las imágenes PNG de cada época gestionando estados individuales (`loading`, `loaded`, `error`) y permitiendo reintentar frames aislados si el servidor tarda en frío.
- **Ciclo de Animación (`useAnimatedMount`)**: Coordina con `useGSAP` la entrada y la espera de animación de salida antes de desmontar un contenedor en React.

---

### `src/services/` y `src/contracts/` — Integración con el Backend
Aísla toda la comunicación HTTP respecto a los componentes visuales, siguiendo el contrato definido para el servidor FastAPI (`astropy` / `astroquery` / IRSA SIA v2):

- **`contracts/`**: Documentación estructurada (JSDoc / esquemas) de los parámetros de consulta y las respuestas JSON esperadas de `GET /api/frames`, `GET /api/frames/{id}/image` (imágenes PNG de 8 bits reproyectadas con *stretch* uniforme por consulta) y `GET /api/health`.
- **`services/`**: Funciones de petición HTTP, construcción de URLs de imagen con parámetros de escala/contraste y manejo estandarizado de errores (`4xx`, `502`, `504`). El frontend nunca descarga ni procesa archivos FITS crudos en el navegador.

---

### `src/config/` y `src/assets/` — Configuración y Recursos Estáticos
- **`config/`**: Parámetros constantes y fáciles de actualizar ante nuevas entregas de datos de SPHEREx: lista de colecciones válidas (`spherex_dr1`, `spherex_dr1_deep`, `spherex_qr3`), especificaciones de los 6 arreglos de detectores (`0.75–5.0 µm`), límites permitidos de `FoV` y velocidades de reproducción, y catálogo con las coordenadas y descripciones de los cinco objetos de prueba.
- **`assets/`**: Iconos vectoriales (SVG) y recursos gráficos ligeros propios de la interfaz de usuario.

---

## 4. Flujo Resumido de Interacción

1. **Selección de destino:** El visitante ingresa coordenadas (`RA`/`Dec` en grados o formato `08h55m...`), abre un enlace con parámetros en la URL, o elige uno de los 5 objetos de prueba desde la barra o desde la bóveda 3D.
2. **Transición 3D bloqueada:** El store fija la coordenada objetivo y activa `isCameraLocked = true`. GSAP gira la cámara 3D hacia ese punto del cielo y ajusta el encuadre del `FoV` mientras el movimiento manual permanece bloqueado. En paralelo, `services/` solicita la tabla de épocas a `GET /api/frames`.
3. **Apertura del HUD y reproducción:** Al concluir la animación 3D (`onComplete`), se desbloquea el control manual de cámara y GSAP despliega el HUD dedicado (`blink-hud/`), donde se precargan los PNG de cada época y se reproduce la secuencia temporal para evidenciar desplazamientos o cambios de brillo.
