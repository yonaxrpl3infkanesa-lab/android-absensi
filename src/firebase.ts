import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import RNFS from 'react-native-fs';

import { AttendanceRecord, CapturedPhoto, UserProfile } from './types';

const USERS_COLLECTION = 'users';
const LOGIN_INDEX_COLLECTION = 'login_index';
const APP_SETTINGS_COLLECTION = 'app_settings';
const ATTENDANCE_COLLECTION = 'attendance';
const ATTENDANCE_SETTINGS_DOC = 'attendance';

type StudentDoc = Partial<UserProfile> & {
  kataSandi?: string;
  pass?: string;
  nama?: string;
  kelas?: string;
  sekolah?: string;
  jurusan?: string;
  tanggalLahir?: string;
  telepon?: string;
};

const getUsersCollection = () => firestore().collection(USERS_COLLECTION);
const getLoginIndexCollection = () => firestore().collection(LOGIN_INDEX_COLLECTION);
const getAppSettingsCollection = () => firestore().collection(APP_SETTINGS_COLLECTION);
const getAttendanceCollection = () => firestore().collection(ATTENDANCE_COLLECTION);

export const DAY_ORDER = [
  'senin',
  'selasa',
  'rabu',
  'kamis',
  'jumat',
  'sabtu',
  'minggu',
] as const;

export type DayKey = (typeof DAY_ORDER)[number];

export type DailySchedule = {
  isActive: boolean;
  checkIn: string | null;
  checkOut: string | null;
};

export type AttendanceSettings = {
  name: string;
  radiusMeters: number;
  location: {
    latitude: number;
    longitude: number;
    name: string;
  };
  weeklySchedule: Record<DayKey, DailySchedule>;
};

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  name: 'Default Schedule',
  radiusMeters: 200,
  location: {
    latitude: -7.970912713681007,
    longitude: 112.66839168592233,
    name: 'Perumda Air Minum Tirta Tugu Malang',
  },
  weeklySchedule: {
    senin: { isActive: true, checkIn: '08:00', checkOut: '16:00' },
    selasa: { isActive: true, checkIn: '08:00', checkOut: '16:00' },
    rabu: { isActive: true, checkIn: '08:00', checkOut: '16:00' },
    kamis: { isActive: true, checkIn: '08:00', checkOut: '16:00' },
    jumat: { isActive: true, checkIn: '08:00', checkOut: '15:00' },
    sabtu: { isActive: false, checkIn: null, checkOut: null },
    minggu: { isActive: false, checkIn: null, checkOut: null },
  },
};

export const normalizeAttendanceSettings = (
  rawSettings: Partial<AttendanceSettings> | null | undefined,
): AttendanceSettings => {
  const location: Partial<AttendanceSettings['location']> = rawSettings?.location ?? {};
  const weeklySchedule = DAY_ORDER.reduce((result, dayKey) => {
    const defaultDay = DEFAULT_ATTENDANCE_SETTINGS.weeklySchedule[dayKey];
    const rawDay = rawSettings?.weeklySchedule?.[dayKey];

    result[dayKey] = {
      isActive:
        typeof rawDay?.isActive === 'boolean' ? rawDay.isActive : defaultDay.isActive,
      checkIn:
        typeof rawDay?.checkIn === 'string' || rawDay?.checkIn === null
          ? rawDay.checkIn
          : defaultDay.checkIn,
      checkOut:
        typeof rawDay?.checkOut === 'string' || rawDay?.checkOut === null
          ? rawDay.checkOut
          : defaultDay.checkOut,
    };

    if (!result[dayKey].isActive) {
      result[dayKey].checkIn = null;
      result[dayKey].checkOut = null;
    }

    return result;
  }, {} as AttendanceSettings['weeklySchedule']);

  return {
    name:
      typeof rawSettings?.name === 'string' && rawSettings.name.trim()
        ? rawSettings.name.trim()
        : DEFAULT_ATTENDANCE_SETTINGS.name,
    radiusMeters:
      Number.isFinite(Number(rawSettings?.radiusMeters)) && Number(rawSettings?.radiusMeters) > 0
        ? Number(rawSettings?.radiusMeters)
        : DEFAULT_ATTENDANCE_SETTINGS.radiusMeters,
    location: {
      latitude:
        Number.isFinite(Number(location.latitude))
          ? Number(location.latitude)
          : DEFAULT_ATTENDANCE_SETTINGS.location.latitude,
      longitude:
        Number.isFinite(Number(location.longitude))
          ? Number(location.longitude)
          : DEFAULT_ATTENDANCE_SETTINGS.location.longitude,
      name:
        typeof location.name === 'string' && location.name.trim()
          ? location.name.trim()
          : DEFAULT_ATTENDANCE_SETTINGS.location.name,
    },
    weeklySchedule,
  };
};

