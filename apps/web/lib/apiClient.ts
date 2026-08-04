// 로그인 사용자의 Firebase ID Token을 붙여 API를 호출한다 (docs/02 §5)
import { auth } from "./firebase";

export async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// 사진을 게임 배경으로 쓰기 좋은 크기로 줄이고 해상도를 함께 돌려준다.
// (업로드 용량과 임시 저장 용량을 줄이고, 텍스처로도 이 정도면 충분하다)
export async function downscaleImage(
  file: File,
  maxSide = 1600,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const src = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("사진을 읽지 못했습니다"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new window.Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("사진 형식을 해석하지 못했습니다"));
    im.src = src;
  });

  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && src.length < 3_000_000) {
    return { dataUrl: src, width: img.naturalWidth, height: img.naturalHeight };
  }
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const cv = document.createElement("canvas");
  cv.width = width;
  cv.height = height;
  cv.getContext("2d")!.drawImage(img, 0, 0, width, height);
  // 투명도가 필요 없는 배경이므로 JPEG로 줄인다
  return { dataUrl: cv.toDataURL("image/jpeg", 0.88), width, height };
}
