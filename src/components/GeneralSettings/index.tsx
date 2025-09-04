import React from 'react';
import '../../ComponentTheme.css';
import './GeneralSettings.css';
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
  
  // Definition management (optional)
  registerSettingDefinition?: (definition: any) => Promise<void>;
  getSettingDefinitions?: (filter?: { category?: string; tags?: string[] }) => Promise<any[]>;
  
  // Subscription methods (optional)
  subscribe?: (key: string, callback: (value: any) => void) => () => void;
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

// Settings key - simplified to match ServiceExample_Settings pattern
const SETTINGS_KEY = 'general_settings';

/**
 * ComponentGeneralSettings - A component that allows users to configure general application settings
 * such as the default landing page after login.
 *
 * Simplified to follow ServiceExample_Settings pattern for proper Settings Service Bridge usage.
 */
class ComponentGeneralSettings extends React.Component<GeneralSettingsProps, GeneralSettingsState> {
  private themeChangeListener: ((theme: string) => void) | null = null;
  private settingsUnsubscribe?: () => void;

  constructor(props: GeneralSettingsProps) {
    super(props);
    
    // Basic service validation logging
    if (!props.services?.settings) {
      console.warn('ComponentGeneralSettings: Settings service not available');
    }
    
    this.state = {
      pages: [],
      selectedPage: 'Dashboard',
      isLoading: true,
      error: null,
      currentTheme: 'light'
    };
  }

