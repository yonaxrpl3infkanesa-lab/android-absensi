import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import MapView, {Circle, Marker} from 'react-native-maps';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import {
  Calendar,
  ChevronLeft,
  Clock,
  LocateFixed,
  MapPin,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {AttendanceSettings, submitAttendance} from './firebase';
import CustomModal from './CustomModal';
import {CapturedPhoto, UserProfile} from './types';

const Colors = {
  primary: '#1B3A7B',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  green: '#22C55E',
  red: '#EF4444',
  redLight: '#FEE2E2',
  border: '#E5E7EB',
  white: '#FFFFFF',
};

export type AttendanceActionScreenProps = {
  currentUser: UserProfile;
  isAdmin?: boolean;
  mode: 'checkin' | 'checkout';
  settings: AttendanceSettings;
  onBack: () => void;
  onSaved: () => void;
};

type UserLocation = {
  latitude: number;
  longitude: number;
};

type LocationResult = {
  coords: UserLocation;
};

type LocationPermissionResult = {
  blocked: boolean;
  granted: boolean;
};

const MAP_EDGE_PADDING = {
  top: 72,
  right: 32,
  bottom: 300,
  left: 32,
};
const RECENTER_RADIUS_METERS = 300;

const getDayKey = (date: Date) => {
  const dayIndex = date.getDay();

  switch (dayIndex) {
    case 1:
      return 'senin';
    case 2:
      return 'selasa';
    case 3:
      return 'rabu';
    case 4:
      return 'kamis';
    case 5:
      return 'jumat';
    case 6:
      return 'sabtu';
    default:
      return 'minggu';
  }
};

const timeStringToMinutes = (value: string | null | undefined): number => {
  if (!value || !value.includes(':')) {
    return 0;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const formatScheduleTime = (value: string | null | undefined): string =>
  value ? value.replace(':', '.') : '-';

const formatDateShort = (date: Date) => {
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

const getAttendanceWindow = (settings: AttendanceSettings, now: Date = new Date()) => {
  const dayKey = getDayKey(now);
  const schedule = settings.weeklySchedule[dayKey];

  if (!schedule?.isActive || !schedule.checkIn || !schedule.checkOut) {
    return {
      dayKey,
      schedule,
      isOffDay: true,
      withinHours: false,
      isLate: false,
    };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = timeStringToMinutes(schedule.checkIn);
  const endMinutes = timeStringToMinutes(schedule.checkOut);

  if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
    return {
      dayKey,
      schedule,
      isOffDay: false,
      withinHours: false,
      isLate: false,
    };
  }

  return {
    dayKey,
    schedule,
    isOffDay: false,
    withinHours: true,
    isLate: currentMinutes > startMinutes,
  };
};

const isWithinAllowedRadius = (
  latitude: number,
  longitude: number,
  settings: AttendanceSettings,
) => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRadians(settings.location.latitude - latitude);
  const dLon = toRadians(settings.location.longitude - longitude);
  const lat1 = toRadians(latitude);
  const lat2 = toRadians(settings.location.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance <= settings.radiusMeters;
};

export default function AttendanceActionScreen({
  currentUser,
  isAdmin = false,
  mode,
  settings,
  onBack,
  onSaved,
}: AttendanceActionScreenProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {hasPermission: hasCameraPermission, canRequestPermission, requestPermission} =
    useCameraPermission();
  const cameraDevice = useCameraDevice('front');
  const photoOutput = usePhotoOutput({
    quality: 0.85,
    qualityPrioritization: 'speed',
  });
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [locationPermissionBlocked, setLocationPermissionBlocked] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'success' | 'error' | 'warning'>('success');
  const [modalTitle, setModalTitle] = useState('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [flashVisible, setFlashVisible] = useState(false);
  const today = new Date();
  const attendanceWindow = getAttendanceWindow(settings, today);
  const radiusLatitudeDelta = (settings.radiusMeters / 111000) * 3.2;
  const radiusLongitudeDelta =
    radiusLatitudeDelta / Math.max(Math.cos((settings.location.latitude * Math.PI) / 180), 0.2);
  const activeScheduleLabel = attendanceWindow.isOffDay
    ? 'Libur'
    : `${formatScheduleTime(attendanceWindow.schedule?.checkIn)} - ${formatScheduleTime(
        attendanceWindow.schedule?.checkOut,
      )}`;

  const title =
    mode === 'checkout' ? 'Lokasi Absen Pulang' : 'Lokasi Absen Datang';
  const buttonLabel =
    mode === 'checkout' ? 'KIRIM ABSEN PULANG' : 'KIRIM ABSEN DATANG';

  const requestLocationPermission = useCallback(async (): Promise<LocationPermissionResult> => {
    if (Platform.OS === 'android') {
      try {
        const hasPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );

        if (hasPermission) {
          return {blocked: false, granted: true};
        }

        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Izin Lokasi',
            message: 'Aplikasi ini memerlukan akses lokasi untuk absensi.',
            buttonNeutral: 'Tanya Nanti',
            buttonNegative: 'Batal',
            buttonPositive: 'OK',
          },
        );

        return {
          blocked: granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
          granted: granted === PermissionsAndroid.RESULTS.GRANTED,
        };
      } catch {
        return {blocked: false, granted: false};
      }
    }

    return {blocked: false, granted: true};
  }, []);

  const getLocationErrorMessage = (error: {code?: number; message?: string}) => {
    switch (error.code) {
      case 1:
        return 'Izin lokasi ditolak. Silakan aktifkan izin lokasi aplikasi di pengaturan.';
      case 2:
        return 'Lokasi tidak tersedia. Pastikan GPS aktif dan pindah ke area terbuka.';
      case 3:
        return 'Pengambilan lokasi terlalu lama. Tunggu GPS stabil lalu kirim ulang absensi.';
      default:
        return error.message || 'Gagal mendapatkan lokasi saat ini.';
    }
  };

  const openAppSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      Alert.alert(
        'Pengaturan tidak tersedia',
        'Silakan buka pengaturan perangkat secara manual.',
      );
    });
  }, []);

  const applyLocation = useCallback((coords: UserLocation) => {
    setUserLocation(coords);
    setLocationPermissionBlocked(false);
    setLocationError('');
    setLocationLoading(false);
  }, []);

  const focusTargetRegion = useCallback(() => {
    const latitudeDelta = (RECENTER_RADIUS_METERS / 111000) * 2.1;
    const longitudeDelta =
      latitudeDelta /
      Math.max(Math.cos((settings.location.latitude * Math.PI) / 180), 0.2);

    mapRef.current?.animateToRegion(
      {
        latitude: settings.location.latitude,
        longitude: settings.location.longitude,
        latitudeDelta,
        longitudeDelta,
      },
      300,
    );
  }, [settings.location.latitude, settings.location.longitude]);

  const getCurrentPositionAsync = useCallback(
    (options: Parameters<typeof Geolocation.getCurrentPosition>[2]) =>
      new Promise<LocationResult>((resolve, reject) => {
        Geolocation.getCurrentPosition(resolve, reject, options);
      }),
    [],
  );

  const getLocation = useCallback(async () => {
    try {
      setLocationLoading(true);
      setLocationError('');

      const permission = await requestLocationPermission();
      setLocationPermissionBlocked(permission.blocked);

      if (!permission.granted) {
        const message = permission.blocked
          ? 'Izin lokasi diblokir. Buka pengaturan aplikasi untuk mengaktifkannya kembali.'
          : 'Izin lokasi belum diberikan. Izinkan akses lokasi untuk melanjutkan absensi.';
        setUserLocation(null);
        setLocationError(message);
        setLocationLoading(false);
        return;
      }

      const locationStrategies = [
        {enableHighAccuracy: false, timeout: 2000, maximumAge: 60000},
        {enableHighAccuracy: false, timeout: 5000, maximumAge: 15000},
        {enableHighAccuracy: true, timeout: 12000, maximumAge: 0},
      ] as const;

      let lastError: {code?: number; message?: string} | null = null;

      for (const strategy of locationStrategies) {
        try {
          const position = await getCurrentPositionAsync(strategy);
          applyLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          return;
        } catch (error) {
          const typedError = error as {code?: number; message?: string};
          lastError = typedError;

          if (typedError.code === 1) {
            setUserLocation(null);
            setLocationPermissionBlocked(true);
            setLocationError(getLocationErrorMessage(typedError));
            setLocationLoading(false);
            return;
          }
        }
      }

      setUserLocation(null);
      setLocationPermissionBlocked(lastError?.code === 1);
      setLocationError(
        lastError?.code === 3
          ? 'Lokasi GPS masih dicari. Tunggu beberapa detik atau pindah ke area yang lebih terbuka.'
          : getLocationErrorMessage(lastError || {}),
      );
      setLocationLoading(false);
    } catch {
      setUserLocation(null);
      setLocationError('Terjadi kesalahan saat mengambil lokasi.');
      setLocationLoading(false);
    }
  }, [applyLocation, getCurrentPositionAsync, requestLocationPermission]);

  useEffect(() => {
    getLocation();
  }, [getLocation]);

  useEffect(() => {
    if (!hasCameraPermission && canRequestPermission) {
      requestPermission().catch(() => undefined);
    }
  }, [canRequestPermission, hasCameraPermission, requestPermission]);

  useEffect(
    () => () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    },
    [],
  );

  const handleRecenterMap = useCallback(() => {
    // Tombol target selalu mengembalikan fokus ke titik absensi utama.
    focusTargetRegion();
  }, [focusTargetRegion]);

  useEffect(() => {
    if (!locationLoading) {
      if (!userLocation) {
        focusTargetRegion();
        return;
      }

      mapRef.current?.fitToCoordinates(
        [
          userLocation,
          {
            latitude: settings.location.latitude,
            longitude: settings.location.longitude,
          },
          {
            latitude: settings.location.latitude + radiusLatitudeDelta / 4,
            longitude: settings.location.longitude,
          },
          {
            latitude: settings.location.latitude - radiusLatitudeDelta / 4,
            longitude: settings.location.longitude,
          },
        ],
        {
          animated: true,
          edgePadding: MAP_EDGE_PADDING,
        },
      );
    }
  }, [
    focusTargetRegion,
    locationLoading,
    radiusLatitudeDelta,
    settings.location.latitude,
    settings.location.longitude,
    userLocation,
  ]);

  const handlePhotoCaptured = useCallback(async (photoAsset: CapturedPhoto) => {
    setLoading(true);
    const status =
      mode === 'checkin' && attendanceWindow.isLate ? 'terlambat' : 'hadir';

    try {
      await submitAttendance(currentUser, photoAsset, {
        eventType: mode,
        note: mode === 'checkout' ? 'Absen Pulang' : 'Absen Datang',
        status,
      });

      setModalType(status === 'terlambat' ? 'warning' : 'success');
      setModalTitle(
        mode === 'checkout'
          ? 'Sukses kirim data absensi pulang'
          : attendanceWindow.isLate
            ? 'Absensi datang tersimpan sebagai terlambat'
            : 'Sukses kirim data absensi',
      );
      setModalVisible(true);
    } catch (error) {
      setModalType('error');
      setModalTitle(
        error instanceof Error ? error.message : 'Gagal kirim data absensi',
      );
      setModalVisible(true);
    } finally {
      setLoading(false);
    }
  }, [attendanceWindow.isLate, currentUser, mode]);

  const handleModalClose = useCallback(() => {
    const shouldCloseScreen =
      modalType === 'success' || (modalType === 'warning' && /terlambat/i.test(modalTitle));

    setModalVisible(false);
    if (shouldCloseScreen) {
      onSaved();
    }
  }, [modalTitle, modalType, onSaved]);

  const handleSubmit = useCallback(async () => {
    try {
      if (!isAdmin && attendanceWindow.isOffDay) {
        setModalType('warning');
        setModalTitle(
          mode === 'checkout'
            ? 'Hari ini libur, user tidak perlu absen pulang.'
            : 'Hari ini libur, user tidak perlu absen datang.',
        );
        setModalVisible(true);
        return;
      }

      if (!attendanceWindow.withinHours && !isAdmin) {
        setModalType('warning');
        setModalTitle('Mohon Cek Jam Presensi');
        setModalVisible(true);
        return;
      }

      if (!userLocation) {
        setModalType('error');
        setModalTitle(locationError || 'Gagal mendapatkan lokasi');
        setModalVisible(true);
        return;
      }

      const withinRadius = isWithinAllowedRadius(
        userLocation.latitude,
        userLocation.longitude,
        settings,
      );

      if (!withinRadius) {
        setModalType('error');
        setModalTitle('Gagal Kirim Data Absensi');
        setModalVisible(true);
        return;
      }

      if (!hasCameraPermission) {
        const granted = canRequestPermission ? await requestPermission() : false;

        if (!granted) {
          setModalType('error');
          setModalTitle(
            canRequestPermission
              ? 'Izin kamera belum diberikan untuk foto absensi.'
              : 'Izin kamera diblokir. Buka pengaturan aplikasi untuk mengaktifkannya kembali.',
          );
          setModalVisible(true);
          return;
        }
      }

      if (!cameraDevice) {
        setModalType('error');
        setModalTitle('Kamera depan tidak tersedia di perangkat ini.');
        setModalVisible(true);
        return;
      }

      if (!isCameraReady) {
        setModalType('warning');
        setModalTitle('Kamera masih menyiapkan sesi. Coba tekan sekali lagi.');
        setModalVisible(true);
        return;
      }

      setLoading(true);

      const photoFile = await photoOutput.capturePhotoToFile(
        {
          flashMode: 'off',
          enableShutterSound: false,
        },
        {
          onWillCapturePhoto: () => {
            setFlashVisible(true);
            if (flashTimeoutRef.current) {
              clearTimeout(flashTimeoutRef.current);
            }
            flashTimeoutRef.current = setTimeout(() => {
              setFlashVisible(false);
            }, 140);
          },
          onDidCapturePhoto: () => {
            if (flashTimeoutRef.current) {
              clearTimeout(flashTimeoutRef.current);
            }
            flashTimeoutRef.current = setTimeout(() => {
              setFlashVisible(false);
            }, 140);
          },
        },
      );

      const fileName = photoFile.filePath.split(/[\\/]/).pop() || 'attendance.jpg';
      await handlePhotoCaptured({
        uri: `file://${photoFile.filePath}`,
        originalPath: photoFile.filePath,
        fileName,
        type: 'image/jpeg',
      });
    } catch (error) {
      setFlashVisible(false);
      setLoading(false);
      setModalType('error');
      setModalTitle(
        error instanceof Error ? error.message : 'Gagal kirim data absensi',
      );
      setModalVisible(true);
    }
  }, [
    attendanceWindow.isOffDay,
    attendanceWindow.withinHours,
    cameraDevice,
    canRequestPermission,
    hasCameraPermission,
    handlePhotoCaptured,
    isCameraReady,
    isAdmin,
    locationError,
    mode,
    photoOutput,
    requestPermission,
    settings,
    userLocation,
  ]);

  const infoValue = useMemo(
    () =>
      isAdmin && attendanceWindow.isOffDay ? 'Admin Override' : activeScheduleLabel,
    [activeScheduleLabel, attendanceWindow.isOffDay, isAdmin],
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {cameraDevice && hasCameraPermission ? (
        <Camera
          style={styles.hiddenCamera}
          device={cameraDevice}
          isActive
          outputs={[photoOutput]}
          onStarted={() => setIsCameraReady(true)}
          onStopped={() => setIsCameraReady(false)}
          onError={error => {
            setIsCameraReady(false);
            setLocationError(previous =>
              previous || error.message || 'Kamera tidak bisa dijalankan.',
            );
          }}
          pointerEvents="none"
        />
      ) : null}
      {flashVisible ? <View pointerEvents="none" style={styles.flashOverlay} /> : null}

      <View style={styles.mapWrapper}>
        {locationLoading ? (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.mapLoadingText}>Memuat lokasi...</Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: settings.location.latitude,
              longitude: settings.location.longitude,
              latitudeDelta: radiusLatitudeDelta,
              longitudeDelta: radiusLongitudeDelta,
            }}
            scrollEnabled
            zoomEnabled
            pitchEnabled={false}
            rotateEnabled={false}
            mapType="standard"
            showsUserLocation={false}
            showsMyLocationButton={false}>
            <Marker
              coordinate={{
                latitude: settings.location.latitude,
                longitude: settings.location.longitude,
              }}
              title={settings.location.name}
              pinColor="#EF4444"
            />
            {userLocation ? (
              <Marker coordinate={userLocation} title="Lokasi Anda">
                <View style={styles.userMarkerOuter}>
                  <View style={styles.userMarkerInner} />
                </View>
              </Marker>
            ) : null}
            <Circle
              center={{
                latitude: settings.location.latitude,
                longitude: settings.location.longitude,
              }}
              radius={settings.radiusMeters}
              fillColor="rgba(59, 130, 246, 0.08)"
              strokeColor="rgba(59, 130, 246, 0.3)"
              strokeWidth={1}
            />
          </MapView>
        )}

        <TouchableOpacity
          style={[styles.backOverlay, {top: insets.top + 10}]}
          onPress={onBack}
          activeOpacity={0.7}
          testID="back-button">
          <ChevronLeft size={20} color="#333" />
          <Text style={styles.backText}>Kembali</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.myLocationButton, {top: insets.top + 10}]}
          onPress={handleRecenterMap}
          activeOpacity={0.8}
          disabled={!userLocation}>
          <LocateFixed
            size={20}
            color={userLocation ? Colors.primary : Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />

        <View style={styles.locationRow}>
          <View style={styles.locationIconContainer}>
            <MapPin size={18} color={Colors.red} />
          </View>
          <View style={styles.locationTextContainer}>
            <Text style={styles.locationLabel}>{title}</Text>
            <Text style={styles.locationName}>{settings.location.name}</Text>
            <Text style={styles.locationCoords}>
              {settings.location.latitude.toFixed(6)},{' '}
              {settings.location.longitude.toFixed(6)}
            </Text>
            <View style={styles.radiusBadge}>
              <Text style={styles.radiusBadgeText}>
                Radius absen {settings.radiusMeters} meter
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <View style={styles.infoIconRow}>
              <Calendar size={14} color={Colors.textSecondary} />
              <Text style={styles.infoLabel}>Tanggal</Text>
            </View>
            <Text style={styles.infoValue}>{formatDateShort(today)}</Text>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoIconRow}>
              <Clock size={14} color={Colors.textSecondary} />
              <Text style={styles.infoLabel}>Jam Kerja</Text>
            </View>
            <Text style={styles.infoValue}>{infoValue}</Text>
          </View>
        </View>

        {locationError ? (
          <View style={styles.locationStatusCard}>
            <Text style={styles.locationStatusTitle}>Lokasi belum siap</Text>
            <Text style={styles.locationStatusText}>{locationError}</Text>

            <View style={styles.locationActionRow}>
              <Pressable
                style={styles.secondaryActionButton}
                onPress={getLocation}
                disabled={locationLoading}>
                <Text style={styles.secondaryActionText}>
                  {locationLoading ? 'Memuat...' : 'Perbarui Lokasi'}
                </Text>
              </Pressable>

              {locationPermissionBlocked ? (
                <Pressable
                  style={styles.secondaryActionButton}
                  onPress={openAppSettings}>
                  <Text style={styles.secondaryActionText}>Buka Pengaturan</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <Pressable
          style={[
            styles.submitButton,
            (loading || locationLoading) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={loading || locationLoading}>
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>{buttonLabel}</Text>
          )}
        </Pressable>
      </View>

      <CustomModal
        visible={modalVisible}
        type={modalType}
        title={modalTitle}
        onClose={handleModalClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  hiddenCamera: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
    left: -100,
    top: -100,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.75)',
    zIndex: 20,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#E8F0FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    flex: 1,
    width: '100%',
  },
  mapLoadingText: {
    marginTop: 8,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  backOverlay: {
    position: 'absolute',
    left: 14,
    top: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 4,
    gap: 2,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  myLocationButton: {
    position: 'absolute',
    right: 14,
    top: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  userMarkerOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(59,130,246,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMarkerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4285F4',
    borderWidth: 2,
    borderColor: '#fff',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -3},
    shadowOpacity: 0.1,
    shadowRadius: 6,
    marginTop: -18,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 14,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  locationIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.redLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  locationTextContainer: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  locationCoords: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  radiusBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  radiusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  infoItem: {
    flex: 1,
  },
  infoIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 19,
  },
  locationStatusCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  locationStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 6,
  },
  locationStatusText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#7F1D1D',
  },
  locationActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryActionButton: {
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
  submitButton: {
    backgroundColor: Colors.green,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
