import * as THREE from "https://unpkg.com/three@0.186.1/build/three.module.js";

let scene;
let camera;
let renderer;

let xrSession = null;
let localSpace = null;
let viewerSpace = null;
let hitTestSource = null;

let reticle;
let reticleMaterial;

let surfaceValid = false;
let currentTiltAngle = null;
let currentHit = null;

let placeRequested = false;
let anchorsEnabled = false;

const placedProducts = [];
const MAX_PRODUCTS = 5;
const SURFACE_TOLERANCE = 12;

// Coffee table dimensions in metres
const TABLE_WIDTH = 1.0;
const TABLE_DEPTH = 0.5;
const TABLE_HEIGHT = 0.45;
const TOP_THICKNESS = 0.06;
const LEG_SIZE = 0.07;

// E1 / E3 evidence values
let startCameraPosition = null;
let currentCameraPosition = null;

let hitViewerPosition = null;
let hitLocalPosition = null;

let hitMatrixValues = [];
let hitNormalValues = [];

// ----------------------------------------------------
// DOM
// ----------------------------------------------------

const startButton = document.getElementById("start-ar");
const stopButton = document.getElementById("stop-ar");
const clearButton = document.getElementById("clear-products");

const overlay = document.getElementById("overlay");

const sessionStatus = document.getElementById("session-status");
const reticleStatus = document.getElementById("reticle-status");
const angleStatus = document.getElementById("angle-status");
const anchorStatus = document.getElementById("anchor-status");
const productStatus = document.getElementById("product-status");

// ----------------------------------------------------
// EXTRA EVIDENCE PANEL
// ----------------------------------------------------

const evidencePanel = document.createElement("div");

evidencePanel.style.marginTop = "8px";
evidencePanel.style.padding = "7px";
evidencePanel.style.background = "rgba(0, 0, 0, 0.55)";
evidencePanel.style.borderRadius = "8px";
evidencePanel.style.fontSize = "10px";
evidencePanel.style.lineHeight = "1.25";
evidencePanel.style.wordBreak = "break-word";
evidencePanel.style.maxWidth = "95vw";

evidencePanel.innerHTML = `
    <div style="font-weight:bold;">E1 CAMERA (LOCAL)</div>
    <div id="camera-start">Start: waiting...</div>
    <div id="camera-current">Current: waiting...</div>

    <div style="font-weight:bold; margin-top:5px;">
        E1 SAME HIT
    </div>
    <div id="hit-viewer">Viewer: waiting...</div>
    <div id="hit-local">Local: waiting...</div>

    <div style="font-weight:bold; margin-top:5px;">
        E3 HIT POSE
    </div>
    <div id="hit-position">Position: waiting...</div>
    <div id="hit-normal">Normal [4,5,6]: waiting...</div>
    <div id="hit-matrix">Matrix 16: waiting...</div>
`;

overlay.appendChild(evidencePanel);

const cameraStartText = document.getElementById("camera-start");
const cameraCurrentText = document.getElementById("camera-current");

const hitViewerText = document.getElementById("hit-viewer");
const hitLocalText = document.getElementById("hit-local");

const hitPositionText = document.getElementById("hit-position");
const hitNormalText = document.getElementById("hit-normal");
const hitMatrixText = document.getElementById("hit-matrix");

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------

init();

function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        20
    );

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    renderer.xr.enabled = true;

    document.body.appendChild(renderer.domElement);

    addLights();
    createReticle();

    renderer.setAnimationLoop(render);

    window.addEventListener("resize", onWindowResize);

    startButton.addEventListener("click", startAR);
    stopButton.addEventListener("click", stopAR);
    clearButton.addEventListener("click", clearProducts);

    preventOverlayPlacement(startButton);
    preventOverlayPlacement(stopButton);
    preventOverlayPlacement(clearButton);

    updateOverlay();
}

// ----------------------------------------------------
// LIGHTS
// ----------------------------------------------------

function addLights() {
    const hemisphereLight = new THREE.HemisphereLight(
        0xffffff,
        0x444444,
        2.2
    );

    scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(
        0xffffff,
        2.0
    );

    directionalLight.position.set(1, 2, 1);

    scene.add(directionalLight);
}

// ----------------------------------------------------
// RETICLE
// ----------------------------------------------------

