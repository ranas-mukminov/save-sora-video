/**
 * Chrome API Utilities
 * Provides type-safe wrappers around Chrome Extension APIs with proper error handling
 */

/**
 * Safe wrapper for chrome.tabs.sendMessage with Promise interface
 */
export const sendMessageToTab = <T>(
  tabId: number,
  message: unknown
): Promise<T> => {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve(response as T);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
};

/**
 * Safe wrapper for chrome.downloads.download with Promise interface
 */
export const downloadFile = (
  options: chrome.downloads.DownloadOptions
): Promise<number> => {
  return new Promise((resolve, reject) => {
    try {
      chrome.downloads.download(options, (downloadId) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (typeof downloadId !== 'number') {
          reject(new Error('Failed to initiate download'));
          return;
        }
        resolve(downloadId);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
};

/**
 * Safe wrapper for chrome.storage.local.get with Promise interface
 */
export const getStorageData = <T>(key: string): Promise<T | null> => {
  return new Promise((resolve) => {
    try {
      if (!chrome?.storage?.local) {
        resolve(null);
        return;
      }

      chrome.storage.local.get(key, (result) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          console.debug('Storage get failed:', runtimeError.message);
          resolve(null);
          return;
        }
        resolve((result?.[key] as T) ?? null);
      });
    } catch (error) {
      console.debug('Storage get error:', error);
      resolve(null);
    }
  });
};

/**
 * Safe wrapper for chrome.storage.local.set with Promise interface
 */
export const setStorageData = <T>(key: string, value: T): Promise<boolean> => {
  return new Promise((resolve) => {
    try {
      if (!chrome?.storage?.local) {
        resolve(false);
        return;
      }

      chrome.storage.local.set({ [key]: value }, () => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          console.debug('Storage set failed:', runtimeError.message);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (error) {
      console.debug('Storage set error:', error);
      resolve(false);
    }
  });
};

/**
 * Safe wrapper for chrome.tabs.query with Promise interface
 */
export const queryTabs = (
  queryInfo: chrome.tabs.QueryInfo
): Promise<chrome.tabs.Tab[]> => {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query(queryInfo, (tabs) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve(tabs);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
};

/**
 * Safe wrapper for chrome.tabs.create with Promise interface
 */
export const createTab = (
  createProperties: chrome.tabs.CreateProperties
): Promise<chrome.tabs.Tab | undefined> => {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.create(createProperties, (tab) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve(tab);
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
};

/**
 * Safe wrapper for clipboard write with proper error handling
 */
export const writeToClipboard = async (text: string): Promise<boolean> => {
  if (!navigator.clipboard) {
    console.error('Clipboard API is unavailable in this context.');
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Clipboard write failed:', err);
    return false;
  }
};
