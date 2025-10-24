import { Viewer } from './viewer.js';
import { Box3, Vector3 } from 'three';

// Discover all GLTF models in assets folder using Vite's glob import
const modelFiles = import.meta.glob('./assets/*.gltf', { eager: false, as: 'url' });

// Application state
let viewer;
let currentModelUrl = 'assets/Truck.gltf';

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

// 3D viewer interaction state
let isViewerInteracting = false;

// Populate model dropdown from discovered files
function populateModelDropdown() {
	const modelSelector = document.getElementById('model-selector');
	if (!modelSelector) return;
	
	// Clear existing options
	modelSelector.innerHTML = '';
	
	// Get model paths and sort them alphabetically
	const modelPaths = Object.keys(modelFiles).sort();
	
	console.log('Discovered models:', modelPaths);
	
	// Add each model as an option
	modelPaths.forEach(path => {
		// Extract filename without path and extension for display
		const filename = path.split('/').pop();
		const displayName = filename.replace('.gltf', '');
		
		// Convert path to relative assets path
		const assetPath = path.replace('./', '');
		
		const option = document.createElement('option');
		option.value = assetPath;
		option.textContent = displayName;
		modelSelector.appendChild(option);
	});
	
	// Set Truck as default if available, otherwise use the first model
	const truckPath = modelPaths.find(path => path.includes('Truck.gltf'));
	if (truckPath) {
		const truckAssetPath = truckPath.replace('./', '');
		currentModelUrl = truckAssetPath;
		modelSelector.value = truckAssetPath;
	} else if (modelPaths.length > 0) {
		const firstModel = modelPaths[0].replace('./', '');
		currentModelUrl = firstModel;
		modelSelector.value = firstModel;
	}
}

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
			
			// Hide loading indicator
			if (loadingIndicator) {
				loadingIndicator.style.display = 'none';
			}
			
			// Trigger display update
			viewer.updateDisplay();
			
			// Enable live updating and force initial thumbnail capture
			isLiveUpdating = true;
			hasUserInteracted = true;
			setTimeout(() => {
				lastThumbnailUpdate = 0;
				updateThumbnailFromViewport();
			}, 200);
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
	
	// Add interacting class to viewer container for drop shadow effect
	if (!isViewerInteracting) {
		const viewerContainer = document.getElementById('viewer-container');
		if (viewerContainer) {
			viewerContainer.classList.add('interacting');
			isViewerInteracting = true;
		}
	}
}

