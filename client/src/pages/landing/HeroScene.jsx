import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Soft radial glow, drawn once and shared by the halo, satellites and star field.
const makeGlowTexture = () => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
};

/**
 * Hero centrepiece: a faceted glass core around a glowing energy knot, orbited by
 * neon rings and satellites, floating in a star field over a moving grid.
 * Follows the pointer, reacts to scroll, pauses off-screen, respects reduced motion.
 */
const HeroScene = () => {
    const mountRef = useRef(null);

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return undefined;

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const width = () => mount.clientWidth || 1;
        const height = () => mount.clientHeight || 1;

        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        } catch {
            return undefined; // No WebGL: the CSS aurora behind the hero still carries the look.
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width(), height());
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        renderer.domElement.style.display = 'block';
        mount.appendChild(renderer.domElement);

        const disposables = [];
        const track = (item) => { disposables.push(item); return item; };

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x04050c, 0.035);

        const pmrem = new THREE.PMREMGenerator(renderer);
        const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = envTexture;

        const camera = new THREE.PerspectiveCamera(40, width() / height(), 0.1, 100);
        camera.position.set(0, 0.2, 10);

        // Cinematic lighting: violet key, cyan rim, magenta fill.
        scene.add(new THREE.AmbientLight(0x6d5bff, 0.25));
        const keyLight = new THREE.PointLight(0x8b5cf6, 90, 40);
        keyLight.position.set(-5, 4, 6);
        const rimLight = new THREE.PointLight(0x22d3ee, 80, 40);
        rimLight.position.set(6, -2, 2);
        const fillLight = new THREE.PointLight(0xec4899, 30, 40);
        fillLight.position.set(0, -5, 4);
        scene.add(keyLight, rimLight, fillLight);

        const core = new THREE.Group();
        scene.add(core);

        // Faceted glass shell
        const shellGeo = track(new THREE.IcosahedronGeometry(2, 1));
        const shellMat = track(new THREE.MeshPhysicalMaterial({
            color: 0xb9adff,
            metalness: 0,
            roughness: 0.06,
            transmission: 1,
            thickness: 1.4,
            ior: 1.5,
            clearcoat: 1,
            clearcoatRoughness: 0.04,
            iridescence: 0.6,
            iridescenceIOR: 1.3,
            flatShading: true,
            transparent: true,
            opacity: 0.95,
            envMapIntensity: 1.4,
        }));
        core.add(new THREE.Mesh(shellGeo, shellMat));

        // Neon facet edges
        const edgeGeo = track(new THREE.EdgesGeometry(shellGeo));
        const edgeMat = track(new THREE.LineBasicMaterial({
            color: 0x9d8bff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
        }));
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.scale.setScalar(1.003);
        core.add(edges);

        // Energy knot
        const knotGeo = track(new THREE.TorusKnotGeometry(0.78, 0.22, 240, 36));
        const knotMat = track(new THREE.MeshStandardMaterial({
            color: 0x0b1024, emissive: 0x22d3ee, emissiveIntensity: 1.35, metalness: 0.9, roughness: 0.2,
        }));
        const knot = new THREE.Mesh(knotGeo, knotMat);
        core.add(knot);

        // Halo
        const glowTex = track(makeGlowTexture());
        const haloMat = track(new THREE.SpriteMaterial({
            map: glowTex, color: 0x7c5cff, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        const halo = new THREE.Sprite(haloMat);
        halo.scale.set(9, 9, 1);
        core.add(halo);

        // Orbit rings with satellites
        const rings = [
            { r: 3.1, color: 0x7c5cff, tilt: [1.2, 0.2, 0], speed: 0.35 },
            { r: 3.7, color: 0x22d3ee, tilt: [1.9, -0.5, 0.4], speed: -0.25 },
            { r: 4.4, color: 0xd946ef, tilt: [0.6, 0.9, -0.3], speed: 0.18 },
        ].map(({ r, color, tilt, speed }) => {
            const pivot = new THREE.Group();
            pivot.rotation.set(tilt[0], tilt[1], tilt[2]);

            const ringGeo = track(new THREE.TorusGeometry(r, 0.012, 12, 240));
            const ringMat = track(new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
            }));
            pivot.add(new THREE.Mesh(ringGeo, ringMat));

            const satGeo = track(new THREE.SphereGeometry(0.07, 16, 16));
            const satMat = track(new THREE.MeshBasicMaterial({ color }));
            const sat = new THREE.Mesh(satGeo, satMat);
            sat.position.set(r, 0, 0);

            const satGlowMat = track(new THREE.SpriteMaterial({
                map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
            }));
            const satGlow = new THREE.Sprite(satGlowMat);
            satGlow.scale.set(0.9, 0.9, 1);
            sat.add(satGlow);

            const spinner = new THREE.Group();
            spinner.add(sat);
            pivot.add(spinner);
            core.add(pivot);
            return { spinner, speed };
        });

        // Star field
        const COUNT = 1800;
        const positions = new Float32Array(COUNT * 3);
        const colors = new Float32Array(COUNT * 3);
        const palette = [0x7c5cff, 0x22d3ee, 0xd946ef, 0xffffff].map(c => new THREE.Color(c));
        for (let i = 0; i < COUNT; i++) {
            const radius = 6 + Math.random() * 16;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.6;
            positions[i * 3 + 2] = radius * Math.cos(phi) - 6;
            const c = palette[Math.floor(Math.random() * palette.length)];
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        }
        const starGeo = track(new THREE.BufferGeometry());
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const starMat = track(new THREE.PointsMaterial({
            size: 0.07, map: glowTex, vertexColors: true, transparent: true, opacity: 0.9,
            depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
        }));
        const stars = new THREE.Points(starGeo, starMat);
        scene.add(stars);

        // Moving grid floor
        const grid = new THREE.GridHelper(60, 60, 0x7c5cff, 0x2a2466);
        grid.position.y = -4.2;
        grid.material.transparent = true;
        grid.material.opacity = 0.22;
        track(grid.geometry);
        track(grid.material);
        scene.add(grid);

        // Interaction
        const pointer = { x: 0, y: 0 };
        const onPointerMove = (e) => {
            pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
            pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
        };
        window.addEventListener('pointermove', onPointerMove, { passive: true });

        const resizeObserver = new ResizeObserver(() => {
            camera.aspect = width() / height();
            camera.updateProjectionMatrix();
            renderer.setSize(width(), height());
        });
        resizeObserver.observe(mount);

        let visible = true;
        const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
        visibilityObserver.observe(mount);

        const clock = new THREE.Clock();
        const motion = reduceMotion ? 0.15 : 1;
        let frame = 0;

        const tick = () => {
            frame = requestAnimationFrame(tick);
            if (!visible || document.hidden) return;

            const dt = Math.min(clock.getDelta(), 0.05);
            const t = clock.elapsedTime;
            const scroll = window.scrollY / window.innerHeight;

            core.rotation.y += dt * 0.18 * motion;
            core.rotation.x = THREE.MathUtils.lerp(core.rotation.x, pointer.y * 0.35 + scroll * 0.6, 0.05);
            core.position.y = Math.sin(t * 0.8) * 0.12 * motion - scroll * 1.2;

            knot.rotation.x += dt * 0.6 * motion;
            knot.rotation.y += dt * 0.4 * motion;
            knotMat.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.35 * motion;
            haloMat.opacity = 0.45 + Math.sin(t * 1.5) * 0.1 * motion;

            rings.forEach(({ spinner, speed }) => { spinner.rotation.z += dt * speed * 2 * motion; });
            stars.rotation.y += dt * 0.02 * motion;
            grid.position.z = (t * 0.6 * motion) % 1;

            camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 1.2, 0.04);
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.2 - pointer.y * 0.6, 0.04);
            camera.lookAt(0, 0, 0);
            keyLight.position.x = -5 + Math.sin(t * 0.5) * 2;

            renderer.render(scene, camera);
        };
        tick();

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('pointermove', onPointerMove);
            resizeObserver.disconnect();
            visibilityObserver.disconnect();
            disposables.forEach(d => d.dispose?.());
            envTexture.dispose();
            pmrem.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, []);

    return <div ref={mountRef} className="h-full w-full" aria-hidden="true" />;
};

export default HeroScene;
