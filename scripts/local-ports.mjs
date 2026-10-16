import { createServer } from 'node:net';

export async function findFreePort(preferred) {
  for (let offset = 0; offset < 20; offset++) {
    const port = preferred + offset;
    if (port > 65535) break;
    const free = await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', error => {
        if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
        else reject(error);
      });
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error(`Nenhuma porta livre encontrada a partir de ${preferred}. Encerre a execução anterior.`);
}
