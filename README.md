# BrainDrive Settings Plugin

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/BrainDriveAI/BrainDrive-Settings-Plugin)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![BrainDrive](https://img.shields.io/badge/BrainDrive-Plugin-purple.svg)](https://github.com/BrainDriveAI/BrainDrive)

Core [BrainDrive](https://braindrive.ai) configuration plugin providing theme selection and general preference management. 

![BrainDrive Settings Page](https://raw.githubusercontent.com/BrainDriveAI/BrainDrive-Core/refs/heads/main/images/braindrive-settings-page.png)

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

## License

[MIT License](./LICENSE) Your AI. Your Rules.

## Resources

* [BrainDrive Docs Site](https://docs.braindrive.ai) - Learn how to use, modify,and build on your BrainDrive.
* [BrainDrive Community](https://community.braindrive.ai) - Get support and collaborate with us in building the future of the user-owned AI movement.
* [Contributing](https://docs.braindrive.ai/core/CONTRIBUTING) - We encourage and appreciate contributions, including improving this settings plugin and/or building your own.

We're on a mission to build a superior, user-owned alternative to Big Tech AI systems. Thank you for joining us on this journey away from Big Tech extraction, and towards individual freedom and empowerment. 
