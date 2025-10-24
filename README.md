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

## How to Use

1. Open `index.html` in a web browser
2. Use your mouse to interact with the 3D model:
   - Click and drag to rotate the camera around the model
   - Use the mouse wheel to zoom in and out
   - Hold Shift and drag to pan the camera
3. When you find the desired angle, click "Take Snapshot" to capture the view
4. The new snapshot will appear in the "New Snapshot" section
5. Click "Use as Current Thumbnail" to set it as the current thumbnail

## Technologies

- HTML5
- CSS3 (Dark Mode Theme)
- JavaScript
- Three.js (r128) - 3D graphics library

## Credits

The GLTF viewer environment is based on [three-gltf-viewer](https://github.com/donmccurdy/three-gltf-viewer) by Don McCurdy.

## Files

- `index.html` - Main HTML structure
- `style.css` - Styling and layout
- `app.js` - 3D viewer logic and controls

No build process required - just open index.html in a modern web browser!

