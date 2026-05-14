# Sticher

Sticher is a lightweight web tool for creating seamless image carousels by splitting a single image into multiple slides. It is designed for creators who want to build swipeable, multi-part visual stories for platforms like Instagram without using complex design software.

Instead of manually slicing images or relying on heavy design tools, Sticher lets you upload an image, adjust its layout in a visual editor, choose the number of slides, and export a ready-to-post carousel in seconds.

---

## Features

- Upload any image and work in a visual canvas editor  
- Split images into equal carousel slides (2–10+ sections)  
- Drag, scale, and position content before exporting  
- Visual slice guides for precise alignment  
- One-click export of all slices as PNGs  
- Download all images as a ZIP file  

---

## How it works

Sticher uses a wide canvas approach:

1. The image is placed on a large horizontal canvas  
2. Vertical slice guides divide the canvas into equal sections  
3. Each section is exported as an individual image using the browser canvas API  
4. The output is a sequence of images that form a seamless carousel when posted in order  

---

## Tech stack

- Vite + React + TypeScript  
- Konva.js for canvas rendering and interactions  
- Native Canvas API for image slicing and export  
- JSZip for bundling exports  
- Tailwind CSS for styling  
- GitHub Pages for deployment  

---

## Getting started

```bash
npm install
npm run dev