import './index.css';
import './bootstrap';
import ComponentTheme from './ComponentTheme';
import { ComponentGeneralSettings } from './components/GeneralSettings';

// Export the components
export {
  ComponentTheme,
  ComponentGeneralSettings,
};

// For local development
//if (process.env.NODE_ENV === 'development') {
//  const { createRoot } = require('react-dom/client');
 // const root = createRoot(document.getElementById('root'));
//  root.render(<Component />);
//}
