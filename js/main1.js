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

// POSICIÓN INICIAL
camera.position.set(76.865, 32.601, 51.191);


const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.setAnimationLoop(animate);

document.body.appendChild(renderer.domElement);


// ORBIT CONTROLS
const controls = new OrbitControls(camera, renderer.domElement);

// PUNTO AL QUE APUNTA INICIALMENTE
controls.target.set(79.154, 6.332, -12.785);

controls.update();


// Mostrar coordenadas cada vez que mueves la cámara
controls.addEventListener('change', () => {

    console.log(
        `camera.position.set(${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)});`
    );

    console.log(
        `controls.target.set(${controls.target.x.toFixed(3)}, ${controls.target.y.toFixed(3)}, ${controls.target.z.toFixed(3)});`
    );

});


// LUZ
const light = new THREE.AmbientLight(0xffffff, 1);
scene.add(light);


// GLTF LOADER
// Con un LoadingManager sabemos cuándo han entrado TODOS los modelos:
// main2 espera este aviso para abrir el telón y no descubrir una escena vacía.
const manager = new THREE.LoadingManager();

manager.onLoad = () => {
    renderer.render(scene, camera);
    window.dispatchEvent(new Event('escena1-lista'));
    btnSoplar.classList.add('visible');
};

// Los .glb van comprimidos con meshopt (EXT_meshopt_compression) y sus
// texturas en WebP. El decodificador hace falta para la geometria; el
// WebP lo entiende el navegador solo.
const gltfLoader = new GLTFLoader(manager);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);


// ===============================
// THE DIGITAL CIRCUS
// ===============================
// esta ruta debe coincidir exactamente con la que precarga main2.js
gltfLoader.load(
    'assets/modelos/the_digital_circus.glb',

    function (gltf) {

        const model = gltf.scene;

        model.scale.set(3, 3, 3);
        model.position.set(0, 0, 0);

        scene.add(model);

    },

    undefined,

    function (error) {
        console.error('Error al cargar the_digital_circus.glb:', error);
    }
);


// ===============================
// CIRCUS
// ===============================
gltfLoader.load(
    'assets/modelos/circusC.glb',

    function (gltf) {

        const model = gltf.scene;

        model.scale.set(8, 8, 8);
        model.position.set(80, 0, 0);

        scene.add(model);

        // El material de gangle no declara metallicFactor y en glTF eso vale
        // 1 por defecto: un metal puro no tiene color propio, solo refleja el
        // entorno, y como aquí no hay mapa de entorno salía completamente
        // negro. Los demás personajes vienen con metalness 0, así que lo
        // igualamos y su textura aparece.
        model.traverse((o) => {
            if (o.isMesh && o.material && o.material.metalness > 0) {
                o.material.metalness = 0;
            }
        });

        // cada nodo raíz con malla es un personaje (CAINE, JAZ, POMNI,
        // ZOOBLE, gangle); los nodos KINGER vienen vacíos y se descartan
        model.updateWorldMatrix(true, true);

        for (const hijo of model.children) {
            let tieneMalla = false;
            hijo.traverse((o) => { if (o.isMesh) tieneMalla = true; });
            if (tieneMalla) registrarSaltarin(hijo);
        }

    },

    undefined,

    function (error) {
        console.error('Error al cargar circusC.glb:', error);
    }
);


// ===============================
// KINGER PLUSH
// ===============================
gltfLoader.load(
    'assets/modelos/kinger_plush.glb',

    function (gltf) {

        const model = gltf.scene;

        model.scale.set(8, 8, 8);
        model.position.set(100, -4, -2);
        model.rotation.y = THREE.MathUtils.degToRad(280);

        scene.add(model);

        model.updateWorldMatrix(true, true);
        registrarSaltarin(model);

    },

    undefined,

    function (error) {
        console.error('Error al cargar kinger_plush.glb:', error);
    }
);

// ===============================
// CILINDRO BLANCO VELA
// ===============================

const geometry = new THREE.CylinderGeometry(
    0.5,      // radio arriba
    0.5,      // radio abajo
    8,      // altura
    32      // segmentos
);

const material = new THREE.MeshStandardMaterial({
    color: 0xffffff
});

const cylinder = new THREE.Mesh(geometry, material);

// Misma posición del birthday cake
cylinder.position.set(80, 10, 0);

scene.add(cylinder);


// ===============================
// LA VELA: LLAMA, HUMO Y SOPLIDO
// ===============================

