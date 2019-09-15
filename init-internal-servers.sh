#!/usr/bin/env sh

mkdir internal-servers
cd internal-servers || exit

git clone https://github.com/olsonpm/beerkb-internal-s2r.git
cd beerkb-internal-s2r || exit
npm ci
