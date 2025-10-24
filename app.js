// Three.js scene setup
let scene, camera, renderer, car, controls;
let orientationScene, orientationCamera, orientationRenderer;
let gridHelper;
let newSnapshotData = null;
let interactionTimeout = null; // Timer for interaction effect
let isInteracting = false; // Track if we're currently showing the interaction effect
let currentModelUrl = 'assets/Turkey.gltf'; // Track the currently loaded model

// Canvas thumbnail state
let thumbnailCanvas = null;
let thumbnailCtx = null;
let thumbnailImage = null;
let thumbnailOffset = { x: 0, y: 0 };
let thumbnailDragging = false;
let thumbnailDragStart = { x: 0, y: 0 };
let thumbnailScale = 1.0; // Scale factor for thumbnail preview
let guidesImage = null;
let showThumbnailGuides = true; // Track whether to show guides in thumbnail
let isLiveUpdating = false; // Don't start updating until user interacts
let lastThumbnailUpdate = 0; // Track last update time for throttling
const THUMBNAIL_UPDATE_INTERVAL = 100; // Update thumbnail every 100ms (10 times per second)
let hasUserInteracted = false; // Track if user has interacted with 3D canvas
let thumbnailInteractionTimeout = null; // Timer for thumbnail interaction effect
let isThumbnailInteracting = false; // Track if we're currently showing the thumbnail interaction effect

// Initialize the 3D viewer
function init() {
    const container = document.getElementById('viewer-container');
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121212);
    
    // Create camera with 1:1 aspect ratio for square canvas
    camera = new THREE.PerspectiveCamera(
        60,
        1, // Always 1:1 aspect ratio for square canvas
        0.01,
        1000
    );
    camera.position.set(0, 2, 5);
    
    // Create renderer with alpha support for transparent screenshots
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        preserveDrawingBuffer: true, 
        alpha: true
    });
    
    // Fixed 1200x1200 square canvas
    renderer.setSize(1200, 1200);
    renderer.setClearColor(0x121212, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Standard glTF viewer settings (matching three-gltf-viewer)
    renderer.physicallyCorrectLights = true; // punctualLights enabled
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // ACES Filmic tone mapping (standard)
    renderer.toneMappingExposure = 1.0; // exposure: 1.0 (default)
    renderer.outputEncoding = THREE.sRGBEncoding;
    
    container.appendChild(renderer.domElement);
    
    // Lighting setup matching three-gltf-viewer Neutral environment
    // Ambient light with intensity 0.3
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);
    
    // Directional light with intensity 2.5
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);
    
    // Create grid plane
    createGridPlane();
    
    // Create a simple car model
    createCarModel();
    
    // Create orientation indicator
    createOrientationIndicator();
    
    // OrbitControls setup (three-gltf-viewer standard)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = false;
    controls.minDistance = 2;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI / 2;
    
    // Add interaction handlers for visual feedback
    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('end', onControlsEnd);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation loop
    animate();
}