// punta del cilindro: su centro está a 10 y mide 8 de alto
const PUNTA = new THREE.Vector3(
    cylinder.position.x,
    cylinder.position.y + 4,
    cylinder.position.z
);

const texturaGlow = new THREE.TextureLoader().load('assets/imagenes/glow.png');

// Un único shader para llama y humo: color, tamaño y alfa por partícula.
// La llama va en aditivo (suma luz) y el humo en normal (tapa lo de detrás).
const VERTEX_PARTICULAS = `
    attribute float size;
    attribute float alfa;
    attribute vec3 customColor;
    varying vec3 vColor;
    varying float vAlfa;
    void main() {
        vColor = customColor;
        vAlfa = alfa;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;

const FRAGMENT_PARTICULAS = `
    uniform sampler2D pointTexture;
    varying vec3 vColor;
    varying float vAlfa;
    void main() {
        vec4 tex = texture2D(pointTexture, gl_PointCoord);
        gl_FragColor = vec4(vColor, vAlfa) * tex;
    }
`;

// Reserva fija de partículas que se reciclan en círculo: nunca se crea ni se
// destruye nada durante la animación.
function crearSistema(max, blending) {
    const pos = new Float32Array(max * 3);
    const col = new Float32Array(max * 3);
    const vel = new Float32Array(max * 3);
    const tam = new Float32Array(max);
    const alf = new Float32Array(max);
    const vida = new Float32Array(max);
    const vidaMax = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('customColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(tam, 1));
    geo.setAttribute('alfa', new THREE.BufferAttribute(alf, 1));

    const mat = new THREE.ShaderMaterial({
        uniforms: { pointTexture: { value: texturaGlow } },
        vertexShader: VERTEX_PARTICULAS,
        fragmentShader: FRAGMENT_PARTICULAS,
        blending: blending,
        depthWrite: false,
        transparent: true
    });

    const puntos = new THREE.Points(geo, mat);
    puntos.frustumCulled = false;
    scene.add(puntos);

    return { max, pos, col, vel, tam, alf, vida, vidaMax, geo, puntos, indice: 0 };
}

const llama = crearSistema(500, THREE.AdditiveBlending);
const humo = crearSistema(400, THREE.NormalBlending);

humo.puntos.renderOrder = 1;   // el humo se pinta después de la llama


// resplandor y luz parpadeante de la vela
const brilloVela = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texturaGlow,
    color: 0xffa53a,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
}));
brilloVela.scale.set(3.2, 3.2, 1);
brilloVela.position.copy(PUNTA);
scene.add(brilloVela);

const luzVela = new THREE.PointLight(0xffa040, 3, 40, 2);
luzVela.position.copy(PUNTA);
scene.add(luzVela);


let velaEncendida = true;
let acumuladorLlama = 0;
let humoRestante = 0;      // segundos que sigue saliendo humo tras soplar


function nacerParticula(s) {
    const i = s.indice;
    s.indice = (s.indice + 1) % s.max;
    return i;
}

function emitirLlama() {
    const i = nacerParticula(llama);
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * 0.16;

    llama.pos[i * 3 + 0] = PUNTA.x + Math.cos(ang) * rad;
    llama.pos[i * 3 + 1] = PUNTA.y + Math.random() * 0.1;
    llama.pos[i * 3 + 2] = PUNTA.z + Math.sin(ang) * rad;

    llama.vel[i * 3 + 0] = (Math.random() - 0.5) * 0.35;
    llama.vel[i * 3 + 1] = 1.5 + Math.random() * 1.1;
    llama.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.35;

    llama.vidaMax[i] = 0.42 + Math.random() * 0.42;
    llama.vida[i] = llama.vidaMax[i];
    llama.tam[i] = 0.85 + Math.random() * 0.6;
    llama.alf[i] = 1;
}

function emitirHumo(desviado) {
    const i = nacerParticula(humo);
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * 0.2;

    humo.pos[i * 3 + 0] = PUNTA.x + Math.cos(ang) * rad;
    humo.pos[i * 3 + 1] = PUNTA.y + Math.random() * 0.25;
    humo.pos[i * 3 + 2] = PUNTA.z + Math.sin(ang) * rad;

    // al soplar sale disparado de lado; luego ya solo asciende
    humo.vel[i * 3 + 0] = (Math.random() - 0.5) * 0.5 + (desviado ? 1.6 + Math.random() : 0);
    humo.vel[i * 3 + 1] = 0.55 + Math.random() * 0.7;
    humo.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

    humo.vidaMax[i] = 2.4 + Math.random() * 1.8;
    humo.vida[i] = humo.vidaMax[i];
    humo.tam[i] = 1.1 + Math.random() * 0.8;
    humo.alf[i] = 0;
}


function actualizarLlama(dt, t) {
    if (velaEncendida) {
        // ~120 partículas por segundo, independientes del framerate
        acumuladorLlama += dt * 120;
        while (acumuladorLlama >= 1) {
            emitirLlama();
            acumuladorLlama -= 1;
        }
    }

    for (let i = 0; i < llama.max; i++) {
        if (llama.vida[i] <= 0) {
            llama.alf[i] = 0;
            continue;
        }

        llama.vida[i] -= dt;
        const f = Math.max(llama.vida[i] / llama.vidaMax[i], 0);   // 1 recién nacida -> 0 al morir

        // sube acelerando y se estrecha hacia el centro, como una llama
        llama.vel[i * 3 + 1] += dt * 1.2;
        llama.pos[i * 3 + 0] += llama.vel[i * 3 + 0] * dt;
        llama.pos[i * 3 + 1] += llama.vel[i * 3 + 1] * dt;
        llama.pos[i * 3 + 2] += llama.vel[i * 3 + 2] * dt;
        llama.vel[i * 3 + 0] *= 0.94;
        llama.vel[i * 3 + 2] *= 0.94;

        // del blanco caliente al naranja y al rojo apagado
        const calor = f * f;
        llama.col[i * 3 + 0] = Math.min(1.0 * calor * 2.2, 1.0);
        llama.col[i * 3 + 1] = Math.min(0.62 * calor * 1.7, 1.0);
        llama.col[i * 3 + 2] = 0.16 * calor * calor;

        llama.tam[i] *= 0.985;
        llama.alf[i] = 1;
    }

    llama.geo.attributes.position.needsUpdate = true;
    llama.geo.attributes.customColor.needsUpdate = true;
    llama.geo.attributes.size.needsUpdate = true;
    llama.geo.attributes.alfa.needsUpdate = true;

    // parpadeo del resplandor y de la luz
    if (velaEncendida) {
        const titileo = 0.78 + Math.sin(t * 17) * 0.12 + Math.sin(t * 6.3) * 0.10;
        brilloVela.material.opacity = 0.85 * titileo;
        brilloVela.scale.setScalar(3.2 * (0.9 + titileo * 0.2));
        luzVela.intensity = 3 * titileo;
    } else if (luzVela.intensity > 0) {
        // al soplar se apaga en un instante
        brilloVela.material.opacity = Math.max(brilloVela.material.opacity - dt * 4, 0);
        luzVela.intensity = Math.max(luzVela.intensity - dt * 12, 0);
    }
}


function actualizarHumo(dt) {
    if (humoRestante > 0) {
        humoRestante -= dt;
        if (Math.random() < dt * 30) emitirHumo(false);
    }

    for (let i = 0; i < humo.max; i++) {
        if (humo.vida[i] <= 0) {
            humo.alf[i] = 0;
            continue;
        }

        humo.vida[i] -= dt;
        const f = Math.max(humo.vida[i] / humo.vidaMax[i], 0);
        const edad = 1 - f;

        humo.vel[i * 3 + 0] *= 0.97;
        humo.vel[i * 3 + 2] *= 0.97;
        humo.pos[i * 3 + 0] += humo.vel[i * 3 + 0] * dt;
        humo.pos[i * 3 + 1] += humo.vel[i * 3 + 1] * dt;
        humo.pos[i * 3 + 2] += humo.vel[i * 3 + 2] * dt;

        // el humo se abre y se aclara mientras se disipa
        const gris = 0.30 + edad * 0.22;
        humo.col[i * 3 + 0] = gris;
        humo.col[i * 3 + 1] = gris;
        humo.col[i * 3 + 2] = gris * 1.05;

        humo.tam[i] += dt * 1.5;
        // entra rápido y se desvanece despacio
        humo.alf[i] = Math.min(edad * 6, 1) * f * 0.5;
    }

    humo.geo.attributes.position.needsUpdate = true;
    humo.geo.attributes.customColor.needsUpdate = true;
    humo.geo.attributes.size.needsUpdate = true;
    humo.geo.attributes.alfa.needsUpdate = true;
}


// ===============================
// LOS PERSONAJES SALTAN AL SOPLAR
// ===============================
const saltarines = [];
let tSalto = -1;            // -1 = quietos; >=0 = segundos desde el soplido

// La altura del brinco se saca del tamaño real de cada personaje, y se
// convierte a unidades locales dividiendo por la escala del padre: circusC
// va escalado x8, así que 1 unidad suya son 8 del mundo.
function registrarSaltarin(obj) {
    const caja = new THREE.Box3().setFromObject(obj);
    const alto = Math.max(caja.max.y - caja.min.y, 0.001);
    const escala = obj.parent.getWorldScale(new THREE.Vector3()).y || 1;

    saltarines.push({
        obj,
        baseY: obj.position.y,
        baseRotZ: obj.rotation.z,
        salto: (alto * (0.22 + Math.random() * 0.18)) / escala,
        periodo: 0.55 + Math.random() * 0.4,    // cada uno a su ritmo
        retraso: Math.random() * 0.85,          // y arrancando a su tiempo
        ladeo: (Math.random() - 0.5) * 0.24
    });
}

function actualizarSaltarines(dt) {
    if (tSalto < 0) return;

    tSalto += dt;

    for (const s of saltarines) {
        const t = tSalto - s.retraso;
        if (t < 0) continue;

        // el brinco ocupa el 70% del ciclo y el resto descansa en el suelo,
        // que es lo que le da el ritmo de saltito en vez de flotar
        const p = (t % s.periodo) / s.periodo;
        const arco = p < 0.7 ? Math.sin((p / 0.7) * Math.PI) : 0;

        s.obj.position.y = s.baseY + s.salto * arco;
        s.obj.rotation.z = s.baseRotZ + s.ladeo * Math.sin(p * Math.PI * 2);
    }
}


// ===============================
// BOTÓN DE SOPLAR
// ===============================
const btnSoplar = document.getElementById('soplar');
const letrero = document.getElementById('letrero');
const confeti = crearConfeti(document.getElementById('confeti2'));

// suena encima de la música digital, que no se toca
const sonidoYippee = new Audio(encodeURI('assets/audios/Yippee Sound Effect - YTSFX.mp3'));
sonidoYippee.volume = 0.9;

btnSoplar.addEventListener('click', () => {
    if (!velaEncendida) return;

    velaEncendida = false;
    tSalto = 0;                 // ¡que salten los personajes!
    btnSoplar.classList.remove('visible');
    setTimeout(() => btnSoplar.remove(), 800);

    // la llama que quedaba se va de lado y muere enseguida
    for (let i = 0; i < llama.max; i++) {
        if (llama.vida[i] <= 0) continue;
        llama.vida[i] *= 0.3;
        llama.vel[i * 3 + 0] += 2.5 + Math.random() * 2;
        llama.vel[i * 3 + 1] *= 0.5;
    }

    // bocanada de humo y luego un hilillo
    for (let i = 0; i < 60; i++) emitirHumo(true);
    humoRestante = 2.2;

    sonidoYippee.currentTime = 0;
    sonidoYippee.play().catch(() => {});

    // tanda inicial fuerte...
    confeti.lanzar(200);
    setTimeout(() => confeti.lanzar(140), 260);
    setTimeout(() => confeti.lanzar(100), 540);

    // ...y luego sigue soltando cada pocos segundos, que la fiesta no pare.
    // Es solo dibujo en un canvas: no descarga nada ni pesa en la página.
    setInterval(() => confeti.lanzar(90 + Math.floor(Math.random() * 70)), 2600);

    setTimeout(() => letrero.classList.add('visible'), 450);
});

// ===============================
// BIRTHDAY CAKE
// ===============================
gltfLoader.load(
    'assets/modelos/birthday_cake.glb',

    function (gltf) {

        const model = gltf.scene;

        model.scale.set(0.06, 0.06, 0.06);
        model.position.set(80, 1, 0);

        model.rotation.y = THREE.MathUtils.degToRad(290);

        scene.add(model);

    },

    undefined,

    function (error) {
        console.error('Error al cargar birthday_cake.glb:', error);
    }
);


// ===============================
// RESIZE
// ===============================
// hace falta para que al girar el móvil la escena no se deforme
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});


// ===============================
// ANIMACIÓN
// ===============================
const reloj = new THREE.Clock();

function animate() {

    const dt = Math.min(reloj.getDelta(), 0.05);
    const t = reloj.getElapsedTime();

    actualizarLlama(dt, t);
    actualizarHumo(dt);
    actualizarSaltarines(dt);
    confeti.actualizar(dt);

    renderer.render(scene, camera);

}