  async componentDidMount() {
    try {
      this.validateServices();
      await this.ensureSettingsDefinition();
      this.initializeThemeService();
      this.initializeSettingsSubscription();
      await this.loadSettings();
      await this.loadPages();
    } catch (error) {
      console.error('ComponentGeneralSettings: Initialization failed:', error);
      this.setState({
        error: `Initialization failed: ${(error as any).message || 'Unknown error'}`,
        isLoading: false
      });
    }
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
   * Ensure the general_settings definition exists in the SettingsService cache
   * This addresses the environment-specific issue where the definition exists in the database
   * but hasn't been loaded into the SettingsService's local cache
   */
  async ensureSettingsDefinition() {
    if (!this.props.services?.settings) {
      return;
    }
    
    try {
      // Try to load the setting to trigger definition loading from backend
      await this.props.services.settings.getSetting(SETTINGS_KEY, { userId: 'current' });
      return;
    } catch (loadError) {
      // If loading failed, try to register the definition as a fallback
      if (this.props.services.settings.registerSettingDefinition && typeof this.props.services.settings.registerSettingDefinition === 'function') {
        const definition = {
          id: SETTINGS_KEY,
          name: 'General Settings',
          description: 'General application settings including default page configuration',
          category: 'application',
          type: 'object' as const,
          allowedScopes: ['user', 'system', 'page', 'user_page'] as const,
          isMultiple: false,
          tags: ['general', 'application', 'default_page']
        };
        
        try {
          await this.props.services.settings.registerSettingDefinition(definition);
        } catch (regError) {
          if (!(regError as any).message?.includes('already exists')) {
            console.error('ComponentGeneralSettings: Failed to register definition:', regError);
          }
        }
      }
    }
  }

  /**
   * Validate that required services are available
   */
  private validateServices(): void {
    if (!this.props.services?.settings) {
      console.error('ComponentGeneralSettings: Settings service not available');
      this.setState({
        error: 'Settings service not available',
        isLoading: false
      });
      return;
    }

    if (typeof this.props.services.settings.getSetting !== 'function') {
      console.error('ComponentGeneralSettings: getSetting method not available');
      this.setState({
        error: 'Settings service getSetting method not available',
        isLoading: false
      });
      return;
    }

    if (typeof this.props.services.settings.setSetting !== 'function') {
      console.error('ComponentGeneralSettings: setSetting method not available');
      this.setState({
        error: 'Settings service setSetting method not available',
        isLoading: false
      });
      return;
    }
  }

  /**
   * Initialize settings subscription for real-time updates (optional)
   */
  initializeSettingsSubscription() {
    if (!this.props.services?.settings?.subscribe) {
      return;
    }

    // Subscribe to General settings changes
    this.settingsUnsubscribe = this.props.services.settings.subscribe(
      SETTINGS_KEY,
      (value: any) => {
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
        const theme = this.props.services.theme.getCurrentTheme();
        this.setState({ currentTheme: theme });
        
        // Subscribe to theme changes
        this.themeChangeListener = (newTheme: string) => {
          this.setState({ currentTheme: newTheme });
        };
        
        this.props.services.theme.addThemeChangeListener(this.themeChangeListener);
      } catch (error) {
        console.error('ComponentGeneralSettings: Error initializing theme service:', error);
        this.setState({ error: 'Failed to initialize theme service' });
      }
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
      const response = await this.props.services.api.get('/api/v1/pages', {
        params: { published_only: true }
      });
      
      const pages = Array.isArray(response?.pages) ? response.pages : response?.data?.pages;
      
      if (Array.isArray(pages)) {
        const formatted = pages.map((p: any) => ({ id: p.id, name: p.name }));
        this.setState({ pages: formatted });
      }
    } catch (error: any) {
      console.error('ComponentGeneralSettings: Error loading pages:', error);
      this.setState({ error: error.message || 'Error loading pages' });
    } finally {
      this.setState({ isLoading: false });
    }
  }

  /**
   * Load general settings using Settings Service Bridge with API fallback
   */
  async loadSettings() {
    this.setState({ isLoading: true, error: null });
    
    if (!this.props.services?.settings) {
      // Fallback to API service if Settings service not available
      if (!this.props.services?.api) {
        this.setState({
          selectedPage: 'Dashboard',
          isLoading: false,
          error: 'Neither Settings nor API service available - using default'
        });
        return;
      }
      return this.loadSettingsFromAPI();
    }
    
    try {
      const settingsValue = await this.props.services.settings.getSetting(
        SETTINGS_KEY,
        { userId: 'current' }
      );
      
      if (settingsValue && settingsValue.settings) {
        // Find the default page setting
        const defaultPageSetting = settingsValue.settings.find((s: any) => s.Setting_Name === 'default_page');
        
        if (defaultPageSetting && defaultPageSetting.Setting_Data) {
          this.setState({
            selectedPage: defaultPageSetting.Setting_Data,
            isLoading: false,
            error: null
          });
        } else {
          this.setState({
            selectedPage: 'Dashboard',
            isLoading: false,
            error: null
          });
        }
      } else {
        this.setState({
          selectedPage: 'Dashboard',
          isLoading: false,
          error: null
        });
      }
    } catch (error) {
      console.error('ComponentGeneralSettings: Error loading settings:', error);
      this.setState({
        selectedPage: 'Dashboard',
        isLoading: false,
        error: `Error loading settings: ${(error as any).message || 'Unknown error'}`
      });
    }
  }

  /**
   * Fallback method to load settings from API when Settings service is not available
   */
  async loadSettingsFromAPI() {
    try {
      const response = await this.props.services!.api!.get('/api/v1/settings/instances', {
        params: {
          definition_id: SETTINGS_KEY,
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
        const value = typeof instance.value === 'string' ? JSON.parse(instance.value) : instance.value;
        const defaultPageSetting = value?.settings?.find((s: any) => s.Setting_Name === 'default_page');
        
        if (defaultPageSetting && defaultPageSetting.Setting_Data) {
          this.setState({
            selectedPage: defaultPageSetting.Setting_Data,
            isLoading: false,
            error: null
          });
        } else {
          this.setState({
            selectedPage: 'Dashboard',
            isLoading: false,
            error: null
          });
        }
      } else {
        this.setState({
          selectedPage: 'Dashboard',
          isLoading: false,
          error: null
        });
      }
    } catch (error) {
      console.error('ComponentGeneralSettings: Error loading settings via API:', error);
      this.setState({
        selectedPage: 'Dashboard',
        isLoading: false,
        error: `Error loading settings: ${(error as any).message || 'Unknown error'}`
      });
    }
  }

  /**
   * Save general settings using Settings Service Bridge with API fallback
   */
  async saveSettings(newPage: string) {
    if (!this.props.services?.settings) {
      // Fallback to API service if Settings service not available
      if (!this.props.services?.api) {
        this.setState({ error: 'Settings service not available' });
        return;
      }
      return this.saveSettingsToAPI(newPage);
    }
    
    try {
      // Ensure definition exists before attempting to save
      await this.ensureSettingsDefinition();
      
      // Prepare settings value following the same structure
      const settingsValue = {
        settings: [
          {
            Setting_Name: 'default_page',
            Setting_Data: newPage,
            Setting_Help: 'This is the first page to be displayed after logging in to BrainDrive'
          }
        ]
      };
      
      await this.props.services.settings.setSetting(
        SETTINGS_KEY,
        settingsValue,
        { userId: 'current' }
      );
      
      this.setState({ selectedPage: newPage, error: null });
    } catch (error) {
      console.error('ComponentGeneralSettings: Error saving settings:', error);
      
      // If the error is about missing definition, try API fallback
      if ((error as any).message?.includes('Setting definition') && (error as any).message?.includes('not found')) {
        try {
          await this.saveSettingsToAPI(newPage);
          return;
        } catch (apiError) {
          console.error('ComponentGeneralSettings: API fallback also failed:', apiError);
          this.setState({ error: `Error saving settings: ${(apiError as any).message || 'Unknown error'}` });
          return;
        }
      }
      
      this.setState({ error: `Error saving settings: ${(error as any).message || 'Unknown error'}` });
    }
  }

  /**
   * Fallback method to save settings to API when Settings service is not available
   */
  async saveSettingsToAPI(newPage: string) {
    try {
      // First, find the existing instance to update it instead of creating a new one
      let existingInstanceId = null;
      
      try {
        const existingResponse = await this.props.services!.api!.get('/api/v1/settings/instances', {
          params: {
            definition_id: SETTINGS_KEY,
            scope: 'user',
            user_id: 'current'
          }
        });
        
        if (Array.isArray(existingResponse) && existingResponse.length > 0) {
          existingInstanceId = existingResponse[0].id;
        } else if (existingResponse && existingResponse.id) {
          existingInstanceId = existingResponse.id;
        }
      } catch (searchError) {
        console.warn('ComponentGeneralSettings: Could not search for existing instance:', searchError);
      }
      
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
        definition_id: SETTINGS_KEY,
        name: 'General Settings',
        value,
        scope: 'user',
        user_id: 'current'
      };
      
      // Include existing ID to force update instead of create
      if (existingInstanceId) {
        payload.id = existingInstanceId;
      }
      
      const resp = await this.props.services!.api!.post('/api/v1/settings/instances', payload);
      
      this.setState({ selectedPage: newPage, error: null });
    } catch (error) {
      console.error('ComponentGeneralSettings: Error saving settings via API:', error);
      this.setState({ error: `Error saving settings: ${(error as any).message || 'Unknown error'}` });
    }
  }

  /**
   * Handle page selection change
   */
  handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    this.setState({ selectedPage: val });
    this.saveSettings(val);
  };

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error: any): string {
    if (error?.message && error.message.includes('network')) {
      return 'Network error: Could not connect to settings service';
    } else if (error?.message && error.message.includes('permission')) {
      return 'Permission denied: You do not have access to these settings';
    } else {
      return `Error: ${error?.message || 'Unknown error'}`;
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
              <div className="theme-option-description">Choose which page to display after login.</div>
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