function createReticle() {
    const geometry = new THREE.RingGeometry(
        0.07,
        0.09,
        32
    );

    geometry.rotateX(-Math.PI / 2);

    reticleMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        side: THREE.DoubleSide
    });

    reticle = new THREE.Mesh(
        geometry,
        reticleMaterial
    );

    reticle.matrixAutoUpdate = false;
    reticle.visible = false;

    scene.add(reticle);
}

// ----------------------------------------------------
// START AR
// ----------------------------------------------------

async function startAR() {
    if (xrSession) {
        return;
    }

    if (!navigator.xr) {
        sessionStatus.textContent = "Session: WebXR unavailable";
        return;
    }

    try {
        const supported = await navigator.xr.isSessionSupported(
            "immersive-ar"
        );

        if (!supported) {
            sessionStatus.textContent =
                "Session: immersive-ar unsupported";
            return;
        }

        /*
         * ANCHORS OFF TEST
         *
         * We intentionally DO NOT request "anchors".
         * This allows us to test the fallback placement.
         */
        xrSession = await navigator.xr.requestSession(
            "immersive-ar",
            {
                requiredFeatures: [
                    "hit-test"
                ],

                optionalFeatures: [
                    "dom-overlay"
                ],

                domOverlay: {
                    root: overlay
                }
            }
        );

        sessionStatus.textContent = "Session: starting...";

        xrSession.addEventListener(
            "end",
            onSessionEnded
        );

        xrSession.addEventListener(
            "select",
            onSelect
        );

        await renderer.xr.setSession(xrSession);

        localSpace = await xrSession.requestReferenceSpace(
            "local"
        );

        viewerSpace = await xrSession.requestReferenceSpace(
            "viewer"
        );

        hitTestSource =
            await xrSession.requestHitTestSource({
                space: viewerSpace
            });

        /*
         * FORCE ANCHORS OFF FOR THIS EXPERIMENT.
         * Since "anchors" was not requested, fallback
         * placement will be used.
         */
        anchorsEnabled = false;

        startCameraPosition = null;
        currentCameraPosition = null;

        hitViewerPosition = null;
        hitLocalPosition = null;

        hitMatrixValues = [];
        hitNormalValues = [];

        startButton.disabled = true;
        stopButton.disabled = false;

        sessionStatus.textContent = "Session: running";

        updateOverlay();
    } catch (error) {
        console.error("Failed to start AR session:", error);

        sessionStatus.textContent =
            "Session: failed to start";

        xrSession = null;

        startButton.disabled = false;
        stopButton.disabled = true;
    }
}

// ----------------------------------------------------
// STOP AR
// ----------------------------------------------------

async function stopAR() {
    if (!xrSession) {
        return;
    }

    try {
        await xrSession.end();
    } catch (error) {
        console.error("Failed to stop AR session:", error);
    }
}

// ----------------------------------------------------
// SESSION END
// ----------------------------------------------------

function onSessionEnded() {
    if (hitTestSource) {
        hitTestSource.cancel();
        hitTestSource = null;
    }

    clearProducts();

    xrSession = null;
    localSpace = null;
    viewerSpace = null;

    currentHit = null;

    surfaceValid = false;
    currentTiltAngle = null;
    placeRequested = false;

    anchorsEnabled = false;

    startCameraPosition = null;
    currentCameraPosition = null;

    hitViewerPosition = null;
    hitLocalPosition = null;

    hitMatrixValues = [];
    hitNormalValues = [];

    reticle.visible = false;

    startButton.disabled = false;
    stopButton.disabled = true;

    sessionStatus.textContent = "Session: stopped";

    updateOverlay();
}

// ----------------------------------------------------
// SELECT / TAP
// ----------------------------------------------------

function onSelect() {
    /*
     * Important:
     * select only requests placement.
     * Actual placement happens in the next XR frame
     * using the current hit result.
     */
    placeRequested = true;
}

// ----------------------------------------------------
// RENDER LOOP
// ----------------------------------------------------

function render(timestamp, frame) {
    if (
        frame &&
        xrSession &&
        localSpace
    ) {
        updateCameraEvidence(frame);

        if (hitTestSource) {
            const hitResults =
                frame.getHitTestResults(hitTestSource);

            if (hitResults.length > 0) {
                const hit = hitResults[0];

                const pose =
                    hit.getPose(localSpace);

                if (pose) {
                    currentHit = hit;

                    updateReticle(
                        hit,
                        pose
                    );

                    updateHitEvidence(hit, pose);

                    /*
                     * Consume the tap in this frame.
                     * Placement only happens when
                     * the current surface is valid.
                     */
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
                    noHit();
                }
            } else {
                noHit();
            }
        }
    }

    renderer.render(
        scene,
        camera
    );
}

