#!/usr/bin/env python3
"""
BrainDriveSettings Plugin Lifecycle Manager (New Architecture)

This script handles install/update/delete operations for the BrainDriveSettings plugin
using the new multi-user plugin lifecycle management architecture.
"""

import json
import logging
import datetime
import os
import shutil
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import structlog

logger = structlog.get_logger()

# Import the new base lifecycle manager
try:
    # Try to import from the BrainDrive system first (when running in production)
    from app.plugins.base_lifecycle_manager import BaseLifecycleManager
    logger.info("Using new architecture: BaseLifecycleManager imported from app.plugins")
except ImportError:
    try:
        # Try local import for development
        import sys
        current_dir = os.path.dirname(os.path.abspath(__file__))
        backend_path = os.path.join(current_dir, "..", "..", "backend", "app", "plugins")
        backend_path = os.path.abspath(backend_path)
        
        if os.path.exists(backend_path):
            if backend_path not in sys.path:
                sys.path.insert(0, backend_path)
            from base_lifecycle_manager import BaseLifecycleManager
            logger.info(f"Using new architecture: BaseLifecycleManager imported from local backend: {backend_path}")
        else:
            # For remote installation, the base class might not be available
            # In this case, we'll create a minimal implementation
            logger.warning(f"BaseLifecycleManager not found at {backend_path}, using minimal implementation")
            from abc import ABC, abstractmethod
            from datetime import datetime
            from pathlib import Path
            from typing import Set
            
            class BaseLifecycleManager(ABC):
                """Minimal base class for remote installations"""
                def __init__(self, plugin_slug: str, version: str, shared_storage_path: Path):
                    self.plugin_slug = plugin_slug
                    self.version = version
                    self.shared_path = shared_storage_path
                    self.active_users: Set[str] = set()
                    self.instance_id = f"{plugin_slug}_{version}"
                    self.created_at = datetime.now()
                    self.last_used = datetime.now()
                
                async def install_for_user(self, user_id: str, db, shared_plugin_path: Path):
                    if user_id in self.active_users:
                        return {'success': False, 'error': 'Plugin already installed for user'}
                    result = await self._perform_user_installation(user_id, db, shared_plugin_path)
                    if result['success']:
                        self.active_users.add(user_id)
                        self.last_used = datetime.now()
                    return result
                
                async def uninstall_for_user(self, user_id: str, db):
                    if user_id not in self.active_users:
                        return {'success': False, 'error': 'Plugin not installed for user'}
                    result = await self._perform_user_uninstallation(user_id, db)
                    if result['success']:
                        self.active_users.discard(user_id)
                        self.last_used = datetime.now()
                    return result
                
                @abstractmethod
                async def get_plugin_metadata(self): pass
                @abstractmethod
                async def get_module_metadata(self): pass
                @abstractmethod
                async def _perform_user_installation(self, user_id, db, shared_plugin_path): pass
                @abstractmethod
                async def _perform_user_uninstallation(self, user_id, db): pass
            
            logger.info("Using minimal BaseLifecycleManager implementation for remote installation")
            
    except ImportError as e:
        logger.error(f"Failed to import BaseLifecycleManager: {e}")
        raise ImportError("BrainDriveSettings plugin requires the new architecture BaseLifecycleManager")


