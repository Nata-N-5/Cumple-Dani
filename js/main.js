import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { crearConfeti } from './confeti.js';


const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.set(0, 2, 6);


// preserveDrawingBuffer: el efecto glitch copia este canvas a uno 2D con
// drawImage, y sin esto el buffer puede estar ya vacío al hacerlo
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.setAnimationLoop(animate);

document.body.appendChild(renderer.domElement);


const controls = new OrbitControls(camera, renderer.domElement);

// Desactivados a propósito: las gafas viajan hacia la posición INICIAL de la
// cámara, así que si el usuario la mueve el efecto final queda descuadrado.
// La carta se sigue pudiendo clicar, porque eso va por raycaster, no por aquí.
controls.enabled = false;


// LOADING MANAGER
const manager = new THREE.LoadingManager();


// LUZ
const light = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(light);


// CUBEMAP
const path = 'assets/espacio/';
const format = '.png';

const urls = [
    path + 'px' + format,
    path + 'nx' + format,
    path + 'py' + format,
    path + 'ny' + format,
    path + 'pz' + format,
    path + 'nz' + format
];

const reflectionCube = new THREE.CubeTextureLoader().load(urls);

scene.background = reflectionCube;


// GLTF LOADER
// Los .glb van comprimidos con meshopt (EXT_meshopt_compression) y sus
// texturas en WebP. El decodificador hace falta para la geometria; el
// WebP lo entiende el navegador solo.
const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

// TEXTURA DEL BRILLO
const glowTexture = new THREE.TextureLoader().load('assets/imagenes/glow.png');


// CARTA: grupo que contiene el modelo + el brillo + las partículas
const cartaGroup = new THREE.Group();
cartaGroup.position.set(0, 0, 0);
cartaGroup.visible = false;   // aparece cuando termina el intro
scene.add(cartaGroup);

let carta = null;         // el modelo de la carta (para el raycaster)
const cartaBaseY = 0;     // altura base sobre la que flota
const centroCarta = new THREE.Vector3(0, 0, 0); // centro real del modelo
let radioCarta = 1.2;     // tamaño aproximado, para el brillo y las órbitas


// CARGAR MODELO
gltfLoader.load(
    'assets/modelos/letter.glb',
    function (gltf) {
    const model = gltf.scene;
    model.scale.set(3, 3, 3);
    model.position.set(0, 0, 0);

    // Medimos el modelo ANTES de meterlo en cartaGroup. Box3.setFromObject
    // trabaja en coordenadas de mundo, y el grupo arranca con escala 0
    // (la carta todavía no ha aparecido): medirlo ya dentro daría una caja
    // aplastada, radioCarta ≈ 0, y todas las chispas saldrían del mismo
    // punto en vez de orbitar. Suelto, su matriz de mundo es la local.
    const caja = new THREE.Box3().setFromObject(model);
    caja.getCenter(centroCarta);
    radioCarta = Math.max(caja.getBoundingSphere(new THREE.Sphere()).radius, 0.5);

    cartaGroup.add(model);
    carta = model;

    ajustarEfectos();
    },
    undefined,
    function (error) {
        console.error('Error al cargar el modelo:', error);
    }
);

// GAFAS VR: ocultas hasta que se cierre la carta
const POS_GAFAS = new THREE.Vector3(0, 0, -2);          // dónde nacen
const POS_CAMARA_INICIAL = camera.position.clone();     // hacia dónde viajan
// Aire que dejan al frenar. En negativo la cámara entra dentro de la caja del
// modelo. A -2.0 acaban al doble de cerca que a -0.8: la cámara queda donde
// iría la cabeza, con el casco envolviéndola. Súbelo si se ve el interior.
const MARGEN_GAFAS = -3.0;
const DURACION_VIAJE = 7;      // segundos que tardan en acercarse

const gafasGroup = new THREE.Group();
gafasGroup.position.copy(POS_GAFAS);
gafasGroup.visible = false;
gafasGroup.scale.setScalar(0);
scene.add(gafasGroup);

const semiGafas = new THREE.Vector3(1, 1, 1);   // medio tamaño de su caja
const centroGafas = new THREE.Vector3();        // centro de la caja
const destinoGafas = new THREE.Vector3();

