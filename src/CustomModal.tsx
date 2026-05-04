import {Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {CircleAlert, CircleCheck, CircleHelp} from 'lucide-react-native';

const Colors = {
  white: '#FFFFFF',
  text: '#1A1A2E',
  border: '#E5E7EB',
  inputBg: '#F9FAFB',
  shadow: '#000000',
  green: '#22C55E',
  red: '#EF4444',
};

type ModalType = 'success' | 'error' | 'warning' | 'confirm';

type Props = {
  visible: boolean;
  type: ModalType;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
};

const {width} = Dimensions.get('window');

export default function CustomModal({
  visible,
  type,
  title,
  onClose,
  onConfirm,
}: Props) {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CircleCheck size={60} color={Colors.green} />;
      case 'confirm':
        return <CircleHelp size={60} color={Colors.red} />;
      default:
        return <CircleAlert size={60} color={Colors.red} />;
    }
  };

  const getButtonColor = () => {
    switch (type) {
      case 'success':
        return Colors.green;
      case 'confirm':
        return Colors.green;
      default:
        return Colors.red;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {getIcon()}
          <Text style={styles.title}>{title}</Text>
          {type === 'confirm' ? (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={onClose}
                activeOpacity={0.8}>
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, {backgroundColor: getButtonColor()}]}
                onPress={onConfirm ?? onClose}
                activeOpacity={0.8}>
                <Text style={styles.buttonText}>Oke</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.button, {backgroundColor: getButtonColor()}]}
              onPress={onClose}
              activeOpacity={0.8}>
              <Text style={styles.buttonText}>Oke</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: width * 0.75,
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  button: {
    paddingHorizontal: 36,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: Colors.text,
  },
});
