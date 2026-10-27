import * as THREE from "three";

let btn;
let gl;
let glCanvas;
let camera;
let scene;
let renderer;
let reticle;

let xrSession = null;
let hitTestSource = null;
let viewerSpace = null;
let localSpace = null;

let placeRequested = false;
let surfaceValid = false;
let surfaceAngle = 0;
let anchorsEnabled = false;

const placed = [];
const anchors = [];

const TABLE_WIDTH = 1.0;
const TABLE_DEPTH = 0.5;
const TABLE_HEIGHT = 0.45;
const MAX_TABLES = 5;

const status = document.getElementById("status");
const clearButton = document.getElementById("clear");
const overlay = document.getElementById("overlay");

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

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.xr.enabled = true;

    const hemiLight = new THREE.HemisphereLight(
        0xffffff,
        0xbbbbff,
        2
    );

    scene.add(hemiLight);

    const directionalLight =
        new THREE.DirectionalLight(
            0xffffff,
            2
        );

    directionalLight.position.set(1, 2, 1);
    scene.add(directionalLight);

    const reticleGeometry =
        new THREE.RingGeometry(
            0.06,
            0.08,
            32
        );

    reticleGeometry.rotateX(-Math.PI / 2);

    const reticleMaterial =
        new THREE.MeshBasicMaterial({
            color: 0x00ff00
        });

    reticle = new THREE.Mesh(
        reticleGeometry,
        reticleMaterial
    );

    reticle.matrixAutoUpdate = false;
    reticle.visible = false;

    scene.add(reticle);

    clearButton.addEventListener(
        "click",
        clearProducts
    );

    overlay.addEventListener(
        "beforexrselect",
        function (event) {
            event.preventDefault();
        }
    );

    updateStatus();
    checkARSupport();
}

async function checkARSupport() {
    const fallback =
        document.getElementById("fallback");

    if (!navigator.xr) {
        fallback.hidden = false;
        fallback.textContent =
            "WebXR is not supported on this device.";
        return;
    }

    try {
        const supported =
            await navigator.xr.isSessionSupported(
                "immersive-ar"
            );

        if (supported) {
            btn = document.createElement("button");

            btn.textContent = "START AR";

            btn.addEventListener(
                "click",
                onRequestSession
            );

            document.body.appendChild(btn);

        } else {
            fallback.hidden = false;
            fallback.textContent =
                "Immersive AR is not supported on this device.";
        }

    } catch (error) {
        fallback.hidden = false;

        fallback.textContent =
            "AR support check failed: " +
            error.message;
    }
}

async function onRequestSession() {
    if (xrSession) {
        await xrSession.end();
        return;
    }

    try {
        status.innerHTML =
            "Starting AR...";

        const session =
            await navigator.xr.requestSession(
                "immersive-ar",
                {
                    requiredFeatures: [
                        "hit-test"
                    ],

                    optionalFeatures: [
                        "anchors",
                        "dom-overlay"
                    ],

                    domOverlay: {
                        root: overlay
                    }
                }
            );

        await onSessionStarted(session);

    } catch (error) {
        console.error(
            "AR start error:",
            error
        );

        status.innerHTML =
            "AR ERROR:<br>" +
            error.name +
            "<br>" +
            error.message;
    }
}

async function onSessionStarted(session) {
    xrSession = session;

    session.addEventListener(
        "end",
        onSessionEnd
    );

    /*
        On Android handheld AR, touching the screen
        creates an XR select interaction.

        We only request placement here.
        The object is created later inside render()
        using the current hit-test result.
    */
    session.addEventListener(
        "selectstart",
        onXRSelect
    );

    renderer.xr.setReferenceSpaceType(
        "local"
    );

    await renderer.xr.setSession(
        session
    );

    viewerSpace =
        await session.requestReferenceSpace(
            "viewer"
        );

    localSpace =
        await session.requestReferenceSpace(
            "local"
        );

    if (session.enabledFeatures) {
        anchorsEnabled =
            Array.from(
                session.enabledFeatures
            ).includes("anchors");
    } else {
        anchorsEnabled = false;
    }

    hitTestSource =
        await session.requestHitTestSource({
            space: viewerSpace
        });

    btn.textContent = "STOP AR";

    updateStatus();
    animate();
}

function onXRSelect() {
    placeRequested = true;
}

function animate() {
    renderer.setAnimationLoop(
        render
    );
}

function render(time, frame) {
    if (frame && xrSession) {
        updateAnchors(frame);

        if (
            hitTestSource &&
            localSpace
        ) {
            const results =
                frame.getHitTestResults(
                    hitTestSource
                );

            if (results.length > 0) {
                const hit = results[0];

                const pose =
                    hit.getPose(
                        localSpace
                    );

                if (pose) {
                    reticle.visible = true;

                    reticle.matrix.fromArray(
                        pose.transform.matrix
                    );

                    const matrix =
                        pose.transform.matrix;

                    const normal =
                        new THREE.Vector3(
                            matrix[4],
                            matrix[5],
                            matrix[6]
                        ).normalize();

                    const worldUp =
                        new THREE.Vector3(
                            0,
                            1,
                            0
                        );

                    surfaceAngle =
                        THREE.MathUtils.radToDeg(
                            normal.angleTo(
                                worldUp
                            )
                        );

                    surfaceValid =
                        surfaceAngle <= 12;

                    reticle.material.color.set(
                        surfaceValid
                            ? 0x00ff00
                            : 0xff0000
                    );

                    if (placeRequested) {
                        if (surfaceValid) {
                            placeTable(
                                hit,
                                pose
                            );
                        }

                        placeRequested = false;
                    }

                } else {
                    loseTracking();
                }

            } else {
                loseTracking();
            }
        }
    }

    updateStatus();

    renderer.render(
        scene,
        camera
    );
}

