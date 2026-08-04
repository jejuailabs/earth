// 서버 설정(환경변수) 문제를 인증 실패와 구분하기 위한 오류 타입.
// 이걸 구분하지 않으면 "환경변수 없음"이 "로그인 필요"로 둔갑해 원인을 못 찾는다.
export class ServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigError";
  }
}
