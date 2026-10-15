/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Dashboard from './pages/Dashboard.jsx';
import Calendar from './pages/Calendar.jsx';
import GrantDetail from './pages/GrantDetail';
import Grants from './pages/Grants.jsx';
import Settings from './pages/Settings';
import Archive from './pages/Archive';
import SOWs from './pages/SOWs';
import SOWDetail from './pages/SOWDetail';
import MSAs from './pages/MSAs';
import MSADetail from './pages/MSADetail';
import MOUs from './pages/MOUs';
import MOUDetail from './pages/MOUDetail';
import UserAdmin from './pages/UserAdmin';
import Reports from './pages/Reports';
import DocumentIntelligence from './pages/DocumentIntelligence.jsx';
import AuditTrail from './pages/AuditTrail.jsx';
import InvalidFileCleanup from './pages/InvalidFileCleanup.jsx';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "Calendar": Calendar,
    "GrantDetail": GrantDetail,
    "Grants": Grants,
    "Settings": Settings,
    "Archive": Archive,
    "SOWs": SOWs,
    "SOWDetail": SOWDetail,
    "MSAs": MSAs,
    "MSADetail": MSADetail,
    "MOUs": MOUs,
    "MOUDetail": MOUDetail,
    "UserAdmin": UserAdmin,
    "Reports": Reports,
    "DocumentIntelligence": DocumentIntelligence,
    "AuditTrail": AuditTrail,
    "InvalidFileCleanup": InvalidFileCleanup,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};