// Load a specific model by URL
function loadModel(modelUrl) {
    currentModelUrl = modelUrl;
    
    // Show loading indicator
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }
    
    // Clear the thumbnail preview
    clearThumbnailPreview();
    
    // Reset camera position and controls target to center the new model
    if (camera && controls) {
        camera.position.set(0, 2, 5);
        controls.target.set(0, 0, 0);
        controls.update();
    }
    
    const loader = new THREE.GLTFLoader();
    const modelConfig = {
        url: modelUrl,
        scale: 1.0,
        position: { x: 0, y: 0, z: 0 }
    };
    
    console.log(`Loading model: ${modelConfig.url}`);
    
    loader.load(
        modelConfig.url,
        function (gltf) {
            console.log('Model loaded successfully!');
            
            // Hide loading indicator
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            // Clear any existing models
            while(car.children.length > 0) {
                car.remove(car.children[0]);
            }
            
            car.add(gltf.scene);
            
            // Compute bounding box for the entire model
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            console.log('Model bounds:', { center, size });
            
            // Center the model on X and Z axes, but keep it on the ground (Y=0)
            gltf.scene.position.x = -center.x;
            gltf.scene.position.y = -box.min.y; // Position so bottom of model is at Y=0
            gltf.scene.position.z = -center.z;
            
            // Calculate scale to fit model within a reasonable size (target max dimension of 4 units)
            const maxDimension = Math.max(size.x, size.y, size.z);
            const targetSize = 4; // Target maximum dimension
            const autoScale = maxDimension > targetSize ? targetSize / maxDimension : 1;
            
            console.log('Auto-scale factor:', autoScale);
            
            // Apply scale to the parent group
            car.scale.set(autoScale * modelConfig.scale, autoScale * modelConfig.scale, autoScale * modelConfig.scale);
            
            // Enable shadows and fix texture encoding
            gltf.scene.traverse(function (node) {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    
                    // Fix texture encoding for proper color display
                    if (node.material) {
                        if (node.material.map) {
                            node.material.map.encoding = THREE.sRGBEncoding;
                        }
                        if (node.material.emissiveMap) {
                            node.material.emissiveMap.encoding = THREE.sRGBEncoding;
                        }
                        // Update the material to reflect changes
                        node.material.needsUpdate = true;
                    }
                }
            });
            
            // Start live updating as soon as model loads
            enableLiveUpdating();
            
            // Force immediate thumbnail update after render
            setTimeout(() => {
                console.log('Forcing initial thumbnail update...');
                lastThumbnailUpdate = 0; // Reset throttle
                updateThumbnailFromViewport();
            }, 200);
        },
        function (xhr) {
            const percent = xhr.total > 0 ? (xhr.loaded / xhr.total * 100) : 0;
            console.log(percent.toFixed(2) + '% loaded');
        },
        function (error) {
            console.log(`Error loading model: ${error.message || error}`);
            console.log('Using fallback model');
            createEnhancedCarModel();
        }
    );
}

// Create a high-quality car model
function createCarModel() {
    car = new THREE.Group();
    scene.add(car);
    
    // Load the initial model
    loadModel(currentModelUrl);
}

// Create grid plane - matching three-gltf-viewer implementation
function createGridPlane() {
    const size = 20;
    const divisions = 10; // Reduced from 20 for wider subdivisions
    
    gridHelper = new THREE.GridHelper(size, divisions, 0x4a4a4a, 0x2a2a2a);
    gridHelper.position.set(0, -0.05, 0);
    
    // Configure material to prevent z-fighting (from three-gltf-viewer)
    gridHelper.material.depthWrite = false;
    gridHelper.material.depthTest = true;
    // Use polygon offset to push grid significantly back in depth buffer
    gridHelper.material.polygonOffset = true;
    gridHelper.material.polygonOffsetFactor = 2.0;
    gridHelper.material.polygonOffsetUnits = 4.0;
    gridHelper.material.opacity = 0.25;
    gridHelper.material.transparent = true;
    gridHelper.renderOrder = -1000; // Render before other objects
    
    scene.add(gridHelper);
}

// Create orientation indicator in corner
function createOrientationIndicator() {
    const container = document.getElementById('viewer-container');
    
    // Create separate scene for orientation
    orientationScene = new THREE.Scene();
    
    // Create camera for orientation view
    orientationCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    orientationCamera.position.set(0, 0, 3);
    
    // Create renderer for orientation
    orientationRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    orientationRenderer.setSize(120, 120);
    orientationRenderer.setClearColor(0x000000, 0);
    orientationRenderer.domElement.id = 'orientation-indicator';
    container.appendChild(orientationRenderer.domElement);
    
    // Add axes helper to orientation scene
    const axesHelper = new THREE.AxesHelper(1);
    orientationScene.add(axesHelper);
}