// ----------------------------------------------------
// CAMERA EVIDENCE — E1
// ----------------------------------------------------

function updateCameraEvidence(frame) {
    if (!localSpace) {
        return;
    }

    const viewerPose =
        frame.getViewerPose(localSpace);

    if (!viewerPose) {
        return;
    }

    const position =
        viewerPose.transform.position;

    currentCameraPosition = [
        position.x,
        position.y,
        position.z
    ];

    if (!startCameraPosition) {
        startCameraPosition = [
            position.x,
            position.y,
            position.z
        ];
    }

    cameraStartText.textContent =
        "Start: " +
        formatVector(startCameraPosition);

    cameraCurrentText.textContent =
        "Current: " +
        formatVector(currentCameraPosition);
}

// ----------------------------------------------------
// HIT EVIDENCE — E1 + E3
// ----------------------------------------------------

function updateHitEvidence(hit, localPose) {
    if (!localPose) {
        return;
    }

    const localPosition =
        localPose.transform.position;

    hitLocalPosition = [
        localPosition.x,
        localPosition.y,
        localPosition.z
    ];

    /*
     * Same hit result, but pose expressed
     * relative to viewerSpace.
     */
    if (viewerSpace) {
        const viewerPose =
            hit.getPose(viewerSpace);

        if (viewerPose) {
            const viewerPosition =
                viewerPose.transform.position;

            hitViewerPosition = [
                viewerPosition.x,
                viewerPosition.y,
                viewerPosition.z
            ];
        }
    }

    const matrix =
        localPose.transform.matrix;

    hitMatrixValues =
        Array.from(matrix);

    /*
     * Y-axis column of the hit pose matrix.
     * Indices 4, 5, 6.
     */
    hitNormalValues = [
        matrix[4],
        matrix[5],
        matrix[6]
    ];

    hitViewerText.textContent =
        "Viewer: " +
        (
            hitViewerPosition
                ? formatVector(hitViewerPosition)
                : "waiting..."
        );

    hitLocalText.textContent =
        "Local: " +
        formatVector(hitLocalPosition);

    hitPositionText.textContent =
        "Position: " +
        formatVector(hitLocalPosition);

    hitNormalText.textContent =
        "Normal [4,5,6]: " +
        formatVector(hitNormalValues);

    hitMatrixText.textContent =
        "Matrix 16: " +
        hitMatrixValues
            .map(value => value.toFixed(3))
            .join(", ");
}

// ----------------------------------------------------
// UPDATE RETICLE
// ----------------------------------------------------

function updateReticle(hit, pose) {
    const matrix =
        pose.transform.matrix;

    reticle.matrix.fromArray(matrix);
    reticle.visible = true;

    /*
     * Surface normal:
     * Y-axis column of pose matrix.
     *
     * matrix[4], matrix[5], matrix[6]
     */
    const normal = new THREE.Vector3(
        matrix[4],
        matrix[5],
        matrix[6]
    );

    normal.normalize();

    const worldUp =
        new THREE.Vector3(
            0,
            1,
            0
        );

    const dot = THREE.MathUtils.clamp(
        normal.dot(worldUp),
        -1,
        1
    );

    const angleRadians =
        Math.acos(dot);

    const angleDegrees =
        THREE.MathUtils.radToDeg(
            angleRadians
        );

    currentTiltAngle = angleDegrees;

    surfaceValid =
        angleDegrees <= SURFACE_TOLERANCE;

    if (surfaceValid) {
        reticleMaterial.color.set(
            0x00ff00
        );
    } else {
        reticleMaterial.color.set(
            0xff0000
        );
    }

    updateOverlay();
}

// ----------------------------------------------------
// NO HIT
// ----------------------------------------------------

function noHit() {
    currentHit = null;

    surfaceValid = false;
    currentTiltAngle = null;

    reticle.visible = false;

    /*
     * If the user tapped but tracking/hit
     * was lost, consume the request so
     * a later hit does not unexpectedly
     * place an object.
     */
    if (placeRequested) {
        placeRequested = false;
    }

    updateOverlay();
}