// El destino no es la cámara exacta: retrocedemos sobre la línea de viaje lo
// que el modelo sobresale EN ESA dirección (la caja proyectada sobre ella),
// no su radio envolvente, que es mucho más pesimista y las dejaba lejos.
// El giro de 180° es sobre Y, y a 0° y 180° la caja es la misma, así que
// este alcance también cubre el peor momento del giro.
function calcularDestinoGafas() {
    const dir = new THREE.Vector3().subVectors(POS_CAMARA_INICIAL, POS_GAFAS).normalize();

    const alcance = centroGafas.dot(dir)
        + Math.abs(semiGafas.x * dir.x)
        + Math.abs(semiGafas.y * dir.y)
        + Math.abs(semiGafas.z * dir.z);

    destinoGafas.copy(POS_CAMARA_INICIAL).addScaledVector(dir, -(alcance + MARGEN_GAFAS));
}
calcularDestinoGafas();

// destello que acompaña la aparición de las gafas
const destelloGafas = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0x9ad8ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
}));
destelloGafas.scale.set(6, 6, 1);
destelloGafas.position.set(0, 0.3, -2);
scene.add(destelloGafas);

gltfLoader.load(
    'assets/modelos/vr_glasses.glb',
    function (gltf) {
    const model = gltf.scene;
    model.scale.set(3, 3, 3);
    model.position.set(0, 0, 0);

    // medir antes de añadirlo: gafasGroup arranca con escala 0
    const caja = new THREE.Box3().setFromObject(model);
    caja.getCenter(centroGafas);
    caja.getSize(semiGafas).multiplyScalar(0.5);
    calcularDestinoGafas();

    gafasGroup.add(model);
    },
    undefined,
    function (error) {
        console.error('Error al cargar el modelo:', error);
    }
);


// ---------------------------------------------------------------
// BRILLO ALREDEDOR DE LA CARTA (sprites con glow.png)
// ---------------------------------------------------------------
const halos = [];

function crearHalo(factor, color, opacidad) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture,
        color: color,
        transparent: true,
        opacity: opacidad,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    }));
    cartaGroup.add(sprite);
    halos.push({ sprite, factor, opacidad, tam: factor });
    return sprite;
}

crearHalo(3.4, 0xffe3a0, 0.60);   // halo cálido grande
crearHalo(1.9, 0xfff6dd, 0.40);   // halo interior


// Recoloca brillo y órbitas sobre el centro real de la carta
function ajustarEfectos() {
    for (const h of halos) {
        h.tam = h.factor * radioCarta;
        h.sprite.position.copy(centroCarta);
        h.sprite.scale.set(h.tam, h.tam, 1);
    }

    for (const c of chispas) {
        c.radio = radioCarta * (0.75 + Math.random() * 0.5);
        c.altura = centroCarta.y + (Math.random() - 0.5) * radioCarta * 0.6;
        c.inclinacion = (Math.random() - 0.5) * radioCarta * 0.5;
    }
}


// ---------------------------------------------------------------
// PARTÍCULAS: chispas que orbitan la carta dejando un rastro
// ---------------------------------------------------------------
const NUM_CHISPAS = 5;
const MAX_PARTICULAS = 600;
const VIDA_RASTRO = 1.4; // segundos que dura cada partícula del rastro

const chispas = [];
for (let i = 0; i < NUM_CHISPAS; i++) {
    chispas.push({
        radio: 1.1 + Math.random() * 0.9,
        velocidad: 0.6 + Math.random() * 0.8,
        fase: Math.random() * Math.PI * 2,
        inclinacion: (Math.random() - 0.5) * 1.2,
        altura: 0.5 + Math.random() * 0.6,
        color: new THREE.Color().setHSL(0.10 + Math.random() * 0.08, 1.0, 0.65)
    });
}

const posiciones = new Float32Array(MAX_PARTICULAS * 3);
const colores = new Float32Array(MAX_PARTICULAS * 3);
const tamanos = new Float32Array(MAX_PARTICULAS);
const vidas = new Float32Array(MAX_PARTICULAS);   // vida restante (0 = libre)
const tonos = [];                                  // color base de cada partícula

for (let i = 0; i < MAX_PARTICULAS; i++) {
    tamanos[i] = 0;
    vidas[i] = 0;
    tonos.push(new THREE.Color(0xffffff));
}

const geoParticulas = new THREE.BufferGeometry();
geoParticulas.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
geoParticulas.setAttribute('customColor', new THREE.BufferAttribute(colores, 3));
geoParticulas.setAttribute('size', new THREE.BufferAttribute(tamanos, 1));

