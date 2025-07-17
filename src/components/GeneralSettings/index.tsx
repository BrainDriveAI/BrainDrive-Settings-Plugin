import React from 'react';
import '../../ComponentTheme.css';
import './GeneralSettings.css';
import { GENERAL_SETTINGS } from '../../settings-constants';
import { GearIcon } from '../../icons';

interface ApiService {
  get: (url: string, options?: any) => Promise<any>;
  post: (url: string, data: any) => Promise<any>;
}

interface ThemeService {
  getCurrentTheme: () => string;
  addThemeChangeListener: (callback: (theme: string) => void) => void;
  removeThemeChangeListener: (callback: (theme: string) => void) => void;
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

interface PageInfo {
  id: string;
  name: string;
}

interface GeneralSettingsProps {
  services?: {
    api?: ApiService;
    theme?: ThemeService;
    settings?: SettingsServiceBridge;
  };
}

interface GeneralSettingsState {
  pages: PageInfo[];
  selectedPage: string;
  isLoading: boolean;
  error: string | null;
  currentTheme: string;
}

// General Settings Configuration
const GENERAL_SETTINGS_CONFIG = {
  DEFINITION_ID: 'general_settings',
  CATEGORY: 'general',
  SCHEMA: {
    type: 'object',
    properties: {
      settings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            Setting_Name: { type: 'string' },
            Setting_Data: { type: 'string' },
            Setting_Help: { type: 'string' }
          },
          required: ['Setting_Name', 'Setting_Data']
        }
      }
    }
  },
  DEFAULT_VALUE: {
    settings: [
      {
        Setting_Name: 'default_page',
        Setting_Data: 'Dashboard',
        Setting_Help: 'This is the first page to be displayed after logging in to BrainDrive'
      }
    ]
  }
};

/**
 * ComponentGeneralSettings - A component that allows users to configure general application settings
 * such as the default landing page after login.
 */
class ComponentGeneralSettings extends React.Component<GeneralSettingsProps, GeneralSettingsState> {
  private themeChangeListener: ((theme: string) => void) | null = null;
  private settingsUnsubscribe?: () => void;

  constructor(props: GeneralSettingsProps) {
    super(props);
    
    // Debug the props received
    console.log('ComponentGeneralSettings constructor - props received:', {
      hasServices: !!props.services,
      hasApiService: props.services?.api ? 'YES' : 'NO',
      hasThemeService: props.services?.theme ? 'YES' : 'NO',
      hasSettingsService: props.services?.settings ? 'YES' : 'NO'
    });
    
    this.state = {
      pages: [],
      selectedPage: 'Dashboard',
      isLoading: true,
      error: null,
      currentTheme: 'light'
    };
  }

