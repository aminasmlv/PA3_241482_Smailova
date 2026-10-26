import * as THREE from "three";

let btn;
let gl;
let glCanvas;
let camera;
let scene;
let renderer;
let controller;
let reticle;

let xrSession = null;
let hitTestSource = null;
let hitTestSourceRequested = false;
let viewerSpace = null;
let localSpace = null;

let placeRequested = false;
let surfaceValid = false;
let surfaceAngle = 0;

const placed = [];

loadScene();

function loadScene() {
    glCanvas = document.createElement("canvas");

    gl = glCanvas.getContext("webgl2", {
        xrCompatible: true,
        alpha: true
    });

    document.body.appendChild(glCanvas);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        20
    );

    renderer = new THREE.WebGLRenderer({
        canvas: glCanvas,
        context: gl,
        alpha: true
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    const hemiLight = new THREE.HemisphereLight(
        0xffffff,
        0xbbbbff,
        2
    );
    scene.add(hemiLight);

    const directionalLight = new THREE.DirectionalLight(
        0xffffff,
        2
    );
    directionalLight.position.set(1, 2, 1);
    scene.add(directionalLight);

    const reticleGeometry = new THREE.RingGeometry(0.06, 0.08, 32);
    reticleGeometry.rotateX(-Math.PI / 2);

    const reticleMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00
    });

    reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;

    scene.add(reticle);

    checkARSupport();
}

async function checkARSupport() {
    const fallback = document.getElementById("fallback");

    if (!navigator.xr) {
        fallback.hidden = false;
        fallback.textContent = "WebXR is not supported on this device.";
        return;
    }

    const supported = await navigator.xr.isSessionSupported("immersive-ar");

    if (supported) {
        btn = document.createElement("button");
        btn.textContent = "START AR";
        btn.addEventListener("click", onRequestSession);
        document.body.appendChild(btn);
    } else {
        fallback.hidden = false;
        fallback.textContent = "Immersive AR is not supported on this device.";
    }
}

async function onRequestSession() {
    if (xrSession) {
        await xrSession.end();
        return;
    }

    const overlay = document.getElementById("overlay");

    const session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["anchors", "dom-overlay"],
        domOverlay: { root: overlay }
    });

    await onSessionStarted(session);
}

async function onSessionStarted(session) {
    xrSession = session;

    session.addEventListener("end", onSessionEnd);

    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(session);

    viewerSpace = await session.requestReferenceSpace("viewer");
    localSpace = await session.requestReferenceSpace("local");

    btn.textContent = "STOP AR";

    animate();
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render(time, frame) {
    if (frame && xrSession) {

        if (!hitTestSourceRequested && viewerSpace) {
            xrSession.requestHitTestSource({
                space: viewerSpace
            }).then((source) => {
                hitTestSource = source;
            });

            hitTestSourceRequested = true;
        }

        if (hitTestSource && localSpace) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(localSpace);

                if (pose) {
                    reticle.visible = true;
                    reticle.matrix.fromArray(pose.transform.matrix);

                    const matrix = pose.transform.matrix;

                    const normal = new THREE.Vector3(
                        matrix[4],
                        matrix[5],
                        matrix[6]
                    ).normalize();

                    const worldUp = new THREE.Vector3(0, 1, 0);

                    surfaceAngle = THREE.MathUtils.radToDeg(
                        normal.angleTo(worldUp)
                    );

                    surfaceValid = surfaceAngle <= 12;

                    if (surfaceValid) {
                        reticle.material.color.set(0x00ff00);
                    } else {
                        reticle.material.color.set(0xff0000);
                    }
                }
            } else {
                reticle.visible = false;
                surfaceValid = false;
            }
        }
    }

    renderer.render(scene, camera);
}

function onSessionEnd() {
    if (hitTestSource) {
        hitTestSource.cancel();
    }

    xrSession = null;
    hitTestSource = null;
    hitTestSourceRequested = false;
    viewerSpace = null;
    localSpace = null;
    placeRequested = false;
    surfaceValid = false;
    surfaceAngle = 0;

    reticle.visible = false;

    btn.textContent = "START AR";
}