const matParticulas = new THREE.ShaderMaterial({
    uniforms: {
        pointTexture: { value: glowTexture }
    },
    vertexShader: `
        attribute float size;
        attribute vec3 customColor;
        varying vec3 vColor;
        void main() {
            vColor = customColor;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (300.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
        }
    `,
    fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        void main() {
            vec4 tex = texture2D(pointTexture, gl_PointCoord);
            gl_FragColor = vec4(vColor, 1.0) * tex;
        }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
});

const particulas = new THREE.Points(geoParticulas, matParticulas);
particulas.frustumCulled = false;
cartaGroup.add(particulas);

let indiceParticula = 0;

function emitirParticula(x, y, z, color, intensidad) {
    const i = indiceParticula;
    indiceParticula = (indiceParticula + 1) % MAX_PARTICULAS;

    posiciones[i * 3 + 0] = x + (Math.random() - 0.5) * 0.08;
    posiciones[i * 3 + 1] = y + (Math.random() - 0.5) * 0.08;
    posiciones[i * 3 + 2] = z + (Math.random() - 0.5) * 0.08;

    tonos[i].copy(color).multiplyScalar(intensidad);
    vidas[i] = VIDA_RASTRO * (0.6 + Math.random() * 0.4);
    tamanos[i] = 0.35 + Math.random() * 0.25;
}

function actualizarParticulas(dt, t, intensidad) {
    // mover las chispas y emitir su rastro
    if (intensidad > 0.05) {
        for (const c of chispas) {
            const a = t * c.velocidad + c.fase;
            const x = centroCarta.x + Math.cos(a) * c.radio;
            const z = centroCarta.z + Math.sin(a) * c.radio;
            const y = c.altura + Math.sin(a * 2.0 + c.fase) * c.inclinacion;
            emitirParticula(x, y, z, c.color, intensidad);
        }
    }

    // envejecer el rastro: sube despacio y se apaga
    for (let i = 0; i < MAX_PARTICULAS; i++) {
        if (vidas[i] <= 0) {
            colores[i * 3 + 0] = 0;
            colores[i * 3 + 1] = 0;
            colores[i * 3 + 2] = 0;
            continue;
        }

        vidas[i] -= dt;
        const f = Math.max(vidas[i] / VIDA_RASTRO, 0);

        posiciones[i * 3 + 1] += dt * 0.25;

        colores[i * 3 + 0] = tonos[i].r * f;
        colores[i * 3 + 1] = tonos[i].g * f;
        colores[i * 3 + 2] = tonos[i].b * f;
        tamanos[i] *= 0.995;
    }

    geoParticulas.attributes.position.needsUpdate = true;
    geoParticulas.attributes.customColor.needsUpdate = true;
    geoParticulas.attributes.size.needsUpdate = true;
}


// ---------------------------------------------------------------
// AUDIO
// ---------------------------------------------------------------
const sonidoHoja = new Audio('assets/audios/hoja.wav');
sonidoHoja.volume = 0.8;

const musicaCosmica = new Audio(encodeURI('assets/audios/Cosmic Silence (1).mp3'));
musicaCosmica.loop = true;
musicaCosmica.volume = 0;

const musicaGorillaz = new Audio(encodeURI('assets/audios/Gorillaz  On Melancholy Hill.mp3'));
musicaGorillaz.loop = true;
musicaGorillaz.volume = 0;

const VOL_COSMICA = 0.55;
const VOL_GORILLAZ = 0.7;

function sonarHoja() {
    sonidoHoja.currentTime = 0;
    sonidoHoja.play().catch(() => {});
}

// Fundido de volumen (0..1) en ms
function fundir(audio, destino, ms, alTerminar) {
    const desde = audio.volume;
    const t0 = performance.now();

    audio._fundido = (audio._fundido || 0) + 1;
    const id = audio._fundido;

    function paso() {
        if (audio._fundido !== id) return;   // otro fundido tomó el control
        const k = Math.min((performance.now() - t0) / ms, 1);
        audio.volume = Math.min(Math.max(desde + (destino - desde) * k, 0), 1);
        if (k < 1) requestAnimationFrame(paso);
        else if (alTerminar) alTerminar();
    }

    requestAnimationFrame(paso);
}

