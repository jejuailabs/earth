import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// npm workspaces 모노레포라 의존성(firebase-admin 등)이 저장소 루트의 node_modules로
// 호이스팅된다. 빌드가 앱 폴더(apps/web) 기준으로 실행되면 Next는 그 폴더를 추적
// 기준으로 삼아 바깥의 node_modules를 함수 번들에서 빠뜨릴 수 있고, 그러면 런타임에
// 모듈을 찾지 못해 라우트가 통째로 로드에 실패한다(= 내용 없는 500).
// 저장소 루트에서 빌드할 때는 차이가 없지만, 배포 환경의 루트 디렉터리 설정과
// 무관하게 안전하도록 기준을 명시해 둔다.
const appDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(appDir, "../../"),
};

export default nextConfig;
