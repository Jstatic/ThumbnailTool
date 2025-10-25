import { Viewer } from './viewer.js';
import { Box3, Vector3 } from 'three';

// List of available GLTF models in public folder
const modelFiles = [
	'Building.gltf',
	'Dragonhead.gltf',
	'Part.gltf',
	'Pumpkin.gltf',
	'Squirrel.gltf',
	'Statue.gltf',
	'Tree.gltf',
	'Truck.gltf',
	'Turkey.gltf'
];

// Application state
let viewer;
let currentModelUrl = '/Truck.gltf';

// Canvas thumbnail state
let thumbnailCanvas = null;
let thumbnailCtx = null;
let thumbnailImage = null;
let thumbnailOffset = { x: 0, y: 0 };
let thumbnailDragging = false;
let thumbnailDragStart = { x: 0, y: 0 };
let thumbnailScale = 1.0;
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
let viewerWheelTimeout = null;

// Populate model dropdown from discovered files
function populateModelDropdown() {
	console.log('populateModelDropdown called');
	const modelSelector = document.getElementById('model-selector');
	console.log('modelSelector found:', !!modelSelector);
	if (!modelSelector) {
		console.error('Model selector not found in populateModelDropdown!');
		return;
	}
	
	// Clear existing options
	modelSelector.innerHTML = '';
	
	// Sort models alphabetically
	const modelPaths = modelFiles.sort();
	
	console.log('Available models:', modelPaths);
	
	// Add each model as an option
	modelPaths.forEach(filename => {
		// Extract filename without extension for display
		const displayName = filename.replace('.gltf', '');
		
		// Files in public folder are served from root
		const modelPath = '/' + filename;
		
		const option = document.createElement('option');
		option.value = modelPath;
		option.textContent = displayName;
		modelSelector.appendChild(option);
	});
	
	// Set Truck as default if available, otherwise use the first model
	const truckPath = modelPaths.find(path => path.includes('Truck.gltf'));
	if (truckPath) {
		currentModelUrl = '/' + truckPath;
		modelSelector.value = currentModelUrl;
	} else if (modelPaths.length > 0) {
		currentModelUrl = '/' + modelPaths[0];
		modelSelector.value = currentModelUrl;
	}
}

// Get the appropriate viewer size based on viewport width
function getViewerSize() {
	return window.innerWidth <= 600 ? 360 : 600;
}

// Update viewer renderer size
function updateViewerSize() {
	if (!viewer) return;
	
	const size = getViewerSize();
	viewer.renderer.setSize(size, size);
	viewer.defaultCamera.aspect = 1;
	viewer.defaultCamera.updateProjectionMatrix();
}

