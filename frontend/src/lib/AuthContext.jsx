import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { api, tokenStore } from '@/api/apiClient';

/**
 * Authentication state for the app.
 *
 * Replaces the Base44 hosted-OAuth flow (which read an access token out of the
 * URL and called Base44's public-settings endpoint) with a real session against
 * the GrantOS backend: email + password, a short-lived JWT, and a rotating
 * refresh token.
 *
 * The provider keeps the field names the rest of the app already consumes
 * (isLoadingAuth, authError, navigateToLogin, ...) so no screen needed changing.
 */
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  /**
   * Resolves the current session by asking the backend who we are.
   * The token is never trusted on its own — the server re-reads the user, so a
   * disabled account or a changed role takes effect on the next request.
   */
  const checkUserAuth = useCallback(async () => {
    if (!tokenStore.getAccess()) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return;
    }

    setIsLoadingAuth(true);
    try {
      const currentUser = await api.auth.me();

      if (currentUser?.is_active === false) {
        setAuthError({ type: 'account_disabled', message: 'This account has been disabled.' });
        setUser(null);
        setIsAuthenticated(false);
      } else {
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthError(null);
      }
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);

      if (error?.status === 401 || error?.status === 403) {
        // Expired or revoked session — send the user back to the login screen.
        tokenStore.clear();
        setAuthError({ type: 'auth_required', message: 'Please sign in to continue.' });
      } else if (error?.status === 0) {
        setAuthError({
          type: 'backend_unreachable',
          message:
            error.message ||
            'Cannot reach the GrantOS API. Start the backend and reload this page.',
        });
      } else {
        setAuthError({ type: 'unknown', message: error?.message || 'Failed to load your session.' });
      }
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const login = useCallback(async (email, password) => {
    setAuthError(null);
    await api.auth.login(email, password);
    const currentUser = await api.auth.me();
    setUser(currentUser);
    setIsAuthenticated(true);
    setAuthChecked(true);
    setIsLoadingAuth(false);
    return currentUser;
  }, []);

  const logout = useCallback(async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    await api.auth.logout(shouldRedirect ? '/login' : undefined);
  }, []);

  const navigateToLogin = useCallback(() => {
    api.auth.redirectToLogin();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        // Retained for compatibility with components written against the
        // Base44 provider; there are no remote app settings to fetch now.
        isLoadingPublicSettings: false,
        appPublicSettings: null,
        authChecked,
        authError,
        login,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState: checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
