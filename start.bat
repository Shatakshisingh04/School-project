@echo off
echo Starting Automated Attendance System...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if package.json exists
if not exist package.json (
    echo Error: package.json not found
    echo Please make sure you're in the correct directory
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check if .env file exists
if not exist .env (
    echo Warning: .env file not found
    echo Creating default .env file...
    (
        echo # MongoDB Configuration
        echo MONGODB_URI=mongodb://localhost:27017/attendance_system
        echo.
        echo # JWT Secret ^(Change this to a secure random string in production^)
        echo JWT_SECRET=your_super_secure_jwt_secret_key_change_this_in_production
        echo.
        echo # Server Port
        echo PORT=3000
        echo.
        echo # Environment
        echo NODE_ENV=development
    ) > .env
    echo .env file created with default settings
)

REM Start the server
echo.
echo Starting server...
echo Server will be available at: http://localhost:3000
echo.
echo Default Login Credentials:
echo Admin: admin / admin123
echo Teacher: teacher1 / teacher123  
echo Student: student1 / student123
echo.
echo Press Ctrl+C to stop the server
echo.

npm start

pause