const toIsoString = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const maybeTimestamp = value as { toDate: () => Date };
    return maybeTimestamp.toDate().toISOString();
  }

  return null;
};

const mapStudent = (
  docId: string,
  nisn: string,
  data: StudentDoc | undefined,
): UserProfile | null => {
  if (!data) {
    return null;
  }

  const password =
    typeof data.password === 'string'
      ? data.password
      : typeof data.kataSandi === 'string'
        ? data.kataSandi
        : typeof data.pass === 'string'
          ? data.pass
          : '';

  return {
    studentDocId: docId,
    nisn,
    name:
      typeof data.name === 'string'
        ? data.name
        : typeof data.nama === 'string'
          ? data.nama
          : 'Siswa',
    password,
    className:
      typeof data.className === 'string'
        ? data.className
        : typeof data.kelas === 'string'
          ? data.kelas
          : undefined,
    schoolName:
      typeof data.schoolName === 'string'
        ? data.schoolName
        : typeof data.sekolah === 'string'
          ? data.sekolah
          : undefined,
    major:
      typeof data.major === 'string'
        ? data.major
        : typeof data.jurusan === 'string'
          ? data.jurusan
          : undefined,
    birthDate:
      typeof data.birthDate === 'string'
        ? data.birthDate
        : typeof data.tanggalLahir === 'string'
          ? data.tanggalLahir
          : undefined,
    email: typeof data.email === 'string' ? data.email : undefined,
    phone:
      typeof data.phone === 'string'
        ? data.phone
        : typeof data.telepon === 'string'
          ? data.telepon
          : undefined,
    address: typeof data.address === 'string' ? data.address : undefined,
    avatar: typeof data.avatar === 'string' ? data.avatar : undefined,
  };
};

const mapUserSnapshot = (
  snapshot: FirebaseFirestoreTypes.DocumentSnapshot<FirebaseFirestoreTypes.DocumentData>,
): UserProfile | null => {
  const data = snapshot.data() as StudentDoc | undefined;

  if (!data) {
    return null;
  }

  const nisn =
    typeof data.nisn === 'string' && data.nisn.trim()
      ? data.nisn.trim()
      : snapshot.id;

  return mapStudent(snapshot.id, nisn, data);
};

const formatTimeShort = (date: Date) =>
  new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(date)
    .replaceAll(':', '.');

const formatDateShort = (date: Date) =>
  new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);

const buildDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getDateMetadata = (dateKey: string) => {
  if (!dateKey || !dateKey.includes('-')) {
    return {
      monthKey: null,
      year: null,
      month: null,
      day: null,
      dateValue: null,
    };
  }

  const [year, month, day] = dateKey.split('-').map(Number);

  return {
    monthKey: `${year}-${`${month}`.padStart(2, '0')}`,
    year,
    month,
    day,
    dateValue: new Date(dateKey).getTime(),
  };
};

const getUserProfileByUid = async (uid: string): Promise<UserProfile | null> => {
  const snapshot = await getUsersCollection().doc(uid).get();

  if (!snapshot.exists) {
    return null;
  }

  return mapUserSnapshot(snapshot);
};

const getUserProfileByNisn = async (nisn: string): Promise<UserProfile | null> => {
  const querySnapshot = await getUsersCollection()
    .where('nisn', '==', nisn)
    .limit(1)
    .get();

  if (querySnapshot.empty) {
    return null;
  }

  return mapUserSnapshot(querySnapshot.docs[0]);
};