// Enhanced fallback car model with more detail
function createEnhancedCarModel() {
    // Hide loading indicator
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
    
    // Clear any existing car parts
    while(car.children.length > 0) {
        car.remove(car.children[0]);
    }
    
    // Create a sub-group for the car so we can center it properly
    const carGroup = new THREE.Group();
    
    // Main body (lower section) - Ice cream truck style with white/cream color
    const bodyGeometry = new THREE.BoxGeometry(4, 0.8, 2);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xf0e8d8, // Cream/off-white color
        metalness: 0.3,
        roughness: 0.6
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    body.castShadow = true;
    carGroup.add(body);
    
    // Hood (front sloped section)
    const hoodGeometry = new THREE.BoxGeometry(1.5, 0.4, 1.9);
    const hood = new THREE.Mesh(hoodGeometry, bodyMaterial);
    hood.position.set(2, 0.8, 0);
    hood.rotation.z = -0.1;
    hood.castShadow = true;
    carGroup.add(hood);
    
    // Car cabin (roof section) - Ice cream truck with pink/pastel color
    const cabinGeometry = new THREE.BoxGeometry(2.2, 0.9, 1.7);
    const cabinMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffb3d9, // Pink pastel color typical of ice cream trucks
        metalness: 0.3,
        roughness: 0.6
    });
    const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
    cabin.position.set(-0.3, 1.45, 0);
    cabin.castShadow = true;
    carGroup.add(cabin);
    
    // Front windshield
    const windshieldGeometry = new THREE.BoxGeometry(0.1, 0.7, 1.7);
    const windowMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x111111, 
        transparent: true, 
        opacity: 0.6,
        metalness: 0.9,
        roughness: 0.1
    });
    const windshield = new THREE.Mesh(windshieldGeometry, windowMaterial);
    windshield.position.set(0.8, 1.5, 0);
    windshield.rotation.z = 0.3;
    carGroup.add(windshield);
    
    // Rear windshield
    const rearWindshield = new THREE.Mesh(windshieldGeometry, windowMaterial);
    rearWindshield.position.set(-1.4, 1.5, 0);
    rearWindshield.rotation.z = -0.3;
    carGroup.add(rearWindshield);
    
    // Side windows
    const sideWindowGeometry = new THREE.BoxGeometry(2.2, 0.6, 0.1);
    const leftWindow = new THREE.Mesh(sideWindowGeometry, windowMaterial);
    leftWindow.position.set(-0.3, 1.55, 0.85);
    carGroup.add(leftWindow);
    
    const rightWindow = new THREE.Mesh(sideWindowGeometry, windowMaterial);
    rightWindow.position.set(-0.3, 1.55, -0.85);
    carGroup.add(rightWindow);
    
    // Wheels with better detail
    const wheelGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 32);
    const wheelMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        metalness: 0.8,
        roughness: 0.2
    });
    
    // Hubcaps
    const hubcapGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.36, 32);
    const hubcapMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x888888,
        metalness: 0.9,
        roughness: 0.1
    });
    
    const wheelPositions = [
        { x: 1.5, y: 0.45, z: 1.15 },
        { x: 1.5, y: 0.45, z: -1.15 },
        { x: -1.5, y: 0.45, z: 1.15 },
        { x: -1.5, y: 0.45, z: -1.15 }
    ];
    
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.castShadow = true;
        carGroup.add(wheel);
        
        const hubcap = new THREE.Mesh(hubcapGeometry, hubcapMaterial);
        hubcap.rotation.z = Math.PI / 2;
        hubcap.position.set(pos.x, pos.y, pos.z > 0 ? pos.z + 0.01 : pos.z - 0.01);
        carGroup.add(hubcap);
    });
    
    // Headlights
    const headlightGeometry = new THREE.BoxGeometry(0.3, 0.25, 0.6);
    const headlightMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffaa,
        emissive: 0xffff88,
        emissiveIntensity: 0.5
    });
    
    const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    leftHeadlight.position.set(2.7, 0.7, 0.7);
    carGroup.add(leftHeadlight);
    
    const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    rightHeadlight.position.set(2.7, 0.7, -0.7);
    carGroup.add(rightHeadlight);
    
    // Taillights
    const taillightMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xff0000,
        emissive: 0xaa0000,
        emissiveIntensity: 0.5
    });
    
    const leftTaillight = new THREE.Mesh(headlightGeometry, taillightMaterial);
    leftTaillight.position.set(-2.7, 0.7, 0.7);
    carGroup.add(leftTaillight);
    
    const rightTaillight = new THREE.Mesh(headlightGeometry, taillightMaterial);
    rightTaillight.position.set(-2.7, 0.7, -0.7);
    carGroup.add(rightTaillight);
    
    // Bumpers
    const bumperGeometry = new THREE.BoxGeometry(0.2, 0.15, 2.1);
    const bumperMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        metalness: 0.6,
        roughness: 0.4
    });
    
    const frontBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
    frontBumper.position.set(2.8, 0.3, 0);
    carGroup.add(frontBumper);
    
    const rearBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
    rearBumper.position.set(-2.8, 0.3, 0);
    carGroup.add(rearBumper);
    
    // Side mirrors
    const mirrorGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.25);
    const mirrorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xf0e8d8, // Match body color
        metalness: 0.3,
        roughness: 0.6
    });
    
    const leftMirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
    leftMirror.position.set(0.5, 1.3, 1.1);
    carGroup.add(leftMirror);
    
    const rightMirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
    rightMirror.position.set(0.5, 1.3, -1.1);
    carGroup.add(rightMirror);
    
    // Add ice cream cone decoration on top of truck
    const coneGeometry = new THREE.ConeGeometry(0.25, 0.6, 16);
    const coneMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xe8b888, // Waffle cone color
        metalness: 0.1,
        roughness: 0.8
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(-0.5, 2.5, 0);
    cone.rotation.x = Math.PI; // Flip upside down to make cone point down
    carGroup.add(cone);
    
    // Ice cream scoop on top
    const scoopGeometry = new THREE.SphereGeometry(0.35, 16, 16);
    const scoopMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffd1dc, // Strawberry ice cream pink
        metalness: 0.2,
        roughness: 0.7
    });
    const scoop = new THREE.Mesh(scoopGeometry, scoopMaterial);
    scoop.position.set(-0.5, 2.9, 0);
    carGroup.add(scoop);
    
    // Add the car group to the main car container
    car.add(carGroup);
    
    // Center the car on X and Z axes, keep it on the ground
    const box = new THREE.Box3().setFromObject(carGroup);
    const center = box.getCenter(new THREE.Vector3());
    
    carGroup.position.x = -center.x;
    carGroup.position.y = -box.min.y; // Position so bottom is at Y=0
    carGroup.position.z = -center.z;
    
    console.log('Fallback model centered:', { center, position: carGroup.position });
    
    // Start live updating as soon as fallback model loads
    enableLiveUpdating();
    
    // Force immediate thumbnail update after render
    setTimeout(() => {
        console.log('Forcing initial thumbnail update (fallback)...');
        lastThumbnailUpdate = 0; // Reset throttle
        updateThumbnailFromViewport();
    }, 200);
}

