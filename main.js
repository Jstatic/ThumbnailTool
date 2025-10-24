import { Viewer } from './viewer.js';
import { Box3, Vector3 } from 'three';

// Application state
let viewer;
let currentModelUrl = 'assets/Turkey.gltf';

// Canvas thumbnail state
let thumbnailCanvas = null;
let thumbnailCtx = null;
let thumbnailImage = null;
let thumbnailOffset = { x: 0, y: 0 };
let thumbnailDragging = false;
let thumbnailDragStart = { x: 0, y: 0 };
let thumbnailScale = 1.0;
let guidesImage = null;
let showThumbnailGuides = true;
let isLiveUpdating = false;
let lastThumbnailUpdate = 0;
const THUMBNAIL_UPDATE_INTERVAL = 100;
let hasUserInteracted = false;
let thumbnailInteractionTimeout = null;
let isThumbnailInteracting = false;
let newSnapshotData = null;

// Initialize the viewer
function init() {
	const el = document.getElementById('viewer-container');
	
	console.log('Initializing viewer, container size:', el.clientWidth, el.clientHeight);
	
	viewer = new Viewer(el, {
		kiosk: true, // Hide the GUI by default
		preset: null,
	});
	
	// Force the renderer to the correct size (600x600)
	viewer.renderer.setSize(600, 600);
	viewer.defaultCamera.aspect = 1;
	viewer.defaultCamera.updateProjectionMatrix();
	
	console.log('Viewer initialized, renderer size:', viewer.renderer.domElement.width, viewer.renderer.domElement.height);
	
	// Hide the loading indicator once viewer is initialized
	const loadingIndicator = document.getElementById('loading-indicator');
	if (loadingIndicator) {
		loadingIndicator.style.display = 'none';
	}
	
	// Load the initial model
	loadModel(currentModelUrl);
	
	// Add controls event listeners for thumbnail updates
	viewer.controls.addEventListener('start', onControlsStart);
	viewer.controls.addEventListener('end', onControlsEnd);
	
	// Override the animate loop to include thumbnail updates
	const originalAnimate = viewer.animate.bind(viewer);
	viewer.animate = function(time) {
		originalAnimate(time);
		updateThumbnailFromViewport();
	};
}

// Load a specific model
function loadModel(modelUrl) {
	currentModelUrl = modelUrl;
	
	console.log('Loading model:', modelUrl);
	
	// Show loading indicator
	const loadingIndicator = document.getElementById('loading-indicator');
	if (loadingIndicator) {
		loadingIndicator.style.display = 'block';
	}
	
	// Clear the thumbnail preview
	clearThumbnailPreview();
	
	// Ensure grid is visible after load
	viewer.state.grid = true;
	
	// Load the model
	viewer.load(modelUrl, '', new Map())
		.then((gltf) => {
			console.log('Model loaded successfully:', modelUrl, gltf);
			console.log('Scene content:', viewer.content);
			console.log('Camera position:', viewer.defaultCamera.position);
			
			// Hide loading indicator
			if (loadingIndicator) {
				loadingIndicator.style.display = 'none';
			}
			
			// Trigger display update
			viewer.updateDisplay();
		})
		.catch((error) => {
			console.error('Error loading model:', error);
			if (loadingIndicator) {
				loadingIndicator.style.display = 'none';
			}
		});
}

// Controls interaction handlers
function onControlsStart() {
	enableLiveUpdating();
	showUpdateButton();
}

function onControlsEnd() {
	// Keep live updating enabled after interaction
}

// Enable live updating on first user interaction
function enableLiveUpdating() {
	if (!hasUserInteracted) {
		hasUserInteracted = true;
		isLiveUpdating = true;
	}
}

// Show update thumbnail button
function showUpdateButton() {
	const btn = document.getElementById('use-snapshot');
	if (btn && thumbnailImage) {
		btn.style.display = 'block';
	}
}

