// Three.js scene setup
let scene, camera, renderer, car;
let orientationScene, orientationCamera, orientationRenderer;
let gridHelper;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let cameraPosition = { x: 5, y: 3, z: 8 };
let targetRotation = { x: 0, y: 0 };
let currentRotation = { x: 0, y: 0 };
let newSnapshotData = null;

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

// Initialize the 3D viewer
function init() {
    const container = document.getElementById('viewer-container');
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121212);
    
    // Create camera with 1:1 aspect ratio for square canvas
    camera = new THREE.PerspectiveCamera(
        45,
        1, // Always 1:1 aspect ratio for square canvas
        0.1,
        1000
    );
    camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    camera.lookAt(0, 0, 0);
    
    // Create renderer with alpha support for transparent screenshots
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    
    // Fixed 600x600 square canvas
    renderer.setSize(600, 600);
    renderer.setClearColor(0x121212, 1); // Set default clear color to match background
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-5, 5, -5);
    scene.add(directionalLight2);
    
    // Add rim light for better visibility in dark mode
    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.4);
    rimLight.position.set(0, 3, -10);
    scene.add(rimLight);
    
    // Create grid plane
    createGridPlane();
    
    // Create a simple car model
    createCarModel();
    
    // Create orientation indicator
    createOrientationIndicator();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Mouse controls for rotation
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseUp);
    
    // Mouse wheel for zoom
    container.addEventListener('wheel', onMouseWheel);
    
    // Start animation loop
    animate();
}

// Create a high-quality car model
function createCarModel() {
    car = new THREE.Group();
    
    // Try to load a GLTF model, fallback to enhanced procedural model
    const loader = new THREE.GLTFLoader();
    
    // List of ice cream truck model URLs to try (in order of preference)
    const modelUrls = [
        {
            url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb',
            scale: 0.5,
            position: { x: 0, y: 0, z: 0 }
        },
        {
            url: 'https://models.readyplayer.me/64e1c0e5e4b0a9c8f8e5a1d2.glb',
            scale: 2,
            position: { x: 0, y: 0, z: 0 }
        }
    ];
    
    let currentModelIndex = 0;
    
    function tryLoadModel() {
        if (currentModelIndex >= modelUrls.length) {
            console.log('All model URLs failed, using enhanced fallback');
            createEnhancedCarModel();
            return;
        }
        
        const modelConfig = modelUrls[currentModelIndex];
        console.log(`Attempting to load model ${currentModelIndex + 1}/${modelUrls.length}: ${modelConfig.url}`);
        
        loader.load(
            modelConfig.url,
            function (gltf) {
                console.log('Model loaded successfully!');
                
                // Hide loading indicator
                const loadingIndicator = document.getElementById('loading-indicator');
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
                
                // Clear any existing models
                while(car.children.length > 0) {
                    car.remove(car.children[0]);
                }
                
                car.add(gltf.scene);
                car.scale.set(modelConfig.scale, modelConfig.scale, modelConfig.scale);
                
                // Compute bounding box for the entire model to center it
                const box = new THREE.Box3().setFromObject(gltf.scene);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                
                console.log('Model bounds:', { center, size });
                
                // Center the model on X and Z axes, but keep it on the ground (Y=0)
                gltf.scene.position.x = -center.x;
                gltf.scene.position.y = -box.min.y; // Position so bottom of model is at Y=0
                gltf.scene.position.z = -center.z;
                
                // Enable shadows
                gltf.scene.traverse(function (node) {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });
            },
            function (xhr) {
                const percent = xhr.total > 0 ? (xhr.loaded / xhr.total * 100) : 0;
                console.log(percent.toFixed(2) + '% loaded');
            },
            function (error) {
                console.log(`Error loading model ${currentModelIndex + 1}: ${error.message || error}`);
                currentModelIndex++;
                tryLoadModel();
            }
        );
    }
    
    tryLoadModel();
    scene.add(car);
}

// Create grid plane
function createGridPlane() {
    const size = 20;
    const divisions = 20;
    gridHelper = new THREE.GridHelper(size, divisions, 0x4a4a4a, 0x2a2a2a);
    gridHelper.position.y = 0;
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
}

// Enable live updating on first user interaction
function enableLiveUpdating() {
    if (!hasUserInteracted) {
        hasUserInteracted = true;
        isLiveUpdating = true;
    }
}

// Mouse event handlers
function onMouseDown(event) {
    enableLiveUpdating();
    isDragging = true;
    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
}