function onControlsEnd() {
	// Keep live updating enabled after interaction
	
	// Remove interacting class from viewer container
	if (isViewerInteracting) {
		const viewerContainer = document.getElementById('viewer-container');
		if (viewerContainer) {
			viewerContainer.classList.remove('interacting');
			isViewerInteracting = false;
		}
	}
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
	
	// Draw initial background
	thumbnailCtx.fillStyle = '#121212';
	thumbnailCtx.fillRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
	
	// Load guides image
	guidesImage = new Image();
	guidesImage.src = 'Guides.png';
	guidesImage.onload = () => {
		// Draw guides once loaded
		thumbnailCtx.globalAlpha = 0.5;
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

// Show thumbnail canvas (canvas is visible from start)
function showThumbnailCanvas() {
	// Canvas is already active from start, just show the update button
	const btn = document.getElementById('use-snapshot');
	if (btn && thumbnailImage) {
		btn.style.display = 'block';
	}
}

// Clear the thumbnail preview
function clearThumbnailPreview() {
	console.log('Clearing thumbnail preview...');
	
	thumbnailOffset = { x: 0, y: 0 };
	thumbnailScale = 1.0;
	
	const updateBtn = document.getElementById('use-snapshot');
	if (updateBtn) {
		updateBtn.style.display = 'none';
	}
	
	// Clear the current thumbnail image
	const currentThumbnailDiv = document.getElementById('current-thumbnail');
	if (currentThumbnailDiv) {
		const img = currentThumbnailDiv.querySelector('img');
		if (img) {
			img.src = '';
			img.style.display = 'none';
		}
	}
	
	// Hide download button
	const downloadBtn = document.getElementById('download-thumbnail');
	if (downloadBtn) {
		downloadBtn.style.display = 'none';
		downloadBtn.dataset.imageData = '';
	}
	
	// Keep live updating active - thumbnail canvas continues showing live view
	console.log('Thumbnail preview cleared');
}

// Reset lighting slider to default
function resetLightingSlider() {
	const lightIntensitySlider = document.getElementById('light-intensity');
	if (lightIntensitySlider && viewer) {
		// Reset slider to default value (100%)
		lightIntensitySlider.value = 100;
		
		// Reset viewer lighting to base values
		viewer.state.ambientIntensity = 0.3;
		viewer.state.directIntensity = 0.8 * Math.PI;
		viewer.updateLights();
	}
}

// Handle file upload
function handleFileUpload(event) {
	const files = Array.from(event.target.files);
	if (!files || files.length === 0) return;
	
	console.log('Files uploaded:', files.map(f => f.name).join(', '));
	
	// Find the main GLTF/GLB file
	let mainFile = null;
	const assetMap = new Map();
	
	for (const file of files) {
		const fileName = file.name.toLowerCase();
		
		if ((fileName.endsWith('.gltf') || fileName.endsWith('.glb')) && !mainFile) {
			mainFile = file;
		} else {
			// Add other files (textures, .bin files, etc.) to the asset map
			// The asset map maps file names to File/Blob objects
			assetMap.set(file.name, file);
		}
	}
	
	if (!mainFile) {
		alert('Please upload at least one GLTF (.gltf) or GLB (.glb) file');
		return;
	}
	
	console.log('Main file:', mainFile.name);
	console.log('Asset map:', Array.from(assetMap.keys()));
	
	// Create object URL for the main file
	const fileURL = URL.createObjectURL(mainFile);
	
	console.log('Loading uploaded model from:', fileURL);
	
	// Load the uploaded model with the asset map
	// The viewer.load() function accepts a rootPath and assetMap parameter
	viewer.load(fileURL, '', assetMap)
		.then((gltf) => {
			console.log('Uploaded model loaded successfully:', mainFile.name, gltf);
			
			// Hide loading indicator
			const loadingIndicator = document.getElementById('loading-indicator');
			if (loadingIndicator) {
				loadingIndicator.style.display = 'none';
			}
			
			// Clear the thumbnail preview
			clearThumbnailPreview();
			
			// Update current model URL reference
			currentModelUrl = fileURL;
			
			// Enable live updating and force initial thumbnail capture
			isLiveUpdating = true;
			hasUserInteracted = true;
			setTimeout(() => {
				lastThumbnailUpdate = 0;
				updateThumbnailFromViewport();
			}, 200);
		})
		.catch((error) => {
			console.error('Error loading uploaded model:', error);
			alert('Error loading model: ' + error.message);
			
			const loadingIndicator = document.getElementById('loading-indicator');
			if (loadingIndicator) {
				loadingIndicator.style.display = 'none';
			}
		});
	
	// Clear the model selector since we're loading a custom file
	const modelSelector = document.getElementById('model-selector');
	if (modelSelector) {
		modelSelector.value = '';
	}
	
	// Reset lighting after upload
	resetLightingSlider();
}

// Button controls
document.addEventListener('DOMContentLoaded', () => {
	// Populate model dropdown first
	populateModelDropdown();
	
	init();
	initThumbnailCanvas();
	
	// Enable live updating immediately
	isLiveUpdating = true;
	hasUserInteracted = true;
	
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
		resetLightingSlider();
	});
	
	// Use snapshot button
	document.getElementById('use-snapshot').addEventListener('click', () => {
		if (newSnapshotData && thumbnailCanvas && thumbnailCtx) {
			const btn = document.getElementById('use-snapshot');
			if (btn) {
				btn.style.display = 'none';
			}
			
			// Hide download button during update
			const downloadBtn = document.getElementById('download-thumbnail');
			if (downloadBtn) {
				downloadBtn.style.display = 'none';
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
					img.style.display = 'block'; // Make the image visible
				}
				
				// Show download button after update completes
				if (downloadBtn) {
					downloadBtn.style.display = 'flex';
					// Store the image data for download
					downloadBtn.dataset.imageData = finalImageData;
					console.log('Download button should now be visible');
				} else {
					console.error('Download button not found!');
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
			resetLightingSlider();
		});
	}
	
	// Set initial active state for grid button
	const gridBtn = document.getElementById('toggle-grid');
	if (gridBtn) {
		gridBtn.classList.add('active');
	}
	
	// File upload handler
	const fileUploadInput = document.getElementById('file-upload');
	if (fileUploadInput) {
		fileUploadInput.addEventListener('change', handleFileUpload);
	}
	
	// Lighting intensity slider
	const lightIntensitySlider = document.getElementById('light-intensity');
	if (lightIntensitySlider) {
		// Store base lighting values
		const baseAmbientIntensity = viewer.state.ambientIntensity;
		const baseDirectIntensity = viewer.state.directIntensity;
		
		lightIntensitySlider.addEventListener('input', (event) => {
			const multiplier = event.target.value / 100; // Convert 0-200 to 0-2
			
			// Update lighting intensities
			viewer.state.ambientIntensity = baseAmbientIntensity * multiplier;
			viewer.state.directIntensity = baseDirectIntensity * multiplier;
			
			// Apply the changes
			viewer.updateLights();
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

