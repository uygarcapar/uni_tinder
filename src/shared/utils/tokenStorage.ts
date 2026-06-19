import AsyncStorage from '@react-native-async-storage/async-storage';

const REFRESH_TOKEN_KEY = 'ut_refresh_token';
const ACCESS_TOKEN_KEY = 'ut_access_token';

export const saveRefreshToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch (error) {
    console.error('Error saving refresh token:', error);
  }
};

export const getRefreshToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Error getting refresh token:', error);
    return null;
  }
};

export const removeRefreshToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('Error removing refresh token:', error);
  }
};

export const saveAccessToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch (error) {
    console.error('Error saving access token:', error);
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
};

export const removeAccessToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch (error) {
    console.error('Error removing access token:', error);
  }
};

export const clearAllTokens = async (): Promise<void> => {
  try {
    await Promise.all([removeAccessToken(), removeRefreshToken()]);
  } catch (error) {
    console.error('Error clearing tokens:', error);
  }
};