// ----------------------------------------------------
// PLACE TABLE
// ----------------------------------------------------

async function placeTable(hit, pose) {
    if (
        !surfaceValid ||
        !pose
    ) {
        return;
    }

    const table =
        createCoffeeTable();

    /*
     * Keep the hit pose orientation.
     */
    table.matrix.fromArray(
        pose.transform.matrix
    );

    table.matrix.decompose(
        table.position,
        table.quaternion,
        table.scale
    );

    table.matrixAutoUpdate = true;

    scene.add(table);

    const productRecord = {
        group: table,
        anchor: null,
        anchorSpace: null
    };

    /*
     * Anchors are intentionally OFF in
     * this experiment, so this block will
     * not execute.
     */
    if (
        anchorsEnabled &&
        hit &&
        typeof hit.createAnchor === "function"
    ) {
        try {
            const anchor =
                await hit.createAnchor();

            if (anchor) {
                productRecord.anchor =
                    anchor;

                productRecord.anchorSpace =
                    anchor.anchorSpace;
            }
        } catch (error) {
            console.warn(
                "Anchor creation failed. Using fallback placement.",
                error
            );
        }
    }

    placedProducts.push(
        productRecord
    );

    /*
     * Maximum 5 products.
     * The 6th placement removes the oldest.
     */
    if (
        placedProducts.length >
        MAX_PRODUCTS
    ) {
        removeOldestProduct();
    }

    updateOverlay();
}

// ----------------------------------------------------
// CREATE COFFEE TABLE
// ----------------------------------------------------

function createCoffeeTable() {
    const group =
        new THREE.Group();

    /*
     * Origin is at the centre of the base
     * on the floor.
     */

    const woodMaterial =
        new THREE.MeshStandardMaterial({
            color: 0x8b5a2b,
            roughness: 0.65,
            metalness: 0.05
        });

    const darkWoodMaterial =
        new THREE.MeshStandardMaterial({
            color: 0x5c3a21,
            roughness: 0.7,
            metalness: 0.05
        });

    // -----------------------------
    // TABLE TOP
    // -----------------------------

    const topGeometry =
        new THREE.BoxGeometry(
            TABLE_WIDTH,
            TOP_THICKNESS,
            TABLE_DEPTH
        );

    const top =
        new THREE.Mesh(
            topGeometry,
            woodMaterial
        );

    top.position.y =
        TABLE_HEIGHT -
        TOP_THICKNESS / 2;

    group.add(top);

    // -----------------------------
    // LEGS
    // -----------------------------

    const legHeight =
        TABLE_HEIGHT -
        TOP_THICKNESS;

    const legGeometry =
        new THREE.BoxGeometry(
            LEG_SIZE,
            legHeight,
            LEG_SIZE
        );

    const legY =
        legHeight / 2;

    const xOffset =
        TABLE_WIDTH / 2 -
        LEG_SIZE;

    const zOffset =
        TABLE_DEPTH / 2 -
        LEG_SIZE;

    const legPositions = [
        [
            -xOffset,
            legY,
            -zOffset
        ],
        [
            xOffset,
            legY,
            -zOffset
        ],
        [
            -xOffset,
            legY,
            zOffset
        ],
        [
            xOffset,
            legY,
            zOffset
        ]
    ];

    for (
        const position
        of legPositions
    ) {
        const leg =
            new THREE.Mesh(
                legGeometry,
                darkWoodMaterial
            );

        leg.position.set(
            position[0],
            position[1],
            position[2]
        );

        group.add(leg);
    }

    // -----------------------------
    // LOWER SUPPORT
    // -----------------------------

    const supportGeometry =
        new THREE.BoxGeometry(
            TABLE_WIDTH * 0.70,
            0.035,
            0.05
        );

    const support =
        new THREE.Mesh(
            supportGeometry,
            darkWoodMaterial
        );

    support.position.y =
        legHeight * 0.42;

    group.add(support);

    /*
     * Verify approximate model dimensions.
     */
    group.updateMatrixWorld(true);

    const box =
        new THREE.Box3().setFromObject(group);

    const size =
        new THREE.Vector3();

    box.getSize(size);

    console.log(
        "Coffee table size (m):",
        {
            width: size.x.toFixed(3),
            height: size.y.toFixed(3),
            depth: size.z.toFixed(3)
        }
    );

    return group;
}