function loseTracking() {
    reticle.visible = false;
    surfaceValid = false;
    surfaceAngle = 0;

    if (placeRequested) {
        placeRequested = false;
    }
}

function placeTable(hit, pose) {
    const table =
        createCoffeeTable();

    table.matrix.fromArray(
        pose.transform.matrix
    );

    table.matrix.decompose(
        table.position,
        table.quaternion,
        table.scale
    );

    scene.add(table);

    placed.push(table);

    createAnchorForTable(
        hit,
        table
    );

    if (
        placed.length >
        MAX_TABLES
    ) {
        const oldestTable =
            placed.shift();

        removeTable(
            oldestTable
        );
    }
}

function createCoffeeTable() {
    const table =
        new THREE.Group();

    const woodMaterial =
        new THREE.MeshStandardMaterial({
            color: 0x8b5a2b,
            roughness: 0.7,
            metalness: 0
        });

    const topThickness = 0.05;
    const legSize = 0.06;

    const legHeight =
        TABLE_HEIGHT -
        topThickness;

    const top =
        new THREE.Mesh(
            new THREE.BoxGeometry(
                TABLE_WIDTH,
                topThickness,
                TABLE_DEPTH
            ),
            woodMaterial
        );

    top.position.y =
        TABLE_HEIGHT -
        topThickness / 2;

    table.add(top);

    const legGeometry =
        new THREE.BoxGeometry(
            legSize,
            legHeight,
            legSize
        );

    const legY =
        legHeight / 2;

    const positions = [
        [
            -TABLE_WIDTH / 2 + legSize,
            legY,
            -TABLE_DEPTH / 2 + legSize
        ],
        [
            TABLE_WIDTH / 2 - legSize,
            legY,
            -TABLE_DEPTH / 2 + legSize
        ],
        [
            -TABLE_WIDTH / 2 + legSize,
            legY,
            TABLE_DEPTH / 2 - legSize
        ],
        [
            TABLE_WIDTH / 2 - legSize,
            legY,
            TABLE_DEPTH / 2 - legSize
        ]
    ];

    for (const position of positions) {
        const leg =
            new THREE.Mesh(
                legGeometry,
                woodMaterial
            );

        leg.position.set(
            position[0],
            position[1],
            position[2]
        );

        table.add(leg);
    }

    return table;
}

async function createAnchorForTable(
    hit,
    table
) {
    if (
        !anchorsEnabled ||
        typeof hit.createAnchor !==
            "function"
    ) {
        return;
    }

    try {
        const anchor =
            await hit.createAnchor();

        if (
            !placed.includes(
                table
            )
        ) {
            anchor.delete();
            return;
        }

        anchors.push({
            anchor: anchor,
            table: table
        });

    } catch (error) {
        console.log(
            "Anchor unavailable, using normal placement."
        );
    }
}

function updateAnchors(frame) {
    if (!localSpace) {
        return;
    }

    for (const item of anchors) {
        const pose =
            frame.getPose(
                item.anchor.anchorSpace,
                localSpace
            );

        if (pose) {
            item.table.matrix.fromArray(
                pose.transform.matrix
            );

            item.table.matrix.decompose(
                item.table.position,
                item.table.quaternion,
                item.table.scale
            );
        }
    }
}

function removeTable(table) {
    scene.remove(table);

    const index =
        anchors.findIndex(
            item =>
                item.table === table
        );

    if (index !== -1) {
        try {
            anchors[
                index
            ].anchor.delete();
        } catch (error) {
            console.log(
                "Anchor already removed."
            );
        }

        anchors.splice(
            index,
            1
        );
    }
}

function clearProducts() {
    while (
        placed.length > 0
    ) {
        const table =
            placed.pop();

        removeTable(
            table
        );
    }

    updateStatus();
}

function updateStatus() {
    let reticleState =
        "none";

    if (
        reticle &&
        reticle.visible
    ) {
        reticleState =
            surfaceValid
                ? "valid"
                : "too tilted";
    }

    const sessionState =
        xrSession
            ? "running"
            : "stopped";

    const angleText =
        reticle &&
        reticle.visible
            ? surfaceAngle.toFixed(1) +
              "°"
            : "-";

    status.innerHTML =
        "ID: 241482<br>" +
        "Variant: Coffee Table<br>" +
        "Session: " +
        sessionState +
        "<br>" +
        "Reticle: " +
        reticleState +
        "<br>" +
        "Angle: " +
        angleText +
        "<br>" +
        "Anchors: " +
        (
            anchorsEnabled
                ? "ON"
                : "OFF"
        ) +
        "<br>" +
        "Products: " +
        placed.length +
        " / " +
        MAX_TABLES;
}

function onSessionEnd() {
    if (hitTestSource) {
        hitTestSource.cancel();
    }

    for (const item of anchors) {
        try {
            item.anchor.delete();
        } catch (error) {
            console.log(
                "Anchor already removed."
            );
        }
    }

    anchors.length = 0;

    xrSession = null;
    hitTestSource = null;
    viewerSpace = null;
    localSpace = null;

    placeRequested = false;
    surfaceValid = false;
    surfaceAngle = 0;
    anchorsEnabled = false;

    reticle.visible = false;

    btn.textContent =
        "START AR";

    updateStatus();
}