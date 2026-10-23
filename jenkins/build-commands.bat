@echo off
REM ---------------------------------------------------------------
REM Jenkins Freestyle job -> Build Steps -> "Execute Windows batch command"
REM Paste the lines below (without this header) into the build step.
REM Jenkins has already cloned the GitHub repository into the workspace.
REM ---------------------------------------------------------------
echo Checking out source code
cd sample-app
dir /b *.java
echo Compiling Hello.java
javac Hello.java || exit /b 1
echo Running Hello.java
java Hello || exit /b 1
