# BrainDrive Settings Plugin

[![License](https://img.shields.io/badge/License-MIT%20License-green.svg)](LICENSE)
[![BrainDrive](https://img.shields.io/badge/BrainDrive-Plugin-purple.svg)](https://github.com/BrainDriveAI/BrainDrive-Core)

A comprehensive settings management plugin for [BrainDrive](https://github.com/BrainDriveAI/BrainDrive-Core) that provides essential configuration capabilities including theme management, general settings, and Ollama server configuration.

## 🚀 Features

### 📱 Three Core Modules

1. **Theme Settings (`ComponentTheme`)**
   - Light/Dark theme switching
   - System theme detection
   - Real-time theme updates
   - Persistent theme preferences

2. **General Settings (`ComponentGeneralSettings`)**
   - Default page configuration
   - Application-wide preferences
   - User customization options
   - Settings persistence

3. **Ollama Server Management (`ComponentOllamaServer`)**
   - Multiple Ollama server connections
   - Server status monitoring
   - Connection testing
   - Server configuration management

### 🎨 Built with Modern Technologies

- **React 18.3.1** - Modern React with hooks and concurrent features
- **TypeScript** - Type-safe development
- **Material-UI (MUI)** - Professional UI components
- **Webpack 5** - Module federation for plugin architecture
- **PostCSS** - Advanced CSS processing

## 📋 Prerequisites

- **BrainDrive** - This plugin requires BrainDrive to be installed and running
- **Node.js** - Version 16 or higher
- **npm** - Package manager

## 🛠️ Development Setup

### 1. Clone and Install Dependencies

```bash
# Navigate to the plugin directory
cd PluginBuild/BrainDriveSettings

# Install dependencies
npm install
```

### 2. Production Build

```bash
# Build for production
npm run build
```

This creates optimized bundles in the `dist/` directory, including the critical `remoteEntry.js` file required by BrainDrive's module federation system.

## 📦 Plugin Installation

**Important:** This plugin must be installed within BrainDrive to function properly. It cannot run standalone.

### Method 1: BrainDrive Plugin Manager (Recommended)

1. Open BrainDrive application
2. Navigate to **Plugin Manager**
3. Click **Install Plugin**
4. Provide the plugin source URL: `https://github.com/DJJones66/BrainDriveSettings`
5. Follow the installation prompts

### Method 2: Manual Installation

1. Build the plugin:
   ```bash
   npm run build
   ```

2. Copy the plugin to BrainDrive's plugin directory:
   ```bash
   cp -r . /path/to/braindrive/backend/plugins/shared/BrainDriveSettings/v1.0.0/
   ```

3. Install via BrainDrive's lifecycle manager:
   ```bash
   cd /path/to/braindrive
   python -m backend.app.plugins.lifecycle_service install BrainDriveSettings 1.0.0
   ```

## 🏗️ Architecture

### Plugin Structure

```
BrainDriveSettings/
├── src/
│   ├── components/           # React components
│   │   ├── GeneralSettings/  # General settings module
│   │   ├── AIPromptChat/     # AI chat integration
│   │   └── icons/           # Icon components
│   ├── hooks/               # Custom React hooks
│   ├── services/            # Service layer
│   ├── types/               # TypeScript definitions
│   ├── utils/               # Utility functions
│   ├── ComponentTheme.tsx   # Theme settings module
│   ├── ComponentOllamaServer.tsx  # Ollama server module
│   └── index.tsx           # Plugin entry point
├── public/                  # Static assets
├── dist/                   # Built files (generated)
├── lifecycle_manager.py    # Plugin lifecycle management
├── package.json           # Dependencies and scripts
├── webpack.config.js      # Webpack configuration
└── tsconfig.json         # TypeScript configuration
```

### Module Federation

This plugin uses Webpack's Module Federation to integrate with BrainDrive:

- **Remote Entry:** `dist/remoteEntry.js`
- **Exposed Modules:** Theme, GeneralSettings, OllamaServer
- **Shared Dependencies:** React, ReactDOM, MUI

### Lifecycle Management

The `lifecycle_manager.py` handles:
- Plugin installation and uninstallation
- Database schema management
- Settings definitions creation
- User-specific configuration
- File management and validation

## 🔧 Configuration

### Settings Definitions

The plugin automatically creates these settings categories:

1. **Theme Settings**
   ```json
   {
     "theme": "dark",
     "useSystemTheme": false
   }
   ```

2. **General Settings**
   ```json
   {
     "settings": [
       {
         "Setting_Name": "default_page",
         "Setting_Data": "Dashboard",
         "Setting_Help": "First page displayed after login"
       }
     ]
   }
   ```

3. **Ollama Server Settings**
   ```json
   {
     "servers": [
       {
         "id": "server_1",
         "serverName": "Local Ollama",
         "serverAddress": "http://localhost:11434",
         "apiKey": "",
         "connectionStatus": "idle"
       }
     ]
   }
   ```

### Environment Variables

No environment variables required - all configuration is managed through BrainDrive's settings system.

## 🧪 Testing

### Manual Testing

1. **Build the plugin:**
   ```bash
   npm run build
   ```

2. **Install in BrainDrive** (see installation instructions above)

3. **Test each module:**
   - Navigate to Plugin Manager
   - Verify all three modules appear
   - Test theme switching functionality
   - Configure general settings
   - Add/test Ollama server connections

### Plugin Loading Test

BrainDrive includes a built-in plugin test feature:

1. Go to Plugin Manager → Plugin Details
2. Click **"Test Plugin"** button
3. Review test results for:
   - File existence validation
   - Bundle accessibility
   - Module configuration
   - Service dependencies

## 🚨 Troubleshooting

### Common Issues

1. **Plugin won't install:**
   - Verify BrainDrive is running
   - Check that `dist/remoteEntry.js` exists after build
   - Ensure all dependencies are installed

2. **Modules not appearing:**
   - Check browser console for errors
   - Verify plugin is enabled in Plugin Manager
   - Restart BrainDrive application

3. **Settings not persisting:**
   - Check database connectivity
   - Verify settings definitions were created
   - Check user permissions

### Debug Mode

Enable debug logging in `lifecycle_manager.py`:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Build Issues

```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear webpack cache
rm -rf dist/
npm run build
```

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch:** `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Test thoroughly** in BrainDrive environment
5. **Commit changes:** `git commit -m 'Add amazing feature'`
6. **Push to branch:** `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Follow TypeScript best practices
- Use Material-UI components consistently
- Maintain responsive design
- Add proper error handling
- Update tests for new features
- Document API changes

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **BrainDrive Repository:** [https://github.com/BrainDrive/BrainDrive](https://github.com/BrainDrive/BrainDrive)
- **Plugin Documentation:** [BrainDrive Plugin Development Guide](../../docs/plugins_how_to/)
- **Issue Tracker:** [GitHub Issues](https://github.com/DJJones66/BrainDriveSettings/issues)

## 📞 Support

- **Documentation:** Check the [BrainDrive Plugin Documentation](../../docs/plugins_how_to/)
- **Issues:** Report bugs via [GitHub Issues](https://github.com/DJJones66/BrainDriveSettings/issues)
- **Community:** Join the BrainDrive community discussions

---

**Note:** This plugin is designed specifically for BrainDrive and cannot function as a standalone application. It requires BrainDrive's plugin architecture and services to operate properly.
