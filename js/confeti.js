// Confeti en un canvas 2D. Lo usan varias escenas, así que vive aparte.
// Cada escena le pasa su propio canvas y se queda con lanzar() y actualizar().

const COLORES = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b', '#c77dff', '#fff1a8'];

export function crearConfeti(lienzo) {

    const ctx = lienzo.getContext('2d');
    const piezas = [];

    function ajustar() {
        lienzo.width = window.innerWidth;
        lienzo.height = window.innerHeight;
    }

    ajustar();
    window.addEventListener('resize', ajustar);

    function lanzar(cantidad = 220) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        for (let i = 0; i < cantidad; i++) {
            const ang = Math.random() * Math.PI * 2;
            const vel = 4 + Math.random() * 13;

            piezas.push({
                x: cx + (Math.random() - 0.5) * 120,
                y: cy + (Math.random() - 0.5) * 80,
                vx: Math.cos(ang) * vel,
                vy: Math.sin(ang) * vel - 4,
                ancho: 6 + Math.random() * 8,
                alto: 9 + Math.random() * 10,
                rot: Math.random() * Math.PI,
                vrot: (Math.random() - 0.5) * 0.3,
                color: COLORES[Math.floor(Math.random() * COLORES.length)]
            });
        }
    }

    function actualizar(dt) {
        if (piezas.length === 0) return;

        ctx.clearRect(0, 0, lienzo.width, lienzo.height);

        const f = Math.min(dt, 0.05) * 60;   // normalizado a 60 fps

        for (let i = piezas.length - 1; i >= 0; i--) {
            const p = piezas[i];

            p.vy += 0.35 * f;      // gravedad
            p.vx *= 0.985;
            p.vy *= 0.99;
            p.x += p.vx * f;
            p.y += p.vy * f;
            p.rot += p.vrot * f;

            if (p.y > window.innerHeight + 40) {
                piezas.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            // el "papelito" se ve más fino cuando gira de canto
            ctx.fillRect(-p.ancho / 2, -p.alto / 2, p.ancho * Math.abs(Math.cos(p.rot)), p.alto);
            ctx.restore();
        }

        if (piezas.length === 0) {
            ctx.clearRect(0, 0, lienzo.width, lienzo.height);
        }
    }

    return { lanzar, actualizar, ajustar };
}
