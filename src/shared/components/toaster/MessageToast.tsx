import { Pressable } from 'react-native';
import InfoToast from './InfoToast';

export type MessageToastProps = {
  senderName: string;
  photoUrl?: string | null;
  preview: string;
  onPress?: () => void;
};

// Tasarım InfoToast ile birebir aynı (blur kart + başlık/gövde tipografisi);
// tek fark basılabilir olması — tap ilgili sohbete götürür.
export default function MessageToast({ senderName, preview, onPress }: MessageToastProps) {
  return (
    <Pressable onPress={onPress}>
      <InfoToast title={senderName} message={preview} />
    </Pressable>
  );
}