// Los navegadores bloquean el audio hasta que el usuario interactúa.
// Intentamos arrancar solo; si no se puede, esperamos al primer click.
const avisoSonido = document.getElementById('aviso-sonido');
let audioDesbloqueado = false;

// cualquiera de estos gestos sirve para que el navegador deje sonar el audio
const EVENTOS_GESTO = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'wheel'];

function alGesto() {
    arrancarCosmica().catch(() => {});
}

function dejarDeEsperar() {
    for (const ev of EVENTOS_GESTO) window.removeEventListener(ev, alGesto);
    document.removeEventListener('visibilitychange', alGesto);
}

function arrancarCosmica() {
    if (audioDesbloqueado) return Promise.resolve();

    return musicaCosmica.play().then(() => {
        audioDesbloqueado = true;
        avisoSonido.classList.remove('visible');
        dejarDeEsperar();

        // si el desbloqueo llegó justo al abrir la carta, ya manda Gorillaz
        if (abierta) {
            musicaCosmica.pause();
            return;
        }

        fundir(musicaCosmica, VOL_COSMICA, 3000);
    });
}

// Intento 1: sonar sola nada más cargar.
arrancarCosmica().catch(() => {
    // Bloqueada por la política de autoplay del navegador: nos quedamos
    // a la espera de cualquier gesto para arrancarla en ese mismo instante.
    avisoSonido.classList.add('visible');

    for (const ev of EVENTOS_GESTO) window.addEventListener(ev, alGesto, { passive: true });
    document.addEventListener('visibilitychange', alGesto);

    // algunos navegadores la dejan pasar un instante después de cargar
    setTimeout(alGesto, 400);
    window.addEventListener('load', alGesto, { once: true });
});


// ---------------------------------------------------------------
// CONFETI (canvas 2D encima de todo)
// ---------------------------------------------------------------
const lienzoConfeti = document.getElementById('confeti');
const confeti = crearConfeti(lienzoConfeti);


// ---------------------------------------------------------------
// TRANSICIÓN A LA SEGUNDA ESCENA: glitch + fundido a negro
// ---------------------------------------------------------------
const lienzoGlitch = document.getElementById('glitch');
const ctxGlitch = lienzoGlitch.getContext('2d');
const fundidoNegro = document.getElementById('fundido');

const musicaDigital = new Audio('assets/audios/digital.mp3');
musicaDigital.loop = true;
musicaDigital.volume = 0;
const VOL_DIGITAL = 0.7;

const DUR_GLITCH = 2.6;     // segundos de glitch antes de cambiar de escena
let transicionActiva = false;
let tTransicion = 0;

function ajustarGlitch() {
    lienzoGlitch.width = window.innerWidth;
    lienzoGlitch.height = window.innerHeight;
}
ajustarGlitch();

// Copia el render de three.js a este canvas 2D y lo destroza: tiras
// horizontales desplazadas, dobles imágenes, barras de color y scanlines.
function dibujarGlitch(k) {
    const w = lienzoGlitch.width;
    const h = lienzoGlitch.height;
    const src = renderer.domElement;

    ctxGlitch.globalCompositeOperation = 'source-over';
    ctxGlitch.globalAlpha = 1;
    ctxGlitch.drawImage(src, 0, 0, w, h);

    // desgarros: bandas de la imagen movidas de sitio
    const cortes = Math.floor(3 + k * 16);
    for (let i = 0; i < cortes; i++) {
        const alto = 3 + Math.random() * 50 * k;
        const y = Math.random() * Math.max(h - alto, 1);   // la banda entera dentro del canvas
        const dx = (Math.random() - 0.5) * 220 * k;
        ctxGlitch.drawImage(src, 0, y, w, alto, dx, y, w, alto);
    }

    // dobles imágenes desplazadas, como una señal mal sincronizada
    ctxGlitch.globalCompositeOperation = 'lighter';
    ctxGlitch.globalAlpha = 0.28 * k;
    ctxGlitch.drawImage(src, -14 * k, 2 * k, w, h);
    ctxGlitch.drawImage(src, 14 * k, -2 * k, w, h);

    // barras de color
    const barras = Math.floor(k * 6);
    for (let i = 0; i < barras; i++) {
        ctxGlitch.globalAlpha = 0.10 + Math.random() * 0.25 * k;
        ctxGlitch.fillStyle = Math.random() < 0.5 ? '#00e5ff' : '#ff2fd0';
        ctxGlitch.fillRect(0, Math.random() * h, w, 2 + Math.random() * 22 * k);
    }

    // scanlines
    ctxGlitch.globalCompositeOperation = 'source-over';
    ctxGlitch.globalAlpha = 0.10 + 0.15 * k;
    ctxGlitch.fillStyle = '#000';
    for (let y = 0; y < h; y += 4) ctxGlitch.fillRect(0, y, w, 2);

    ctxGlitch.globalAlpha = 1;
}

