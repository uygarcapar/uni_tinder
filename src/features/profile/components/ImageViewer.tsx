import { Modal, View, Image, TouchableOpacity, Dimensions, StatusBar } from 'react-native';
import { X } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

/**
 * Tek mesaj fotoğrafı için tam-ekran viewer.
 * Sade implementation — pinch-zoom için react-native-image-zoom-viewer eklenebilir.
 */
export default function ImageViewer({ visible, uri, onClose }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar hidden />
      <View
        style={{
          flex: 1,
          backgroundColor: '#000',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TouchableOpacity
          onPress={onClose}
          hitSlop={10}
          style={{
            position: 'absolute',
            top: 60,
            right: 24,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.6)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={24} color="#fff" />
        </TouchableOpacity>

        {!!uri && (
          <Image
            source={{ uri }}
            style={{ width, height: height * 0.85 }}
            resizeMode="contain"
          />
        )}
      </View>
    </Modal>
  );
}
