# README demo source

`index.html` is the deterministic 1120×600 composition; `index.motion.json` records its timing checks. The animation uses finite CSS keyframes, so rendering needs no CDN or project dependency.

From the repository root, run `powershell -ExecutionPolicy Bypass -File .\tools\readme-demo\render-demo.ps1`. The script uses HyperFrames 0.8.29 and local FFmpeg, writes the GIF and still poster under `assets/`, and keeps the temporary MP4 under the operating system temp directory.
