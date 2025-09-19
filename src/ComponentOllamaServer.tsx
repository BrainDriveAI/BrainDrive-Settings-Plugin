import React from 'react';
import './ComponentOllamaServer.css';
import { GearIcon, TagIcon, LinkIcon, KeyIcon, LightningIcon, UpdateIcon, TrashIcon, CloseIcon, PlusIcon, SearchIcon, SortIcon, FilterIcon } from './icons';
import CustomDropdown from './CustomDropdown';
import ModelInstallDialog from './InstallModel';

interface ApiResponse {
  data?: any;
  status?: number;
  id?: string;
  [key: string]: any;
}

interface OllamaApiResponse {
  status: string;
  version?: string;
}

interface ServerConfig {
  id: string;          // Unique identifier for the server
  serverName: string;  // Display name
  serverAddress: string; // URL
  apiKey: string;      // Optional authentication
  connectionStatus: 'idle' | 'checking' | 'success' | 'error';
}

// New interfaces for model management
interface ModelInfo {
  name: string;
  tag: string;
  size: number;
  digest: string;
  modified_at: string;
  details?: ModelDetails;
}

interface ModelDetails {
  format: string;
  family: string;
  families?: string[];
  parameter_size: string;
  quantization_level: string;
  template?: string;
  system?: string;
  license?: string;
  modelfile?: string;
  parameters?: string;
}

// New interfaces for model installation and operations
interface ModelInstallation {
  id: string;
  modelName: string;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress: number;
  error?: string;
  customMessage?: string;
  startTime: Date;
}

interface ModelOperation {
  id: string;
  type: 'install' | 'delete';
  modelName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  progress?: number;
  error?: string;
  startTime: Date;
}

/**
 * Settings Service Bridge Interface
 * This interface defines the contract for the settings service bridge.
 * This keeps the plugin decoupled from the actual service implementation.
 */
interface SettingsServiceBridge {
  // Basic operations
  getSetting: (name: string, context?: { userId?: string; pageId?: string }) => Promise<any>;
  setSetting: (name: string, value: any, context?: { userId?: string; pageId?: string }) => Promise<void>;
  
  // Definition management
  registerSettingDefinition?: (definition: any) => Promise<void>;
  getSettingDefinitions?: (filter?: { category?: string; tags?: string[] }) => Promise<any[]>;
  
  // Subscription methods
  subscribe?: (key: string, callback: (value: any) => void) => () => void;
  subscribeToCategory?: (category: string, callback: (value: any) => void) => () => void;
}

interface OllamaServerComponentProps {
  services: {
    api?: {
      get: (url: string, options?: any) => Promise<ApiResponse>;
      post: (url: string, data: any, config?: any) => Promise<ApiResponse>;
      delete: (url: string, options?: any) => Promise<ApiResponse>;
      getSse?: (path: string, onMessage?: (data: string) => void) => Promise<void>;
    };
    theme?: {
      getCurrentTheme: () => string;
      addThemeChangeListener: (callback: (theme: string) => void) => void;
      removeThemeChangeListener: (callback: (theme: string) => void) => void;
    };
    settings?: SettingsServiceBridge;
  };
}

interface OllamaServerComponentState {
  servers: ServerConfig[];
  isLoading: boolean;
  isSaving: boolean;
  errorMessage: string;
  currentTheme: string;
  activeServerId: string | null; // Currently selected server for editing
  isAddingNew: boolean;          // Flag to indicate adding a new server
  
  // New state for tabbed interface and model management
  activeTab: 'servers' | 'models';
  models: ModelInfo[];
  modelsLoading: boolean;
  modelsError: string;
  sortBy: 'name' | 'size' | 'modified' | 'family' | 'parameters' | 'quantization';
  sortOrder: 'asc' | 'desc';
  selectedModelId: string | null;
  selectedModel: ModelInfo | null;
  expandedModelId: string | null;
  
  // Pagination state
  currentPage: number;
  itemsPerPage: number;
  
  // New state for model installation and operations
  showInstallModal: boolean;
  installModelName: string;
  
  // Model operations state (converted from hooks)
  installations: ModelInstallation[];
  operations: ModelOperation[];
}

// Ollama Settings Configuration
const OLLAMA_SETTINGS = {
  DEFINITION_ID: 'ollama_servers_settings',
  CATEGORY: 'llm_servers',
  SCHEMA: {
    type: 'object',
    properties: {
      servers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            serverName: { type: 'string' },
            serverAddress: { type: 'string' },
            apiKey: { type: 'string' },
            connectionStatus: {
              type: 'string',
              enum: ['idle', 'checking', 'success', 'error']
            }
          },
          required: ['id', 'serverName', 'serverAddress']
        }
      }
    }
  },
  DEFAULT_VALUE: {
    servers: []
  }
};

class ComponentOllamaServer extends React.Component<OllamaServerComponentProps, OllamaServerComponentState> {
  private themeChangeListener: ((theme: string) => void) | null = null;
  private settingsUnsubscribe?: () => void;

  constructor(props: OllamaServerComponentProps) {
    super(props);
    this.state = {
      servers: [],
      isLoading: true,
      isSaving: false,
      errorMessage: '',
      currentTheme: 'light', // Default theme
      activeServerId: null,
      isAddingNew: false,
      
      // New state initialization
      activeTab: 'models',
      models: [],
      modelsLoading: false,
      modelsError: '',
      sortBy: 'name',
      sortOrder: 'asc',
      selectedModelId: null,
      selectedModel: null,
      expandedModelId: null,
      
      // Pagination state
      currentPage: 1,
      itemsPerPage: 10,
      
      // New state for model installation and operations
      showInstallModal: false,
      installModelName: '',
      
      // Model operations state (converted from hooks)
      installations: [],
      operations: [],
    };
  }

  async componentDidMount() {
    await this.initializeSettingsDefinition();
    this.initializeSettingsSubscription();
    this.loadSettings();
    this.initializeThemeService();
  }

  componentWillUnmount() {
    if (this.themeChangeListener && this.props.services?.theme) {
      this.props.services.theme.removeThemeChangeListener(this.themeChangeListener);
    }
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
  }