// Enable live updating (starts when model loads or on user interaction)
function enableLiveUpdating() {
    if (!isLiveUpdating) {
        hasUserInteracted = true;
        isLiveUpdating = true;
    }
}

// Show update thumbnail button when view changes
function showUpdateButton() {
    const btn = document.getElementById('use-snapshot');
    if (btn && thumbnailImage) {
        btn.style.display = 'block';
    }
}

// Controls interaction handlers
function onControlsStart() {
    enableLiveUpdating();
    showUpdateButton();
    
    // Clear any existing timeout to prevent conflicts
    if (interactionTimeout) {
        clearTimeout(interactionTimeout);
        interactionTimeout = null;
    }
    
    // Add interacting class for visual feedback
    if (!isInteracting) {
        const container = document.getElementById('viewer-container');
        if (container) {
            container.classList.add('interacting');
            isInteracting = true;
        }
        
        // Cascade to thumbnail preview
        const thumbnailContainer = document.getElementById('new-thumbnail');
        if (thumbnailContainer && !isThumbnailInteracting) {
            thumbnailContainer.classList.add('interacting');
            isThumbnailInteracting = true;
        }
    }
}

function onControlsEnd() {
    // Clear any existing timeout to prevent conflicts
    if (interactionTimeout) {
        clearTimeout(interactionTimeout);
        interactionTimeout = null;
    }
    
    // Remove interacting class
    if (isInteracting) {
        const container = document.getElementById('viewer-container');
        if (container) {
            container.classList.remove('interacting');
            isInteracting = false;
        }
        
        // Cascade to thumbnail preview (only if not being directly interacted with)
        const thumbnailContainer = document.getElementById('new-thumbnail');
        if (thumbnailContainer && isThumbnailInteracting && !thumbnailDragging) {
            thumbnailContainer.classList.remove('interacting');
            isThumbnailInteracting = false;
        }
    }
}

