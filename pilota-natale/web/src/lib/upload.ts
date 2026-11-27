import { signInAnonymously } from "firebase/auth";
import { ref, uploadBytesResumable } from "firebase/storage";
import { auth, storage } from "./firebase";

/** Login anonimo invisibile: serve per caricare la foto in uploads/{uid}/. */
export async function ensureSignedIn(): Promise<string> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  return (await signInAnonymously(auth)).user.uid;
}

export function randomId(len = 20): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

const MAX_SIDE = 2000;

/**
 * Riduce la foto (lato lungo max 2000 px, JPEG) per caricarla in fretta anche col 4G,
 * mantenendo leggibile lo scontrino. Se il browser non sa decodificarla, usa l'originale.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (blob && blob.size < file.size) return blob;
    return file.type === "image/jpeg" ? file : blob ?? file;
  } catch {
    return file;
  }
}

function extFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic") return "heic";
  if (type === "image/heif") return "heif";
  return "jpg";
}

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Carica la foto e restituisce il percorso uploads/{uid}/{id}.{ext}. */
export async function uploadReceipt(blob: Blob, onProgress?: (pct: number) => void): Promise<string> {
  const uid = await ensureSignedIn();
  const type = blob.type ? blob.type.toLowerCase() : "image/jpeg";
  if (!ALLOWED.includes(type)) throw new Error("Formato foto non supportato: scatta la foto con la fotocamera.");
  const path = `uploads/${uid}/${randomId()}.${extFor(type)}`;
  const task = uploadBytesResumable(ref(storage, path), blob, { contentType: type });
  await new Promise<void>((resolve, reject) => {
    task.on("state_changed", (s) => onProgress?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)), reject, () => resolve());
  });
  return path;
}
