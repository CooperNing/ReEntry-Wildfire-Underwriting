#!/bin/bash
# Local dev launcher. If a "reentry" conda env exists, put its Node on PATH (Turbopack spawns `node` workers).
CONDA_NODE="${CONDA_PREFIX_REENTRY:-/opt/anaconda3/envs/reentry}/bin"
[ -x "$CONDA_NODE/node" ] && export PATH="$CONDA_NODE:$PATH"
cd "$(dirname "$0")" && exec npx next dev --port "${PORT:-3000}"
