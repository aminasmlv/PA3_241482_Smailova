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

let placeRequested = false;

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

    btn.textContent = "STOP AR";

    animate();
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render() {
    renderer.render(scene, camera);
}

function onSessionEnd() {
    xrSession = null;
    hitTestSource = null;
    hitTestSourceRequested = false;
    placeRequested = false;

    btn.textContent = "START AR";
}