function iniciarTransicion() {
    if (transicionActiva) return;
    transicionActiva = true;
    tTransicion = 0;
    lienzoGlitch.classList.add('visible');

    // la música digital entra ya durante el glitch, no después
    fundir(musicaGorillaz, 0, 1400, () => musicaGorillaz.pause());

    musicaDigital.currentTime = 0;
    musicaDigital.volume = 0;
    musicaDigital.play()
        .then(() => fundir(musicaDigital, VOL_DIGITAL, 2500))
        .catch(() => {});

    // el negro entra cuando el glitch ya está fuerte
    setTimeout(() => fundidoNegro.classList.add('visible'), (DUR_GLITCH - 1.2) * 1000);
    setTimeout(cambiarDeEscena, DUR_GLITCH * 1000);
}

async function cambiarDeEscena() {
    // apagar la escena 1: sin esto seguiría renderizando por debajo
    renderer.setAnimationLoop(null);
    controls.dispose();
    window.removeEventListener('resize', alRedimensionar);
    renderer.domElement.remove();
    renderer.dispose();

    lienzoGlitch.classList.remove('visible');
    ctxGlitch.clearRect(0, 0, lienzoGlitch.width, lienzoGlitch.height);

    // limpiar la interfaz de la primera escena
    for (const el of [intro, overlay, lienzoConfeti, avisoSonido, lienzoGlitch]) el.remove();

    // main2 avisa cuando su GLB está montado; si tardara demasiado,
    // levantamos el negro igual a los 6s para no quedarnos a oscuras
    const lista = new Promise((resolve) => {
        window.addEventListener('escena2-lista', resolve, { once: true });
        setTimeout(resolve, 6000);
    });

    try {
        await import('./main2.js');
    } catch (error) {
        console.error('No se pudo cargar main2.js:', error);
    }

    await lista;
    fundidoNegro.classList.remove('visible');
}


// ---------------------------------------------------------------
// INTRO: "HOLA, DANI" y luego aparece la carta
// ---------------------------------------------------------------
const intro = document.getElementById('intro');
let introTerminado = false;
let revelarCarta = false;   // dispara la aparición de la carta en el loop
let ocultarCarta = false;   // dispara su desaparición al cerrarla

function arrancarIntro() {
    setTimeout(() => intro.classList.add('visible'), 600);          // aparece el texto
    setTimeout(() => intro.classList.remove('visible'), 4800);      // se desvanece
    setTimeout(() => {
        intro.style.display = 'none';
        introTerminado = true;
        revelarCarta = true;
        cartaGroup.visible = true;
        sonarHoja();
    }, 6000);                                                       // entra la carta
}


// ---------------------------------------------------------------
// PANTALLA COMPLETA
//
// Solo se muestra el botón si el navegador soporta la API. En iPhone no
// existe (Safari no implementa requestFullscreen en elementos), así que
// allí el botón ni aparece en vez de quedarse ahí sin hacer nada.
// ---------------------------------------------------------------
const btnPantalla = document.getElementById('pantalla');

const pedirCompleta = document.documentElement.requestFullscreen
    || document.documentElement.webkitRequestFullscreen;
const salirCompleta = document.exitFullscreen || document.webkitExitFullscreen;

function estaEnCompleta() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

if (pedirCompleta && salirCompleta) {
    btnPantalla.classList.add('disponible');

    btnPantalla.addEventListener('click', () => {
        try {
            const p = estaEnCompleta()
                ? salirCompleta.call(document)
                : pedirCompleta.call(document.documentElement);
            if (p && p.catch) p.catch(() => {});
        } catch (error) {
            console.warn('Pantalla completa no disponible:', error);
        }
    });

    // el estado puede cambiar sin pasar por el botón (tecla Esc, F11)
    const sincronizar = () => btnPantalla.classList.toggle('completa', estaEnCompleta());
    document.addEventListener('fullscreenchange', sincronizar);
    document.addEventListener('webkitfullscreenchange', sincronizar);
}


