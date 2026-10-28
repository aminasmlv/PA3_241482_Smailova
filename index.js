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

/*
    ANCHORS OFF TEST
*/
let anchorsEnabled = false;

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

    /*
        Block XR placement only when
        the user presses an actual UI button.
    */

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

        /*
            ANCHORS OFF TEST

            "anchors" is intentionally NOT requested.
            Hit testing and DOM overlay are still used.
        */

        const session =
            await navigator.xr.requestSession(
                "immersive-ar",
                {
                    requiredFeatures: [
                        "hit-test"
                    ],

                    optionalFeatures: [
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

    /*
        On Android WebXR a screen tap
        generates the select event.

        We only request placement here.
        Placement happens in render().
    */

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

    /*
        ANCHORS ARE FORCED OFF
        FOR THIS EXPERIMENT.
    */

    anchorsEnabled = false;

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

        /*
            updateAnchors() is harmless here.
            anchors[] remains empty because
            anchors are disabled.
        */

        updateAnchors(frame);

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

                const pose =
                    hit.getPose(
                        localSpace
                    );

                if (pose) {
                    updateReticle(
                        pose
                    );

                    /*
                        Placement happens in
                        the XR frame after select.
                    */

                    if (placeRequested) {

                        if (surfaceValid) {
                            placeTable(
                                hit,
                                pose
                            );
                        }

                        /*
                            Consume the tap even if
                            the surface was invalid.
                        */

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

    /*
        Consume a pending placement request
        when there is no valid hit.
    */

    if (placeRequested) {
        placeRequested = false;
    }
}

function placeTable(hit, pose) {
    const table =
        createCoffeeTable();

    /*
        Variant rule:
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

    /*
        createAnchor() is still kept so the
        original program structure remains.

        Because anchorsEnabled is false,
        it immediately returns and the table
        uses pose fallback.
    */

    createAnchor(
        hit,
        table
    );

    /*
        Multi-placement:
        maximum 5 products.

        The 6th removes the oldest.
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
        Group origin is at the centre
        of the base on the floor.
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

    /*
        Verify dimensions with Box3.
    */

    table.updateMatrixWorld(true);

    const box =
        new THREE.Box3().setFromObject(
            table
        );

    const size =
        new THREE.Vector3();

    box.getSize(size);

    console.log(
        "Coffee table size:",
        size.x.toFixed(3),
        size.y.toFixed(3),
        size.z.toFixed(3),
        "metres"
    );

    return table;
}

async function createAnchor(
    hit,
    table
) {
    /*
        FALLBACK PATH.

        During this test anchorsEnabled
        is false, so no XRAnchor is created.
    */

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

        /*
            For this experiment this
            will display OFF.
        */

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