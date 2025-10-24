import {
	AmbientLight,
	AnimationMixer,
	AxesHelper,
	Box3,
	BufferGeometry,
	Cache,
	Color,
	DirectionalLight,
	Float32BufferAttribute,
	GridHelper,
	Group,
	HemisphereLight,
	LineBasicMaterial,
	LineSegments,
	LoaderUtils,
	LoadingManager,
	PMREMGenerator,
	PerspectiveCamera,
	PointsMaterial,
	REVISION,
	Scene,
	SkeletonHelper,
	Vector3,
	WebGLRenderer,
	LinearToneMapping,
	ACESFilmicToneMapping,
} from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { GUI } from 'dat.gui';

import { environments } from './environments.js';

const DEFAULT_CAMERA = '[default]';

const MANAGER = new LoadingManager();
const THREE_PATH = `https://unpkg.com/three@0.${REVISION}.x`;
const DRACO_LOADER = new DRACOLoader(MANAGER).setDecoderPath(
	`${THREE_PATH}/examples/jsm/libs/draco/gltf/`,
);
const KTX2_LOADER = new KTX2Loader(MANAGER).setTranscoderPath(
	`${THREE_PATH}/examples/jsm/libs/basis/`,
);

const IS_IOS = isIOS();

const Preset = { ASSET_GENERATOR: 'assetgenerator' };

Cache.enabled = true;

export class Viewer {
	constructor(el, options) {
		this.el = el;
		this.options = options;

		this.lights = [];
		this.content = null;
		this.mixer = null;
		this.clips = [];
		this.gui = null;

		// Initialize global VIEWER for debugging
		window.VIEWER = window.VIEWER || {};
		window.VIEWER.instance = this;

		this.state = {
			environment:
				options.preset === Preset.ASSET_GENERATOR
					? environments.find((e) => e.id === 'footprint-court').name
					: environments[1].name,
			background: false,
			playbackSpeed: 1.0,
			actionStates: {},
			camera: DEFAULT_CAMERA,
			wireframe: false,
			skeleton: false,
			grid: true, // Enable grid by default
			autoRotate: false,

			// Lights
			punctualLights: true,
			exposure: 1.0, // Increased from 0.0 for better visibility
			toneMapping: ACESFilmicToneMapping, // Use ACES Filmic
			ambientIntensity: 0.3,
			ambientColor: '#FFFFFF',
			directIntensity: 0.8 * Math.PI, // TODO(#116)
			directColor: '#FFFFFF',
			bgColor: '#121212', // Match app background

			pointSize: 1.0,
		};

		this.prevTime = 0;

		this.stats = new Stats();
		this.stats.dom.height = '48px';
		[].forEach.call(this.stats.dom.children, (child) => (child.style.display = ''));

		this.backgroundColor = new Color(this.state.bgColor);

		this.scene = new Scene();
		this.scene.background = this.backgroundColor;

		const fov = options.preset === Preset.ASSET_GENERATOR ? (0.8 * 180) / Math.PI : 60;
		const aspect = el.clientWidth / el.clientHeight;
		this.defaultCamera = new PerspectiveCamera(fov, aspect, 0.01, 1000);
		this.activeCamera = this.defaultCamera;
		this.scene.add(this.defaultCamera);

		this.renderer = window.renderer = new WebGLRenderer({ 
			antialias: true,
			alpha: true, // Enable transparency for screenshots
			preserveDrawingBuffer: true // Required for toDataURL()
		});
		this.renderer.setClearColor(0xcccccc);
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(el.clientWidth, el.clientHeight);

		this.pmremGenerator = new PMREMGenerator(this.renderer);
		this.pmremGenerator.compileEquirectangularShader();

		this.neutralEnvironment = this.pmremGenerator.fromScene(new RoomEnvironment()).texture;

		this.controls = new OrbitControls(this.defaultCamera, this.renderer.domElement);
		this.controls.screenSpacePanning = true;
		
		// Log camera position when view is moved
		this.controls.addEventListener('change', () => {
			const pos = this.defaultCamera.position;
			console.log('Camera position:', pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2));
		});

		this.el.appendChild(this.renderer.domElement);

