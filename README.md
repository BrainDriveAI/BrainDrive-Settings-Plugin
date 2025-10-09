# BrainDrive Settings Plugin

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/BrainDriveAI/BrainDrive-Settings-Plugin)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![BrainDrive](https://img.shields.io/badge/BrainDrive-Plugin-purple.svg)](https://github.com/BrainDriveAI/BrainDrive)

Core BrainDrive configuration plugin providing theme selection and general preference management. Ollama-specific functionality now lives in the dedicated [BrainDrive Ollama Plugin](https://github.com/BrainDriveAI/BrainDrive-Ollama-Plugin).

## Features
- Theme selector with system detection and persisted preferences
- General settings module for default page and application-level options
- Webpack Module Federation exposes `ComponentTheme` and `ComponentGeneralSettings`

## Getting Started
```bash
cd PluginBuild/BrainDrive-Settings-Plugin
npm install
npm run build
```
Artifacts are emitted to `dist/remoteEntry.js` for BrainDrive to consume.

## Development Notes
- Library name: `BrainDriveSettings`
- Remote modules: `ComponentTheme`, `ComponentGeneralSettings`
- Dependencies trimmed to reflect theme/general scope only; Ollama assets were extracted to the new plugin

## Lifecycle Manager
`lifecycle_manager.py` registers the plugin with BrainDrive, exposes module metadata, and seeds default settings definitions for theme and general configuration.

## Migration
Existing deployments should install version `1.1.0` alongside the new BrainDrive Ollama plugin to retain all prior functionality.

## License
MIT © BrainDrive.ai