const getLoginEmailByNisn = async (nisn: string): Promise<string | null> => {
  const snapshot = await getLoginIndexCollection().doc(nisn).get();
  const data = snapshot.data() as { email?: unknown } | undefined;

  if (typeof data?.email !== 'string' || !data.email.trim()) {
    return null;
  }

  return data.email.trim().toLowerCase();
};

export const getStudentProfile = async (
  rawNisn: string,
): Promise<UserProfile | null> => {
  const nisn = rawNisn.trim();

  if (!nisn) {
    return null;
  }

  const authenticatedUser = auth().currentUser;

  if (authenticatedUser) {
    const profileFromUid = await getUserProfileByUid(authenticatedUser.uid);

    if (profileFromUid?.nisn === nisn) {
      return profileFromUid;
    }
  }

  return getUserProfileByNisn(nisn);
};

export const validateStudentLogin = async (
  nisn: string,
  password: string,
): Promise<UserProfile> => {
  const email = await getLoginEmailByNisn(nisn);

  if (!email) {
    throw new Error('NISN tidak ditemukan pada login index Firebase.');
  }

  try {
    const credential = await auth().signInWithEmailAndPassword(email, password);
    const profile = await getUserProfileByUid(credential.user.uid);

    if (!profile) {
      throw new Error('Data profil pengguna tidak ditemukan di collection users.');
    }

    return profile;
  } catch (error) {
    const code = (error as { code?: string })?.code;

    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      throw new Error('Password yang dimasukkan tidak sesuai.');
    }

    if (code === 'auth/user-not-found') {
      throw new Error('Akun Authentication tidak ditemukan untuk NISN ini.');
    }

    if (code === 'auth/too-many-requests') {
      throw new Error('Terlalu banyak percobaan login. Coba lagi beberapa saat.');
    }

    throw error;
  }
};

export const subscribeStudentProfile = (
  nisn: string,
  onData: (profile: UserProfile | null) => void,
  onError: (error: Error) => void,
) =>
  getUsersCollection()
    .where('nisn', '==', nisn)
    .limit(1)
    .onSnapshot(
      snapshot => {
        if (snapshot.empty) {
          onData(null);
          return;
        }

        onData(mapUserSnapshot(snapshot.docs[0]));
      },
      error => onError(error),
    );

export const subscribeAttendanceHistory = (
  nisn: string,
  onData: (records: AttendanceRecord[]) => void,
  onError: (error: Error) => void,
) => {
  const unsubscribeAttendance = getAttendanceCollection()
    .where('userNisn', '==', nisn)
    .onSnapshot(
      snapshot => {
        const records: AttendanceRecord[] = snapshot.docs
          .map(doc => {
            const data = doc.data();
            const photoUri =
              typeof data.photoUri === 'string'
                ? data.photoUri
                : typeof data.photoUrl === 'string'
                  ? data.photoUrl
                  : '';
            const hasCheckOut =
              typeof data.checkOutTime === 'string' && data.checkOutTime.trim().length > 0;
            const hasCheckIn =
              typeof data.checkInTime === 'string' && data.checkInTime.trim().length > 0;

            return {
              id: doc.id,
              createdAt: toIsoString(data.updatedAt) ?? toIsoString(data.createdAt),
              deviceTimestamp:
                typeof data.deviceTimestamp === 'string'
                  ? data.deviceTimestamp
                  : '',
              photoUrl: photoUri,
              photoPath:
                typeof data.photoPath === 'string' ? data.photoPath : '',
              status:
                data.status === 'terlambat' ||
                data.status === 'tidak_hadir' ||
                data.status === 'tidak_valid'
                  ? data.status
                  : 'hadir',
              note:
                typeof data.note === 'string'
                  ? data.note
                  : hasCheckOut && !hasCheckIn
                    ? 'Absen Pulang'
                    : 'Absen Datang',
              eventType:
                data.eventType === 'checkout'
                  ? 'checkout'
                  : hasCheckIn
                    ? 'checkin'
                    : undefined,
              date: typeof data.date === 'string' ? data.date : undefined,
              dateLabel:
                typeof data.dateLabel === 'string' ? data.dateLabel : undefined,
              dateValue:
                typeof data.dateValue === 'number' ? data.dateValue : null,
              school: typeof data.school === 'string' ? data.school : null,
              checkInTime:
                typeof data.checkInTime === 'string' ? data.checkInTime : null,
              checkOutTime:
                typeof data.checkOutTime === 'string' ? data.checkOutTime : null,
              photoUri: photoUri || null,
              userNisn:
                typeof data.userNisn === 'string' ? data.userNisn : null,
              userName:
                typeof data.userName === 'string' ? data.userName : null,
              kelas: typeof data.kelas === 'string' ? data.kelas : null,
              jurusan:
                typeof data.jurusan === 'string' ? data.jurusan : null,
            };
          })
          .sort((left, right) => {
            const leftValue =
              left.dateValue ??
              new Date(left.createdAt || left.deviceTimestamp || 0).getTime();
            const rightValue =
              right.dateValue ??
              new Date(right.createdAt || right.deviceTimestamp || 0).getTime();
            return rightValue - leftValue;
          });

        onData(records);
      },
      error => onError(error),
    );

  return () => {
    unsubscribeAttendance();
  };
};

