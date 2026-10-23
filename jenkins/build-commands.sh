#!/bin/sh
# ---------------------------------------------------------------
# Jenkins Freestyle job -> Build Steps -> "Execute shell"
# Use this version when Jenkins runs on Linux or macOS.
# ---------------------------------------------------------------
set -e
echo "Checking out source code"
cd sample-app
ls *.java
echo "Compiling Hello.java"
javac Hello.java
echo "Running Hello.java"
java Hello