function onMouseMove(event) {
    if (isDragging) {
        const deltaX = event.clientX - previousMousePosition.x;
        const deltaY = event.clientY - previousMousePosition.y;
        
        targetRotation.y += deltaX * 0.01;
        targetRotation.x += deltaY * 0.01;
        
        // Clamp vertical rotation
        targetRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotation.x));
        
        previousMousePosition = {
            x: event.clientX,
            y: event.clientY
        };
    }
}

function onMouseUp() {
    isDragging = false;
}

function onMouseWheel(event) {
    event.preventDefault();
    enableLiveUpdating();
    const zoomSpeed = 0.1;
    const distance = Math.sqrt(
        cameraPosition.x ** 2 + 
        cameraPosition.y ** 2 + 
        cameraPosition.z ** 2
    );
    
    const newDistance = Math.max(3, Math.min(20, distance + (event.deltaY > 0 ? zoomSpeed : -zoomSpeed)));
    const scale = newDistance / distance;
    
    cameraPosition.x *= scale;
    cameraPosition.y *= scale;
    cameraPosition.z *= scale;
}

function onWindowResize() {
    // Fixed size canvas - no resizing
    camera.aspect = 1; // Always maintain 1:1 aspect ratio
    camera.updateProjectionMatrix();
}

// Update thumbnail with current 3D view
function updateThumbnailFromViewport() {
    if (!isLiveUpdating || !thumbnailCanvas || !thumbnailCtx) return;
    
    // Throttle updates to avoid performance issues
    const now = Date.now();
    if (now - lastThumbnailUpdate < THUMBNAIL_UPDATE_INTERVAL) return;
    lastThumbnailUpdate = now;
    
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
        // Show canvas on first update
        showThumbnailCanvas();
        
        // DO NOT reset offset - preserve manual positioning
        // Just re-render with the new image and existing offset
        renderThumbnail();
    };
    thumbnailImage.src = imageData;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Smooth rotation interpolation
    currentRotation.x += (targetRotation.x - currentRotation.x) * 0.1;
    currentRotation.y += (targetRotation.y - currentRotation.y) * 0.1;
    
    // Update camera position based on rotation
    const distance = Math.sqrt(
        cameraPosition.x ** 2 + 
        cameraPosition.y ** 2 + 
        cameraPosition.z ** 2
    );
    
    camera.position.x = distance * Math.cos(currentRotation.x) * Math.sin(currentRotation.y);
    camera.position.y = distance * Math.sin(currentRotation.x) + 2;
    camera.position.z = distance * Math.cos(currentRotation.x) * Math.cos(currentRotation.y);
    
    camera.lookAt(0, 0.5, 0);
    
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
    const distance = Math.sqrt(
        cameraPosition.x ** 2 + 
        cameraPosition.y ** 2 + 
        cameraPosition.z ** 2
    );
    const newDistance = Math.max(3, distance - 1);
    const scale = newDistance / distance;
    
    cameraPosition.x *= scale;
    cameraPosition.y *= scale;
    cameraPosition.z *= scale;
});

document.getElementById('zoom-out').addEventListener('click', () => {
    enableLiveUpdating();
    const distance = Math.sqrt(
        cameraPosition.x ** 2 + 
        cameraPosition.y ** 2 + 
        cameraPosition.z ** 2
    );
    const newDistance = Math.min(20, distance + 1);
    const scale = newDistance / distance;
    
    cameraPosition.x *= scale;
    cameraPosition.y *= scale;
    cameraPosition.z *= scale;
});

