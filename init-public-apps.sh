#!/usr/bin/env sh

mkdir public-apps
cd public-apps || exit

mkdir beerkb philipolsonm
cd beerkb || exit

git clone https://github.com/olsonpm/beerkb.com.git prod
cp -r prod test

cd prod || exit
git checkout release-prod
cd ../test || exit
git checkout release-test
cd ../../philipolsonm || exit

git clone https://github.com/olsonpm/personal-home2.git home
cp -r home home-test
cd home || exit
git checkout release-prod
cd ../home-test || exit
git checkout release-test
cd ../ || exit

git clone https://github.com/olsonpm/tweet-ticker.git tweet-ticker
cp -r tweet-ticker tweet-ticker-test
cd tweet-ticker || exit
git checkout release-prod
cd ../tweet-ticker-test || exit
git checkout release-test
cd ../ || exit

git clone https://github.com/olsonpm/weather-accuracy.git weather-accuracy
cd weather-accuracy || exit
git checkout release