function onWindowResize() {
    // Fixed size canvas - no resizing
    camera.aspect = 1; // Always maintain 1:1 aspect ratio
    camera.updateProjectionMatrix();
}

// Update thumbnail with current 3D view
function updateThumbnailFromViewport() {
    if (!isLiveUpdating || !thumbnailCanvas || !thumbnailCtx) {
        console.log('updateThumbnailFromViewport blocked:', { isLiveUpdating, hasCanvas: !!thumbnailCanvas, hasCtx: !!thumbnailCtx });
        return;
    }
    
    // Throttle updates to avoid performance issues
    const now = Date.now();
    if (now - lastThumbnailUpdate < THUMBNAIL_UPDATE_INTERVAL) {
        // console.log('Throttled'); // Uncomment for debugging
        return;
    }
    lastThumbnailUpdate = now;
    console.log('Capturing viewport snapshot...');
    
    // Temporarily set background to transparent for the snapshot
    const originalBackground = scene.background;
    scene.background = null;
    
    // Hide grid during snapshot
    const gridWasVisible = gridHelper ? gridHelper.visible : false;
    if (gridHelper) {
        gridHelper.visible = false;
    }
    
    // Clear with transparency and render the scene
    renderer.setClearColor(0x000000, 0); // Transparent clear color
    renderer.render(scene, camera);
    
    // Capture the canvas as an image (PNG with transparency)
    const imageData = renderer.domElement.toDataURL('image/png');
    
    // Restore the original background and clear color
    scene.background = originalBackground;
    renderer.setClearColor(0x121212, 1);
    
    // Restore grid visibility
    if (gridHelper) {
        gridHelper.visible = gridWasVisible;
    }
    
    // Store the snapshot data
    newSnapshotData = imageData;
    
    // Load image and update display (preserve offset!)
    thumbnailImage = new Image();
    thumbnailImage.onload = () => {
        console.log('Thumbnail image loaded, rendering...');
        // Show canvas on first update
        showThumbnailCanvas();
        
        // DO NOT reset offset - preserve manual positioning
        // Just re-render with the new image and existing offset
        renderThumbnail();
    };
    thumbnailImage.src = imageData;
    console.log('Thumbnail image loading...');
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls (for damping)
    if (controls) {
        controls.update();
    }
    
    // Update orientation indicator to match main camera
    if (orientationCamera) {
        orientationCamera.position.copy(camera.position).normalize().multiplyScalar(3);
        orientationCamera.lookAt(0, 0, 0);
        orientationRenderer.render(orientationScene, orientationCamera);
    }
    
    renderer.render(scene, camera);
    
    // Update thumbnail preview if live updating is enabled
    updateThumbnailFromViewport();
}

// Button controls
document.getElementById('zoom-in').addEventListener('click', () => {
    enableLiveUpdating();
    showUpdateButton();
    if (controls) {
        controls.dollyIn(1.2);
        controls.update();
    }
});

document.getElementById('zoom-out').addEventListener('click', () => {
    enableLiveUpdating();
    showUpdateButton();
    if (controls) {
        controls.dollyOut(1.2);
        controls.update();
    }
});

document.getElementById('reset-view').addEventListener('click', () => {
    if (controls) {
        // Reset camera to initial position
        camera.position.set(0, 2, 5);
        controls.target.set(0, 0, 0);
        controls.update();
    }
    
    // Clear the modified canvas state and preview
    clearThumbnailPreview();
});

