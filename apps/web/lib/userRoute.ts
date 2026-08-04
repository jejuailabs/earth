// 로그인한 일반 유저용 API 래퍼 (관리자 전용인 adminRoute와 대응)
import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { verifyRequest } from "./verifyAuth";
import { ServerConfigError } from "./serverConfig";

type Handler = (req: Request, decoded: DecodedIdToken) => Promise<Response>;

export function userRoute(handler: Handler) {
  return async (req: Request): Promise<Response> => {
    let decoded: DecodedIdToken;
    try {
      decoded = await verifyRequest(req);
    } catch (e) {
      // 서버 설정 문제를 인증 실패로 감추지 않는다
      if (e instanceof ServerConfigError) {
        console.error("[config]", e.message);
        return Response.json({ error: e.message }, { status: 500 });
      }
      return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }
    try {
      return await handler(req, decoded);
    } catch (e) {
      console.error("[api]", e);
      const msg = e instanceof Error ? e.message : "Internal error";
      return Response.json({ error: msg }, { status: 500 });
    }
  };
}
