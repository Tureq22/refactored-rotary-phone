import Sound from 'react-native-sound';
import { Vibration } from 'react-native';

Sound.setCategory('Playback');

let alertSound = null;

// Coloque um arquivo alert.mp3 em android/app/src/main/res/raw/ e ios bundle.
export function initAlertSound() {
  alertSound = new Sound('alert.mp3', Sound.MAIN_BUNDLE, (err) => {
    if (err) console.warn('Falha ao carregar som de alerta', err);
  });
}

let lastAlertTs = 0;

// Dispara alerta com cooldown para não repetir toda hora
export function triggerDeviationAlert() {
  const now = Date.now();
  if (now - lastAlertTs < 8000) return; // cooldown 8s
  lastAlertTs = now;

  Vibration.vibrate([0, 400, 200, 400]);
  if (alertSound) {
    alertSound.stop(() => alertSound.play());
  }
}