  async componentDidMount() {
    console.log('ComponentGeneralSettings componentDidMount - initializing...');
    await this.initializeSettingsDefinition();
    this.initializeSettingsSubscription();
    this.initializeThemeService();
    this.loadSettings();
    this.loadPages();
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
   * Initialize the General settings definition
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
          category: GENERAL_SETTINGS_CONFIG.CATEGORY
        });
        
        const existingDefinition = definitions.find(def => def.id === GENERAL_SETTINGS_CONFIG.DEFINITION_ID);
        if (existingDefinition) {
          console.log('General settings definition already exists');
          return;
        }
      }

      // Register the definition
      await this.props.services.settings.registerSettingDefinition({
        id: GENERAL_SETTINGS_CONFIG.DEFINITION_ID,
        name: 'General Settings',
        description: 'General application settings including default page configuration',
        category: GENERAL_SETTINGS_CONFIG.CATEGORY,
        scope: 'user',
        schema: GENERAL_SETTINGS_CONFIG.SCHEMA,
        defaultValue: GENERAL_SETTINGS_CONFIG.DEFAULT_VALUE,
        tags: ['general', 'default_page', 'navigation']
      });

      console.log('General settings definition registered successfully');
    } catch (error) {
      console.error('Failed to register General settings definition:', error);
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

    // Subscribe to General settings changes
    this.settingsUnsubscribe = this.props.services.settings.subscribe(
      GENERAL_SETTINGS_CONFIG.DEFINITION_ID,
      (value: any) => {
        console.log('General settings updated:', value);
        if (value && value.settings) {
          const defaultPageSetting = value.settings.find((s: any) => s.Setting_Name === 'default_page');
          if (defaultPageSetting && defaultPageSetting.Setting_Data) {
            this.setState({
              selectedPage: defaultPageSetting.Setting_Data,
              error: null
            });
          }
        }
      }
    );
  }

  /**
   * Initialize the theme service
   */
  initializeThemeService() {
    if (this.props.services?.theme) {
      try {
        console.log('Initializing theme service...');
        const theme = this.props.services.theme.getCurrentTheme();
        console.log('Current theme retrieved:', theme);
        this.setState({ currentTheme: theme });
        
        // Subscribe to theme changes
        this.themeChangeListener = (newTheme: string) => {
          console.log('Theme changed to:', newTheme);
          this.setState({ currentTheme: newTheme });
        };
        
        console.log('Adding theme change listener...');
        this.props.services.theme.addThemeChangeListener(this.themeChangeListener);
        console.log('Theme service initialized successfully');
      } catch (error) {
        console.error('Error initializing theme service:', error);
        this.setState({ error: 'Failed to initialize theme service' });
      }
    } else {
      console.warn('Theme service not available');
    }
  }

  /**
   * Load available pages from the API
   */
  async loadPages() {
    if (!this.props.services?.api) {
      this.setState({ error: 'API service not available', isLoading: false });
      return;
    }
    
    try {
      console.log('Loading available pages...');
      const response = await this.props.services.api.get('/api/v1/pages', {
        params: { published_only: true }
      });
      
      const pages = Array.isArray(response?.pages) ? response.pages : response?.data?.pages;
      
      if (Array.isArray(pages)) {
        const formatted = pages.map((p: any) => ({ id: p.id, name: p.name }));
        console.log('Pages loaded successfully:', formatted);
        this.setState({ pages: formatted });
      } else {
        console.warn('No pages found or invalid response format');
      }
    } catch (error: any) {
      console.error('Error loading pages:', error);
      this.setState({ error: error.message || 'Error loading pages' });
    } finally {
      this.setState({ isLoading: false });
    }
  }

  /**
   * Load general settings using Settings service
   */
  async loadSettings() {
    if (!this.props.services?.settings) {
      // Fallback to API service if Settings service not available
      if (!this.props.services?.api) {
        console.warn('Neither Settings nor API service available for loading settings');
        return;
      }
      return this.loadSettingsFromAPI();
    }
    
    try {
      console.log('Loading general settings...');
      const settingsValue = await this.props.services.settings.getSetting(
        GENERAL_SETTINGS_CONFIG.DEFINITION_ID,
        { userId: 'current' }
      );
      
      if (settingsValue && settingsValue.settings) {
        console.log('General settings found:', settingsValue);
        
        // Find the default page setting
        const defaultPageSetting = settingsValue.settings.find((s: any) => s.Setting_Name === 'default_page');
        
        if (defaultPageSetting && defaultPageSetting.Setting_Data) {
          console.log('Default page setting found:', defaultPageSetting.Setting_Data);
          this.setState({ selectedPage: defaultPageSetting.Setting_Data });
        } else {
          console.log('No default page setting found, using Dashboard');
        }
      } else {
        console.log('No general settings found, using defaults');
        this.setState({ selectedPage: 'Dashboard' });
      }
    } catch (error) {
      console.error('Error loading general settings:', error);
      this.setState({ error: this.getErrorMessage(error) });
    }
  }

  /**
   * Fallback method to load settings from API when Settings service is not available
   */
  async loadSettingsFromAPI() {
    try {
      console.log('Loading general settings from API...');
      const response = await this.props.services!.api!.get('/api/v1/settings/instances', {
        params: {
          definition_id: GENERAL_SETTINGS.DEFINITION_ID,
          scope: 'user',
          user_id: 'current'
        }
      });
      
      let instance = null;
      
      if (Array.isArray(response) && response.length > 0) {
        instance = response[0];
      } else if (response?.data) {
        const data = Array.isArray(response.data) ? response.data[0] : response.data;
        instance = data;
      } else if (response) {
        instance = response;
      }
      
      if (instance) {
        console.log('General settings found:', instance);
        
        const value = typeof instance.value === 'string' ? JSON.parse(instance.value) : instance.value;
        const defaultPageSetting = value?.settings?.find((s: any) => s.Setting_Name === 'default_page');
        
        if (defaultPageSetting && defaultPageSetting.Setting_Data) {
          console.log('Default page setting found:', defaultPageSetting.Setting_Data);
          this.setState({ selectedPage: defaultPageSetting.Setting_Data });
        } else {
          console.log('No default page setting found, using Dashboard');
        }
      } else {
        console.log('No general settings found, will create new on save');
      }
    } catch (error) {
      console.error('Error loading general settings:', error);
      this.setState({ error: this.getErrorMessage(error) });
    }
  }

  /**
   * Save general settings using Settings service
   */
  async saveSettings(newPage: string) {
    if (!this.props.services?.settings) {
      // Fallback to API service if Settings service not available
      if (!this.props.services?.api) {
        console.warn('Neither Settings nor API service available for saving settings');
        return;
      }
      return this.saveSettingsToAPI(newPage);
    }
    
    try {
      console.log('Saving general settings, new default page:', newPage);
      
      const settingsValue = {
        settings: [
          {
            Setting_Name: 'default_page',
            Setting_Data: newPage,
            Setting_Help: 'This is the first page to be displayed after logging in to BrainDrive'
          }
        ]
      };
      
      // Use Settings service to save general settings
      await this.props.services.settings.setSetting(
        GENERAL_SETTINGS_CONFIG.DEFINITION_ID,
        settingsValue,
        { userId: 'current' }
      );
      
      console.log('Settings saved successfully');
      this.setState({ selectedPage: newPage, error: null });
    } catch (error) {
      console.error('Error saving general settings:', error);
      this.setState({ error: this.getErrorMessage(error) });
    }
  }

  /**
   * Fallback method to save settings to API when Settings service is not available
   */
  async saveSettingsToAPI(newPage: string) {
    try {
      console.log('Saving general settings to API, new default page:', newPage);
      
      const value = {
        settings: [
          {
            Setting_Name: 'default_page',
            Setting_Data: newPage,
            Setting_Help: 'This is the first page to be displayed after logging in to BrainDrive'
          }
        ]
      };
      
      const payload: any = {
        definition_id: GENERAL_SETTINGS.DEFINITION_ID,
        name: GENERAL_SETTINGS.NAME,
        value,
        scope: 'user',
        user_id: 'current'
      };
      
      const resp = await this.props.services!.api!.post('/api/v1/settings/instances', payload);
      
      if (resp?.id) {
        console.log('Settings saved successfully, ID:', resp.id);
        this.setState({ error: null });
      } else {
        console.log('Settings saved, but no ID returned');
        this.setState({ error: null });
      }
    } catch (error) {
      console.error('Error saving general settings:', error);
      this.setState({ error: this.getErrorMessage(error) });
    }
  }

  /**
   * Handle page selection change
   */
  handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    console.log('Default page changed to:', val);
    this.setState({ selectedPage: val });
    this.saveSettings(val);
  };

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error: any): string {
    if (error.message && error.message.includes('network')) {
      return 'Network error: Could not connect to settings service';
    } else if (error.message && error.message.includes('permission')) {
      return 'Permission denied: You do not have access to these settings';
    } else {
      return `Error: ${error.message || 'Unknown error'}`;
    }
  }

  render() {
    const { pages, selectedPage, isLoading, error, currentTheme } = this.state;
    const themeClass = currentTheme === 'dark' ? 'dark-theme' : '';

    // Show loading state
    if (isLoading) {
      return (
        <div className={`theme-paper ${themeClass}`}>
          <div className="loading-spinner">
            <div className="spinner"></div>
            <span>Loading settings...</span>
          </div>
        </div>
      );
    }

    return (
      <div className={`theme-paper ${themeClass}`}>
        {/* Error message if any */}
        {error && (
          <div className="error-message">
            <strong>Error: </strong>{error}
          </div>
        )}
        
        {/* Main content area */}
        <div>
          {/* Default page setting */}
          <div className="theme-option-row">
            <div className="theme-option-icon">
              <GearIcon />
            </div>
            <div className="theme-option-content">
              <div className="theme-option-title">Default Page</div>
              <div className="theme-option-description">Choose which page to display after login</div>
            </div>
            <div className="theme-option-control">
              <select
                id="defaultPageSelect"
                className="settings-select"
                value={selectedPage}
                onChange={this.handleChange}
              >
                <option value="Dashboard">Dashboard</option>
                {pages.map(page => (
                  <option key={page.id} value={page.id}>{page.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ComponentGeneralSettings;
export { ComponentGeneralSettings };
