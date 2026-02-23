# AI 숙제 관리 웹앱

React + TypeScript + Vite 기반의 클라이언트 전용 SPA입니다.

## 기능

- 숙제 등록/수정/삭제/완료
- 마감일 기준 자동 정렬
- Gemini `gemini-3-flash-preview` 기반 AI 학습 도우미
- API Key 직접 입력 및 localStorage 저장(서버 전송 없음)

## 실행

```bash
npm install
npm run dev
```

## 주의사항

- `.env` 없이 앱 내 입력 UI를 통해 API Key를 저장합니다.
- Key가 없거나 유효하지 않으면 AI 기능이 비활성화됩니다.
