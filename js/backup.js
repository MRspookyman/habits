// Copia de seguridad cifrada en el Worker. Se cifra en el móvil con AES-GCM;
// la clave sale de la clave del dispositivo, que también forma el código de recuperación.
import { state, save, exportJSON } from "./store.js";
import { call, isConfigured } from "./push.js";

const enc = new TextEncoder();
const DAILY = 20 * 3600 * 1000;

const toB64 = (bytes) => {
  const a = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

async function aesKey(secret) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`habits-backup:${secret}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export const isAvailable = isConfigured;

export async function upload() {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(state.push.clientKey), enc.encode(exportJSON()));
  await call("PUT", "/backup", { iv: toB64(iv), data: toB64(data) });
  state.backup.lastCloud = Date.now();
  save();
}

// Una vez al día como mucho, al abrir la app.
export async function autoUpload() {
  if (!isAvailable() || !state.backup.cloud || !navigator.onLine) return;
  if (Date.now() - (state.backup.lastCloud || 0) < DAILY) return;
  try {
    await upload();
  } catch (e) {
    console.warn("No se pudo subir la copia", e);
  }
}

export const recoveryCode = () => btoa(JSON.stringify({ i: state.push.clientId, k: state.push.clientKey })).replace(/=+$/, "");

// Descarga y descifra la copia de otro dispositivo a partir de su código. Devuelve el JSON.
export async function download(code) {
  let creds;
  try {
    const c = JSON.parse(atob(code.replace(/\s+/g, "")));
    creds = { clientId: String(c.i), clientKey: String(c.k) };
  } catch {
    throw new Error("El código no es válido.");
  }
  const b = await call("GET", "/backup", null, creds);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(b.iv) }, await aesKey(creds.clientKey), fromB64(b.data));
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("No se pudo descifrar la copia con ese código.");
  }
}
