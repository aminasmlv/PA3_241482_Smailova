import * as THREE from "three";

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

let startCameraPosition = null;
let currentCameraPosition = null;
let hitViewerPosition = null;
let hitLocalPosition = null;
let hitMatrixValues = null;
let hitNormalValues = null;

const placed = [];
const anchors = [];

const TABLE_WIDTH = 1.0;
const TABLE_DEPTH = 0.5;
const TABLE_HEIGHT = 0.45;

const MAX_TABLES = 5;

const status = document.getElementById("status");
const clearButton = document.getElementById("clear");
const arButton = document.getElementById("arButton");
const fallback = document.getElementById("fallback");

init();

function init() {
    glCanvas = document.createElement("canvas");

    gl = glCanvas.getContext("webgl2", {
        xrCompatible: true,
        alpha: true
    });

    if (!gl) {
        fallback.hidden = false;
        fallback.textContent = "WebGL2 is not available.";
        return;
    }

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

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 2)
    );

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.xr.enabled = true;

    createLights();
    createReticle();

    arButton.addEventListener(
        "click",
        onARButton
    );

    clearButton.addEventListener(
        "click",
        clearProducts
    );

    clearButton.addEventListener(
        "beforexrselect",
        function (event) {
            event.preventDefault();
        }
    );

    arButton.addEventListener(
        "beforexrselect",
        function (event) {
            event.preventDefault();
        }
    );

    window.addEventListener(
        "resize",
        onResize
    );

    status.style.fontSize = "11px";
    status.style.lineHeight = "1.25";

    updateStatus();
    checkARSupport();
}

function createLights() {
    const hemiLight =
        new THREE.HemisphereLight(
            0xffffff,
            0x444444,
            2
        );

    scene.add(hemiLight);

    const directionalLight =
        new THREE.DirectionalLight(
            0xffffff,
            2
        );

    directionalLight.position.set(
        1,
        2,
        1
    );

    scene.add(directionalLight);
}

function createReticle() {
    const geometry =
        new THREE.RingGeometry(
            0.06,
            0.08,
            32
        );

    geometry.rotateX(
        -Math.PI / 2
    );

    const material =
        new THREE.MeshBasicMaterial({
            color: 0x00ff00
        });

    reticle =
        new THREE.Mesh(
            geometry,
            material
        );

    reticle.matrixAutoUpdate = false;
    reticle.visible = false;

    scene.add(reticle);
}

async function checkARSupport() {
    if (!navigator.xr) {
        arButton.disabled = true;

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

        if (!supported) {
            arButton.disabled = true;

            fallback.hidden = false;
            fallback.textContent =
                "Immersive AR is not supported on this device.";
        }

    } catch (error) {
        arButton.disabled = true;

        fallback.hidden = false;
        fallback.textContent =
            "AR support check failed: " +
            error.message;
    }
}

async function onARButton() {
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
                        root:
                            document.getElementById(
                                "overlay"
                            )
                    }
                }
            );

        await onSessionStarted(
            session
        );

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

    session.addEventListener(
        "select",
        onSelect
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

    arButton.textContent =
        "STOP AR";

    renderer.setAnimationLoop(
        render
    );

    updateStatus();
}

function onSelect() {
    placeRequested = true;
}

function render(time, frame) {
    if (frame && xrSession) {
        updateAnchors(frame);

        // E1: camera position in local reference space
        if (localSpace) {
            const viewerPoseLocal =
                frame.getViewerPose(
                    localSpace
                );

            if (viewerPoseLocal) {
                const p =
                    viewerPoseLocal.transform.position;

                currentCameraPosition = [
                    p.x,
                    p.y,
                    p.z
                ];

                if (!startCameraPosition) {
                    startCameraPosition =
                        currentCameraPosition.slice();
                }
            }
        }

        if (
            hitTestSource &&
            localSpace
        ) {
            const hitTestResults =
                frame.getHitTestResults(
                    hitTestSource
                );

            if (
                hitTestResults.length > 0
            ) {
                const hit =
                    hitTestResults[0];

                // Same hit in LOCAL space
                const pose =
                    hit.getPose(
                        localSpace
                    );

                // Same hit in VIEWER space
                const viewerHitPose =
                    viewerSpace
                        ? hit.getPose(
                            viewerSpace
                        )
                        : null;

                if (viewerHitPose) {
                    const vp =
                        viewerHitPose.transform.position;

                    hitViewerPosition = [
                        vp.x,
                        vp.y,
                        vp.z
                    ];
                }

                if (pose) {
                    const lp =
                        pose.transform.position;

                    hitLocalPosition = [
                        lp.x,
                        lp.y,
                        lp.z
                    ];

                    hitMatrixValues =
                        Array.from(
                            pose.transform.matrix
                        );

                    updateReticle(
                        pose
                    );

                    if (placeRequested) {
                        if (surfaceValid) {
                            placeTable(
                                hit,
                                pose
                            );
                        }

                        // Consume every tap.
                        // Invalid surface = do nothing.
                        placeRequested = false;
                    }

                } else {
                    trackingLost();
                }

            } else {
                trackingLost();
            }
        }
    }

    updateStatus();

    renderer.render(
        scene,
        camera
    );
}

function updateReticle(pose) {
    reticle.visible = true;

    reticle.matrix.fromArray(
        pose.transform.matrix
    );

    const matrix =
        pose.transform.matrix;

    /*
        Y-axis column of the hit pose matrix
        gives the surface normal.
    */

    const normal =
        new THREE.Vector3(
            matrix[4],
            matrix[5],
            matrix[6]
        ).normalize();

    hitNormalValues = [
        normal.x,
        normal.y,
        normal.z
    ];

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
}