// ----------------------------------------------------
// UPDATE ANCHORED OBJECTS
// ----------------------------------------------------

function updateAnchoredProducts(frame) {
    if (
        !frame ||
        !localSpace
    ) {
        return;
    }

    for (
        const product
        of placedProducts
    ) {
        if (
            !product.anchor ||
            !product.anchorSpace
        ) {
            continue;
        }

        const anchorPose =
            frame.getPose(
                product.anchorSpace,
                localSpace
            );

        if (!anchorPose) {
            continue;
        }

        product.group.matrix.fromArray(
            anchorPose.transform.matrix
        );

        product.group.matrix.decompose(
            product.group.position,
            product.group.quaternion,
            product.group.scale
        );
    }
}

// ----------------------------------------------------
// REMOVE OLDEST
// ----------------------------------------------------

function removeOldestProduct() {
    if (
        placedProducts.length === 0
    ) {
        return;
    }

    const oldest =
        placedProducts.shift();

    removeProductRecord(oldest);
}

// ----------------------------------------------------
// CLEAR PRODUCTS
// ----------------------------------------------------

function clearProducts() {
    while (
        placedProducts.length > 0
    ) {
        const product =
            placedProducts.pop();

        removeProductRecord(product);
    }

    updateOverlay();
}

// ----------------------------------------------------
// REMOVE PRODUCT RECORD
// ----------------------------------------------------

function removeProductRecord(product) {
    if (!product) {
        return;
    }

    if (product.group) {
        scene.remove(
            product.group
        );

        disposeObject(
            product.group
        );
    }

    if (
        product.anchor &&
        typeof product.anchor.delete === "function"
    ) {
        try {
            product.anchor.delete();
        } catch (error) {
            console.warn(
                "Could not delete anchor:",
                error
            );
        }
    }
}

// ----------------------------------------------------
// DISPOSE OBJECT
// ----------------------------------------------------

function disposeObject(object) {
    object.traverse(child => {
        if (child.geometry) {
            child.geometry.dispose();
        }

        if (child.material) {
            if (
                Array.isArray(
                    child.material
                )
            ) {
                child.material.forEach(
                    material =>
                        material.dispose()
                );
            } else {
                child.material.dispose();
            }
        }
    });
}

// ----------------------------------------------------
// OVERLAY
// ----------------------------------------------------

function updateOverlay() {
    if (!xrSession) {
        anchorStatus.textContent =
            "Anchors: OFF";

        productStatus.textContent =
            `Products: ${placedProducts.length}/${MAX_PRODUCTS}`;

        if (!reticle.visible) {
            reticleStatus.textContent =
                "Reticle: none";

            angleStatus.textContent =
                "Angle: --";
        }

        return;
    }

    /*
     * For this experiment anchors are OFF.
     */
    anchorStatus.textContent =
        "Anchors: OFF";

    productStatus.textContent =
        `Products: ${placedProducts.length}/${MAX_PRODUCTS}`;

    if (!reticle.visible) {
        reticleStatus.textContent =
            "Reticle: none";

        angleStatus.textContent =
            "Angle: --";

        return;
    }

    if (
        currentTiltAngle !== null
    ) {
        angleStatus.textContent =
            `Angle: ${currentTiltAngle.toFixed(1)}°`;
    } else {
        angleStatus.textContent =
            "Angle: --";
    }

    if (surfaceValid) {
        reticleStatus.textContent =
            "Reticle: valid";
    } else {
        reticleStatus.textContent =
            "Reticle: too tilted";
    }
}

// ----------------------------------------------------
// PREVENT XR SELECT ON UI
// ----------------------------------------------------

function preventOverlayPlacement(element) {
    element.addEventListener(
        "beforexrselect",
        event => {
            event.preventDefault();
        }
    );
}

// ----------------------------------------------------
// FORMAT VECTOR
// ----------------------------------------------------

function formatVector(values) {
    if (!values) {
        return "waiting...";
    }

    return (
        "[" +
        values
            .map(value =>
                Number(value).toFixed(3)
            )
            .join(", ") +
        "]"
    );
}

// ----------------------------------------------------
// WINDOW RESIZE
// ----------------------------------------------------

function onWindowResize() {
    camera.aspect =
        window.innerWidth /
        window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );
}