// ---------------------------------------------------------------
// ORIENTACIÓN: en móvil la experiencia se ve en horizontal
//
// No se puede forzar la rotación desde una web (screen.orientation.lock
// solo va en pantalla completa, y en iOS ni eso), así que detectamos el
// vertical y tapamos la pantalla con el aviso. Además la intro no arranca
// hasta que el móvil esté girado, o el "HOLA, DANI" se perdería detrás.
// ---------------------------------------------------------------
const avisoGira = document.getElementById('gira');
const btnGiraIgual = document.getElementById('gira-igual');

let introArrancado = false;
let ignorarVertical = false;   // el usuario decidió seguir en vertical

function enVerticalMovil() {
    return !ignorarVertical
        && window.matchMedia('(pointer: coarse)').matches
        && window.matchMedia('(orientation: portrait)').matches;
}

// El botón de "continuar de todos modos" vive dentro del aviso, así que
// aparece y desaparece con él: está disponible desde el primer momento.
function revisarOrientacion() {
    const mal = enVerticalMovil();
    avisoGira.classList.toggle('visible', mal);

    if (!mal && !introArrancado) {
        introArrancado = true;
        arrancarIntro();
    }
}

btnGiraIgual.addEventListener('click', () => {
    ignorarVertical = true;
    revisarOrientacion();
});

// Este listener NO se quita al cambiar de escena: el aviso tiene que seguir
// funcionando en el circo digital y en el circo final.
window.addEventListener('resize', revisarOrientacion);
window.addEventListener('orientationchange', revisarOrientacion);
revisarOrientacion();


// ---------------------------------------------------------------
// OVERLAY: abrir / cerrar la carta
// ---------------------------------------------------------------
const overlay = document.getElementById('carta-overlay');
let abierta = false;
let gafasReveladas = false;
let apGafas = 0;            // progreso de la aparición de las gafas (0..1)
let apViaje = 0;            // progreso de su acercamiento a la cámara (0..1)

function abrirCarta() {
    if (abierta || !introTerminado) return;
    abierta = true;
    overlay.classList.add('visible');
    sonarHoja();

    // tres ráfagas escalonadas para que el confeti no salga todo de golpe
    confeti.lanzar(180);
    setTimeout(() => confeti.lanzar(120), 220);
    setTimeout(() => confeti.lanzar(90), 480);

    // la cósmica se apaga y entra Gorillaz
    fundir(musicaCosmica, 0, 1200, () => musicaCosmica.pause());

    musicaGorillaz.currentTime = 0;
    musicaGorillaz.volume = 0;
    musicaGorillaz.play()
        .then(() => fundir(musicaGorillaz, VOL_GORILLAZ, 2000))
        .catch(() => {});
}

function cerrarCarta() {
    if (!abierta) return;
    abierta = false;
    overlay.classList.remove('visible');
    sonarHoja();

    // la carta se despide y le cede la escena a las gafas VR
    revelarCarta = false;
    ocultarCarta = true;
    hover = false;

    if (!gafasReveladas) {
        gafasReveladas = true;
        gafasGroup.visible = true;
    }
}

overlay.addEventListener('click', cerrarCarta);

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarCarta();
});


// ---------------------------------------------------------------
// CLICK SOBRE LA CARTA (raycaster)
// ---------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2();
let hover = false;

let inicioX = 0, inicioY = 0;

function actualizarPuntero(event) {
    puntero.x = (event.clientX / window.innerWidth) * 2 - 1;
    puntero.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function tocaCarta() {
    // el raycaster no respeta .visible, así que ignoramos la carta durante el intro
    if (!carta || !introTerminado || apCarta < 1) return false;
    raycaster.setFromCamera(puntero, camera);
    return raycaster.intersectObject(carta, true).length > 0;
}

renderer.domElement.addEventListener('pointermove', (event) => {
    actualizarPuntero(event);
    hover = !abierta && tocaCarta();
    renderer.domElement.style.cursor = hover ? 'pointer' : 'default';
});

renderer.domElement.addEventListener('pointerdown', (event) => {
    inicioX = event.clientX;
    inicioY = event.clientY;
});

renderer.domElement.addEventListener('pointerup', (event) => {
    // si el usuario arrastró la cámara, no cuenta como click
    const dist = Math.hypot(event.clientX - inicioX, event.clientY - inicioY);
    if (dist > 6 || abierta) return;

    actualizarPuntero(event);
    if (tocaCarta()) abrirCarta();
});


// RESIZE
function alRedimensionar() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    ajustarGlitch();   // el confeti se redimensiona solo desde su módulo
}