document.getElementById('reset-view').addEventListener('click', () => {
    cameraPosition = { x: 5, y: 3, z: 8 };
    targetRotation = { x: 0, y: 0 };
    currentRotation = { x: 0, y: 0 };
    
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
    thumbnailCanvas = document.getElementById('thumbnail-canvas');
    thumbnailCtx = thumbnailCanvas.getContext('2d');
    
    // Load guides image
    guidesImage = new Image();
    guidesImage.src = 'Guides.png';
    
    // Add event listeners for dragging
    thumbnailCanvas.addEventListener('mousedown', onThumbnailMouseDown);
    thumbnailCanvas.addEventListener('mousemove', onThumbnailMouseMove);
    thumbnailCanvas.addEventListener('mouseup', onThumbnailMouseUp);
    thumbnailCanvas.addEventListener('mouseleave', onThumbnailMouseUp);
    
    // Add event listener for resizing with mouse wheel
    thumbnailCanvas.addEventListener('wheel', onThumbnailWheel);
}

// Render thumbnail to canvas
function renderThumbnail(includeGrid = null) {
    if (!thumbnailCanvas || !thumbnailCtx || !thumbnailImage) return;
    
    // Use showThumbnailGuides if includeGrid is not explicitly provided
    const shouldShowGrid = includeGrid !== null ? includeGrid : showThumbnailGuides;
    
    // Clear canvas
    thumbnailCtx.clearRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    
    // Fill with background color
    thumbnailCtx.fillStyle = '#121212';
    thumbnailCtx.fillRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    
    // Draw guides background image - only if shouldShowGrid is true
    if (shouldShowGrid && guidesImage && guidesImage.complete) {
        thumbnailCtx.drawImage(guidesImage, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
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
    thumbnailDragging = true;
    const rect = thumbnailCanvas.getBoundingClientRect();
    // Scale factor to convert display coordinates to canvas coordinates
    const scaleX = thumbnailCanvas.width / rect.width;
    const scaleY = thumbnailCanvas.height / rect.height;
    
    thumbnailDragStart = {
        x: (event.clientX - rect.left) * scaleX - thumbnailOffset.x,
        y: (event.clientY - rect.top) * scaleY - thumbnailOffset.y
    };
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
}

// Thumbnail canvas wheel handler for resizing
function onThumbnailWheel(event) {
    event.preventDefault();
    
    const scaleSpeed = 0.05;
    
    // Adjust scale based on wheel direction
    if (event.deltaY < 0) {
        // Scroll up = zoom in (increase scale)
        thumbnailScale = Math.min(3.0, thumbnailScale + scaleSpeed);
    } else {
        // Scroll down = zoom out (decrease scale)
        thumbnailScale = Math.max(0.3, thumbnailScale - scaleSpeed);
    }
    
    renderThumbnail();
}

// Auto-show thumbnail canvas on first update
function showThumbnailCanvas() {
    if (thumbnailCanvas && !thumbnailCanvas.classList.contains('active')) {
        thumbnailCanvas.classList.add('active');
        document.getElementById('thumbnail-placeholder').classList.add('hidden');
        document.getElementById('drag-label').classList.add('visible');
        document.getElementById('use-snapshot').style.display = 'block';
        document.getElementById('current-thumbnail-label').style.display = 'none';
    }
}

// Clear the modified canvas state and preview
function clearThumbnailPreview() {
    // Reset state variables first
    newSnapshotData = null;
    thumbnailImage = null;
    thumbnailOffset = { x: 0, y: 0 };
    thumbnailScale = 1.0;
    isLiveUpdating = false;
    hasUserInteracted = false;
    lastThumbnailUpdate = 0;
    
    // Clear and hide canvas
    if (thumbnailCanvas && thumbnailCtx) {
        thumbnailCtx.clearRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
        thumbnailCanvas.classList.remove('active');
    }
    
    // Show placeholder, hide drag label
    const placeholder = document.getElementById('thumbnail-placeholder');
    if (placeholder) {
        placeholder.classList.remove('hidden');
    }
    
    const dragLabel = document.getElementById('drag-label');
    if (dragLabel) {
        dragLabel.classList.remove('visible');
    }
    
    // Hide update button
    const updateBtn = document.getElementById('use-snapshot');
    if (updateBtn) {
        updateBtn.style.display = 'none';
    }
    
    // Show current thumbnail label
    const currentLabel = document.getElementById('current-thumbnail-label');
    if (currentLabel) {
        currentLabel.style.display = 'block';
    }
}

document.getElementById('use-snapshot').addEventListener('click', () => {
    if (newSnapshotData && thumbnailCanvas && thumbnailCtx) {
        // Render without grid for the final export
        renderThumbnail(false);
        
        // Create a final composited image from the canvas with positioning applied (no grid)
        const finalImageData = thumbnailCanvas.toDataURL('image/png');
        
        // Move new snapshot to current thumbnail
        const currentThumbnailDiv = document.getElementById('current-thumbnail');
        currentThumbnailDiv.innerHTML = `<img src="${finalImageData}" alt="Current Thumbnail">`;
        
        // Re-render with guides to continue editing
        renderThumbnail();
        
        // Keep preview active - don't clear state
        // User can continue to reposition and update again
    }
});

// Initialize when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    init();
    initThumbnailCanvas();
    
    // Set initial active state for grid button (grid starts visible)
    const gridBtn = document.getElementById('toggle-grid');
    if (gridBtn) {
        gridBtn.classList.add('active');
    }
});