  /**
   * Initialize the Ollama settings definition
   */
  async initializeSettingsDefinition() {
    if (!this.props.services?.settings?.registerSettingDefinition) {
      console.warn('registerSettingDefinition method not available, assuming definition exists');
      return;
    }

    try {
      // Check if definition already exists
      if (this.props.services.settings.getSettingDefinitions) {
        const definitions = await this.props.services.settings.getSettingDefinitions({
          category: OLLAMA_SETTINGS.CATEGORY
        });
        
        const existingDefinition = definitions.find(def => def.id === OLLAMA_SETTINGS.DEFINITION_ID);
        if (existingDefinition) {
          if (!Array.isArray(existingDefinition.allowedScopes) || existingDefinition.allowedScopes.length === 0) {
            console.log('Updating Ollama settings definition metadata to include allowed scopes');
            (existingDefinition as any).allowedScopes = ['user'];
            if ('scope' in existingDefinition) {
              delete (existingDefinition as any).scope;
            }
          }
          console.log('Ollama settings definition already exists');
          return;
        }
      }

      // Register the definition
      await this.props.services.settings.registerSettingDefinition({
        id: OLLAMA_SETTINGS.DEFINITION_ID,
        name: 'Ollama Servers Settings',
        description: 'Configuration for multiple Ollama server connections',
        category: OLLAMA_SETTINGS.CATEGORY,
        allowedScopes: ['user'],
        schema: OLLAMA_SETTINGS.SCHEMA,
        defaultValue: OLLAMA_SETTINGS.DEFAULT_VALUE,
        tags: ['ollama', 'llm', 'servers', 'ai']
      });

      console.log('Ollama settings definition registered successfully');
    } catch (error) {
      console.error('Failed to register Ollama settings definition:', error);
    }
  }

  /**
   * Initialize settings subscription for real-time updates
   */
  initializeSettingsSubscription() {
    if (!this.props.services?.settings?.subscribe) {
      console.warn('Settings service subscription not available');
      return;
    }

    // Subscribe to Ollama settings changes
    this.settingsUnsubscribe = this.props.services.settings.subscribe(
      OLLAMA_SETTINGS.DEFINITION_ID,
      (value: any) => {
        console.log('Ollama settings updated:', value);
        if (value && value.servers) {
          this.setState({
            servers: value.servers,
            errorMessage: ''
          });
        }
      }
    );
  }

  /**
   * Initialize the theme service to listen for theme changes
   */
  initializeThemeService() {
    if (this.props.services?.theme) {
      try {
        // Get the current theme
        const currentTheme = this.props.services.theme.getCurrentTheme();
        this.setState({ currentTheme });
        
        // Set up theme change listener
        this.themeChangeListener = (newTheme: string) => {
          this.setState({ currentTheme: newTheme });
        };
        
        // Add the listener to the theme service
        this.props.services.theme.addThemeChangeListener(this.themeChangeListener);
      } catch (error) {
        console.error('Error initializing theme service:', error);
      }
    }
  }