		this.cameraCtrl = null;
		this.cameraFolder = null;
		this.animFolder = null;
		this.animCtrls = [];
		this.morphFolder = null;
		this.morphCtrls = [];
		this.skeletonHelpers = [];
		this.gridHelper = null;

		this.addAxesHelper();
		this.addGUI();
		if (options.kiosk) this.gui.close();

		this.animate = this.animate.bind(this);
		requestAnimationFrame(this.animate);
		window.addEventListener('resize', this.resize.bind(this), false);
	}

	animate(time) {
		requestAnimationFrame(this.animate);

		const dt = (time - this.prevTime) / 1000;

		this.controls.update();
		this.stats.update();
		this.mixer && this.mixer.update(dt);
		this.render();

		this.prevTime = time;
	}

	render() {
		this.renderer.render(this.scene, this.activeCamera);
		if (this.state.grid) {
			// Update axes camera to match main camera orientation but keep fixed distance
			const distance = 5; // Fixed distance for consistent axes size
			// Get normalized direction from camera position
			const direction = this.defaultCamera.position.clone().normalize();
			// Position axes camera at fixed distance from origin
			this.axesCamera.position.copy(direction.multiplyScalar(distance));
			// Make axes camera look at the origin
			this.axesCamera.lookAt(this.axesScene.position);
			this.axesRenderer.render(this.axesScene, this.axesCamera);
		}
	}

	resize() {
		const { clientHeight, clientWidth } = this.el;

		this.defaultCamera.aspect = clientWidth / clientHeight;
		this.defaultCamera.updateProjectionMatrix();
		this.renderer.setSize(clientWidth, clientHeight);

		if (this.axesDiv && this.axesCamera && this.axesRenderer) {
			const axesSize = 100;
			this.axesCamera.aspect = 1;
			this.axesCamera.updateProjectionMatrix();
			this.axesRenderer.setSize(axesSize, axesSize);
		}
	}

	load(url, rootPath, assetMap) {
		const baseURL = LoaderUtils.extractUrlBase(url);

		// Load.
		return new Promise((resolve, reject) => {
			// Intercept and override relative URLs.
			MANAGER.setURLModifier((url, path) => {
				// URIs in a glTF file may be escaped, or not. Assume that assetMap is
				// from an un-escaped source, and decode all URIs before lookups.
				// See: https://github.com/donmccurdy/three-gltf-viewer/issues/146
				const normalizedURL =
					rootPath +
					decodeURI(url)
						.replace(baseURL, '')
						.replace(/^(\.?\/)/, '');

				if (assetMap.has(normalizedURL)) {
					const blob = assetMap.get(normalizedURL);
					const blobURL = URL.createObjectURL(blob);
					blobURLs.push(blobURL);
					return blobURL;
				}

				return (path || '') + url;
			});

			const loader = new GLTFLoader(MANAGER)
				.setCrossOrigin('anonymous')
				.setDRACOLoader(DRACO_LOADER)
				.setKTX2Loader(KTX2_LOADER.detectSupport(this.renderer))
				.setMeshoptDecoder(MeshoptDecoder);

			const blobURLs = [];

			loader.load(
				url,
				(gltf) => {
					window.VIEWER.json = gltf;

					const scene = gltf.scene || gltf.scenes[0];
					const clips = gltf.animations || [];

					if (!scene) {
						// Valid, but not supported by this viewer.
						throw new Error(
							'This model contains no scene, and cannot be viewed here. However,' +
								' it may contain individual 3D resources.',
						);
					}

					this.setContent(scene, clips);

					blobURLs.forEach(URL.revokeObjectURL);

					// See: https://github.com/google/draco/issues/349
					// DRACOLoader.releaseDecoderModule();

					resolve(gltf);
				},
				undefined,
				reject,
			);
		});
	}

	/**
	 * @param {THREE.Object3D} object
	 * @param {Array<THREE.AnimationClip} clips
	 */
	setContent(object, clips) {
		this.clear();

		object.updateMatrixWorld(); // donmccurdy/three-gltf-viewer#330

		// Scale model to be exactly 50% of grid size (grid default is 10 units)
		const gridSize = 10;
		const targetSize = gridSize * 0.5;
		let box = new Box3().setFromObject(object);
		let boxSize = box.getSize(new Vector3());
		const maxDimension = Math.max(boxSize.x, boxSize.y, boxSize.z);
		
		// Scale up or down to reach target size
		if (maxDimension !== targetSize) {
			const scale = targetSize / maxDimension;
			object.scale.multiplyScalar(scale);
			object.updateMatrixWorld(true);
			// Recalculate bounding box after scaling
			box = new Box3().setFromObject(object);
			boxSize = box.getSize(new Vector3());
		}

		// Calculate center and size after scaling
		const size = box.getSize(new Vector3()).length();
		const center = box.getCenter(new Vector3());

		this.controls.reset();

		// Center the model on X and Z, but place base on grid (Y=0)
		object.position.x -= center.x;
		object.position.y -= box.min.y; // Position so bottom sits on grid
		object.position.z -= center.z;
		
		// Calculate the model's vertical center after positioning
		const modelCenterY = boxSize.y / 2;

		this.controls.maxDistance = size * 10;

		this.defaultCamera.near = size / 100;
		this.defaultCamera.far = size * 100;
		this.defaultCamera.updateProjectionMatrix();

		if (this.options.cameraPosition) {
			this.defaultCamera.position.fromArray(this.options.cameraPosition);
			this.defaultCamera.lookAt(new Vector3());
		} else {
			// Set fixed camera position and look at model center to center it in viewport
			this.defaultCamera.position.set(-5.22, 2.58, -4.62);
			this.defaultCamera.lookAt(new Vector3(0, modelCenterY, 0));
		}

		this.setCamera(DEFAULT_CAMERA);
		
		// Set orbit controls target to model center
		this.controls.target.set(0, modelCenterY, 0);
		this.controls.update();

		// Configure axes camera with fixed near/far for consistent rendering
		this.axesCamera.near = 0.1;
		this.axesCamera.far = 10;
		this.axesCamera.updateProjectionMatrix();
		// Use a fixed scale for consistent axes size
		this.axesCorner.scale.set(1, 1, 1);

		this.controls.saveState();

		this.scene.add(object);
		this.content = object;

		this.state.punctualLights = true;

		this.content.traverse((node) => {
			if (node.isLight) {
				this.state.punctualLights = false;
			}
		});

		this.setClips(clips);

		this.updateLights();
		this.updateGUI();
		this.updateEnvironment();
		this.updateDisplay();

		window.VIEWER.scene = this.content;

		this.printGraph(this.content);
	}

	printGraph(node) {
		console.group(' <' + node.type + '> ' + node.name);
		node.children.forEach((child) => this.printGraph(child));
		console.groupEnd();
	}

	/**
	 * @param {Array<THREE.AnimationClip} clips
	 */
	setClips(clips) {
		if (this.mixer) {
			this.mixer.stopAllAction();
			this.mixer.uncacheRoot(this.mixer.getRoot());
			this.mixer = null;
		}

		this.clips = clips;
		if (!clips.length) return;

		this.mixer = new AnimationMixer(this.content);
	}

	playAllClips() {
		this.clips.forEach((clip) => {
			this.mixer.clipAction(clip).reset().play();
			this.state.actionStates[clip.name] = true;
		});
	}

	/**
	 * @param {string} name
	 */
	setCamera(name) {
		if (name === DEFAULT_CAMERA) {
			this.controls.enabled = true;
			this.activeCamera = this.defaultCamera;
		} else {
			this.controls.enabled = false;
			this.content.traverse((node) => {
				if (node.isCamera && node.name === name) {
					this.activeCamera = node;
				}
			});
		}
	}

	updateLights() {
		const state = this.state;
		const lights = this.lights;

		if (state.punctualLights && !lights.length) {
			this.addLights();
		} else if (!state.punctualLights && lights.length) {
			this.removeLights();
		}

		this.renderer.toneMapping = Number(state.toneMapping);
		this.renderer.toneMappingExposure = Math.pow(2, state.exposure);

		if (lights.length === 2) {
			lights[0].intensity = state.ambientIntensity;
			lights[0].color.set(state.ambientColor);
			lights[1].intensity = state.directIntensity;
			lights[1].color.set(state.directColor);
		}
	}

	addLights() {
		const state = this.state;

		if (this.options.preset === Preset.ASSET_GENERATOR) {
			const hemiLight = new HemisphereLight();
			hemiLight.name = 'hemi_light';
			this.scene.add(hemiLight);
			this.lights.push(hemiLight);
			return;
		}

		const light1 = new AmbientLight(state.ambientColor, state.ambientIntensity);
		light1.name = 'ambient_light';
		this.defaultCamera.add(light1);

		const light2 = new DirectionalLight(state.directColor, state.directIntensity);
		light2.position.set(0.5, 0, 0.866); // ~60º
		light2.name = 'main_light';
		this.defaultCamera.add(light2);

		this.lights.push(light1, light2);
	}

	removeLights() {
		this.lights.forEach((light) => light.parent.remove(light));
		this.lights.length = 0;
	}

	updateEnvironment() {
		const environment = environments.filter(
			(entry) => entry.name === this.state.environment,
		)[0];

		this.getCubeMapTexture(environment).then(({ envMap }) => {
			this.scene.environment = envMap;
			this.scene.background = this.state.background ? envMap : this.backgroundColor;
		});
	}

	getCubeMapTexture(environment) {
		const { id, path } = environment;

		// neutral (THREE.RoomEnvironment)
		if (id === 'neutral') {
			return Promise.resolve({ envMap: this.neutralEnvironment });
		}

		// none
		if (id === '') {
			return Promise.resolve({ envMap: null });
		}

		return new Promise((resolve, reject) => {
			new EXRLoader().load(
				path,
				(texture) => {
					const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
					this.pmremGenerator.dispose();

					resolve({ envMap });
				},
				undefined,
				reject,
			);
		});
	}

	updateDisplay() {
		if (this.skeletonHelpers.length) {
			this.skeletonHelpers.forEach((helper) => this.scene.remove(helper));
		}

		traverseMaterials(this.content, (material) => {
			material.wireframe = this.state.wireframe;

			if (material instanceof PointsMaterial) {
				material.size = this.state.pointSize;
			}
		});

		this.content.traverse((node) => {
			if (node.geometry && node.skeleton && this.state.skeleton) {
				const helper = new SkeletonHelper(node.skeleton.bones[0].parent);
				helper.material.linewidth = 3;
				this.scene.add(helper);
				this.skeletonHelpers.push(helper);
			}
		});

		if (this.state.grid !== Boolean(this.gridHelper)) {
			if (this.state.grid) {
				this.gridHelper = new GridHelper(30, 15); // 30 unit size, 15 divisions = wider subdivisions
				// Fix flickering by positioning grid slightly below y=0 and setting render order
				this.gridHelper.position.y = -0.001;
				this.gridHelper.renderOrder = 0;
				this.gridHelper.material.depthWrite = false;
				// Make grid 50% dimmer
				this.gridHelper.material.transparent = true;
				this.gridHelper.material.opacity = 0.5;
				
				this.scene.add(this.gridHelper);
			} else {
				this.scene.remove(this.gridHelper);
				this.gridHelper = null;
				this.axesRenderer.clear();
			}
		}

		this.controls.autoRotate = this.state.autoRotate;
	}

	updateBackground() {
		this.backgroundColor.set(this.state.bgColor);
	}

	/**
	 * Adds AxesHelper.
	 *
	 * See: https://stackoverflow.com/q/16226693/1314762
	 */
	addAxesHelper() {
		this.axesDiv = document.createElement('div');
		this.el.appendChild(this.axesDiv);
		this.axesDiv.classList.add('axes');
		
		// Set fixed size for axes helper
		this.axesDiv.style.width = '100px';
		this.axesDiv.style.height = '100px';

		const axesSize = 100;

		this.axesScene = new Scene();
		this.axesCamera = new PerspectiveCamera(50, 1, 0.1, 10);
		this.axesScene.add(this.axesCamera);

		this.axesRenderer = new WebGLRenderer({ alpha: true });
		this.axesRenderer.setPixelRatio(window.devicePixelRatio);
		this.axesRenderer.setSize(axesSize, axesSize);

		this.axesCamera.up = this.defaultCamera.up;

		// Create custom axes with uniform shorter lengths
		const xLength = 1.8;
		const yLength = 1.8;
		const zLength = 1.8;
		
		this.axesCorner = new Group();
		
		// X axis (red)
		const xGeometry = new BufferGeometry();
		xGeometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, xLength, 0, 0], 3));
		xGeometry.setAttribute('color', new Float32BufferAttribute([1, 0, 0, 1, 0, 0], 3));
		const xMaterial = new LineBasicMaterial({ vertexColors: true, linewidth: 3 });
		const xAxis = new LineSegments(xGeometry, xMaterial);
		this.axesCorner.add(xAxis);
		
		// Y axis (green)
		const yGeometry = new BufferGeometry();
		yGeometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, yLength, 0], 3));
		yGeometry.setAttribute('color', new Float32BufferAttribute([0, 1, 0, 0, 1, 0], 3));
		const yMaterial = new LineBasicMaterial({ vertexColors: true, linewidth: 3 });
		const yAxis = new LineSegments(yGeometry, yMaterial);
		this.axesCorner.add(yAxis);
		
		// Z axis (blue)
		const zGeometry = new BufferGeometry();
		zGeometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, zLength], 3));
		zGeometry.setAttribute('color', new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 3));
		const zMaterial = new LineBasicMaterial({ vertexColors: true, linewidth: 3 });
		const zAxis = new LineSegments(zGeometry, zMaterial);
		this.axesCorner.add(zAxis);
		
		this.axesScene.add(this.axesCorner);
		this.axesDiv.appendChild(this.axesRenderer.domElement);
	}

	addGUI() {
		const gui = (this.gui = new GUI({
			autoPlace: false,
			width: 260,
			hideable: true,
		}));

		// Display controls.
		const dispFolder = gui.addFolder('Display');
		const envBackgroundCtrl = dispFolder.add(this.state, 'background');
		envBackgroundCtrl.onChange(() => this.updateEnvironment());
		const autoRotateCtrl = dispFolder.add(this.state, 'autoRotate');
		autoRotateCtrl.onChange(() => this.updateDisplay());
		const wireframeCtrl = dispFolder.add(this.state, 'wireframe');
		wireframeCtrl.onChange(() => this.updateDisplay());
		const skeletonCtrl = dispFolder.add(this.state, 'skeleton');
		skeletonCtrl.onChange(() => this.updateDisplay());
		const gridCtrl = dispFolder.add(this.state, 'grid');
		gridCtrl.onChange(() => this.updateDisplay());
		dispFolder.add(this.controls, 'screenSpacePanning');
		const pointSizeCtrl = dispFolder.add(this.state, 'pointSize', 1, 16);
		pointSizeCtrl.onChange(() => this.updateDisplay());
		const bgColorCtrl = dispFolder.addColor(this.state, 'bgColor');
		bgColorCtrl.onChange(() => this.updateBackground());

		// Lighting controls.
		const lightFolder = gui.addFolder('Lighting');
		const envMapCtrl = lightFolder.add(
			this.state,
			'environment',
			environments.map((env) => env.name),
		);
		envMapCtrl.onChange(() => this.updateEnvironment());
		[
			lightFolder.add(this.state, 'toneMapping', {
				Linear: LinearToneMapping,
				'ACES Filmic': ACESFilmicToneMapping,
			}),
			lightFolder.add(this.state, 'exposure', -10, 10, 0.01),
			lightFolder.add(this.state, 'punctualLights').listen(),
			lightFolder.add(this.state, 'ambientIntensity', 0, 2),
			lightFolder.addColor(this.state, 'ambientColor'),
			lightFolder.add(this.state, 'directIntensity', 0, 4), // TODO(#116)
			lightFolder.addColor(this.state, 'directColor'),
		].forEach((ctrl) => ctrl.onChange(() => this.updateLights()));

		// Animation controls.
		this.animFolder = gui.addFolder('Animation');
		this.animFolder.domElement.style.display = 'none';
		const playbackSpeedCtrl = this.animFolder.add(this.state, 'playbackSpeed', 0, 1);
		playbackSpeedCtrl.onChange((speed) => {
			if (this.mixer) this.mixer.timeScale = speed;
		});
		this.animFolder.add({ playAll: () => this.playAllClips() }, 'playAll');

		// Morph target controls.
		this.morphFolder = gui.addFolder('Morph Targets');
		this.morphFolder.domElement.style.display = 'none';

		// Camera controls.
		this.cameraFolder = gui.addFolder('Cameras');
		this.cameraFolder.domElement.style.display = 'none';

		// Stats.
		const perfFolder = gui.addFolder('Performance');
		const perfLi = document.createElement('li');
		this.stats.dom.style.position = 'static';
		perfLi.appendChild(this.stats.dom);
		perfLi.classList.add('gui-stats');
		perfFolder.__ul.appendChild(perfLi);

		const guiWrap = document.createElement('div');
		this.el.appendChild(guiWrap);
		guiWrap.classList.add('gui-wrap');
		guiWrap.appendChild(gui.domElement);
		gui.open();
	}

	updateGUI() {
		this.cameraFolder.domElement.style.display = 'none';

		this.morphCtrls.forEach((ctrl) => ctrl.remove());
		this.morphCtrls.length = 0;
		this.morphFolder.domElement.style.display = 'none';

		this.animCtrls.forEach((ctrl) => ctrl.remove());
		this.animCtrls.length = 0;
		this.animFolder.domElement.style.display = 'none';

		const cameraNames = [];
		const morphMeshes = [];
		this.content.traverse((node) => {
			if (node.geometry && node.morphTargetInfluences) {
				morphMeshes.push(node);
			}
			if (node.isCamera) {
				node.name = node.name || `VIEWER__camera_${cameraNames.length + 1}`;
				cameraNames.push(node.name);
			}
		});

		if (cameraNames.length) {
			this.cameraFolder.domElement.style.display = '';
			if (this.cameraCtrl) this.cameraCtrl.remove();
			const cameraOptions = [DEFAULT_CAMERA].concat(cameraNames);
			this.cameraCtrl = this.cameraFolder.add(this.state, 'camera', cameraOptions);
			this.cameraCtrl.onChange((name) => this.setCamera(name));
		}

		if (morphMeshes.length) {
			this.morphFolder.domElement.style.display = '';
			morphMeshes.forEach((mesh) => {
				if (mesh.morphTargetInfluences.length) {
					const nameCtrl = this.morphFolder.add(
						{ name: mesh.name || 'Untitled' },
						'name',
					);
					this.morphCtrls.push(nameCtrl);
				}
				for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
					const ctrl = this.morphFolder
						.add(mesh.morphTargetInfluences, i, 0, 1, 0.01)
						.listen();
					Object.keys(mesh.morphTargetDictionary).forEach((key) => {
						if (key && mesh.morphTargetDictionary[key] === i) ctrl.name(key);
					});
					this.morphCtrls.push(ctrl);
				}
			});
		}

		if (this.clips.length) {
			this.animFolder.domElement.style.display = '';
			const actionStates = (this.state.actionStates = {});
			this.clips.forEach((clip, clipIndex) => {
				clip.name = `${clipIndex + 1}. ${clip.name}`;

				// Autoplay the first clip.
				let action;
				if (clipIndex === 0) {
					actionStates[clip.name] = true;
					action = this.mixer.clipAction(clip);
					action.play();
				} else {
					actionStates[clip.name] = false;
				}

				// Play other clips when enabled.
				const ctrl = this.animFolder.add(actionStates, clip.name).listen();
				ctrl.onChange((playAnimation) => {
					action = action || this.mixer.clipAction(clip);
					action.setEffectiveTimeScale(1);
					playAnimation ? action.play() : action.stop();
				});
				this.animCtrls.push(ctrl);
			});
		}
	}

	clear() {
		if (!this.content) return;

		this.scene.remove(this.content);

		// dispose geometry
		this.content.traverse((node) => {
			if (!node.geometry) return;

			node.geometry.dispose();
		});

		// dispose textures
		traverseMaterials(this.content, (material) => {
			for (const key in material) {
				if (key !== 'envMap' && material[key] && material[key].isTexture) {
					material[key].dispose();
				}
			}
		});
	}
}

function traverseMaterials(object, callback) {
	object.traverse((node) => {
		if (!node.geometry) return;
		const materials = Array.isArray(node.material) ? node.material : [node.material];
		materials.forEach(callback);
	});
}

// https://stackoverflow.com/a/9039885/1314762
function isIOS() {
	return (
		['iPad Simulator', 'iPhone Simulator', 'iPod Simulator', 'iPad', 'iPhone', 'iPod'].includes(
			navigator.platform,
		) ||
		// iPad on iOS 13 detection
		(navigator.userAgent.includes('Mac') && 'ontouchend' in document)
	);
}
