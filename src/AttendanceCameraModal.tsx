import {useCallback, useEffect, useRef} from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import {launchCamera} from 'react-native-image-picker';

import {CapturedPhoto} from './types';

type AttendanceCameraModalProps = {
  visible: boolean;
  onClose: () => void;
  onCaptureFailed: (message: string) => void;
  onPhotoCaptured: (photo: CapturedPhoto) => Promise<void>;
};

export default function AttendanceCameraModal({
  visible,
  onClose,
  onCaptureFailed,
  onPhotoCaptured,
}: AttendanceCameraModalProps) {
  const launchPendingRef = useRef(false);

  const requestCameraPermission = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const permission = PermissionsAndroid.PERMISSIONS.CAMERA;
    const alreadyGranted = await PermissionsAndroid.check(permission);
    if (alreadyGranted) {
      return true;
    }

    const result = await PermissionsAndroid.request(permission, {
      title: 'Izin Kamera',
      message: 'Aplikasi memerlukan akses kamera untuk mengambil foto absensi.',
      buttonNeutral: 'Nanti',
      buttonNegative: 'Batal',
      buttonPositive: 'Izinkan',
    });

    return result === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const finishWithFailure = useCallback(
    (message: string) => {
      launchPendingRef.current = false;
      onClose();
      onCaptureFailed(message);
    },
    [onCaptureFailed, onClose],
  );

  const handleLaunchCamera = useCallback(async () => {
    if (launchPendingRef.current) {
      return;
    }

    launchPendingRef.current = true;

    try {
      const permissionGranted = await requestCameraPermission();
      if (!permissionGranted) {
        finishWithFailure('Izin kamera belum diberikan untuk foto absensi.');
        return;
      }

      const result = await launchCamera({
        mediaType: 'photo',
        includeBase64: true,
        cameraType: 'front',
        saveToPhotos: false,
        quality: 0.8,
        presentationStyle: 'fullScreen',
        includeExtra: true,
      });

      if (result.didCancel) {
        finishWithFailure('Pengambilan foto absensi dibatalkan.');
        return;
      }

      if (result.errorCode) {
        finishWithFailure(
          result.errorMessage || 'Kamera tidak bisa digunakan di perangkat ini.',
        );
        return;
      }

      const photo = result.assets?.[0];
      if (!photo?.uri && !photo?.originalPath) {
        finishWithFailure('Foto absensi tidak berhasil diproses.');
        return;
      }

      launchPendingRef.current = false;
      onClose();
      await onPhotoCaptured(photo);
    } catch (error) {
      console.log('ImagePicker fallback error:', error);
      finishWithFailure('Kamera tidak bisa digunakan di perangkat ini.');
    }
  }, [finishWithFailure, onClose, onPhotoCaptured, requestCameraPermission]);

  useEffect(() => {
    if (!visible) {
      launchPendingRef.current = false;
      return;
    }

    handleLaunchCamera();
  }, [handleLaunchCamera, visible]);

  return null;
}
