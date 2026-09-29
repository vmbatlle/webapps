docker run --rm -it \
  -p 8787:8787 \
  -v "$PWD:/app" \
  -v unizar_node_modules:/app/node_modules \
  -w /app \
  node:22-bookworm \
  bash -c 'npm install && npx wrangler dev --ip 0.0.0.0 --port 8787'