import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';


// ESCENA
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);


// CÁMARA
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

camera.position.set(16.078, 3.852, 10.340);


// RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);

document.body.appendChild(renderer.domElement);


// ORBIT CONTROLS
const controls = new OrbitControls(camera, renderer.domElement);

// PUNTO AL QUE MIRA LA CÁMARA
controls.target.set(-1.298, 10.808, -0.798);



controls.update();


// LUZ
const light = new THREE.AmbientLight(0xffffff, 2);
scene.add(light);


// GLB
// Los .glb van comprimidos con meshopt (EXT_meshopt_compression) y sus
// texturas en WebP. El decodificador hace falta para la geometria; el
// WebP lo entiende el navegador solo.
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

loader.load(
    'assets/modelos/digital_circus_scene.glb',

    function (gltf) {

        const model = gltf.scene;

        model.scale.set(1, 1, 1);
        model.position.set(0, 0, 0);

        scene.add(model);

        // pintamos un primer frame y avisamos: main.js espera esto para
        // levantar el fundido a negro justo cuando ya hay algo que ver
        renderer.render(scene, camera);
        window.dispatchEvent(new Event('escena2-lista'));

        btnEntrar.classList.add('visible');

    },

    undefined,

    function (error) {
        console.error('Error al cargar el GLB:', error);
    }
);


// MOSTRAR COORDENADAS
controls.addEventListener('change', () => {

    console.log(
        `camera.position.set(${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)});`
    );

    console.log(
        `controls.target.set(${controls.target.x.toFixed(3)}, ${controls.target.y.toFixed(3)}, ${controls.target.z.toFixed(3)});`
    );

});

// ===============================
// ESFERA VERDE NEÓN
// ===============================

const geometry = new THREE.SphereGeometry(30, 32, 32);

const material = new THREE.MeshStandardMaterial({
    color: 0x42F527,

});

const sphere = new THREE.Mesh(geometry, material);

sphere.position.set(-30, -18, -20);

scene.add(sphere);

// ===============================
// PRECARGA DE LA ESCENA SIGUIENTE
// ===============================
// the_digital_circus.glb es el modelo más pesado (10 MB comprimido). Lo
// bajamos ahora, mientras el usuario mira esta escena, y lo dejamos en la
// caché de three: main1 lo pedirá con esta misma URL y no volverá a la red,
// así el telón no se queda cerrado esperando la descarga.
// OJO: la ruta tiene que ser IDÉNTICA a la que usa main1.js, porque es la
// clave de la caché. Si cambias una y no la otra, no falla nada: simplemente
// se descarga dos veces y el telón tarda más en abrirse.
THREE.Cache.enabled = true;

new THREE.FileLoader()
    .setResponseType('arraybuffer')
    .load(
        'assets/modelos/the_digital_circus.glb',
        undefined,
        undefined,
        () => console.warn('No se pudo precargar the_digital_circus.glb')
    );


// ===============================
// BOTÓN ENTRAR -> VIAJE DE CÁMARA -> TELÓN -> ESCENA 1
// ===============================
const btnEntrar = document.getElementById('entrar');
const circo = document.getElementById('circo');
const spotlight = document.getElementById('spotlight');

const DESTINO_CAMARA = new THREE.Vector3(-39.347, 16.035, -23.144);
const DUR_CAMARA = 4.5;     // segundos que tarda en desplazarse

// La cámara NO gira durante el viaje: conserva la orientación que tenga al
// pulsar el botón y solo se desplaza. El destino queda a 8° de la dirección
// en la que ya se está mirando, así que el movimiento es un avance de frente
// y se lee como un zoom. Reapuntar al target la hacía cruzarse por encima de
// él (volantazo), y fijar la orientación final la dejaba andando de espaldas,
// porque desde el destino el target queda a 176° del sentido de la marcha.

const reloj = new THREE.Clock();
let vivo = true;            // corta el bucle al cambiar de escena
let viaje = null;

btnEntrar.addEventListener('click', () => {
    if (viaje) return;

    btnEntrar.classList.remove('visible');
    controls.enabled = false;   // que no pelee con el movimiento automático

    viaje = { desde: camera.position.clone(), t: 0 };
});


function cerrarTelon() {
    circo.classList.add('activo');
    void circo.offsetWidth;          // fuerza el reflow para que la transición corra
    circo.classList.add('cerrado');

    setTimeout(() => spotlight.classList.add('visible'), 1100);
    setTimeout(irAEscena1, 2100);
}


async function irAEscena1() {
    // apagar esta escena
    vivo = false;
    controls.dispose();
    renderer.domElement.remove();
    renderer.dispose();
    btnEntrar.remove();

    // main1 avisa cuando ha cargado TODOS sus modelos
    const lista = new Promise((resolve) => {
        window.addEventListener('escena1-lista', resolve, { once: true });
        setTimeout(resolve, 25000);
    });

    try {
        await import('./main1.js');
    } catch (error) {
        console.error('No se pudo cargar main1.js:', error);
    }

    await lista;

    // ya está parseado: soltamos el buffer crudo de la caché
    THREE.Cache.remove('assets/modelos/the_digital_circus.glb');

    // ¡que se abra el telón!
    circo.classList.add('abriendo');
    circo.classList.remove('cerrado');

    setTimeout(() => spotlight.classList.remove('visible'), 2400);
    setTimeout(() => circo.classList.remove('activo', 'abriendo'), 4200);
}


// RESIZE: hace falta para que al girar el móvil la escena no se deforme
window.addEventListener('resize', () => {
    if (!vivo) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});


// ANIMACIÓN
function animate() {

    if (!vivo) return;

    requestAnimationFrame(animate);

    const dt = Math.min(reloj.getDelta(), 0.05);

    if (viaje) {
        viaje.t = Math.min(viaje.t + dt / DUR_CAMARA, 1);

        // desplazamiento en línea recta, arrancando y frenando suave.
        // La orientación no se toca en ningún momento.
        const k = viaje.t * viaje.t * (3 - 2 * viaje.t);
        camera.position.lerpVectors(viaje.desde, DESTINO_CAMARA, k);

        if (viaje.t >= 1) {
            viaje = null;
            cerrarTelon();
        }
    }

    renderer.render(scene, camera);

}

animate();