function trackingLost() {
    reticle.visible = false;

    surfaceValid = false;
    surfaceAngle = 0;
}

function placeTable(hit, pose) {
    const table =
        createCoffeeTable();

    /*
        Variant:
        keep hit pose orientation.
    */

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

    createAnchor(
        hit,
        table
    );

    /*
        Maximum 5 products.
        6th removes oldest.
    */

    if (
        placed.length >
        MAX_TABLES
    ) {
        const oldest =
            placed.shift();

        removeTable(
            oldest
        );
    }
}

function createCoffeeTable() {
    const table =
        new THREE.Group();

    /*
        Group origin:
        centre of base on floor.
    */

    const material =
        new THREE.MeshStandardMaterial({
            color: 0x8b5a2b,
            roughness: 0.65,
            metalness: 0
        });

    const topThickness =
        0.05;

    const legSize =
        0.06;

    const legHeight =
        TABLE_HEIGHT -
        topThickness;

    /*
        Table top:
        1.00 m x 0.50 m
    */

    const top =
        new THREE.Mesh(
            new THREE.BoxGeometry(
                TABLE_WIDTH,
                topThickness,
                TABLE_DEPTH
            ),
            material
        );

    top.position.y =
        TABLE_HEIGHT -
        topThickness / 2;

    table.add(top);

    /*
        Four legs.
    */

    const legGeometry =
        new THREE.BoxGeometry(
            legSize,
            legHeight,
            legSize
        );

    const legY =
        legHeight / 2;

    const x =
        TABLE_WIDTH / 2 -
        legSize;

    const z =
        TABLE_DEPTH / 2 -
        legSize;

    const legPositions = [
        [-x, legY, -z],
        [ x, legY, -z],
        [-x, legY,  z],
        [ x, legY,  z]
    ];

    for (
        const position
        of legPositions
    ) {
        const leg =
            new THREE.Mesh(
                legGeometry,
                material
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

async function createAnchor(
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
            try {
                anchor.delete();
            } catch (error) {
                console.log(
                    "Anchor already removed."
                );
            }

            return;
        }

        anchors.push({
            anchor: anchor,
            table: table
        });

    } catch (error) {
        console.log(
            "Anchor creation unavailable. Using pose fallback."
        );
    }
}

function updateAnchors(frame) {
    if (!localSpace) {
        return;
    }

    for (
        const item
        of anchors
    ) {
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

    const anchorIndex =
        anchors.findIndex(
            item =>
                item.table === table
        );

    if (
        anchorIndex !== -1
    ) {
        try {
            anchors[
                anchorIndex
            ].anchor.delete();

        } catch (error) {
            console.log(
                "Anchor already removed."
            );
        }

        anchors.splice(
            anchorIndex,
            1
        );
    }
}

function clearProducts() {
    placeRequested = false;

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

function formatVec(values) {
    if (!values) {
        return "-";
    }

    return values
        .map(
            value =>
                value.toFixed(3)
        )
        .join(", ");
}

function formatMatrix(values) {
    if (!values) {
        return "-";
    }

    return values
        .map(
            value =>
                value.toFixed(3)
        )
        .join(", ");
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
        "ID: 241482 | Coffee Table<br>" +

        "Session: " +
        sessionState +

        " | Reticle: " +
        reticleState +

        " | Angle: " +
        angleText +
        "<br>" +

        "Anchors: " +
        (
            anchorsEnabled
                ? "ON"
                : "OFF"
        ) +

        " | Products: " +
        placed.length +
        " / " +
        MAX_TABLES +

        "<br><br>" +

        "<b>E1 CAMERA (LOCAL)</b><br>" +

        "Start: [" +
        formatVec(
            startCameraPosition
        ) +
        "]<br>" +

        "Current: [" +
        formatVec(
            currentCameraPosition
        ) +
        "]<br><br>" +

        "<b>E1 SAME HIT</b><br>" +

        "Viewer: [" +
        formatVec(
            hitViewerPosition
        ) +
        "]<br>" +

        "Local: [" +
        formatVec(
            hitLocalPosition
        ) +
        "]<br><br>" +

        "<b>E3 HIT POSE</b><br>" +

        "Position: [" +
        formatVec(
            hitLocalPosition
        ) +
        "]<br>" +

        "Normal [4,5,6]: [" +
        formatVec(
            hitNormalValues
        ) +
        "]<br>" +

        "Matrix 16:<br>[" +
        formatMatrix(
            hitMatrixValues
        ) +
        "]";
}

function onSessionEnd() {
    renderer.setAnimationLoop(
        null
    );

    if (hitTestSource) {
        hitTestSource.cancel();
    }

    hitTestSource = null;

    for (
        const item
        of anchors
    ) {
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
    viewerSpace = null;
    localSpace = null;

    placeRequested = false;

    surfaceValid = false;
    surfaceAngle = 0;

    anchorsEnabled = false;

    startCameraPosition = null;
    currentCameraPosition = null;
    hitViewerPosition = null;
    hitLocalPosition = null;
    hitMatrixValues = null;
    hitNormalValues = null;

    reticle.visible = false;

    arButton.textContent =
        "START AR";

    updateStatus();
}

function onResize() {
    camera.aspect =
        window.innerWidth /
        window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );
}