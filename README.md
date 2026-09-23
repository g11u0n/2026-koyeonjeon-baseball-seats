# 2026 정기 고연전 야구 좌석 안내

잠실야구장 고려대학교 배정 결과를 조회하는 모바일 우선 정적 사이트입니다. 단위 검색, 전체 경기장 구역도, 고려대학교 44개 배정 블록과 교우회석 4개 구역, 실제 좌석 배치를 제공합니다. 로그인이나 예약 기능은 없습니다.

## 파일 구조

```text
index.html              화면
css/style.css           반응형 스타일
js/app.js               검색·지도·좌석 상세
data/units.json         단위별 배정
data/blocks.json        구역별 요약
data/seats.json         좌석 위치·번호·배정·제한 여부
data/validation.json    원본 간 불일치
validation-report.md    사람이 읽는 검증 결과
scripts/extract-seat-data.ps1  Excel 읽기 전용 추출
scripts/build-data.js         공개 JSON 및 검증 보고서 생성
scripts/validate-seat-data.js 공개 JSON 구조 검증
```

## 데이터 갱신

Windows PowerShell과 Node.js가 필요합니다. 원본 Excel을 `Jamsil Baseball Stadium` 폴더에 둔 뒤 프로젝트 루트에서 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\extract-seat-data.ps1
node .\scripts\build-data.js
node .\scripts\validate-seat-data.js
```

첫 단계는 Excel을 **읽기 전용**으로 열어 `private-source/workbook.json`을 만듭니다. 두 번째 단계는 `단위별 좌석`, `구역별 좌석수`, 44개 블록 상세 시트에서 공개 JSON을 생성합니다. 좌석 번호, 위치, 채우기 색상으로 단위를 판별하고, `#FFFF0000`인 셀은 불용 좌석으로 분류합니다. `416`, `417`, `420`의 짙은 갈색은 자유석입니다. 요약 시트와 상세 시트가 다르면 실제 좌석별 배정 색상이 있는 상세 시트를 기준으로 집계합니다. 스크립트는 원본 파일을 수정하지 않습니다.

## 로컬 실행

정적 HTTP 서버에서 여세요. Node.js만 있는 경우:

```powershell
node .\scripts\serve.js
```

`http://localhost:8000`에 접속합니다. Python이 설치돼 있다면 `python -m http.server 8000`도 가능합니다. `index.html`을 파일로 직접 열면 브라우저의 JSON 요청 제한 때문에 데이터가 보이지 않을 수 있습니다.

## GitHub Pages 배포

1. 이 폴더에서 Git 저장소를 만들고 `.gitignore`를 확인합니다.
2. `data/*.json`, HTML, CSS, JS, README와 스크립트를 commit합니다. `.xlsx`, 원본 SVG, `private-source/`는 commit하지 않습니다. 과거 Git 기록에 원본이 있었다면 기록도 별도로 확인해야 합니다.
3. GitHub 저장소 **Settings → Pages → Build and deployment**에서 **Deploy from a branch**, 배포 브랜치와 **/(root)**를 선택합니다.
4. 배포 URL `https://USERNAME.github.io/REPOSITORY/`에서 검색과 블록 선택을 확인합니다. 모든 리소스는 상대 경로를 사용합니다.

지도는 Excel `배치도`의 전체 구역 배치를 참고해 새로 그린 독립적인 인터랙티브 SVG입니다. 원본 SVG와 Excel 이미지는 배포하지 않습니다. 좌석 수는 각 블록 상세 시트의 실제 색상 셀 개수를 기준으로 계산합니다.
