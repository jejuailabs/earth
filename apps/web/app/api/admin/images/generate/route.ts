// POST /api/admin/images/generate — GPT Image 생성 파이프라인 (docs/08 §3)
// gpt-image-2 + quality=low(비용 절감, docs/08 §2) → Storage 업로드 → pending 문서 생성
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminBucket, adminFirestore } from "@/lib/firebase-admin";
import { adminRoute, writeAdminLog } from "@/lib/adminRoute";

export const maxDuration = 120; // 이미지 생성은 오래 걸릴 수 있음

// 테마별 사전 정의 템플릿 (docs/08 §4)
const THEME_PROMPTS: Record<string, string> = {
  "world-map": "미니멀한 스타일의 세계지도 일러스트, 밝은 파스텔 톤, 게임 배경용",
  space: "우주를 배경으로 한 행성과 별자리 일러스트, 짙은 남색 바탕, 게임 배경용",
  underwater: "해저 세계 일러스트, 산호와 물고기, 청록색 톤, 게임 배경용",
  city: "위에서 내려다본 야경 도시 일러스트, 네온 불빛, 게임 배경용",
};

// 안전 가이드 기본 포함 (docs/08 §4)
const SAFETY_SUFFIX =
  ", 텍스트 없음, 저작권 있는 캐릭터나 브랜드 요소 배제, 정사각형 구도, top-down view";

export const POST = adminRoute(async (req, decoded) => {
  const { theme, prompt } = (await req.json()) as { theme?: string; prompt?: string };
  if (!theme) return Response.json({ error: "theme required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY 미설정" }, { status: 500 });

  const finalPrompt = (prompt?.trim() || THEME_PROMPTS[theme] || THEME_PROMPTS["world-map"]) + SAFETY_SUFFIX;

  // 1. GPT Image API 호출
  const aiRes = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      prompt: finalPrompt,
      size: "1024x1024",
      quality: "low",
      n: 1,
    }),
  });
  if (!aiRes.ok) {
    const detail = await aiRes.text();
    console.error("[gpt-image]", detail);
    return Response.json({ error: `이미지 생성 실패 (${aiRes.status})` }, { status: 502 });
  }
  const aiData = (await aiRes.json()) as { data: { b64_json?: string }[] };
  const b64 = aiData.data?.[0]?.b64_json;
  if (!b64) return Response.json({ error: "이미지 데이터 없음" }, { status: 502 });

  // 2. Firebase Storage 업로드 — background-images/{imageId}.png (docs/08 §5)
  const imageId = randomUUID();
  const path = `background-images/${imageId}.png`;
  const token = randomUUID();
  await adminBucket.file(path).save(Buffer.from(b64, "base64"), {
    contentType: "image/png",
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${adminBucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

  // 3. backgroundImages 문서 생성 (docs/03 §3, status: pending)
  await adminFirestore.doc(`backgroundImages/${imageId}`).set({
    imageId,
    storageUrl,
    theme,
    prompt: finalPrompt, // 재생성/추적용 (docs/08 §5)
    status: "pending",
    valueZones: [],
    generatedBy: "gpt-image",
    uploadedBy: decoded.uid,
    uploadedAt: FieldValue.serverTimestamp(),
  });

  // 4. 생성 로그 (docs/08 §7)
  await writeAdminLog(decoded.uid, "image_generated", imageId);

  return Response.json({ imageId, storageUrl });
});
