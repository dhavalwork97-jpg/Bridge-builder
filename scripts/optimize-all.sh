#!/bin/sh
# Runs the truss optimiser for every truss-based level (sequential; results in /tmp/opt_<id>.txt)
run() { npx tsx scripts/optimize.ts "$1" "$2" > /tmp/opt_$1.txt 2>&1; }
run 3 '[[0,2,12,0]]'
run 4 '[[0,0,14,0]]'
run 5 '[[0,0,14,3]]'
run 6 '[[0,0,18,0]]'
run 8 '[[0,0,16,-4]]'
run 9 '[[0,0,14,0]]'
run 11 '[[0,0,18,0]]'
run 13 '[[0,0,14,0]]'
run 14 '[[0,3,16,-1]]'
run 19 '[[0,0,18,0]]'
run 7 '[[0,0,10.5,0],[13.5,0,24,0]]'
run 10 '[[0,0,8.5,0],[11.5,0,18.5,0],[21.5,0,30,0]]'
run 16 '[[0,0,10,0],[12,0,22,0],[24,0,34,0]]'
run 17 '[[0,0,12,2.5],[14,2.5,26,5]]'
run 18 '[[0,0,8,0],[10,0,17,0],[19,0,26,0],[28,0,36,0]]'
run 20 '[[0,3,13,1],[15,1,28,-1]]'
echo finished > /tmp/opt_done.txt