const normalizeUploadPath = (inputPath: string): string => {
  if (inputPath.startsWith('content://')) {
    return inputPath;
  }

  if (inputPath.startsWith('file://')) {
    return decodeURIComponent(inputPath.replace('file://', ''));
  }

  return decodeURIComponent(inputPath);
};

const getUploadSourcePath = (photo: CapturedPhoto): string => {
  const preferredUri = photo.uri?.trim();

  if (preferredUri) {
    return normalizeUploadPath(preferredUri);
  }

  const preferredPath = photo.originalPath?.trim();

  if (preferredPath) {
    return normalizeUploadPath(preferredPath);
  }

  throw new Error('File foto tidak ditemukan untuk di-upload.');
};

const getFileExtension = (photo: CapturedPhoto): string => {
  const rawName = photo.fileName ?? photo.originalPath ?? photo.uri ?? '';
  const extension = rawName.split('.').pop()?.split('?')[0]?.trim().toLowerCase();

  if (extension) {
    return extension;
  }

  if (photo.type === 'image/png') {
    return 'png';
  }

  if (photo.type === 'image/webp') {
    return 'webp';
  }

  return 'jpg';
};

const readImageAsDataUrl = async (
  filePath: string,
  mimeType: string,
): Promise<string> => {
  const normalizedPath = filePath.replace(/^file:\/\//, '');
  const base64 = await RNFS.readFile(normalizedPath, 'base64');

  if (!base64) {
    throw new Error('Foto absensi tidak berhasil dibaca dari perangkat.');
  }

  return `data:${mimeType};base64,${base64}`;
};

const compressPhotoForFirestore = async (
  sourceUri: string,
): Promise<{mimeType: string; path: string}> => {
  const attempts = [
    {width: 420, height: 420, quality: 28},
    {width: 360, height: 360, quality: 22},
    {width: 300, height: 300, quality: 18},
  ] as const;

  let fallbackPath = sourceUri;

  for (const attempt of attempts) {
    const resized = await ImageResizer.createResizedImage(
      sourceUri,
      attempt.width,
      attempt.height,
      'JPEG',
      attempt.quality,
      0,
      null,
      false,
      {
        mode: 'contain',
        onlyScaleDown: true,
      },
    );

    fallbackPath = resized.uri || resized.path || fallbackPath;

    if (typeof resized.size === 'number' && resized.size <= 450_000) {
      return {
        mimeType: 'image/jpeg',
        path: fallbackPath,
      };
    }
  }

  return {
    mimeType: 'image/jpeg',
    path: fallbackPath,
  };
};

const buildPhotoDataUrl = async (photo: CapturedPhoto): Promise<string> => {
  const uploadSourcePath = getUploadSourcePath(photo);
  const compressedPhoto = await compressPhotoForFirestore(uploadSourcePath);
  const dataUrl = await readImageAsDataUrl(
    compressedPhoto.path,
    compressedPhoto.mimeType,
  );

  if (dataUrl.length > 900_000) {
    throw new Error(
      'Foto terlalu besar untuk disimpan. Coba ulangi dengan pencahayaan lebih sederhana atau jarak kamera lebih dekat.',
    );
  }

  return dataUrl;
};

export const submitAttendance = async (
  profile: UserProfile,
  photo: CapturedPhoto,
  options?: {
    eventType?: 'checkin' | 'checkout';
    note?: string;
    status?: AttendanceRecord['status'];
  },
): Promise<void> => {
  const now = new Date();
  const dateKey = buildDateKey(now);
  const attendanceRef = getAttendanceCollection().doc(`${profile.nisn}_${dateKey}`);
  const extension = getFileExtension(photo);
  const eventType = options?.eventType ?? 'checkin';
  const note =
    options?.note ?? (eventType === 'checkout' ? 'Absen Pulang' : 'Absen Datang');
  const status = options?.status ?? 'hadir';
  const timeLabel = formatTimeShort(now);
  const dateLabel = formatDateShort(now);
  const dateMetadata = getDateMetadata(dateKey);
  const photoUrl = await buildPhotoDataUrl(photo);

  const existingSnapshot = await attendanceRef.get();
  const existingData = existingSnapshot.data() as
    | {
        checkInTime?: unknown;
        checkOutTime?: unknown;
        photoUri?: unknown;
        createdAt?: unknown;
      }
    | undefined;

  await attendanceRef.set(
    {
      id: attendanceRef.id,
      date: dateKey,
      dateLabel,
      dateValue: dateMetadata.dateValue,
      monthKey: dateMetadata.monthKey,
      year: dateMetadata.year,
      month: dateMetadata.month,
      day: dateMetadata.day,
      school: profile.schoolName ?? null,
      userNisn: profile.nisn,
      userName: profile.name,
      kelas: profile.className ?? null,
      jurusan: profile.major ?? null,
      status,
      note,
      eventType,
      checkInTime:
        eventType === 'checkin'
          ? timeLabel
          : typeof existingData?.checkInTime === 'string'
            ? existingData.checkInTime
            : null,
      checkOutTime:
        eventType === 'checkout'
          ? timeLabel
          : typeof existingData?.checkOutTime === 'string'
            ? existingData.checkOutTime
            : null,
      photoUri: photoUrl,
      photoUrl,
      photoPath: null,
      photoFileName: photo.fileName ?? `${attendanceRef.id}.${extension}`,
      photoMimeType: photo.type ?? 'image/jpeg',
      photoWidth: photo.width ?? null,
      photoHeight: photo.height ?? null,
      photoSize: photo.fileSize ?? null,
      deviceTimestamp: now.toISOString(),
      source: 'android',
      createdAt:
        existingData?.createdAt ?? firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await getUsersCollection().doc(profile.studentDocId).set(
    {
      nisn: profile.nisn,
      name: profile.name,
      className: profile.className ?? null,
      schoolName: profile.schoolName ?? null,
      major: profile.major ?? null,
      birthDate: profile.birthDate ?? null,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      address: profile.address ?? null,
      avatar: profile.avatar ?? null,
      studentDocId: profile.studentDocId,
      lastAttendanceId: attendanceRef.id,
      lastAttendanceAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
};

export const signOutCurrentUser = () => auth().signOut();

export const getAttendanceSettings = async (): Promise<AttendanceSettings> => {
  const snapshot = await getAppSettingsCollection().doc(ATTENDANCE_SETTINGS_DOC).get();
  return normalizeAttendanceSettings(
    (snapshot.data() as Partial<AttendanceSettings> | undefined) ??
      DEFAULT_ATTENDANCE_SETTINGS,
  );
};

export const subscribeAttendanceSettings = (
  onData: (settings: AttendanceSettings) => void,
  onError: (error: Error) => void,
) =>
  getAppSettingsCollection()
    .doc(ATTENDANCE_SETTINGS_DOC)
    .onSnapshot(
      snapshot => {
        onData(
          normalizeAttendanceSettings(
            (snapshot.data() as Partial<AttendanceSettings> | undefined) ??
              DEFAULT_ATTENDANCE_SETTINGS,
          ),
        );
      },
      error => onError(error),
    );
