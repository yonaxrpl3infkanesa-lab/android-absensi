/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(() => ({
    options: {
      projectId: 'demo-project',
    },
  })),
}));

jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    currentUser: null,
    signInWithEmailAndPassword: jest.fn(() =>
      Promise.resolve({
        user: {
          uid: 'demo-uid',
        },
      }),
    ),
    signOut: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
}));

jest.mock('react-native-fs', () => ({
  readFile: jest.fn(() => Promise.resolve('/9j/mock-base64')),
}));

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn((_uri: string) =>
      Promise.resolve({
        path: '/tmp/attendance-compressed.jpg',
        uri: '/tmp/attendance-compressed.jpg',
        size: 120000,
        name: 'attendance-compressed.jpg',
        width: 420,
        height: 420,
      }),
    ),
  },
}));

jest.mock('react-native-vision-camera', () => {
  const ReactMock = require('react');
  const {View} = require('react-native');

  return {
    Camera: (_props: any) => ReactMock.createElement(View, null),
    useCameraDevice: jest.fn(() => ({position: 'front'})),
    useCameraPermission: jest.fn(() => ({
      hasPermission: true,
      canRequestPermission: true,
      requestPermission: jest.fn(() => Promise.resolve(true)),
    })),
    usePhotoOutput: jest.fn(() => ({
      capturePhotoToFile: jest.fn(() =>
        Promise.resolve({
          filePath: '/tmp/attendance-photo.jpg',
        }),
      ),
    })),
  };
});

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
}));

jest.mock('react-native-maps', () => {
  const ReactMock = require('react');
  const {View} = require('react-native');

  const MockMap = ReactMock.forwardRef((_props: any, _ref: any) =>
    ReactMock.createElement(View, null, _props.children),
  );

  return {
    __esModule: true,
    default: MockMap,
    Marker: ({children}: any) => ReactMock.createElement(View, null, children),
    Circle: () => ReactMock.createElement(View, null),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  __esModule: true,
  default: Object.assign(
    jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({exists: false, data: () => undefined})),
          collection: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              onSnapshot: jest.fn(() => jest.fn()),
            })),
          })),
          onSnapshot: jest.fn((_onData: any) => {
            _onData({data: () => undefined});
            return jest.fn();
          }),
          set: jest.fn(() => Promise.resolve()),
        })),
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(() => Promise.resolve({empty: true, docs: []})),
            onSnapshot: jest.fn((onData: any) => {
              onData({empty: true, docs: []});
              return jest.fn();
            }),
          })),
        })),
      })),
      batch: jest.fn(() => ({
        set: jest.fn(),
        commit: jest.fn(() => Promise.resolve()),
      })),
    })),
    {
      FieldValue: {
        serverTimestamp: jest.fn(() => 'serverTimestamp'),
      },
    },
  ),
  FirebaseFirestoreTypes: {},
}));

jest.mock('@react-native-firebase/storage', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    ref: jest.fn(() => ({
      putFile: jest.fn(() => Promise.resolve()),
      getDownloadURL: jest.fn(() =>
        Promise.resolve('https://example.com/photo.jpg'),
      ),
    })),
  })),
}));

import App from '../App';

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterAll(() => {
  jest.restoreAllMocks();
});

test('renders correctly', async () => {
  jest.useFakeTimers();
  let tree: ReactTestRenderer.ReactTestRenderer;

  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });

  expect(tree!.toJSON()).toBeTruthy();

  tree!.unmount();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});
