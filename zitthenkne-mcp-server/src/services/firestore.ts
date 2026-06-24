/**
 * Khởi tạo Firebase Admin và cung cấp instance Firestore dùng chung.
 *
 * Cấu hình thông tin xác thực (chọn 1 trong các cách, theo thứ tự ưu tiên):
 *   1. FIREBASE_SERVICE_ACCOUNT_PATH  -> đường dẫn tới file JSON khóa service account.
 *   2. FIREBASE_SERVICE_ACCOUNT_JSON  -> nội dung JSON khóa service account (chuỗi).
 *   3. GOOGLE_APPLICATION_CREDENTIALS -> chuẩn Google ADC (đường dẫn file JSON).
 *
 * Project ID lấy từ FIREBASE_PROJECT_ID, nếu không có dùng DEFAULT_PROJECT_ID.
 */

import { readFileSync } from "node:fs";
import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { DEFAULT_PROJECT_ID } from "../constants.js";

let firestoreInstance: Firestore | null = null;

/** Đọc và parse khóa service account từ biến môi trường. Trả về null nếu không cấu hình. */
function loadServiceAccount(): admin.ServiceAccount | null {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  try {
    if (path) {
      return JSON.parse(readFileSync(path, "utf-8")) as admin.ServiceAccount;
    }
    if (json) {
      return JSON.parse(json) as admin.ServiceAccount;
    }
  } catch (error) {
    throw new Error(
      `Không đọc được khóa service account: ${
        error instanceof Error ? error.message : String(error)
      }. Kiểm tra lại FIREBASE_SERVICE_ACCOUNT_PATH / FIREBASE_SERVICE_ACCOUNT_JSON.`,
    );
  }
  return null;
}

/**
 * Lấy instance Firestore (khởi tạo một lần duy nhất).
 * Ném lỗi rõ ràng nếu thiếu thông tin xác thực.
 */
export function getFirestore(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;

  if (!admin.apps.length) {
    const serviceAccount = loadServiceAccount();

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId,
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Dùng Application Default Credentials.
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
    } else {
      throw new Error(
        "Thiếu thông tin xác thực Firebase. Hãy đặt một trong các biến môi trường: " +
          "FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, hoặc GOOGLE_APPLICATION_CREDENTIALS. " +
          "Tải khóa service account tại Firebase Console > Project Settings > Service accounts > Generate new private key.",
      );
    }
  }

  firestoreInstance = admin.firestore();
  return firestoreInstance;
}
