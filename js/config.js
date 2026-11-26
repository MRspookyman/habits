// Valores públicos que se rellenan al desplegar. Ninguno es secreto.
export const CONFIG = {
  // URL del Cloudflare Worker (sin barra final).
  workerUrl: "https://habits.javiermartinezmegiass.workers.dev",
  // Clave pública VAPID (base64url) para las notificaciones push.
  vapidPublicKey: "BKyygyUWJMKVlJGiR2hm-O--kEaE8LiCk0qiBMnIATBXiBBZc6SrLJr8gjmVo5H_RtmMTu5NsO7blNrcGPC8mkE",
  googleClientId: "766875163134-s2te2o6r2hic7ndlpnpm9dv8ur93cnsh.apps.googleusercontent.com",
};

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];
