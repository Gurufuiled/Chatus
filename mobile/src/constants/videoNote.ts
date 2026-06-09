import { Dimensions } from 'react-native';

/** Visible / recorded square side for in-app video notes (matches `VideoNoteRecorder`). */
export const VIDEO_NOTE_CAMERA_SIDE_PX = Math.min(Dimensions.get('window').width - 44, 320);