window.addEventListener('resize', alRedimensionar);


// ANIMACIÓN
const reloj = new THREE.Clock();
let escalaActual = 1;
let apCarta = 0;            // progreso de la aparición de la carta (0..1)

const suave = (x) => 1 - Math.pow(1 - x, 3);   // easeOutCubic
const suaveInOut = (x) => x * x * (3 - 2 * x); // arranca y frena despacio

function animate() {

    const dt = Math.min(reloj.getDelta(), 0.05);
    const t = reloj.getElapsedTime();

    // aparición de la carta al terminar el intro / desaparición al cerrarla
    if (revelarCarta && apCarta < 1) {
        apCarta = Math.min(apCarta + dt / 1.6, 1);
    } else if (ocultarCarta && apCarta > 0) {
        apCarta = Math.max(apCarta - dt / 1.1, 0);
        if (apCarta === 0) {
            ocultarCarta = false;
            cartaGroup.visible = false;
        }
    }

    const e = suave(apCarta);

    // flotar (al irse sube y gira, como si se la llevara el espacio)
    cartaGroup.position.y = cartaBaseY + Math.sin(t * 1.1) * 0.18 + (1 - e) * 1.2;
    cartaGroup.rotation.y = Math.sin(t * 0.45) * 0.25 + (1 - e) * Math.PI * 2;
    cartaGroup.rotation.z = Math.sin(t * 0.7) * 0.05;

    // crecer un poco al pasar el mouse por encima
    const objetivo = hover ? 1.08 : 1;
    escalaActual += (objetivo - escalaActual) * Math.min(dt * 8, 1);
    cartaGroup.scale.setScalar(escalaActual * e);

    // pulso del brillo
    for (let i = 0; i < halos.length; i++) {
        const h = halos[i];
        const pulso = 1 + Math.sin(t * (1.6 + i * 0.7)) * 0.08;
        h.sprite.scale.set(h.tam * pulso, h.tam * pulso, 1);
        h.sprite.material.opacity = h.opacidad * (0.8 + Math.sin(t * (2.1 + i)) * 0.2) * (hover ? 1.35 : 1) * e;
    }

    actualizarParticulas(dt, t, e);

    // GAFAS VR: aparecen al cerrar la carta y luego se acercan girando 180°
    if (gafasReveladas) {

        if (apGafas < 1) {
            apGafas = Math.min(apGafas + dt / 1.5, 1);

            gafasGroup.scale.setScalar(suave(apGafas));

            // destello: sube rápido y se apaga
            const flash = Math.sin(apGafas * Math.PI);
            destelloGafas.material.opacity = flash * 0.9;
            destelloGafas.scale.setScalar(4 + flash * 5);
        } else if (apViaje < 1) {
            apViaje = Math.min(apViaje + dt / DURACION_VIAJE, 1);

            // llegaron: arranca el glitch y el salto a la segunda escena
            if (apViaje >= 1) iniciarTransicion();
        }

        const v = suaveInOut(apViaje);

        // viaje hacia la posición inicial de la cámara
        gafasGroup.position.lerpVectors(POS_GAFAS, destinoGafas, v);
        gafasGroup.position.y += Math.sin(t * 0.9) * 0.12 * (1 - v * 0.5);

        // media vuelta durante el trayecto, más el giro de entrada y un vaivén
        gafasGroup.rotation.y =
            (1 - suave(apGafas)) * Math.PI * 3 + v * Math.PI + Math.sin(t * 0.35) * 0.12;
        gafasGroup.rotation.z = Math.sin(t * 0.6) * 0.04 * v;
    }

    confeti.actualizar(dt);

    controls.update();
    renderer.render(scene, camera);

    // el glitch se dibuja DESPUÉS del render: copia lo que acaba de pintarse
    if (transicionActiva) {
        tTransicion += dt;

        // sube de golpe y va a tirones, no de forma lineal
        const rampa = Math.min(tTransicion / (DUR_GLITCH * 0.55), 1);
        const tiron = 0.45 + 0.55 * Math.abs(Math.sin(tTransicion * 11));
        dibujarGlitch(Math.min(rampa * tiron + rampa * 0.25, 1));
    }

}
