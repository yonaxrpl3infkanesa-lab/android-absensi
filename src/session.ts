import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = '@test-absensi/session-nisn';

export const loadSessionNisn = () => AsyncStorage.getItem(SESSION_KEY);

export const saveSessionNisn = (nisn: string) =>
  AsyncStorage.setItem(SESSION_KEY, nisn);

export const clearSessionNisn = () => AsyncStorage.removeItem(SESSION_KEY);