// Update thumbnail with current 3D view
function updateThumbnailFromViewport() {
	if (!isLiveUpdating || !thumbnailCanvas || !thumbnailCtx || !viewer) return;
	
	// Throttle updates
	const now = Date.now();
	if (now - lastThumbnailUpdate < THUMBNAIL_UPDATE_INTERVAL) return;
	lastThumbnailUpdate = now;
	
	// Temporarily set background to null for transparent screenshot
	const originalBackground = viewer.scene.background;
	viewer.scene.background = null;
	
	// Hide grid during snapshot (we'll render it in the 2D canvas separately)
	const gridWasVisible = viewer.state.grid;
	if (viewer.gridHelper) {
		viewer.scene.remove(viewer.gridHelper);
	}
	if (viewer.axesHelper) {
		viewer.scene.remove(viewer.axesHelper);
	}
	
	// Force a render with transparent background
	viewer.renderer.setClearColor(0x000000, 0); // Transparent clear
	viewer.render();
	
	// Capture the canvas as an image (PNG with transparency)
	const imageData = viewer.renderer.domElement.toDataURL('image/png');
	
	// Restore the original background and grid
	viewer.scene.background = originalBackground;
	viewer.renderer.setClearColor(viewer.backgroundColor, 1);
	if (gridWasVisible) {
		if (viewer.gridHelper) {
			viewer.scene.add(viewer.gridHelper);
		}
		if (viewer.axesHelper) {
			viewer.scene.add(viewer.axesHelper);
		}
	}
	
	// Store the snapshot data
	newSnapshotData = imageData;
	
	// Load image and update display
	thumbnailImage = new Image();
	thumbnailImage.onload = () => {
		showThumbnailCanvas();
		renderThumbnail();
	};
	thumbnailImage.src = imageData;
}

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
function renderThumbnail(includeGrid = null, includeBackground = true) {
	if (!thumbnailCanvas || !thumbnailCtx || !thumbnailImage) return;
	
	const shouldShowGrid = includeGrid !== null ? includeGrid : showThumbnailGuides;
	
	// Clear canvas
	thumbnailCtx.clearRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
	
	// Fill with background color
	if (includeBackground) {
		thumbnailCtx.fillStyle = '#121212';
		thumbnailCtx.fillRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
	}
	
	// Draw guides background image at 50% opacity
	if (shouldShowGrid && guidesImage && guidesImage.complete) {
		thumbnailCtx.globalAlpha = 0.5;
		thumbnailCtx.drawImage(guidesImage, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
		thumbnailCtx.globalAlpha = 1.0; // Reset to full opacity
	}
	
	// Draw image with current offset and scale
	const baseScale = Math.min(thumbnailCanvas.width / thumbnailImage.width, thumbnailCanvas.height / thumbnailImage.height);
	const scaledWidth = thumbnailImage.width * baseScale * thumbnailScale;
	const scaledHeight = thumbnailImage.height * baseScale * thumbnailScale;
	
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
	const scaleX = thumbnailCanvas.width / rect.width;
	const scaleY = thumbnailCanvas.height / rect.height;
	
	thumbnailDragStart = {
		x: (event.clientX - rect.left) * scaleX - thumbnailOffset.x,
		y: (event.clientY - rect.top) * scaleY - thumbnailOffset.y
	};
	
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
	const scaleX = thumbnailCanvas.width / rect.width;
	const scaleY = thumbnailCanvas.height / rect.height;
	
	thumbnailOffset.x = (event.clientX - rect.left) * scaleX - thumbnailDragStart.x;
	thumbnailOffset.y = (event.clientY - rect.top) * scaleY - thumbnailDragStart.y;
	
	renderThumbnail();
}

function onThumbnailMouseUp() {
	thumbnailDragging = false;
	
	if (isThumbnailInteracting) {
		const container = document.getElementById('new-thumbnail');
		if (container) {
			container.classList.remove('interacting');
			isThumbnailInteracting = false;
		}
	}
}

// Thumbnail canvas wheel handler
function onThumbnailWheel(event) {
	event.preventDefault();
	showUpdateButton();
	
	const scaleSpeed = 0.025;
	
	if (event.deltaY < 0) {
		thumbnailScale = Math.min(3.0, thumbnailScale + scaleSpeed);
	} else {
		thumbnailScale = Math.max(0.3, thumbnailScale - scaleSpeed);
	}
	
	renderThumbnail();
}

// Show thumbnail canvas
function showThumbnailCanvas() {
	if (thumbnailCanvas && !thumbnailCanvas.classList.contains('active')) {
		thumbnailCanvas.classList.add('active');
		document.getElementById('thumbnail-placeholder').classList.add('hidden');
		document.getElementById('drag-label').classList.add('visible');
		document.getElementById('use-snapshot').style.display = 'block';
	}
}

// Clear the thumbnail preview
function clearThumbnailPreview() {
	newSnapshotData = null;
	thumbnailImage = null;
	thumbnailOffset = { x: 0, y: 0 };
	thumbnailScale = 1.0;
	isLiveUpdating = false;
	hasUserInteracted = false;
	lastThumbnailUpdate = 0;
	
	if (thumbnailCanvas && thumbnailCtx) {
		thumbnailCtx.clearRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
		thumbnailCanvas.classList.remove('active');
	}
	
	const placeholder = document.getElementById('thumbnail-placeholder');
	if (placeholder) {
		placeholder.classList.remove('hidden');
	}
	
	const dragLabel = document.getElementById('drag-label');
	if (dragLabel) {
		dragLabel.classList.remove('visible');
	}
	
	const updateBtn = document.getElementById('use-snapshot');
	if (updateBtn) {
		updateBtn.style.display = 'none';
	}
}

// Button controls
document.addEventListener('DOMContentLoaded', () => {
	init();
	initThumbnailCanvas();
	
	// Grid toggle
	document.getElementById('toggle-grid').addEventListener('click', () => {
		viewer.state.grid = !viewer.state.grid;
		viewer.updateDisplay();
		showThumbnailGuides = viewer.state.grid;
		
		const btn = document.getElementById('toggle-grid');
		btn.textContent = viewer.state.grid ? '⊞' : '⊟';
		
		if (viewer.state.grid) {
			btn.classList.add('active');
		} else {
			btn.classList.remove('active');
		}
		
		if (thumbnailCanvas && thumbnailCanvas.classList.contains('active') && thumbnailImage) {
			renderThumbnail();
		}
	});
	
	// Reset view
	document.getElementById('reset-view').addEventListener('click', () => {
		viewer.controls.reset();
		clearThumbnailPreview();
	});
	
	// Cancel button
	document.getElementById('cancel-btn').addEventListener('click', () => {
		viewer.controls.reset();
		clearThumbnailPreview();
	});
	
	// Use snapshot button
	document.getElementById('use-snapshot').addEventListener('click', () => {
		if (newSnapshotData && thumbnailCanvas && thumbnailCtx) {
			const btn = document.getElementById('use-snapshot');
			if (btn) {
				btn.style.display = 'none';
			}
			
			// Render without grid and background for transparent export
			renderThumbnail(false, false);
			
			const finalImageData = thumbnailCanvas.toDataURL('image/png');
			const currentThumbnailDiv = document.getElementById('current-thumbnail');
			
			currentThumbnailDiv.classList.add('loading');
			
			setTimeout(() => {
				const img = currentThumbnailDiv.querySelector('img');
				if (img) {
					img.src = finalImageData;
				}
				
				setTimeout(() => {
					currentThumbnailDiv.classList.remove('loading');
				}, 10);
			}, 500);
			
			// Re-render with guides
			renderThumbnail();
		}
	});
	
	// Model selector
	const modelSelector = document.getElementById('model-selector');
	if (modelSelector) {
		modelSelector.addEventListener('change', (event) => {
			const selectedModel = event.target.value;
			console.log('Model changed to:', selectedModel);
			loadModel(selectedModel);
		});
	}
	
	// Set initial active state for grid button
	const gridBtn = document.getElementById('toggle-grid');
	if (gridBtn) {
		gridBtn.classList.add('active');
	}
});

