// Genera el hash para ADMIN_PASSWORD_HASH: `npm run hash-password`.
// Se pide la contraseña por stdin para que no quede en el historial del shell.
const readline = require('readline');
const { hashPassword } = require('../server/services/password');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Contraseña: ', (plain) => {
  rl.close();
  if (!plain) {
    console.error('Contraseña vacía');
    process.exit(1);
  }
  console.log(`ADMIN_PASSWORD_HASH=${hashPassword(plain)}`);
});
