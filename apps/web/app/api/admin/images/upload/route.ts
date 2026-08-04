// POST /api/admin/images/upload — 관리자가 이미지를 직접 업로드 (docs/06 §2-3 수동 업로드)
// 게임장 격자는 이 이미지의 가로/세로 비율을 따르므로 해상도를 함께 기록한다.
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminBucket, adminFirestore } from "@/lib/firebase-admin";
import { adminRoute, writeAdminLog } from "@/lib/adminRoute";

export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024; // 12MB
const ALLOWED = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export const POST = adminRoute(async (req, decoded) => {
  const body = (await req.json()) as {
    dataUrl?: string;
    theme?: string;
    width?: number;
    height?: number;
  };
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(body.dataUrl ?? "");
  if (!m) return Response.json({ error: "dataUrl(base64) 필요" }, { status: 400 });

  const ext = ALLOWED.get(m[1]);
  if (!ext) return Response.json({ error: "PNG/JPEG/WebP만 허용" }, { status: 400 });

  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0) return Response.json({ error: "빈 파일" }, { status: 400 });
  if (buf.length > MAX_BYTES) {
    return Response.json({ error: `파일이 너무 큼 (최대 ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 413 });
  }

  const width = Math.round(Number(body.width));
  const height = Math.round(Number(body.height));
  if (!(width > 0 && height > 0 && width <= 20000 && height <= 20000)) {
    return Response.json({ error: "이미지 해상도가 올바르지 않음" }, { status: 400 });
  }

  const imageId = randomUUID();
  const path = `background-images/${imageId}.${ext}`;
  const token = randomUUID();
  await adminBucket.file(path).save(buf, {
    contentType: m[1],
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${adminBucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

  await adminFirestore.doc(`backgroundImages/${imageId}`).set({
    imageId,
    storageUrl,
    theme: body.theme || "custom",
    width,
    height,
    status: "pending", // 업로드도 검수를 거친다 (docs/06 §4)
    valueZones: [],
    generatedBy: "manual-upload",
    uploadedBy: decoded.uid,
    uploadedAt: FieldValue.serverTimestamp(),
  });
  await writeAdminLog(decoded.uid, "image_uploaded", imageId);

  return Response.json({ imageId, storageUrl, width, height });
});