class BrainDriveSettingsLifecycleManager(BaseLifecycleManager):
    """Lifecycle manager for BrainDriveSettings plugin using new architecture"""
    
    def __init__(self, plugins_base_dir: str = None):
        """Initialize the lifecycle manager"""
        # Plugin-specific data adapted from the old initializer
        self.plugin_data = {
            "name": "BrainDrive Settings",
            "description": "Basic BrainDrive Settings Plugin",
            "version": "1.0.3",
            "type": "frontend",
            "icon": "Dashboard",
            "category": "Utilities",
            "official": True,
            "author": "BrainDrive Team",
            "compatibility": "1.0.0",
            "scope": "BrainDriveSettings",
            "bundle_method": "webpack",
            "bundle_location": "dist/remoteEntry.js",
            "is_local": False,
            "long_description": "Comprehensive settings management for BrainDrive including theme settings, general configuration, and Ollama server management.",
            "plugin_slug": "BrainDriveSettings",
            # Update tracking fields (matching plugin model)
            "source_type": "remote",
            "source_url": "https://github.com/DJJones66/BrainDriveSettings",
            "update_check_url": "https://api.github.com/repos/DJJones66/BrainDriveSettings/releases/latest",
            "last_update_check": None,
            "update_available": False,
            "latest_version": None,
            "installation_type": "remote",
            "permissions": ["storage.read", "storage.write", "api.access", "settings.manage"]
        }
        
        # Module data adapted from the old initializer
        self.module_data = [
            {
                "name": "ComponentTheme",
                "display_name": "Theme Settings",
                "description": "Change application theme",
                "icon": "DarkMode",
                "category": "Settings",
                "priority": 1,
                "props": {},
                "config_fields": {},
                "messages": {"sends": [], "receives": []},
                "required_services": {
                    "theme": {
                        "methods": ["getCurrentTheme", "setTheme", "toggleTheme", "addThemeChangeListener", "removeThemeChangeListener"],
                        "version": "1.0.0"
                    },
                    "settings": {
                        "methods": ["getSetting", "setSetting", "registerSettingDefinition", "getSettingDefinitions", "subscribe", "subscribeToCategory"],
                        "version": "1.0.0"
                    }
                },
                "dependencies": [],
                "layout": {
                    "minWidth": 6,
                    "minHeight": 1,
                    "defaultWidth": 12,
                    "defaultHeight": 1
                },
                "tags": ["Settings", "Theme Settings"]
            },
            {
                "name": "ComponentGeneralSettings",
                "display_name": "General Settings",
                "description": "Manage general application settings",
                "icon": "Settings",
                "category": "Settings",
                "priority": 1,
                "props": {},
                "config_fields": {},
                "messages": {"sends": [], "receives": []},
                "required_services": {
                    "api": {
                        "methods": ["get", "post"],
                        "version": "1.0.0"
                    },
                    "theme": {
                        "methods": ["getCurrentTheme", "addThemeChangeListener", "removeThemeChangeListener"],
                        "version": "1.0.0"
                    },
                    "settings": {
                        "methods": ["getSetting", "setSetting", "registerSettingDefinition", "getSettingDefinitions", "subscribe", "subscribeToCategory"],
                        "version": "1.0.0"
                    }
                },
                "dependencies": [],
                "layout": {
                    "minWidth": 6,
                    "minHeight": 1,
                    "defaultWidth": 12,
                    "defaultHeight": 1
                },
                "tags": ["Settings", "General Settings"]
            },
            {
                "name": "ComponentOllamaServer",
                "display_name": "Ollama Servers",
                "description": "Manage multiple Ollama server connections",
                "icon": "Storage",
                "category": "LLM Servers",
                "priority": 1,
                "props": {},
                "config_fields": {},
                "messages": {"sends": [], "receives": []},
                "required_services": {
                    "api": {
                        "methods": ["get", "post", "delete"],
                        "version": "1.0.0"
                    },
                    "theme": {
                        "methods": ["getCurrentTheme", "addThemeChangeListener", "removeThemeChangeListener"],
                        "version": "1.0.0"
                    },
                    "settings": {
                        "methods": ["getSetting", "setSetting", "registerSettingDefinition", "getSettingDefinitions", "subscribe", "subscribeToCategory"],
                        "version": "1.0.0"
                    }
                },
                "dependencies": [],
                "layout": {
                    "minWidth": 6,
                    "minHeight": 4,
                    "defaultWidth": 8,
                    "defaultHeight": 5
                },
                "tags": ["Settings", "Ollama Server Settings", "Multiple Servers"]
            }
        ]
        
        # Settings definitions that this plugin requires - EXACT match to working database
        self.PLUGIN_SETTINGS_DEFINITIONS = [
            {
                "id": "theme_settings",
                "name": "Theme Settings",
                "description": "Auto-generated definition for Theme Settings",
                "category": "auto_generated",
                "type": "object",
                "default_value": '{"theme": "light", "useSystemTheme": false}',
                "allowed_scopes": '["system", "user", "page", "user_page"]',
                "validation": None,
                "is_multiple": False,
                "tags": '["auto_generated"]'
            },
            {
                "id": "ollama_servers_settings",
                "name": "Ollama Servers Settings",
                "description": "Auto-generated definition for Ollama Servers Settings",
                "category": "auto_generated",
                "type": "object",
                "default_value": '{"servers": [{"id": "server_1742054635336_5puc3mrll", "serverName": "New Server", "serverAddress": "http://localhost:11434", "apiKey": "", "connectionStatus": "idle"}]}',
                "allowed_scopes": '["system", "user", "page", "user_page"]',
                "validation": None,
                "is_multiple": False,
                "tags": '["auto_generated"]'
            },
            {
                "id": "general_settings",
                "name": "General Settings",
                "description": "Auto-generated definition for General Settings",
                "category": "auto_generated",
                "type": "object",
                "default_value": '{"settings":[{"Setting_Name":"default_page","Setting_Data":"Dashboard","Setting_Help":"This is the first page to be displayed after logging in to BrainDrive"}]}',
                "allowed_scopes": '["system", "user", "page", "user_page"]',
                "validation": None,
                "is_multiple": False,
                "tags": '["auto_generated"]'
            }
        ]
        
        # Initialize base class with required parameters
        logger.info(f"BrainDriveSettings: plugins_base_dir - {plugins_base_dir}")
        if plugins_base_dir:
            # When instantiated by the remote installer, plugins_base_dir points to the plugins directory
            # Shared plugins are stored under plugins_base_dir/shared/plugin_slug/version
            shared_path = Path(plugins_base_dir) / "shared" / self.plugin_data['plugin_slug'] / f"v{self.plugin_data['version']}"
        else:
            # When running from the PluginBuild directory during development,
            # resolve the path to backend/plugins/shared
            shared_path = Path(__file__).parent.parent.parent / "backend" / "plugins" / "shared" / self.plugin_data['plugin_slug'] / f"v{self.plugin_data['version']}"
        logger.info(f"BrainDriveSettings: shared_path - {shared_path}")
        super().__init__(
            plugin_slug=self.plugin_data['plugin_slug'],
            version=self.plugin_data['version'],
            shared_storage_path=shared_path
        )
    
    @property
    def PLUGIN_DATA(self):
        """Compatibility property for remote installer validation"""
        return self.plugin_data
    
    async def get_plugin_metadata(self) -> Dict[str, Any]:
        """Return plugin metadata and configuration"""
        return self.plugin_data
    
    async def get_module_metadata(self) -> list:
        """Return module definitions for this plugin"""
        return self.module_data
    
    async def _perform_user_installation(self, user_id: str, db: AsyncSession, shared_plugin_path: Path) -> Dict[str, Any]:
        """Perform user-specific installation using shared plugin path"""
        try:
            # Create database records for this user
            db_result = await self._create_database_records(user_id, db)
            if not db_result['success']:
                return db_result
            
            logger.info(f"BrainDriveSettings: User installation completed for {user_id}")
            return {
                'success': True,
                'plugin_id': db_result['plugin_id'],
                'plugin_slug': self.plugin_data['plugin_slug'],
                'plugin_name': self.plugin_data['name'],
                'modules_created': db_result['modules_created']
            }
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: User installation failed for {user_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _perform_user_uninstallation(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Perform user-specific uninstallation"""
        try:
            # Check if plugin exists for user
            existing_check = await self._check_existing_plugin(user_id, db)
            if not existing_check['exists']:
                return {'success': False, 'error': 'Plugin not found for user'}
            
            plugin_id = existing_check['plugin_id']
            
            # Delete database records
            delete_result = await self._delete_database_records(user_id, plugin_id, db)
            if not delete_result['success']:
                return delete_result
            
            logger.info(f"BrainDriveSettings: User uninstallation completed for {user_id}")
            return {
                'success': True,
                'plugin_id': plugin_id,
                'deleted_modules': delete_result['deleted_modules']
            }
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: User uninstallation failed for {user_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _copy_plugin_files_impl(self, user_id: str, target_dir: Path, update: bool = False) -> Dict[str, Any]:
        """
        BrainDriveSettings-specific implementation of file copying.
        This method is called by the base class during installation.
        Copies all files from the plugin source directory to the target directory.
        """
        try:
            source_dir = Path(__file__).parent
            copied_files = []
            
            # Define files and directories to exclude
            exclude_patterns = {
                'node_modules',
                'package-lock.json',
                '.git',
                '.gitignore',
                '__pycache__',
                '*.pyc',
                '.DS_Store',
                'Thumbs.db'
            }
            
            def should_copy(path: Path) -> bool:
                """Check if a file/directory should be copied"""
                # Check if any part of the path matches exclude patterns
                for part in path.parts:
                    if part in exclude_patterns:
                        return False
                # Check for pattern matches
                for pattern in exclude_patterns:
                    if '*' in pattern and path.name.endswith(pattern.replace('*', '')):
                        return False
                return True
            
            # Copy all files and directories recursively
            for item in source_dir.rglob('*'):
                # Skip the lifecycle_manager.py file itself to avoid infinite recursion
                if item.name == 'lifecycle_manager.py' and item == Path(__file__):
                    continue
                    
                # Get relative path from source directory
                relative_path = item.relative_to(source_dir)
                
                # Check if we should copy this item
                if not should_copy(relative_path):
                    continue
                
                target_path = target_dir / relative_path
                
                try:
                    if item.is_file():
                        # Create parent directories if they don't exist
                        target_path.parent.mkdir(parents=True, exist_ok=True)
                        
                        # Copy file
                        if update and target_path.exists():
                            target_path.unlink()  # Remove existing file
                        shutil.copy2(item, target_path)
                        copied_files.append(str(relative_path))
                        logger.debug(f"Copied file: {relative_path}")
                        
                    elif item.is_dir():
                        # Create directory
                        target_path.mkdir(parents=True, exist_ok=True)
                        logger.debug(f"Created directory: {relative_path}")
                        
                except Exception as e:
                    logger.warning(f"Failed to copy {relative_path}: {e}")
                    continue
            
            # Also copy the lifecycle_manager.py file itself
            lifecycle_manager_source = source_dir / 'lifecycle_manager.py'
            lifecycle_manager_target = target_dir / 'lifecycle_manager.py'
            if lifecycle_manager_source.exists():
                lifecycle_manager_target.parent.mkdir(parents=True, exist_ok=True)
                if update and lifecycle_manager_target.exists():
                    lifecycle_manager_target.unlink()
                shutil.copy2(lifecycle_manager_source, lifecycle_manager_target)
                copied_files.append('lifecycle_manager.py')
                logger.info(f"Copied lifecycle_manager.py")
            
            logger.info(f"BrainDriveSettings: Copied {len(copied_files)} files/directories to {target_dir}")
            return {'success': True, 'copied_files': copied_files}
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error copying plugin files: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _validate_installation_impl(self, user_id: str, plugin_dir: Path) -> Dict[str, Any]:
        """
        BrainDriveSettings-specific validation logic.
        This method is called by the base class during installation.
        """
        try:
            # Check for BrainDriveSettings-specific required files
            required_files = ["package.json", "dist/remoteEntry.js"]
            missing_files = []
            
            for file_path in required_files:
                if not (plugin_dir / file_path).exists():
                    missing_files.append(file_path)
            
            if missing_files:
                return {
                    'valid': False,
                    'error': f"BrainDriveSettings: Missing required files: {', '.join(missing_files)}"
                }
            
            # Validate package.json structure
            package_json_path = plugin_dir / "package.json"
            try:
                with open(package_json_path, 'r') as f:
                    package_data = json.load(f)
                
                # Check for required package.json fields
                required_fields = ["name", "version"]
                for field in required_fields:
                    if field not in package_data:
                        return {
                            'valid': False,
                            'error': f'BrainDriveSettings: package.json missing required field: {field}'
                        }
                        
            except (json.JSONDecodeError, FileNotFoundError) as e:
                return {
                    'valid': False,
                    'error': f'BrainDriveSettings: Invalid or missing package.json: {e}'
                }
            
            # Validate bundle file exists and is not empty
            bundle_path = plugin_dir / "dist" / "remoteEntry.js"
            if bundle_path.stat().st_size == 0:
                return {
                    'valid': False,
                    'error': 'BrainDriveSettings: Bundle file (remoteEntry.js) is empty'
                }
            
            logger.info(f"BrainDriveSettings: Installation validation passed for user {user_id}")
            return {'valid': True}
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error validating installation: {e}")
            return {'valid': False, 'error': str(e)}
    
    async def _get_plugin_health_impl(self, user_id: str, plugin_dir: Path) -> Dict[str, Any]:
        """
        BrainDriveSettings-specific health check logic.
        This method is called by the base class during status checks.
        """
        try:
            health_info = {
                'bundle_exists': False,
                'bundle_size': 0,
                'package_json_valid': False,
                'assets_present': False
            }
            
            # Check bundle file
            bundle_path = plugin_dir / "dist" / "remoteEntry.js"
            if bundle_path.exists():
                health_info['bundle_exists'] = True
                health_info['bundle_size'] = bundle_path.stat().st_size
            
            # Check package.json
            package_json_path = plugin_dir / "package.json"
            if package_json_path.exists():
                try:
                    with open(package_json_path, 'r') as f:
                        json.load(f)
                    health_info['package_json_valid'] = True
                except json.JSONDecodeError:
                    pass
            
            # Check for assets directory
            assets_dir = plugin_dir / "src"
            if assets_dir.exists() and any(assets_dir.iterdir()):
                health_info['assets_present'] = True
            
            logger.info(f"BrainDriveSettings: Health check completed for user {user_id}")
            return {'healthy': True, 'details': health_info}
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error checking plugin health: {e}")
            return {'healthy': False, 'error': str(e)}
    
    async def _ensure_settings_definitions(self, db: AsyncSession) -> Dict[str, Any]:
        """Ensure that plugin-required settings definitions exist"""
        try:
            for definition_data in self.PLUGIN_SETTINGS_DEFINITIONS:
                # Check if definition already exists
                check_stmt = text("SELECT id FROM settings_definitions WHERE id = :id")
                result = await db.execute(check_stmt, {"id": definition_data["id"]})
                existing = result.scalar_one_or_none()
                
                if not existing:
                    # Create the definition
                    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    
                    insert_stmt = text("""
                    INSERT INTO settings_definitions
                    (id, name, description, category, type, default_value, allowed_scopes, validation, is_multiple, tags, created_at, updated_at)
                    VALUES
                    (:id, :name, :description, :category, :type, :default_value, :allowed_scopes, :validation, :is_multiple, :tags, :created_at, :updated_at)
                    """)
                    
                    await db.execute(insert_stmt, {
                        "id": definition_data["id"],
                        "name": definition_data["name"],
                        "description": definition_data["description"],
                        "category": definition_data["category"],
                        "type": definition_data["type"],
                        "default_value": definition_data["default_value"],
                        "allowed_scopes": definition_data["allowed_scopes"],
                        "validation": definition_data["validation"],
                        "is_multiple": definition_data["is_multiple"],
                        "tags": definition_data["tags"],
                        "created_at": current_time,
                        "updated_at": current_time
                    })
                    
                    logger.info(f"BrainDriveSettings: Created settings definition: {definition_data['name']}")
            
            return {'success': True}
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error ensuring settings definitions: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _create_settings_instances(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Create default settings instances for the user"""
        try:
            settings_instances = [
                {
                    "definition_id": "theme_settings",
                    "name": "Theme Settings",
                    "value": '{"theme": "light", "useSystemTheme": false}',
                    "scope": "user"
                },
                {
                    "definition_id": "ollama_servers_settings",
                    "name": "Ollama Servers Settings",
                    "value": '{"servers": [{"id": "server_1742054635336_5puc3mrll", "serverName": "New Server", "serverAddress": "http://localhost:11434", "apiKey": "", "connectionStatus": "idle"}]}',
                    "scope": "user"
                },
                {
                    "definition_id": "general_settings",
                    "name": "General Settings",
                    "value": '{"settings": [{"Setting_Name": "default_page", "Setting_Data": "Dashboard", "Setting_Help": "This is the first page to be displayed after logging in to BrainDrive"}]}',
                    "scope": "user"
                }
            ]
            
            created_instances = []
            current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            for instance_data in settings_instances:
                # Check if instance already exists for this user
                check_stmt = text("""
                SELECT id FROM settings_instances
                WHERE definition_id = :definition_id AND user_id = :user_id AND scope = :scope
                """)
                
                result = await db.execute(check_stmt, {
                    "definition_id": instance_data["definition_id"],
                    "user_id": user_id,
                    "scope": instance_data["scope"]
                })
                
                existing = result.scalar_one_or_none()
                
                if not existing:
                    # Generate unique ID
                    instance_id = str(uuid4()).replace('-', '')
                    
                    # Create the instance
                    insert_stmt = text("""
                    INSERT INTO settings_instances
                    (id, definition_id, name, value, scope, user_id, page_id, created_at, updated_at)
                    VALUES
                    (:id, :definition_id, :name, :value, :scope, :user_id, :page_id, :created_at, :updated_at)
                    """)
                    
                    await db.execute(insert_stmt, {
                        "id": instance_id,
                        "definition_id": instance_data["definition_id"],
                        "name": instance_data["name"],
                        "value": instance_data["value"],
                        "scope": instance_data["scope"],
                        "user_id": user_id,
                        "page_id": None,
                        "created_at": current_time,
                        "updated_at": current_time
                    })
                    
                    created_instances.append(instance_data["name"])
                    logger.info(f"BrainDriveSettings: Created settings instance: {instance_data['name']} for user {user_id}")
            
            return {'success': True, 'created_instances': created_instances}
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error creating settings instances: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _check_existing_plugin(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Check if plugin already exists for user"""
        try:
            # Check if plugin exists for this user
            check_stmt = text("""
            SELECT id FROM plugin 
            WHERE user_id = :user_id AND plugin_slug = :plugin_slug
            """)
            
            result = await db.execute(check_stmt, {
                "user_id": user_id,
                "plugin_slug": self.plugin_data['plugin_slug']
            })
            
            existing_plugin = result.fetchone()
            
            if existing_plugin:
                return {
                    'exists': True,
                    'plugin_id': existing_plugin[0]
                }
            else:
                return {'exists': False}
                
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error checking existing plugin: {e}")
            return {'exists': False, 'error': str(e)}
    
    async def _create_database_records(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Create plugin and module records in database"""
        try:
            # Check if plugin already exists
            existing_check = await self._check_existing_plugin(user_id, db)
            if existing_check['exists']:
                return {'success': False, 'error': 'Plugin already exists for user'}
            
            # Ensure settings definitions exist
            settings_def_result = await self._ensure_settings_definitions(db)
            if not settings_def_result['success']:
                return settings_def_result
            
            # Create settings instances for user
            settings_inst_result = await self._create_settings_instances(user_id, db)
            if not settings_inst_result['success']:
                return settings_inst_result
            
            # Create plugin record
            plugin_id = f"{user_id}_{self.plugin_data['plugin_slug']}"
            current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            plugin_stmt = text("""
            INSERT INTO plugin
            (id, name, description, version, type, enabled, icon, category, status,
            official, author, last_updated, compatibility, downloads, scope,
            bundle_method, bundle_location, is_local, long_description,
            config_fields, messages, dependencies, created_at, updated_at, user_id, plugin_slug,
            source_type, source_url, update_check_url, last_update_check, update_available,
            latest_version, installation_type, permissions)
            VALUES
            (:id, :name, :description, :version, :type, :enabled, :icon, :category,
            :status, :official, :author, :last_updated, :compatibility, :downloads,
            :scope, :bundle_method, :bundle_location, :is_local, :long_description,
            :config_fields, :messages, :dependencies, :created_at, :updated_at, :user_id, :plugin_slug,
            :source_type, :source_url, :update_check_url, :last_update_check, :update_available,
            :latest_version, :installation_type, :permissions)
            """)
            
            await db.execute(plugin_stmt, {
                "id": plugin_id,
                "name": self.plugin_data["name"],
                "description": self.plugin_data["description"],
                "version": self.plugin_data["version"],
                "type": self.plugin_data["type"],
                "enabled": True,
                "icon": self.plugin_data.get("icon"),
                "category": self.plugin_data.get("category"),
                "status": "activated",
                "official": self.plugin_data.get("official", True),
                "author": self.plugin_data.get("author", "BrainDrive Team"),
                "last_updated": "2025-03-06",
                "compatibility": self.plugin_data.get("compatibility", "1.0.0"),
                "downloads": 0,
                "scope": self.plugin_data.get("scope"),
                "bundle_method": self.plugin_data.get("bundle_method"),
                "bundle_location": self.plugin_data.get("bundle_location"),
                "is_local": self.plugin_data.get("is_local", False),
                "long_description": self.plugin_data.get("long_description"),
                "config_fields": None,
                "messages": None,
                "dependencies": None,
                "created_at": current_time,
                "updated_at": current_time,
                "user_id": user_id,
                "plugin_slug": self.plugin_data.get("plugin_slug"),
                "source_type": self.plugin_data.get("source_type"),
                "source_url": self.plugin_data.get("source_url"),
                "update_check_url": self.plugin_data.get("update_check_url"),
                "last_update_check": self.plugin_data.get("last_update_check"),
                "update_available": self.plugin_data.get("update_available", False),
                "latest_version": self.plugin_data.get("latest_version"),
                "installation_type": self.plugin_data.get("installation_type"),
                "permissions": json.dumps(self.plugin_data.get("permissions", []))
            })
            
            # Create module records
            modules_created = []
            for module_data in self.module_data:
                module_id = f"{user_id}_{module_data['name']}"
                
                module_stmt = text("""
                INSERT INTO module
                (id, plugin_id, name, display_name, description, icon, category, 
                enabled, priority, props, config_fields, messages, required_services, 
                dependencies, layout, tags, created_at, updated_at, user_id)
                VALUES
                (:id, :plugin_id, :name, :display_name, :description, :icon, :category, 
                :enabled, :priority, :props, :config_fields, :messages, :required_services, 
                :dependencies, :layout, :tags, :created_at, :updated_at, :user_id)
                """)
                
                await db.execute(module_stmt, {
                    "id": module_id,
                    "plugin_id": plugin_id,
                    "name": module_data["name"],
                    "display_name": module_data.get("display_name"),
                    "description": module_data.get("description"),
                    "icon": module_data.get("icon"),
                    "category": module_data.get("category"),
                    "enabled": True,
                    "priority": module_data.get("priority", 1),
                    "props": json.dumps(module_data.get("props", {})),
                    "config_fields": json.dumps(module_data.get("config_fields", {})),
                    "messages": json.dumps(module_data.get("messages", {})),
                    "required_services": json.dumps(module_data.get("required_services", {})),
                    "dependencies": json.dumps(module_data.get("dependencies", [])),
                    "layout": json.dumps(module_data.get("layout", {})),
                    "tags": json.dumps(module_data.get("tags", [])),
                    "created_at": current_time,
                    "updated_at": current_time,
                    "user_id": user_id
                })
                
                modules_created.append(module_data["name"])
            
            logger.info(f"BrainDriveSettings: Created plugin, {len(modules_created)} modules, and settings for user {user_id}")
            return {
                'success': True,
                'plugin_id': plugin_id,
                'modules_created': modules_created,
                'settings_created': settings_inst_result['created_instances']
            }
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error creating database records: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _delete_database_records(self, user_id: str, plugin_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Delete plugin and module records from database"""
        try:
            # Delete modules first (foreign key constraint)
            module_stmt = text("""
            DELETE FROM module
            WHERE user_id = :user_id AND plugin_id = :plugin_id
            """)
            
            module_result = await db.execute(module_stmt, {
                "user_id": user_id,
                "plugin_id": plugin_id
            })
            
            deleted_modules = module_result.rowcount
            
            # Delete plugin
            plugin_stmt = text("""
            DELETE FROM plugin
            WHERE user_id = :user_id AND id = :plugin_id
            """)
            
            await db.execute(plugin_stmt, {
                "user_id": user_id,
                "plugin_id": plugin_id
            })
            
            logger.info(f"BrainDriveSettings: Deleted plugin and {deleted_modules} modules for user {user_id}")
            return {
                'success': True,
                'deleted_modules': deleted_modules
            }
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error deleting database records: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _export_user_data(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Export user-specific data for migration during updates"""
        try:
            # Export plugin configuration
            plugin_stmt = text("""
            SELECT config_fields, messages, dependencies
            FROM plugin
            WHERE user_id = :user_id AND plugin_slug = :plugin_slug
            """)
            
            plugin_result = await db.execute(plugin_stmt, {
                "user_id": user_id,
                "plugin_slug": self.plugin_data['plugin_slug']
            })
            
            plugin_row = plugin_result.fetchone()
            plugin_config = {}
            if plugin_row:
                try:
                    plugin_config = {
                        'config_fields': json.loads(plugin_row[0]) if plugin_row[0] else {},
                        'messages': json.loads(plugin_row[1]) if plugin_row[1] else {},
                        'dependencies': json.loads(plugin_row[2]) if plugin_row[2] else []
                    }
                except json.JSONDecodeError:
                    logger.warning(f"BrainDriveSettings: Failed to parse plugin config for user {user_id}")
            
            # Export module configurations
            module_stmt = text("""
            SELECT name, props, config_fields, messages, layout
            FROM module
            WHERE user_id = :user_id AND plugin_id LIKE :plugin_pattern
            """)
            
            module_result = await db.execute(module_stmt, {
                "user_id": user_id,
                "plugin_pattern": f"{user_id}_{self.plugin_data['plugin_slug']}"
            })
            
            modules_config = {}
            for row in module_result.fetchall():
                try:
                    modules_config[row[0]] = {
                        'props': json.loads(row[1]) if row[1] else {},
                        'config_fields': json.loads(row[2]) if row[2] else {},
                        'messages': json.loads(row[3]) if row[3] else {},
                        'layout': json.loads(row[4]) if row[4] else {}
                    }
                except json.JSONDecodeError:
                    logger.warning(f"BrainDriveSettings: Failed to parse module config for {row[0]}")
                    continue
            
            export_data = {
                'plugin_config': plugin_config,
                'modules_config': modules_config,
                'export_timestamp': datetime.datetime.now().isoformat()
            }
            
            logger.info(f"BrainDriveSettings: Exported user data for {user_id}")
            return {'success': True, 'data': export_data}
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error exporting user data: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _import_user_data(self, user_id: str, db: AsyncSession, user_data: Dict[str, Any]):
        """Import user-specific data after migration during updates"""
        try:
            if not user_data or 'data' not in user_data:
                logger.info(f"BrainDriveSettings: No user data to import for {user_id}")
                return
            
            data = user_data['data']
            plugin_config = data.get('plugin_config', {})
            modules_config = data.get('modules_config', {})
            
            # Update plugin configuration if available
            if plugin_config:
                plugin_id = f"{user_id}_{self.plugin_data['plugin_slug']}"
                plugin_update_stmt = text("""
                UPDATE plugin
                SET config_fields = :config_fields, messages = :messages, dependencies = :dependencies
                WHERE user_id = :user_id AND id = :plugin_id
                """)
                
                await db.execute(plugin_update_stmt, {
                    "user_id": user_id,
                    "plugin_id": plugin_id,
                    "config_fields": json.dumps(plugin_config.get('config_fields', {})),
                    "messages": json.dumps(plugin_config.get('messages', {})),
                    "dependencies": json.dumps(plugin_config.get('dependencies', []))
                })
            
            # Update module configurations if available
            for module_name, module_config in modules_config.items():
                module_id = f"{user_id}_{module_name}"
                module_update_stmt = text("""
                UPDATE module
                SET props = :props, config_fields = :config_fields, messages = :messages, layout = :layout
                WHERE user_id = :user_id AND id = :module_id
                """)
                
                await db.execute(module_update_stmt, {
                    "user_id": user_id,
                    "module_id": module_id,
                    "props": json.dumps(module_config.get('props', {})),
                    "config_fields": json.dumps(module_config.get('config_fields', {})),
                    "messages": json.dumps(module_config.get('messages', {})),
                    "layout": json.dumps(module_config.get('layout', {}))
                })
            
            logger.info(f"BrainDriveSettings: Imported user data for {user_id}")
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error importing user data: {e}")
    
    # Compatibility methods for old architecture
    # Note: plugin_slug is already set by BaseLifecycleManager.__init__()
    # No need for a property decorator as it interferes with the plugin system
    
    async def install_plugin(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Install BrainDriveSettings plugin for specific user (compatibility method)"""
        try:
            logger.info(f"BrainDriveSettings: Starting installation for user {user_id}")
            
            # Check if plugin already exists
            existing_check = await self._check_existing_plugin(user_id, db)
            if existing_check['exists']:
                return {
                    'success': False,
                    'error': 'Plugin already installed for user',
                    'plugin_id': existing_check['plugin_id']
                }
            
            # Create shared directory
            shared_path = self.shared_path
            shared_path.mkdir(parents=True, exist_ok=True)
            logger.info(f"BrainDriveSettings: Created shared directory: {shared_path}")

            # Copy plugin files to the shared directory first
            copy_result = await self._copy_plugin_files_impl(user_id, shared_path)
            if not copy_result['success']:
                logger.error(f"BrainDriveSettings: File copying failed: {copy_result.get('error')}")
                return copy_result

            logger.info(f"BrainDriveSettings: Files copied successfully, proceeding with database installation")
            
            # Ensure we're in a transaction
            try:
                result = await self.install_for_user(user_id, db, shared_path)
                
                if result.get('success'):
                    # Verify the installation was successful
                    verify_check = await self._check_existing_plugin(user_id, db)
                    if not verify_check['exists']:
                        logger.error(f"BrainDriveSettings: Installation appeared successful but verification failed")
                        return {'success': False, 'error': 'Installation verification failed'}
                    
                    logger.info(f"BrainDriveSettings: Installation verified successfully for user {user_id}")
                    result.update({
                        'shared_path': str(shared_path),
                        'files_copied': copy_result.get('copied_files', [])
                    })
                    
                    await db.commit()
                    return result
                else:
                    logger.error(f"BrainDriveSettings: User installation failed: {result.get('error')}")
                    await db.rollback()
                    return result
                    
            except Exception as db_error:
                logger.error(f"BrainDriveSettings: Database operation failed: {db_error}")
                try:
                    await db.rollback()
                except Exception:
                    pass
                return {'success': False, 'error': f'Database operation failed: {str(db_error)}'}
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Installation failed for user {user_id}: {e}")
            try:
                await db.rollback()
            except Exception:
                pass
            return {'success': False, 'error': str(e)}
    
    async def delete_plugin(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Delete BrainDriveSettings plugin for user (compatibility method)"""
        try:
            logger.info(f"BrainDriveSettings: Starting deletion for user {user_id}")
            
            # Check if plugin exists
            existing_check = await self._check_existing_plugin(user_id, db)
            if not existing_check['exists']:
                return {'success': False, 'error': 'Plugin not found for user'}
            
            plugin_id = existing_check['plugin_id']
            
            # Delete database records
            delete_result = await self._delete_database_records(user_id, plugin_id, db)
            if delete_result['success']:
                await db.commit()
                logger.info(f"BrainDriveSettings: Deletion completed for user {user_id}")
            
            return delete_result
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Deletion failed for user {user_id}: {e}")
            await db.rollback()
            return {'success': False, 'error': str(e)}
    
    async def get_plugin_status(self, user_id: str, db: AsyncSession) -> Dict[str, Any]:
        """Get current status of BrainDriveSettings plugin installation (compatibility method)"""
        try:
            existing_check = await self._check_existing_plugin(user_id, db)
            
            if existing_check['exists']:
                return {
                    'installed': True,
                    'plugin_id': existing_check['plugin_id'],
                    'plugin_slug': self.plugin_data['plugin_slug'],
                    'plugin_name': self.plugin_data['name'],
                    'version': self.plugin_data['version']
                }
            else:
                return {'installed': False}
                
        except Exception as e:
            logger.error(f"BrainDriveSettings: Error checking plugin status: {e}")
            return {'installed': False, 'error': str(e)}
    
    async def update_plugin(self, user_id: str, db: AsyncSession, new_version_manager: 'BrainDriveSettingsLifecycleManager') -> Dict[str, Any]:
        """Update BrainDriveSettings plugin for user (compatibility method)"""
        try:
            logger.info(f"BrainDriveSettings: Starting update for user {user_id}")
            
            # Export current user data
            export_result = await self._export_user_data(user_id, db)
            user_data = export_result.get('data', {}) if export_result['success'] else {}
            
            # Delete current installation
            delete_result = await self.delete_plugin(user_id, db)
            if not delete_result['success']:
                return delete_result
            
            # Install new version
            install_result = await new_version_manager.install_plugin(user_id, db)
            if not install_result['success']:
                return install_result
            
            # Import user data to new version
            if user_data:
                await new_version_manager._import_user_data(user_id, db, {'data': user_data})
                await db.commit()
            
            logger.info(f"BrainDriveSettings: Update completed for user {user_id}")
            return install_result
            
        except Exception as e:
            logger.error(f"BrainDriveSettings: Update failed for user {user_id}: {e}")
            await db.rollback()
            return {'success': False, 'error': str(e)}


# For standalone testing and validation
if __name__ == "__main__":
    import sys
    import asyncio
    
    async def main():
        """Test the lifecycle manager"""
        try:
            # Initialize the lifecycle manager
            manager = BrainDriveSettingsLifecycleManager()
            
            # Test metadata retrieval
            plugin_metadata = await manager.get_plugin_metadata()
            module_metadata = await manager.get_module_metadata()
            
            print("BrainDriveSettings Lifecycle Manager Test")
            print("=" * 50)
            print(f"Plugin: {plugin_metadata['name']} v{plugin_metadata['version']}")
            print(f"Description: {plugin_metadata['description']}")
            print(f"Modules: {len(module_metadata)}")
            
            for i, module in enumerate(module_metadata, 1):
                print(f"  {i}. {module['display_name']} ({module['name']})")
                print(f"     Category: {module['category']}")
                print(f"     Icon: {module['icon']}")
            
            print("\nLifecycle manager initialized successfully!")
            return True
            
        except Exception as e:
            print(f"Error testing lifecycle manager: {e}")
            return False
    
    # Run the test
    success = asyncio.run(main())
    sys.exit(0 if success else 1)