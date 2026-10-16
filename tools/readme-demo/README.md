# README demo source

`index.html` is the deterministic 1440×810 composition; `index.motion.json` records its timing and framing checks. The motion uses finite CSS keyframes and needs no CDN or project dependency. The GIF is 1120×630; the poster keeps the full 1440×810 source resolution and is captured after the review steps arrive.

From the repository root, run `powershell -ExecutionPolicy Bypass -File .\tools\readme-demo\render-demo.ps1`. The script uses HyperFrames 0.8.29 and local FFmpeg, writes the GIF and still poster under `assets/`, and keeps the temporary MP4 under the operating system temp directory.