// Initialize the viewer
function init() {
	const el = document.getElementById('viewer-container');
	
	console.log('Initializing viewer, container size:', el.clientWidth, el.clientHeight);
	
	viewer = new Viewer(el, {
		kiosk: true, // Hide the GUI by default
		preset: null,
	});
	
	// Set the renderer to the correct size based on viewport
	const size = getViewerSize();
	viewer.renderer.setSize(size, size);
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
	
	// Add wheel event listener for viewer container
	el.addEventListener('wheel', onViewerWheel);
	
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
	
	// Track loading start time for minimum 2-second delay
	const loadingStartTime = Date.now();
	const minimumLoadingTime = 2000; // 2 seconds
	
	// Show loading indicator
	const loadingIndicator = document.getElementById('loading-indicator');
	if (loadingIndicator) {
		loadingIndicator.style.display = 'block';
	}
	
	// Clear existing model and reset viewport immediately
	viewer.clear();
	viewer.controls.reset();
	
	// Clear the thumbnail preview
	clearThumbnailPreview();
	
	// Ensure grid is visible after load
	viewer.state.grid = true;
	
	// Load the model
	viewer.load(modelUrl, '', new Map())
		.then((gltf) => {
		console.log('Model loaded successfully:', modelUrl, gltf);
		console.log('Scene content:', viewer.content);
			
			// Hide the model content immediately after loading
			if (viewer.content) {
				viewer.content.visible = false;
			}
			
			// Calculate remaining time to reach minimum loading duration
			const elapsedTime = Date.now() - loadingStartTime;
			const remainingTime = Math.max(0, minimumLoadingTime - elapsedTime);
			
			// Wait for minimum loading time before showing model
			setTimeout(() => {
				// Show the model content
				if (viewer.content) {
					viewer.content.visible = true;
				}
				
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
			}, remainingTime);
		})
		.catch((error) => {
			console.error('Error loading model:', error);
			
			// Calculate remaining time even for errors
			const elapsedTime = Date.now() - loadingStartTime;
			const remainingTime = Math.max(0, minimumLoadingTime - elapsedTime);
			
			setTimeout(() => {
				if (loadingIndicator) {
					loadingIndicator.style.display = 'none';
				}
			}, remainingTime);
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

// Viewer wheel handler
function onViewerWheel(event) {
	// Add interacting class
	if (!isViewerInteracting) {
		const viewerContainer = document.getElementById('viewer-container');
		if (viewerContainer) {
			viewerContainer.classList.add('interacting');
			isViewerInteracting = true;
		}
	}
	
	// Clear existing timeout
	if (viewerWheelTimeout) {
		clearTimeout(viewerWheelTimeout);
	}
	
	// Remove interacting class after wheel activity stops
	viewerWheelTimeout = setTimeout(() => {
		const viewerContainer = document.getElementById('viewer-container');
		if (viewerContainer) {
			viewerContainer.classList.remove('interacting');
			isViewerInteracting = false;
		}
	}, 150);
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
	
	// Clear canvas to transparent
	if (includeBackground) {
		thumbnailCtx.clearRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
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
	
	// Add interacting class
	if (!isThumbnailInteracting) {
		const container = document.getElementById('new-thumbnail');
		if (container) {
			container.classList.add('interacting');
			isThumbnailInteracting = true;
		}
	}
	
	// Clear existing timeout
	if (thumbnailInteractionTimeout) {
		clearTimeout(thumbnailInteractionTimeout);
	}
	
	// Remove interacting class after wheel activity stops
	thumbnailInteractionTimeout = setTimeout(() => {
		const container = document.getElementById('new-thumbnail');
		if (container) {
			container.classList.remove('interacting');
			isThumbnailInteracting = false;
		}
	}, 150);
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
	
	// Reset thumbnail state variables
	thumbnailOffset = { x: 0, y: 0 };
	thumbnailScale = 1.0;
	thumbnailImage = null;
	newSnapshotData = null;
	
	// Stop live updating during model loading
	isLiveUpdating = false;
	
	const updateBtn = document.getElementById('use-snapshot');
	if (updateBtn) {
		updateBtn.style.display = 'none';
	}
	
	// Clear the new thumbnail canvas
	if (thumbnailCanvas && thumbnailCtx) {
		thumbnailCtx.clearRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
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
	
	console.log('Thumbnail preview cleared');
}

// Reset only the new thumbnail view without clearing existing preview
function resetNewThumbnailView() {
	console.log('Resetting new thumbnail view...');
	
	// Reset thumbnail state variables
	thumbnailOffset = { x: 0, y: 0 };
	thumbnailScale = 1.0;
	thumbnailImage = null;
	newSnapshotData = null;
	
	const updateBtn = document.getElementById('use-snapshot');
	if (updateBtn) {
		updateBtn.style.display = 'none';
	}
	
	// Clear the new thumbnail canvas
	if (thumbnailCanvas && thumbnailCtx) {
		thumbnailCtx.clearRect(0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
	}
	
	// Re-enable live updating and capture current model view
	isLiveUpdating = true;
	hasUserInteracted = true;
	
	// Capture the current model view for the new thumbnail
	setTimeout(() => {
		updateThumbnailFromViewport();
	}, 100);
	
	console.log('New thumbnail view reset complete');
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
	
	// Track loading start time for minimum 2-second delay
	const uploadStartTime = Date.now();
	const minimumLoadingTime = 2000; // 2 seconds
	
	// Show loading indicator
	const loadingIndicator = document.getElementById('loading-indicator');
	if (loadingIndicator) {
		loadingIndicator.style.display = 'block';
	}
	
	// Clear existing model and reset viewport immediately
	viewer.clear();
	viewer.controls.reset();
	
	// Load the uploaded model with the asset map
	// The viewer.load() function accepts a rootPath and assetMap parameter
	viewer.load(fileURL, '', assetMap)
		.then((gltf) => {
			console.log('Uploaded model loaded successfully:', mainFile.name, gltf);
			
			// Hide the model content immediately after loading
			if (viewer.content) {
				viewer.content.visible = false;
			}
			
			// Calculate remaining time to reach minimum loading duration
			const elapsedTime = Date.now() - uploadStartTime;
			const remainingTime = Math.max(0, minimumLoadingTime - elapsedTime);
			
			// Wait for minimum loading time before showing model
			setTimeout(() => {
				// Show the model content
				if (viewer.content) {
					viewer.content.visible = true;
				}
				
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
			}, remainingTime);
		})
		.catch((error) => {
			console.error('Error loading uploaded model:', error);
			alert('Error loading model: ' + error.message);
			
			// Calculate remaining time even for errors
			const elapsedTime = Date.now() - uploadStartTime;
			const remainingTime = Math.max(0, minimumLoadingTime - elapsedTime);
			
			setTimeout(() => {
				const loadingIndicator = document.getElementById('loading-indicator');
				if (loadingIndicator) {
					loadingIndicator.style.display = 'none';
				}
			}, remainingTime);
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
	console.log('=== DOMContentLoaded fired ===');
	// Populate model dropdown first
	populateModelDropdown();
	
	try {
		init();
		console.log('init() completed, viewer:', viewer);
	} catch (error) {
		console.error('Error in init():', error);
	}
	
	try {
		initThumbnailCanvas();
	} catch (error) {
		console.error('Error in initThumbnailCanvas():', error);
	}
	
	// Add window resize handler to update viewer size
	window.addEventListener('resize', () => {
		updateViewerSize();
	});
	
	// Enable live updating immediately
	isLiveUpdating = true;
	hasUserInteracted = true;
	
	// Grid toggle
	const gridToggleBtn = document.getElementById('toggle-grid');
	if (gridToggleBtn && viewer) {
		gridToggleBtn.addEventListener('click', () => {
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
	}
	
	// Reset view
	const resetViewBtn = document.getElementById('reset-view');
	if (resetViewBtn) {
		resetViewBtn.addEventListener('click', () => {
			viewer.controls.reset();
			resetNewThumbnailView();
		});
	}
	
	// Cancel button
	const cancelBtn = document.getElementById('cancel-btn');
	if (cancelBtn) {
		cancelBtn.addEventListener('click', () => {
			viewer.controls.reset();
			resetNewThumbnailView();
			resetLightingSlider();
		});
	}
	
	// Use snapshot button
	const useSnapshotBtn = document.getElementById('use-snapshot');
	if (useSnapshotBtn) {
		useSnapshotBtn.addEventListener('click', () => {
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
	}
	
	// Model selector
	const modelSelector = document.getElementById('model-selector');
	console.log('Model selector element:', modelSelector);
	console.log('Model selector options count:', modelSelector ? modelSelector.options.length : 0);
	if (modelSelector && modelSelector.options.length > 0) {
		console.log('Available options:', Array.from(modelSelector.options).map(opt => opt.value));
	}
	if (modelSelector) {
		// Try multiple event types to debug
		modelSelector.addEventListener('change', (event) => {
			console.log('CHANGE EVENT FIRED!');
			const selectedModel = event.target.value;
			console.log('Model changed to:', selectedModel);
			loadModel(selectedModel);
			resetLightingSlider();
		});
		modelSelector.addEventListener('click', (event) => {
			console.log('CLICK EVENT on dropdown');
		});
		modelSelector.addEventListener('input', (event) => {
			console.log('INPUT EVENT FIRED!');
			const selectedModel = event.target.value;
			console.log('Model changed to:', selectedModel);
			loadModel(selectedModel);
			resetLightingSlider();
		});
		console.log('Model selector event listeners attached');
	} else {
		console.error('Model selector not found!');
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
	if (lightIntensitySlider && viewer) {
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

