# 3D Model Thumbnail Editor

A simple web application for creating and comparing thumbnails of 3D models with an interactive viewer.

## Features

- **3D Viewer**: Interactive viewer with high-quality 3D car models loaded via GLTF
- **Camera Controls**: 
  - Mouse drag to orbit around the model
  - Mouse wheel to zoom in/out
  - Hold Shift + drag to pan the camera
  - Reset View button
- **Orientation Indicator**: Mini XYZ axis view in the corner showing camera orientation
- **Thumbnail Management**: 
  - View current thumbnail
  - Take new snapshots
  - Compare new snapshot with current thumbnail
  - Apply new snapshot as current thumbnail

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open your browser to the URL shown in the terminal (typically `http://localhost:5173`)

## How to Use

1. Use your mouse to interact with the 3D model:
   - Click and drag to rotate the camera around the model
   - Use the mouse wheel to zoom in and out
   - Hold Shift and drag to pan the camera
2. When you find the desired angle, click "Take Snapshot" to capture the view
3. The new snapshot will appear in the "New Snapshot" section
4. Click "Use as Current Thumbnail" to set it as the current thumbnail

## Technologies

- HTML5
- CSS3 (Dark Mode Theme)
- JavaScript (ES6+ modules)
- Three.js (v0.160.0) - 3D graphics library
- Vite - Build tool and development server
- dat.GUI - Control panel interface

## Credits

The GLTF viewer environment is based on [three-gltf-viewer](https://github.com/donmccurdy/three-gltf-viewer) by Don McCurdy.

## Project Structure

- `index.html` - Main HTML structure
- `style.css` - Styling and layout
- `main.js` - Application entry point
- `app.js` - 3D viewer logic and controls
- `viewer.js` - GLTF viewer environment
- `environments.js` - HDR environment configurations
- `assets/` - 3D model files (GLTF format)
- `package.json` - NPM dependencies and scripts
- `vite.config.js` - Vite build configuration

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