// Grid toggle functionality
document.getElementById('toggle-grid').addEventListener('click', () => {
    if (gridHelper) {
        gridHelper.visible = !gridHelper.visible;
        showThumbnailGuides = gridHelper.visible; // Sync thumbnail guides with grid visibility
        
        const btn = document.getElementById('toggle-grid');
        btn.textContent = gridHelper.visible ? '⊞' : '⊟';
        
        // Toggle active class for visual feedback
        if (gridHelper.visible) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
        
        // Re-render thumbnail if it's currently visible
        if (thumbnailCanvas && thumbnailCanvas.classList.contains('active') && thumbnailImage) {
            renderThumbnail();
        }
    }
});

// Initialize thumbnail canvas
function initThumbnailCanvas() {
    console.log('initThumbnailCanvas called');
    thumbnailCanvas = document.getElementById('thumbnail-canvas');
    console.log('Found canvas element:', !!thumbnailCanvas);
    
    if (!thumbnailCanvas) {
        console.error('Thumbnail canvas not found!');
        return;
    }
    
    thumbnailCtx = thumbnailCanvas.getContext('2d');
    console.log('Got 2D context:', !!thumbnailCtx);
    
    // Draw initial background
    thumbnailCtx.fillStyle = '#121212';
    thumbnailCtx.fillRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    console.log('Drew initial background');
    
    // Load guides image
    guidesImage = new Image();
    guidesImage.src = 'Guides.png';
    guidesImage.onload = () => {
        console.log('Guides image loaded');
        // Draw guides once loaded
        thumbnailCtx.globalAlpha = 0.3;
        thumbnailCtx.drawImage(guidesImage, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
        thumbnailCtx.globalAlpha = 1.0;
    };
    
    // Add event listeners for dragging
    thumbnailCanvas.addEventListener('mousedown', onThumbnailMouseDown);
    thumbnailCanvas.addEventListener('mousemove', onThumbnailMouseMove);
    thumbnailCanvas.addEventListener('mouseup', onThumbnailMouseUp);
    thumbnailCanvas.addEventListener('mouseleave', onThumbnailMouseUp);
    
    // Add event listener for resizing with mouse wheel
    thumbnailCanvas.addEventListener('wheel', onThumbnailWheel);
    console.log('Thumbnail canvas initialized');
}

// Render thumbnail to canvas
function renderThumbnail(includeGrid = null, includeBackground = true) {
    if (!thumbnailCanvas || !thumbnailCtx || !thumbnailImage) return;
    
    // Use showThumbnailGuides if includeGrid is not explicitly provided
    const shouldShowGrid = includeGrid !== null ? includeGrid : showThumbnailGuides;
    
    // Clear canvas
    thumbnailCtx.clearRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    
    // Fill with background color only if includeBackground is true
    if (includeBackground) {
        thumbnailCtx.fillStyle = '#121212';
        thumbnailCtx.fillRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    }
    
	// Draw guides background image at 30% opacity - only if shouldShowGrid is true
	if (shouldShowGrid && guidesImage && guidesImage.complete) {
		thumbnailCtx.globalAlpha = 0.3;
		thumbnailCtx.drawImage(guidesImage, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
		thumbnailCtx.globalAlpha = 1.0; // Reset to full opacity
	}
    
    // Draw image with current offset and scale
    const baseScale = Math.min(thumbnailCanvas.width / thumbnailImage.width, thumbnailCanvas.height / thumbnailImage.height);
    const scaledWidth = thumbnailImage.width * baseScale * thumbnailScale;
    const scaledHeight = thumbnailImage.height * baseScale * thumbnailScale;
    
    // Center the image by default, then apply offset
    const centerX = (thumbnailCanvas.width - scaledWidth) / 2;
    const centerY = (thumbnailCanvas.height - scaledHeight) / 2;
    
    thumbnailCtx.drawImage(
        thumbnailImage,
        centerX + thumbnailOffset.x,
        centerY + thumbnailOffset.y,
        scaledWidth,
        scaledHeight
    );
}

// Thumbnail canvas mouse handlers
function onThumbnailMouseDown(event) {
    showUpdateButton();
    thumbnailDragging = true;
    const rect = thumbnailCanvas.getBoundingClientRect();
    // Scale factor to convert display coordinates to canvas coordinates
    const scaleX = thumbnailCanvas.width / rect.width;
    const scaleY = thumbnailCanvas.height / rect.height;
    
    thumbnailDragStart = {
        x: (event.clientX - rect.left) * scaleX - thumbnailOffset.x,
        y: (event.clientY - rect.top) * scaleY - thumbnailOffset.y
    };
    
    // Clear any existing timeout to prevent conflicts
    if (thumbnailInteractionTimeout) {
        clearTimeout(thumbnailInteractionTimeout);
        thumbnailInteractionTimeout = null;
    }
    
    // Add interacting class for visual feedback (only if not already interacting)
    if (!isThumbnailInteracting) {
        const container = document.getElementById('new-thumbnail');
        if (container) {
            container.classList.add('interacting');
            isThumbnailInteracting = true;
        }
    }
}

function onThumbnailMouseMove(event) {
    if (!thumbnailDragging) return;
    
    const rect = thumbnailCanvas.getBoundingClientRect();
    // Scale factor to convert display coordinates to canvas coordinates
    const scaleX = thumbnailCanvas.width / rect.width;
    const scaleY = thumbnailCanvas.height / rect.height;
    
    thumbnailOffset.x = (event.clientX - rect.left) * scaleX - thumbnailDragStart.x;
    thumbnailOffset.y = (event.clientY - rect.top) * scaleY - thumbnailDragStart.y;
    
    renderThumbnail();
}

function onThumbnailMouseUp() {
    thumbnailDragging = false;
    
    // Clear any existing timeout to prevent conflicts
    if (thumbnailInteractionTimeout) {
        clearTimeout(thumbnailInteractionTimeout);
        thumbnailInteractionTimeout = null;
    }
    
    // Remove interacting class (only if currently interacting)
    if (isThumbnailInteracting) {
        const container = document.getElementById('new-thumbnail');
        if (container) {
            container.classList.remove('interacting');
            isThumbnailInteracting = false;
        }
    }
}

// Thumbnail canvas wheel handler for resizing
function onThumbnailWheel(event) {
    event.preventDefault();
    showUpdateButton();
    
    const scaleSpeed = 0.025;
    
    // Adjust scale based on wheel direction
    if (event.deltaY < 0) {
        // Scroll up = zoom in (increase scale)
        thumbnailScale = Math.min(3.0, thumbnailScale + scaleSpeed);
    } else {
        // Scroll down = zoom out (decrease scale)
        thumbnailScale = Math.max(0.3, thumbnailScale - scaleSpeed);
    }
    
    renderThumbnail();
    
    // Add interacting class for wheel events (only if not already interacting)
    const container = document.getElementById('new-thumbnail');
    if (container && !isThumbnailInteracting) {
        container.classList.add('interacting');
        isThumbnailInteracting = true;
    }
    
    // Clear any existing timeout
    if (thumbnailInteractionTimeout) {
        clearTimeout(thumbnailInteractionTimeout);
    }
    
    // Remove class after a short delay when wheel stops
    thumbnailInteractionTimeout = setTimeout(() => {
        if (container && isThumbnailInteracting) {
            container.classList.remove('interacting');
            isThumbnailInteracting = false;
        }
    }, 200);
}

// Show thumbnail canvas (canvas is visible from start)
function showThumbnailCanvas() {
    // Canvas is already active from start, just show the update button
    const btn = document.getElementById('use-snapshot');
    if (btn && thumbnailImage) {
        btn.style.display = 'block';
    }
}

// Clear the modified canvas state and preview
function clearThumbnailPreview() {
    // Reset state variables
    thumbnailOffset = { x: 0, y: 0 };
    thumbnailScale = 1.0;
    
    // Hide update button
    const updateBtn = document.getElementById('use-snapshot');
    if (updateBtn) {
        updateBtn.style.display = 'none';
    }
    
    // Hide current thumbnail image and download button
    const currentThumbnailDiv = document.getElementById('current-thumbnail');
    if (currentThumbnailDiv) {
        const img = currentThumbnailDiv.querySelector('img');
        if (img) {
            img.style.display = 'none';
            img.src = '';
        }
    }
    
    const downloadBtn = document.getElementById('download-thumbnail');
    if (downloadBtn) {
        downloadBtn.style.display = 'none';
        downloadBtn.dataset.imageData = '';
    }
    
    // Keep live updating active - thumbnail canvas continues showing live view
}

document.getElementById('use-snapshot').addEventListener('click', () => {
    if (newSnapshotData && thumbnailCanvas && thumbnailCtx) {
        // Hide the button until view changes
        const btn = document.getElementById('use-snapshot');
        if (btn) {
            btn.style.display = 'none';
        }
        
        // Render without grid and without background for transparent export
        renderThumbnail(false, false);
        
        // Create a final composited image from the canvas with positioning applied (transparent background)
        const finalImageData = thumbnailCanvas.toDataURL('image/png');
        
        const currentThumbnailDiv = document.getElementById('current-thumbnail');
        
        // Show loading state immediately
        currentThumbnailDiv.classList.add('loading');
        
        // After 0.5 seconds, update the thumbnail
        setTimeout(() => {
            // Update only the image source, leave the label as-is
            const img = currentThumbnailDiv.querySelector('img');
            if (img) {
                img.src = finalImageData;
                img.style.display = 'block'; // Make the image visible
            }
            
            // Show download button
            const downloadBtn = document.getElementById('download-thumbnail');
            if (downloadBtn) {
                downloadBtn.style.display = 'flex';
                // Store the image data for download
                downloadBtn.dataset.imageData = finalImageData;
                console.log('Download button should now be visible');
            } else {
                console.error('Download button not found!');
            }
            
            // Start fading out the loading background immediately after image appears
            setTimeout(() => {
                currentThumbnailDiv.classList.remove('loading');
            }, 10);
        }, 500);
        
        // Re-render with guides and background to continue editing
        renderThumbnail();
        
        // Keep preview active - don't clear state
        // User can continue to reposition and update again
    }
});

// Cancel button and download button functionality
document.addEventListener('DOMContentLoaded', () => {
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (controls) {
                // Reset camera to initial position
                camera.position.set(0, 2, 5);
                controls.target.set(0, 0, 0);
                controls.update();
            }
            
            // Clear the modified canvas state and preview
            clearThumbnailPreview();
        });
    }
    
    // Download thumbnail button functionality
    const downloadBtn = document.getElementById('download-thumbnail');
    if (downloadBtn) {
        console.log('Download button found and event listener attached');
        downloadBtn.addEventListener('click', () => {
            const imageData = downloadBtn.dataset.imageData;
            console.log('Download button clicked, imageData exists:', !!imageData);
            
            if (imageData) {
                // Create a temporary link element to trigger download
                const link = document.createElement('a');
                link.href = imageData;
                
                // Generate filename with timestamp
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                link.download = `thumbnail-${timestamp}.png`;
                
                // Trigger download
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                console.log('Download initiated');
            }
        });
    } else {
        console.error('Download button not found during initialization!');
    }
});

// Initialize when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    init();
    initThumbnailCanvas();
    
    console.log('Initialization complete. Canvas:', !!thumbnailCanvas, 'Context:', !!thumbnailCtx);
    
    // Enable live updating immediately (don't wait for model to load)
    isLiveUpdating = true;
    hasUserInteracted = true;
    console.log('Live updating enabled on page load');
    
    // Force an immediate update after a short delay to let everything settle
    setTimeout(() => {
        console.log('Forcing update after init. isLiveUpdating:', isLiveUpdating, 'Canvas:', !!thumbnailCanvas, 'Ctx:', !!thumbnailCtx);
        lastThumbnailUpdate = 0;
        updateThumbnailFromViewport();
    }, 500);
    
    // Set initial active state for grid button (grid starts visible)
    const gridBtn = document.getElementById('toggle-grid');
    if (gridBtn) {
        gridBtn.classList.add('active');
    }
    
    // Add event listener for model selector
    const modelSelector = document.getElementById('model-selector');
    if (modelSelector) {
        modelSelector.addEventListener('change', (event) => {
            const selectedModel = event.target.value;
            console.log('Model changed to:', selectedModel);
            loadModel(selectedModel);
        });
    }
});

