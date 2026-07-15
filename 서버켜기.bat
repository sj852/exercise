@echo off
chcp 65001 >nul
title 오운완 로컬 서버
cd /d "%~dp0"
set "PORT=8000"

echo ================================================
echo   오운완 로컬 서버
echo   주소: http://localhost:%PORT%/
echo   종료: 이 창에서 Ctrl+C  또는 창 닫기
echo ================================================
echo.

REM 브라우저 먼저 열기 (서버가 뜨는 동안 로딩)
start "" "http://localhost:%PORT%/"

REM 실행기 선택 (Node 우선, 없으면 Python)
where node >nul 2>nul && goto :usenode
where python >nul 2>nul && goto :usepython
where py >nul 2>nul && goto :usepy
goto :noruntime

:usenode
echo [Node.js] 서버 실행 중... (주소가 안 열리면 위 주소를 직접 붙여넣으세요)
node "%~dp0serve.js" %PORT%
goto :ended

:usepython
echo [Python] 서버 실행 중...
python -m http.server %PORT%
goto :ended

:usepy
echo [Python] 서버 실행 중...
py -m http.server %PORT%
goto :ended

:noruntime
echo [오류] Node.js 또는 Python 이 필요합니다. 둘 중 하나를 설치한 뒤 다시 실행하세요.
echo   - Node.js: https://nodejs.org
echo   - Python : https://www.python.org

:ended
echo.
echo 서버가 종료되었습니다. 창을 닫아도 됩니다.
pause
