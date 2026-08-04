// 어드민 화면용 fetch — 인증 처리는 authedFetch와 동일 (서버에서 role을 다시 검증한다)
export { authedFetch as adminFetch } from "./apiClient";