  /**
   * Generate a unique ID for a new server
   */
  generateUniqueId = () => {
    return 'server_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  };

  private applyLoadedServers = (servers: ServerConfig[]) => {
    let serverToLoadModels: string | null = null;

    this.setState(prevState => {
      const activeExists = !!(prevState.activeServerId && servers.some(server => server.id === prevState.activeServerId));
      const nextActiveServerId = activeExists
        ? prevState.activeServerId
        : (servers.length > 0 ? servers[0].id : null);

      if (prevState.activeTab === 'models' && nextActiveServerId && nextActiveServerId !== prevState.activeServerId) {
        serverToLoadModels = nextActiveServerId;
      }

      const nextIsAddingNew = nextActiveServerId ? false : prevState.isAddingNew;

      return {
        servers,
        isLoading: false,
        errorMessage: '',
        activeServerId: nextActiveServerId,
        isAddingNew: nextIsAddingNew
      };
    }, () => {
      if (serverToLoadModels) {
        this.loadModels(serverToLoadModels);
      }
    });
  };

  loadSettings = async () => {
    this.setState({ isLoading: true, errorMessage: '' });
    
    if (!this.props.services?.settings) {
      // Fallback to API service if Settings service not available
      if (!this.props.services?.api) {
        this.setState({
          isLoading: false,
          errorMessage: 'Neither Settings nor API service available'
        });
        return;
      }
      return this.loadSettingsFromAPI();
    }

    try {
      // Use Settings service to get Ollama servers configuration
      const settingsValue = await this.props.services.settings.getSetting(
        OLLAMA_SETTINGS.DEFINITION_ID,
        { userId: 'current' }
      );
      
      if (settingsValue && settingsValue.servers && Array.isArray(settingsValue.servers)) {
        // Ensure each server has a connection status
        const servers: ServerConfig[] = settingsValue.servers.map((server: any) => ({
          id: server.id,
          serverName: server.serverName,
          serverAddress: server.serverAddress,
          apiKey: server.apiKey || '',
          connectionStatus: server.connectionStatus || 'idle'
        }));
        
        this.applyLoadedServers(servers);
      } else {
        // No settings found, use default empty array
        this.applyLoadedServers([]);
      }
    } catch (error: any) {
      console.error('Error loading Ollama settings:', error);
      this.setState({
        isLoading: false,
        errorMessage: `Error loading settings: ${error.message || 'Unknown error'}`
      });
    }
  };

  /**
   * Fallback method to load settings from API when Settings service is not available
   */
  loadSettingsFromAPI = async () => {
    try {
      const response = await this.props.services!.api!.get('/api/v1/settings/instances', {
        params: {
          definition_id: 'ollama_servers_settings',
          scope: 'user',
          user_id: 'current'
        }
      });
      
      let settingsData = null;
      
      if (Array.isArray(response) && response.length > 0) {
        settingsData = response[0];
      } else if (response && typeof response === 'object') {
        const responseObj = response as Record<string, any>;
        
        if (responseObj.data) {
          if (Array.isArray(responseObj.data) && responseObj.data.length > 0) {
            settingsData = responseObj.data[0];
          } else if (typeof responseObj.data === 'object') {
            settingsData = responseObj.data;
          }
        } else {
          settingsData = response;
        }
      }
      
      if (settingsData && settingsData.value) {
        let parsedValue = typeof settingsData.value === 'string'
          ? JSON.parse(settingsData.value)
          : settingsData.value;
        
        const servers: ServerConfig[] = [];
        
        if (Array.isArray(parsedValue.servers)) {
          for (const server of parsedValue.servers) {
            let status: 'idle' | 'checking' | 'success' | 'error' = 'idle';
            if (server.connectionStatus === 'checking' ||
                server.connectionStatus === 'success' ||
                server.connectionStatus === 'error') {
              status = server.connectionStatus;
            }
            
            servers.push({
              id: server.id,
              serverName: server.serverName,
              serverAddress: server.serverAddress,
              apiKey: server.apiKey || '',
              connectionStatus: status
            });
          }
        }
        
        this.applyLoadedServers(servers);
      } else {
        this.applyLoadedServers([]);
      }
    } catch (error: any) {
      this.setState({
        isLoading: false,
        errorMessage: `Error loading settings: ${error.message || 'Unknown error'}`
      });
    }
  };

  saveSettings = async () => {
    if (!this.props.services?.settings) {
      // Fallback to API service if Settings service not available
      if (!this.props.services?.api) {
        this.setState({ errorMessage: 'Neither Settings nor API service available' });
        return;
      }
      await this.saveSettingsToAPI();
      return;
    }

    this.setState({ isSaving: true, errorMessage: '' });

    try {
      // Prepare server configurations for saving
      const serverConfigs = this.state.servers.map(server => ({
        id: server.id,
        serverName: server.serverName,
        serverAddress: server.serverAddress,
        apiKey: server.apiKey,
        connectionStatus: server.connectionStatus
      }));

      const settingsValue = {
        servers: serverConfigs
      };

      // Use Settings service to save Ollama servers configuration
      await this.props.services.settings.setSetting(
        OLLAMA_SETTINGS.DEFINITION_ID,
        settingsValue,
        { userId: 'current' }
      );
      
      this.setState({
        isSaving: false,
        errorMessage: '',
        isAddingNew: false,
        activeServerId: null
      });
      
      alert('Settings saved successfully!');
    } catch (error: any) {
      console.error('Error saving Ollama settings via settings service:', error);

      if (this.props.services?.api) {
        const savedViaApi = await this.saveSettingsToAPI({ skipInitialStateUpdate: true });
        if (savedViaApi) {
          return;
        }
        // If API fallback failed, ensure an error message is shown
        this.setState(prevState => ({
          isSaving: false,
          errorMessage: prevState.errorMessage || `Error saving settings: ${error.message || 'Unknown error'}`
        }));
        return;
      }

      this.setState({
        isSaving: false,
        errorMessage: `Error saving settings: ${error.message || 'Unknown error'}`
      });
    }
  };

  /**
   * Fallback method to save settings to API when Settings service is not available
   */
  saveSettingsToAPI = async (options: { skipInitialStateUpdate?: boolean } = {}): Promise<boolean> => {
    if (!options.skipInitialStateUpdate) {
      this.setState({ isSaving: true, errorMessage: '' });
    }

    try {
      const serverConfigs: ServerConfig[] = [];
      
      for (const server of this.state.servers) {
        serverConfigs.push({
          id: server.id,
          serverName: server.serverName,
          serverAddress: server.serverAddress,
          apiKey: server.apiKey,
          connectionStatus: 'idle'
        });
      }

      let existingInstanceId: string | null = null;
      try {
        const response = await this.props.services!.api!.get('/api/v1/settings/instances', {
          params: {
            definition_id: OLLAMA_SETTINGS.DEFINITION_ID,
            scope: 'user',
            user_id: 'current'
          }
        });

        const responseData = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : response?.data
              ? [response.data]
              : [];

        if (Array.isArray(responseData) && responseData.length > 0 && responseData[0]?.id) {
          existingInstanceId = responseData[0].id;
        }
      } catch (fetchError) {
        console.error('Error checking existing Ollama settings instance:', fetchError);
      }

      const settingsData: Record<string, any> = {
        definition_id: OLLAMA_SETTINGS.DEFINITION_ID,
        name: 'Ollama Servers Settings',
        value: {
          servers: serverConfigs
        },
        scope: 'user',
        user_id: 'current'
      };

      if (existingInstanceId) {
        settingsData.id = existingInstanceId;
      }

      await this.props.services!.api!.post('/api/v1/settings/instances', settingsData);
      
      this.setState({
        isSaving: false,
        errorMessage: '',
        isAddingNew: false,
        activeServerId: null
      });

      alert('Settings saved successfully!');
      return true;
    } catch (error: any) {
      this.setState({
        isSaving: false,
        errorMessage: `Error saving settings: ${error.message || 'Unknown error'}`
      });
      return false;
    }
  };

  addNewServer = () => {
    const newServer: ServerConfig = {
      id: this.generateUniqueId(),
      serverName: 'New Server',
      serverAddress: 'http://localhost:11434',
      apiKey: '',
      connectionStatus: 'idle'
    };

    this.setState({
      isAddingNew: true,
      activeServerId: newServer.id,
      servers: [...this.state.servers, newServer]
    });
  };

  selectServer = (serverId: string) => {
    this.setState({
      activeServerId: serverId,
      isAddingNew: false
    });
  };

  deleteServer = (serverId: string) => {
    if (!window.confirm('Are you sure you want to delete this server?')) {
      return;
    }

    const updatedServers = this.state.servers.filter(server => server.id !== serverId);
    
    this.setState({
      servers: updatedServers,
      activeServerId: null,
      isAddingNew: false
    }, () => {
      this.saveSettings();
    });
  };

  cancelEdit = () => {
    if (this.state.isAddingNew) {
      // Remove the new server that was being added
      const updatedServers = this.state.servers.filter(server => server.id !== this.state.activeServerId);
      this.setState({
        servers: updatedServers,
        activeServerId: null,
        isAddingNew: false
      });
    } else {
      // Just cancel editing
      this.setState({
        activeServerId: null,
        isAddingNew: false
      });
    }
  };

  handleInputChange = (serverId: string, field: 'serverName' | 'serverAddress' | 'apiKey', value: string) => {
    const updatedServers = this.state.servers.map(server => {
      if (server.id === serverId) {
        if (field === 'serverName') {
          return { ...server, serverName: value };
        } else if (field === 'serverAddress') {
          return { ...server, serverAddress: value };
        } else if (field === 'apiKey') {
          return { ...server, apiKey: value };
        }
      }
      return server;
    });

    this.setState({ servers: updatedServers });
  };

  testConnection = async (serverId: string) => {
    const server = this.state.servers.find(s => s.id === serverId);
    if (!server) return;

    const updatedServers = this.state.servers.map(s => {
      if (s.id === serverId) {
        return { ...s, connectionStatus: 'checking' as const };
      }
      return s;
    });

    this.setState({
      servers: updatedServers,
      errorMessage: ''
    });
    
    if (!this.props.services?.api) {
      this.updateServerStatus(serverId, 'error');
      this.setState({ errorMessage: 'API service not available' });
      return;
    }
    
    // Validate server address
    if (!server.serverAddress || !server.serverAddress.trim()) {
      this.updateServerStatus(serverId, 'error');
      this.setState({ errorMessage: 'Server address is required' });
      return;
    }
    
    try {
      const encodedUrl = encodeURIComponent(server.serverAddress.trim());
      const params: Record<string, string> = { server_url: encodedUrl };
      
      if (server.apiKey && server.apiKey.trim()) {
        params.api_key = server.apiKey.trim();
      }
      
      const response = await this.props.services.api.get('/api/v1/ollama/test', { params });
      const responseData = response as unknown as OllamaApiResponse;
      
      if (responseData && responseData.status === 'success') {
        this.updateServerStatus(serverId, 'success');
      } else {
        this.updateServerStatus(serverId, 'error');
        this.setState({
          errorMessage: 'Connection failed. Please check your server address and API key.'
        });
      }
    } catch (error: any) {
      this.updateServerStatus(serverId, 'error');
      
      let errorMessage = 'Connection failed. Please check your server address and API key.';
      
      // Provide more specific error messages
      if (error.response) {
        const status = error.response.status;
        const detail = error.response.data?.detail || error.response.data?.message || '';
        
        if (status === 422) {
          errorMessage = `Validation error: ${detail}`;
        } else if (status === 400) {
          errorMessage = `Bad request: ${detail}`;
        } else if (status === 503 || status === 504) {
          errorMessage = 'Server is unreachable. Please check if Ollama is running.';
        } else {
          errorMessage = `Server error (${status}): ${detail}`;
        }
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Network error. Please check your connection.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      this.setState({ errorMessage });
    }
  };

  updateServerStatus = (serverId: string, status: 'idle' | 'checking' | 'success' | 'error') => {
    const updatedServers = this.state.servers.map(server => {
      if (server.id === serverId) {
        return { ...server, connectionStatus: status };
      }
      return server;
    });

    this.setState({ servers: updatedServers });
  };

  updateServer = (serverId: string) => {
    const server = this.state.servers.find(s => s.id === serverId);
    if (!server) return;

    if (!server.serverName.trim() || !server.serverAddress.trim()) {
      this.setState({ errorMessage: 'Server name and address are required' });
      return;
    }

    // Update the server in state
    const updatedServers = this.state.servers.map(s => {
      if (s.id === serverId) {
        return {
          ...s,
          serverName: s.serverName.trim(),
          serverAddress: s.serverAddress.trim()
        };
      }
      return s;
    });

    this.setState({
      servers: updatedServers,
      activeServerId: null,
      isAddingNew: false
    }, () => {
      this.saveSettings();
    });
  };

  // Model Management Methods
  setActiveTab = (tab: 'servers' | 'models') => {
    this.setState({ activeTab: tab }, () => {
      // Auto-refresh models when switching to models tab
      if (tab === 'models' && this.state.activeServerId) {
        this.loadModels(this.state.activeServerId);
      }
    });
  };

  loadModels = async (serverId: string) => {
    const server = this.state.servers.find(s => s.id === serverId);
    if (!server) {
      this.setState({ modelsError: 'Server not found' });
      return;
    }

    this.setState({ modelsLoading: true, modelsError: '' });

    if (!this.props.services?.api) {
      this.setState({
        modelsLoading: false,
        modelsError: 'API service not available'
      });
      return;
    }

    try {
      const encodedUrl = encodeURIComponent(server.serverAddress);
      const params: Record<string, string> = { server_url: encodedUrl };
      
      if (server.apiKey) {
        params.api_key = server.apiKey;
      }
      
      const response = await this.props.services.api.get('/api/v1/ollama/models', { params });
      
      if (response && Array.isArray(response)) {
        this.setState({
          models: response,
          modelsLoading: false,
          modelsError: ''
        });
      } else {
        this.setState({
          models: [],
          modelsLoading: false,
          modelsError: 'Invalid response format from server'
        });
      }
    } catch (error: any) {
      this.setState({
        models: [],
        modelsLoading: false,
        modelsError: `Error loading models: ${error.message || 'Unknown error'}`
      });
    }
  };

  handleSortChange = (sortBy: 'name' | 'size' | 'modified' | 'family' | 'parameters' | 'quantization') => {
    this.setState(prevState => ({
      sortBy,
      sortOrder: prevState.sortBy === sortBy && prevState.sortOrder === 'asc' ? 'desc' : 'asc',
      currentPage: 1 // Reset to first page when sorting
    }));
  };

  getDropdownOptions = () => {
    const { models } = this.getPaginatedModels();
    
    // Convert to dropdown options with size and parameters as secondary text
    return models.map(model => ({
      id: `${model.name}-${model.tag}`,
      primaryText: model.name,
      secondaryText: `${this.formatFileSize(model.size)}${model.details?.parameter_size ? ` • ${model.details.parameter_size}` : ''}`
    }));
  };

  formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  handleModelSelection = (modelId: string) => {
    const selectedModel = this.state.models.find(model =>
      `${model.name}-${model.tag}` === modelId
    );
    
    this.setState({
      selectedModelId: modelId,
      selectedModel: selectedModel || null,
      expandedModelId: null, // Clear expansion when selecting from dropdown
      currentPage: 1 // Reset to first page when filtering
    });
  };

  handleModelRowClick = (modelId: string) => {
    this.setState(prevState => ({
      expandedModelId: prevState.expandedModelId === modelId ? null : modelId
    }));
  };

  // Model Operations Methods
  handleModelAction = async (action: 'delete', modelId: string) => {
    const model = this.state.models.find(m => `${m.name}-${m.tag}` === modelId);
    if (!model) return;

    // Show confirmation dialog
    if (!window.confirm(`Are you sure you want to delete the model "${model.name}"? This action cannot be undone.`)) {
      return;
    }

    const server = this.state.servers.find(s => s.id === this.state.activeServerId);
    if (!server) {
      this.setState({ errorMessage: 'Server not available' });
      return;
    }

    try {
      if (action === 'delete') {
        await this.deleteModel(model, server.serverAddress, server.apiKey);
        // Remove the model from local state immediately instead of refreshing
        this.setState(prevState => ({
          models: prevState.models.filter(m => `${m.name}-${m.tag}` !== modelId),
          selectedModelId: prevState.selectedModelId === modelId ? null : prevState.selectedModelId,
          expandedModelId: prevState.expandedModelId === modelId ? null : prevState.expandedModelId
        }));
      }
    } catch (error: any) {
      this.setState({ errorMessage: error.message });
    }
  };

  // Model Installation Methods
  openInstallModal = () => {
    this.setState({
      showInstallModal: true,
      installModelName: ''
    });
  };

  closeInstallModal = () => {
    this.setState({
      showInstallModal: false,
      installModelName: ''
    });
  };

  handleInstallInputChange = (field: 'installModelName', value: string) => {
    this.setState({ [field]: value } as any);
  };

  validateInstallInputs = (): boolean => {
    const { installModelName } = this.state;
    
    if (!installModelName.trim()) {
      this.setState({ errorMessage: 'Model name is required' });
      return false;
    }
    
    return true;
  };

  // Model Operations Methods (converted from hooks)
  startModelInstallation = async (modelName: string) => {
    console.log('startModelInstallation called with:', modelName);
    const { activeServerId } = this.state;
    const server = this.state.servers.find(s => s.id === activeServerId);
    
    if (!server) {
      console.error('No server selected');
      this.setState({ errorMessage: 'No server selected' });
      return;
    }

    console.log('Using server:', server);

    const installation: ModelInstallation = {
      id: `install_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      modelName,
      status: 'pending',
      progress: 0,
      startTime: new Date()
    };

    this.setState(prevState => ({
      installations: [...prevState.installations, installation]
    }));

    try {
      // Kick off background installation (do not await to keep UI responsive)
      this.performModelInstallation(installation, server.serverAddress, server.apiKey, { timeout: 600000 })
        .catch((e) => {
          console.error('Background installation error:', e);
          this.updateInstallationStatus(installation.id, 'error', 0, e?.message || 'Install failed');
        });
      // Close modal immediately
      this.setState({ showInstallModal: false, errorMessage: '' });
    } catch (error: any) {
      console.error('Installation error:', error);
      this.setState({ errorMessage: error.message });
    }
  };

  performModelInstallation = async (installation: ModelInstallation, serverAddress: string, apiKey?: string, config?: any) => {
    console.log('performModelInstallation called with:', { installation, serverAddress, apiKey, config });
    
    if (!this.props.services?.api) {
      console.error('API service not available');
      throw new Error('API service not available');
    }

    console.log('API service available:', this.props.services.api);

    // Update status to pending/queued with message
    this.updateInstallationStatus(installation.id, 'pending', 0, undefined, 'Queued');

    try {
      const requestData = {
        name: installation.modelName,
        server_url: serverAddress,
        api_key: apiKey || undefined
      };

      console.log('Sending install request:', requestData);
      
      // Enqueue background install and get task_id
      const response: any = await this.props.services.api.post('/api/v1/ollama/install', requestData, { timeout: 10000 });
      console.log('Install task response:', response);

      const taskId = response?.task_id || response?.data?.task_id;
      if (!taskId) {
        throw new Error('Failed to start install task');
      }

      // Prefer SSE if available; fallback to polling status
      if (this.props.services.api.getSse) {
        await this.props.services.api.getSse(`/api/v1/ollama/install/${taskId}/events`, async (chunk: string) => {
          try {
            const evt = JSON.parse(chunk);
            // Debug: surface event to console to aid troubleshooting
            try { console.debug('Ollama install event:', evt); } catch {}
            const evtState = String(evt.state || '');
            const progress = typeof evt.progress === 'number' ? evt.progress : undefined;
            const message = evt.message as string | undefined;

            // Treat queued/running as installing
            if (evtState === 'queued' || evtState === 'running') {
              const stageMessage = message || (evt?.raw?.status as string) || (evtState === 'queued' ? 'Queued…' : 'Connecting…');
              this.updateInstallationStatus(installation.id, 'downloading', progress ?? installation.progress, undefined, stageMessage);
              return;
            }

            if (evtState === 'canceled') {
              this.updateInstallationStatus(installation.id, 'error', 0, 'Canceled');
              return;
            }
            if (evtState === 'error') {
              this.updateInstallationStatus(installation.id, 'error', 0, (evt.error as string) || message || 'Install failed');
              return;
            }
            // Treat completion only on explicit completed state or success signal from Ollama
            const rawStatus = String(evt?.raw?.status || '').toLowerCase();
            if (evtState === 'completed' || rawStatus === 'success') {
              // Show finalizing until the model appears in tags
              this.updateInstallationStatus(installation.id, 'downloading', 100, undefined, 'Finalizing…');
              const available = await this.confirmModelAvailability(serverAddress, apiKey, installation.modelName, 30000);
              if (available) {
                const customMessage = evt.already_exists ? 'Model already exists' : 'Installation completed';
                this.updateInstallationStatus(installation.id, 'completed', 100, undefined, customMessage);
                if (this.state.activeServerId) {
                  this.loadModels(this.state.activeServerId);
                }
                setTimeout(() => this.removeInstallation(installation.id), 1500);
              }
              return;
            }
            // Default: show downloading with progress if any
            const stageMessage = message || (evt?.raw?.status as string) || 'Installing model…';
            this.updateInstallationStatus(installation.id, 'downloading', progress ?? installation.progress, undefined, stageMessage);
          } catch (e) {
            // Non-JSON line; ignore
          }
        });
      } else {
        // Polling fallback if SSE helper is unavailable
        const poll = async () => {
          try {
            // Use short polling interval to keep UI responsive
            const status: any = await this.props.services!.api!.get(`/api/v1/ollama/install/${taskId}`);
            const evtState = String(status?.state || '');
            const progress = typeof status?.progress === 'number' ? status.progress : undefined;
            const message = status?.message as string | undefined;

            if (evtState === 'queued' || evtState === 'running') {
              this.updateInstallationStatus(installation.id, 'downloading', progress ?? installation.progress, undefined, message || 'Installing model…');
              return false;
            }

            if (evtState === 'canceled') {
              this.updateInstallationStatus(installation.id, 'error', 0, 'Canceled');
              return true;
            }
            if (evtState === 'error') {
              this.updateInstallationStatus(installation.id, 'error', 0, (status?.error as string) || message || 'Install failed');
              return true;
            }
            // Only complete on explicit completed state
            if (evtState === 'completed') {
              // Finalizing until visible
              this.updateInstallationStatus(installation.id, 'downloading', 100, undefined, 'Finalizing…');
              const available = await this.confirmModelAvailability(serverAddress, apiKey, installation.modelName, 30000);
              if (available) {
                const customMessage = status?.already_exists ? 'Model already exists' : 'Installation completed';
                this.updateInstallationStatus(installation.id, 'completed', 100, undefined, customMessage);
                if (this.state.activeServerId) {
                  this.loadModels(this.state.activeServerId);
                }
                setTimeout(() => this.removeInstallation(installation.id), 1500);
                return true;
              }
              return false;
            }
            this.updateInstallationStatus(installation.id, 'downloading', progress ?? installation.progress, undefined, message || 'Installing model…');
            return false;
          } catch (e: any) {
            // On 404, assume server restart and stop polling
            if (e?.status === 404) {
              this.updateInstallationStatus(installation.id, 'error', 0, 'Install interrupted (server restarted)');
              return true;
            }
            // Transient error: keep polling
            return false;
          }
        };

        // Poll until terminal
        const loop = async () => {
          while (true) {
            const done = await poll();
            if (done) break;
            await new Promise(r => setTimeout(r, 1000));
          }
        };
        loop();
      }

    } catch (error: any) {
      console.error('Install error:', error);
      this.updateInstallationStatus(installation.id, 'error', 0, error.message);
    }
  };

  deleteModel = async (model: ModelInfo, serverAddress: string, apiKey?: string) => {
    if (!this.props.services?.api) {
      throw new Error('API service not available');
    }

    try {
      const requestData = {
        name: model.name,
        server_url: serverAddress,
        api_key: apiKey || undefined
      };

      await this.props.services.api.delete('/api/v1/ollama/delete', { data: requestData });
      
      // Success - model will be removed from state in handleModelAction
      
    } catch (error: any) {
      throw new Error(`Failed to delete model: ${error.message || 'Unknown error'}`);
    }
  };

  updateInstallationStatus = (id: string, status: ModelInstallation['status'], progress?: number, error?: string, customMessage?: string) => {
    this.setState(prevState => ({
      installations: prevState.installations.map(installation =>
        installation.id === id
          ? {
              ...installation,
              status,
              ...(progress !== undefined && { progress }),
              ...(error && { error }),
              ...(customMessage && { customMessage })
            }
          : installation
      )
    }));
  };

  updateOperationStatus = (id: string, status: ModelOperation['status'], error?: string) => {
    this.setState(prevState => ({
      operations: prevState.operations.map(operation =>
        operation.id === id
          ? { ...operation, status, ...(error && { error }) }
          : operation
      )
    }));
  };

  removeInstallation = (id: string) => {
    this.setState(prevState => ({
      installations: prevState.installations.filter(installation => installation.id !== id)
    }));
  };

  removeOperation = (id: string) => {
    this.setState(prevState => ({
      operations: prevState.operations.filter(operation => operation.id !== id)
    }));
  };

  // Pagination methods
  handlePageChange = (page: number) => {
    this.setState({ currentPage: page });
  };

  handleItemsPerPageChange = (itemsPerPage: number) => {
    this.setState({
      itemsPerPage,
      currentPage: 1 // Reset to first page when changing items per page
    });
  };

  getPaginatedModels = () => {
    const { models, sortBy, sortOrder, selectedModelId, currentPage, itemsPerPage } = this.state;
    
    // Get sorted models
    const sortedModels = [...models].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;
      
      switch (sortBy) {
        case 'name':
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
          break;
        case 'size':
          aValue = a.size || 0;
          bValue = b.size || 0;
          break;
        case 'modified':
          aValue = new Date(a.modified_at || 0).getTime();
          bValue = new Date(b.modified_at || 0).getTime();
          break;
        case 'family':
          aValue = (a.details?.family || '').toLowerCase();
          bValue = (b.details?.family || '').toLowerCase();
          break;
        case 'parameters':
          aValue = (a.details?.parameter_size || '').toLowerCase();
          bValue = (b.details?.parameter_size || '').toLowerCase();
          break;
        case 'quantization':
          aValue = (a.details?.quantization_level || '').toLowerCase();
          bValue = (b.details?.quantization_level || '').toLowerCase();
          break;
        default:
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
    
    // Filter to selected model if one is chosen from the dropdown
    const filteredModels = selectedModelId
      ? sortedModels.filter(model => `${model.name}-${model.tag}` === selectedModelId)
      : sortedModels;
    
    // Calculate pagination
    const totalItems = filteredModels.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    
    return {
      models: filteredModels.slice(startIndex, endIndex),
      totalItems,
      totalPages,
      currentPage,
      itemsPerPage
    };
  };

  renderPageNumbers = (currentPage: number, totalPages: number) => {
    const pageNumbers = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Show a subset of pages with ellipsis
      if (currentPage <= 3) {
        // Near the beginning
        for (let i = 1; i <= 4; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push('...');
        pageNumbers.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Near the end
        pageNumbers.push(1);
        pageNumbers.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pageNumbers.push(i);
        }
      } else {
        // In the middle
        pageNumbers.push(1);
        pageNumbers.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push('...');
        pageNumbers.push(totalPages);
      }
    }
    
    return pageNumbers.map((page, index) => {
      if (page === '...') {
        return (
          <span key={`ellipsis-${index}`} className="pagination-ellipsis">
            ...
          </span>
        );
      }
      
      return (
        <button
          key={page}
          className={`pagination-button ${currentPage === page ? 'active' : ''}`}
          onClick={() => this.handlePageChange(page as number)}
          aria-label={`Page ${page}`}
        >
          {page}
        </button>
      );
    });
  };

  renderServerList() {
    const { servers, activeServerId } = this.state;
    
    return (
      <div className="server-list">
        <h3 className="server-list-title">Ollama Servers</h3>
        
        {servers.length === 0 ? (
          <div className="no-servers">No servers configured</div>
        ) : (
          <ul className="server-items">
            {servers.map(server => (
              <li 
                key={server.id} 
                className={`server-item ${activeServerId === server.id ? 'active' : ''}`}
                onClick={() => this.selectServer(server.id)}
              >
                <div className="server-item-content">
                  <div className="server-name">{server.serverName}</div>
                  <div className="server-address">{server.serverAddress}</div>
                </div>
                <div className={`server-status status-${server.connectionStatus}`}>
                  {server.connectionStatus === 'success' && <LightningIcon />}
                  {server.connectionStatus === 'error' && <CloseIcon />}
                  {server.connectionStatus === 'checking' && <div className="spinner-small" />}
                </div>
              </li>
            ))}
          </ul>
        )}
        
        <button 
          className="button button-primary add-server-button"
          onClick={this.addNewServer}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ marginRight: '8px' }}>
              <PlusIcon />
            </div>
            <span>Add New Server</span>
          </div>
        </button>
      </div>
    );
  }

  renderServerDetail() {
    const { servers, activeServerId, errorMessage } = this.state;
    
    if (!activeServerId) return null;
    
    const server = servers.find(s => s.id === activeServerId);
    if (!server) return null;

    return (
      <div className="server-detail">
        <div className="server-detail-header">
          <h3>{this.state.isAddingNew ? 'Add New Server' : 'Edit Server'}</h3>
          <button 
            className="button-icon" 
            onClick={this.cancelEdit}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {errorMessage && (
          <div className="form-section">
            <div className="status-indicator status-error">
              {errorMessage}
            </div>
          </div>
        )}

        <div className="form-section">
          <div className="form-row">
            <div className="input-group">
              <label className="input-label">
                <div className="label-container">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ marginRight: '8px' }}>
                      <GearIcon />
                    </div>
                    <span>Server Name</span>
                  </div>
                  <span className="label-description">Name for this Ollama server</span>
                </div>
              </label>
              <input
                type="text"
                className="input-field"
                value={server.serverName}
                onChange={(e) => this.handleInputChange(server.id, 'serverName', e.target.value)}
                placeholder="Enter server name"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="input-group">
              <label className="input-label">
                <div className="label-container">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ marginRight: '8px' }}>
                      <LinkIcon />
                    </div>
                    <span>Server Address</span>
                  </div>
                  <span className="label-description">URL of the Ollama server</span>
                </div>
              </label>
              <input
                type="text"
                className="input-field"
                value={server.serverAddress}
                onChange={(e) => this.handleInputChange(server.id, 'serverAddress', e.target.value)}
                placeholder="Enter server address"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="input-group">
              <label className="input-label">
                <div className="label-container">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ marginRight: '8px' }}>
                      <KeyIcon />
                    </div>
                    <span>API Key (Optional)</span>
                  </div>
                  <span className="label-description">Authentication key (if required)</span>
                </div>
              </label>
              <input
                type="password"
                className="input-field"
                value={server.apiKey}
                onChange={(e) => this.handleInputChange(server.id, 'apiKey', e.target.value)}
                placeholder="Enter API key (optional)"
              />
            </div>
          </div>

          {server.connectionStatus !== 'idle' && (
            <div className={`status-indicator status-${server.connectionStatus}`}>
              {server.connectionStatus === 'checking' && (
                <>
                  <div className="spinner" />
                  Testing connection...
                </>
              )}
              {server.connectionStatus === 'success' && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ marginRight: '8px' }}>
                    <LightningIcon />
                  </div>
                  <span>Connection successful!</span>
                </div>
              )}
              {server.connectionStatus === 'error' && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ marginRight: '8px' }}>
                    <CloseIcon />
                  </div>
                  <span>Connection failed</span>
                </div>
              )}
            </div>
          )}

          <div className="button-group">
            <button
              className="button button-secondary"
              onClick={() => this.testConnection(server.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ marginRight: '8px' }}>
                  <UpdateIcon />
                </div>
                <span>Test Connection</span>
              </div>
            </button>

            <button
              className="button button-primary"
              onClick={() => this.updateServer(server.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ marginRight: '8px' }}>
                  <LightningIcon />
                </div>
                <span>{this.state.isAddingNew ? 'Add Server' : 'Update Server'}</span>
              </div>
            </button>

            {!this.state.isAddingNew && (
              <button
                className="button button-danger"
                onClick={() => this.deleteServer(server.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ marginRight: '8px' }}>
                    <TrashIcon />
                  </div>
                  <span>Delete Server</span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  renderModelsTable = () => {
    const { selectedModelId, expandedModelId, installations } = this.state;
    const { models: displayModels, totalItems, totalPages, currentPage, itemsPerPage } = this.getPaginatedModels();

    if (totalItems === 0 && installations.length === 0) {
      return (
        <div className="models-table-empty">
          <p>No models found on this server</p>
        </div>
      );
    }

    return (
      <div className="models-table-container">
        <table className="models-table">
          <thead>
            <tr>
              <th
                className={`sortable-header ${this.state.sortBy === 'name' ? 'active' : ''}`}
                onClick={() => this.handleSortChange('name')}
              >
                Name
                {this.state.sortBy === 'name' && (
                  <span className="sort-indicator">
                    {this.state.sortOrder === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th
                className={`sortable-header ${this.state.sortBy === 'size' ? 'active' : ''}`}
                onClick={() => this.handleSortChange('size')}
              >
                Size
                {this.state.sortBy === 'size' && (
                  <span className="sort-indicator">
                    {this.state.sortOrder === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th
                className={`sortable-header ${this.state.sortBy === 'family' ? 'active' : ''}`}
                onClick={() => this.handleSortChange('family')}
              >
                Family
                {this.state.sortBy === 'family' && (
                  <span className="sort-indicator">
                    {this.state.sortOrder === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
              <th className="table-header-actions">
                Remove
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Installation Progress Rows */}
            {installations.map((installation) => (
              <tr key={`install-${installation.id}`} className="table-row-installation">
                <td className="model-name-cell">
                  <div className="model-name-content">
                    <span className="model-name">{installation.modelName}</span>
                    <div className="installation-status-inline">
                      {installation.status === 'pending' && 'Queued...'}
                      {installation.status === 'downloading' && (
                        installation.progress > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="installation-progress-bar-inline">
                              <div
                                className="installation-progress-fill-inline"
                                style={{ width: `${installation.progress}%` }}
                              />
                            </div>
                            <span>
                              Downloading... {installation.progress}%{installation.customMessage ? ` • ${installation.customMessage}` : ''}
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="spinner-small" />
                            <span>
                              {installation.customMessage ? installation.customMessage : 'Downloading...'}
                            </span>
                          </div>
                        )
                      )}
                      {installation.status === 'completed' && (
                        <span className="installation-completed">
                          {installation.customMessage
                            ? `✓ ${installation.customMessage}`
                            : '✓ Installation completed'
                          }
                        </span>
                      )}
                      {installation.status === 'error' && (
                        <span className="installation-error">✗ Failed: {installation.error}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td>-</td>
                <td>-</td>
                <td>
                  <button
                    className="button-icon small delete-button"
                    onClick={() => this.removeInstallation(installation.id)}
                    aria-label="Remove installation"
                    title="Remove installation"
                  >
                    <CloseIcon />
                  </button>
                </td>
              </tr>
            ))}

            {/* Regular Model Rows */}
            {displayModels.map((model) => {
              const modelId = `${model.name}-${model.tag}`;
              const isExpanded = expandedModelId === modelId;
              
              return (
                <React.Fragment key={modelId}>
                  <tr
                    className={`model-row ${isExpanded ? 'expanded' : ''}`}
                    onClick={() => this.handleModelRowClick(modelId)}
                  >
                    <td className="model-name-cell">
                      <div className="model-name-content">
                        <span className="model-name">{model.name}</span>
                        <span className="model-tag">{model.tag}</span>
                      </div>
                    </td>
                    <td>{this.formatFileSize(model.size)}</td>
                    <td>{model.details?.family || '-'}</td>
                    <td>
                      <button
                        className="button-icon small delete-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          this.handleModelAction('delete', modelId);
                        }}
                        aria-label={`Delete ${model.name}`}
                        title={`Delete ${model.name}`}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="model-actions-row">
                      <td colSpan={4}>
                        <div className="model-actions">
                          <div className="model-actions-grid">
                            <div className="action-info-item">
                              <span className="label">Modified:</span>
                              <span className="value">{this.formatDate(model.modified_at)}</span>
                            </div>
                            <div className="action-info-item">
                              <span className="label">Parameters:</span>
                              <span className="value">{model.details?.parameter_size || 'Not specified'}</span>
                            </div>
                            <div className="action-info-item">
                              <span className="label">Quantization:</span>
                              <span className="value">{model.details?.quantization_level || 'Not specified'}</span>
                            </div>
                            <div className="action-info-item">
                              <span className="label">Format:</span>
                              <span className="value">{model.details?.format || 'Not specified'}</span>
                            </div>
                            {model.details?.license && (
                              <div className="action-info-item">
                                <span className="label">License:</span>
                                <span className="value">{model.details.license}</span>
                              </div>
                            )}
                            {model.details?.template && (
                              <div className="action-info-item">
                                <span className="label">Template:</span>
                                <span className="value template-preview">{model.details.template.substring(0, 100)}...</span>
                              </div>
                            )}
                            {model.details?.system && (
                              <div className="action-info-item">
                                <span className="label">System:</span>
                                <span className="value template-preview">{model.details.system.substring(0, 100)}...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        
        {/* Pagination Controls */}
        <div className="pagination-container">
          <div className="pagination-info">
            <span>
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} models
            </span>
          </div>
          
          <div className="pagination-controls">
            <div className="pagination-items-per-page">
              <label htmlFor="items-per-page">Items per page:</label>
              <select
                id="items-per-page"
                value={itemsPerPage}
                onChange={(e) => this.handleItemsPerPageChange(Number(e.target.value))}
                className="pagination-select"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            
            <div className="pagination-buttons">
              <button
                className="pagination-button"
                onClick={() => this.handlePageChange(1)}
                disabled={currentPage === 1}
                aria-label="First page"
              >
                «
              </button>
              <button
                className="pagination-button"
                onClick={() => this.handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                ‹
              </button>
              
              {/* Page numbers */}
              {this.renderPageNumbers(currentPage, totalPages)}
              
              <button
                className="pagination-button"
                onClick={() => this.handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                ›
              </button>
              <button
                className="pagination-button"
                onClick={() => this.handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                aria-label="Last page"
              >
                »
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  renderModelManagement() {
    const { servers, activeServerId, models, modelsLoading, modelsError, selectedModelId } = this.state;
    
    if (!activeServerId) {
      return (
        <div className="model-management">
          <div className="model-management-placeholder">
            <div className="placeholder-content">
              <div style={{ marginBottom: '16px' }}>
                <TagIcon />
              </div>
              <p>Select a server to view and manage its models</p>
            </div>
          </div>
        </div>
      );
    }

    const server = servers.find(s => s.id === activeServerId);
    if (!server) return null;

    const dropdownOptions = this.getDropdownOptions();

    return (
      <div className="model-management">
        <div className="model-management-header">
          <h3>{server.serverName}</h3>
        </div>

        {modelsError && (
          <div className="form-section">
            <div className="status-indicator status-error">
              {modelsError}
            </div>
          </div>
        )}

        <div className="model-selection-section">
          <div className="model-controls">
            <div className="model-dropdown-container">
              <label className="input-label">
                {selectedModelId ? 'Selected Model' : 'Filter Models'}
              </label>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
                <CustomDropdown
                  options={dropdownOptions}
                  selectedId={selectedModelId || ''}
                  onChange={this.handleModelSelection}
                  placeholder="Select a model"
                  disabled={modelsLoading || models.length === 0}
                  ariaLabel="Select Ollama model"
                />
                {selectedModelId && (
                  <button
                    className="button button-secondary"
                    onClick={() => this.setState({ selectedModelId: null, expandedModelId: null })}
                    style={{ height: '40px', padding: '0.5rem 1rem' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <CloseIcon />
                      <span style={{ marginLeft: '0.5rem' }}>Clear Filter</span>
                    </div>
                  </button>
                )}
              </div>
            </div>
            <div className="model-controls-buttons">
              <button
                className="button button-primary"
                onClick={this.openInstallModal}
                disabled={!activeServerId}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ marginRight: '8px' }}>
                    <PlusIcon />
                  </div>
                  <span>Install Model</span>
                </div>
              </button>
              <button
                className="button button-secondary"
                onClick={() => this.loadModels(server.id)}
                disabled={modelsLoading}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ marginRight: '8px' }}>
                    <UpdateIcon />
                  </div>
                  <span>{modelsLoading ? 'Loading...' : 'Refresh Models'}</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="models-table-section">
          {modelsLoading ? (
            <div className="loading-spinner">
              <div className="spinner" />
              <span>Loading models...</span>
            </div>
          ) : (
            this.renderModelsTable()
          )}
        </div>
      </div>
    );
  }

  renderTabs() {
    const { activeTab } = this.state;
    
    return (
      <div className="tabs-container">
        <div className="tabs-header">
          <button
            className={`tab-button ${activeTab === 'servers' ? 'active' : ''}`}
            onClick={() => this.setActiveTab('servers')}
          >
            <GearIcon />
            <span>Server Settings</span>
          </button>
          <button
            className={`tab-button ${activeTab === 'models' ? 'active' : ''}`}
            onClick={() => this.setActiveTab('models')}
          >
            <TagIcon />
            <span>Model Management</span>
          </button>
        </div>
        
        <div className="tab-content">
          {activeTab === 'servers' && (
            <div className="server-management">
              {this.renderServerList()}
              {this.state.activeServerId && this.renderServerDetail()}
              {!this.state.activeServerId && (
                <div className="server-detail-placeholder">
                  <div className="placeholder-content">
                    <div style={{ marginBottom: '16px' }}>
                      <GearIcon />
                    </div>
                    <p>Select a server to edit or add a new server</p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'models' && this.renderModelManagement()}
        </div>
      </div>
    );
  }

  render() {
    const { isLoading } = this.state;
    const themeClass = this.state.currentTheme === 'dark' ? 'dark-theme' : '';

    if (isLoading) {
      return (
        <div className={`ollama-container ${themeClass}`}>
          <div className="ollama-paper">
            <div className="loading-spinner">
              <div className="spinner" />
              <span>Loading settings...</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`ollama-container ${themeClass}`}>
        <div className="ollama-paper">
          <div className="ollama-server-layout">
            {this.renderTabs()}
            <ModelInstallDialog
              isOpen={this.state.showInstallModal}
              onClose={this.closeInstallModal}
              onInstall={this.startModelInstallation}
              isLoading={false}
              services={this.props.services}
              serverAddress={this.state.activeServerId ? (this.state.servers.find(s => s.id === this.state.activeServerId)?.serverAddress || '') : ''}
              apiKey={this.state.activeServerId ? (this.state.servers.find(s => s.id === this.state.activeServerId)?.apiKey || '') : ''}
            />
          </div>
        </div>
      </div>
    );
  }

  // Confirm that a model appears in Ollama's tags list before removing the install row
  private confirmModelAvailability = async (
    serverAddress: string,
    apiKey: string | undefined,
    modelName: string,
    timeoutMs: number = 20000
  ): Promise<boolean> => {
    const start = Date.now();
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    try {
      while (Date.now() - start < timeoutMs) {
        try {
          const encodedUrl = encodeURIComponent(serverAddress);
          const params: Record<string, string> = { server_url: encodedUrl };
          if (apiKey) params.api_key = apiKey;
          const models: any = await this.props.services!.api!.get('/api/v1/ollama/models', { params });
          if (Array.isArray(models) && models.some((m: any) => m?.name === modelName)) {
            return true;
          }
        } catch (e) {
          // Ignore transient errors
        }
        await sleep(1000);
      }
    } catch (e) {
      // ignore
    }
    return false;
  };
}

export default ComponentOllamaServer;
